/**
 * NexZone — SPA router, UI, ESPN + Jikan + AniList
 */
/* global ARTICLES, fetchESPNNews, fetchGameSummary, fetchJikanAnimeFull, fetchJikanEpisodesAll, fetchJikanGenres, fetchJikanAnimeList, fetchTopAiringAnime, fetchAniListByMalId */

const NZ_MAIL_URL = 'https://script.google.com/macros/s/AKfycbzZY-FN6ZfIGDhz_7cXyunqMVGwXCDaJ6ICV4NuoMMibmIVGSZ3_52BZ7zpiBdzc1OI/exec'; 
const NZ_PAGE_SIZE = 6;
let currentPage = 'home';
let currentArticleId = null;
let currentGameData = null;
let allSportsData = [];
let allAnimeData = [];
let allEspnNews = [];
let heroArticleId = null;
let lastAnimeMalId = null;
let animeGenreCache = [];
let sportsLeagueFilter = 'all';
let pageHomeSports = 1;
let pageLiveSports = 1;
let pageHomeAnime = 1;
let pageAnimeGrid = 1;
let pageNews = 1;

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}
function escapeAttr(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
function nzAlert(msg, type) {
  const modal = document.getElementById('nzModal');
  const iconEl = document.getElementById('nzModalIcon');
  const msgEl = document.getElementById('nzModalMsg');
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  iconEl.textContent = icons[type] || icons.info;
  msgEl.textContent = msg;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}
function nzCloseModal() {
  const modal = document.getElementById('nzModal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') nzCloseModal(); });

function leagueToPath(league) {
  return league === 'nba' ? 'basketball/nba' : 'soccer/eng.1';
}
function logoUrl(team) {
  if (!team?.logo) return '';
  return String(team.logo).replace(/^http:/, 'https:');
}

function onTickerHostClick(e) {
  const g = e.target.closest('.tck-game');
  if (g) {
    const id = g.dataset.ev;
    const found = allSportsData.find(x => x.ev.id === id);
    if (found) nav('game', found);
    return;
  }
  const an = e.target.closest('.tck-anime');
  if (an) {
    const mal = an.dataset.mal;
    if (mal) showAnimeDetailPage(parseInt(mal, 10), true);
  }
}
function onScoresBarHostClick(e) {
  const si = e.target.closest('.si[data-ev]');
  if (!si) return;
  const id = si.dataset.ev;
  const found = allSportsData.find(x => x.ev.id === id);
  if (found) nav('game', found);
}
function setupLiveInteractions() {
  if (setupLiveInteractions._done) return;
  setupLiveInteractions._done = true;
  document.getElementById('tickerHost')?.addEventListener('click', onTickerHostClick);
  document.querySelectorAll('.scores-bar-host').forEach(el => el.addEventListener('click', onScoresBarHostClick));
}

function getFilteredSports() {
  if (sportsLeagueFilter === 'nba') return allSportsData.filter(x => x.league === 'nba');
  if (sportsLeagueFilter === 'epl') return allSportsData.filter(x => x.league === 'epl');
  return allSportsData;
}

function renderPager(wrapId, page, totalPages, onPage) {
  const w = document.getElementById(wrapId);
  if (!w) return;
  if (totalPages <= 1) {
    w.innerHTML = '';
    return;
  }
  w.innerHTML = `<div class="nz-pager">
    <button type="button" class="nz-pager-btn" ${page <= 1 ? 'disabled' : ''}>← Prev</button>
    <span class="nz-pager-info">Page ${page} / ${totalPages}</span>
    <button type="button" class="nz-pager-btn" ${page >= totalPages ? 'disabled' : ''}>Next →</button>
  </div>`;
  const btns = w.querySelectorAll('.nz-pager-btn');
  btns[0].onclick = () => { if (page > 1) onPage(page - 1); };
  btns[1].onclick = () => { if (page < totalPages) onPage(page + 1); };
}

function paintScoresOnly() {
  const filtered = getFilteredSports();
  const grid = document.getElementById('scoresGrid');
  const liveGrid = document.getElementById('liveScoresGrid');
  if (!filtered.length) return;
  const total = Math.max(1, Math.ceil(filtered.length / NZ_PAGE_SIZE));
  pageHomeSports = Math.min(pageHomeSports, total);
  pageLiveSports = Math.min(pageLiveSports, total);
  const hs = filtered.slice((pageHomeSports - 1) * NZ_PAGE_SIZE, pageHomeSports * NZ_PAGE_SIZE);
  const ls = filtered.slice((pageLiveSports - 1) * NZ_PAGE_SIZE, pageLiveSports * NZ_PAGE_SIZE);
  if (grid) grid.innerHTML = buildScoreCardsHTML(hs, null);
  if (liveGrid) liveGrid.innerHTML = buildScoreCardsHTML(ls, null);
  renderPager('homeSportsPager', pageHomeSports, total, p => { pageHomeSports = p; paintScoresOnly(); });
  renderPager('liveSportsPager', pageLiveSports, total, p => { pageLiveSports = p; paintScoresOnly(); });
}

let apiPillsBound = false;
function setupApiPills() {
  if (apiPillsBound) return;
  apiPillsBound = true;
  const nba = document.getElementById('pill-nba');
  const epl = document.getElementById('pill-epl');
  const an = document.getElementById('pill-anime');
  if (nba) {
    nba.classList.add('api-click');
    nba.title = '🏀 Click to filter NBA-only · Click again to show all';
    nba.onclick = () => {
      sportsLeagueFilter = sportsLeagueFilter === 'nba' ? 'all' : 'nba';
      pageHomeSports = 1;
      pageLiveSports = 1;
      renderSports(allSportsData);
    };
  }
  if (epl) {
    epl.classList.add('api-click');
    epl.title = '⚽ Click to filter EPL-only · Click again to show all';  
    epl.onclick = () => {
      sportsLeagueFilter = sportsLeagueFilter === 'epl' ? 'all' : 'epl';
      pageHomeSports = 1;
      pageLiveSports = 1;
      renderSports(allSportsData);
    };
  }
if (an) {
    an.classList.add('api-click');
    an.title = 'Click to open the Anime hub';
    an.onclick = () => nav('anime');
  }
}

function updatePillFilterClass() {
  const nba = document.getElementById('pill-nba');
  const epl = document.getElementById('pill-epl');
  if (nba) nba.classList.toggle('is-filter', sportsLeagueFilter === 'nba');
  if (epl) epl.classList.toggle('is-filter', sportsLeagueFilter === 'epl');
}

