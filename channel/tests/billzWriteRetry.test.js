const assert = require('node:assert/strict');
const test = require('node:test');

process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
process.env.BILLZ_SECRET_TOKEN = process.env.BILLZ_SECRET_TOKEN || 'test-secret';
process.env.BILLZ_SHOP_ID = process.env.BILLZ_SHOP_ID || 'shop-a';
process.env.BILLZ_WRITE_ENABLED = 'true';

const clientPath = require.resolve('../src/billz/client');
const authPath = require.resolve('../src/billz/auth');
const limiterPath = require.resolve('../src/billz/limiter');
const queuePath = require.resolve('../src/billz/queue');

function response(status, body = {}, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) { return headers[name.toLowerCase()] || null; },
    },
    text: async () => JSON.stringify(body),
  };
}

async function withFreshClient(run) {
  const originalFetch = global.fetch;
  const cached = new Map([
    [clientPath, require.cache[clientPath]],
    [authPath, require.cache[authPath]],
    [limiterPath, require.cache[limiterPath]],
    [queuePath, require.cache[queuePath]],
  ]);
  const auth = {
    tokens: ['token-1', 'token-2'],
    invalidated: [],
    async getAccessToken() { return this.tokens.shift() || 'token-2'; },
    async invalidate(token) { this.invalidated.push(token); },
  };
  const delays = [];

  delete require.cache[clientPath];
  require.cache[authPath] = { exports: auth };
  require.cache[limiterPath] = { exports: { sleep: async (delay) => { delays.push(delay); } } };
  require.cache[queuePath] = { exports: { limiter: { schedule: (work) => work() } } };

  try {
    const client = require('../src/billz/client');
    return await run({ client, auth, delays });
  } finally {
    delete require.cache[clientPath];
    for (const [path, module] of cached) {
      if (module) require.cache[path] = module;
      else delete require.cache[path];
    }
    global.fetch = originalFetch;
  }
}

test('GET retries a network failure through the bounded retry ladder', async () => {
  await withFreshClient(async ({ client, delays }) => {
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      throw new Error('socket reset');
    };

    await assert.rejects(client.get('/v2/products'), client.BillzError);
    assert.equal(calls, 5);
    assert.deepEqual(delays, [1000, 2000, 4000, 8000]);
  });
});

test('GET retries a 5xx response through the bounded retry ladder', async () => {
  await withFreshClient(async ({ client, delays }) => {
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return response(503);
    };

    await assert.rejects(client.get('/v2/products'), client.BillzError);
    assert.equal(calls, 5);
    assert.deepEqual(delays, [1000, 2000, 4000, 8000]);
  });
});

test('POST network failure is reported as an unknown outcome without retrying', async () => {
  await withFreshClient(async ({ client, delays }) => {
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      throw new Error('socket reset');
    };

    await assert.rejects(client.request('POST', '/v2/order', { body: {} }), (err) => {
      assert.ok(err instanceof client.BillzError);
      assert.equal(err.outcomeUnknown, true);
      assert.equal(err.retrySafe, false);
      return true;
    });
    assert.equal(calls, 1);
    assert.deepEqual(delays, []);
  });
});

test('POST 5xx is reported as an unknown outcome without retrying', async () => {
  await withFreshClient(async ({ client, delays }) => {
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return response(503);
    };

    await assert.rejects(client.request('POST', '/v2/order', { body: {} }), (err) => {
      assert.ok(err instanceof client.BillzError);
      assert.equal(err.outcomeUnknown, true);
      assert.equal(err.retrySafe, false);
      return true;
    });
    assert.equal(calls, 1);
    assert.deepEqual(delays, []);
  });
});

test('POST 429 is rejected safely without retrying', async () => {
  await withFreshClient(async ({ client, delays }) => {
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return response(429, { error: 'too many requests' });
    };

    await assert.rejects(client.request('POST', '/v2/order', { body: {} }), (err) => {
      assert.equal(err.outcomeUnknown, false);
      assert.equal(err.retrySafe, true);
      return true;
    });
    assert.equal(calls, 1);
    assert.deepEqual(delays, []);
  });
});

test('POST explicit 4xx is rejected safely without exposing provider credentials', async () => {
  await withFreshClient(async ({ client, delays }) => {
    const providerSecret = 'provider-secret-token';
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return response(422, { error: 'invalid order', access_token: providerSecret });
    };

    await assert.rejects(client.request('POST', '/v2/order', { body: {} }), (err) => {
      assert.equal(err.outcomeUnknown, false);
      assert.equal(err.retrySafe, true);
      assert.equal(JSON.stringify(err).includes(providerSecret), false);
      assert.equal(JSON.stringify(err.body).includes(providerSecret), false);
      return true;
    });
    assert.equal(calls, 1);
    assert.deepEqual(delays, []);
  });
});

test('POST 401 invalidates authentication and retries once', async () => {
  await withFreshClient(async ({ client, auth, delays }) => {
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return calls === 1 ? response(401) : response(200, { data: { id: 'order-1' } });
    };

    const result = await client.request('POST', '/v2/order', { body: {} });
    assert.deepEqual(result, { data: { id: 'order-1' } });
    assert.equal(calls, 2);
    assert.deepEqual(auth.invalidated, ['token-1']);
    assert.deepEqual(delays, []);
  });
});
