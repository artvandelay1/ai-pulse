export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Fetch with a hard timeout so one slow source never hangs a revalidation. */
export function fetchWithTimeout(url: string, init?: RequestInit, ms = 10000): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
}
