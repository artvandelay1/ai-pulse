import type { NewsItem, SourceResult } from "../types.ts";
import { errorMessage, fetchWithTimeout } from "../util.ts";

const ENDPOINT = "https://hn.algolia.com/api/v1/search";
const QUERIES = ["AI", "LLM"];

interface AlgoliaHit {
  objectID: string;
  title: string;
  url: string | null;
  points: number;
  created_at: string;
}

export async function fetchHackerNews(): Promise<SourceResult> {
  const base = { category: "hackernews" as const, label: "Hacker News" };
  try {
    // Limit to the past week so the front page stays fresh, not all-time hits.
    const weekAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
    const perQuery = await Promise.all(
      QUERIES.map(async (query) => {
        const params = new URLSearchParams({
          query,
          tags: "story",
          numericFilters: `points>50,created_at_i>${weekAgo}`,
          hitsPerPage: "20",
        });
        const res = await fetchWithTimeout(`${ENDPOINT}?${params}`);
        if (!res.ok) throw new Error(`HN Algolia responded ${res.status}`);
        const data = (await res.json()) as { hits: AlgoliaHit[] };
        return data.hits;
      })
    );

    const seen = new Set<string>();
    const items: NewsItem[] = [];
    for (const hit of perQuery.flat()) {
      if (!hit.title || seen.has(hit.objectID)) continue;
      seen.add(hit.objectID);
      items.push({
        title: hit.title,
        url: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
        source: "Hacker News",
        score: hit.points ?? 0,
        publishedAt: hit.created_at,
        category: "hackernews",
      });
    }
    return { ...base, ok: true, items };
  } catch (err) {
    return { ...base, ok: false, error: errorMessage(err), items: [] };
  }
}
