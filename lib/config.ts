/**
 * Central runtime config — single source of truth for tunable values.
 *
 * CUTOFF: the daily edit/ship deadline in Asia/Bangkok (ICT, UTC+7).
 * Customers may edit shipping address / size until CUTOFF; the daily-pull
 * worklist round also closes at CUTOFF. Change ONE number here (CUTOFF_HOUR)
 * and every consumer follows: the pull window (lib/daily-pull/window.ts), the
 * per-order edit-lock + the deadline text customers see (lib/edit-lock.ts),
 * and the heartbeat alert (app/api/daily-pull-heartbeat).
 *
 * NOTE: the external cron schedules (cron-job.org) are NOT controlled here —
 * they live outside the repo and must be adjusted separately to match.
 */

// The cutoff hour in ICT, 24h clock. THIS is the one number to change.
export const CUTOFF_HOUR = 18; // 18:00 ICT

// The cutoff minute. Kept at 0; the daily-pull is scheduled a few minutes later.
export const CUTOFF_MINUTE = 0;

// "HH:MM" cutoff used in deadline strings + customer/admin messages.
export const CUTOFF_TIME = `${String(CUTOFF_HOUR).padStart(2, "0")}:${String(
  CUTOFF_MINUTE
).padStart(2, "0")}`;
