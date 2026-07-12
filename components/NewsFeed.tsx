"use client";

import { useEffect, useMemo, useState } from "react";
import type { Category, NewsItem, SourceResult } from "@/lib/types.ts";
import { timeAgo } from "@/lib/relative-time.ts";

const TABS: { key: Category | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "reddit", label: "Reddit" },
  { key: "hackernews", label: "Hacker News" },
  { key: "papers", label: "Papers" },
  { key: "blogs", label: "Blogs" },
  { key: "github", label: "GitHub" },
];

const BADGE_STYLES: Record<Category, string> = {
  reddit: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
  hackernews: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  papers: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
  blogs: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  github: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
};

function ThemeToggle() {
  const [isDark, setIsDark] = useState<boolean | null>(null);
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);
  if (isDark === null) return <div className="h-8 w-8" aria-hidden />;
  return (
    <button
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-8 w-8 items-center justify-center rounded-md text-lg hover:bg-black/5 dark:hover:bg-white/10"
      onClick={() => {
        const next = !isDark;
        document.documentElement.classList.toggle("dark", next);
        localStorage.setItem("theme", next ? "dark" : "light");
        setIsDark(next);
      }}
    >
      {isDark ? "☀️" : "\u{1F319}"}
    </button>
  );
}

function Card({ item, now }: { item: NewsItem; now: number | null }) {
  return (
    <li className="flex items-start gap-3 rounded-lg border border-black/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="min-w-0 flex-1">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[15px] font-medium leading-snug hover:underline"
        >
          {item.title}
        </a>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-black/55 dark:text-white/45">
          <span className={`rounded px-1.5 py-0.5 font-medium ${BADGE_STYLES[item.category]}`}>
            {item.source}
          </span>
          {item.score > 0 && <span>&#9650; {item.score.toLocaleString()}</span>}
          {now !== null && <span>{timeAgo(item.publishedAt, now)}</span>}
        </div>
      </div>
      {item.thumbnail && (
        // Thumbnails come from arbitrary external domains, so next/image's
        // domain allowlist doesn't fit; a plain lazy img is the right tool.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.thumbnail}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-16 w-16 shrink-0 rounded-md border border-black/10 object-cover dark:border-white/10"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      )}
    </li>
  );
}

export default function NewsFeed({
  sources,
  generatedAt,
}: {
  sources: SourceResult[];
  generatedAt: string;
}) {
  const [tab, setTab] = useState<Category | "all">("all");
  const [sort, setSort] = useState<"new" | "top">("new");
  // Relative times are computed client-side after mount; the statically
  // generated HTML ages in the ISR cache, so baking them in would lie.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);

  const failed = sources.filter((source) => !source.ok);
  const items = useMemo(() => {
    const all = sources.flatMap((source) => source.items);
    const filtered = tab === "all" ? all : all.filter((item) => item.category === tab);
    return filtered.toSorted((a, b) =>
      sort === "top" ? b.score - a.score : Date.parse(b.publishedAt) - Date.parse(a.publishedAt)
    );
  }, [sources, tab, sort]);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16">
      <header className="flex items-center justify-between gap-4 py-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            AI Pulse <span aria-hidden>&#9889;</span>
          </h1>
          <p className="mt-0.5 text-xs text-black/55 dark:text-white/45">
            {now !== null ? `Updated ${timeAgo(generatedAt, now)}` : " "}
          </p>
        </div>
        <ThemeToggle />
      </header>

      {failed.length > 0 && (
        <p className="mb-3 text-xs text-black/55 dark:text-white/45">
          Currently unavailable: {failed.map((source) => source.label).join(", ")}
        </p>
      )}

      <nav className="sticky top-0 -mx-4 flex items-center gap-1 overflow-x-auto bg-background px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-sm ${
              tab === key
                ? "bg-foreground text-background"
                : "text-black/60 hover:bg-black/5 dark:text-white/55 dark:hover:bg-white/10"
            }`}
          >
            {label}
          </button>
        ))}
        <span className="grow" />
        <button
          onClick={() => setSort(sort === "new" ? "top" : "new")}
          className="whitespace-nowrap rounded-full px-3 py-1 text-sm text-black/60 hover:bg-black/5 dark:text-white/55 dark:hover:bg-white/10"
        >
          {sort === "new" ? "Newest" : "Top score"} &#8645;
        </button>
      </nav>

      <ul className="mt-3 flex flex-col gap-2">
        {items.map((item) => (
          <Card key={item.url + item.title} item={item} now={now} />
        ))}
      </ul>
      {items.length === 0 && (
        <p className="mt-10 text-center text-sm text-black/55 dark:text-white/45">
          Nothing here right now.
        </p>
      )}
    </div>
  );
}
