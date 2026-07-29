# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

AI Pulse: a single-page AI news aggregator (Next.js 15 App Router, TypeScript, Tailwind v4). Five sources are fetched server-side and rendered as one filterable feed. No database, no auth, no AI summarization. Deployed on Vercel; `main` auto-deploys.

## Commands

```bash
npm run dev            # dev server (turbopack)
npm run build          # production build; run before claiming a change works
npm start              # serve the production build on :3000
npm run lint           # eslint
```

Testing the fetchers is done by running them live, not by a test suite (there is none):

```bash
node scripts/sample.ts all           # full pipeline incl. og:image scraping
node scripts/sample.ts hackernews    # one source: reddit | hackernews | arxiv | blogs | github
```

`sample.ts all` routes through `fetchAllSources()`, so it is the only mode that exercises thumbnail scraping. Single-source mode calls that fetcher directly.

## Architecture

**Request path.** `app/page.tsx` is a server component with `revalidate = 1800` (ISR, 30 min) and `maxDuration = 60`. It calls `fetchAllSources()` and passes plain data to `components/NewsFeed.tsx`, a client component that only filters and sorts. **Never add client-side fetching** — the page ships as static HTML and all network work happens during regeneration.

**Sources.** Each file in `lib/sources/` exports one `fetch*()` returning a `SourceResult` (`lib/types.ts`): `{ category, label, ok, error?, items }`. Fetchers catch their own errors and return `ok: false` rather than throwing; the UI renders failed sources as a small "Currently unavailable: <label> (<error>)" note. `lib/sources/index.ts` runs them all through `Promise.allSettled` as a second line of defense.

Items are normalized to `NewsItem`: `{ title, url, source, score, publishedAt, category, thumbnail?, rank? }`. `source` is the display label (`"Hacker News"`, `"r/codex"`, `"OpenAI"`); `category` drives the filter tabs and badge colors. `rank` is a 1-based position used when a source has no real score (currently Reddit via RSS), rendered as "#N today".

**Thumbnails.** Reddit and GitHub supply images through their APIs. Hacker News and blog items get `og:image` scraped by `lib/og-image.ts` during regeneration (10 concurrent, 4s timeout, HTML-entity decoded — CDN signature params break without that decode). arXiv is intentionally text-only. Rendered with plain `<img loading="lazy">`, not `next/image`, because thumbnails come from arbitrary domains.

**`.ts` extensions in imports are deliberate.** `tsconfig.json` sets `allowImportingTsExtensions` so the same modules run under Node's native type stripping (`node scripts/sample.ts`) and under Next's bundler. Keep writing `from "../types.ts"`.

## The Reddit pipeline (read this before touching `lib/sources/reddit.ts`)

Reddit is the most involved part of the codebase, and its complexity is entirely externally imposed:

- Reddit **closed self-service API access** (Responsible Builder Policy, Nov 2025). New OAuth apps require approval, so the app has no credentials today.
- Reddit's WAF **403s Vercel's datacenter IPs**, and separately **403s Node's `fetch` even from GitHub runners** while serving the identical URL to `curl`. Both facts are load-bearing.

`fetchReddit()` therefore tries four transports in order, falling through on failure:

1. **OAuth** (`oauth.reddit.com`) — only if `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET` are set. Returns real vote counts. Tokens cached until expiry.
2. **Public JSON** (`top.json`) — real scores; works from some networks, 403s from Vercel.
3. **RSS** (`top.rss`) — no scores, so items get `score: 0` and a `rank`.
4. **Snapshot** — `data/reddit-snapshot.json` on the repo's **`data` branch**, read over the public GitHub contents API. Rejected if older than 3 hours.

The snapshot is produced by `.github/workflows/reddit-snapshot.yml` every 30 minutes: it `curl`s each subreddit's RSS (Node fetch would 403), parses with `scripts/snapshot-reddit.ts`, merges with the previous snapshot so subreddits that got rate-limited keep their last-known posts, and commits to the `data` branch. **The repo must stay public** — Vercel reads that snapshot unauthenticated. (`GITHUB_TOKEN` is supported as a fallback if it ever goes private.)

Subreddits are fetched **sequentially with delays**; parallel requests trip Reddit's per-IP rate limit and most return 429. Expect partial failures per run as normal — the merge logic is what makes coverage converge across runs.

## Gotchas

- **`SUBREDDIT_LIST` and `PER_SUB_LIMIT` in `lib/sources/reddit.ts` are the single source of truth.** The workflow derives its curl URLs by importing `rssUrlFor` from that module. Change the list in one place only.
- **`lib/sources/index.ts` has parallel arrays.** The `FETCHERS` array and the two literal arrays in its `allSettled` fallback (categories, labels) are index-matched. Adding or reordering a fetcher requires updating all three together.
- **Vercel Hobby rejects commits it can't attribute** to the account owner's GitHub identity. This repo's `user.email` is set locally to the `artvandelay1` noreply address for that reason; don't "fix" it to a personal email or deploys start failing.
- Blog feeds drift. Anthropic publishes no official RSS (a community mirror is used) and Meta's `ai.meta.com` feed is dead (the Meta Engineering AI Research feed replaces it). Verify a feed URL live before assuming it's broken code.
- `data/` on the `data` branch is machine-written; never hand-edit it.

## Style

Match the existing code: comments explain *why* a workaround exists (they encode externally-imposed constraints that are non-obvious and easy to "clean up" into breakage), not what the line does. Keep fetchers small and single-purpose.
