const $ = (id) => document.getElementById(id);
const PAGE = 100;
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

const state = {
  seasons: [],
  standings: null,
  sort: { key: 'rank', dir: 1 },
  limit: PAGE,
};

const fmt = (v, digits = 0) => (v === null || v === undefined ? '–' : Number(v).toLocaleString(undefined, { maximumFractionDigits: digits }));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function api(path) {
  const res = await fetch(path);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

function setMessage(text, isError = false) {
  $('message').textContent = text;
  $('message').classList.toggle('error', isError);
}

function readUrl() {
  const q = new URLSearchParams(location.search);
  return { season: Number(q.get('season')) || null, cls: Number(q.get('class')) || null };
}

function writeUrl() {
  const q = new URLSearchParams();
  q.set('season', $('season').value);
  q.set('class', $('carClass').value);
  history.replaceState(null, '', `?${q}`);
}

function currentSeason() {
  return state.seasons.find((s) => s.seasonId === Number($('season').value));
}

function fillClasses(preferred) {
  const season = currentSeason();
  const classes = season?.carClasses ?? [];
  $('carClass').innerHTML = classes.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  if (preferred && classes.some((c) => c.id === preferred)) $('carClass').value = String(preferred);
  $('carClass').disabled = classes.length < 2;
}

function fillFilters(drivers) {
  const divisions = [...new Set(drivers.map((d) => d.division).filter((d) => d !== null))].sort((a, b) => a - b);
  const clubs = [...new Set(drivers.map((d) => d.clubName).filter(Boolean))].sort();
  $('division').innerHTML = '<option value="">All</option>' + divisions.map((d) => `<option value="${d}">Division ${d}</option>`).join('');
  $('club').innerHTML = '<option value="">All</option>' + clubs.map((c) => `<option>${esc(c)}</option>`).join('');
}

async function loadStandings() {
  writeUrl();
  state.standings = null;
  state.limit = PAGE;
  render();
  setMessage('Loading standings…');
  try {
    const data = await api(`/api/standings?season_id=${$('season').value}&car_class_id=${$('carClass').value}`);
    state.standings = data;
    fillFilters(data.drivers);
    const season = currentSeason();
    const week = season?.raceWeek !== null && season?.maxWeeks ? ` · Week ${season.raceWeek + 1} of ${season.maxWeeks}` : '';
    $('updated').textContent = `${data.drivers.length.toLocaleString()} drivers${week}` +
      (data.lastUpdated ? ` · Updated ${new Date(data.lastUpdated).toLocaleString()}` : '');
    setMessage('');
  } catch (err) {
    setMessage(err.message, true);
  }
  render();
}

function filtered() {
  const drivers = state.standings?.drivers ?? [];
  const div = $('division').value;
  const club = $('club').value;
  const q = $('search').value.trim().toLowerCase();
  const rows = drivers.filter((d) =>
    (!div || d.division === Number(div)) &&
    (!club || d.clubName === club) &&
    (!q || d.name.toLowerCase().includes(q) || String(d.custId) === q),
  );
  const { key, dir } = state.sort;
  return rows.sort((a, b) => {
    const av = a[key], bv = b[key];
    if (av === bv) return a.rank - b.rank;
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    return (typeof av === 'string' ? av.localeCompare(bv) : av - bv) * dir;
  });
}

function renderMe() {
  const id = Number($('me').value);
  const drivers = state.standings?.drivers ?? [];
  const i = id ? drivers.findIndex((d) => d.custId === id) : -1;
  const card = $('meCard');
  if (i < 0) {
    card.hidden = !id || !state.standings;
    card.innerHTML = id && state.standings ? '<div class="who">That customer ID has no points in this series and class yet.</div>' : '';
    return;
  }
  const me = drivers[i];
  const behind = drivers[i + 1];
  const tiles = [
    ['Position', `P${fmt(me.rank)}`],
    ['Points', fmt(me.points)],
    ['To leader', me.gapToLeader ? `−${fmt(me.gapToLeader)}` : 'Leader'],
    ['To car ahead', me.gapAhead === null ? '–' : `−${fmt(me.gapAhead)}`],
    ['Over car behind', behind ? `+${fmt(me.points - behind.points)}` : '–'],
    ['Division rank', me.division ? `D${me.division} · P${me.divisionRank}` : '–'],
  ];
  card.hidden = false;
  card.innerHTML = `<div class="who">${esc(me.name)} <span class="sub">${esc(me.clubName ?? '')}</span></div>` +
    tiles.map(([l, v]) => `<div><div class="label">${l}</div><div class="value">${v}</div></div>`).join('');
}

function render() {
  const rows = filtered();
  const meId = Number($('me').value);
  const shown = rows.slice(0, state.limit);
  // Keep your own row visible even when it falls outside the current page.
  const mine = rows.find((r) => r.custId === meId);
  if (mine && !shown.includes(mine)) shown.push(mine);

  $('table').querySelector('tbody').innerHTML = shown.map((d) => {
    const podium = d.rank <= 3 ? ` class="num p${d.rank}"` : ' class="num"';
    return `<tr${d.custId === meId ? ' class="me"' : ''}>
      <td${podium}>${d.rank}</td>
      <td class="name">${esc(d.name)}<div class="sub">#${d.custId}${d.license ? ` · ${esc(d.license)}` : ''}</div></td>
      <td class="num hide-sm">${d.division ?? '–'}</td>
      <td class="hide-md">${esc(d.clubName ?? '–')}</td>
      <td class="num"><strong>${fmt(d.points)}</strong></td>
      <td class="num hide-sm">${d.gapToLeader ? `−${fmt(d.gapToLeader)}` : '–'}</td>
      <td class="num hide-md">${fmt(d.weeksCounted)}${d.weekDropped ? '<span class="sub" title="Includes a drop week"> d</span>' : ''}</td>
      <td class="num hide-sm">${fmt(d.starts)}</td>
      <td class="num">${fmt(d.wins)}</td>
      <td class="num hide-md">${fmt(d.top5)}</td>
      <td class="num hide-md">${fmt(d.poles)}</td>
      <td class="num hide-md">${fmt(d.avgFinish)}</td>
      <td class="num hide-md">${fmt(d.incidents)}</td>
    </tr>`;
  }).join('');

  for (const th of document.querySelectorAll('th[data-key]')) {
    th.setAttribute('aria-sort', th.dataset.key === state.sort.key ? (state.sort.dir > 0 ? 'ascending' : 'descending') : 'none');
  }
  $('more').hidden = rows.length <= state.limit;
  $('more').textContent = `Show more (${(rows.length - state.limit).toLocaleString()} left)`;
  if (state.standings && !rows.length) setMessage('No drivers match these filters.');
  else if (state.standings && $('message').textContent === 'No drivers match these filters.') setMessage('');
  renderMe();
}

async function init() {
  $('me').value = store.get('custId') ?? '';
  try {
    const [status, seasons] = await Promise.all([api('/api/status'), api('/api/seasons')]);
    if (status.mode === 'mock') {
      $('mode').hidden = false;
      $('mode').textContent = 'Sample data';
    }
    state.seasons = seasons;
    if (!seasons.length) return setMessage('No active official seasons returned.', true);
    $('season').innerHTML = seasons.map((s) => `<option value="${s.seasonId}">${esc(s.seriesName)}</option>`).join('');
    const { season, cls } = readUrl();
    if (season && seasons.some((s) => s.seasonId === season)) $('season').value = String(season);
    fillClasses(cls);
    await loadStandings();
  } catch (err) {
    setMessage(err.message, true);
  }
}

$('season').addEventListener('change', () => { fillClasses(); loadStandings(); });
$('carClass').addEventListener('change', loadStandings);
for (const id of ['division', 'club', 'search']) {
  $(id).addEventListener('input', () => { state.limit = PAGE; render(); });
}
$('me').addEventListener('input', () => { store.set('custId', $('me').value.trim()); render(); });
$('more').addEventListener('click', () => { state.limit += PAGE; render(); });
for (const th of document.querySelectorAll('th[data-key]')) {
  th.addEventListener('click', () => {
    const key = th.dataset.key;
    // Rank-like columns read best ascending; counting stats read best descending.
    const ascFirst = ['rank', 'name', 'division', 'clubName', 'gapToLeader', 'avgFinish', 'incidents'].includes(key);
    state.sort = state.sort.key === key ? { key, dir: -state.sort.dir } : { key, dir: ascFirst ? 1 : -1 };
    render();
  });
}

init();
