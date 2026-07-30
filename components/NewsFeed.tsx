"use client";

import { useEffect, useMemo, useState } from "react";
import PulseRibbon from "@/components/PulseRibbon.tsx";
import {
  CHANNELS,
  CHANNEL_CODE,
  CHANNEL_COLOR,
  CHANNEL_LABEL,
  CHANNEL_UNIT,
} from "@/lib/channels.ts";
import { buildPulse } from "@/lib/pulse.ts";
import type { Category, NewsItem, SourceResult } from "@/lib/types.ts";
import { timeAgo } from "@/lib/relative-time.ts";

/** Only the first screenful animates in; rows below the fold appear settled. */
const ANIMATED_ROWS = 14;

function ThemeToggle() {
  const [isDark, setIsDark] = useState<boolean | null>(null);
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);
  if (isDark === null) return <div className="h-7 w-7" aria-hidden />;
  return (
    <button
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-7 w-7 items-center justify-center border border-transparent text-dim hover:border-rule hover:text-fg"
      onClick={() => {
        const next = !isDark;
        document.documentElement.classList.toggle("dark", next);
        localStorage.setItem("theme", next ? "dark" : "light");
        setIsDark(next);
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        {isDark ? (
          <>
            <circle cx="12" cy="12" r="4.5" />
            <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19" />
          </>
        ) : (
          <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z" />
        )}
      </svg>
    </button>
  );
}

/** Teaches the channel-to-colour mapping the ribbon and row spines rely on. */
function Swatch({ category }: { category: Category | "all" }) {
  if (category === "all") {
    return (
      <span className="flex h-2.5 w-2.5 flex-col" aria-hidden>
        {CHANNELS.map((channel) => (
          <span key={channel} className="flex-1" style={{ background: CHANNEL_COLOR[channel] }} />
        ))}
      </span>
    );
  }
  return (
    <span
      className="h-2.5 w-2.5"
      style={{ background: CHANNEL_COLOR[category] }}
      aria-hidden
    />
  );
}

function Row({ item, now, delay }: { item: NewsItem; now: number | null; delay: number | null }) {
  const scored = item.score > 0;
  return (
    <li
      className={`group relative flex items-stretch border-b border-rule last:border-b-0 hover:bg-surface ${
        delay === null ? "" : "anim-rise"
      }`}
      style={delay === null ? undefined : { ["--delay" as string]: `${delay}ms` }}
    >
      {/* pt aligns the gutter's baseline with the title's, not its box top. */}
      <div className="w-12 shrink-0 pt-[13px] pr-2 pb-2 text-right font-mono text-[11px] leading-tight">
        {/* Times are local, so they can only be drawn after mount; the fixed
            gutter width keeps that from shifting the layout. */}
        <div className="tabular-nums text-dim">
          {now === null
            ? " "
            : new Date(item.publishedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}
        </div>
        <div className="mt-0.5 text-faint">{CHANNEL_CODE[item.category]}</div>
      </div>

      <div
        className="w-[2px] shrink-0 opacity-70 group-hover:opacity-100"
        style={{ background: CHANNEL_COLOR[item.category] }}
        aria-hidden
      />

      <div className="min-w-0 flex-1 py-2 pl-3">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[15px] font-medium leading-snug after:absolute after:inset-0 after:content-[''] group-hover:underline"
        >
          {item.title}
        </a>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-dim">
          <span>{item.source}</span>
          {now !== null && <span className="text-faint">· {timeAgo(item.publishedAt, now)}</span>}
        </div>
      </div>

      <div className="w-[68px] shrink-0 pt-[13px] pb-2 text-right font-mono text-[11px] leading-tight tabular-nums">
        {scored ? (
          <span className="text-dim">
            {item.score.toLocaleString()}
            <span className="ml-0.5 text-faint">{CHANNEL_UNIT[item.category]}</span>
          </span>
        ) : item.rank !== undefined ? (
          <span className="text-faint">#{item.rank}</span>
        ) : (
          <span className="text-faint">—</span>
        )}
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
          // Sized to sit inside the row's natural height so thumbnailed rows
          // don't break the scan rhythm of the ones without.
          className="my-2 ml-3 h-9 w-9 shrink-0 border border-rule object-cover"
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
  const all = useMemo(() => sources.flatMap((source) => source.items), [sources]);

  const counts = useMemo(() => {
    const tally = new Map<Category, number>();
    for (const item of all) tally.set(item.category, (tally.get(item.category) ?? 0) + 1);
    return tally;
  }, [all]);

  const items = useMemo(() => {
    const filtered = tab === "all" ? all : all.filter((item) => item.category === tab);
    return filtered.toSorted((a, b) =>
      sort === "top" ? b.score - a.score : Date.parse(b.publishedAt) - Date.parse(a.publishedAt)
    );
  }, [all, tab, sort]);

  // The ribbon reads the current filter, so selecting a channel redraws it.
  const pulse = useMemo(() => (now === null ? null : buildPulse(items, now)), [items, now]);

  return (
    <div className="mx-auto max-w-[52rem] px-4 pb-20">
      <header className="pt-7">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            {/* Neutral on purpose: every colour in this design names a
                channel, so the status dot must not borrow one. */}
            <span className="h-1.5 w-1.5 rounded-full bg-dim" aria-hidden />
            <h1 className="wordmark text-[17px] leading-none">AI Pulse</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-dim">
              {now !== null ? `updated ${timeAgo(generatedAt, now)}` : " "}
            </span>
            <ThemeToggle />
          </div>
        </div>

        <PulseRibbon pulse={pulse} />
      </header>

      <nav className="sticky top-0 z-20 -mx-4 mt-4 flex items-center gap-1 overflow-x-auto border-b border-rule bg-bg px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {(["all", ...CHANNELS] as const).map((key) => {
          const label = key === "all" ? "All" : CHANNEL_LABEL[key];
          const count = key === "all" ? all.length : (counts.get(key) ?? 0);
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              aria-pressed={tab === key}
              className={`flex shrink-0 items-center gap-1.5 border px-2 py-1 text-[13px] ${
                tab === key
                  ? "border-rule bg-surface font-medium text-fg"
                  : "border-transparent text-dim hover:text-fg"
              }`}
            >
              <Swatch category={key} />
              {label}
              <span className="font-mono text-[10px] tabular-nums text-faint">{count}</span>
            </button>
          );
        })}

        <span className="grow" />

        <div className="flex shrink-0 border border-rule">
          {(["new", "top"] as const).map((key) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              aria-pressed={sort === key}
              className={`px-2 py-1 text-[13px] ${
                sort === key ? "bg-surface text-fg" : "text-dim hover:text-fg"
              }`}
            >
              {key === "new" ? "Newest" : "Top"}
            </button>
          ))}
        </div>
      </nav>

      {failed.length > 0 && (
        <p className="mt-2 font-mono text-[11px] text-faint">
          Unavailable:{" "}
          {failed
            .map((source) => `${source.label}${source.error ? ` (${source.error})` : ""}`)
            .join(", ")}
        </p>
      )}

      <ul className="mt-1">
        {items.map((item, index) => (
          <Row
            key={item.url + item.title}
            item={item}
            now={now}
            delay={index < ANIMATED_ROWS ? 80 + index * 16 : null}
          />
        ))}
      </ul>

      {items.length === 0 && (
        <div className="mt-12 text-center">
          <p className="text-sm text-dim">Nothing in this channel right now.</p>
          <button
            onClick={() => setTab("all")}
            className="mt-3 border border-rule px-2.5 py-1 text-[13px] text-fg hover:bg-surface"
          >
            Show all channels
          </button>
        </div>
      )}
    </div>
  );
}