window.openNewsDetail = function (idx) {
  const a = allEspnNews[idx];
  if (!a) return;
  try {
    sessionStorage.setItem('nzNewsArticle', JSON.stringify(a));
  } catch (_) {}
  showNewsDetailPage(a);
};

function showNewsDetailPage(a, setHash = true) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-news-detail').classList.add('active');
  currentPage = 'newsDetail';
  if (setHash) window.location.hash = 'news-detail';
  document.querySelectorAll('.nav-links button').forEach(b => b.classList.remove('active'));
  document.getElementById('nl-home')?.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  const tag = a?.category?.description || a?.categories?.[0]?.description || 'ESPN';
  const pub = a.published ? new Date(a.published).toLocaleString() : '';
  const img = newsImage(a);
  const link = a?.links?.web?.href || a?.links?.mobile?.href || '#';
  const synopsis = (a.description || a.headline || '').trim();

  document.getElementById('newsDetailTag').textContent = tag;
  document.getElementById('newsDetailTitle').textContent = a.headline || 'Story';
  document.getElementById('newsDetailMeta').textContent = `${pub} · Source: ESPN`;
  const imEl = document.getElementById('newsDetailImg');
  if (img) {
    imEl.src = img;
    imEl.style.display = 'block';
  } else {
    imEl.style.display = 'none';
  }
  document.getElementById('newsDetailSynopsis').innerHTML = '<p>' + escapeHtml(synopsis).replace(/\n+/g, '</p><p>') + '</p>';
  const r = document.getElementById('newsDetailReadFull');
  r.href = link;
  document.title = `${(a.headline || 'News').slice(0, 48)} — NexZone`;
}

function buildAnimeCardsHTML(items) {
  return items.map(a => {
    const img = bestAnimeImage(a);
    return `
    <div class="anc" onclick="showAnimeDetailPage(${a.mal_id},true)">
      ${img
        ? `<img class="animg" src="${escapeAttr(img)}" alt="${escapeAttr(a.title)}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'anph',innerHTML:'🎌'}))">`
        : `<div class="anph">🎌</div>`}
      <div class="anb">
        <div class="antitle">${escapeHtml(a.title)}</div>
        <div class="anmeta"><span>${escapeHtml(a.type ?? 'TV')} · ${a.episodes ?? '?'} eps</span><span class="anscore">⭐ ${a.score ?? 'N/A'}</span></div>
      </div>
    </div>`;
  }).join('');
}

function paintHomeAnime() {
  const items = allAnimeData;
  const grid = document.getElementById('animeGrid');
  if (!grid) return;
  if (!items.length) {
    grid.innerHTML = '';
    renderPager('homeAnimePager', 1, 1, () => {});
    return;
  }
  const total = Math.max(1, Math.ceil(items.length / NZ_PAGE_SIZE));
  pageHomeAnime = Math.min(pageHomeAnime, total);
  const slice = items.slice((pageHomeAnime - 1) * NZ_PAGE_SIZE, pageHomeAnime * NZ_PAGE_SIZE);
  grid.innerHTML = buildAnimeCardsHTML(slice);
  renderPager('homeAnimePager', pageHomeAnime, total, p => { pageHomeAnime = p; paintHomeAnime(); });
}

function paintAnimePageGrid() {
  const items = allAnimeData;
  const grid = document.getElementById('animePageGrid');
  if (!grid) return;
  if (!items.length) {
    grid.innerHTML = '';
    renderPager('animePagePager', 1, 1, () => {});
    return;
  }
  const total = Math.max(1, Math.ceil(items.length / NZ_PAGE_SIZE));
  pageAnimeGrid = Math.min(pageAnimeGrid, total);
  const slice = items.slice((pageAnimeGrid - 1) * NZ_PAGE_SIZE, pageAnimeGrid * NZ_PAGE_SIZE);
  grid.innerHTML = buildAnimeCardsHTML(slice);
  renderPager('animePagePager', pageAnimeGrid, total, p => { pageAnimeGrid = p; paintAnimePageGrid(); });
}

