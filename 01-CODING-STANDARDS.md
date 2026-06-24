# Coding Standards & Tech Stack — Fleet Platform (Whip Around reference)

> Tell the assistant / every developer: **"Follow 01-CODING-STANDARDS.md for every file and line."**
> Clarity beats cleverness — always. Applies to every file and line.

This is a multi-tenant **fleet operations platform** (a reference of whiparound.com): drivers run
digital vehicle inspections on mobile → defects/faults flow into maintenance work orders →
managers track compliance, parts, and cost from a web portal. See
**`02-BACKEND-ARCHITECTURE.md`** for collections, menus, RBAC, and the auth/tenant model.

**The stack and conventions below mirror the existing "Command" platform exactly** — same
libraries, same folder layout, same patterns — so the two codebases stay consistent and nothing has
to be relearned.

---

## 0. Tech Stack (identical to Command)

| Layer | Technology |
|-------|-----------|
| **Framework** | **Next.js (App Router)** + **React** + **TypeScript** |
| **Styling** | **Tailwind CSS** + **Radix UI** (shadcn-style components in `components/custom-ui/`) |
| **Client state** | **Zustand** — one store per domain (`store/<domain>/store.ts`), selective reads |
| **Server data** | Server Components / Route Handlers (`app/api/.../route.ts`); business logic in `controller/<domain>/` and `services/<domain>/` |
| **HTTP client** | **Axios** — one configured instance (`lib/api-client.ts`) + `unwrapResponse` + `BaseResponse<T>` |
| **Validation** | **Custom validators** (`lib/validation/commonValidators.ts`) + inline field checks + TS input interfaces — **required on every form** (no Zod/ODM) |
| **Backend / API** | Next.js Route Handlers — **thin**; they authenticate, validate, then call controllers/services |
| **Database** | **MongoDB native driver** via `lib/mongodb.ts` `getXCollection()` helpers — **NOT Mongoose / no ODM** |
| **Auth** | **3pm-auth** (external) — `getAuthenticatedUser()` per request → `{ userId, tenantId, role }`; Redis-backed session cache; **no local passwords, no bcrypt** (see §12) |
| **Indexes** | Centralized in `lib/setup-indexes.ts` (compound, tenant-led) |
| **File storage** | Azure Blob storage (inspection photos, signatures, documents) |
| **Tooling** | ESLint + Prettier + TypeScript **strict** mode |
| **Icons** | **lucide-react** (single icon library) |
| **Background jobs** | **Deferred for now** — no worker service in v1. Reminders, PM-due checks, and telematics sync are added later via a worker (Command already has a worker pattern to follow). See §15. |

> **Responsive web app — no React Native, no native build.** It is one web app used on desktop and
> in the phone browser. The driver inspection flow is mobile-first (camera capture, large touch
> targets) and runs in the browser — design those screens phone-first.

> Keep the stack consistent — never add a new library when one above already covers the need.

---

## 1. Core Principles

- ♻️ **DRY** — write logic/UI **once**. If it appears twice, extract a component/hook/util/constant.
- 🧩 **Reusable** — small generic building blocks (`Button`, `Input`, `Card`, `DataTable`) that adapt via **props**.
- 🧼 **Clean** — clear names, small files, **one job per file**, no dead code or leftover logs.
- 🟢 **Simple** — short functions, no unnecessary complex logic, no clever tricks.
- 🧷 **Typed** — types for all props, params, returns, and API payloads. No `any` (unless commented).
- ⚡ **Optimized** — no prop drilling, no unnecessary re-renders, fresh data, light bundle.
- 🔐 **Secure** — never trust the client; **re-validate and re-check permissions + tenant on the server, every time.**

> **Rule of thumb:** if it appears twice, refactor it. If it's hard to read, split it.

---

## 2. Folder Structure — mirrors Command

