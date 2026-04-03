/**
 * NexZone — SPA router, UI, ESPN + Jikan + AniList
 * Production build — security hardened
 */
/* global ARTICLES, fetchESPNNews, fetchGameSummary, fetchJikanAnimeFull, fetchJikanEpisodesAll, fetchJikanGenres, fetchJikanAnimeList, fetchTopAiringAnime, fetchAniListByMalId */

// ════════════════════════════════════════
// PRODUCTION SECURITY
// ════════════════════════════════════════

// Dev mode flag — console stays active on localhost for debugging
const IS_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';

// Suppress console in production only
if (!IS_DEV) {
  (function(){'use strict';console.log=function(){};console.warn=function(){};console.error=function(){};})();
}

// Rate limiter for form submissions
const NZ_RATE_LIMIT = {
  maxAttempts: 3,
  windowMs: 60000, // 1 minute
  attempts: {},
  check(key) {
    const now = Date.now();
    if (!this.attempts[key]) this.attempts[key] = [];
    this.attempts[key] = this.attempts[key].filter(t => now - t < this.windowMs);
    if (this.attempts[key].length >= this.maxAttempts) {
      return false; // Rate limited
    }
    this.attempts[key].push(now);
    return true;
  }
};

// Sanitize user input
function nzSanitize(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>\"'&]/g, c => ({
    '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', '&': '&amp;'
  })[c]);
}

const NZ_MAIL_URL = 'https://script.google.com/macros/s/AKfycbyk6mgpDBtitPwyfDFBVBm2ULTT9UKIluOjAiD_axYcrcanzTOPnt5zKzCJmro68PgA/exec'; 
const NZ_PAGE_SIZE = 6;
let currentPage = 'home';
let lastPage = 'home';
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
function calcReadTime(text) {
  const words = text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  const mins = Math.max(1, Math.ceil(words / 200));
  return `${mins} min read`;
}
// ════════════════════════════════════════
// THEME TOGGLE (Dark ↔ Light) with Cookies
// ════════════════════════════════════════
function setCookie(name, value, days) {
  const d = new Date();
  d.setTime(d.getTime() + (days * 86400000));
  document.cookie = name + '=' + value + ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax';
}
function getCookie(name) {
  const v = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
  return v ? v.pop() : null;
}
function applyTheme(mode) {
  if (mode === 'light') {
    document.body.classList.add('light-mode');
  } else {
    document.body.classList.remove('light-mode');
  }
}
function toggleTheme() {
  const isLight = document.body.classList.contains('light-mode');
  const next = isLight ? 'dark' : 'light';
  applyTheme(next);
  setCookie('nz-theme', next, 365);
  try { localStorage.setItem('nz-theme', next); } catch(_) {}
}
// Restore saved theme on load (localStorage first, fallback to cookie)
(function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem('nz-theme'); } catch(_) {}
  if (!saved) saved = getCookie('nz-theme');
  if (saved) applyTheme(saved);
})();

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
    w.style.display = 'none';
    return;
  }
  w.style.display = 'block';
  w.innerHTML = `<div class="nz-pager">
    <button type="button" class="nz-pager-btn" ${page <= 1 ? 'disabled' : ''}>← Prev</button>
    <span class="nz-pager-info">Page ${page} of ${totalPages}</span>
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
  
  if (!filtered.length) {
    const msg = '<div style="grid-column:1/-1;text-align:center;padding:36px;color:var(--m);font-size:17px;">No games available right now.</div>';
    if (grid) grid.innerHTML = msg;
    if (liveGrid) liveGrid.innerHTML = msg;
    renderPager('homeSportsPager', 1, 1, () => {});
    renderPager('liveSportsPager', 1, 1, () => {});
    return;
  }
  
  const total = Math.ceil(filtered.length / NZ_PAGE_SIZE);
  pageHomeSports = Math.min(Math.max(1, pageHomeSports), total);
  pageLiveSports = Math.min(Math.max(1, pageLiveSports), total);
  
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
    nba.title = '🏀 Click to view NBA scores';
    nba.onclick = () => {
      nav('sports');
      setTimeout(() => {
        const btn = document.querySelector('.sports-genre-chip[data-sport="nba"]');
        if (btn) filterSportsByGenre('nba', btn);
      }, 200);
    };
  }
  if (epl) {
    epl.classList.add('api-click');
    epl.title = '⚽ Click to view EPL scores';
    epl.onclick = () => {
      nav('sports');
      setTimeout(() => {
        const btn = document.querySelector('.sports-genre-chip[data-sport="epl"]');
        if (btn) filterSportsByGenre('epl', btn);
      }, 200);
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

  // If no data passed in (e.g. navigated via hash without data), show loading skeleton
  if (!a) {
    try {
      const raw = sessionStorage.getItem('nzNewsArticle');
      if (raw) a = JSON.parse(raw);
    } catch (_) {}
  }

  if (!a) {
    // Show loading skeleton while we try to resolve
    document.getElementById('newsDetailTag').textContent = '';
    document.getElementById('newsDetailTitle').innerHTML = '<div class="sk" style="height:32px;width:80%;border-radius:8px;"></div>';
    document.getElementById('newsDetailMeta').innerHTML = '<div class="sk" style="height:16px;width:40%;border-radius:6px;"></div>';
    const imEl = document.getElementById('newsDetailImg');
    imEl.style.display = 'none';
    document.getElementById('newsDetailSynopsis').innerHTML = `
      <div class="sk" style="height:16px;width:100%;border-radius:6px;margin-bottom:12px;"></div>
      <div class="sk" style="height:16px;width:90%;border-radius:6px;margin-bottom:12px;"></div>
      <div class="sk" style="height:16px;width:95%;border-radius:6px;margin-bottom:12px;"></div>
      <div class="sk" style="height:16px;width:60%;border-radius:6px;"></div>`;
    document.getElementById('newsDetailReadFull').href = '#';
    document.title = 'Loading… — NexZone';
    return;
  }

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
  const favs = getFavorites();
  return items.map(a => {
    const img = bestAnimeImage(a);
    const isFav = favs.anime.some(f => f.id === a.mal_id);
    return `
    <div class="anc" onclick="showAnimeDetailPage(${a.mal_id},true)" tabindex="0" role="button" aria-label="View anime: ${escapeAttr(a.title)}" onkeydown="if(event.key==='Enter'||event.key===' ')event.preventDefault(),showAnimeDetailPage(${a.mal_id},true)" style="position:relative">
      <button class="fav-star${isFav ? ' active' : ''}" data-anime="${a.mal_id}" onclick="event.stopPropagation();event.preventDefault();toggleAnimeFav(${a.mal_id},'${escapeAttr(a.title)}')" aria-label="Favorite anime">${isFav ? '★' : '☆'}</button>
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
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:36px;color:var(--m);font-size:17px;">No anime data available.</div>';
    renderPager('homeAnimePager', 1, 1, () => {});
    return;
  }
  const total = Math.ceil(items.length / NZ_PAGE_SIZE);
  pageHomeAnime = Math.min(Math.max(1, pageHomeAnime), total);
  const slice = items.slice((pageHomeAnime - 1) * NZ_PAGE_SIZE, pageHomeAnime * NZ_PAGE_SIZE);
  grid.innerHTML = buildAnimeCardsHTML(slice);
  renderPager('homeAnimePager', pageHomeAnime, total, p => { pageHomeAnime = p; try { sessionStorage.setItem('nzPageHomeAnime', p); } catch(_){} paintHomeAnime(); });
}

function paintAnimePageGrid() {
  const items = allAnimeData;
  const grid = document.getElementById('animePageGrid');
  if (!grid) return;
  if (!items.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:36px;color:var(--m);font-size:17px;">No anime data available.</div>';
    renderPager('animePagePager', 1, 1, () => {});
    return;
  }
  const total = Math.ceil(items.length / NZ_PAGE_SIZE);
  pageAnimeGrid = Math.min(Math.max(1, pageAnimeGrid), total);
  const slice = items.slice((pageAnimeGrid - 1) * NZ_PAGE_SIZE, pageAnimeGrid * NZ_PAGE_SIZE);
  grid.innerHTML = buildAnimeCardsHTML(slice);
  renderPager('animePagePager', pageAnimeGrid, total, p => { pageAnimeGrid = p; try { sessionStorage.setItem('nzPageAnimeGrid', p); } catch(_){} paintAnimePageGrid(); });
}

