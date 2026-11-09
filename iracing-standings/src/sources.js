import { TokenManager } from './iracing/auth.js';
import { DataApiClient } from './iracing/client.js';
import { buildStandings, normalizeSeason } from './standings.js';
import { mockCarClasses, mockSeasons, mockStandingsRows } from './mock.js';

/** Live source backed by the iRacing Data API. */
export class LiveSource {
  constructor(client) {
    this.client = client;
    this.mode = 'live';
  }

  static fromEnv(env = process.env) {
    const tokens = new TokenManager({
      clientId: env.IRACING_CLIENT_ID,
      clientSecret: env.IRACING_CLIENT_SECRET,
      username: env.IRACING_USERNAME,
      password: env.IRACING_PASSWORD,
    });
    return new LiveSource(new DataApiClient({ tokens }));
  }

  async listSeasons() {
    const [seasons, classes] = await Promise.all([
      this.client.get('series/seasons', { include_series: true }),
      this.client.get('carclass/get'),
    ]);
    const names = new Map(classes.map((c) => [c.car_class_id, c.short_name || c.name]));
    return seasons
      .filter((s) => s.official !== false && s.active !== false)
      .map((s) => normalizeSeason(s, names))
      .sort((a, b) => a.seriesName.localeCompare(b.seriesName));
  }

  async getStandings(seasonId, carClassId) {
    const { meta, rows } = await this.client.getChunked('stats/season_driver_standings', {
      season_id: seasonId,
      car_class_id: carClassId,
    });
    return {
      seasonId,
      carClassId,
      seasonName: meta?.season_name ?? null,
      carClassName: meta?.car_class_name ?? null,
      lastUpdated: meta?.last_updated ?? null,
      drivers: buildStandings(rows),
    };
  }
}

/** Offline source with generated data shaped like real API payloads. */
export class MockSource {
  constructor() {
    this.mode = 'mock';
    this.names = new Map(mockCarClasses.map((c) => [c.car_class_id, c.short_name]));
  }

  async listSeasons() {
    return mockSeasons.map((s) => normalizeSeason(s, this.names));
  }

  async getStandings(seasonId, carClassId) {
    const season = mockSeasons.find((s) => s.season_id === seasonId);
    if (!season || !season.car_class_ids.includes(carClassId)) {
      throw Object.assign(new Error('Unknown season or car class'), { status: 404 });
    }
    return {
      seasonId,
      carClassId,
      seasonName: season.season_name,
      carClassName: this.names.get(carClassId),
      lastUpdated: new Date().toISOString(),
      drivers: buildStandings(mockStandingsRows(seasonId, carClassId, season.race_week)),
    };
  }
}

export function createSource(env = process.env) {
  return env.IRACING_MOCK === '1' || env.IRACING_MOCK === 'true' ? new MockSource() : LiveSource.fromEnv(env);
}
