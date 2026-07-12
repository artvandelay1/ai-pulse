import type { NewsItem, SourceResult } from "../types.ts";
import { errorMessage, fetchWithTimeout } from "../util.ts";

// GitHub repo search has no OR across topics, so run one search per topic
// and dedupe. Unauthenticated is fine at one refresh per 30 minutes; set
// GITHUB_TOKEN to raise the rate limit if you add more topics.
const TOPICS = ["ai", "llm"];

interface GithubRepo {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  created_at: string;
  owner: { avatar_url: string } | null;
}

export async function fetchGithub(): Promise<SourceResult> {
  const base = { category: "github" as const, label: "GitHub" };
  try {
    const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "ai-pulse/1.0",
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    };
    const perTopic = await Promise.all(
      TOPICS.map(async (topic) => {
        const params = new URLSearchParams({
          q: `topic:${topic} created:>${weekAgo}`,
          sort: "stars",
          order: "desc",
          per_page: "15",
        });
        const res = await fetchWithTimeout(`https://api.github.com/search/repositories?${params}`, { headers });
        if (!res.ok) throw new Error(`GitHub search responded ${res.status}`);
        const data = (await res.json()) as { items: GithubRepo[] };
        return data.items;
      })
    );

    const seen = new Set<string>();
    const items: NewsItem[] = [];
    for (const repo of perTopic.flat()) {
      if (seen.has(repo.full_name)) continue;
      seen.add(repo.full_name);
      items.push({
        title: repo.description ? `${repo.full_name}: ${repo.description.slice(0, 120)}` : repo.full_name,
        url: repo.html_url,
        source: "GitHub",
        score: repo.stargazers_count,
        publishedAt: repo.created_at,
        category: "github",
        thumbnail: repo.owner?.avatar_url,
      });
    }
    items.sort((a, b) => b.score - a.score);
    return { ...base, ok: true, items: items.slice(0, 15) };
  } catch (err) {
    return { ...base, ok: false, error: errorMessage(err), items: [] };
  }
}
