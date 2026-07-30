"use client";

import { useState } from "react";
import { CHANNEL_COLOR } from "@/lib/channels.ts";
import { PULSE_HOURS, type Pulse } from "@/lib/pulse.ts";

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * The signature element: 24 hours of the current filter, one bar per half
 * hour, stacked by channel and heighted by attention. It is a reading of the
 * data rather than a control — the channel chips do the filtering — so it is
 * exposed to assistive tech as a single described image.
 */
export default function PulseRibbon({ pulse }: { pulse: Pulse | null }) {
  const [hovered, setHovered] = useState<number | null>(null);

  const active = hovered !== null && pulse ? pulse.buckets[hovered] : null;
  const readout = !pulse
    ? " "
    : active && active.count > 0
      ? `${clock(active.start)} · ${active.count} ${active.count === 1 ? "item" : "items"} · ${active.labels.slice(0, 2).join(", ")}`
      : active
        ? `${clock(active.start)} · quiet`
        : pulse.busiestStart !== null
          ? `busiest ${clock(pulse.busiestStart)}`
          : "no activity in this window";

  return (
    <section className="mt-4">
      <div className="flex items-baseline justify-between gap-3 pb-1.5">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
          Attention · last {PULSE_HOURS}h
        </h2>
        {/* Not a live region: it changes on every mouse-over, and the ribbon's
            own aria-label already carries the summary. */}
        <p className="truncate font-mono text-[10px] tabular-nums text-dim">
          {readout}
        </p>
      </div>

      <div
        className="border border-rule bg-well px-1.5 pt-2"
        role="img"
        aria-label={
          pulse?.busiestStart != null
            ? `Attention over the last ${PULSE_HOURS} hours, busiest around ${clock(pulse.busiestStart)}.`
            : `No activity in the last ${PULSE_HOURS} hours.`
        }
      >
        <div
          className="flex h-[68px] items-end gap-px border-b border-rule"
          onMouseLeave={() => setHovered(null)}
        >
          {(pulse?.buckets ?? []).map((bucket, index) => (
            <div
              key={bucket.start}
              className={`flex h-full min-w-0 flex-1 items-end ${
                hovered === index ? "bg-rule/40" : ""
              }`}
              onMouseEnter={() => setHovered(index)}
            >
              <div
                className="anim-grow flex w-full flex-col-reverse"
                style={{
                  height: `${bucket.height * 100}%`,
                  ["--delay" as string]: `${index * 8}ms`,
                }}
              >
                {bucket.segments.map((segment) => (
                  <div
                    key={segment.category}
                    className="min-h-0 w-full"
                    style={{
                      flexGrow: segment.share,
                      flexBasis: 0,
                      background: CHANNEL_COLOR[segment.category],
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-between pt-1 pb-1.5 font-mono text-[10px] text-faint">
          <span>{PULSE_HOURS}h ago</span>
          <span>12h</span>
          <span>now</span>
        </div>
      </div>
    </section>
  );
}
