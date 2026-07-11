/**
 * Shared types for the Command (construction-portal) integration.
 * Server-side only — mirrors 3pm-dispatch-portal's lib/command/types.ts.
 */

/** The master entities Asset Manager can read from Command. */
export type CommandEntity =
  | 'assets'
  | 'staff'
  | 'suppliers'
  | 'locations'
  | 'stock'
  | 'units';

/** A normalized picker option (Command shape → Asset Manager shape). */
export interface CommandOption {
  id: string;
  name: string;
  code?: string;
}

/** Why a Command call didn't return data — drives the connection state machine. */
export type CommandFailureReason =
  | 'not_configured' // env not set (treated as standalone upstream)
  | 'unauthorized' // service credential rejected (4xx auth)
  | 'not_found' // endpoint/tenant not found (404)
  | 'bad_request' // 4xx other than auth
  | 'unreachable'; // timeout / network / 5xx / circuit open

/** Discriminated result — callers branch on `ok`, never throw. */
export type CommandResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: CommandFailureReason; status?: number; message?: string };

/**
 * Human-readable description of a Command failure for API error responses.
 * Always use this instead of a generic "couldn't reach Command" string — a
 * timeout, an auth rejection and a missing endpoint need different fixes, and
 * collapsing them makes production issues undiagnosable from the UI.
 */
export function describeCommandFailure(
  res: { reason: CommandFailureReason; status?: number; message?: string },
  what = 'complete the request',
): string {
  switch (res.reason) {
    case 'not_configured':
      return `Command is not configured on this server — connect to Command first.`;
    case 'unauthorized':
      return `Command rejected the request (${res.status ?? 'auth'}). Check the connector service credentials.`;
    case 'not_found':
      return `Command answered but the endpoint or tenant was not found (404). The Command deployment may be outdated.`;
    case 'bad_request':
      return `Command rejected the request${res.status ? ` (${res.status})` : ''}${res.message ? `: ${res.message}` : ''}.`;
    case 'unreachable':
    default:
      return `Command timed out or is unreachable — couldn't ${what}. Try again shortly.`;
  }
}
