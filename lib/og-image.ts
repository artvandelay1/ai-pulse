import type { NewsItem } from "./types.ts";
import { fetchWithTimeout } from "./util.ts";

const CONCURRENCY = 10;
const TIMEOUT_MS = 4000;

const META_TAG =
  /<meta[^>]+(?:property|name)=["'](?:og:image(?::url)?|twitter:image(?::src)?)["'][^>]*>/i;
const CONTENT_ATTR = /content=["']([^"']+)["']/i;

// Attribute values arrive HTML-entity-encoded; a mangled &amp; in a query
// string breaks CDN signature params.
function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** Best-effort og:image / twitter:image lookup for one page. */
async function scrapeOgImage(pageUrl: string): Promise<string | undefined> {
  try {
    const res = await fetchWithTimeout(
      pageUrl,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ai-pulse/1.0; +https://github.com/artvandelay1/ai-pulse)",
          Accept: "text/html",
        },
      },
      TIMEOUT_MS
    );
    if (!res.ok || !res.headers.get("content-type")?.includes("html")) return undefined;
    // og:image lives in <head>; the first chunk of the document is enough.
    const html = (await res.text()).slice(0, 100_000);
    const content = html.match(META_TAG)?.[0].match(CONTENT_ATTR)?.[1];
    if (!content) return undefined;
    const resolved = new URL(decodeEntities(content), pageUrl).href;
    return resolved.startsWith("http") ? resolved : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Fill in item.thumbnail by scraping each item's page, a few at a time.
 * Mutates and returns the array; failures just leave thumbnail unset.
 */
export async function addOgThumbnails(items: NewsItem[]): Promise<NewsItem[]> {
  const queue = items.filter((item) => !item.thumbnail);
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let item = queue.pop(); item; item = queue.pop()) {
        item.thumbnail = await scrapeOgImage(item.url);
      }
    })
  );
  return items;
}
