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
  | 'stock';

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