function nav(page, data) {
  if (page === 'animeDetail' && data != null) {
    showAnimeDetailPage(data, true);
    return;
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById('page-' + page);
  if (!el) return;
  el.classList.add('active');
  currentPage = page;

  document.querySelectorAll('.nav-links button').forEach(b => b.classList.remove('active'));
  const nl = document.getElementById('nl-' + page);
  if (nl) nl.classList.add('active');

  window.scrollTo({ top: 0, behavior: 'smooth' });
  window.location.hash = page;

  if (page === 'article' && data) openArticle(data);
  if (page === 'game' && data) openGame(data);
  if (page === 'sports') populateSportsPage();
  if (page === 'anime') populateAnimePage();
  if (page === 'articles') populateAllArticles();
}

window.addEventListener('hashchange', () => {
  const h = window.location.hash.slice(1);
  if (h.startsWith('anime-')) {
    const id = parseInt(h.slice(6), 10);
    if (id && !Number.isNaN(id)) {
      if (currentPage === 'animeDetail' && lastAnimeMalId === id) return;
      showAnimeDetailPage(id, false);
    }
    return;
  }
  if (h === 'news-detail') {
    try {
      const raw = sessionStorage.getItem('nzNewsArticle');
      if (raw) {
        showNewsDetailPage(JSON.parse(raw), false);
        return;
      }
    } catch (_) {}
    nav('home');
    return;
  }
  if (h && document.getElementById('page-' + h)) nav(h);
});

window.addEventListener('load', () => {
  const h = window.location.hash.slice(1);
  if (h.startsWith('anime-')) {
    const id = parseInt(h.slice(6), 10);
    if (id && !Number.isNaN(id)) showAnimeDetailPage(id, false);
  } else if (h === 'news-detail') {
    try {
      const raw = sessionStorage.getItem('nzNewsArticle');
      if (raw) showNewsDetailPage(JSON.parse(raw), false);
      else nav('home');
    } catch (_) {
      nav('home');
    }
  } else if (h && document.getElementById('page-' + h)) nav(h);
  buildArticlesGrid();
});

function makeCard(a, clickFn) {
  const d = document.createElement('div');
  d.className = 'ac';
  d.dataset.cat = a.cat;
  d.dataset.title = a.title.toLowerCase();
  const top = a.coverImage
    ? `<div class="ct ct-img"><img src="${escapeAttr(a.coverImage)}" alt="" loading="lazy"></div>`
    : `<div class="ct">${a.emoji}</div>`;
  d.innerHTML = `
    ${top}
    <div class="cb">
      <div class="ctag ${a.tagCls}">${a.tag}</div>
      <div class="ctitle">${a.title}</div>
      <div class="cf"><span>${a.date}</span><span>👁 ${a.views}</span></div>
    </div>`;
  d.onclick = clickFn || (() => nav('article', a));
  setTimeout(() => {
    d.style.transition = 'opacity .5s, transform .5s, border-color .25s, box-shadow .25s';
  }, 10);
  return d;
}

function buildArticlesGrid() {
  const grid = document.getElementById('articlesGrid');
  if (!grid) return;
  grid.innerHTML = '';
  ARTICLES.forEach((a, i) => {
    const card = makeCard(a);
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    grid.appendChild(card);
    setTimeout(() => { card.style.opacity = '1'; card.style.transform = ''; }, 300 + i * 80);
  });
}

function populateAllArticles(cat = 'all') {
  const grid = document.getElementById('allArticlesGrid');
  if (!grid) return;
  grid.innerHTML = '';
  ARTICLES.filter(a => cat === 'all' || a.cat === cat).forEach(a => grid.appendChild(makeCard(a)));
}

function populateSportsPage() {
  const grid = document.getElementById('sportsArticlesGrid');
  if (!grid) return;
  grid.innerHTML = '';
  ARTICLES.filter(a => a.cat === 'sports').forEach(a => grid.appendChild(makeCard(a)));
  const sg = document.getElementById('sportScoresGrid');
  if (sg) {
    const filtered = getFilteredSports();
    sg.innerHTML = filtered.length
      ? buildScoreCardsHTML(filtered, null)
      : '<div style="grid-column:1/-1;text-align:center;padding:28px;color:var(--m);">No games for current filter.</div>';
  }
}

function populateAnimePage() {
  paintAnimePageGrid();
  const grid = document.getElementById('animeArticlesGrid');
  if (!grid) return;
  grid.innerHTML = '';
  ARTICLES.filter(a => a.cat === 'anime').forEach(a => grid.appendChild(makeCard(a)));
}

function openArticle(a) {
  currentArticleId = a.id;
  document.getElementById('ap-cat').textContent = a.tag;
  document.getElementById('ap-cat').className = `ap-cat ${a.tagCls}`;
  document.getElementById('ap-title').textContent = a.title;
  document.getElementById('ap-author').textContent = a.author || 'NexZone Team';
  document.getElementById('ap-date').textContent = a.date;
  document.getElementById('ap-read').innerHTML = `📖 ${a.readTime}`;
  const apImg = document.getElementById('ap-img');
  const extWrap = document.getElementById('ap-external-wrap');
  if (a.coverImage) {
    apImg.innerHTML = `<img src="${escapeAttr(a.coverImage)}" alt="" style="width:100%;max-height:380px;object-fit:cover;border-radius:12px;display:block;border:1px solid var(--b);" loading="eager">`;
  } else {
    apImg.innerHTML = `<span style="font-size:80px">${a.emoji}</span>`;
  }
  if (a.externalReadUrl) {
    extWrap.style.display = 'block';
    extWrap.innerHTML = `<p style="margin:0 0 10px;"><strong>More on this story</strong> — read expanded coverage on our partner site.</p><a href="${escapeAttr(a.externalReadUrl)}" target="_blank" rel="noopener" class="read-btn">Read full story on external site →</a>`;
  } else {
    extWrap.style.display = 'none';
    extWrap.innerHTML = '';
  }
  document.getElementById('ap-body').innerHTML = a.content;
  document.title = `${a.title} — NexZone`;
  const related = ARTICLES.filter(x => x.cat === a.cat && x.id !== a.id).slice(0, 3);
  const rg = document.getElementById('relatedGrid');
  rg.innerHTML = '';
  related.forEach(r => rg.appendChild(makeCard(r)));
}

function openHeroArticle() {
  const a = heroArticleId ? ARTICLES.find(x => x.id === heroArticleId) : null;
  if (a) nav('article', a);
  else if (allSportsData.length) openGameFromHero();
}

function openGameFromHero() {
  const live = allSportsData.find(x => gameStatus(x.ev).cls === 'live');
  const g = live || allSportsData[0];
  if (g) nav('game', g);
}

function openGame(g) {
  currentGameData = g;
  const { emoji, sport, ev } = g;
  const comp = ev.competitions?.[0];
  const [home, away] = comp?.competitors || [];
  const st = gameStatus(ev);

  document.getElementById('gameLeaders').innerHTML = '';
  document.getElementById('gameInjuries').innerHTML = '';
  document.getElementById('gameInsights').innerHTML = '<p style="color:var(--m);font-size:14px;">Loading match context from ESPN…</p>';

  document.title = `${home?.team?.name} vs ${away?.team?.name} — NexZone`;

  const hLogo = logoUrl(home?.team);
  const aLogo = logoUrl(away?.team);

  document.getElementById('gameTeams').innerHTML = `
    <div class="game-team">
      ${hLogo ? `<img src="${escapeAttr(hLogo)}" alt="" style="width:72px;height:72px;object-fit:contain;margin:0 auto 8px;display:block;">` : ''}
      <div class="game-team-name">${home?.team?.shortDisplayName || home?.team?.name || 'Home'}</div>
      <div class="game-team-pts">${home?.score ?? '—'}</div>
    </div>
    <div class="game-vs">${emoji}<br>VS</div>
    <div class="game-team">
      ${aLogo ? `<img src="${escapeAttr(aLogo)}" alt="" style="width:72px;height:72px;object-fit:contain;margin:0 auto 8px;display:block;">` : ''}
      <div class="game-team-name">${away?.team?.shortDisplayName || away?.team?.name || 'Away'}</div>
      <div class="game-team-pts">${away?.score ?? '—'}</div>
    </div>`;

  document.getElementById('gameStatus').innerHTML = `${st.cls === 'live' ? '<span style="animation:pbadge 1.4s infinite">●</span> ' : ''}${st.label}`;
  document.getElementById('gameStatus').className = `game-status ${st.cls}`;

  document.getElementById('gameInfoGrid').innerHTML = `
    <div class="game-info-card"><div class="game-info-label">League</div><div class="game-info-val">${emoji} ${sport}</div></div>
    <div class="game-info-card"><div class="game-info-label">Status</div><div class="game-info-val" style="font-size:18px;">${st.label}</div></div>
    <div class="game-info-card"><div class="game-info-label">Venue</div><div class="game-info-val" style="font-size:16px;">${comp?.venue?.fullName || 'TBD'}</div></div>`;

  document.getElementById('gameSummary').innerHTML = `
    <p>Follow <strong>${home?.team?.name}</strong> vs <strong>${away?.team?.name}</strong> on NexZone.
    ${st.cls === 'live' ? `This matchup is <strong style="color:var(--red)">LIVE</strong> — ${home?.score}–${away?.score}. Data refreshes every 90 seconds.` :
      st.cls === 'final' ? `Final: <strong>${home?.team?.name} ${home?.score}, ${away?.team?.name} ${away?.score}</strong>.` :
      `Scheduled: <strong>${st.label}</strong>.`}</p>
    <p>Below: leaders, injury notes, and related headlines when ESPN provides them for this event.</p>`;

  const others = allSportsData.filter(x => x.sport === g.sport && x.ev.id !== ev.id).slice(0, 4);
  const mg = document.getElementById('moreGamesGrid');
  mg.innerHTML = others.length ? others.map(o => {
    const oc = o.ev.competitions?.[0];
    const [oh, oa] = oc?.competitors || [];
    const os = gameStatus(o.ev);
    return `<div class="sc ${os.cls === 'live' ? 'islive' : ''}" onclick="nav('game', allSportsData.find(x=>x.ev.id==='${o.ev.id}'))">
      <div class="sc-lg">${o.emoji} ${o.sport} ${os.cls === 'live' ? '<span style="color:var(--red);font-size:9px">● LIVE</span>' : ''}</div>
      <div class="sc-teams">
        <div class="sc-team"><span>${oh?.team?.abbreviation || '?'}</span><span class="pts">${oh?.score ?? '—'}</span></div>
        <div class="sc-team"><span>${oa?.team?.abbreviation || '?'}</span><span class="pts">${oa?.score ?? '—'}</span></div>
      </div>
      <div class="sc-st ${os.cls === 'live' ? 'lv' : ''}">${os.label}</div>
    </div>`;
  }).join('') : '<p style="color:var(--m);font-size:13px;">No other games today</p>';

  enrichGamePage(g);
}

async function enrichGamePage(g) {
  const path = leagueToPath(g.league);
  const sum = await fetchGameSummary(path, g.ev.id);
  const leadersEl = document.getElementById('gameLeaders');
  const injEl = document.getElementById('gameInjuries');
  const insEl = document.getElementById('gameInsights');
  if (!sum) {
    leadersEl.innerHTML = '';
    injEl.innerHTML = '';
    insEl.innerHTML = '<p style="color:var(--m);font-size:14px;">Extended box score and notes are not available for this event in the public feed.</p>';
    return;
  }

  leadersEl.innerHTML = buildLeadersHTML(sum);
  injEl.innerHTML = buildInjuriesHTML(sum);
  insEl.innerHTML = buildInsightsHTML(sum);
}

function buildLeadersHTML(summary) {
  const leaders = summary.leaders;
  if (!leaders?.length) return '';
  let html = '<h3>Stat leaders</h3><div class="leaders-grid">';
  for (const cat of leaders.slice(0, 4)) {
    const label = cat.displayName || cat.name || 'Category';
    const list = cat.leaders || [];
    for (const L of list.slice(0, 2)) {
      const name = L?.athlete?.displayName || L?.displayName || L?.shortName || '';
      const val = L?.displayValue ?? L?.value ?? '';
      if (name || val) {
        html += `<div class="leader-pill"><div class="ln">${escapeHtml(label)}</div><div><strong>${escapeHtml(name)}</strong> ${escapeHtml(String(val))}</div></div>`;
      }
    }
  }
  html += '</div>';
  return html || '';
}

function buildInjuriesHTML(summary) {
  const inj = summary.injuries;
  if (!inj?.length) return '';
  let html = '<h3>Injuries &amp; roster notes</h3>';
  for (const row of inj.slice(0, 10)) {
    const t = row?.description || row?.details || row?.type?.description || row?.status || '';
    if (t) html += `<div class="injury-row">${escapeHtml(String(t))}</div>`;
  }
  return html;
}

function buildInsightsHTML(summary) {
  const headlines = summary.news?.headlines || summary.headlines || [];
  const pick = summary.pickcenter || summary.predictor;
  let html = '<h3>Headlines &amp; context</h3>';
  if (headlines?.length) {
    for (const h of headlines.slice(0, 6)) {
      const t = h?.headline || h?.title || h?.description || '';
      if (t) html += `<div class="insight-row">${escapeHtml(t)}</div>`;
    }
  }
  if (pick?.summary) {
    html += `<div class="insight-row" style="margin-top:12px;"><strong>Matchup:</strong> ${escapeHtml(pick.summary)}</div>`;
  }
  if (!headlines?.length && !pick?.summary) {
    html += '<p style="color:var(--m);font-size:15px;">No extra headlines bundled with this event. Check the Breaking News section on the home page.</p>';
  }
  return html;
}

function filterCat(cat, btn) {
  document.querySelectorAll('#articleTabs .tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('#articlesGrid .ac').forEach(c => {
    const m = cat === 'all' || c.dataset.cat === cat;
    c.style.opacity = m ? '1' : '0.15';
    c.style.transform = m ? '' : 'scale(.97)';
    c.style.pointerEvents = m ? 'auto' : 'none';
  });
}

