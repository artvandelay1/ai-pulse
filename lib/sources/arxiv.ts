import Parser from "rss-parser";
import type { NewsItem, SourceResult } from "../types.ts";
import { errorMessage, fetchWithTimeout } from "../util.ts";

const QUERY_URL =
  "https://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.LG&sortBy=submittedDate&sortOrder=descending&max_results=10";

export async function fetchArxiv(): Promise<SourceResult> {
  const base = { category: "papers" as const, label: "arXiv" };
  try {
    const res = await fetchWithTimeout(QUERY_URL, undefined, 15000);
    if (!res.ok) throw new Error(`arXiv API responded ${res.status}`);
    const feed = await new Parser().parseString(await res.text());
    const items: NewsItem[] = feed.items
      .filter((item) => item.title && item.link)
      .map((item) => ({
        // arXiv titles arrive with hard line breaks; collapse the whitespace.
        title: item.title!.replace(/\s+/g, " ").trim(),
        url: item.link!,
        source: "arXiv",
        score: 0,
        publishedAt: item.isoDate ?? new Date().toISOString(),
        category: "papers" as const,
      }));
    return { ...base, ok: true, items };
  } catch (err) {
    return { ...base, ok: false, error: errorMessage(err), items: [] };
  }
}