function nav(page, data) {
  // Track navigation with gtag (if available)
  try {
    if (typeof gtag === 'function') {
      gtag('event', 'page_view', { page_title: page, page_location: '#' + page });
      gtag('event', 'category_click', { category: page });
    }
  } catch(_) {}

  // Track navigation history for back button
  if (currentPage && currentPage !== page) lastPage = currentPage;

  // Reset ALL pagination when navigating
  pageHomeSports = 1;
  pageLiveSports = 1;
  pageHomeAnime = 1;
  pageAnimeGrid = 1;
  pageNews = 1;
  pageHomeArticles = 1;
  pageAllArticles = 1;
  pageAnimeReviews = 1;
  pageAnimeEpisodes = 1;
  pageMangaNews = 1;
  pageSportsScores = 1;
  pageSportsArticles = 1;
  pageFavorites = 1;

  // Reset anime genre filter to "All" when navigating to anime page
  if (page === 'anime') {
    setTimeout(() => {
      const firstChip = document.querySelector('#animeFilterChips .filter-chip');
      if (firstChip) {
        applyAnimeGenreFilter(null, firstChip);
      }
    }, 300);
  }

  if (page === 'animeDetail' && data != null) {
    showAnimeDetailPage(data, true);
    return;
  }

  // Smooth page transition
  const currentPageEl = document.querySelector('.page.active');
  const nextPageEl = document.getElementById('page-' + page);
  
  if (!nextPageEl) return;
  
  // Fade out current page
  if (currentPageEl && currentPageEl !== nextPageEl) {
    currentPageEl.style.opacity = '0';
    currentPageEl.style.transform = 'translateY(-12px)';
    
    setTimeout(() => {
      currentPageEl.classList.remove('active');
      
      // Fade in new page
      nextPageEl.classList.add('active');
      setTimeout(() => {
        nextPageEl.style.opacity = '1';
        nextPageEl.style.transform = 'translateY(0)';
      }, 50);
    }, 200);
  } else {
    nextPageEl.classList.add('active');
    setTimeout(() => {
      nextPageEl.style.opacity = '1';
      nextPageEl.style.transform = 'translateY(0)';
    }, 50);
  }
  
  currentPage = page;

  document.querySelectorAll('.nav-links button').forEach(b => b.classList.remove('active'));
  const nl = document.getElementById('nl-' + page);
  if (nl) nl.classList.add('active');

  window.scrollTo({ top: 0, behavior: 'smooth' });
  window.location.hash = page;

  // Reset pagination displays
  renderPager('homeSportsPager', 1, 1, () => {});
  renderPager('liveSportsPager', 1, 1, () => {});
  renderPager('homeAnimePager', 1, 1, () => {});
  renderPager('animePagePager', 1, 1, () => {});
  renderPager('newsPager', 1, 1, () => {});
  renderPager('homeArticlesPager', 1, 1, () => {});
  renderPager('allArticlesPager', 1, 1, () => {});
  renderPager('animeReviewsPager', 1, 1, () => {});
  renderPager('animeEpisodesPager', 1, 1, () => {});
  renderPager('mangaNewsPager', 1, 1, () => {});
  renderPager('sportsScoresPager', 1, 1, () => {});
  renderPager('sportsArticlesPager', 1, 1, () => {});

  if (page === 'article' && data) openArticle(data);
  if (page === 'game' && data) openGame(data);
  if (page === 'sports') populateSportsPage();
  if (page === 'anime') populateAnimePage();
  if (page === 'anime-reviews') populateAnimeReviews();
  if (page === 'anime-episodes') populateAnimeEpisodes();
  if (page === 'anime-rankings') populateAnimeRankings();
  if (page === 'manga-news') populateMangaNews();
  if (page === 'articles') populateAllArticles();
  if (page === 'live') populateLivePage();
  if (page === 'about') {
    updateMeta('About NexZone — Sports & Anime Hub', 'NexZone is a fan-powered sports and anime media hub. Live NBA, EPL, NFL scores, anime reviews, rankings, and episode guides — all in one place.');
  }
  if (page === 'privacy') {
    updateMeta('Privacy Policy — NexZone', 'Learn how NexZone collects, uses, and protects your data. We respect your privacy and comply with GDPR and CCPA regulations.');
  }
  if (page === 'terms') {
    updateMeta('Terms of Service — NexZone', 'Terms and conditions for using NexZone. By accessing our site you agree to these terms governing content usage, API data, and community guidelines.');
  }
  if (page === 'contact') {
    updateMeta('Contact NexZone — Get in Touch', 'Have a story tip, feedback, or advertising inquiry? Contact the NexZone team. We respond within 2 business days.');
  }
  if (page === 'favorites') {
    updateMeta('Your Favorites — NexZone', 'View your starred teams and anime. Quick access to the content you care about most.');
    renderFavoritesPage();
  }
  if (page === 'home') {
    // Restore saved anime pagination state
    try {
      const savedHome = sessionStorage.getItem('nzPageHomeAnime');
      if (savedHome) pageHomeAnime = parseInt(savedHome, 10) || 1;
    } catch(_) {}
    paintScoresOnly();
    paintHomeAnime();
    renderEspnNews(allEspnNews);
    buildArticlesGrid();
    renderPollWidget('homePoll');
  }
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
  if (h && document.getElementById('page-' + h)) {
    nav(h);
  } else if (h) {
    // Unknown hash — redirect to home
    window.location.hash = 'home';
  }
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
  } else if (h && document.getElementById('page-' + h)) {
    nav(h);
  } else if (h) {
    // Unknown hash on load — redirect to home
    window.location.hash = 'home';
  }
  buildArticlesGrid();
});

function makeCard(a, clickFn) {
  const d = document.createElement('div');
  d.className = 'ac';
  d.dataset.cat = a.cat;
  d.dataset.title = a.title.toLowerCase();
  d.setAttribute('tabindex', '0');
  d.setAttribute('role', 'button');
  d.setAttribute('aria-label', `Read article: ${a.title}`);
  d.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (clickFn || (() => nav('article', a)))(); } };

  // Image fallback system with demo images
  let imgHTML = '';
  if (a.coverImage) {
    const fallbackImg = DEMO_IMAGES[Math.floor(Math.random() * DEMO_IMAGES.length)];
    imgHTML = `<div class="ct ct-img"><img src="${escapeAttr(a.coverImage)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${fallbackImg}';this.onerror=function(){this.parentElement.innerHTML='${a.emoji || '📰'}'}"></div>`;
  } else {
    imgHTML = `<div class="ct">${a.emoji || '📰'}</div>`;
  }

  d.innerHTML = `
    ${imgHTML}
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

let pageHomeArticles = 1;
function buildArticlesGrid() {
  buildArticlesGridFiltered('all');
}

let pageAllArticles = 1;
function populateAllArticles(cat = 'all') {
  const grid = document.getElementById('allArticlesGrid');
  if (!grid) return;
  grid.innerHTML = '';
  
  const filtered = ARTICLES.filter(a => cat === 'all' || a.cat === cat);
  if (!filtered.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--m);font-size:17px;"><div style="font-size:48px;margin-bottom:12px;opacity:.5">📝</div>No articles in this category yet.</div>';
    renderPager('allArticlesPager', 1, 1, () => {});
    return;
  }
  
  const total = Math.ceil(filtered.length / NZ_PAGE_SIZE);
  pageAllArticles = Math.min(Math.max(1, pageAllArticles), total);
  const slice = filtered.slice((pageAllArticles - 1) * NZ_PAGE_SIZE, pageAllArticles * NZ_PAGE_SIZE);
  slice.forEach(a => grid.appendChild(makeCard(a)));
  
  renderPager('allArticlesPager', pageAllArticles, total, p => { pageAllArticles = p; populateAllArticles(cat); });
}

function populateLivePage() {
  const filtered = getFilteredSports();
  const liveGrid = document.getElementById('liveScoresGrid');
  const liveBar = document.getElementById('liveScoresBar');
  
  if (!filtered.length) {
    if (liveGrid) liveGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:36px;color:var(--m);font-size:17px;">No live games right now. Check back during game hours.</div>';
    if (liveBar) liveBar.innerHTML = '<div class="si">No games today</div>';
    renderPager('liveSportsPager', 1, 1, () => {});
    return;
  }
  
  const total = Math.ceil(filtered.length / NZ_PAGE_SIZE);
  pageLiveSports = Math.min(Math.max(1, pageLiveSports), total);
  const ls = filtered.slice((pageLiveSports - 1) * NZ_PAGE_SIZE, pageLiveSports * NZ_PAGE_SIZE);
  
  if (liveGrid) liveGrid.innerHTML = buildScoreCardsHTML(ls, null);
  if (liveBar) {
    const barHTML = buildScoresBarHTML(filtered);
    liveBar.innerHTML = barHTML;
  }
  
  renderPager('liveSportsPager', pageLiveSports, total, p => { pageLiveSports = p; populateLivePage(); });
}

function populateSportsPage() {
  pageSportsScores = 1;
  pageSportsArticles = 1;
  filterSportsByGenre('all', document.querySelector('.sports-genre-chip[data-sport="all"]'));
}

let pageSportsScores = 1;
let pageSportsArticles = 1;
let pageFavorites = 1;
let currentSportsGenre = 'all';

// ════════════════════════════════════════
// FAVORITES SYSTEM
// ════════════════════════════════════════
function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem('nz-favorites') || '{"teams":[],"anime":[]}');
  } catch(_) { return { teams: [], anime: [] }; }
}
function saveFavorites(favs) {
  try { localStorage.setItem('nz-favorites', JSON.stringify(favs)); } catch(_) {}
}
function toggleTeamFav(teamId, teamName) {
  const favs = getFavorites();
  const idx = favs.teams.findIndex(t => t.id === teamId);
  if (idx >= 0) {
    favs.teams.splice(idx, 1);
  } else {
    favs.teams.push({ id: teamId, name: teamName });
  }
  saveFavorites(favs);
  // Update all star buttons for this team
  document.querySelectorAll(`.fav-star[data-team="${teamId}"]`).forEach(btn => {
    const isFav = favs.teams.some(t => t.id === teamId);
    btn.classList.toggle('active', isFav);
    btn.textContent = isFav ? '★' : '☆';
  });
  // Track
  try { if (typeof gtag === 'function') gtag('event', 'fav_team_toggle', { team: teamName }); } catch(_) {}
}
function toggleAnimeFav(malId, title) {
  const favs = getFavorites();
  const idx = favs.anime.findIndex(a => a.id === malId);
  if (idx >= 0) {
    favs.anime.splice(idx, 1);
  } else {
    favs.anime.push({ id: malId, title: title });
  }
  saveFavorites(favs);
  document.querySelectorAll(`.fav-star[data-anime="${malId}"]`).forEach(btn => {
    const isFav = favs.anime.some(a => a.id === malId);
    btn.classList.toggle('active', isFav);
    btn.textContent = isFav ? '★' : '☆';
  });
  try { if (typeof gtag === 'function') gtag('event', 'fav_anime_toggle', { mal_id: malId }); } catch(_) {}
}
function renderFavoritesPage() {
  const favs = getFavorites();
  const teamsGrid = document.getElementById('favTeamsGrid');
  const animeGrid = document.getElementById('favAnimeGrid');

  // Render favorite teams
  if (!favs.teams.length) {
    teamsGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--m);font-size:17px;"><div style="font-size:48px;margin-bottom:12px;opacity:.5">⭐</div>No favorite teams yet. Tap the ☆ on any score card to add one.</div>';
  } else {
    // Find matching games from allSportsData
    const favGames = allSportsData.filter(g => {
      const comp = g.ev?.competitions?.[0];
      const [home, away] = comp?.competitors || [];
      return favs.teams.some(t =>
        home?.team?.id === t.id || away?.team?.id === t.id ||
        home?.team?.name === t.name || away?.team?.name === t.name
      );
    });
    if (favGames.length) {
      teamsGrid.innerHTML = buildScoreCardsHTML(favGames, null);
    } else {
      teamsGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--m);font-size:17px;"><div style="font-size:48px;margin-bottom:12px;opacity:.5">🏟️</div>No games today for your favorite teams. Check back during game hours!</div>';
    }
  }

  // Render favorite anime
  if (!favs.anime.length) {
    animeGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--m);font-size:17px;"><div style="font-size:48px;margin-bottom:12px;opacity:.5">🎌</div>No favorite anime yet. Tap the ☆ on any anime card to add one.</div>';
  } else {
    const favAnime = allAnimeData.filter(a => favs.anime.some(f => f.id === a.mal_id));
    if (favAnime.length) {
      animeGrid.innerHTML = buildAnimeCardsHTML(favAnime);
    } else {
      animeGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--m);font-size:17px;"><div style="font-size:48px;margin-bottom:12px;opacity:.5">🎌</div>Your favorite anime isn\'t currently airing. Check back later!</div>';
    }
  }
}

// ════════════════════════════════════════
// SELECTIVE NOTIFICATIONS (Favorites Only)
// ════════════════════════════════════════
let prevScores = {};
let notifEnabled = false;

function requestNotifPermission() {
  if (!('Notification' in window)) return;
  Notification.requestPermission().then(p => {
    notifEnabled = p === 'granted';
    try { localStorage.setItem('nz-notif-enabled', notifEnabled ? '1' : '0'); } catch(_) {}
    updateNotifToggleState();
    if (notifEnabled) {
      nzAlert('Score notifications enabled! You\'ll get alerts for your favorited teams.', 'success');
    }
  });
}

function initNotifications() {
  try {
    notifEnabled = localStorage.getItem('nz-notif-enabled') === '1';
  } catch(_) {}
  if (notifEnabled && 'Notification' in window && Notification.permission === 'granted') {
    notifEnabled = true;
  } else {
    notifEnabled = false;
  }
  updateNotifToggleState();
}

function sendNotif(title, body, tag) {
  if (!notifEnabled || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, {
      body: body,
      icon: '/icons/android-chrome-192x192.png',
      badge: '/icons/android-chrome-192x192.png',
      tag: tag,
      renotify: true,
      silent: false
    });
  } catch(_) {}
}

function checkScoreNotifications(newData) {
  if (!notifEnabled) return;
  const favs = getFavorites();
  if (!favs.teams.length) return;

  newData.forEach(game => {
    const comp = game.ev?.competitions?.[0];
    const [home, away] = comp?.competitors || [];
    const homeId = home?.team?.id || home?.team?.name;
    const awayId = away?.team?.id || away?.team?.name;
    const isFav = favs.teams.some(t => t.id === homeId || t.name === home?.team?.name || t.id === awayId || t.name === away?.team?.name);
    if (!isFav) return;

    const gId = game.ev?.id;
    if (!gId) return;

    const prev = prevScores[gId];
    const curr = { homeScore: home?.score, awayScore: away?.score, status: gameStatus(game.ev).cls };

    if (prev) {
      // Detect score change
      if (prev.homeScore !== curr.homeScore || prev.awayScore !== curr.awayScore) {
        const homeName = home?.team?.shortDisplayName || home?.team?.name || 'Home';
        const awayName = away?.team?.shortDisplayName || away?.team?.name || 'Away';
        sendNotif(
          `${game.emoji} ${homeName} vs ${awayName}`,
          `Score: ${home?.score ?? '?'} – ${away?.score ?? '?'}`,
          'score-' + gId
        );
      }
      // Detect game going final
      if (prev.status !== 'final' && curr.status === 'final') {
        const homeName = home?.team?.shortDisplayName || home?.team?.name || 'Home';
        const awayName = away?.team?.shortDisplayName || away?.team?.name || 'Away';
        sendNotif(
          `${game.emoji} Final: ${homeName} ${home?.score ?? '?'} – ${away?.score ?? '?'} ${awayName}`,
          'Game complete. Tap for full stats.',
          'final-' + gId
        );
      }
    }
    prevScores[gId] = curr;
  });

  // Clean up old entries
  const currentIds = new Set(newData.map(g => g.ev?.id).filter(Boolean));
  Object.keys(prevScores).forEach(id => {
    if (!currentIds.has(id)) delete prevScores[id];
  });
}

function toggleNotifications() {
  if (!('Notification' in window)) {
    nzAlert('Notifications not supported in this browser.', 'info');
    return;
  }
  if (notifEnabled) {
    notifEnabled = false;
    try { localStorage.setItem('nz-notif-enabled', '0'); } catch(_) {}
    document.getElementById('notifToggle')?.classList.remove('active');
    nzAlert('Score notifications disabled.', 'info');
  } else {
    requestNotifPermission();
  }
}

function updateNotifToggleState() {
  // Update settings dropdown notification item
  document.querySelectorAll('.settings-item').forEach(b => {
    if (b.textContent.includes('Score Alerts')) {
      b.classList.toggle('active', notifEnabled);
    }
  });
  // Update mobile menu notification button
  document.querySelectorAll('#mMenu button').forEach(b => {
    if (b.textContent.includes('Score Alerts')) {
      b.classList.toggle('active', notifEnabled);
    }
  });
}

function filterSportsByGenre(genre, btn) {
  // Track genre filter clicks
  try { if (typeof gtag === 'function') gtag('event', 'sports_filter', { filter: genre }); } catch(_) {}
  currentSportsGenre = genre;
  pageSportsScores = 1;
  pageSportsArticles = 1;

  // Update active chip
  document.querySelectorAll('.sports-genre-chip').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const grid = document.getElementById('sportScoresGrid');
  const title = document.getElementById('sportsSectionTitle');
  if (!grid) return;

  // Filter sports data
  let filtered = allSportsData;
  if (genre === 'nba') filtered = allSportsData.filter(x => x.league === 'nba');
  else if (genre === 'epl') filtered = allSportsData.filter(x => x.league === 'epl');
  else if (genre === 'nfl') filtered = allSportsData.filter(x => x.league === 'nfl');
  else if (genre === 'mlb') filtered = allSportsData.filter(x => x.league === 'mlb');
  else if (genre === 'mma') filtered = allSportsData.filter(x => x.league === 'mma');

  // Update title
  const titles = {
    all: "Today's Games",
    nba: '🏀 NBA Games',
    epl: '⚽ EPL / Soccer Matches',
    nfl: '🏈 NFL Games',
    mlb: '⚾ MLB Games',
    mma: '🥊 MMA / UFC Events'
  };
  if (title) title.textContent = titles[genre] || "Today's Games";

  // Render scores with pagination
  if (!filtered.length) {
    const messages = {
      all: 'No games scheduled today. Check back during game hours.',
      nba: '🏀 No NBA games scheduled today. Check back during the NBA season.',
      epl: '⚽ No EPL matches scheduled today. Check back during the soccer season.',
      nfl: '🏈 No NFL games scheduled today. Check back during the NFL season.',
      mlb: '⚾ No MLB games scheduled today. Check back during the baseball season.',
      mma: '🥊 No MMA/UFC events scheduled today. Check back for upcoming fights.'
    };
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--m);font-size:17px;">
      <div style="font-size:48px;margin-bottom:12px;opacity:.5">${genre === 'all' ? '🏟️' : genre === 'nba' ? '🏀' : genre === 'epl' ? '⚽' : genre === 'nfl' ? '🏈' : genre === 'mlb' ? '⚾' : '🥊'}</div>
      ${messages[genre] || 'No games scheduled today.'}
    </div>`;
    renderPager('sportsScoresPager', 1, 1, () => {});
  } else {
    const totalScores = Math.ceil(filtered.length / NZ_PAGE_SIZE);
    pageSportsScores = Math.min(Math.max(1, pageSportsScores), totalScores);
    const slice = filtered.slice((pageSportsScores - 1) * NZ_PAGE_SIZE, pageSportsScores * NZ_PAGE_SIZE);
    grid.innerHTML = buildScoreCardsHTML(slice, null);
    renderPager('sportsScoresPager', pageSportsScores, totalScores, p => { pageSportsScores = p; filterSportsByGenre(genre, btn); });
  }

  // Filter sports articles with pagination
  const articlesGrid = document.getElementById('sportsArticlesGrid');
  if (articlesGrid) {
    const sportsArticles = ARTICLES.filter(a => a.cat === 'sports');
    if (!sportsArticles.length) {
      articlesGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:36px;color:var(--m);">No sports articles available yet.</div>';
      renderPager('sportsArticlesPager', 1, 1, () => {});
    } else {
      const totalArticles = Math.ceil(sportsArticles.length / NZ_PAGE_SIZE);
      pageSportsArticles = Math.min(Math.max(1, pageSportsArticles), totalArticles);
      const slice = sportsArticles.slice((pageSportsArticles - 1) * NZ_PAGE_SIZE, pageSportsArticles * NZ_PAGE_SIZE);
      articlesGrid.innerHTML = '';
      slice.forEach(a => articlesGrid.appendChild(makeCard(a)));
      renderPager('sportsArticlesPager', pageSportsArticles, totalArticles, p => { pageSportsArticles = p; filterSportsByGenre(genre, btn); });
    }
  }
}

