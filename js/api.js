/**
 * NexZone — external API helpers with multi-layer fallbacks
 * Primary: ESPN, Jikan, AniList
 * Fallback: BallDontLie, TheSportsDB, Kitsu, ANN
 */
(function (global) {
  const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';
  const FETCH_TIMEOUT = 8000;

  // Fetch with timeout
  async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);
      return response;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  }

  // ════════════════════════════════════════
  // ESPN (Primary Sports)
  // ════════════════════════════════════════
  global.fetchESPNNews = async function fetchESPNNews(leaguePath, limit = 30) {
    const r = await fetchWithTimeout(`${ESPN}/${leaguePath}/news?limit=${limit}`);
    if (!r.ok) throw new Error('news');
    const d = await r.json();
    return d.articles || [];
  };

  global.fetchGameSummary = async function fetchGameSummary(leaguePath, eventId) {
    try {
      const r = await fetchWithTimeout(`${ESPN}/${leaguePath}/summary?event=${encodeURIComponent(eventId)}`);
      if (!r.ok) return null;
      return r.json();
    } catch { return null; }
  };

  // ════════════════════════════════════════
  // BallDontLie (NBA Fallback)
  // ════════════════════════════════════════
  global.fetchBallDontLieGames = async function fetchBallDontLieGames() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const r = await fetchWithTimeout(`https://www.balldontlie.io/api/v1/games?dates[]=${today}&per_page=25`);
      if (!r.ok) return [];
      const d = await r.json();
      return (d.data || []).map(g => ({
        id: String(g.id),
        home_team: g.home_team?.abbreviation || g.home_team?.name || 'Home',
        visitor_team: g.visitor_team?.abbreviation || g.visitor_team?.name || 'Away',
        home_team_score: g.home_team_score ?? 0,
        visitor_team_score: g.visitor_team_score ?? 0,
        status: g.status || 'Final',
        period: g.period
      }));
    } catch { return []; }
  };

  // ════════════════════════════════════════
  // TheSportsDB (Multi-Sport Fallback)
  // ════════════════════════════════════════
  global.fetchTheSportsDB = async function fetchTheSportsDB(league) {
    const leagues = {
      epl: 'English Premier League',
      nba: 'NBA',
      nfl: 'NFL',
      mlb: 'MLB',
      nhl: 'NHL'
    };
    try {
      const r = await fetchWithTimeout(`https://www.thesportsdb.com/api/v1/json/3/eventspastleague.php?id=${encodeURIComponent(leagues[league] || league)}`);
      if (!r.ok) return [];
      const d = await r.json();
      return d.events || [];
    } catch { return []; }
  };

  // ════════════════════════════════════════
  // Jikan (Primary Anime)
  // ════════════════════════════════════════
  global.fetchJikanAnimeFull = async function fetchJikanAnimeFull(malId) {
    try {
      const r = await fetchWithTimeout(`https://api.jikan.moe/v4/anime/${malId}/full`);
      if (!r.ok) return null;
      return r.json();
    } catch { return null; }
  };

  global.fetchJikanEpisodes = async function fetchJikanEpisodes(malId, page = 1) {
    try {
      const r = await fetchWithTimeout(`https://api.jikan.moe/v4/anime/${malId}/episodes?page=${page}`);
      if (!r.ok) return null;
      return r.json();
    } catch { return null; }
  };

  global.fetchJikanEpisodesAll = async function fetchJikanEpisodesAll(malId, maxPages = 10) {
    let page = 1;
    const all = [];
    while (page <= maxPages) {
      try {
        const r = await fetchWithTimeout(`https://api.jikan.moe/v4/anime/${malId}/episodes?page=${page}`);
        if (!r.ok) break;
        const d = await r.json();
        const chunk = d.data || [];
        all.push(...chunk);
        if (!d.pagination?.has_next_page) break;
        page += 1;
        await new Promise(res => setTimeout(res, 400));
      } catch { break; }
    }
    return all;
  };

  global.fetchJikanGenres = async function fetchJikanGenres() {
    try {
      const r = await fetchWithTimeout('https://api.jikan.moe/v4/genres/anime');
      if (!r.ok) return [];
      const d = await r.json();
      return d.data || [];
    } catch { return []; }
  };

  global.fetchJikanAnimeList = async function fetchJikanAnimeList(params) {
    const q = new URLSearchParams();
    if (params.genres) q.set('genres', params.genres);
    if (params.status) q.set('status', params.status);
    if (params.order_by) q.set('order_by', params.order_by);
    q.set('limit', String(params.limit || 25));
    try {
      const r = await fetchWithTimeout(`https://api.jikan.moe/v4/anime?${q.toString()}`);
      if (!r.ok) return null;
      return r.json();
    } catch { return null; }
  };

  global.fetchTopAiringAnime = async function fetchTopAiringAnime(limit = 25) {
    try {
      const r = await fetchWithTimeout(`https://api.jikan.moe/v4/top/anime?limit=${limit}&filter=airing`);
      if (!r.ok) return null;
      return r.json();
    } catch { return null; }
  };

  // ════════════════════════════════════════
  // Kitsu (Anime Fallback)
  // ════════════════════════════════════════
  global.fetchKitsuTopAnime = async function fetchKitsuTopAnime(limit = 25) {
    try {
      const r = await fetchWithTimeout(`https://kitsu.io/api/edge/anime?sort=-ratingRank&page[limit]=${limit}&filter[status]=current`);
      if (!r.ok) return [];
      const d = await r.json();
      return (d.data || []).map(a => ({
        mal_id: a.id,
        title: a.attributes?.titles?.en || a.attributes?.canonicalTitle || 'Unknown',
        score: a.attributes?.averageRating ? parseFloat(a.attributes.averageRating) / 10 : null,
        episodes: a.attributes?.episodeCount,
        type: a.attributes?.subtype || 'TV',
        image_url: a.attributes?.posterImage?.medium || '',
        url: `https://kitsu.io/anime/${a.attributes?.slug}`
      }));
    } catch { return []; }
  };

  // ════════════════════════════════════════
  // AnimeNewsNetwork (Anime News Fallback)
  // ════════════════════════════════════════
  global.fetchANNNews = async function fetchANNNews(limit = 10) {
    try {
      const r = await fetchWithTimeout(`https://cdn.animenewnetwork.com/encyc/api.xml?anime-news&limit=${limit}`);
      if (!r.ok) return [];
      const text = await r.text();
      // Simple XML parsing for titles
      const titles = text.match(/<title>(.*?)<\/title>/g) || [];
      return titles.slice(1, limit + 1).map(t => ({
        headline: t.replace(/<\/?title>/g, ''),
        description: '',
        published: new Date().toISOString(),
        category: { description: 'ANN' }
      }));
    } catch { return []; }
  };

  // ════════════════════════════════════════
  // AniList GraphQL
  // ════════════════════════════════════════
  global.fetchAniListByMalId = async function fetchAniListByMalId(malId) {
    const query = `query($id: Int) {
      Media(idMal: $id, type: ANIME) {
        id
        episodes
        duration
        nextAiringEpisode { episode airingAt timeUntilAiring }
        bannerImage
        coverImage { large extraLarge }
        streamingEpisodes { title url thumbnail }
        title { romaji english native }
        status
      }
    }`;
    try {
      const r = await fetchWithTimeout('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables: { id: malId } })
      });
      if (!r.ok) return null;
      const d = await r.json();
      if (d.errors) return null;
      return d.data?.Media || null;
    } catch { return null; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
