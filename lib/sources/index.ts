import type { SourceResult } from "../types.ts";
import { addOgThumbnails } from "../og-image.ts";
import { fetchHackerNews } from "./hackernews.ts";
import { fetchReddit } from "./reddit.ts";
import { fetchArxiv } from "./arxiv.ts";
import { fetchBlogs } from "./blogs.ts";
import { fetchGithub } from "./github.ts";

const FETCHERS = [fetchReddit, fetchHackerNews, fetchArxiv, fetchBlogs, fetchGithub];

/**
 * Fetch every source in parallel. Individual fetchers catch their own
 * errors and return ok:false; allSettled is a second line of defense so
 * one source can never take down the page.
 */
export async function fetchAllSources(): Promise<SourceResult[]> {
  const settled = await Promise.allSettled(FETCHERS.map((fetcher) => fetcher()));
  const sources = settled.map((result, i) =>
    result.status === "fulfilled"
      ? result.value
      : {
          category: ["reddit", "hackernews", "papers", "blogs", "github"][i] as SourceResult["category"],
          label: ["Reddit", "Hacker News", "arXiv", "Company blogs", "GitHub"][i],
          ok: false,
          error: String(result.reason),
          items: [],
        }
  );

  // HN and blog items only carry links; scrape their pages' og:image tags.
  // Reddit/GitHub thumbnails come from their APIs, arXiv stays text-only.
  await addOgThumbnails(
    sources
      .filter((source) => source.category === "hackernews" || source.category === "blogs")
      .flatMap((source) => source.items)
  );
  return sources;
}