function populateAnimePage() {
  // Restore saved pagination state
  try {
    const savedGrid = sessionStorage.getItem('nzPageAnimeGrid');
    if (savedGrid) pageAnimeGrid = parseInt(savedGrid, 10) || 1;
  } catch(_) {}
  paintAnimePageGrid();
  // Ensure genre filters are initialized
  if (!document.getElementById('animeFilterChips')?.dataset?.ready) {
    initAnimeGenreFilters();
  }
}

let pageAnimeReviews = 1;
function populateAnimeReviews() {
  const grid = document.getElementById('animeReviewsGrid');
  if (!grid) return;
  const reviews = ARTICLES.filter(a => a.cat === 'review');
  if (!reviews.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--m);font-size:17px;"><div style="font-size:48px;margin-bottom:12px;opacity:.5">📝</div>No seasonal reviews available yet. Check back soon!</div>';
    renderPager('animeReviewsPager', 1, 1, () => {});
    return;
  }
  const total = Math.ceil(reviews.length / NZ_PAGE_SIZE);
  pageAnimeReviews = Math.min(Math.max(1, pageAnimeReviews), total);
  const slice = reviews.slice((pageAnimeReviews - 1) * NZ_PAGE_SIZE, pageAnimeReviews * NZ_PAGE_SIZE);
  grid.innerHTML = '';
  slice.forEach(a => grid.appendChild(makeCard(a)));
  renderPager('animeReviewsPager', pageAnimeReviews, total, p => { pageAnimeReviews = p; populateAnimeReviews(); });
}

let pageAnimeEpisodes = 1;
function populateAnimeEpisodes() {
  const grid = document.getElementById('animeEpisodesGrid');
  if (!grid) return;
  const episodes = ARTICLES.filter(a => a.cat === 'episode');
  if (!episodes.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--m);font-size:17px;"><div style="font-size:48px;margin-bottom:12px;opacity:.5">🎬</div>No episode guides available yet. Check back soon!</div>';
    renderPager('animeEpisodesPager', 1, 1, () => {});
    return;
  }
  const total = Math.ceil(episodes.length / NZ_PAGE_SIZE);
  pageAnimeEpisodes = Math.min(Math.max(1, pageAnimeEpisodes), total);
  const slice = episodes.slice((pageAnimeEpisodes - 1) * NZ_PAGE_SIZE, pageAnimeEpisodes * NZ_PAGE_SIZE);
  grid.innerHTML = '';
  slice.forEach(a => grid.appendChild(makeCard(a)));
  renderPager('animeEpisodesPager', pageAnimeEpisodes, total, p => { pageAnimeEpisodes = p; populateAnimeEpisodes(); });
}

