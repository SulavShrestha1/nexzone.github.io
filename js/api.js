/**
 * NexZone — external API helpers (ESPN, Jikan, AniList)
 */
(function (global) {
  const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';

  global.fetchESPNNews = async function fetchESPNNews(leaguePath, limit = 30) {
    const r = await fetch(`${ESPN}/${leaguePath}/news?limit=${limit}`);
    if (!r.ok) throw new Error('news');
    const d = await r.json();
    return d.articles || [];
  };

  global.fetchGameSummary = async function fetchGameSummary(leaguePath, eventId) {
    const r = await fetch(`${ESPN}/${leaguePath}/summary?event=${encodeURIComponent(eventId)}`);
    if (!r.ok) return null;
    return r.json();
  };

  global.fetchJikanAnimeFull = async function fetchJikanAnimeFull(malId) {
    const r = await fetch(`https://api.jikan.moe/v4/anime/${malId}/full`);
    if (!r.ok) return null;
    return r.json();
  };

  global.fetchJikanEpisodes = async function fetchJikanEpisodes(malId, page = 1) {
    const r = await fetch(`https://api.jikan.moe/v4/anime/${malId}/episodes?page=${page}`);
    if (!r.ok) return null;
    return r.json();
  };

  global.fetchJikanGenres = async function fetchJikanGenres() {
    const r = await fetch('https://api.jikan.moe/v4/genres/anime');
    if (!r.ok) return [];
    const d = await r.json();
    return d.data || [];
  };

  global.fetchJikanAnimeList = async function fetchJikanAnimeList(params) {
    const q = new URLSearchParams();
    if (params.genres) q.set('genres', params.genres);
    if (params.status) q.set('status', params.status);
    if (params.order_by) q.set('order_by', params.order_by);
    q.set('limit', String(params.limit || 25));
    const r = await fetch(`https://api.jikan.moe/v4/anime?${q.toString()}`);
    if (!r.ok) return null;
    return r.json();
  };

  global.fetchTopAiringAnime = async function fetchTopAiringAnime(limit = 25) {
    const r = await fetch(`https://api.jikan.moe/v4/top/anime?limit=${limit}&filter=airing`);
    if (!r.ok) return null;
    return r.json();
  };

  /**
   * AniList GraphQL — episode counts, next airing, streaming episode titles, HD art
   */
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
    const r = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables: { id: malId } })
    });
    if (!r.ok) return null;
    const d = await r.json();
    if (d.errors) return null;
    return d.data?.Media || null;
  };
})(typeof window !== 'undefined' ? window : globalThis);
