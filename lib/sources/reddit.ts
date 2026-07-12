import Parser from "rss-parser";
import type { NewsItem, SourceResult } from "../types.ts";
import { errorMessage, fetchWithRetry, fetchWithTimeout } from "../util.ts";

// Cache successful listing responses in Next's data cache (a no-op outside
// the Next runtime): when a later refresh gets rate-limited, Next serves
// the stale cached response instead of failing the source.
const NEXT_CACHE = { next: { revalidate: 1800 } } as RequestInit;

// Single source of truth for the subreddit list; the snapshot workflow
// derives its curl URLs from these exports. Each subreddit contributes its
// own top-of-day posts so big subs can't crowd out quiet ones.
export const SUBREDDIT_LIST = ["MachineLearning", "singularity", "ClaudeAI", "OpenAI", "codex"];
export const PER_SUB_LIMIT = 5;
export const rssUrlFor = (sub: string) =>
  `https://www.reddit.com/r/${sub}/top.rss?t=day&limit=${PER_SUB_LIMIT}`;
const jsonUrlFor = (sub: string) =>
  `https://www.reddit.com/r/${sub}/top.json?t=day&limit=${PER_SUB_LIMIT}`;
const oauthUrlFor = (sub: string) =>
  `https://oauth.reddit.com/r/${sub}/top?t=day&limit=${PER_SUB_LIMIT}`;
const USER_AGENT = "web:ai-pulse:v1.0 (news aggregator)";

/**
 * Fetch each subreddit in turn (parallel requests trip Reddit's per-IP
 * rate limit), tolerating partial failures.
 */
async function collect(fetchSub: (sub: string) => Promise<NewsItem[]>): Promise<NewsItem[]> {
  const items: NewsItem[] = [];
  let firstError: unknown;
  for (const [i, sub] of SUBREDDIT_LIST.entries()) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      items.push(...(await fetchSub(sub)));
    } catch (err) {
      firstError ??= err;
    }
  }
  if (items.length === 0) throw firstError ?? new Error("all subreddits returned nothing");
  return items;
}

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

async function fromJson(urlFor = jsonUrlFor, headers: Record<string, string> = {}): Promise<NewsItem[]> {
  return collect(async (sub) => {
    const res = await fetchWithRetry(urlFor(sub), {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...headers },
      ...(headers.Authorization ? {} : NEXT_CACHE),
    });
    if (!res.ok) throw new Error(`Reddit JSON responded ${res.status}`);
    const data = (await res.json()) as { data: { children: RedditPost[] } };
    return data.data.children.map(({ data: post }, index) => ({
      rank: index + 1,
      title: post.title,
      // Link posts go to the linked content, self posts to the discussion.
      url: post.is_self || !post.url ? `https://www.reddit.com${post.permalink}` : post.url,
      source: `r/${post.subreddit}`,
      score: post.score ?? 0,
      publishedAt: new Date(post.created_utc * 1000).toISOString(),
      category: "reddit" as const,
      thumbnail: postThumbnail(post),
    }));
  });
}

// Reddit 403s the .json endpoints from some networks (notably datacenter IPs)
// while still serving the .rss feed; fall back to it. RSS carries no vote
// counts, so those items get score 0.
async function fromRss(): Promise<NewsItem[]> {
  return collect(async (sub) => {
    const res = await fetchWithRetry(rssUrlFor(sub), {
      headers: { "User-Agent": USER_AGENT },
      ...NEXT_CACHE,
    });
    if (!res.ok) throw new Error(`Reddit RSS responded ${res.status}`);
    return parseRedditRss(await res.text());
  });
}

/** Exported for scripts/snapshot-reddit.ts, which fetches the XML via curl. */
export async function parseRedditRss(xml: string): Promise<NewsItem[]> {
  const feed = await new Parser<object, { thumb?: { $?: { url?: string } } }>({
    customFields: { item: [["media:thumbnail", "thumb"]] },
  }).parseString(xml);
  // The feed carries no vote counts, but it is ordered top-of-day, so keep
  // the rank (within its subreddit) as an honest popularity signal.
  return feed.items.slice(0, PER_SUB_LIMIT).map((item, index) => ({
    rank: index + 1,
    title: item.title ?? "(untitled)",
    url: item.link ?? "",
    source: item.link?.match(/\/r\/([^/]+)\//)?.[1] ? `r/${item.link.match(/\/r\/([^/]+)\//)![1]}` : "Reddit",
    score: 0,
    publishedAt: item.isoDate ?? new Date().toISOString(),
    category: "reddit" as const,
    thumbnail: item.thumb?.$?.url?.startsWith("http") ? item.thumb.$.url : undefined,
  }));
}

// Last resort: the snapshot a scheduled GitHub Action commits to this
// repo's data branch every 30 minutes (GitHub's runners can reach Reddit's
// RSS; Vercel's IPs cannot). Uses the API contents endpoint so a GITHUB_TOKEN
// works for private repos; for public repos it works unauthenticated.
const SNAPSHOT_URL =
  "https://api.github.com/repos/artvandelay1/ai-pulse/contents/data/reddit-snapshot.json?ref=data";
const SNAPSHOT_MAX_AGE_MS = 3 * 3600_000;

async function fromSnapshot(): Promise<NewsItem[]> {
  const res = await fetchWithTimeout(SNAPSHOT_URL, {
    headers: {
      Accept: "application/vnd.github.raw+json",
      "User-Agent": USER_AGENT,
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`snapshot fetch responded ${res.status}`);
  const { fetchedAt, result } = (await res.json()) as { fetchedAt: string; result: SourceResult };
  if (Date.now() - Date.parse(fetchedAt) > SNAPSHOT_MAX_AGE_MS) throw new Error("snapshot too old");
  return result.items;
}

async function fromOauth(): Promise<NewsItem[]> {
  const token = await getAppToken();
  if (!token) throw new Error("no Reddit credentials configured");
  return fromJson(oauthUrlFor, { Authorization: `Bearer ${token}` });
}

export async function fetchReddit(): Promise<SourceResult> {
  const base = { category: "reddit" as const, label: "Reddit" };
  try {
    const items = await fromOauth()
      .catch(() => fromJson())
      .catch(() => fromRss())
      .catch((err) =>
        fromSnapshot().catch(() => {
          throw err; // snapshot failed too; report the direct-fetch error
        })
      );
    return { ...base, ok: true, items: items.filter((item) => item.url) };
  } catch (err) {
    return { ...base, ok: false, error: errorMessage(err), items: [] };
  }
}