function filterAll(cat, btn) {
  document.querySelectorAll('#page-articles .tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  populateAllArticles(cat);
}

function gameStatus(ev) {
  const s = ev?.status?.type;
  if (!s) return { label: 'TBD', cls: 'soon' };
  if (s.state === 'in') return { label: s.shortDetail || 'Live', cls: 'live' };
  if (s.state === 'post') return { label: 'Final', cls: 'final' };
  if (ev.date) return { label: new Date(ev.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), cls: 'soon' };
  return { label: 'Upcoming', cls: 'soon' };
}

function pill(id, state, txt) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `api-pill ${state}`;
  el.innerHTML = `<div class="api-dot"></div>${txt}`;
}

async function fetchNBA() {
  pill('pill-nba', 'ld', '<span class="spin"></span> NBA...');
  try {
    const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard');
    const d = await r.json();
    const evs = d.events || [];
    pill('pill-nba', 'ok', `NBA — ${evs.length} game${evs.length !== 1 ? 's' : ''}`);
    return evs.map(ev => ({ emoji: '🏀', sport: 'NBA', league: 'nba', ev }));
  } catch {
    pill('pill-nba', 'er', 'NBA offline');
    return [];
  }
}

async function fetchEPL() {
  pill('pill-epl', 'ld', '<span class="spin"></span> EPL...');
  try {
    const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard');
    const d = await r.json();
    const evs = d.events || [];
    pill('pill-epl', 'ok', `EPL — ${evs.length} match${evs.length !== 1 ? 'es' : ''}`);
    return evs.map(ev => ({ emoji: '⚽', sport: 'EPL', league: 'epl', ev }));
  } catch {
    pill('pill-epl', 'er', 'EPL offline');
    return [];
  }
}

