// Write a Reddit snapshot JSON for the data branch. Run by the
// reddit-snapshot GitHub Action — see .github/workflows/reddit-snapshot.yml.
//
//   node scripts/snapshot-reddit.ts <output-path> [rss-xml-dir] [prev-snapshot]
//
// With a directory of per-subreddit RSS XML files, only parses them (the
// workflow fetches via curl: Reddit's WAF 403s Node's fetch from datacenter
// IPs but tolerates curl). Without one, fetches Reddit directly. If a
// previous snapshot is given, subreddits missing from this run (usually
// rate-limited) keep their items from it.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { NewsItem, SourceResult } from "../lib/types.ts";
import { fetchReddit, parseRedditRss, SUBREDDIT_LIST } from "../lib/sources/reddit.ts";

const out = process.argv[2] ?? "reddit-snapshot.json";
const xmlDir = process.argv[3];
const prevPath = process.argv[4];

let result: SourceResult;
if (xmlDir) {
  const files = readdirSync(xmlDir).filter((name) => name.endsWith(".xml"));
  const parsed = await Promise.all(
    files.map((name) => parseRedditRss(readFileSync(join(xmlDir, name), "utf8")).catch(() => []))
  );
  result = { category: "reddit", label: "Reddit", ok: true, items: parsed.flat() };

  if (prevPath && existsSync(prevPath)) {
    try {
      const prev = JSON.parse(readFileSync(prevPath, "utf8")) as { result: SourceResult };
      const fetched = new Set(result.items.map((item) => item.source.toLowerCase()));
      const carried: NewsItem[] = prev.result.items.filter(
        (item) =>
          !fetched.has(item.source.toLowerCase()) &&
          SUBREDDIT_LIST.some((sub) => item.source.toLowerCase() === `r/${sub.toLowerCase()}`)
      );
      if (carried.length > 0) {
        console.log(`Carrying over ${carried.length} items for missing subreddits from previous snapshot.`);
        result.items.push(...carried);
      }
    } catch {
      // Unreadable previous snapshot; proceed with what this run fetched.
    }
  }
} else {
  result = await fetchReddit();
}

if (!result.ok || result.items.length === 0) {
  console.error(`Reddit fetch failed (${result.error ?? "no items"}); keeping previous snapshot.`);
  process.exit(1);
}
writeFileSync(out, JSON.stringify({ fetchedAt: new Date().toISOString(), result }, null, 2));
console.log(`Wrote ${result.items.length} items to ${out}`);