let pageAnimeRankings = 1;
async function populateAnimeRankings() {
  const list = document.getElementById('animeRankingsList');
  if (!list) return;

  list.innerHTML = '<div style="text-align:center;padding:48px;"><span class="spin"></span> Loading rankings...</div>';

  try {
    const d = await fetchTopAiringAnime(50);
    const items = d?.data || [];
    if (!items.length) {
      list.innerHTML = '<div style="text-align:center;padding:48px;color:var(--m);font-size:17px;"><div style="font-size:48px;margin-bottom:12px;opacity:.5">📊</div>Rankings temporarily unavailable. All anime APIs may be rate-limited. Try again in a minute.</div>';
      return;
    }

    // Sort by score (handle null scores)
    items.sort((a, b) => (b.score || 0) - (a.score || 0));

    list.innerHTML = items.slice(0, 25).map((a, i) => {
      const img = bestAnimeImage(a);
      const rank = i + 1;
      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
      const animeId = a.mal_id || a.id || 0;
      return `<div class="ranking-item" onclick="showAnimeDetailPage(${animeId},true)" style="display:flex;align-items:center;gap:16px;padding:14px;background:var(--card);border:1px solid var(--b);border-radius:12px;margin-bottom:10px;cursor:pointer;transition:all .2s;">
        <div style="font-family:var(--fh);font-size:28px;min-width:50px;text-align:center;color:${rank <= 3 ? 'var(--gold)' : 'var(--m)'}">${medal}</div>
        ${img ? `<img src="${escapeAttr(img)}" alt="" style="width:60px;height:80px;object-fit:cover;border-radius:8px;" loading="lazy" onerror="this.style.display='none'">` : '<div style="width:60px;height:80px;background:var(--surface);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:28px;">🎌</div>'}
        <div style="flex:1;min-width:0;">
          <div style="font-size:16px;font-weight:600;color:var(--text);margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(a.title)}</div>
          <div style="font-size:13px;color:var(--m);">${escapeHtml(a.type || 'TV')} · ${a.episodes ?? '?'} eps · ${escapeHtml((a.genres || []).slice(0, 2).map(g => g.name).join(', '))}</div>
        </div>
        <div style="text-align:right;min-width:70px;">
          <div style="font-size:24px;font-family:var(--fh);color:var(--gold);">⭐ ${a.score ?? 'N/A'}</div>
          <div style="font-size:11px;color:var(--m);">Score</div>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    console.log('Rankings error:', e);
    list.innerHTML = '<div style="text-align:center;padding:48px;color:var(--m);font-size:17px;"><div style="font-size:48px;margin-bottom:12px;opacity:.5">📊</div>Failed to load rankings. Check your connection and try again.</div>';
  }
}

let pageMangaNews = 1;
function populateMangaNews() {
  const grid = document.getElementById('mangaNewsGrid');
  if (!grid) return;
  const news = ARTICLES.filter(a => a.cat === 'manga');
  if (!news.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--m);font-size:17px;"><div style="font-size:48px;margin-bottom:12px;opacity:.5">📚</div>No manga news available yet. Check back soon!</div>';
    renderPager('mangaNewsPager', 1, 1, () => {});
    return;
  }
  const total = Math.ceil(news.length / NZ_PAGE_SIZE);
  pageMangaNews = Math.min(Math.max(1, pageMangaNews), total);
  const slice = news.slice((pageMangaNews - 1) * NZ_PAGE_SIZE, pageMangaNews * NZ_PAGE_SIZE);
  grid.innerHTML = '';
  slice.forEach(a => grid.appendChild(makeCard(a)));
  renderPager('mangaNewsPager', pageMangaNews, total, p => { pageMangaNews = p; populateMangaNews(); });
}

function openArticle(a) {
  currentArticleId = a.id;
  document.getElementById('ap-cat').textContent = a.tag;
  document.getElementById('ap-cat').className = `ap-cat ${a.tagCls}`;
  document.getElementById('ap-title').textContent = a.title;
  document.getElementById('ap-author').textContent = a.author || 'NexZone Team';
  document.getElementById('ap-date').textContent = a.date;
  document.getElementById('ap-read').innerHTML = `📖 ${calcReadTime(a.content)}`;
  const apImg = document.getElementById('ap-img');
  const extWrap = document.getElementById('ap-external-wrap');
  if (a.coverImage) {
    apImg.innerHTML = `<img src="${escapeAttr(a.coverImage)}" alt="" style="width:100%;max-height:380px;object-fit:cover;border-radius:12px;display:block;border:1px solid var(--b);" loading="eager" onerror="this.parentElement.innerHTML='<span style=\\'font-size:80px\\'>${a.emoji || '📰'}</span>'">`;
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
  updateMeta(`${a.title} — NexZone`, `${a.excerpt || a.title}. Read more on NexZone — your source for sports and anime coverage.`);
  // Track article read
  try { if (typeof gtag === 'function') gtag('event', 'article_read', { article_id: a.id, category: a.cat }); } catch(_) {}
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
  
  // Get additional game info
  const venue = comp?.venue?.fullName || 'TBD';
  const city = comp?.venue?.address?.city || '';
  const capacity = comp?.venue?.capacity || '';
  const attendance = comp?.attendance || '';
  const officials = comp?.officials || [];
  const broadcaster = comp?.broadcasts?.[0]?.names?.[0] || '';
  const homeRecord = home?.records?.[0]?.summary || '';
  const awayRecord = away?.records?.[0]?.summary || '';

  document.getElementById('gameTeams').innerHTML = `
    <div class="game-team">
      ${hLogo ? `<img src="${escapeAttr(hLogo)}" alt="" style="width:80px;height:80px;object-fit:contain;margin:0 auto 12px;display:block;" loading="lazy" onerror="this.style.display='none'">` : ''}
      <div class="game-team-name">${home?.team?.shortDisplayName || home?.team?.name || 'Home'}</div>
      ${homeRecord ? `<div style="font-size:14px;color:var(--m);margin-top:4px">${homeRecord}</div>` : ''}
      <div class="game-team-pts">${home?.score ?? '—'}</div>
    </div>
    <div class="game-vs">${emoji}<br>VS</div>
    <div class="game-team">
      ${aLogo ? `<img src="${escapeAttr(aLogo)}" alt="" style="width:80px;height:80px;object-fit:contain;margin:0 auto 12px;display:block;" loading="lazy" onerror="this.style.display='none'">` : ''}
      <div class="game-team-name">${away?.team?.shortDisplayName || away?.team?.name || 'Away'}</div>
      ${awayRecord ? `<div style="font-size:14px;color:var(--m);margin-top:4px">${awayRecord}</div>` : ''}
      <div class="game-team-pts">${away?.score ?? '—'}</div>
    </div>`;

  document.getElementById('gameStatus').innerHTML = `${st.cls === 'live' ? '<span style="animation:pbadge 1.4s infinite">●</span> ' : ''}${st.label}`;
  document.getElementById('gameStatus').className = `game-status ${st.cls}`;

  document.getElementById('gameInfoGrid').innerHTML = `
    <div class="game-info-card"><div class="game-info-label">League</div><div class="game-info-val">${emoji} ${sport}</div></div>
    <div class="game-info-card"><div class="game-info-label">Status</div><div class="game-info-val" style="font-size:18px;">${st.label}</div></div>
    <div class="game-info-card"><div class="game-info-label">Venue</div><div class="game-info-val" style="font-size:16px;">${venue}</div></div>
    ${city ? `<div class="game-info-card"><div class="game-info-label">Location</div><div class="game-info-val" style="font-size:16px;">${city}</div></div>` : ''}
    ${attendance ? `<div class="game-info-card"><div class="game-info-label">Attendance</div><div class="game-info-val" style="font-size:18px;">${attendance}</div></div>` : ''}
    ${broadcaster ? `<div class="game-info-card"><div class="game-info-label">Broadcast</div><div class="game-info-val" style="font-size:16px;">${broadcaster}</div></div>` : ''}`;

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
      <div class="sc-lg">${o.emoji} ${o.sport} ${os.cls === 'live' ? '<span style="color:var(--red);font-size:9px"><span class="live-pulse-dot"></span>LIVE</span>' : ''}</div>
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
  if (!leaders?.length) return '<p style="color:var(--m);font-size:15px;">Stat leaders not available for this event.</p>';
  
  let html = '';
  let hasData = false;
  
  for (const cat of leaders.slice(0, 6)) {
    const label = cat.displayName || cat.name || 'Category';
    const list = cat.leaders || [];
    if (!list.length) continue;
    
    hasData = true;
    html += `<div style="margin-bottom:16px;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:var(--m2);font-weight:700;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--b)">${escapeHtml(label)}</div>
      <div style="display:flex;flex-direction:column;gap:6px;">`;
    
    for (const L of list.slice(0, 3)) {
      const name = L?.athlete?.displayName || L?.displayName || L?.shortName || '';
      const val = L?.displayValue ?? L?.value ?? '';
      const team = L?.team?.abbreviation || '';
      if (name || val) {
        html += `<div class="leader-pill"><div class="ln">${team ? escapeHtml(team) + ' · ' : ''}${escapeHtml(label)}</div><div><strong>${escapeHtml(name)}</strong> ${escapeHtml(String(val))}</div></div>`;
      }
    }
    
    html += '</div></div>';
  }
  
  return hasData ? html : '<p style="color:var(--m);font-size:15px;">Stat leaders not available for this event.</p>';
}

function buildInjuriesHTML(summary) {
  const inj = summary.injuries;
  if (!inj?.length) return '<p style="color:var(--m);font-size:15px;">No injury reports available for this event.</p>';
  
  let html = '';
  for (const row of inj.slice(0, 10)) {
    const t = row?.description || row?.details || row?.type?.description || row?.status || '';
    const athlete = row?.athlete?.fullName || row?.displayName || '';
    if (t || athlete) {
      html += `<div class="injury-row"><strong>${escapeHtml(athlete)}</strong>${athlete && t ? ' — ' : ''}${escapeHtml(String(t))}</div>`;
    }
  }
  return html || '<p style="color:var(--m);font-size:15px;">No injury reports available.</p>';
}

function buildInsightsHTML(summary) {
  const headlines = summary.news?.headlines || summary.headlines || [];
  const pick = summary.pickcenter || summary.predictor;
  
  if (!headlines?.length && !pick?.summary) {
    return '<p style="color:var(--m);font-size:15px;">No extra headlines or insights bundled with this event. Check the <a href="#home" onclick="nav(\'home\')" style="color:var(--red);text-decoration:underline">Breaking News section</a> on the home page.</p>';
  }
  
  let html = '';
  if (headlines?.length) {
    for (const h of headlines.slice(0, 8)) {
      const t = h?.headline || h?.title || h?.description || '';
      const link = h?.links?.web?.href || '#';
      if (t) {
        html += `<div class="insight-row">${link !== '#' ? `<a href="${escapeAttr(link)}" target="_blank" rel="noopener" style="color:var(--text);text-decoration:none">${escapeHtml(t)}</a>` : escapeHtml(t)}</div>`;
      }
    }
  }
  if (pick?.summary) {
    html += `<div class="insight-row" style="margin-top:12px;background:rgba(232,50,60,.05);border-left:3px solid var(--red);"><strong>Matchup Insight:</strong> ${escapeHtml(pick.summary)}</div>`;
  }
  return html;
}

let currentHomeCat = 'all';
function filterCat(cat, btn) {
  currentHomeCat = cat;
  pageHomeArticles = 1;
  document.querySelectorAll('#articleTabs .tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  buildArticlesGridFiltered(cat);
}

function buildArticlesGridFiltered(cat = 'all') {
  const grid = document.getElementById('articlesGrid');
  if (!grid) return;
  grid.innerHTML = '';
  
  const filtered = cat === 'all' ? ARTICLES : ARTICLES.filter(a => a.cat === cat);
  if (!filtered.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--m);font-size:17px;"><div style="font-size:48px;margin-bottom:12px;opacity:.5">📝</div>No articles in this category yet.</div>';
    renderPager('homeArticlesPager', 1, 1, () => {});
    return;
  }
  
  const total = Math.ceil(filtered.length / NZ_PAGE_SIZE);
  pageHomeArticles = Math.min(Math.max(1, pageHomeArticles), total);
  const slice = filtered.slice((pageHomeArticles - 1) * NZ_PAGE_SIZE, pageHomeArticles * NZ_PAGE_SIZE);
  
  slice.forEach((a, i) => {
    const card = makeCard(a);
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    grid.appendChild(card);
    setTimeout(() => { card.style.opacity = '1'; card.style.transform = ''; }, 300 + i * 80);
  });
  
  renderPager('homeArticlesPager', pageHomeArticles, total, p => { pageHomeArticles = p; buildArticlesGridFiltered(cat); });
}

function filterAll(cat, btn) {
  pageAllArticles = 1;
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
    if (evs.length) {
      pill('pill-nba', 'ok', `NBA — ${evs.length} game${evs.length !== 1 ? 's' : ''}`);
      return evs.map(ev => ({ emoji: '🏀', sport: 'NBA', league: 'nba', ev }));
    }
    throw new Error('empty');
  } catch {
    // Fallback: BallDontLie
    try {
      const games = await fetchBallDontLieGames();
      if (games.length) {
        pill('pill-nba', 'ok', `NBA — ${games.length} games (fallback)`);
        return games.map(g => ({
          emoji: '🏀',
          sport: 'NBA',
          league: 'nba',
          ev: {
            id: g.id,
            status: { type: { state: g.status === 'Final' ? 'post' : g.status === '1st' || g.status === '2nd' || g.status === '3rd' || g.status === '4th' ? 'in' : 'pre', shortDetail: g.status } },
            date: new Date().toISOString(),
            competitions: [{
              competitors: [
                { team: { name: g.home_team, abbreviation: g.home_team, shortDisplayName: g.home_team }, score: g.home_team_score },
                { team: { name: g.visitor_team, abbreviation: g.visitor_team, shortDisplayName: g.visitor_team }, score: g.visitor_team_score }
              ]
            }]
          }
        }));
      }
    } catch (_) {}
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
    if (evs.length) {
      pill('pill-epl', 'ok', `EPL — ${evs.length} match${evs.length !== 1 ? 'es' : ''}`);
      return evs.map(ev => ({ emoji: '⚽', sport: 'EPL', league: 'epl', ev }));
    }
    throw new Error('empty');
  } catch {
    // Fallback: TheSportsDB
    try {
      const events = await fetchTheSportsDB('epl');
      if (events.length) {
        pill('pill-epl', 'ok', `EPL — ${events.length} matches (fallback)`);
        return events.slice(0, 10).map(e => ({
          emoji: '⚽',
          sport: 'EPL',
          league: 'epl',
          ev: {
            id: e.idEvent || e.strEvent,
            status: { type: { state: e.strStatus === 'Match Finished' ? 'post' : e.strStatus === 'Not Started' ? 'pre' : 'in', shortDetail: e.strStatus } },
            date: e.dateEvent ? `${e.dateEvent}T${e.strTime}` : new Date().toISOString(),
            competitions: [{
              competitors: [
                { team: { name: e.strHomeTeam, abbreviation: e.strHomeTeam?.substring(0, 3), shortDisplayName: e.strHomeTeam }, score: e.intHomeScore || 0 },
                { team: { name: e.strAwayTeam, abbreviation: e.strAwayTeam?.substring(0, 3), shortDisplayName: e.strAwayTeam }, score: e.intAwayScore || 0 }
              ]
            }]
          }
        }));
      }
    } catch (_) {}
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
  if (!el) return;
  if (!articles?.length) {
    el.innerHTML = '<p style="color:var(--m);grid-column:1/-1;padding:36px;text-align:center;font-size:17px;">No headlines available right now.</p>';
    renderPager('newsPager', 1, 1, () => {});
    return;
  }
  const total = Math.ceil(articles.length / NZ_PAGE_SIZE);
  pageNews = Math.min(Math.max(1, pageNews), total);
  const start = (pageNews - 1) * NZ_PAGE_SIZE;
  const pageSlice = articles.slice(start, start + NZ_PAGE_SIZE);

  el.innerHTML = pageSlice.map((a, i) => {
    const globalIdx = start + i;
    const img = newsImage(a);
    const fallbackImg = DEMO_IMAGES[0]; // Sports image as fallback
    const tag = a?.category?.description || a?.categories?.[0]?.description || 'ESPN';
    const pub = a.published ? new Date(a.published).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    return `
      <article class="news-card" onclick="openNewsDetail(${globalIdx})" tabindex="0" role="button" aria-label="Read news: ${escapeAttr(a.headline || 'Headline')}" onkeydown="if(event.key==='Enter'||event.key===' ')event.preventDefault(),openNewsDetail(${globalIdx})">
        ${img ? `<img class="news-card-img" src="${escapeAttr(img)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${fallbackImg}';this.onerror=function(){this.style.display='none'}">` : `<img class="news-card-img" src="${fallbackImg}" alt="" loading="lazy">`}
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
  return slice.map(({ emoji, sport, ev, league }) => {
    const comp = ev.competitions?.[0];
    const [home, away] = comp?.competitors || [];
    const st = gameStatus(ev);
    const hs = parseInt(home?.score) || 0, as = parseInt(away?.score) || 0;
    const hwins = st.cls === 'final' && hs > as, awins = st.cls === 'final' && as > hs;
    const gId = ev.id;
    const hl = logoUrl(home?.team);
    const al = logoUrl(away?.team);
    
    // Get additional game details
    const venue = comp?.venue?.fullName || 'TBD';
    const broadcaster = comp?.broadcasts?.[0]?.names?.[0] || '';
    const attendance = comp?.attendance || '';
    const odds = comp?.details?.odds || '';
    
    // Get team records
    const homeRecord = home?.records?.[0]?.summary || '';
    const awayRecord = away?.records?.[0]?.summary || '';

    // Check if either team is favorited
    const favs = getFavorites();
    const homeFav = favs.teams.some(t => t.id === home?.team?.id || t.name === home?.team?.name);
    const awayFav = favs.teams.some(t => t.id === away?.team?.id || t.name === away?.team?.name);
    const isFav = homeFav || awayFav;

    return `<div class="sc ${st.cls === 'live' ? 'islive' : ''}" onclick="nav('game',allSportsData.find(x=>x.ev.id==='${gId}'))" tabindex="0" role="button" aria-label="View game: ${escapeHtml(home?.team?.shortDisplayName || 'Home')} vs ${escapeHtml(away?.team?.shortDisplayName || 'Away')}" onkeydown="if(event.key==='Enter'||event.key===' ')event.preventDefault(),nav('game',allSportsData.find(x=>x.ev.id==='${gId}'))" style="position:relative">
      <button class="fav-star${isFav ? ' active' : ''}" data-team="${home?.team?.id || ''}" onclick="event.stopPropagation();event.preventDefault();toggleTeamFav('${home?.team?.id || ''}','${escapeAttr(home?.team?.name || '')}')" aria-label="Favorite team">${isFav ? '★' : '☆'}</button>
      <div class="sc-lg">
        <span>${emoji} ${sport}</span>
        ${st.cls === 'live' ? '<span style="color:var(--red);font-size:9px;font-weight:700"><span class="live-pulse-dot"></span>LIVE</span>' : ''}
      </div>
      <div class="sc-teams">
        <div class="sc-team ${hwins ? 'win' : ''}">
          <div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1">
            ${hl ? `<img class="team-logo" src="${escapeAttr(hl)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
            <div style="min-width:0;flex:1">
              <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${home?.team?.shortDisplayName || home?.team?.abbreviation || 'Home'}</div>
              ${homeRecord ? `<div style="font-size:10px;color:var(--m);margin-top:2px">${homeRecord}</div>` : ''}
            </div>
          </div>
          <span class="pts">${home?.score ?? '—'}</span>
        </div>
        <div class="sc-team ${awins ? 'win' : ''}">
          <div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1">
            ${al ? `<img class="team-logo" src="${escapeAttr(al)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
            <div style="min-width:0;flex:1">
              <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${away?.team?.shortDisplayName || away?.team?.abbreviation || 'Away'}</div>
              ${awayRecord ? `<div style="font-size:10px;color:var(--m);margin-top:2px">${awayRecord}</div>` : ''}
            </div>
          </div>
          <span class="pts">${away?.score ?? '—'}</span>
        </div>
      </div>
      <div class="sc-st ${st.cls === 'live' ? 'lv' : ''}">
        ${st.label}
        ${venue !== 'TBD' ? `<span style="display:block;font-size:9px;margin-top:4px;opacity:.7">📍 ${venue}</span>` : ''}
        ${broadcaster ? `<span style="display:block;font-size:9px;margin-top:2px;opacity:.7">📺 ${broadcaster}</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

function buildScoresBarHTML(data) {
  const items = data.map(({ emoji, ev }) => {
    const comp = ev.competitions?.[0];
    const [home, away] = comp?.competitors || [];
    const st = gameStatus(ev);
    return `<div class="si" data-ev="${ev.id}" role="button" tabindex="0" title="Open full game">${emoji} ${home?.team?.abbreviation ?? '?'} vs ${away?.team?.abbreviation ?? '?'} <span class="sv">${home?.score ?? '?'}–${away?.score ?? '?'}</span> <span class="${st.cls === 'live' ? 'slive' : st.cls === 'final' ? 'sfin' : 'ssoon'}">${st.label}</span></div>`;
  }).join('');
  // Duplicate for seamless loop
  return items + items;
}

function renderSports(data) {
  allSportsData = data;
  setupApiPills();
  updatePillFilterClass();

  // Check for score notifications on favorited teams
  checkScoreNotifications(data);

  // Cache sports data for faster refresh
  try {
    sessionStorage.setItem('nzSportsData', JSON.stringify(data));
    sessionStorage.setItem('nzSportsTime', Date.now().toString());
  } catch (_) {}

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
  if (bar) bar.innerHTML = barHTML;
  if (liveBar) liveBar.innerHTML = barHTML;

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
    
    // Cache anime data for faster refresh
    try {
      sessionStorage.setItem('nzAnimeData', JSON.stringify(items));
      sessionStorage.setItem('nzAnimeTime', Date.now().toString());
    } catch (_) {}
    
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
    // Fallback: Kitsu
    try {
      const items = await fetchKitsuTopAnime(25);
      if (items.length) {
        allAnimeData = items;
        pill('pill-anime', 'ok', `Anime — ${items.length} (Kitsu)`);
        pageHomeAnime = 1;
        pageAnimeGrid = 1;
        paintHomeAnime();
        paintAnimePageGrid();
        return;
      }
    } catch (_) {}
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
  // Track anime detail page view
  try { if (typeof gtag === 'function') gtag('event', 'anime_detail_view', { mal_id: malId }); } catch(_) {}
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
    ? `<img class="anime-detail-banner" src="${escapeAttr(banner)}" alt="" loading="eager" onerror="this.style.display='none';this.parentElement.querySelector('.anime-detail-banner-fallback').style.display='flex'">
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
          ${s.thumbnail ? `<img class="stream-thumb" src="${escapeAttr(s.thumbnail)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
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
  if (!wrap) return;
  // Don't set ready until we actually render something
  if (wrap.dataset.ready) return;
  
  // Default fallback genres
  const defaultGenres = [
    { mal_id: null, name: 'All' },
    { mal_id: 1, name: 'Action' },
    { mal_id: 4, name: 'Comedy' },
    { mal_id: 22, name: 'Romance' },
    { mal_id: 8, name: 'Drama' },
    { mal_id: 10, name: 'Fantasy' },
    { mal_id: 36, name: 'Slice of Life' },
    { mal_id: 37, name: 'Supernatural' },
  ];
  
  try {
    const genres = await fetchJikanGenres();
    if (genres && genres.length) {
      animeGenreCache = genres;
      const want = [1, 2, 4, 8, 10, 22, 36, 37, 41];
      const popular = want.map(id => genres.find(g => g.mal_id === id)).filter(Boolean);
      const chips = [{ mal_id: null, name: 'All' }, ...popular];
      wrap.innerHTML = chips.map(g =>
        `<button type="button" class="filter-chip${g.mal_id == null ? ' active' : ''}" data-genre="${g.mal_id ?? ''}" onclick="applyAnimeGenreFilter(${g.mal_id === null ? 'null' : g.mal_id}, this)">${escapeHtml(g.name)}</button>`
      ).join('');
      wrap.dataset.ready = '1'; // Only mark ready after successful render
      return;
    }
  } catch (e) {
    // Genre fetch failed, using defaults
  }
  
  // Use default genres if API fails
  wrap.innerHTML = defaultGenres.map(g =>
    `<button type="button" class="filter-chip${g.mal_id == null ? ' active' : ''}" data-genre="${g.mal_id ?? ''}" onclick="applyAnimeGenreFilter(${g.mal_id === null ? 'null' : g.mal_id}, this)">${escapeHtml(g.name)}</button>`
  ).join('');
  wrap.dataset.ready = '1'; // Mark ready after rendering defaults
}

window.applyAnimeGenreFilter = async function (genreId, btn) {
  // Track anime genre filter clicks
  try { if (typeof gtag === 'function') gtag('event', 'anime_genre_filter', { genre: genreId || 'all' }); } catch(_) {}
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
  const combined = (tickerSports + tickerAnime) || '<span class="tck-empty">Loading live headlines...</span>';
  const t = document.getElementById('tickerTrack');
  if (t) {
    // Duplicate content for seamless loop
    t.innerHTML = combined + combined + combined;
  }
}

async function subscribe() {
  const v = document.getElementById('nlEmail')?.value;
  if (!v || !v.includes('@')) { nzAlert('Please enter a valid email address.', 'error'); return; }
  if (!NZ_RATE_LIMIT.check('subscribe')) { nzAlert('Too many attempts. Please wait a minute.', 'error'); return; }
  try {
    await fetch(NZ_MAIL_URL, {
      method: 'POST',
      redirect: 'follow',
      body: JSON.stringify({ type: 'subscribe', name: 'Subscriber', email: nzSanitize(v), interest: 'Sports + Anime (Everything)' })
    });
    document.getElementById('nlEmail').value = '';
    nav('subscribed');
    // Track newsletter subscription
    try { if (typeof gtag === 'function') gtag('event', 'newsletter_subscribe', { source: 'footer' }); } catch(_) {}
  } catch (_) {
    nzAlert('Subscription failed. Please try again later.', 'error');
  }
}

async function subscribeArticle() {
  const v = document.getElementById('articleNlEmail')?.value;
  if (!v || !v.includes('@')) { nzAlert('Please enter a valid email address.', 'error'); return; }
  if (!NZ_RATE_LIMIT.check('articleSub')) { nzAlert('Too many attempts. Please wait a minute.', 'error'); return; }
  try {
    await fetch(NZ_MAIL_URL, {
      method: 'POST',
      redirect: 'follow',
      body: JSON.stringify({ type: 'subscribe', name: 'Reader', email: nzSanitize(v), interest: 'Article Newsletter' })
    });
    document.getElementById('articleNlEmail').value = '';
    nzAlert('Subscribed! Check your inbox for a welcome email.', 'success');
    // Track article-end newsletter subscription
    try { if (typeof gtag === 'function') gtag('event', 'newsletter_subscribe', { source: 'article_end' }); } catch(_) {}
  } catch (_) {
    nzAlert('Subscription failed. Please try again later.', 'error');
  }
}

async function submitSubscribe() {
  const name = document.getElementById('subName')?.value;
  const email = document.getElementById('subEmail')?.value;
  const interest = document.getElementById('subInterest')?.value;
  if (!email || !email.includes('@')) { nzAlert('Please enter a valid email address.', 'error'); return; }
  if (!NZ_RATE_LIMIT.check('subForm')) { nzAlert('Too many attempts. Please wait a minute.', 'error'); return; }
  try {
    await fetch(NZ_MAIL_URL, {
      method: 'POST',
      redirect: 'follow',
      body: JSON.stringify({ type: 'subscribe', name: nzSanitize(name), email: nzSanitize(email), interest: nzSanitize(interest) })
    });
    document.getElementById('subName').value = '';
    document.getElementById('subEmail').value = '';
    document.getElementById('subInterest').selectedIndex = 0;
    nav('subscribed');
  } catch (_) {
    nzAlert('Subscription failed. Please try again later.', 'error');
  }
}

async function submitContact() {
  const name = document.getElementById('cName')?.value || 'Anonymous';
  const email = document.getElementById('cEmail')?.value;
  const subject = document.getElementById('cSubject')?.value || 'General Inquiry';
  const msg = document.getElementById('cMessage')?.value;
  if (!email || !email.includes('@')) { nzAlert('Please enter a valid email address.', 'error'); return; }
  if (!msg) { nzAlert('Please write a message before sending.', 'error'); return; }
  if (!NZ_RATE_LIMIT.check('contact')) { nzAlert('Too many attempts. Please wait a minute.', 'error'); return; }
  try {
    await fetch(NZ_MAIL_URL, {
      method: 'POST',
      redirect: 'follow',
      body: JSON.stringify({ type: 'contact', name: nzSanitize(name), email: nzSanitize(email), subject: nzSanitize(subject), message: nzSanitize(msg) })
    });
    nzAlert('Message sent! We\'ll get back to you within 2 business days.', 'success');
    document.getElementById('cName').value = '';
    document.getElementById('cEmail').value = '';
    document.getElementById('cMessage').value = '';
    document.getElementById('cSubject').selectedIndex = 0;
  } catch (_) {
    nzAlert('Failed to send message. Please try again later.', 'error');
  }
}

function shareArticle(platform) {
  const title = document.getElementById('ap-title')?.textContent;
  const url = window.location.href;
  if (platform === 'twitter') window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`, '_blank');
  else if (platform === 'reddit') window.open(`https://reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`, '_blank');
  else { navigator.clipboard?.writeText(url).then(() => nzAlert('Link copied to your clipboard.', 'success')).catch(() => nzAlert('Copy this link: ' + url, 'info')); }
}

function shareNewsArticle(platform) {
  const title = document.getElementById('newsDetailTitle')?.textContent || 'News';
  const url = window.location.href;
  if (platform === 'twitter') window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`, '_blank');
  else if (platform === 'reddit') window.open(`https://reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`, '_blank');
  else { navigator.clipboard?.writeText(url).then(() => nzAlert('Link copied to your clipboard.', 'success')).catch(() => nzAlert('Copy this link: ' + url, 'info')); }
}

function goBack() {
  const target = lastPage || 'home';
  // Don't go back to detail pages — always fall back to home
  if (['animeDetail', 'newsDetail', 'article', 'game'].includes(target)) {
    nav('home');
  } else {
    nav(target);
  }
}

const ro = new IntersectionObserver(entries =>
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('vis'); ro.unobserve(e.target); } }),
  { threshold: 0.07 });
document.querySelectorAll('.reveal').forEach(el => ro.observe(el));

window.addEventListener('scroll', () =>
  document.getElementById('mainNav').classList.toggle('scrolled', scrollY > 40));

// Close settings dropdown when clicking outside
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('settingsDropdown');
  const btn = document.getElementById('settingsBtn');
  if (dropdown && btn && !dropdown.contains(e.target) && !btn.contains(e.target)) {
    dropdown.classList.remove('open');
  }
});

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

  let results = [];

  // 1. Search ARTICLES array (always in memory)
  ARTICLES.forEach(a => {
    const searchable = `${a.title} ${a.excerpt} ${a.tag} ${a.content}`.toLowerCase();
    if (searchable.includes(q)) {
      results.push({ type: 'article', data: a });
    }
  });

  // 2. Search allEspnNews array
  allEspnNews.forEach((a, i) => {
    const searchable = `${a.headline || ''} ${a.description || ''} ${a.category?.description || ''}`.toLowerCase();
    if (searchable.includes(q)) {
      results.push({ type: 'news', data: a, index: i });
    }
  });

  // 3. Search allAnimeData array
  allAnimeData.forEach(a => {
    const searchable = `${a.title} ${a.title_english || ''} ${a.title_japanese || ''} ${(a.genres || []).map(g => g.name).join(' ')} ${a.synopsis || ''}`.toLowerCase();
    if (searchable.includes(q)) {
      results.push({ type: 'anime', data: a });
    }
  });

  // 4. Search allSportsData array
  allSportsData.forEach(item => {
    const comp = item.ev?.competitions?.[0];
    const [home, away] = comp?.competitors || [];
    const searchable = `${home?.team?.name || ''} ${away?.team?.name || ''} ${item.sport} ${item.league}`.toLowerCase();
    if (searchable.includes(q)) {
      results.push({ type: 'sports', data: item });
    }
  });

  // 5. Also search visible DOM cards as fallback (catches anything not in arrays)
  const seenIds = new Set(results.filter(r => r.data?.id).map(r => r.data.id));
  document.querySelectorAll('.ac, .anc, .sc, .stack-card').forEach(item => {
    const text = item.innerText.toLowerCase();
    if (text.includes(q)) {
      const id = item.dataset?.title || item.dataset?.cat;
      if (!id || !seenIds.has(id)) {
        results.push({ type: 'dom', element: item });
      }
    }
  });

  // Render results
  if (!results.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--m2);font-size:17px;">No results for "${escapeHtml(query)}".</div>`;
    countEl.textContent = 'Found 0 matches.';
    return;
  }

  countEl.textContent = `Found ${results.length} match${results.length !== 1 ? 'es' : ''}.`;

  results.forEach((r, i) => {
    let card;
    if (r.type === 'article') {
      card = makeCard(r.data);
    } else if (r.type === 'news') {
      const img = newsImage(r.data);
      const fallbackImg = DEMO_IMAGES[0];
      const tag = r.data?.category?.description || r.data?.categories?.[0]?.description || 'ESPN';
      const pub = r.data.published ? new Date(r.data.published).toLocaleString([], { month: 'short', day: 'numeric' }) : '';
      card = document.createElement('article');
      card.className = 'news-card';
      card.onclick = () => openNewsDetail(r.index);
      card.innerHTML = `
        ${img ? `<img class="news-card-img" src="${escapeAttr(img)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${fallbackImg}';this.onerror=function(){this.style.display='none'}">` : `<img class="news-card-img" src="${fallbackImg}" alt="" loading="lazy">`}
        <div class="news-card-body">
          <div class="news-card-tag">${escapeHtml(tag)}</div>
          <h3 class="news-card-title">${escapeHtml(r.data.headline || 'Headline')}</h3>
          <div class="news-card-meta">${escapeHtml(pub)} · ESPN</div>
        </div>`;
    } else if (r.type === 'anime') {
      const img = bestAnimeImage(r.data);
      card = document.createElement('div');
      card.className = 'anc';
      card.onclick = () => showAnimeDetailPage(r.data.mal_id, true);
      card.innerHTML = `
        ${img
          ? `<img class="animg" src="${escapeAttr(img)}" alt="${escapeAttr(r.data.title)}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'anph',innerHTML:'🎌'}))">`
          : `<div class="anph">🎌</div>`}
        <div class="anb">
          <div class="antitle">${escapeHtml(r.data.title)}</div>
          <div class="anmeta"><span>${escapeHtml(r.data.type ?? 'TV')} · ${r.data.episodes ?? '?'} eps</span><span class="anscore">⭐ ${r.data.score ?? 'N/A'}</span></div>
        </div>`;
    } else if (r.type === 'sports') {
      const comp = r.data.ev?.competitions?.[0];
      const [home, away] = comp?.competitors || [];
      const st = gameStatus(r.data.ev);
      const gId = r.data.ev.id;
      card = document.createElement('div');
      card.className = `sc ${st.cls === 'live' ? 'islive' : ''}`;
      card.onclick = () => nav('game', allSportsData.find(x => x.ev.id === gId));
      const hl = logoUrl(home?.team);
      const al = logoUrl(away?.team);
      card.innerHTML = `
        <div class="sc-lg"><span>${r.data.emoji} ${r.data.sport}</span>${st.cls === 'live' ? '<span style="color:var(--red);font-size:9px;font-weight:700"><span class="live-pulse-dot"></span>LIVE</span>' : ''}</div>
        <div class="sc-teams">
          <div class="sc-team"><div style="display:flex;align-items:center;gap:10px"><span>${home?.team?.shortDisplayName || home?.team?.abbreviation || 'Home'}</span><span class="pts">${home?.score ?? '—'}</span></div></div>
          <div class="sc-team"><div style="display:flex;align-items:center;gap:10px"><span>${away?.team?.shortDisplayName || away?.team?.abbreviation || 'Away'}</span><span class="pts">${away?.score ?? '—'}</span></div></div>
        </div>
        <div class="sc-st ${st.cls === 'live' ? 'lv' : ''}">${st.label}</div>`;
    } else if (r.type === 'dom') {
      card = r.element.cloneNode(true);
      card.style.display = '';
      card.style.opacity = '1';
    }

    if (card) {
      card.style.opacity = '0';
      card.style.transform = 'translateY(20px)';
      grid.appendChild(card);
      setTimeout(() => { card.style.opacity = '1'; card.style.transform = ''; }, 200 + i * 60);
    }
  });
}

