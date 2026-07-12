import Parser from "rss-parser";
import type { NewsItem, SourceResult } from "../types.ts";
import { errorMessage } from "../util.ts";

const PER_FEED_LIMIT = 5;

// Feed URLs verified live 2026-07-12. Anthropic publishes no official RSS
// feed, so we use the community mirror (Olshansk/rss-feeds, rebuilt daily
// from anthropic.com/news). Meta retired ai.meta.com/blog/rss/; the Meta
// Engineering AI Research category feed is the official replacement.
const FEEDS: { name: string; url: string }[] = [
  { name: "OpenAI", url: "https://openai.com/news/rss.xml" },
  { name: "Anthropic", url: "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_news.xml" },
  { name: "Google DeepMind", url: "https://deepmind.google/blog/rss.xml" },
  { name: "Meta AI", url: "https://engineering.fb.com/category/ai-research/feed/" },
  { name: "Hugging Face", url: "https://huggingface.co/blog/feed.xml" },
];

export async function fetchBlogs(): Promise<SourceResult> {
  const base = { category: "blogs" as const, label: "Company blogs" };
  const parser = new Parser({ timeout: 10000, headers: { "User-Agent": "ai-pulse/1.0" } });

  const settled = await Promise.allSettled(
    FEEDS.map(async ({ name, url }) => {
      const feed = await parser.parseURL(url);
      return feed.items.slice(0, PER_FEED_LIMIT).flatMap((item): NewsItem[] =>
        item.title && item.link
          ? [{
              title: item.title.trim(),
              url: item.link,
              source: name,
              score: 0,
              publishedAt: item.isoDate ?? item.pubDate ?? new Date().toISOString(),
              category: "blogs",
            }]
          : []
      );
    })
  );

  const items = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  if (items.length === 0) {
    const firstError = settled.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    return { ...base, ok: false, error: errorMessage(firstError?.reason ?? "all feeds empty"), items: [] };
  }
  // One dead feed shouldn't fail the whole source; ok as long as any feed loaded.
  return { ...base, ok: true, items };
}
