export const DATA_API_BASE = 'https://members-ng.iracing.com/data';

/**
 * Thin client for the iRacing Data API. Most endpoints answer with { link, expires }
 * pointing at a short-lived S3 URL that holds the real payload; this client follows it.
 */
export class DataApiClient {
  constructor({ tokens, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
    this.tokens = tokens;
    this.fetch = fetchImpl;
    this.sleep = sleep;
  }

  async get(path, params = {}) {
    const url = new URL(`${DATA_API_BASE}/${path.replace(/^\//, '')}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
    const body = await this.#authedJson(url);
    if (body && typeof body.link === 'string') return this.#plainJson(body.link);
    return body;
  }

  /** Endpoints such as season_driver_standings split rows across chunk files. */
  async getChunked(path, params = {}) {
    const meta = await this.get(path, params);
    const info = meta?.chunk_info;
    if (!info?.chunk_file_names?.length) return { meta, rows: [] };
    const chunks = await Promise.all(
      info.chunk_file_names.map((name) => this.#plainJson(`${info.base_download_url}${name}`)),
    );
    return { meta, rows: chunks.flat() };
  }

  async #authedJson(url, attempt = 0) {
    const token = await this.tokens.getAccessToken();
    const res = await this.fetch(url, { headers: { Authorization: `Bearer ${token}` } });

    if (res.status === 401 && attempt === 0) {
      this.tokens.invalidate();
      return this.#authedJson(url, attempt + 1);
    }
    if (res.status === 429 && attempt < 2) {
      const reset = Number(res.headers.get('x-ratelimit-reset'));
      const waitMs = reset ? Math.max(1000, reset * 1000 - Date.now()) : 5000;
      await this.sleep(Math.min(waitMs, 60_000));
      return this.#authedJson(url, attempt + 1);
    }
    if (res.status === 503) {
      throw new Error('iRacing Data API is in maintenance (503). Try again later.');
    }
    if (!res.ok) {
      throw new Error(`iRacing Data API ${url.pathname} failed: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  async #plainJson(link) {
    const res = await this.fetch(link);
    if (!res.ok) throw new Error(`Fetching iRacing data link failed: ${res.status}`);
    return res.json();
  }
}
