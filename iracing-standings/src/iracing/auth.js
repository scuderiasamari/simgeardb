import { createHash } from 'node:crypto';

export const TOKEN_URL = 'https://oauth.iracing.com/oauth2/token';

/**
 * iRacing masks secrets before sending them: base64(sha256(secret + lowercase(trimmed id))).
 * For the client secret the id is the client_id; for the password it is the username.
 */
export function maskSecret(secret, id) {
  const normalizedId = id.trim().toLowerCase();
  return createHash('sha256').update(`${secret}${normalizedId}`).digest('base64');
}

/**
 * Holds an access token for the password_limited grant and refreshes it before expiry.
 * Access tokens last about 10 minutes; refresh tokens are single-use and last about 7 days.
 */
export class TokenManager {
  constructor({ clientId, clientSecret, username, password, fetchImpl = fetch, now = Date.now }) {
    if (!clientId || !clientSecret || !username || !password) {
      throw new Error(
        'Missing iRacing credentials. Set IRACING_CLIENT_ID, IRACING_CLIENT_SECRET, ' +
          'IRACING_USERNAME and IRACING_PASSWORD, or run with IRACING_MOCK=1.',
      );
    }
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.username = username;
    this.password = password;
    this.fetch = fetchImpl;
    this.now = now;
    this.token = null;
    this.pending = null;
  }

  async getAccessToken() {
    const t = this.token;
    // Refresh 30 s early so a request never goes out with a token about to lapse.
    if (t && t.expiresAt - 30_000 > this.now()) return t.accessToken;
    // Collapse concurrent callers onto one token request.
    this.pending ??= this.#obtain().finally(() => (this.pending = null));
    return this.pending;
  }

  invalidate() {
    if (this.token) this.token.expiresAt = 0;
  }

  async #obtain() {
    const t = this.token;
    if (t?.refreshToken && t.refreshExpiresAt > this.now()) {
      try {
        return await this.#request({
          grant_type: 'refresh_token',
          client_id: this.clientId,
          client_secret: maskSecret(this.clientSecret, this.clientId),
          refresh_token: t.refreshToken,
        });
      } catch {
        // Refresh tokens are single-use; fall through to a fresh login.
      }
    }
    return this.#request({
      grant_type: 'password_limited',
      client_id: this.clientId,
      client_secret: maskSecret(this.clientSecret, this.clientId),
      username: this.username,
      password: maskSecret(this.password, this.username),
      scope: 'iracing.auth',
    });
  }

  async #request(params) {
    const res = await this.fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) {
      const reason = body.error_description || body.error || res.statusText;
      throw new Error(`iRacing token request (${params.grant_type}) failed: ${res.status} ${reason}`);
    }
    const now = this.now();
    this.token = {
      accessToken: body.access_token,
      expiresAt: now + (body.expires_in ?? 600) * 1000,
      refreshToken: body.refresh_token ?? null,
      refreshExpiresAt: now + (body.refresh_token_expires_in ?? 0) * 1000,
    };
    return this.token.accessToken;
  }
}