function mergeEspnNews(nbaList, eplList) {
  const m = [...(nbaList || []), ...(eplList || [])];
  m.sort((a, b) => new Date(b.published || 0) - new Date(a.published || 0));
  return m.slice(0, 60);
}

function newsImage(article) {
  const img = article?.images?.[0];
  return img?.url || article?.image?.url || '';
}

function renderEspnNews(articles) {
  const el = document.getElementById('espnNewsFeed');
  if (!el || !articles?.length) {
    if (el) el.innerHTML = '<p style="color:var(--m);grid-column:1/-1;">No headlines available right now.</p>';
    renderPager('newsPager', 1, 1, () => {});
    return;
  }
  const total = Math.max(1, Math.ceil(articles.length / NZ_PAGE_SIZE));
  pageNews = Math.min(pageNews, total);
  const start = (pageNews - 1) * NZ_PAGE_SIZE;
  const pageSlice = articles.slice(start, start + NZ_PAGE_SIZE);

  el.innerHTML = pageSlice.map((a, i) => {
    const globalIdx = start + i;
    const img = newsImage(a);
    const tag = a?.category?.description || a?.categories?.[0]?.description || 'ESPN';
    const pub = a.published ? new Date(a.published).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    return `
      <article class="news-card" onclick="openNewsDetail(${globalIdx})">
        ${img ? `<img class="news-card-img" src="${escapeAttr(img)}" alt="" loading="lazy" onerror="this.style.display='none'">` : '<div class="news-card-img" style="display:flex;align-items:center;justify-content:center;font-size:42px;background:var(--surface);">📰</div>'}
        <div class="news-card-body">
          <div class="news-card-tag">${escapeHtml(tag)}</div>
          <h3 class="news-card-title">${escapeHtml(a.headline || 'Headline')}</h3>
          <div class="news-card-meta">${escapeHtml(pub)} · ESPN · Tap for synopsis</div>
        </div>
      </article>`;
  }).join('');

  renderPager('newsPager', pageNews, total, p => { pageNews = p; renderEspnNews(allEspnNews); });
}

function setHeroFromNews(articles) {
  const card = document.getElementById('heroCard');
  const bg = document.getElementById('heroBgLayer');
  if (!articles?.length || !bg || !card) return;
  const a = articles.find(x => newsImage(x)) || articles[0];
  const url = newsImage(a);
  if (url) {
    bg.style.backgroundImage = `url("${url.replace(/"/g, '\\"')}")`;
    card.classList.add('has-img');
  }
}

