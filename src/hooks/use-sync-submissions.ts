'use client';

import { useEffect, useRef } from 'react';
import axios from 'axios';

// Module-level throttle so rapid navigation across pages triggers at most one
// background sync per window (shared across every component using the hook).
let lastSyncAt = 0;
const THROTTLE_MS = 6000;

/**
 * Fire-and-forget background pull of new form-builder submissions → defects /
 * out-of-service, so results appear without the manual "Sync Submissions" button.
 *
 * Runs once on mount (throttled). Calls `onSynced` after a sync completes so the
 * page can refresh its data. Best-effort: failures are swallowed silently.
 */
export function useSyncSubmissions(onSynced?: () => void) {
  const cbRef = useRef(onSynced);
  cbRef.current = onSynced;

  useEffect(() => {
    const now = Date.now();
    if (now - lastSyncAt < THROTTLE_MS) return;
    lastSyncAt = now;

    let active = true;
    axios
      .post('/api/forms/sync-submissions', {}, { withCredentials: true })
      .then((res) => {
        // Only refresh when the sync actually processed something new.
        if (active && (res.data?.data?.synced ?? 0) > 0) cbRef.current?.();
      })
      .catch(() => {
        /* background best-effort — ignore */
      });

    return () => {
      active = false;
    };
  }, []);
}
