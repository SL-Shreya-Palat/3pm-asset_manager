/**
 * Per-entity fetchers (server-side only).
 *
 * Normalizes Command's (inconsistent) endpoint responses. Robust to the
 * per-endpoint shape differences: some return `data: [...]`, some
 * `data: { data: [...] }`, some `{ items }`, and items use `{label,value}`
 * or `{_id,name}`.
 */

import { commandRequest } from './client';
import type { CommandEntity, CommandOption, CommandResult } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Dropdown endpoints (lightweight {id,name}) — ideal for pickers + resolving. */
const ENDPOINTS: Record<CommandEntity, string> = {
  assets: '/api/assets/dropdown',
  staff: '/api/staff', // no dropdown variant — use the list
  suppliers: '/api/business-contact/dropdown',
  locations: '/api/company-location/dropdown',
  stock: '/api/stock/dropdown',
  units: '/api/units/dropdown',
};

/**
 * Full LIST endpoints (server-paginated) — used by the import flow, which needs
 * real paging + full records. All return
 * `{ data: { <items>, pagination: { totalCount, hasNextPage } } }`.
 */
const LIST_ENDPOINTS: Record<CommandEntity, string> = {
  assets: '/api/assets',
  staff: '/api/staff',
  suppliers: '/api/business-contact',
  locations: '/api/company-location',
  stock: '/api/stock',
  units: '/api/units',
};

export interface CommandPage {
  /** RAW Command records — import mappers translate them per entity. */
  items: Array<Record<string, unknown>>;
  total: number;
  hasMore: boolean;
}

/** Find the array in a `{ data, error }` body regardless of nesting/key. */
function extractArray(body: any): any[] {
  const d = body?.data;
  if (Array.isArray(d)) return d;
  if (d && typeof d === 'object') {
    for (const key of Object.keys(d)) {
      if (Array.isArray((d as any)[key])) return (d as any)[key];
    }
  }
  return [];
}

/**
 * Normalize one Command item → CommandOption. Handles both the dropdown shape
 * (`label`/`value`) and raw list-record shapes, whose name field varies per
 * entity.
 */
function toOption(it: any): CommandOption {
  const id = String(it.value ?? it._id ?? it.id ?? '');
  const name = String(
    it.label ??
      it.name ??
      it.fullName ??
      it.companyName ??
      it.assetDisplay ??
      it.assetRegistry?.assetDisplay ??
      '',
  ).trim();
  const codeRaw =
    it.code ?? it.customerCode ?? it.accountNumber ?? it.itemCode ?? it.assetCode;
  return { id, name, code: codeRaw != null ? String(codeRaw) : undefined };
}

/**
 * Fetch a master entity from Command as normalized options for one tenant.
 * `search` (when given) is forwarded to Command's endpoint.
 */
export async function getOptions(
  entity: CommandEntity,
  authTenantId: string,
  search?: string,
): Promise<CommandResult<CommandOption[]>> {
  let path = ENDPOINTS[entity];
  if (search?.trim()) {
    path += `${path.includes('?') ? '&' : '?'}search=${encodeURIComponent(search.trim())}`;
  }
  const res = await commandRequest<any>(path, authTenantId);
  if (!res.ok) return res;
  const options = extractArray(res.data)
    .map(toOption)
    .filter((o) => o.id);
  return { ok: true, data: options };
}

/**
 * One PAGE of a master entity from Command's full list endpoint (real paging).
 * Returns RAW records — the import mappers (lib/command/import mapping in the
 * controller) translate them into Asset Manager documents per entity.
 */
export async function getPage(
  entity: CommandEntity,
  authTenantId: string,
  opts: { page: number; limit: number; search?: string; query?: Record<string, string> },
): Promise<CommandResult<CommandPage>> {
  const params = new URLSearchParams({
    page: String(Math.max(1, opts.page)),
    limit: String(Math.max(1, opts.limit)),
  });
  if (opts.search?.trim()) params.set('search', opts.search.trim());
  for (const [k, v] of Object.entries(opts.query ?? {})) params.set(k, v);
  const res = await commandRequest<any>(
    `${LIST_ENDPOINTS[entity]}?${params.toString()}`,
    authTenantId,
  );
  if (!res.ok) return res;
  const items = extractArray(res.data).filter(
    (r: any) => r && (r._id || r.id || r.value),
  );
  const pg = res.data?.data?.pagination ?? {};
  const total = Number(pg.totalCount ?? pg.total ?? items.length);
  const hasMore = Boolean(pg.hasNextPage ?? opts.page * opts.limit < total);
  return { ok: true, data: { items, total, hasMore } };
}

/** Pull the record object out of a Command by-id response (shape varies). */
function extractRecord(body: any): any {
  const d = body?.data;
  if (!d || typeof d !== 'object') return null;
  if (d._id || d.id) return d; // record sits directly under `data`
  for (const k of Object.keys(d)) {
    const v = (d as any)[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && (v._id || v.id)) return v;
  }
  return null;
}

/**
 * Fetch ONE raw Command record by id. Used by the single-record auto-sync
 * (asset detail view) — returns the raw record so the import mappers can
 * translate it exactly as they do for a full page.
 */
export async function getRecord(
  entity: CommandEntity,
  id: string,
  authTenantId: string,
): Promise<CommandResult<Record<string, unknown>>> {
  const res = await commandRequest<any>(
    `${LIST_ENDPOINTS[entity]}/${encodeURIComponent(id)}`,
    authTenantId,
  );
  if (!res.ok) return res;
  const raw = extractRecord(res.data);
  if (!raw) return { ok: false, reason: 'not_found' };
  return { ok: true, data: raw };
}

export interface CommandStaff {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string | null;
  phone: string | null;
}

/* Command `/api/staff` row (only the fields we need). */
interface CommandStaffRow {
  _id?: string;
  id?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  mobile?: string;
}

/** Fetch the tenant's Command staff (up to 500), normalized for driver import. */
export async function getCommandStaff(
  authTenantId: string,
): Promise<CommandResult<CommandStaff[]>> {
  const res = await commandRequest<{ data?: { staff?: CommandStaffRow[] } }>(
    '/api/staff?limit=500',
    authTenantId,
  );
  if (!res.ok) return res;
  const raw = res.data?.data?.staff;
  const rows = Array.isArray(raw) ? raw : [];
  const staff = rows
    .map((r) => {
      const firstName = String(r.firstName ?? '').trim();
      const lastName = String(r.lastName ?? '').trim();
      const name =
        `${firstName} ${lastName}`.trim() || String(r.name ?? r.fullName ?? '').trim();
      const email = r.email ? String(r.email).toLowerCase().trim() : null;
      const phone = r.phone || r.mobile ? String(r.phone ?? r.mobile).trim() : null;
      return { id: String(r._id ?? r.id ?? ''), firstName, lastName, name, email, phone };
    })
    .filter((s) => s.id && (s.name || s.email));
  return { ok: true, data: staff };
}

/** Cheap reachability probe for a tenant (used by the connection state machine). */
export async function ping(authTenantId: string): Promise<CommandResult<CommandOption[]>> {
  return getOptions('locations', authTenantId);
}
