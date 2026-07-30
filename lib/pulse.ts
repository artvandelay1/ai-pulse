import type { Category, NewsItem } from "./types.ts";

export interface PulseSegment {
  category: Category;
  /** Share of this bucket's magnitude, 0..1 */
  share: number;
}

export interface PulseBucket {
  /** Epoch ms of the bucket's start */
  start: number;
  count: number;
  /** Bar height as a fraction of the tallest bucket, 0..1 */
  height: number;
  /** Stacked bottom-up, largest share first */
  segments: PulseSegment[];
  /** Distinct source labels in the bucket, busiest first */
  labels: string[];
}

export interface Pulse {
  buckets: PulseBucket[];
  /** Epoch ms of the busiest bucket, or null when the window is empty */
  busiestStart: number | null;
}

export const PULSE_HOURS = 24;
const BUCKET_MS = 30 * 60 * 1000;
const BUCKET_COUNT = (PULSE_HOURS * 60 * 60 * 1000) / BUCKET_MS;

/**
 * Scores are not comparable across sources — a 400-point HN story and a
 * 2,400-upvote Reddit thread are the same amount of attention — so every
 * item is normalized against the top score in its own channel.
 */
function magnitudeByCategory(items: NewsItem[]): Map<Category, number> {
  const maxima = new Map<Category, number>();
  for (const item of items) {
    maxima.set(item.category, Math.max(maxima.get(item.category) ?? 0, item.score));
  }
  return maxima;
}

/** Sources with no score at all (arXiv, Reddit over RSS) still register as activity. */
const UNSCORED_MAGNITUDE = 0.3;

export function buildPulse(items: NewsItem[], now: number): Pulse {
  const maxima = magnitudeByCategory(items);
  const windowStart = now - PULSE_HOURS * 60 * 60 * 1000;

  const tally = Array.from({ length: BUCKET_COUNT }, () => ({
    total: 0,
    count: 0,
    byCategory: new Map<Category, number>(),
    byLabel: new Map<string, number>(),
  }));

  for (const item of items) {
    const published = Date.parse(item.publishedAt);
    if (!Number.isFinite(published) || published < windowStart) continue;
    // Feeds occasionally publish timestamps a few minutes into the future.
    const index = Math.min(BUCKET_COUNT - 1, Math.floor((published - windowStart) / BUCKET_MS));
    if (index < 0) continue;

    const ceiling = maxima.get(item.category) ?? 0;
    const magnitude = item.score > 0 && ceiling > 0 ? item.score / ceiling : UNSCORED_MAGNITUDE;

    const bucket = tally[index];
    bucket.total += magnitude;
    bucket.count += 1;
    bucket.byCategory.set(item.category, (bucket.byCategory.get(item.category) ?? 0) + magnitude);
    bucket.byLabel.set(item.source, (bucket.byLabel.get(item.source) ?? 0) + 1);
  }

  const peak = Math.max(...tally.map((bucket) => bucket.total));
  let busiestStart: number | null = null;

  const buckets = tally.map((bucket, index) => {
    if (peak > 0 && bucket.total === peak) busiestStart = windowStart + index * BUCKET_MS;
    return {
      start: windowStart + index * BUCKET_MS,
      count: bucket.count,
      // Square root keeps a single big story from flattening everything else,
      // and a floor keeps quiet-but-not-empty half hours visible.
      height: peak > 0 && bucket.total > 0 ? Math.max(0.08, Math.sqrt(bucket.total / peak)) : 0,
      segments: [...bucket.byCategory.entries()]
        .map(([category, value]) => ({ category, share: value / bucket.total }))
        .toSorted((a, b) => b.share - a.share),
      labels: [...bucket.byLabel.entries()]
        .toSorted((a, b) => b[1] - a[1])
        .map(([label]) => label),
    };
  });

  return { buckets, busiestStart };
}
