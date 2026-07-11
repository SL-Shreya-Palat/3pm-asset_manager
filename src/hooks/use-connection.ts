'use client';

/**
 * Client hook: the tenant's Command connection state.
 *
 * Fetched once on mount (no polling). `connected` means the connection is ON
 * (Command entitled + not manually disabled) — it stays true in the `degraded`
 * state too, mirroring the server guard (`isCommandConnectionEnabled`), so the
 * UI hides local create/edit affordances even during a transient Command outage.
 */

import { useEffect, useState } from 'react';
import axios from 'axios';

export interface ConnectionInfo {
  state: 'standalone' | 'connected' | 'degraded';
  entitled: boolean;
  connected: boolean;
  disabled: boolean;
  configured: boolean;
  authTenantId: string | null;
  lastVerifiedAt: string | null;
}

/**
 * Module-level shared fetch: the sidebar AND every list page mount this hook,
 * so without sharing, one page view fired 2+ identical /api/command/connection
 * requests. All mounts within the TTL share one in-flight promise/result.
 */
const CLIENT_TTL_MS = 60_000;
let sharedFetchedAt = 0;
let sharedPromise: Promise<ConnectionInfo | null> | null = null;

function fetchConnectionShared(): Promise<ConnectionInfo | null> {
  const now = Date.now();
  if (sharedPromise && now - sharedFetchedAt < CLIENT_TTL_MS) return sharedPromise;
  sharedFetchedAt = now;
  sharedPromise = axios
    .get('/api/command/connection', { withCredentials: true })
    .then((res) => (res.data?.data ?? null) as ConnectionInfo | null)
    .catch(() => {
      // Treat as standalone on error, but don't cache the failure for the
      // full TTL — let the next mount retry.
      sharedFetchedAt = 0;
      return null;
    });
  return sharedPromise;
}

export function useConnection(): {
  info: ConnectionInfo | null;
  /** Connection is ON (Command-managed) — true for both connected and degraded. */
  connected: boolean;
  loading: boolean;
} {
  const [info, setInfo] = useState<ConnectionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchConnectionShared()
      .then((data) => {
        if (active) setInfo(data);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const connected = !!info && info.state !== 'standalone';
  return { info, connected, loading };
}
