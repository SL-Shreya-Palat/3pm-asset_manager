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
    (async () => {
      try {
        const res = await axios.get('/api/command/connection', { withCredentials: true });
        if (active) setInfo(res.data?.data ?? null);
      } catch {
        if (active) setInfo(null); // treat as standalone on error
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const connected = !!info && info.state !== 'standalone';
  return { info, connected, loading };
}
