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
    fetchImpl = fetch,
  }) {
    this.baseUrl = String(baseUrl || '').replace(/\/+$/, '');
    this.username = String(username || '');
    this.password = String(password || '');
    this.timeoutMs = timeoutMs;
    this.maxResponseBytes = maxResponseBytes;
    this.fetchImpl = fetchImpl;
    this.accessToken = '';
    this.refreshToken = '';
    this.authPromise = null;
    this.refreshPromise = null;
  }

  async signIn() {
    if (!this.authPromise) {
      this.authPromise = this.rawRequest('/signin', {
        method: 'POST',
        body: { username: this.username, password: this.password },
      }).then((tokens) => this.storeTokens(tokens))
        .finally(() => { this.authPromise = null; });
    }
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
        })
        : this.signIn())
        .then((tokens) => this.storeTokens(tokens))
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
    } catch (err) {
      if (err?.name === 'AbortError' || controller.signal.aborted) {
        throw new MedicalkaPartnerError('medicalka_timeout', { retrySafe: method === 'GET' });
      }
      throw new MedicalkaPartnerError('medicalka_network_error', { retrySafe: method === 'GET' });
    } finally {
      clearTimeout(timer);
    }

    const announced = Number(response.headers.get('content-length'));
    if (Number.isFinite(announced) && announced > this.maxResponseBytes) {
      throw new MedicalkaPartnerError('medicalka_response_too_large', {
        status: response.status, retrySafe: method === 'GET',
      });
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > this.maxResponseBytes) {
      throw new MedicalkaPartnerError('medicalka_response_too_large', {
        status: response.status, retrySafe: method === 'GET',
      });
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

  listSubOrders(query) {
    return this.request('/orders/sub-orders', { query });
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
