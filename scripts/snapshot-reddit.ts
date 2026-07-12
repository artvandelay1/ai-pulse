// Write a Reddit snapshot JSON for the data branch. Run by the
// reddit-snapshot GitHub Action — see .github/workflows/reddit-snapshot.yml.
//
//   node scripts/snapshot-reddit.ts <output-path> [rss-xml-dir]
//
// With a directory of per-subreddit RSS XML files, only parses them (the
// workflow fetches via curl: Reddit's WAF 403s Node's fetch from datacenter
// IPs but tolerates curl). Without one, fetches Reddit directly.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SourceResult } from "../lib/types.ts";
import { fetchReddit, parseRedditRss } from "../lib/sources/reddit.ts";

const out = process.argv[2] ?? "reddit-snapshot.json";
const xmlDir = process.argv[3];

let result: SourceResult;
if (xmlDir) {
  const files = readdirSync(xmlDir).filter((name) => name.endsWith(".xml"));
  const parsed = await Promise.all(
    files.map((name) => parseRedditRss(readFileSync(join(xmlDir, name), "utf8")).catch(() => []))
  );
  result = { category: "reddit", label: "Reddit", ok: true, items: parsed.flat() };
} else {
  result = await fetchReddit();
}

if (!result.ok || result.items.length === 0) {
  console.error(`Reddit fetch failed (${result.error ?? "no items"}); keeping previous snapshot.`);
  process.exit(1);
}
writeFileSync(out, JSON.stringify({ fetchedAt: new Date().toISOString(), result }, null, 2));
console.log(`Wrote ${result.items.length} items to ${out}`);
