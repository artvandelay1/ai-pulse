import type { Category } from "./types.ts";

/** Channel order is fixed everywhere: filter chips, ribbon legend, row codes. */
export const CHANNELS: Category[] = ["reddit", "hackernews", "papers", "blogs", "github"];

export const CHANNEL_LABEL: Record<Category, string> = {
  reddit: "Reddit",
  hackernews: "Hacker News",
  papers: "Papers",
  blogs: "Blogs",
  github: "GitHub",
};

/**
 * Gutter codes use each source's own shorthand where one exists ("HN", "ARX")
 * rather than an invented three-letter scheme.
 */
export const CHANNEL_CODE: Record<Category, string> = {
  reddit: "RDT",
  hackernews: "HN",
  papers: "ARX",
  blogs: "BLG",
  github: "GH",
};

/** Read as a CSS value so ribbon stacks and row spines can be built inline. */
export const CHANNEL_COLOR: Record<Category, string> = {
  reddit: "var(--ch-reddit)",
  hackernews: "var(--ch-hackernews)",
  papers: "var(--ch-papers)",
  blogs: "var(--ch-blogs)",
  github: "var(--ch-github)",
};

/** What a score means differs per channel; the glyph says which. */
export const CHANNEL_UNIT: Record<Category, string> = {
  reddit: "▲",
  hackernews: "▲",
  papers: "",
  blogs: "",
  github: "★",
};
