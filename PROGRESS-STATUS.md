# 3PM Asset Manager — Flow Study & Pending Work

_Fleet management web app. Inspections done on the website via form-builder-portal forms._
_Scope excludes Dashboard, Help & Support, **and all external integrations (advanced phase)**._
_As of 2026-06-30, commit `125034b`._

## Overall: ~70% done (excl. Dashboard / Help / Support / external integrations)

Big jump since last check (~30%). Every module now has its **CRUD backbone + UI** built.
What remains is the **wiring/intelligence layer**: RBAC enforcement, maintenance event
side-effects, inspection reporting views, the WO parts/labor model, and Fuel — all buildable
without any third-party service. External integrations are deferred to an advanced phase.

| Area | Status | % |
|---|---|---|
| Auth & Identity (3pm-auth login, invitations) | ✅ Working end-to-end | 100% |
| RBAC | 🟠 Defined but **NOT enforced** | 40% |
| Users / Roles / Teams / Drivers | ✅ Built (CRUD + UI) | 90% |
| Assets / Asset Types | ✅ Built (CRUD + UI) | 100% |
| Inspections + Form-builder | 🟢 Core works; 2 report stubs | 75% |
| Maintenance chain | 🟡 CRUD done; side-effects missing | 65% |
| Vendors | 🟢 CRUD done; no public/magic-link | 85% |
| Settings | 🟠 Partial (inventory + WO statuses only) | 40% |
| Fuel | 🔴 Stub ("coming soon") | 5% |
| Dashboard | ⚪ Placeholder (excluded) | — |

---

## Flow 1 — Auth & Identity ✅ WORKING

- **Login**: `/api/auth/login` → 3pm-auth IdP → `/api/auth/callback` exchanges token,
  provisions local user/tenant/role/tenantMember, sets `session` + `current_tenant_id` cookies.
- **Per-request**: `getAuthenticatedUser()` verifies token, resolves local `userId` + current
  tenant (cookie → JWT tenant → first active membership). Mobile path via Bearer/session token.
- **Invitations**: create (`POST /api/users`) → hashed token + SendGrid email → accept page
  `/invite/accept` → first login activates the pending `tenantMember`. Complete, no gaps.

## Flow 2 — RBAC 🟠 DEFINED, NOT ENFORCED  ← key gap
- `src/lib/rbac/index.ts` defines `roleHasPermission` / `isTeamScoped` / `isMobileOnly` and a
  module/action matrix. **Roles UI is fully built** (`role-form.tsx` 404 lines = editable
  permission matrix).
- **But no API route or controller ever calls these helpers** (grep = 0 hits). Every route only
  checks that a user is logged in. So permissions can be edited but do nothing.
- Team-scoped filtering and mobile-only gating are also unwired.

## Flow 3 — Inspection + Form-builder 🟢 CORE WORKS
End-to-end working:
1. **Seed/build forms** — `prestart-form-templates.ts` (Light/Heavy/Plant) → `POST /api/forms/seed-prestart`
   creates + publishes in form-builder-portal via its `/api/embed/*` API.
2. **Sync back** — form-builder webhook (`/api/forms/webhook`) stores published schema in local `forms`.
3. **Defect Settings** — `/inspections/forms/[formId]/defect-settings` reads the LIVE schema, lists
   eligible choice fields, lets admin tick "bad" answers + severity. Fully dynamic. (`defect-settings-page.tsx`, 307 lines.)
4. **Fill form** — embedded form-builder iframe (`/inspections/forms`).
5. **Submit → auto-defect** — three paths all work (webhook / `sync-submissions` / direct
   `/api/inspection-submissions`): `evaluator.ts` maps ticked answers → defects, sets pass/fail,
   writes `inspectionSubmissions` + `defects` rows with severity/priority.

**Pending:**
- 🔴 **Inspection History** page — stub ("coming soon"). Data exists in `inspectionSubmissions`.
- 🔴 **Exception Report** page — stub. Should list `result='fail'` + linked defects.
- 🟡 **No native form renderer** — users fill inspections only inside the form-builder iframe;
  there's no in-app render of the schema (matters for a clean driver/mobile experience).
- 🟡 Minor: submissions can save with `assetId=null` (then no defect created); sync skips forms
  not yet synced with no retry; webhook key compare isn't constant-time.

## Flow 4 — Maintenance chain 🟡 CRUD DONE, WIRING MISSING
All seven modules have full CRUD + substantial UI: **Defects, Work Orders, Service Tasks,
Service Programs, Parts/Inventory, Purchase Orders, Vendors** (+ inventory-settings lookups,
custom work-order-statuses with valid-transition maps).

