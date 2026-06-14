/**
 * Resilient loader for the Thai postal-code lookup module.
 *
 * WHY THIS EXISTS
 * The shipping/edit forms look up a postal code by dynamically importing
 * `@/lib/thai-zipcode` (a ~200KB chunk). In the LINE LIFF in-app webview the
 * chunk cache is aggressive: after a new deploy the old HTML can reference a
 * chunk hash that no longer exists, so `import()` rejects with a ChunkLoadError.
 * A flaky mobile network can reject it too. Previously that rejection had no
 * `.catch()` — autofill silently died and the customer was locked out of submit
 * (postalResolved stayed false → "INVALID POSTAL CODE") until they exited and
 * re-entered the LIFF to reload fresh HTML.
 *
 * This module makes the import robust:
 *   - retries on failure (chunk/network hiccups are usually transient),
 *   - caches the resolved loader so we only download the chunk once,
 *   - clears the cache on failure so a later attempt can retry from scratch,
 *   - exposes a preload() so forms can warm the chunk on mount (before the
 *     customer ever types a postal code).
 *
 * This wrapper is intentionally tiny and does NOT statically pull in db.json —
 * the heavy module is only referenced inside the dynamic import() call.
 */
import type { ZipResult } from "@/lib/thai-zipcode";

export type LookupFn = (postalCode: string) => ZipResult[];

let cached: Promise<LookupFn> | null = null;

async function importWithRetry(
  retries = 3,
  baseDelayMs = 400
): Promise<LookupFn> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const mod = await import("@/lib/thai-zipcode");
      return mod.lookupZip;
    } catch (err) {
      lastErr = err;
      console.error(
        `[load-zipcode] import attempt ${attempt}/${retries} failed:`,
        err
      );
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, baseDelayMs * attempt));
      }
    }
  }
  throw lastErr;
}

/**
 * Load the postal-code lookup function. Resolves the same cached loader on
 * repeat calls. If loading fails (after retries) the cache is cleared so the
 * next call starts a fresh attempt rather than re-throwing a stale failure.
 */
export function loadZipLookup(): Promise<LookupFn> {
  if (!cached) {
    cached = importWithRetry().catch((err) => {
      cached = null; // allow a future call to retry from scratch
      throw err;
    });
  }
  return cached;
}

/**
 * Warm the chunk in the background (call from a form's mount effect). Any
 * failure is swallowed here — loadZipLookup() will retry on actual demand.
 */
export function preloadZipLookup(): void {
  loadZipLookup().catch(() => {
    /* swallowed — retried on demand */
  });
}
