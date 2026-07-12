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
    thumbnail?: string;
    preview?: { images?: { source?: { url?: string } }[] };
  };
}

// data.thumbnail holds sentinel words ("self", "default", "nsfw") for posts
// without one; prefer the full-size preview image, which is HTML-escaped.
function postThumbnail(post: RedditPost["data"]): string | undefined {
  const preview = post.preview?.images?.[0]?.source?.url?.replace(/&amp;/g, "&");
  if (preview?.startsWith("http")) return preview;
  return post.thumbnail?.startsWith("http") ? post.thumbnail : undefined;
}

// Application-only OAuth: reddit.com 403s plain requests from datacenter
// IPs (i.e. Vercel), but oauth.reddit.com with an app token works anywhere
// and returns full post data including scores. Needs REDDIT_CLIENT_ID and
// REDDIT_CLIENT_SECRET from a (free) app at reddit.com/prefs/apps.
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAppToken(): Promise<string | null> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.token;
  const res = await fetchWithTimeout("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Reddit token endpoint responded ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

async function fromJson(url = JSON_URL, headers: Record<string, string> = {}): Promise<NewsItem[]> {
  const res = await fetchWithTimeout(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...headers },
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
    thumbnail: postThumbnail(post),
  }));
}

// Reddit 403s the .json endpoints from some networks (notably datacenter IPs)
// while still serving the .rss feed; fall back to it. RSS carries no vote
// counts, so those items get score 0.
async function fromRss(): Promise<NewsItem[]> {
  const res = await fetchWithTimeout(RSS_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Reddit RSS responded ${res.status}`);
  const feed = await new Parser<object, { thumb?: { $?: { url?: string } } }>({
    customFields: { item: [["media:thumbnail", "thumb"]] },
  }).parseString(await res.text());
  return feed.items.slice(0, 15).map((item) => ({
    title: item.title ?? "(untitled)",
    url: item.link ?? "",
    source: item.link?.match(/\/r\/([^/]+)\//)?.[1] ? `r/${item.link.match(/\/r\/([^/]+)\//)![1]}` : "Reddit",
    score: 0,
    publishedAt: item.isoDate ?? new Date().toISOString(),
    category: "reddit" as const,
    thumbnail: item.thumb?.$?.url?.startsWith("http") ? item.thumb.$.url : undefined,
  }));
}

async function fromOauth(): Promise<NewsItem[]> {
  const token = await getAppToken();
  if (!token) throw new Error("no Reddit credentials configured");
  return fromJson(`https://oauth.reddit.com/r/${SUBREDDITS}/top?t=day&limit=15`, {
    Authorization: `Bearer ${token}`,
  });
}

export async function fetchReddit(): Promise<SourceResult> {
  const base = { category: "reddit" as const, label: "Reddit" };
  try {
    const items = await fromOauth()
      .catch(() => fromJson())
      .catch(() => fromRss());
    return { ...base, ok: true, items: items.filter((item) => item.url) };
  } catch (err) {
    return { ...base, ok: false, error: errorMessage(err), items: [] };
  }
}