function buildScoreCardsHTML(data, max) {
  const slice = max != null ? data.slice(0, max) : data;
  return slice.map(({ emoji, sport, ev }) => {
    const comp = ev.competitions?.[0];
    const [home, away] = comp?.competitors || [];
    const st = gameStatus(ev);
    const hs = parseInt(home?.score) || 0, as = parseInt(away?.score) || 0;
    const hwins = st.cls === 'final' && hs > as, awins = st.cls === 'final' && as > hs;
    const gId = ev.id;
    const hl = logoUrl(home?.team);
    const al = logoUrl(away?.team);
    return `<div class="sc ${st.cls === 'live' ? 'islive' : ''}" onclick="nav('game',allSportsData.find(x=>x.ev.id==='${gId}'))">
      <div class="sc-lg">${emoji} ${sport} ${st.cls === 'live' ? '<span style="color:var(--red);font-size:9px">● LIVE</span>' : ''}</div>
      <div class="sc-teams">
        <div class="sc-team ${hwins ? 'win' : ''}">
          <div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1">
            ${hl ? `<img class="team-logo" src="${escapeAttr(hl)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${home?.team?.shortDisplayName || home?.team?.abbreviation || 'Home'}</span>
          </div>
          <span class="pts">${home?.score ?? '—'}</span>
        </div>
        <div class="sc-team ${awins ? 'win' : ''}">
          <div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1">
            ${al ? `<img class="team-logo" src="${escapeAttr(al)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${away?.team?.shortDisplayName || away?.team?.abbreviation || 'Away'}</span>
          </div>
          <span class="pts">${away?.score ?? '—'}</span>
        </div>
      </div>
      <div class="sc-st ${st.cls === 'live' ? 'lv' : ''}">${st.label}</div>
    </div>`;
  }).join('');
}

function buildScoresBarHTML(data) {
  return data.map(({ emoji, ev }) => {
    const comp = ev.competitions?.[0];
    const [home, away] = comp?.competitors || [];
    const st = gameStatus(ev);
    return `<div class="si" data-ev="${ev.id}" role="button" tabindex="0" title="Open full game">${emoji} ${home?.team?.abbreviation ?? '?'} vs ${away?.team?.abbreviation ?? '?'} <span class="sv">${home?.score ?? '?'}–${away?.score ?? '?'}</span> <span class="${st.cls === 'live' ? 'slive' : st.cls === 'final' ? 'sfin' : 'ssoon'}">${st.label}</span></div>`;
  }).join('');
}

function renderSports(data) {
  allSportsData = data;
  setupApiPills();
  updatePillFilterClass();

  const filtered = getFilteredSports();
  const grid = document.getElementById('scoresGrid');
  const bar = document.getElementById('scoresBar');
  const liveGrid = document.getElementById('liveScoresGrid');
  const liveBar = document.getElementById('liveScoresBar');

  if (!data.length) {
    const empty = `<div style="grid-column:1/-1;text-align:center;padding:36px;color:var(--m);font-size:17px;">No games scheduled today. Check headlines above for the latest news.</div>`;
    const barEmpty = `<div class="si">No games today</div><div class="si">Check news feed ↑</div>`;
    if (grid) grid.innerHTML = empty;
    if (liveGrid) liveGrid.innerHTML = empty;
    if (bar) bar.innerHTML = barEmpty;
    if (liveBar) liveBar.innerHTML = barEmpty;
    renderPager('homeSportsPager', 1, 1, () => {});
    renderPager('liveSportsPager', 1, 1, () => {});
    updateTicker('<span class="tck-empty">No live games right now — scroll for ESPN headlines.</span>');
    heroFromNewsOrStatic();
    return;
  }

  if (!filtered.length) {
    const msg = `<div style="grid-column:1/-1;text-align:center;padding:28px;color:var(--m);font-size:17px;">No ${sportsLeagueFilter === 'nba' ? 'NBA' : 'EPL'} games in this window. Click the API pill again to show all leagues.</div>`;
    if (grid) grid.innerHTML = msg;
    if (liveGrid) liveGrid.innerHTML = msg;
    if (bar) bar.innerHTML = `<div class="si">No games</div>`;
    if (liveBar) liveBar.innerHTML = `<div class="si">No games</div>`;
    renderPager('homeSportsPager', 1, 1, () => {});
    renderPager('liveSportsPager', 1, 1, () => {});
    updateTicker('<span class="tck-empty">No games for current filter.</span>');
    return;
  }

  const barHTML = buildScoresBarHTML(filtered);
  if (bar) bar.innerHTML = barHTML + barHTML;
  if (liveBar) liveBar.innerHTML = barHTML + barHTML;

  paintScoresOnly();

  const live = filtered.find(x => gameStatus(x.ev).cls === 'live') || filtered[0];
  if (live) {
    const comp = live.ev.competitions?.[0];
    const [home, away] = comp?.competitors || [];
    const st = gameStatus(live.ev);
    document.getElementById('heroTitle').textContent = `${live.emoji} ${home?.team?.name ?? ''} vs ${away?.team?.name ?? ''}`;
    document.getElementById('heroExcerpt').textContent = `Score: ${home?.score ?? '?'} – ${away?.score ?? '?'}. ${st.cls === 'live' ? 'LIVE now — full stats & headlines below.' : 'Tip-off / kickoff: ' + st.label}`;
    document.getElementById('heroCat').textContent = st.cls === 'live' ? 'Live Now' : live.sport;
    document.getElementById('heroAuthor').textContent = `${live.sport} · ESPN`;
    heroArticleId = null;
    const hImg = newsImage(allEspnNews[0]);
    const bg = document.getElementById('heroBgLayer');
    const card = document.getElementById('heroCard');
    if (hImg && bg && card) {
      bg.style.backgroundImage = `url("${hImg.replace(/"/g, '\\"')}")`;
      card.classList.add('has-img');
    }
  }

  const trendEl = document.getElementById('trendingList');
  trendEl.innerHTML = filtered.slice(0, 5).map(({ emoji, ev }, i) => {
    const comp = ev.competitions?.[0];
    const [home, away] = comp?.competitors || [];
    const st = gameStatus(ev);
    const gId = ev.id;
    return `<div class="ti" onclick="nav('game',allSportsData.find(x=>x.ev.id==='${gId}'))">
      <div class="tn">${i + 1}</div>
      <div><div class="tt">${home?.team?.name ?? '?'} vs ${away?.team?.name ?? '?'}</div>
      <div class="tm">${emoji} ${st.cls === 'live' ? '● Live now' : st.label}</div></div>
    </div>`;
  }).join('');

  const tickerItems = filtered.map(({ emoji, ev }) => {
    const comp = ev.competitions?.[0];
    const [home, away] = comp?.competitors || [];
    const st = gameStatus(ev);
    const gid = ev.id;
    return `<span class="tck-item tck-game" data-ev="${gid}" title="Full game">${emoji} ${escapeHtml(home?.team?.name ?? '?')} vs ${escapeHtml(away?.team?.name ?? '?')}: ${home?.score ?? '?'}–${away?.score ?? '?'} (${st.label})</span>`;
  }).join('');
  updateTicker(tickerItems);
}

function heroFromNewsOrStatic() {
  const first = allEspnNews[0];
  if (first) {
    document.getElementById('heroTitle').textContent = first.headline || 'Latest from ESPN';
    document.getElementById('heroExcerpt').textContent = (first.description || '').slice(0, 220) || 'Tap the headline cards below for full stories.';
    document.getElementById('heroCat').textContent = 'Breaking';
    document.getElementById('heroAuthor').textContent = 'ESPN · NexZone';
    heroArticleId = null;
    setHeroFromNews(allEspnNews);
  }
}

async function fetchAnime() {
  pill('pill-anime', 'ld', '<span class="spin"></span> Anime...');
  try {
    const d = await fetchTopAiringAnime(25);
    const items = d.data || [];
    if (!items.length) throw new Error('empty');
    allAnimeData = items;
    pill('pill-anime', 'ok', `Anime — ${items.length} airing`);
    pageHomeAnime = 1;
    pageAnimeGrid = 1;
    paintHomeAnime();
    paintAnimePageGrid();

    const stack = document.getElementById('heroStack');
    stack.innerHTML = items.slice(0, 3).map(a =>
      `<div class="stack-card" onclick="showAnimeDetailPage(${a.mal_id},true)">
        <div class="stag anime">Anime</div>
        <div class="stitle">${escapeHtml(a.title)}</div>
        <div class="stime">⭐ ${a.score ?? 'N/A'} · Ep ${a.episodes ?? '?'}</div>
      </div>`).join('');

    const animeTick = items.slice(0, 10).map(a =>
      `<span class="tck-item tck-anime" data-mal="${a.mal_id}" data-url="${escapeAttr(a.url)}" title="Open show page">🎌 ${escapeHtml(a.title)} — ⭐ ${a.score ?? 'N/A'} | Rank #${a.rank ?? '?'}</span>`).join('');
    updateTicker(null, animeTick);
  } catch {
    pill('pill-anime', 'er', 'Anime offline');
    ['animeGrid', 'animePageGrid'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:32px;color:var(--m);">Could not load anime. Try refreshing.</div>`;
    });
  }
}

function bestAnimeImage(a) {
  const jpg = a.images?.jpg;
  const webp = a.images?.webp;
  return webp?.large_image_url || webp?.image_url || jpg?.large_image_url || jpg?.image_url || '';
}

function showAnimeDetailPage(malId, setHash) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-anime-detail').classList.add('active');
  if (setHash) window.location.hash = 'anime-' + malId;
  currentPage = 'animeDetail';
  lastAnimeMalId = malId;
  document.querySelectorAll('.nav-links button').forEach(b => b.classList.remove('active'));
  document.getElementById('nl-anime')?.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  loadAnimeDetail(malId);
}

