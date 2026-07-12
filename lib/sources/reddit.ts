import Parser from "rss-parser";
import type { NewsItem, SourceResult } from "../types.ts";
import { errorMessage, fetchWithTimeout } from "../util.ts";

const SUBREDDITS = "artificial+MachineLearning+LocalLLaMA+singularity";
const JSON_URL = `https://www.reddit.com/r/${SUBREDDITS}/top.json?t=day&limit=15`;
const RSS_URL = `https://www.reddit.com/r/${SUBREDDITS}/top.rss?t=day&limit=15`;
const USER_AGENT = "web:ai-pulse:v1.0 (news aggregator)";

interface RedditPost {
  data: {
    title: string;
    permalink: string;
    url: string;
    subreddit: string;
    score: number;
    created_utc: number;
    is_self: boolean;
  };
}

async function fromJson(): Promise<NewsItem[]> {
  const res = await fetchWithTimeout(JSON_URL, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Reddit JSON responded ${res.status}`);
  const data = (await res.json()) as { data: { children: RedditPost[] } };
  return data.data.children.map(({ data: post }) => ({
    title: post.title,
    // Link posts go to the linked content, self posts to the discussion.
    url: post.is_self || !post.url ? `https://www.reddit.com${post.permalink}` : post.url,
    source: `r/${post.subreddit}`,
    score: post.score ?? 0,
    publishedAt: new Date(post.created_utc * 1000).toISOString(),
    category: "reddit" as const,
  }));
}

// Reddit 403s the .json endpoints from some networks (notably datacenter IPs)
// while still serving the .rss feed; fall back to it. RSS carries no vote
// counts, so those items get score 0.
async function fromRss(): Promise<NewsItem[]> {
  const res = await fetchWithTimeout(RSS_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Reddit RSS responded ${res.status}`);
  const feed = await new Parser().parseString(await res.text());
  return feed.items.slice(0, 15).map((item) => ({
    title: item.title ?? "(untitled)",
    url: item.link ?? "",
    source: item.link?.match(/\/r\/([^/]+)\//)?.[1] ? `r/${item.link.match(/\/r\/([^/]+)\//)![1]}` : "Reddit",
    score: 0,
    publishedAt: item.isoDate ?? new Date().toISOString(),
    category: "reddit" as const,
  }));
}

export async function fetchReddit(): Promise<SourceResult> {
  const base = { category: "reddit" as const, label: "Reddit" };
  try {
    const items = await fromJson().catch(() => fromRss());
    return { ...base, ok: true, items: items.filter((item) => item.url) };
  } catch (err) {
    return { ...base, ok: false, error: errorMessage(err), items: [] };
  }
}