function restoreFromCache() {
  // Restore sports data from cache if recent (within 5 minutes)
  try {
    const raw = sessionStorage.getItem('nzSportsData');
    const time = sessionStorage.getItem('nzSportsTime');
    if (raw && time && (Date.now() - parseInt(time)) < 300000) {
      const data = JSON.parse(raw);
      if (data?.length) {
        allSportsData = data;
        renderSports(data);
        return true;
      }
    }
  } catch (_) {}
  return false;
}

function restoreAnimeFromCache() {
  // Restore anime data from cache if recent (within 10 minutes)
  try {
    const raw = sessionStorage.getItem('nzAnimeData');
    const time = sessionStorage.getItem('nzAnimeTime');
    if (raw && time && (Date.now() - parseInt(time)) < 600000) {
      const items = JSON.parse(raw);
      if (items?.length) {
        allAnimeData = items;
        pill('pill-anime', 'ok', `Anime — ${items.length} airing (cached)`);
        pageHomeAnime = 1;
        pageAnimeGrid = 1;
        paintHomeAnime();
        paintAnimePageGrid();
        
        const stack = document.getElementById('heroStack');
        if (stack) {
          stack.innerHTML = items.slice(0, 3).map(a =>
            `<div class="stack-card" onclick="showAnimeDetailPage(${a.mal_id},true)">
              <div class="stag anime">Anime</div>
              <div class="stitle">${escapeHtml(a.title)}</div>
              <div class="stime">⭐ ${a.score ?? 'N/A'} · Ep ${a.episodes ?? '?'}</div>
            </div>`).join('');
        }
        return true;
      }
    }
  } catch (_) {}
  return false;
}