async function loadAnimeDetail(malId) {
  const hero = document.getElementById('animeDetailHero');
  const syn = document.getElementById('animeDetailSynopsis');
  const epEl = document.getElementById('animeDetailEpisodes');
  const streamEl = document.getElementById('animeDetailStream');
  const metaEl = document.getElementById('animeDetailMeta');
  const malLink = document.getElementById('animeMalLink');

  syn.textContent = 'Loading synopsis…';
  epEl.innerHTML = '<p style="color:var(--m);"><span class="spin"></span> Loading episodes…</p>';
  streamEl.innerHTML = '';
  metaEl.innerHTML = '';
  malLink.href = `https://myanimelist.net/anime/${malId}`;

  const [fullRes, ani] = await Promise.all([
    fetchJikanAnimeFull(malId),
    fetchAniListByMalId(malId)
  ]);

  const anime = fullRes?.data;
  if (!anime) {
    syn.textContent = 'Could not load this title from Jikan.';
    epEl.innerHTML = '';
    return;
  }

  const epData = await fetchJikanEpisodesAll(malId);

  const banner = ani?.bannerImage || bestAnimeImage(anime) || '';
  const title = ani?.title?.english || ani?.title?.romaji || anime.title || 'Anime';
  const titleNat = anime.title_japanese || ani?.title?.native || '';

  hero.innerHTML = banner
    ? `<img class="anime-detail-banner" src="${escapeAttr(banner)}" alt="" loading="eager">
       <div class="anime-detail-title-wrap">
         <h1 class="anime-detail-title">${escapeHtml(title)}</h1>
         <div class="anime-detail-sub">${escapeHtml(titleNat)}</div>
       </div>`
    : `<div class="anime-detail-banner-fallback">🎌</div>
       <div class="anime-detail-title-wrap" style="position:relative;background:var(--card);padding:20px;">
         <h1 class="anime-detail-title">${escapeHtml(title)}</h1>
       </div>`;

  const genres = (anime.genres || []).map(g => g.name).join(' · ');
  const aired = anime.aired?.string || '—';
  const studio = anime.studios?.[0]?.name || '—';
  const eps = ani?.episodes ?? anime.episodes ?? '?';
  const nextEp = ani?.nextAiringEpisode;
  let nextStr = '';
  if (nextEp?.episode != null) {
    if (nextEp.airingAt) {
      nextStr = `Next ep ${nextEp.episode}: ${new Date(nextEp.airingAt * 1000).toLocaleString()}`;
    } else if (nextEp.timeUntilAiring != null && nextEp.timeUntilAiring > 0) {
      const hr = Math.floor(nextEp.timeUntilAiring / 3600);
      const mn = Math.floor((nextEp.timeUntilAiring % 3600) / 60);
      nextStr = `Next ep ${nextEp.episode}: in ${hr > 0 ? hr + 'h ' : ''}${mn}m`;
    } else {
      nextStr = `Next: episode ${nextEp.episode}`;
    }
  }

  metaEl.innerHTML = `
    <div class="anime-detail-meta-row">
      <span>⭐ MAL ${anime.score ?? 'N/A'}</span>
      <span>${eps} eps</span>
      <span>${escapeHtml(anime.rating || 'PG')}</span>
      <span>${escapeHtml(studio)}</span>
    </div>
    <p style="color:var(--m2);font-size:15px;margin-top:12px;">${escapeHtml(aired)} · ${escapeHtml(genres)}</p>
    ${nextStr ? `<p style="color:var(--gold);font-size:15px;margin-top:8px;">${escapeHtml(nextStr)}</p>` : ''}`;

  syn.innerHTML = anime.synopsis
    ? '<p>' + escapeHtml(anime.synopsis).replace(/\n+/g, '</p><p>') + '</p>'
    : '<p>No synopsis on file.</p>';

  function epNum(e, i) {
    const n = e?.episode ?? e?.episode_number;
    if (n != null && n !== '') return n;
    return i + 1;
  }
  function epAired(e) {
    const raw = e?.aired;
    if (!raw) return '—';
    if (typeof raw === 'object' && raw !== null) {
      const s = raw.string || raw.date || '';
      if (s) return String(s).split('T')[0];
    }
    const s = String(raw);
    return s.includes('T') ? s.split('T')[0] : s.slice(0, 10);
  }

  if (epData.length) {
    epEl.innerHTML = `<table class="ep-table"><thead><tr><th>#</th><th>Title</th><th>Aired</th></tr></thead><tbody>
      ${epData.map((e, i) => `<tr><td>${epNum(e, i)}</td><td>${escapeHtml(e.title || '—')}</td><td>${escapeHtml(epAired(e))}</td></tr>`).join('')}
    </tbody></table>`;
  } else {
    const total = typeof anime.episodes === 'number' ? anime.episodes : (typeof ani?.episodes === 'number' ? ani.episodes : null);
    if (total && total > 0) {
      const cap = Math.min(total, 48);
      const rows = Array.from({ length: cap }, (_, i) =>
        `<tr><td>${i + 1}</td><td>Episode ${i + 1} — list pending on Jikan</td><td>—</td></tr>`).join('');
      const more = total > cap ? `<p style="color:var(--m2);margin-top:10px;font-size:14px;">Showing ${cap} of ${total} planned episodes. Open MAL for full list.</p>` : '';
      epEl.innerHTML = `<p style="color:var(--m2);font-size:14px;margin-bottom:10px;">Jikan did not return titles yet; episode numbers below match the planned count (${total}).</p><table class="ep-table"><thead><tr><th>#</th><th>Title</th><th>Aired</th></tr></thead><tbody>${rows}</tbody></table>${more}`;
    } else {
      epEl.innerHTML = `<p style="color:var(--m2);font-size:16px;">No per-episode list from Jikan yet. Total episodes: <strong>TBA</strong>. Try again later or check MyAnimeList.</p>`;
    }
  }

  const streams = ani?.streamingEpisodes || [];
  if (streams.length) {
    streamEl.innerHTML = `<div class="streaming-grid">${streams.slice(0, 12).map(s => `
      <div class="stream-card">
        <a href="${escapeAttr(s.url)}" target="_blank" rel="noopener">
          ${s.thumbnail ? `<img class="stream-thumb" src="${escapeAttr(s.thumbnail)}" alt="">` : ''}
          <div class="t">${escapeHtml(s.title || 'Episode')}</div>
        </a>
      </div>`).join('')}</div>`;
  } else {
    streamEl.innerHTML = '<p style="color:var(--m2);font-size:15px;">Streaming episode thumbnails will appear here when AniList has them for this title.</p>';
  }

  document.title = `${title} — NexZone Anime`;
}

async function initAnimeGenreFilters() {
  const wrap = document.getElementById('animeFilterChips');
  if (!wrap || wrap.dataset.ready) return;
  wrap.dataset.ready = '1';
  try {
    const genres = await fetchJikanGenres();
    animeGenreCache = genres;
    const want = [1, 2, 4, 8, 10, 22, 36, 37, 41];
    const popular = want.map(id => genres.find(g => g.mal_id === id)).filter(Boolean);
    const chips = [{ mal_id: null, name: 'All airing' }, ...popular];
    wrap.innerHTML = chips.map(g =>
      `<button type="button" class="filter-chip${g.mal_id == null ? ' active' : ''}" data-genre="${g.mal_id ?? ''}" onclick="applyAnimeGenreFilter(${g.mal_id === null ? 'null' : g.mal_id}, this)">${escapeHtml(g.name)}</button>`
    ).join('');
  } catch {
    wrap.innerHTML = '<span style="color:var(--m);font-size:13px;">Genre filters unavailable</span>';
  }
}

