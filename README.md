# AI Pulse ⚡

A single-page AI news aggregator. Pulls trending AI content from Reddit, Hacker News, arXiv, company blogs, and GitHub into one clean feed — headlines, links, source badges, scores, and thumbnails. No database, no auth, no AI summaries.

Thumbnails: Reddit and GitHub provide images through their APIs; Hacker News and blog links get their `og:image` scraped server-side at refresh time ([lib/og-image.ts](lib/og-image.ts)); arXiv papers stay text-only.

Built with Next.js 15 (App Router, TypeScript, Tailwind CSS). All fetching happens server-side with ISR: the page is statically served and refreshed at most every 30 minutes.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. To test the live fetchers without the UI:

```bash
node scripts/sample.ts all        # or: hackernews | reddit | arxiv | blogs | github
```

## Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel: **Add New Project** → import the repo → **Deploy**. Zero config needed; Vercel detects Next.js automatically.

Optional environment variables:

- `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` — **recommended in production.** Reddit 403s anonymous requests from datacenter IPs (including Vercel), which forces the RSS fallback and loses upvote counts. Create a free app at [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) (type "script", any redirect URI), set these two variables, and the fetcher uses application-only OAuth, which works from anywhere and includes scores.
- `GITHUB_TOKEN` — raises the GitHub API rate limit (unauthenticated is fine at the default refresh rate).

## Adjust the refresh interval

Change `revalidate` in [app/page.tsx](app/page.tsx) (seconds; default `1800` = 30 minutes).

## Add or remove sources

Each source is one file in [lib/sources/](lib/sources/) returning a `SourceResult` (see [lib/types.ts](lib/types.ts)). To add one: create a fetcher that returns normalized `{ title, url, source, score, publishedAt, category }` items, wrap it in try/catch so a dead source renders as a small "unavailable" note instead of breaking the page, and register it in [lib/sources/index.ts](lib/sources/index.ts). To change the company blogs, edit the `FEEDS` list in [lib/sources/blogs.ts](lib/sources/blogs.ts).

Test any fetcher live with `node scripts/sample.ts <name>`.

## Source notes (verified 2026-07-12)

| Source | Endpoint | Notes |
| --- | --- | --- |
| Reddit | subreddits from `SUBREDDITS` in [lib/sources/reddit.ts](lib/sources/reddit.ts), top of the day | Tries OAuth (if `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET` are set), then public `top.json`, then the `.rss` feed; the RSS fallback lacks vote counts and shows top-of-day rank (#N today) instead |
| Hacker News | Algolia search, queries "AI" and "LLM", >50 points, last 7 days | Deduped across queries |
| arXiv | cs.AI + cs.LG, newest submissions | Atom XML parsed with rss-parser |
| Blogs | OpenAI, Anthropic, Google DeepMind, Meta AI, Hugging Face | Anthropic publishes no official RSS; uses the community mirror from [Olshansk/rss-feeds](https://github.com/Olshansk/rss-feeds) (rebuilt daily). Meta retired its ai.meta.com feed; uses the official Meta Engineering AI Research feed |
| GitHub | Repo search: topics `ai` / `llm`, created in the last 7 days, by stars | Two queries merged (search API has no OR across topics) |

Every source is fetched in parallel with `Promise.allSettled`; one dead source never breaks the page.