async function init() {
  const luEl = document.getElementById('lu');
  if (luEl) luEl.innerHTML = `<span class="spin"></span> Refreshing…`;

  // STEP 1: Restore from cache INSTANTLY (no waiting)
  const sportsCached = restoreFromCache();
  const animeCached = restoreAnimeFromCache();

  // If we have cached data, show it immediately and refresh in background
  if (sportsCached && animeCached) {
    if (luEl) luEl.textContent = `✅ Cached data shown · Refreshing…`;
    // Refresh in background after 3 seconds
    setTimeout(() => {
      initFresh();
    }, 3000);
    return;
  }

  // STEP 2: No cache — fetch fresh but with staggered loading
  initFresh();
}

async function initFresh() {
  const luEl = document.getElementById('lu');

  // Fetch sports and news in parallel (fastest APIs)
  const sportsPromise = Promise.allSettled([
    fetchNBA(),
    fetchEPL()
  ]).then(results => {
    const nba = results[0].status === 'fulfilled' ? results[0].value : [];
    const epl = results[1].status === 'fulfilled' ? results[1].value : [];
    return [...nba, ...epl];
  }).catch(() => []);

  const newsPromise = Promise.allSettled([
    fetchESPNNews('basketball/nba'),
    fetchESPNNews('soccer/eng.1')
  ]).then(results => {
    const n = results[0].status === 'fulfilled' ? results[0].value : [];
    const s = results[1].status === 'fulfilled' ? results[1].value : [];
    return mergeEspnNews(n, s);
  }).catch(() => []);

  // Wait for sports + news (anime loads separately, slower)
  const [sportsData, newsData] = await Promise.allSettled([
    sportsPromise,
    newsPromise
  ]);

  const sports = sportsData.status === 'fulfilled' ? sportsData.value : [];
  const news = newsData.status === 'fulfilled' ? newsData.value : [];

  // Render what we have immediately
  if (news.length) {
    allEspnNews = news;
    renderEspnNews(allEspnNews);
    setHeroFromNews(allEspnNews);
  } else {
    // Error boundary: ESPN news failed — show retry
    const newsEl = document.getElementById('espnNewsFeed');
    if (newsEl && !newsEl.dataset.errorShown) {
      newsEl.dataset.errorShown = '1';
      newsEl.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--m2);font-size:17px;">
        <div style="font-size:48px;margin-bottom:12px;opacity:.5">📡</div>
        Could not load ESPN headlines. This may be a network issue or API change.<br>
        <button onclick="this.parentElement.innerHTML='<div style=\\'padding:24px;color:var(--m)\\'>Refreshing…</div>';setTimeout(()=>location.reload(),500)" style="margin-top:16px;background:var(--red);color:#fff;border:none;border-radius:10px;padding:12px 28px;font-family:var(--fb);font-size:15px;font-weight:600;cursor:pointer;">🔄 Retry</button>
      </div>`;
    }
  }

  if (sports.length) {
    renderSports(sports);
  } else {
    // Error boundary: Sports API failed — show retry
    const grid = document.getElementById('scoresGrid');
    if (grid && !grid.dataset.errorShown) {
      grid.dataset.errorShown = '1';
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--m2);font-size:17px;">
        <div style="font-size:48px;margin-bottom:12px;opacity:.5">🏟️</div>
        Could not load live scores. ESPN may be unreachable.<br>
        <button onclick="this.parentElement.innerHTML='<div style=\\'padding:24px;color:var(--m)\\'>Refreshing…</div>';setTimeout(()=>location.reload(),500)" style="margin-top:16px;background:var(--red);color:#fff;border:none;border-radius:10px;padding:12px 28px;font-family:var(--fb);font-size:15px;font-weight:600;cursor:pointer;">🔄 Retry</button>
      </div>`;
    }
  }

  // Load anime in background (slowest API)
  setTimeout(() => {
    fetchAnime().catch(() => {
      // Error boundary: Anime API failed
      const grid = document.getElementById('animeGrid');
      if (grid && !grid.dataset.errorShown) {
        grid.dataset.errorShown = '1';
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--m2);font-size:17px;">
          <div style="font-size:48px;margin-bottom:12px;opacity:.5">🎌</div>
          Could not load anime data from Jikan/AniList.<br>
          <button onclick="this.parentElement.innerHTML='<div style=\\'padding:24px;color:var(--m)\\'>Refreshing…</div>';setTimeout(()=>location.reload(),500)" style="margin-top:16px;background:var(--red);color:#fff;border:none;border-radius:10px;padding:12px 28px;font-family:var(--fb);font-size:15px;font-weight:600;cursor:pointer;">🔄 Retry</button>
        </div>`;
      }
    });
    initAnimeGenreFilters().catch(() => {});
  }, 500);

  if (luEl) {
    const status = [];
    if (sports.length) status.push(`${sports.length} games`);
    if (news.length) status.push(`${news.length} headlines`);
    luEl.textContent = status.length
      ? `✅ ${status.join(' · ')} · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : `⚠️ APIs slow · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
}

// ════════════════════════════════════════
// READING PROGRESS BAR
// ════════════════════════════════════════
(function readingProgress() {
  const bar = document.getElementById('readingProgress');
  if (!bar) return;
  function update() {
    const articlePages = ['article', 'newsDetail', 'animeDetail', 'game'];
    if (!articlePages.includes(currentPage)) { bar.style.width = '0'; return; }
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    bar.style.width = pct + '%';
  }
  window.addEventListener('scroll', update, { passive: true });
  update();
})();

// ════════════════════════════════════════
// BACK TO TOP BUTTON
// ════════════════════════════════════════
(function backToTop() {
  const btn = document.getElementById('backToTop');
  if (!btn) return;
  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 400);
  }, { passive: true });
})();

// ════════════════════════════════════════
// COOKIE CONSENT (GDPR)
// ════════════════════════════════════════
function acceptCookies() {
  try { localStorage.setItem('nz-cookies', 'accepted'); } catch(_) {}
  const banner = document.getElementById('cookieBanner');
  if (banner) banner.classList.remove('visible');
}
function dismissCookies() {
  try { localStorage.setItem('nz-cookies', 'essential'); } catch(_) {}
  const banner = document.getElementById('cookieBanner');
  if (banner) banner.classList.remove('visible');
}
(function initCookieBanner() {
  try {
    if (localStorage.getItem('nz-cookies')) return;
  } catch(_) { return; }
  const banner = document.getElementById('cookieBanner');
  if (banner) {
    setTimeout(() => banner.classList.add('visible'), 1500);
  }
})();

// ════════════════════════════════════════
// PWA INSTALL PROMPT
// ════════════════════════════════════════
let pwaDeferredPrompt = null;
let liveVisitCount = 0;
(function initPWAInstall() {
  const banner = document.getElementById('pwaInstallBanner');
  const installBtn = document.getElementById('pwaInstallBtn');
  if (!banner || !installBtn) return;

  // Check if user already dismissed
  try { if (localStorage.getItem('nz-pwa-dismissed')) return; } catch(_) {}

  // Listen for beforeinstallprompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    pwaDeferredPrompt = e;
  });

  // Show banner after 30 seconds OR 2 Live section visits
  const showBanner = () => {
    if (!pwaDeferredPrompt) return;
    banner.classList.add('visible');
  };

  // 30-second timer
  setTimeout(showBanner, 30000);

  // Track Live section visits
  const origNav = window.nav;
  const _origNav = nav;
  // We'll track via the nav function's page parameter
})();

// Override nav to track Live visits for PWA prompt
(function trackLiveVisits() {
  const origNav = window.nav;
  window.nav = function(page, data) {
    if (page === 'live') {
      liveVisitCount++;
      if (liveVisitCount >= 2 && pwaDeferredPrompt) {
        try {
          if (!localStorage.getItem('nz-pwa-dismissed')) {
            const banner = document.getElementById('pwaInstallBanner');
            if (banner) banner.classList.add('visible');
          }
        } catch(_) {}
      }
    }
    return origNav(page, data);
  };
})();

function dismissPWA() {
  const banner = document.getElementById('pwaInstallBanner');
  if (banner) banner.classList.remove('visible');
  try { localStorage.setItem('nz-pwa-dismissed', '1'); } catch(_) {}
}

// Install button click handler
(function initPWAInstallBtn() {
  const installBtn = document.getElementById('pwaInstallBtn');
  if (!installBtn) return;
  installBtn.onclick = async () => {
    if (!pwaDeferredPrompt) return;
    pwaDeferredPrompt.prompt();
    const { outcome } = await pwaDeferredPrompt.userChoice;
    if (outcome === 'accepted') {
      const banner = document.getElementById('pwaInstallBanner');
      if (banner) banner.classList.remove('visible');
    }
    pwaDeferredPrompt = null;
  };
})();

// ════════════════════════════════════════
// DYNAMIC META DESCRIPTION
// ════════════════════════════════════════
function updateMeta(title, description) {
  document.title = title;
  let metaDesc = document.querySelector('meta[name="description"]');
  if (!metaDesc) {
    metaDesc = document.createElement('meta');
    metaDesc.name = 'description';
    document.head.appendChild(metaDesc);
  }
  metaDesc.content = description;
}

// ════════════════════════════════════════
// POLL OF THE DAY
// ════════════════════════════════════════
const NZ_POLLS = [
  {
    id: 'poll-nd-derby',
    question: 'Who wins the North London Derby?',
    options: ['Arsenal', 'Tottenham', 'Draw'],
    votes: [0, 0, 0]
  },
  {
    id: 'poll-mvp',
    question: 'NBA MVP this season?',
    options: ['Jokic', 'Giannis', 'Tatum', 'Luka'],
    votes: [0, 0, 0, 0]
  },
  {
    id: 'poll-anime',
    question: 'Best anime of the season?',
    options: ['Solo Leveling', 'Frieren', 'Demon Slayer', 'One Piece'],
    votes: [0, 0, 0, 0]
  }
];

function renderPollWidget(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Pick a poll based on the day
  const dayIndex = Math.floor(Date.now() / 86400000) % NZ_POLLS.length;
  const poll = NZ_POLLS[dayIndex];

  // Check if user already voted
  let votedOption = null;
  try { votedOption = parseInt(localStorage.getItem('nz-poll-' + poll.id)); } catch(_) {}

  if (votedOption !== null && !isNaN(votedOption)) {
    poll.votes[votedOption]++;
  }

  const total = poll.votes.reduce((a, b) => a + b, 0) || 1;

  container.innerHTML = `
    <div class="poll-widget">
      <h4>${poll.question}</h4>
      ${poll.options.map((opt, i) => {
        const pct = votedOption !== null ? Math.round((poll.votes[i] / total) * 100) : 0;
        return `<button class="poll-option${votedOption !== null ? ' voted' : ''}" data-poll="${poll.id}" data-index="${i}" onclick="votePoll('${poll.id}', ${i})">
          <div class="poll-bar" style="width:${votedOption !== null ? pct : 0}%"></div>
          <div class="poll-label">
            <span>${opt}</span>
            ${votedOption !== null ? `<span class="poll-pct">${pct}%</span>` : ''}
          </div>
        </button>`;
      }).join('')}
      ${votedOption !== null ? `<div class="poll-total">${total} votes</div>` : '<div class="poll-total">Tap to vote</div>'}
    </div>`;
}

function votePoll(pollId, optionIndex) {
  const key = 'nz-poll-' + pollId;
  try {
    if (localStorage.getItem(key)) return; // Already voted
    localStorage.setItem(key, optionIndex);
    // Track poll vote
    try { if (typeof gtag === 'function') gtag('event', 'poll_vote', { poll_id: pollId, option: optionIndex }); } catch(_) {}
  } catch(_) { return; }

  // Re-render all poll widgets
  document.querySelectorAll('.poll-widget').forEach(el => {
    const parent = el.parentElement;
    if (parent.id) renderPollWidget(parent.id);
  });
}

initNotifications();
setupLiveInteractions();
init();
setInterval(init, 90000);

// ════════════════════════════════════════
// PAUSE TICKER WHEN TAB IS HIDDEN
// ════════════════════════════════════════
(function pauseTickerOnHidden() {
  const tickerTrack = document.getElementById('tickerTrack');
  const scoresTrack = document.querySelector('.st');
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (tickerTrack) tickerTrack.style.animationPlayState = 'paused';
      if (scoresTrack) scoresTrack.style.animationPlayState = 'paused';
    } else {
      if (tickerTrack) tickerTrack.style.animationPlayState = 'running';
      if (scoresTrack) scoresTrack.style.animationPlayState = 'running';
    }
  });
})();

// ════════════════════════════════════════
// ADBLOCK DETECTION (Soft Wall → Hard Wall)
// ════════════════════════════════════════
let adblockDetected = false;
let adblockCheckInterval = null;
let adblockPageCount = 0;

function nzDetectAdblock() {
  return new Promise((resolve) => {
    const bait = document.createElement('div');
    bait.innerHTML = '&nbsp;';
    bait.className = 'adsbox ad-banner ad-content textads banner-ads banner ad-zone adspace';
    bait.style.cssText = 'width:1px;height:1px;position:absolute;left:-9999px;top:-9999px;';
    document.body.appendChild(bait);

    setTimeout(() => {
      const baitBlocked = bait.offsetHeight === 0 ||
                          bait.clientHeight === 0 ||
                          window.getComputedStyle(bait).display === 'none' ||
                          window.getComputedStyle(bait).visibility === 'hidden' ||
                          bait.style.display === 'none' ||
                          !document.body.contains(bait);

      if (document.body.contains(bait)) bait.remove();

      const adSenseBlocked = typeof window.adsbygoogle === 'undefined' &&
                             document.querySelector('script[src*="googlesyndication"]') !== null;

      resolve(baitBlocked || adSenseBlocked);
    }, 200);
  });
}

// Soft wall: show dismissible banner first
function showAdblockBanner() {
  adblockDetected = true;
  const banner = document.getElementById('adblockBanner');
  if (banner) banner.classList.add('visible');
}

// Hard wall: full overlay after 3+ page views with adblocker
function showAdblockOverlay() {
  adblockDetected = true;
  const overlay = document.getElementById('adblockOverlay');
  if (overlay) {
    overlay.style.display = 'flex';
    overlay.setAttribute('aria-hidden', 'false');
  }
  document.body.style.overflow = 'hidden';
  document.body.style.position = 'fixed';
  document.body.style.width = '100%';
  document.body.style.height = '100%';
  document.body.style.touchAction = 'none';
}

async function nzCheckAdblock() {
  const isBlocked = await nzDetectAdblock();

  if (isBlocked) {
    try { adblockPageCount = parseInt(localStorage.getItem('nz-adblock-pages') || '0'); } catch(_) {}
    adblockPageCount++;
    try { localStorage.setItem('nz-adblock-pages', adblockPageCount); } catch(_) {}

    if (adblockPageCount >= 3) {
      showAdblockOverlay();
    } else {
      showAdblockBanner();
    }

    if (adblockCheckInterval) clearInterval(adblockCheckInterval);
    adblockCheckInterval = setInterval(async () => {
      const stillBlocked = await nzDetectAdblock();
      if (!stillBlocked) nzRemoveAdblockOverlay();
    }, 5000);
  } else {
    nzRemoveAdblockOverlay();
  }
}

function dismissAdblockBanner() {
  const banner = document.getElementById('adblockBanner');
  if (banner) banner.classList.remove('visible');
}

function nzRemoveAdblockOverlay() {
  const overlay = document.getElementById('adblockOverlay');
  if (overlay) {
    overlay.style.display = 'none';
    overlay.setAttribute('aria-hidden', 'true');
  }
  const banner = document.getElementById('adblockBanner');
  if (banner) banner.classList.remove('visible');
  adblockDetected = false;
  adblockPageCount = 0;
  try { localStorage.removeItem('nz-adblock-pages'); } catch(_) {}
  document.body.style.overflow = '';
  document.body.style.position = '';
  document.body.style.width = '';
  document.body.style.height = '';
  document.body.style.touchAction = '';
  if (adblockCheckInterval) {
    clearInterval(adblockCheckInterval);
    adblockCheckInterval = null;
  }
}

// Run adblock check on page load
window.addEventListener('load', () => {
  setTimeout(nzCheckAdblock, 1000);
});

// Prevent bypass via keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (adblockDetected) {
    // Block F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U
    if (e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J')) ||
        (e.ctrlKey && e.key === 'U')) {
      e.preventDefault();
      return false;
    }
  }
});

// Prevent right-click when adblock is active
document.addEventListener('contextmenu', (e) => {
  if (adblockDetected) {
    e.preventDefault();
    return false;
  }
});

window.addEventListener('resize', () => {
  if (window.innerWidth > 900) {
    const mMenu = document.getElementById('mMenu');
    if (mMenu) mMenu.classList.remove('open');
  }
});
