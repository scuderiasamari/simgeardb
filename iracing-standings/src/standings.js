/**
 * Turns raw iRacing Data API payloads into the shape the dashboard renders.
 * Kept free of I/O so the mock source and the tests exercise the same code as live data.
 */

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function normalizeSeason(season, carClassNames = new Map()) {
  const classIds = season.car_class_ids ?? season.car_classes?.map((c) => c.car_class_id) ?? [];
  return {
    seasonId: season.season_id,
    seriesId: season.series_id,
    seriesName: season.series_name ?? season.schedules?.[0]?.series_name ?? season.season_name,
    seasonName: season.season_name,
    year: season.season_year ?? null,
    quarter: season.season_quarter ?? null,
    category: season.track_types?.[0]?.track_type ?? null,
    licenseGroup: season.license_group ?? null,
    raceWeek: num(season.race_week),
    maxWeeks: num(season.max_weeks),
    carClasses: classIds.map((id) => ({ id, name: carClassNames.get(id) ?? `Class ${id}` })),
  };
}

export function normalizeStandingsRow(row) {
  return {
    rank: num(row.rank),
    custId: row.cust_id,
    name: row.display_name ?? `#${row.cust_id}`,
    // The API numbers divisions from 0; drivers see them as Division 1-10.
    division: num(row.division) === null ? null : row.division + 1,
    clubId: row.club_id ?? null,
    clubName: row.club_name ?? null,
    countryCode: row.country_code ?? null,
    license: row.license?.group_name ?? null,
    points: num(row.points) ?? 0,
    rawPoints: num(row.raw_points),
    weeksCounted: num(row.weeks_counted),
    weekDropped: Boolean(row.week_dropped),
    starts: num(row.starts) ?? 0,
    wins: num(row.wins) ?? 0,
    top5: num(row.top5) ?? 0,
    poles: num(row.poles) ?? 0,
    avgStart: num(row.avg_start_position),
    avgFinish: num(row.avg_finish_position),
    avgFieldSize: num(row.avg_field_size),
    laps: num(row.laps) ?? 0,
    lapsLed: num(row.laps_led) ?? 0,
    incidents: num(row.incidents) ?? 0,
  };
}

/** Sorts by points, fills missing ranks, and adds gap-to-leader / gap-to-car-ahead. */
export function buildStandings(rawRows) {
  const rows = rawRows.map(normalizeStandingsRow);
  rows.sort((a, b) => b.points - a.points || (a.rank ?? Infinity) - (b.rank ?? Infinity));

  const leaderPoints = rows[0]?.points ?? 0;
  const divisionRank = new Map();
  rows.forEach((r, i) => {
    r.rank ??= i + 1;
    r.gapToLeader = leaderPoints - r.points;
    r.gapAhead = i === 0 ? null : rows[i - 1].points - r.points;
    if (r.division !== null) {
      const next = (divisionRank.get(r.division) ?? 0) + 1;
      divisionRank.set(r.division, next);
      r.divisionRank = next;
    } else {
      r.divisionRank = null;
    }
  });
  return rows;
}
