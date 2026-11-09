import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { maskSecret, TokenManager } from '../src/iracing/auth.js';
import { DataApiClient } from '../src/iracing/client.js';
import { buildStandings } from '../src/standings.js';
import { MockSource } from '../src/sources.js';
import { TtlCache } from '../src/cache.js';

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

test('maskSecret hashes secret + lowercased, trimmed id as base64 sha256', () => {
  const expected = createHash('sha256').update('hunter2me@example.com').digest('base64');
  assert.equal(maskSecret('hunter2', '  Me@Example.COM '), expected);
});

test('TokenManager logs in with password_limited and reuses the token', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(Object.fromEntries(init.body));
    return json({ access_token: 'abc', expires_in: 600, refresh_token: 'r1', refresh_token_expires_in: 604800 });
  };
  const tm = new TokenManager({ clientId: 'Client', clientSecret: 's', username: 'u@x.com', password: 'p', fetchImpl });
  assert.equal(await tm.getAccessToken(), 'abc');
  assert.equal(await tm.getAccessToken(), 'abc');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].grant_type, 'password_limited');
  assert.equal(calls[0].scope, 'iracing.auth');
  assert.equal(calls[0].client_secret, maskSecret('s', 'Client'));
  assert.equal(calls[0].password, maskSecret('p', 'u@x.com'));
});

test('TokenManager uses the refresh token once the access token expires', async () => {
  let clock = 0;
  const grants = [];
  const fetchImpl = async (url, init) => {
    const p = Object.fromEntries(init.body);
    grants.push(p.grant_type);
    return json({ access_token: `t${grants.length}`, expires_in: 600, refresh_token: `r${grants.length}`, refresh_token_expires_in: 604800 });
  };
  const tm = new TokenManager({ clientId: 'c', clientSecret: 's', username: 'u', password: 'p', fetchImpl, now: () => clock });
  await tm.getAccessToken();
  clock = 600_000;
  assert.equal(await tm.getAccessToken(), 't2');
  assert.deepEqual(grants, ['password_limited', 'refresh_token']);
});

test('DataApiClient follows link responses and stitches chunks', async () => {
  const fetchImpl = async (url, init) => {
    const u = String(url);
    if (u.includes('members-ng.iracing.com')) {
      assert.equal(init.headers.Authorization, 'Bearer tok');
      return json({ link: 'https://s3.example/meta.json', expires: 'x' });
    }
    if (u === 'https://s3.example/meta.json') {
      return json({ season_name: 'S', chunk_info: { base_download_url: 'https://s3.example/', chunk_file_names: ['a.json', 'b.json'] } });
    }
    if (u === 'https://s3.example/a.json') return json([{ cust_id: 1 }]);
    if (u === 'https://s3.example/b.json') return json([{ cust_id: 2 }]);
    throw new Error(`unexpected ${u}`);
  };
  const client = new DataApiClient({ tokens: { getAccessToken: async () => 'tok', invalidate() {} }, fetchImpl });
  const { meta, rows } = await client.getChunked('stats/season_driver_standings', { season_id: 1, car_class_id: 2 });
  assert.equal(meta.season_name, 'S');
  assert.deepEqual(rows.map((r) => r.cust_id), [1, 2]);
});

test('DataApiClient retries once with a fresh token on 401', async () => {
  let n = 0, invalidated = 0;
  const fetchImpl = async () => (++n === 1 ? json({}, 401) : json({ ok: true }));
  const client = new DataApiClient({ tokens: { getAccessToken: async () => 't', invalidate: () => invalidated++ }, fetchImpl });
  assert.deepEqual(await client.get('member/info'), { ok: true });
  assert.equal(invalidated, 1);
});

test('buildStandings sorts by points, converts divisions to 1-based, and computes gaps', () => {
  const rows = buildStandings([
    { cust_id: 2, display_name: 'B', points: 800, division: 1 },
    { cust_id: 1, display_name: 'A', points: 1000, division: 0 },
    { cust_id: 3, display_name: 'C', points: 750, division: 1 },
  ]);
  assert.deepEqual(rows.map((r) => r.custId), [1, 2, 3]);
  assert.deepEqual(rows.map((r) => r.rank), [1, 2, 3]);
  assert.deepEqual(rows.map((r) => r.division), [1, 2, 2]);
  assert.deepEqual(rows.map((r) => r.divisionRank), [1, 1, 2]);
  assert.deepEqual(rows.map((r) => r.gapToLeader), [0, 200, 250]);
  assert.deepEqual(rows.map((r) => r.gapAhead), [null, 200, 50]);
});

test('MockSource returns deterministic, ranked standings for every season and class', async () => {
  const src = new MockSource();
  const seasons = await src.listSeasons();
  assert.ok(seasons.length > 0);
  for (const s of seasons) {
    for (const c of s.carClasses) {
      const a = await src.getStandings(s.seasonId, c.id);
      const b = await src.getStandings(s.seasonId, c.id);
      assert.deepEqual(a.drivers.map((d) => d.points), b.drivers.map((d) => d.points));
      for (let i = 1; i < a.drivers.length; i++) assert.ok(a.drivers[i - 1].points >= a.drivers[i].points);
    }
  }
});

test('TtlCache serves cached values and drops failures', async () => {
  let clock = 0, loads = 0;
  const cache = new TtlCache(1000, () => clock);
  const load = async () => ++loads;
  assert.equal(await cache.wrap('k', load), 1);
  assert.equal(await cache.wrap('k', load), 1);
  clock = 1001;
  assert.equal(await cache.wrap('k', load), 2);
  await assert.rejects(cache.wrap('bad', async () => { throw new Error('x'); }));
  assert.equal(await cache.wrap('bad', async () => 'ok'), 'ok');
});
