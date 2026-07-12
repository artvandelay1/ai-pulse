export type Category = "reddit" | "hackernews" | "papers" | "blogs" | "github";

export interface NewsItem {
  title: string;
  url: string;
  /** Display label, e.g. "Hacker News", "r/LocalLLaMA", "OpenAI" */
  source: string;
  score: number;
  /** ISO 8601 timestamp */
  publishedAt: string;
  category: Category;
  /** Absolute image URL, if the source provides one or og:image scraping found one */
  thumbnail?: string;
  /** 1-based position in the source's own "top" ordering; shown when no score is available */
  rank?: number;
}

export interface SourceResult {
  category: Category;
  /** Human-readable name shown in the "unavailable" note if the fetch fails */
  label: string;
  ok: boolean;
  error?: string;
  items: NewsItem[];
}
