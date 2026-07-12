export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Fetch with a hard timeout so one slow source never hangs a revalidation. */
export function fetchWithTimeout(url: string, init?: RequestInit, ms = 10000): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
}

/**
 * fetchWithTimeout plus retries on 429/5xx and network errors. Rate limits
 * against shared egress IPs (e.g. Reddit vs Vercel) are usually transient,
 * so a couple of spaced attempts recover most of them.
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  { ms = 10000, retries = 2, delayMs = 1500 } = {}
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    try {
      const res = await fetchWithTimeout(url, init, ms);
      if (res.status !== 429 && res.status < 500) return res;
      lastError = new Error(`${url.split("/")[2]} responded ${res.status}`);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