**The event side-effects that make it a "flow" are not wired:**
- 🔴 **WO has no parts/labor/defect model.** `work-orders/types.ts` = asset + serviceTaskIds +
  assignee + status + attachments only. No `partLines`, no `laborLines`, no cost, no `defectIds`.
  So a WO can't itemize parts/labor or link back to the defect that caused it.
- 🔴 **Parts → inventory deduction**: not implemented (no WO part lines to deduct).
- 🔴 **PO received → inventory increment**: `transitionPurchaseOrderStatus` changes status but
  never updates `parts` stock.
- 🔴 **Service program threshold → auto-create WO**: triggers (time/distance/hours) are stored,
  but nothing evaluates due-status or creates WOs (no worker; deferred per blueprint).
- 🔴 **Reorder-point alerts**, **defect→WO auto-create**, **WO approval gate enforcement**,
  **defect `isOutOfService` → asset status**: none wired.
- 🔴 **Vendor public/magic-link access** (`publicEditAccess` exists, no public route).

## Flow 5 — Assets / Teams / Drivers ✅ Built
Full CRUD + UI (asset list/detail/new/edit with odometer, teams, asset-types, QR; team
asset/driver assignment; driver CRUD with license/team).

## Settings 🟠 Partial
Built: inventory lookups (units, categories, locations, manufacturers) + work-order statuses.
Missing: company info, localization, maintenance rates, notifications, tax, fuel, integrations,
audit log (mostly deferred-to-constants per blueprint).

## Fuel 🔴 / Dashboard ⚪
Fuel = "coming soon" stub, no backend. Dashboard = hardcoded `—` cards (excluded from scope).

---

## Pending work — prioritized

**P1 — makes existing flows actually work**
1. Enforce RBAC: call `roleHasPermission` in route handlers (+ team-scope filter, mobile gate).
2. Build **Inspection History** + **Exception Report** pages (data already exists).
3. Add **parts + labor line items to Work Orders** (model + UI), then wire **inventory auto-deduct**.
4. Wire **PO "received" → inventory increment**.

**P2 — preventative + collaboration**
5. Service-program due evaluation → auto-create WO (compute-on-read or a worker).
6. Reorder-point alerts; defect→WO auto-create + back-link; WO approval-gate enforcement.
7. Vendor public magic-link view for assigned WOs/defects.
8. Native in-app inspection form renderer (driver-friendly).

**P3 — remaining modules / polish**
9. Fuel module (import + per-asset tracking).
10. Settings tabs (company, rates, notifications, audit log).
11. Reminders / Driver Wallet / Wellness (blueprint Phase 5).
12. Dashboard metrics (excluded for now).

---

# Whip Around parity — flows & services

_Source: `02-BACKEND-ARCHITECTURE.md` §0 + §I parity map, `FLEET_MANAGEMENT_BLUEPRINT.md` pipelines._
Legend: ✅ done · 🟡 partial · 🔴 missing/stub · ⚪ intentionally excluded.

## The Whip Around flows (end-to-end processes)

Core philosophy: **Detect → Assign → Resolve → Record.**

| # | Flow | Whip Around behaviour | Build status |
|---|---|---|---|
| 1 | **Detect → Assign → Resolve → Record** | inspection/fault/manual → WO → fix → history+cost+meter | 🟡 Detect✅ Assign✅ Resolve(status)✅ **Record❌** |
| 2 | **Reactive maintenance** (Inspection → Fix) | failed item → Defect → Work Order → parts+labor → service history | 🟡 insp→defect✅; defect→WO manual & **unlinked**; WO has **no parts/labor**; **no service history** |
| 3 | **Preventative maintenance** (scheduled service) | Service Program due (time/dist/hours) → auto Work Order + reminder | 🔴 triggers stored; **no due-eval, no auto-WO, no reminder** |
| 4 | **Procurement** (inventory → purchase → restock) | low stock → PO → approve → receive → inventory ++ | 🟡 PO CRUD+approval+receive-status✅; **receive→inventory❌, low-stock→PO❌** |
| 5 | **Compliance monitoring** (exception tracking) | scheduled DVIRs → missed → Exception Report → attend → export | 🔴 **stub**; no schedule/missed-detection |
| 6 | **Fuel tracking** | fuel logs / card import → economy per asset | 🔴 **stub** |

## Whip Around capabilities (§I feature-parity map)

