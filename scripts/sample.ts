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
  for (const item of result.items.slice(0, 5)) {
    console.log(`  [${item.score}] ${item.title.slice(0, 90)}`);
    console.log(`      ${item.source} | ${item.publishedAt} | ${item.url.slice(0, 100)}`);
  }
}

const which = process.argv[2] ?? "all";
await load();
const picked = which === "all" ? Object.values(fetchers) : [fetchers[which]];
if (picked[0] === undefined) {
  console.error(`Unknown source "${which}". Available: ${Object.keys(fetchers).join(", ")}`);
  process.exit(1);
}
for (const result of await Promise.all(picked.map((fn) => fn()))) show(result);
