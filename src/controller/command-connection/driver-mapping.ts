/**
 * Shared Command-staff → driver field mapping.
 *
 * ONE mapper used by every path that writes a driver record from a Command
 * staff row (manual import, per-person role import, and the auto-sync), so the
 * copied profile fields can never diverge between paths. Command is the master
 * for these fields on connected tenants — overwriting local edits is the
 * intended "Command wins" semantic (AM already strips identity edits for
 * command-managed records).
 *
 * Deliberately NOT copied: pay rates (payroll data), licence photos (Command
 * file ObjectIds — not resolvable cross-app), licence endorsements (no AM
 * field for the endorsement structure).
 */
import type { CommandStaff } from '@/lib/command/fetchers';

/** `$set` fragment for upserting a driver doc from a Command staff record. */
export function commandStaffDriverFields(
  s: CommandStaff,
  now: Date,
): Record<string, unknown> {
  const firstName = s.firstName || s.name || 'Unknown';
  const lastName = s.lastName || '';

  return {
    commandStaffId: s.id,
    source: 'command',
    firstName,
    lastName,
    // Emails are lowercased by the fetcher; keep them that way so the
    // driver-by-email resolution (launch OWN-scope fallback) always matches.
    ...(s.email ? { email: s.email } : {}),
    ...(s.phone ? { mobileNumber: s.phone } : {}),
    ...(s.businessPhone ? { workPhone: s.businessPhone } : {}),
    ...(s.photoUrl ? { photoUrl: s.photoUrl } : {}),
    ...(s.employeeNumber ? { employeeNumber: s.employeeNumber } : {}),
    ...(s.licenseNumber ? { licenseNumber: s.licenseNumber } : {}),
    ...(s.dateOfBirth ? { dateOfBirth: new Date(s.dateOfBirth) } : {}),
    commandSyncedAt: now,
  };
}