| Whip Around feature | Maps to | Build status |
|---|---|---|
| Assets + VIN, mileage, engine hours, photos, bulk upload, column views | `assets`, `meterReadings`, custom fields | 🟡 assets/VIN/odometer/engineHours/photos/columns ✅; **bulk upload ❌, custom fields ❌, meter history ❌** |
| Telematics import of mileage / engine hours | `meterReadings` + `integrations` | ⚪ advanced phase |
| QR / barcode scan-to-inspect | `assets.qrCode` | 🔴 field only, no scan flow |
| Digital inspections (DVIR) + photo, signature, mileage, GPS | `inspections` (+geo, signature) | 🟡 via form-builder (photo/signature/odometer in templates) ✅; **native GPS/geo ❌** |
| Inspection form builder + template library + DOT templates | form-builder-portal / `inspectionTemplates` | 🟡 builder ✅ + 3 seed templates; **full library / DOT ❌** |
| Driver Wellness / COVID questionnaires | `inspectionTemplates.templateType` | 🔴 missing |
| Defects/Issues: status, priority, photos, **comments** | `defects` + `comments` | 🟡 status/priority/severity/attachments ✅; **no comments system** |
| Work Orders: assign, custom statuses, **approval, recurring, deadline, labor/parts, costs, time, signature, notes** | `workOrders` + `comments` | 🟡 assign/custom-statuses/deadline/attachments/history ✅; **labor/parts/costs ❌, approval ❌, recurring ❌, signature ❌** |
| Faults (DTC from telematics) | `faults` | ⚪ advanced phase |
| Service Programs (4 cat) + Service Tasks + schedules + reminders + auto-WO | `servicePrograms`, `serviceTasks`, `serviceHistory` | 🟡 programs+tasks+triggers CRUD ✅; **due-eval/reminders/auto-WO/service-history ❌** |
| Parts & inventory (multi-location, reorder, auto-deduct) | `parts` (+stockLocations) | 🟡 parts/locations/reorderPoint ✅; **auto-deduct ❌, reorder alert ❌** |
| Purchase Orders + receiving + suppliers | `purchaseOrders`, `vendors` | 🟡 PO+approval+receive-status & vendors ✅; **receive→inventory ❌** |
| Fuel management + economy (+ ⚪ card import = advanced) | `fuelLogs` | 🔴 stub (manual logs in scope) |
| Wallet — asset **and** driver documents + expiry reminders | `documents` | 🟡 collection + upload + expiry index ✅; **wallet UI / expiry reminders ❌** |
| Users, Drivers, Teams, roles & permissions, cross-team driver access | `members`, `teams`, `roles`, `invitations` | 🟡 all CRUD + invitations ✅; **RBAC not enforced** |
| Reminders & notifications (email/push/SMS/in-app) | `notifications` + worker | 🔴 only SendGrid invite email; **no notifications/worker** |
| Exception report (missed inspections) + attend + export | `exceptionReports` + export | 🔴 stub |
| Integrations (Samsara, Geotab, Motive, Verizon Connect, fuel cards) | `integrations` | ⚪ advanced phase |
| Settings: company, language, timezone, units, tax, data retention, mobile, subscription | `tenantSettings` | 🟡 only inventory lookups + WO statuses |
| Audit / compliance records + export | `auditLog` + export | 🔴 missing |
| Multi-company switcher | 3pm-auth tenant switch | ✅ |
| Magic-link / SMS driver login | 3pm-auth (browser) | ✅ delegated |
| Per-tenant human IDs (WO-/PO-/INS-/DEF-) | `counters` | ✅ |
| Dashboard / leaderboards · Help/Support · Referral/bonus · all external integrations | — | ⚪ excluded / advanced phase |

## Services in use now (in-scope plumbing)

| Service | Used for | Status |
|---|---|---|
| **3pm-auth** | login, tenants, magic-link/SMS, switcher | ✅ wired |
| **Azure Blob / S3** | photos, signatures, files | ✅ `lib/s3.ts` + upload routes |
| **form-builder-portal** (embed API + Puppeteer PDF) | inspection forms, submissions, PDF | ✅ forms/submissions; 🟡 PDF export not wired |
| **SendGrid** | email | 🟡 invitations only (extend to reminders/alerts) |

## ⚪ Advanced phase — EXCLUDED for now (per decision 2026-06-30)

All external integrations are deferred to a later phase and are **not counted** in the
completion figure or pending list above:

- **Telematics** — Samsara, Geotab, Motive, Verizon Connect (mileage/hours import + DTC faults)
- **Fuel cards** — WEX, Fleetcor (auto fuel import)
- **Comms** — Slack, MS Teams notifications
- **VIN decoder** — DataOne (auto-fill asset specs; the `vin` field itself exists)
- **Background worker** — BullMQ scheduling for telematics/fuel polling (PM-due *compute* can be
  done on-read without it; only scheduled push/SMS dispatch truly needs it)

This also de-scopes the **Faults (DTC)** and **telematics import** parity rows, since both only
exist to consume telematics. Manual fuel logging + economy stays in scope; only fuel-**card** import is deferred.
