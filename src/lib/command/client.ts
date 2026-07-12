/**
 * Command HTTP transport (server-side only).
 *
 * The ONE doorway from Asset Manager to Command (construction-portal). Every
 * Command call goes through `commandRequest`/`commandWrite`: attaches the
 * service credential + the tenant's 3PM `authTenantId`, enforces a timeout,
 * retries transient GET failures, and trips a per-tenant circuit breaker so a
 * Command outage fails fast instead of hanging every request.
 * Never import this into client components — it reads the secret.
 *
 * Ported from 3pm-dispatch-portal/lib/command/client.ts (proven in production).
 */

import type { CommandFailureReason, CommandResult } from './types';

const TIMEOUT_MS = 5_000;
const MAX_RETRIES = 2; // total attempts = 1 + MAX_RETRIES, GET only
const BREAKER_THRESHOLD = 4; // consecutive failures before opening
const BREAKER_COOLDOWN_MS = 15_000;

// In-memory circuit breaker, isolated PER TENANT (per server instance). One
// org's outage must never trip the breaker for another, so each authTenantId
// gets its own failure streak + cooldown.
interface BreakerState {
  consecutiveFailures: number;
  openUntil: number;
}
const breakers = new Map<string, BreakerState>();

function getBreaker(tenantId: string): BreakerState {
  let b = breakers.get(tenantId);
  if (!b) {
    b = { consecutiveFailures: 0, openUntil: 0 };
    breakers.set(tenantId, b);
  }
  return b;
}

/** Is this tenant's circuit currently open (fail-fast window)? */
function isOpen(tenantId: string): boolean {
  const b = breakers.get(tenantId);
  return b ? Date.now() < b.openUntil : false;
}

/**
 * Per-tenant circuit-breaker snapshot for diagnostics (the health endpoint).
 * `openForMs` is the remaining cooldown (0 when closed).
 */
export function getCircuitState(tenantId: string | null): {
  open: boolean;
  consecutiveFailures: number;
  openForMs: number;
} {
  if (!tenantId) return { open: false, consecutiveFailures: 0, openForMs: 0 };
  const b = breakers.get(tenantId);
  if (!b) return { open: false, consecutiveFailures: 0, openForMs: 0 };
  const openForMs = Math.max(0, b.openUntil - Date.now());
  return { open: openForMs > 0, consecutiveFailures: b.consecutiveFailures, openForMs };
}

interface CommandConfig {
  baseUrl: string;
  clientId: string;
  clientSecret?: string;
}

/** Read + validate Command config; null when not configured (→ standalone). */
function getConfig(): CommandConfig | null {
  const baseUrl = process.env.COMMAND_BASE_URL;
  const clientId = process.env.COMMAND_SERVICE_CLIENT_ID;
  if (!baseUrl || !clientId) return null;
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    clientId,
    clientSecret: process.env.COMMAND_SERVICE_CLIENT_SECRET || undefined,
  };
}

/** Is Command configured at all? (env present) */
export function isCommandConfigured(): boolean {
  return getConfig() !== null;
}

function recordSuccess(tenantId: string): void {
  const b = getBreaker(tenantId);
  b.consecutiveFailures = 0;
  b.openUntil = 0;
}

function recordFailure(tenantId: string): void {
  const b = getBreaker(tenantId);
  b.consecutiveFailures += 1;
  if (b.consecutiveFailures >= BREAKER_THRESHOLD) {
    b.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
  }
}

