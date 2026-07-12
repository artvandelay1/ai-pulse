// Live-test one or all source fetchers from the command line:
//   node scripts/sample.ts hackernews
//   node scripts/sample.ts all
import type { SourceResult } from "../lib/types.ts";

const fetchers: Record<string, () => Promise<SourceResult>> = {};

async function load() {
  const { fetchHackerNews } = await import("../lib/sources/hackernews.ts");
  fetchers.hackernews = fetchHackerNews;
  try {
    const { fetchReddit } = await import("../lib/sources/reddit.ts");
    fetchers.reddit = fetchReddit;
    const { fetchArxiv } = await import("../lib/sources/arxiv.ts");
    fetchers.arxiv = fetchArxiv;
    const { fetchBlogs } = await import("../lib/sources/blogs.ts");
    fetchers.blogs = fetchBlogs;
    const { fetchGithub } = await import("../lib/sources/github.ts");
    fetchers.github = fetchGithub;
  } catch {
    // Sources not written yet; only test what exists.
  }
}

function show(result: SourceResult) {
  console.log(`\n=== ${result.label} (${result.category}) ok=${result.ok} items=${result.items.length}${result.error ? ` error=${result.error}` : ""}`);
  const withThumbs = result.items.filter((item) => item.thumbnail).length;
  console.log(`  thumbnails: ${withThumbs}/${result.items.length}`);
  for (const item of result.items.slice(0, 5)) {
    console.log(`  [${item.score}]${item.thumbnail ? " [img]" : ""} ${item.title.slice(0, 90)}`);
    console.log(`      ${item.source} | ${item.publishedAt} | ${item.url.slice(0, 100)}`);
  }
}

const which = process.argv[2] ?? "all";
await load();
if (which === "all") {
  // Full pipeline, including og:image thumbnail scraping.
  const { fetchAllSources } = await import("../lib/sources/index.ts");
  for (const result of await fetchAllSources()) show(result);
} else {
  const fetcher = fetchers[which];
  if (!fetcher) {
    console.error(`Unknown source "${which}". Available: ${Object.keys(fetchers).join(", ")}`);
    process.exit(1);
  }
  show(await fetcher());
}