```
app/                  # routes; app/api/<domain>/route.ts + [id]/route.ts handlers (thin)
components/           # ui/, custom-ui/ (Radix/shadcn), common/, domain composites
controller/<domain>/  # business logic: index.ts, types.ts, utils/ — handlers call these
services/<domain>/    # cross-cutting server logic
lib/                  # mongodb.ts, api-client.ts, auth-3pm.ts, auth-helper.ts, auth-cookies.ts,
                      #   validation/commonValidators.ts, setup-indexes.ts, rbac/
store/<domain>/       # Zustand stores (store.ts)
constants/            # single sources of truth (enums, label/status maps, config)
types/<domain>/       # shared TS types (incl. BaseResponse)
hooks/                # reusable client logic (use-prefixed)
utils/                # pure helpers
```

- Files are **small and single-purpose**; name them for what they export.
- Generic UI in `components/ui/` and `components/custom-ui/`; domain composites in their own subfolder.
- **The TS interface (`controller/<domain>/types.ts`), the validators, and the collection's field
  table all mirror each other** — same field names, same enums.

---

## 3. Single Source of Truth (DRY)

Any value used in more than one place lives in **one** `constants/` file and is imported. Never
hardcode the same thing twice. Derive types from data so they can never drift.

```ts
// constants/work-order.ts
export const WORK_ORDER_STATUSES = ['open', 'in_progress', 'on_hold', 'completed', 'closed'] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

// Lookup map instead of if/else chains — every component reads the same source.
export const WORK_ORDER_STATUS_META: Record<WorkOrderStatus, { label: string; tone: BadgeTone }> = {
  open:        { label: 'Open',        tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'pending' },
  on_hold:     { label: 'On hold',     tone: 'warning' },
  completed:   { label: 'Completed',   tone: 'success' },
  closed:      { label: 'Closed',      tone: 'muted'   },
};
```

The **same `as const` enum feeds the server-side validator (membership check) and the UI label
map** — never retype it. Business policy (limits, default rates, quotas) comes from the server
(`tenantSettings`), never hardcoded on the client.

---

## 4. Reusable Components

Built once, with a typed `Props`, defaults, and variants via **lookup maps** (not JSX ternaries).

```tsx
type Variant = 'primary' | 'secondary' | 'danger';
type Props = { label: string; onClick: () => void; variant?: Variant; loading?: boolean; disabled?: boolean };

const containerByVariant: Record<Variant, string> = {
  primary:   'bg-emerald-600 text-white',
  secondary: 'bg-transparent border border-gray-300 text-gray-900',
  danger:    'bg-red-50 border border-red-200 text-red-600',
};

export function Button({ label, onClick, variant = 'primary', loading = false, disabled = false }: Props) {
  const isInactive = disabled || loading;
  return (
    <button onClick={onClick} disabled={isInactive}
      className={`h-12 rounded-md px-4 font-semibold ${containerByVariant[variant]} ${isInactive ? 'opacity-50' : ''}`}>
      {loading ? <Spinner /> : label}
    </button>
  );
}
```

- One `Props` type per component; optional props get defaults. A new variant is added in one place.
- No magic values — colours/spacing from shared tokens. Keep components presentational.
- Build a generic **`DataTable`** (sortable columns, pagination, row actions, archive toggle) once
  and reuse it for every list module (Assets, Inspections, Work Orders, Parts, …).

---

## 5. No Prop Drilling

Never thread a prop through 3+ layers to reach a deep child.

- **Global state** (auth/session, current tenant, theme, permissions) → **Zustand store**, read directly.
- **Subtree-only state** (a form, wizard, modal) → **scoped React Context**.
- **Server data** → fetch in a Server Component at the right level.
- If a prop is only passed *through* a component (not used by it), lift it to context/store.

```ts
const user = useSessionStore(s => s.user);        // ✅ read directly — no threading
const can  = usePermissions(s => s.can);          // ✅ RBAC check available everywhere
```

---

## 6. API / Data Layer

One configured Axios client; **one typed function per endpoint**. Components never call raw `fetch`
inline. Every response uses the `{ data, error }` envelope; unwrap to clean typed data.

```ts
// lib/api/work-orders.ts
import apiClient, { unwrapResponse } from '@/lib/api-client';

export async function getWorkOrder(id: string): Promise<WorkOrder> {
  const res = await apiClient.get<BaseResponse<{ item: WorkOrder }>>(`/api/work-orders/${id}`);
  return unwrapResponse(res.data).item; // return clean, typed data — not the envelope
}
```

