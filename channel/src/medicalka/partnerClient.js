class MedicalkaPartnerError extends Error {
  constructor(code, { status = 0, retrySafe = false } = {}) {
    super(code);
    this.name = 'MedicalkaPartnerError';
    this.code = code;
    this.status = status;
    this.retrySafe = retrySafe;
  }
}

class MedicalkaPartnerClient {
  constructor({
    baseUrl,
    username,
    password,
    timeoutMs = 8000,
    maxResponseBytes = 1024 * 1024,
    authBackoffMs = 30000,
    now = () => Date.now(),
    fetchImpl = fetch,
  }) {
    this.baseUrl = String(baseUrl || '').replace(/\/+$/, '');
    this.username = String(username || '');
    this.password = String(password || '');
    this.timeoutMs = timeoutMs;
    this.maxResponseBytes = maxResponseBytes;
    this.authBackoffMs = authBackoffMs;
    this.now = now;
    this.fetchImpl = fetchImpl;
    this.accessToken = '';
    this.refreshToken = '';
    this.authPromise = null;
    this.refreshPromise = null;
    this.authRetryAt = 0;
  }

  async signIn() {
    if (this.authPromise) return this.authPromise;
    if (this.now() < this.authRetryAt) {
      throw new MedicalkaPartnerError('medicalka_auth_backoff', { retrySafe: true });
    }
    this.authPromise = this.rawRequest('/signin', {
      method: 'POST',
      body: { username: this.username, password: this.password },
    }).then((tokens) => {
      const access = this.storeTokens(tokens);
      this.authRetryAt = 0;
      return access;
    }).catch((err) => {
      this.authRetryAt = this.now() + this.authBackoffMs;
      throw err;
    })
      .finally(() => { this.authPromise = null; });
    return this.authPromise;
  }

  async ensureAccessToken() {
    if (!this.accessToken) await this.signIn();
    return this.accessToken;
  }

  async refreshAccessToken() {
    if (!this.refreshPromise) {
      this.refreshPromise = (this.refreshToken
        ? this.rawRequest('/refresh', {
          method: 'POST', body: { refresh_token: this.refreshToken },
        }).then((tokens) => this.storeTokens(tokens)).catch((err) => {
          if (![401, 422].includes(err?.status)) throw err;
          this.accessToken = '';
          this.refreshToken = '';
          return this.signIn();
        })
        : this.signIn())
        .finally(() => { this.refreshPromise = null; });
    }
    return this.refreshPromise;
  }

  storeTokens(tokens) {
    const access = String(tokens?.access_token || '');
    const refresh = String(tokens?.refresh_token || '');
    if (!access || !refresh) throw new MedicalkaPartnerError('medicalka_invalid_auth_response');
    this.accessToken = access;
    this.refreshToken = refresh;
    return access;
  }

  async request(path, options = {}) {
    const access = await this.ensureAccessToken();
    try {
      return await this.rawRequest(path, { ...options, accessToken: access });
    } catch (err) {
      if (err?.status !== 401 || options.retryAuth === false) throw err;
      const fresh = await this.refreshAccessToken();
      return this.rawRequest(path, { ...options, retryAuth: false, accessToken: fresh });
    }
  }

  async rawRequest(path, {
    method = 'GET', query = null, body = null, accessToken = '',
  } = {}) {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, raw] of Object.entries(query || {})) {
      if (raw === undefined || raw === null || raw === '') continue;
      const values = Array.isArray(raw) ? raw : [raw];
      for (const value of values) url.searchParams.append(key, String(value));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;
    let bytes;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...(body !== null ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body !== null ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
      const announced = Number(response.headers.get('content-length'));
      if (Number.isFinite(announced) && announced > this.maxResponseBytes) {
        throw new MedicalkaPartnerError('medicalka_response_too_large', {
          status: response.status, retrySafe: method === 'GET',
        });
      }
      bytes = await this.readBoundedBody(response, controller);
    } catch (err) {
      if (err instanceof MedicalkaPartnerError) throw err;
      if (err?.name === 'AbortError' || controller.signal.aborted) {
        throw new MedicalkaPartnerError('medicalka_timeout', { retrySafe: method === 'GET' });
      }
      throw new MedicalkaPartnerError('medicalka_network_error', { retrySafe: method === 'GET' });
    } finally {
      clearTimeout(timer);
    }

    let parsed = null;
    if (bytes.length) {
      try { parsed = JSON.parse(bytes.toString('utf8')); } catch (_) {
        throw new MedicalkaPartnerError('medicalka_invalid_json', {
          status: response.status, retrySafe: method === 'GET',
        });
      }
    }
    if (!response.ok) {
      throw new MedicalkaPartnerError(`medicalka_http_${response.status}`, {
        status: response.status,
        retrySafe: method === 'GET' || response.status === 401 || response.status === 429,
      });
    }
    return parsed;
  }

  async readBoundedBody(response, controller) {
    if (!response.body) return Buffer.alloc(0);
    if (typeof response.body.getReader !== 'function') {
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > this.maxResponseBytes) {
        throw new MedicalkaPartnerError('medicalka_response_too_large', {
          status: response.status, retrySafe: false,
        });
      }
      return bytes;
    }

    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > this.maxResponseBytes) {
          controller.abort();
          throw new MedicalkaPartnerError('medicalka_response_too_large', {
            status: response.status, retrySafe: false,
          });
        }
        chunks.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(chunks, total);
  }

  getPharmacies() {
    return this.request('/companies/pharmacies');
  }

  listApprovals({ pharmacyIds, status, limit = 100, offset = 0 }) {
    return this.request('/orders/pharmacy-approvals', {
      query: { pharmacy_ids: pharmacyIds, status, limit, offset },
    });
  }

  respondToApproval({ checkoutId, pharmacyId, action, comment = '' }) {
    return this.request(
      `/orders/checkout-requests/${encodeURIComponent(checkoutId)}`
        + `/pharmacies/${encodeURIComponent(pharmacyId)}/respond`,
      { method: 'PATCH', body: { action, ...(comment ? { comment } : {}) } }
    );
  }

  listSubOrders({ pharmacyIds, ...query }) {
    return this.request('/orders/sub-orders', {
      query: { pharmacy_ids: pharmacyIds, ...query },
    });
  }

  getSubOrder(id) {
    return this.request(`/orders/sub-orders/${encodeURIComponent(id)}`);
  }

  updateSubOrderStatus(id, status) {
    return this.request(`/orders/sub-orders/${encodeURIComponent(id)}/status`, {
      method: 'PATCH', body: { status },
    });
  }

  cancelSubOrder(id, reason) {
    return this.request(`/orders/sub-orders/${encodeURIComponent(id)}/cancel-by-pharmacy`, {
      method: 'POST', body: { reason },
    });
  }

  addFiscalLabel(id, { itemId, label }) {
    return this.request(`/orders/sub-orders/${encodeURIComponent(id)}/fiscal-receipt-labels`, {
      method: 'POST', body: { ...(itemId ? { item_id: itemId } : {}), label },
    });
  }
}

module.exports = { MedicalkaPartnerClient, MedicalkaPartnerError };