window.applyAnimeGenreFilter = async function (genreId, btn) {
  document.querySelectorAll('#animeFilterChips .filter-chip').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  pill('pill-anime', 'ld', '<span class="spin"></span> Filtering…');
  try {
    let d;
    if (genreId == null) {
      d = await fetchTopAiringAnime(25);
    } else {
      d = await fetchJikanAnimeList({ genres: String(genreId), status: 'airing', order_by: 'popularity', limit: 25 });
    }
    const items = d.data || [];
    allAnimeData = items;
    pageHomeAnime = 1;
    pageAnimeGrid = 1;
    paintHomeAnime();
    paintAnimePageGrid();
    pill('pill-anime', 'ok', `Anime — ${items.length} shows`);
  } catch {
    pill('pill-anime', 'er', 'Filter failed');
  }
};

window.resetAnimeFilter = function () {
  const first = document.querySelector('#animeFilterChips .filter-chip[data-genre=""]') || document.querySelector('#animeFilterChips .filter-chip');
  applyAnimeGenreFilter(null, first);
};

let tickerSports = '', tickerAnime = '';
function updateTicker(sports, anime) {
  if (sports !== null && sports !== undefined) tickerSports = sports;
  if (anime !== null && anime !== undefined) tickerAnime = anime;
  const combined = (tickerSports + tickerAnime) || '<span class="tck-empty">Loading…</span>';
  const t = document.getElementById('tickerTrack');
  if (t) t.innerHTML = combined + combined;
}

async function subscribe() {
  const v = document.getElementById('nlEmail')?.value;
  if (!v || !v.includes('@')) { nzAlert('Please enter a valid email address.', 'error'); return; }
  try {
    await fetch(NZ_MAIL_URL, {
      method: 'POST',
      body: JSON.stringify({ type: 'subscribe', name: 'Subscriber', email: v, interest: 'Sports + Anime (Everything)' })
    });
  } catch (_) {}
  document.getElementById('nlEmail').value = '';
  nav('subscribed');
}

async function submitSubscribe() {
  const name = document.getElementById('subName')?.value;
  const email = document.getElementById('subEmail')?.value;
  const interest = document.getElementById('subInterest')?.value;
  if (!email || !email.includes('@')) { nzAlert('Please enter a valid email address.', 'error'); return; }
  try {
    await fetch(NZ_MAIL_URL, {
      method: 'POST',
      body: JSON.stringify({ type: 'subscribe', name, email, interest })
    });
  } catch (_) {}
  document.getElementById('subName').value = '';
  document.getElementById('subEmail').value = '';
  document.getElementById('subInterest').selectedIndex = 0;
  nav('subscribed');
}

async function submitContact() {
  const name = document.getElementById('cName')?.value || 'Anonymous';
  const email = document.getElementById('cEmail')?.value;
  const subject = document.getElementById('cSubject')?.value || 'General Inquiry';
  const msg = document.getElementById('cMessage')?.value;
  if (!email || !email.includes('@')) { nzAlert('Please enter a valid email address.', 'error'); return; }
  if (!msg) { nzAlert('Please write a message before sending.', 'error'); return; }
  try {
    await fetch(NZ_MAIL_URL, {
      method: 'POST',
      body: JSON.stringify({ type: 'contact', name, email, subject, message: msg })
    });
  } catch (_) {}
  nzAlert(`Message sent! We'll get back to you at ${email} within 2 business days.`, 'success');
  document.getElementById('cName').value = '';
  document.getElementById('cEmail').value = '';
  document.getElementById('cMessage').value = '';
  document.getElementById('cSubject').selectedIndex = 0;
}

function shareArticle(platform) {
  const title = document.getElementById('ap-title')?.textContent;
  const url = window.location.href;
  if (platform === 'twitter') window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`, '_blank');
  else if (platform === 'reddit') window.open(`https://reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`, '_blank');
  else { navigator.clipboard?.writeText(url).then(() => nzAlert('Link copied to your clipboard.', 'success')).catch(() => nzAlert('Copy this link: ' + url, 'info')); }
}

const ro = new IntersectionObserver(entries =>
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('vis'); ro.unobserve(e.target); } }),
  { threshold: 0.07 });
document.querySelectorAll('.reveal').forEach(el => ro.observe(el));

window.addEventListener('scroll', () =>
  document.getElementById('mainNav').classList.toggle('scrolled', scrollY > 40));

function executeSearch(query) {
  if (!query || query.trim() === '') return;
  const q = query.toLowerCase().trim();
  nav('search');
  const titleEl = document.getElementById('search-title');
  const countEl = document.getElementById('search-count');
  const grid = document.getElementById('search-results-grid');
  if (!grid || !titleEl || !countEl) return;
  titleEl.textContent = `Results for: "${query}"`;
  grid.innerHTML = '';
  const allContent = document.querySelectorAll('.ac, .anc, .sc, .stack-card');
  let foundCount = 0;
  allContent.forEach(item => {
    if (item.innerText.toLowerCase().includes(q)) {
      const clone = item.cloneNode(true);
      clone.style.display = '';
      clone.style.opacity = '1';
      grid.appendChild(clone);
      foundCount++;
    }
  });
  countEl.textContent = `Found ${foundCount} match${foundCount !== 1 ? 'es' : ''}.`;
  if (foundCount === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--m2);font-size:17px;">No results for "${escapeHtml(query)}".</div>`;
  }
}

async function init() {
  const luEl = document.getElementById('lu');
  if (luEl) luEl.innerHTML = `<span class="spin"></span> Refreshing…`;

  const [nba, epl, nNews, sNews] = await Promise.all([
    fetchNBA(),
    fetchEPL(),
    fetchESPNNews('basketball/nba').catch(() => []),
    fetchESPNNews('soccer/eng.1').catch(() => [])
  ]);

  allEspnNews = mergeEspnNews(nNews, sNews);
  renderEspnNews(allEspnNews);
  setHeroFromNews(allEspnNews);

  renderSports([...nba, ...epl]);

  setTimeout(fetchAnime, 900);
  setTimeout(initAnimeGenreFilters, 1400);

  if (luEl) setTimeout(() => {
    luEl.textContent = `✅ Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }, 3000);
}

setupLiveInteractions();
init();
setInterval(init, 90000);
window.addEventListener('resize', () => {
  if (window.innerWidth > 900) {
    const mMenu = document.getElementById('mMenu');
    if (mMenu) mMenu.classList.remove('open');
  }
});
