// Fetch Reddit and write a snapshot JSON for the data branch. Run by the
// reddit-snapshot GitHub Action (Reddit blocks Vercel's IPs but serves RSS
// to GitHub runners) — see .github/workflows/reddit-snapshot.yml.
//   node scripts/snapshot-reddit.ts <output-path>
import { writeFileSync } from "node:fs";
import { fetchReddit } from "../lib/sources/reddit.ts";

const out = process.argv[2] ?? "reddit-snapshot.json";
const result = await fetchReddit();
if (!result.ok || result.items.length === 0) {
  console.error(`Reddit fetch failed (${result.error ?? "no items"}); keeping previous snapshot.`);
  process.exit(1);
}
writeFileSync(out, JSON.stringify({ fetchedAt: new Date().toISOString(), result }, null, 2));
console.log(`Wrote ${result.items.length} items to ${out}`);