Base URL / credentials / interceptors configured **once** in `lib/api-client.ts`. One short
doc-comment per function.

---

## 7. Fresh Data, Always

Stale screens are a bug.

- Server Components fetch fresh per request; set caching deliberately (`no-store` / `revalidate`).
- **After a mutation, revalidate immediately** (`revalidatePath`/`revalidateTag`, or refetch in the
  Zustand store) so the UI updates without a manual refresh.
- **No infinite scrolling** — use clear **pagination** (`page`/`limit`, "Load more" or page numbers).
- Refetch on focus/navigation where data goes stale quickly (e.g. open defects, work-order status).

---

## 8. No Unnecessary Re-renders

- Read state **selectively** (`useStore(s => s.item)`), not the whole store.
- Use `'use client'` only where interactivity is needed; keep the rest Server Components.
- Stable refs (`useCallback`/`useMemo`/`memo`) **where it measurably matters**, not everywhere.
- Keep state local and low in the tree; stable list keys (real `_id`, never index).
- Litmus test: typing one char in a field should re-render only that field — not the page.

---

## 9. Backend Standards

- **Never trust the client** — re-validate and re-authorize on the server every time.
- **`getAuthenticatedUser(req)` is the first call in every route handler** — it resolves
  `{ userId, tenantId, role }` from the verified 3pm-auth session (§12). `401` if absent.
- **Validate input** with the shared custom validators + inline checks **before** any handler logic;
  reject with `400` + a clear message. Cross-field rules are explicit controller checks (see §13).
- **Re-check permission + tenant** before touching data: `roleHasPermission(role, module, action)` →
  `403` on failure; inject `tenantId` into every query and every insert.
- Keep handlers **thin** — reusable logic lives in `controller/<domain>/` and `services/<domain>/`.
- **Consistent envelope** and meaningful status codes:

```ts
// Success (single):  { data: { item }, error: null }
// Success (list):    { data: { items, pagination: { page, limit, total, hasMore } }, error: null }
// Failure:           { data: null, error: "clear message" }   // or { code, message }
```
Codes: `400` bad request / validation · `401` unauthenticated · `403` forbidden (RBAC/tenant) ·
`404` not found · `409` conflict.

- **Pagination contract**: `page` (≥1), `limit` (1–100, default 25); always return
  `{ items, pagination: { page, limit, total, hasMore } }`.
- Side-effects (emails, push, notifications) **swallow their own errors** so they can't break the
  main flow.

---

## 10. RBAC Seam (structure now, matrix later)

We build the **enforcement seam now** and fill the role→permission **matrix later** — with no
schema change. Full model is in `02-BACKEND-ARCHITECTURE.md §C`.

- Every role stores a permission map: `scope: 'all' | 'modules'`, a per-module action set
  (`view/create/update/delete/export/bulkUpload`), plus `teamScoped` and `mobileOnly` flags.
- **Single chokepoint:** `roleHasPermission(role, module, action)` — returns `true` when
  `scope === 'all'`, else `modules[module]?.[action] === true`. Called before every handler body.
- `teamScoped` → inject `{ teamId: { $in: managedTeamIds } }` into queries; `mobileOnly` → `403`
  on web routes. **Menu visibility is cosmetic — never the only check.**

```ts
const { tenantId, role } = await getAuthenticatedUser(req);
if (!roleHasPermission(role, 'work_order', 'create')) return fail(403, 'forbidden');
```

---

## 11. TypeScript

- Types for all props, params, returns, and payloads. Avoid `any`.
- Derive unions from data (`as const` + `(typeof X)[number]`); the **same enum** powers the
  validator, the input interface, and the UI label maps.
- Reuse shapes with `Partial`/`Record`/`Pick`/`Omit`. Shared types in `types/`, imported never duplicated.
- Define request shapes as `CreateXInput` / `UpdateXInput` interfaces in `controller/<domain>/types.ts`.

---

## 12. Authentication & Tenancy (3pm-auth) — non-negotiable