function fail(reason: CommandFailureReason, status?: number, message?: string): CommandResult<never> {
  return { ok: false, reason, status, message };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Make an authenticated GET to Command for a given tenant (its 3PM authTenantId).
 * Returns the parsed JSON body on success, or a typed failure — never throws.
 */
export async function commandRequest<T = unknown>(
  path: string,
  authTenantId: string,
  opts?: { timeoutMs?: number },
): Promise<CommandResult<T>> {
  const cfg = getConfig();
  if (!cfg) return fail('not_configured');
  if (!authTenantId) return fail('bad_request', undefined, 'Missing authTenantId');

  const timeoutMs = opts?.timeoutMs ?? TIMEOUT_MS;

  // Circuit open for THIS tenant → fail fast (don't hammer a struggling Command).
  if (isOpen(authTenantId)) return fail('unreachable', undefined, 'circuit open');

  const url = `${cfg.baseUrl}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Client-Id': cfg.clientId,
    'X-Tenant-Id': authTenantId,
  };
  if (cfg.clientSecret) headers['X-Client-Secret'] = cfg.clientSecret;

  let lastReason: CommandFailureReason = 'unreachable';
  let lastStatus: number | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method: 'GET', headers, signal: ac.signal, cache: 'no-store' });
      clearTimeout(timer);

      if (res.ok) {
        recordSuccess(authTenantId);
        return { ok: true, data: (await res.json()) as T };
      }

      lastStatus = res.status;
      // A 4xx means Command answered — it's reachable, just rejecting this
      // request (auth / not-found / bad input). That is NOT an outage, so it
      // must not trip the breaker. Reachability is proven → reset the streak
      // and return immediately (these won't fix on retry).
      if (res.status === 401 || res.status === 403) {
        recordSuccess(authTenantId);
        return fail('unauthorized', res.status);
      }
      if (res.status === 404) {
        recordSuccess(authTenantId);
        return fail('not_found', res.status);
      }
      if (res.status < 500) {
        recordSuccess(authTenantId);
        return fail('bad_request', res.status);
      }
      // 5xx → Command is unhealthy → transient, retry (counts on exhaustion).
      lastReason = 'unreachable';
    } catch {
      clearTimeout(timer);
      // Timeout / network error → transient, retry.
      lastReason = 'unreachable';
    }

    if (attempt < MAX_RETRIES) await sleep(200 * (attempt + 1)); // small backoff
  }

  recordFailure(authTenantId);
  return fail(lastReason, lastStatus);
}

/**
 * Make an authenticated WRITE (POST/PATCH) to Command for a tenant.
 *
 * Unlike GET, writes are NOT retried — Command's write endpoints are not
 * guaranteed idempotent, so a retry could double-apply. A non-2xx is surfaced
 * as a typed failure with the parsed error message so callers can distinguish
 * a rejection (`bad_request`) from Command being unreachable (`unreachable`).
 */
export async function commandWrite<T = unknown>(
  path: string,
  authTenantId: string,
  method: 'POST' | 'PATCH',
  body: unknown,
  opts?: { actorEmail?: string },
): Promise<CommandResult<T>> {
  const cfg = getConfig();
  if (!cfg) return fail('not_configured');
  if (!authTenantId) return fail('bad_request', undefined, 'Missing authTenantId');
  if (isOpen(authTenantId)) return fail('unreachable', undefined, 'circuit open');

  const url = `${cfg.baseUrl}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Client-Id': cfg.clientId,
    'X-Tenant-Id': authTenantId,
  };
  if (cfg.clientSecret) headers['X-Client-Secret'] = cfg.clientSecret;
  // Who actually performed this action (the Asset Manager user). Command
  // attributes the resulting record to a tenant user matching this email; if
  // none matches it shows the email itself — never the owner. Email only (a
  // stable id) so a name change on either side never matters.
  if (opts?.actorEmail) headers['X-Actor-Email'] = opts.actorEmail;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: JSON.stringify(body ?? {}),
      signal: ac.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);

    if (res.ok) {
      recordSuccess(authTenantId);
      return { ok: true, data: (await res.json()) as T };
    }

    // Pull Command's error message for surfacing to the user.
    let message: string | undefined;
    try {
      const parsed = (await res.json()) as { error?: string };
      message = parsed?.error ?? undefined;
    } catch {
      /* non-JSON body */
    }

    // A 4xx means Command answered — reachable, just rejecting this write.
    // That's a business/client outcome, NOT an outage, so it must not trip the
    // breaker. Reachability is proven → reset the streak and return the typed
    // rejection.
    if (res.status < 500) {
      recordSuccess(authTenantId);
      if (res.status === 401 || res.status === 403) return fail('unauthorized', res.status, message);
      if (res.status === 404) return fail('not_found', res.status, message);
      return fail('bad_request', res.status, message);
    }
    // 5xx → Command is unhealthy → count toward the breaker.
    recordFailure(authTenantId);
    return fail('unreachable', res.status, message);
  } catch {
    clearTimeout(timer);
    recordFailure(authTenantId);
    return fail('unreachable', undefined, 'network error / timeout');
  }
}
