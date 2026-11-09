/**
 * Deterministic sample data shaped like iRacing Data API payloads, so the dashboard
 * runs before OAuth credentials exist. Every name and number here is invented.
 */

export const mockCarClasses = [
  { car_class_id: 4001, short_name: 'GT3', name: 'GT3 Class' },
  { car_class_id: 4002, short_name: 'GT4', name: 'GT4 Class' },
  { car_class_id: 4003, short_name: 'LMP2', name: 'LMP2 Class' },
  { car_class_id: 4004, short_name: 'MX-5', name: 'Spec Roadster' },
  { car_class_id: 4005, short_name: 'F4', name: 'Formula 4' },
];

const season = (id, series, classes, licenseGroup, raceWeek, trackType = 'road') => ({
  season_id: id,
  series_id: id - 9000,
  series_name: `${series} (sample)`,
  season_name: `${series} - 2026 Season 4 (sample)`,
  season_year: 2026,
  season_quarter: 4,
  car_class_ids: classes,
  license_group: licenseGroup,
  race_week: raceWeek,
  max_weeks: 12,
  track_types: [{ track_type: trackType }],
  official: true,
  active: true,
});

export const mockSeasons = [
  season(9101, 'Endurance Multiclass Sprint', [4003, 4001], 4, 7),
  season(9102, 'GT Sprint Championship', [4001], 4, 7),
  season(9103, 'GT4 Challenge', [4002], 3, 7),
  season(9104, 'Rookie Roadster Cup', [4004], 1, 7),
  season(9105, 'Junior Formula Series', [4005], 2, 7),
];

const FIRST = ['Alex', 'Sam', 'Jordan', 'Riley', 'Casey', 'Morgan', 'Taylor', 'Jamie', 'Robin', 'Dana',
  'Kai', 'Noa', 'Luca', 'Mika', 'Ari', 'Sasha', 'Elia', 'Remy', 'Tomas', 'Ines', 'Yuki', 'Omar', 'Lena', 'Pavel'];
const LAST = ['Marlow', 'Vance', 'Okafor', 'Lindqvist', 'Moreau', 'Tanaka', 'Rossi', 'Novak', 'Haddad',
  'Kowalski', 'Brennan', 'Silva', 'Fischer', 'Dalton', 'Ito', 'Varga', 'Quinn', 'Petrov', 'Aalto', 'Romero'];
const CLUBS = [
  [1, 'Atlantic', 'US'], [2, 'Benelux', 'NL'], [3, 'UK & I', 'GB'], [4, 'DE-AT-CH', 'DE'],
  [5, 'Iberia', 'ES'], [6, 'Italy', 'IT'], [7, 'Australia & NZ', 'AU'], [8, 'Brazil', 'BR'],
  [9, 'Scandinavia', 'SE'], [10, 'France', 'FR'], [11, 'Japan', 'JP'], [12, 'Canada', 'CA'],
];

/** mulberry32: small seeded PRNG so the same season/class always yields the same table. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mockStandingsRows(seasonId, carClassId, weeksRun = 7, count = 150) {
  const rand = rng(seasonId * 31 + carClassId);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const rows = [];

  for (let i = 0; i < count; i++) {
    const skill = Math.pow(rand(), 1.6); // most drivers mid-pack, a few aliens
    const weeksRaced = 1 + Math.floor(rand() * weeksRun);
    const weekly = [];
    let starts = 0, wins = 0, top5 = 0, poles = 0, incidents = 0, laps = 0, lapsLed = 0;
    let sumStart = 0, sumFinish = 0;

    for (let w = 0; w < weeksRaced; w++) {
      const racesThisWeek = 1 + Math.floor(rand() * 4);
      let best = 0;
      for (let r = 0; r < racesThisWeek; r++) {
        const finish = Math.max(1, Math.round((1 - skill) * 18 + rand() * 6 - 2));
        const start = Math.max(1, Math.round(finish + (rand() - 0.5) * 6));
        starts++;
        sumStart += start;
        sumFinish += finish;
        if (finish === 1) wins++;
        if (finish <= 5) top5++;
        if (start === 1) poles++;
        incidents += Math.floor(rand() * 8 * (1.3 - skill));
        const raceLaps = 18 + Math.floor(rand() * 6);
        laps += raceLaps;
        if (finish === 1) lapsLed += Math.floor(raceLaps * (0.4 + rand() * 0.6));
        best = Math.max(best, Math.round(40 + skill * 160 + rand() * 30 - finish * 2));
      }
      weekly.push(best);
    }

    // Official seasons count your best weeks; one drop week once you have run enough of them.
    weekly.sort((a, b) => b - a);
    const dropped = weekly.length > 4;
    const counted = dropped ? weekly.slice(0, -1) : weekly;
    const [clubId, clubName, country] = pick(CLUBS);

    rows.push({
      cust_id: 100000 + Math.floor(rand() * 900000),
      display_name: `${pick(FIRST)} ${pick(LAST)}`,
      division: Math.min(9, Math.floor((1 - skill) * 10)),
      club_id: clubId,
      club_name: clubName,
      country_code: country,
      license: { group_name: skill > 0.6 ? 'Class A' : skill > 0.3 ? 'Class B' : 'Class C' },
      weeks_counted: counted.length,
      week_dropped: dropped,
      starts,
      wins,
      top5,
      poles,
      avg_start_position: Math.round(sumStart / starts),
      avg_finish_position: Math.round(sumFinish / starts),
      avg_field_size: 20,
      laps,
      laps_led: lapsLed,
      incidents,
      points: counted.reduce((a, b) => a + b, 0),
      raw_points: weekly.reduce((a, b) => a + b, 0),
    });
  }
  return rows;
}