- **All authentication is delegated to the external `3pm-auth` service** (same integration as
  Command: `lib/auth-3pm.ts`, `lib/auth-helper.ts`, `lib/auth-cookies.ts`, Redis-backed session
  cache). No password storage, no bcrypt, no local login logic — for **all users including drivers**.
- This is a **web app**: every browser (desktop and mobile) uses the session **cookie** → verify
  with 3pm-auth → resolve the local tenant → return `{ userId, tenantId, role }`. No native client.
- **Multi-tenant isolation is mandatory:** `tenantId` is on every document, every query filter,
  every insert, and leads every compound index. `tenantId` comes from the session — **never** from
  the request body. A missing/mismatched tenant is a hard `403`.
- Reuse the cookie set and switching behaviour of Command. **Admin impersonation is out of scope for
  now** — skip the `impersonation` cookies/flows. The auth/tenant layer **must pass the verification
  checklist** in `02-BACKEND-ARCHITECTURE.md §B` before any feature module is built.

---

## 13. Form & Field Validation (required) — Command's pattern

**Every create/update form validates every field server-side before any logic.** No endpoint
mutates data without checking input first.

- Reuse the shared helpers in `lib/validation/commonValidators.ts`
  (`isValidEmail`, `isValidObjectId`, `ensureRequiredString`, range/enum checks) — don't re-roll
  per handler. Add new shared validators there when a check repeats.
- Define the input shape as a TS interface (`CreateXInput`) in `controller/<domain>/types.ts`; the
  field table in the architecture doc is the source of the rules.
- Field-level rules are explicit: required + type + length/range; email via `isValidEmail`; ObjectId
  via `isValidObjectId`; enum membership against the `as const` array.
- **Cross-field rules are explicit controller checks**, e.g.:
  - `expires === true ⇒ expiryDate` is required (asset documents)
  - `scope === 'team' ⇒ teamIds` non-empty (schedules)
  - `itemType === 'multiple_choice' ⇒ options` non-empty (inspection template)
  - `endingOdometer >= startingOdometer` (fuel log)
- On failure return `400` with a clear message. The client mirrors the same rules for UX, but the
  **server is the trusted gate**.

---

## 14. Naming, Comments & Simplicity

- Comment the **why**, not the obvious what. One short doc-comment per component/hook/store/API fn.
- Descriptive, consistent names; no unclear abbreviations.
- Short, single-responsibility functions — extract a helper before one grows past ~30–40 lines or
  nests 3+ levels.
- No premature abstraction, but abstract the moment logic repeats twice.
- No dead code, commented-out blocks, or leftover `console.log`.

---

## 15. Background jobs — deferred (v1 has no worker)

- **v1 ships without a worker service.** Anything that would normally run in the background is
  handled synchronously or computed on read for now:
  - **PM service-program due-status** → computed at query time from `meterReadings` + program
    interval + last service (no scheduler yet).
  - **Reminders** (inspection due, document/license expiry) → surfaced as on-screen "due/overdue"
    lists; no push/email scheduling yet.
  - **Telematics / fuel-card sync** (`integrations`, `faults`) → connection + schema in place, but
    automatic polling is **off**; ingest manually/via webhook until the worker exists.
- **Later:** add a worker (Command's worker pattern) for scheduled PM checks, reminder
  notifications, and telematics polling. The data model already supports it (no schema change
  needed) — see architecture doc §H.

---

## Done checklist (per PR)

- [ ] No copy-paste — repeated logic/UI extracted; one enum feeds the validator + UI
- [ ] Everything typed; single source of truth, not hardcoded twice
- [ ] No prop drilling — global/shared state via store/context
- [ ] Fresh data instantly (revalidate after mutations); pagination, not infinite scroll
- [ ] No unnecessary re-renders or complex logic
- [ ] `getAuthenticatedUser()` first; server re-validates input (custom validators) and re-checks permission **+ tenant**
- [ ] Every form validates every field server-side (field + cross-field), `400` on failure
- [ ] Small single-purpose files; shared tokens for styling; comments explain the non-obvious
