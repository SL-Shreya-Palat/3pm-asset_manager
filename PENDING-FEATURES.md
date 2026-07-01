# Pending Features — Build Guide

Whip Around functionality **not yet in the Asset Manager** (excludes Dashboard, Support, and Integrations/telematics). For each: **why it's needed**, the **ideal use case (flow)**, and **how to implement** it using our existing conventions.

## Conventions to reuse (so new features match the app)
- **Data:** MongoDB native driver. Add a `getXCollection()` in `src/lib/mongodb.ts`. Every doc carries `tenantId` first.
- **Backend:** `src/controller/<domain>/{index,types,utils}.ts` (CRUD + validation + `serializeX`). API in `src/app/api/<domain>/route.ts` + `[id]/route.ts`; first line `getAuthenticatedUser(req)`; envelope `{ data, error }`.
- **Role scoping:** `getUserRoleForTenant(userId, tenantId)` → full-access (owner/admin/manager) vs. scoped.
- **UI:** shared kit — `DataTable`/`DataTableToolbar`, `StatCard`, `Dialog`, `SearchInput`, `Badge`, slide-out form panel, `useDataTable`/`useDebouncedSearch`. Asset sub-features go as a **tab** on the asset detail page (see Fuel/Service/Meter tabs).
- **Notifications:** `notifyTenantManagers(tenantId, payload)` / `notifyUser(tenantId, userId, payload)` from `controller/notifications`; the header bell polls automatically.
- **Reference implementation:** the **servicing flow** (`service-programs` + `service-history` + `due-status` + asset Service tab + `service-schedule`) is the closest template for most of these.

## Scope

This doc lists **only pending features, in priority order** (built features are omitted). Last reviewed **2026-07-01**.

**Build order: 1 → 2 → 3 → 4 → 5 → 6.**  **#7 (Faults) is parked** — deferred until telematics integration is in scope.

---

## 1. Service — auto-create Work Order  *(smallest; groundwork done)*

**Context (already built):** the reminder **scan** (`controller/notifications/scan.ts` → `runNotificationScan`, via `GET /api/cron/notifications`) already **notifies** managers + the assigned driver/mechanic about service-due/overdue and overdue work orders (deduped). The programs already store `autoCreateWorkOrder` + `mechanicId`. **The only gap:** when a due program is flagged `autoCreateWorkOrder`, no work order is raised.

**Ideal use case:**
A service comes due on a program flagged **auto-create WO** → a work order is automatically raised and assigned to the configured mechanic (who is auto-notified) → no manual step.

### How to implement
1. In `controller/notifications/scan.ts`, add a `scanAutoCreateWorkOrders(tenantId)` branch and call it from `runNotificationScan` (alongside `scanServiceDue`). For each **due** `(asset, program)` whose `reminders.autoCreateWorkOrder` is true:
   - **skip** if an **open** (not completed, not archived) WO already exists for that `(assetId, program)` — prevents duplicates,
   - else `createWorkOrder({ assetId, serviceTaskIds: program.serviceTaskIds, source: 'service', assigneeType: 'mechanic', assigneeId: reminders.mechanicId, statusId: <default> })` → the mechanic is auto-notified inside `createWorkOrder`.
2. *(Optional)* a manual **"Run now"** button on the Service Schedule page (hitting a protected endpoint) to test without waiting for the cron.

> Pure wiring — `createWorkOrder`, the due engine, and the `reminders` config all already exist; no new fields/UI.

---

## 2. Wallet / Documents + Expiry Reminders

**Why:** Fleets must keep compliance docs current (registration, insurance, inspection cert, driver licence, medical card, permits). Expired docs = fines and grounded vehicles. This is a core Whip Around "Wallet" feature.

**Ideal use case:**
Upload a document to an **asset** or **driver** with an expiry date → the system tracks days-to-expiry → status shows **Valid / Expiring soon / Expired** → managers are notified before expiry → user renews and updates the date.

### 2a. Where documents attach (which modules / forms need them)

Documents are **attached to a parent record** via a reusable "Documents" section. Two scopes in phase 1 (a third is optional):

| Scope | Where it lives in the UI | Typical document types |
|---|---|---|
| **Asset** | Asset **detail page → new "Documents" tab** (next to Details / Service / Meter / Fuel). Also linkable from the Asset create/edit form as a sub-section. | Registration, Insurance, Inspection Certificate (COF/WOF), Road User Charges / Road Tax, Operating Permit, Warranty, Purchase/Lease agreement, Other |
| **Driver** | Driver **detail page → "Documents" tab** (People → Drivers → open driver). Also from the Driver create/edit form. | Driver's Licence, Medical Certificate, Endorsement (e.g. dangerous goods), Training Certificate, ID Card, Other |
| **Company** *(optional / phase 2)* | Settings → Documents | Operating Licence, Master Insurance Policy, Tax Certificate, Other |

> Build the Documents section **once** as a shared component parameterised by `{ scope, ownerId }`, then mount it on both the asset and driver detail pages (same pattern as reusing `WorkOrderForm` across pages).

### 2b. The "Add / Edit Document" form — exact fields

| Field | Input type | Required | Notes / validation |
|---|---|---|---|
| **Document type** | Select (enum — list depends on scope, see 2c) | ✅ | Drives the default title + which list it shows in |
| **Title / Name** | Text | – | Defaults to the type label; free text for "Other" |
| **File** | File upload (PDF, JPG, PNG, HEIC; ≤ 50 MB) | ✅ | Upload via existing `POST /api/upload/documents`; store returned `url` + `filename` |
| **Document number** | Text | – | Policy #, licence #, cert # (≤ 80 chars) |
| **Issuing authority** | Text | – | e.g. "NZTA", insurer name (≤ 120 chars) |
| **Issue date** | Date | – | Must be ≤ expiry date when both set |
| **Expiry date** | Date | – | Optional, but **required to get reminders**; drives status |
| **Reminder lead time** | Number (days) | – | Default **30**; "notify this many days before expiry" (0–365) |
| **Notes** | Textarea | – | ≤ 2000 chars |
| **Status** | *(derived — not an input)* | — | Computed badge: **Valid / Expiring soon / Expired / No expiry** (see 2d) |

### 2c. Document-type options (per scope)

```ts
// controller/documents/types.ts
export const ASSET_DOCUMENT_TYPES = [
  'registration', 'insurance', 'inspection_certificate', 'road_user_charges',
  'permit', 'warranty', 'purchase_lease', 'other',
] as const;

export const DRIVER_DOCUMENT_TYPES = [
  'drivers_licence', 'medical_certificate', 'endorsement',
  'training_certificate', 'id_card', 'other',
] as const;

export const DOCUMENT_SCOPES = ['asset', 'driver', 'company'] as const;
```

### 2d. Status rules (computed, not stored)

```
if (!expiresAt)                         → 'no_expiry'   (grey badge)
else if (now > expiresAt)               → 'expired'     (red badge)
else if (daysUntil(expiresAt) <= reminderDays) → 'expiring_soon' (amber badge)
else                                    → 'valid'       (green badge)
```

### 2e. Data model (`documents` collection — getter already exists)

```ts
{
  _id, tenantId,
  scope: 'asset' | 'driver' | 'company',
  ownerId: ObjectId,          // the asset / driver / (null for company)
  type: string,               // from the enum above
  title?: string,
  fileUrl: string,
  fileName?: string,
  number?: string,
  issuingAuthority?: string,
  issuedAt?: Date,
  expiresAt?: Date | null,
  reminderDays: number,       // default 30
  notes?: string,
  // reminder bookkeeping (idempotency, set by the scan job)
  lastRemindedAt?: Date | null,
  createdBy, updatedBy, createdAt, updatedAt,
  isArchived, archivedAt, archivedBy,
}
```
**Index:** `{ tenantId, scope, ownerId }` and `{ tenantId, expiresAt }`.

### 2f. Build steps (in order)

1. **Collection** — `getDocumentsCollection` already in `src/lib/mongodb.ts`. Add the two indexes to `setup-indexes.ts`.
2. **Types** — `controller/documents/types.ts`: the enums above + `DocumentDoc`, `CreateDocumentInput`, `UpdateDocumentInput`, `DocumentResponse` (include derived `status` + `daysUntilExpiry`).
3. **Utils** — `controller/documents/utils.ts`: `validateCreateDocumentInput` (custom validators, no Zod), `serializeDocument` (compute `status` per 2d), `computeDocumentStatus(expiresAt, reminderDays)`.
4. **Controller** — `controller/documents/index.ts`: `listDocuments(tenantId, { scope, ownerId })`, `createDocument`, `updateDocument`, `deleteDocument` (soft-archive), `listExpiring(tenantId, withinDays)` for the reminder scan + Exception Report.
5. **API** — `src/app/api/documents/route.ts` (GET list by `?scope=&ownerId=`, POST create) + `src/app/api/documents/[id]/route.ts` (GET/PUT/DELETE). First line `getAuthenticatedUser(req)`; envelope `{ data, error }`.
6. **UI — shared component** `components/documents/documents-section.tsx` props `{ scope, ownerId }`:
   - fetches `/api/documents?scope=&ownerId=`,
   - `DataTable` (Type / Title / Number / Expiry / **Status badge** / actions) + an "Add document" slide-out or `Dialog` using the fields in 2b (type list chosen by `scope`),
   - file upload via `/api/upload/documents`.
7. **Mount it:**
   - Asset detail page → add a **"Documents"** tab (`{ id: 'documents', label: 'Documents', icon: FileText }`) rendering `<DocumentsSection scope="asset" ownerId={assetId} />`.
   - Driver detail page → same, `scope="driver"`.
8. **Reminders** — in the shared reminder scan (see #1), also call `listExpiring` → `notifyTenantManagers` for docs `expiring_soon`/`expired`, guarded by `lastRemindedAt` (don't re-notify same day). Deep-link the notification to the asset/driver.
9. **(Optional)** Surface expiring/expired documents on the **Exception Report** (#4) and/or an "Expiring documents" `StatCard`.

---

## 3. Work Order Labor + Total Cost
**Why:** WOs track parts but not labor, so there's no true job cost. Whip Around WOs roll up labor + parts + tax into a total that feeds service history and reporting.

**Ideal use case:**
On a WO, add labor lines (hours × rate, or a flat amount) alongside parts → the WO shows **labor cost + parts cost + tax = total cost** → the total flows into the service-history entry on completion.

> **Key idea:** mirror the existing **Parts section** on the WO (same add-line / edit-qty / remove pattern) for **Labor**, then roll up a total.

### 3a. Where it lives
| Where | What |
|---|---|
| **Work Order form → new "Labor" section** | Below Parts; add/remove labor lines (same UX as Parts) |
| **Work Order view dialog** | A **cost summary**: Parts / Labor / Tax / **Total** |
| **Service history** | On complete, the WO's `totalCost` is passed to `logServiceEntry` (replaces the current parts-only cost) |

### 3b. The "Labor line" fields (repeatable, like a part line)
| Field | Input | Required | Notes |
|---|---|---|---|
| Description | Text | ✅ | e.g. "Diagnose + replace alternator" |
| Billing type | Select — `hourly` / `flat` | ✅ | Controls which fields apply |
| Hours | Number | ✅ if `hourly` | > 0 |
| Rate (per hour) | Number | ✅ if `hourly` | ≥ 0; default from tenant settings if present |
| Amount | Number | ✅ if `flat` | ≥ 0; for `hourly` it's computed `hours × rate` |

### 3c. Cost roll-up (computed server-side)
```
laborCost = Σ (line.billingType === 'hourly' ? hours*rate : amount)
partsCost = Σ part.lineTotal                (already computed today)
taxAmount = (laborCost + partsCost) * taxRate   // taxRate from tenant settings, default 0
totalCost = laborCost + partsCost + taxAmount
```

### 3d. Data model (add to the work order doc)
```ts
laborLines: [{ description, billingType: 'hourly'|'flat', hours?, rate?, amount }],
laborCost: number,     // computed
taxAmount: number,     // computed
totalCost: number,     // computed = labor + parts + tax
// partsCost already exists
```

### 3e. Build steps
1. **Types** — add `laborLines`, `laborCost`, `taxAmount`, `totalCost` to `controller/work-orders/types.ts` (+ input type).
2. **Controller** — compute the roll-up (3c) in `createWorkOrder` / `updateWorkOrder`, right next to the existing `resolveWorkOrderParts` logic; expose in `serializeWorkOrder`.
3. **Completion** — in `completeWorkOrder`, pass `totalCost` (not just `partsCost`) into `logServiceEntry`.
4. **UI:** add a **Labor** section to `work-order-form.tsx` (mirror the Parts section) + a cost-summary block in the WO view dialog.
5. **(Optional)** read a default labor rate + tax rate from tenant settings.

---

## 4. Exception Report (compliance)
**Why:** Managers need one screen showing what's *out of compliance* — failed inspections, open/overdue defects, missed service schedules — instead of checking each module. The page today is a "coming soon" stub.

**Ideal use case:**
Pick a date range (and optionally asset/team) → see a consolidated list of exceptions: failed inspections, unresolved defects, overdue services, expiring documents → drill into each → export.

> **Key idea:** no new data — it's a **read-only aggregation** across existing modules (same shape as the `service-schedule` page).

### 4a. What it aggregates (sources)

| Exception type | Source | Condition |
|---|---|---|
| **Failed inspection** | `inspectionSubmissions` | `result === 'fail'` in range |
| **Open defect** | `defects` | `status ∈ {new, in_progress}` |
| **Overdue / due service** | `service-schedule` (reuse `getServiceSchedule`) | status `overdue` / `due_soon` |
| **Expiring document** *(after #2)* | `documents` (`listExpiring`) | `expiring_soon` / `expired` |

### 4b. Filter bar (the report's inputs)

| Filter | Input | Notes |
|---|---|---|
| Date range | Two date pickers (from / to) | Defaults to last 30 days |
| Asset | Select (optional) | Scope to one asset |
| Team | Select (optional) | Scope to a team's assets |
| Exception type | Tabs / multiselect | All / Inspections / Defects / Services / Documents |
| Search | Text | Asset or detail text |

### 4c. Row shape (normalised across sources)
```ts
{ id, type: 'inspection'|'defect'|'service'|'document',
  assetName, detail, severity: 'critical'|'warning'|'info',
  date, status, link }   // link = deep link to the source record
```

### 4d. Build steps
1. **Controller** `controller/exception-report/index.ts`: `getExceptionReport(tenantId, { from, to, assetId, teamId, types })` — run the source queries in parallel, map each to the normalised row, sort most-urgent/newest first. **No collection, no writes.**
2. **API** `src/app/api/exception-report/route.ts` (GET with the filters above).
3. **UI:** replace the stub `app/(portal)/inspections/exception-report/page.tsx` → `StatCard` summary (counts per type) + filter bar + `DataTable` (Type / Asset / Detail / Severity / Date / Status) with row → deep link. Mirror `components/service-schedule/service-schedule-page.tsx`.
4. **(Optional)** CSV export button.

---

## 5. Driver Wellness
**Why:** Fatigue/fitness self-checks are a safety + compliance requirement (a driver-facing mini-DVIR). Whip Around ships a Driver Wellness module; we only have an RBAC toggle.

**Ideal use case:**
Before a shift the driver opens a **wellness check** (fit to drive? rested? etc.) → submits pass/fail → a failed check flags the driver for that day → manager is notified to follow up.

> **Key idea:** a wellness check is structurally the same as a pre-start inspection (a form of pass/fail questions), so **reuse the form-builder + inspection engine** — don't build a new engine.

### 5a. Where it lives (modules / forms)

| Where | What |
|---|---|
| **People → Drivers → "Wellness" tab** (or a top-level "Driver Wellness" page) | List of a driver's past check-ins + a **"New Wellness Check"** button |
| **Wellness form template** | A form-builder template (like the pre-start template) tagged `driver_wellness` — reused for every check |
| **Manager bell notification** | Fired when a check is submitted with a failing answer |

### 5b. The wellness form — fields (form-builder template)

These are the *questions on the template*, not DB columns. Typical set (all pass/fail unless noted):

| Question | Input type | Fail condition |
|---|---|---|
| Are you fit and well to drive today? | Yes / No | **No** |
| Are you free of fatigue / well-rested? | Yes / No | **No** |
| Free of alcohol / drugs / impairing medication? | Yes / No | **No** |
| Any injury or condition affecting driving? | Yes / No | **Yes** |
| Hours of sleep last night | Number | *(optional: < 6 → warn)* |
| Comments | Text | – |
| Driver signature | Signature | – |

Which answers count as a "fail" is configured in **defect-settings** for that form (same mechanism as inspection defect settings).

### 5c. Data model

Reuse **`inspectionSubmissions`** with a discriminator so wellness and vehicle inspections share one pipeline:
```ts
{ ...existing submission fields,
  kind: 'inspection' | 'wellness',   // NEW — default 'inspection'
  driverId?: ObjectId,               // set for wellness (the subject = driver)
  result: 'pass' | 'fail',           // already computed by the evaluator
}
```
(Alternative: a separate `driverWellnessSubmissions` collection — only if you want them fully isolated. Reuse is simpler.)

### 5d. Flag / status rules
- `result: 'fail'` on a wellness check → the **driver is flagged for that day**; surface a red badge on the driver + a bell notification to managers.
- A subsequent passing check the same day can clear the flag (or leave it for the manager to acknowledge).

### 5e. Build steps
1. **Template:** add a wellness form template (mirror `lib/prestart-form-templates.ts`) + seed it like the prestart forms; configure its defect-settings (which answers = fail).
2. **Launch:** reuse the inspection **launch → embed → submit** flow, but pass `kind: 'wellness'` + `driverId` (operator = the driver) instead of `assetId`.
3. **Processing:** extend `processInspectionSubmission` to accept `kind`/`driverId` and skip asset resolution when `kind === 'wellness'` (target the driver); the evaluator already produces pass/fail.
4. **Notify:** on `result === 'fail'` → `notifyTenantManagers` ("Driver X failed wellness check").
5. **UI:** a **Wellness** tab on the driver detail page (history list + "New Wellness Check") — reuse the inspection-history table pattern. RBAC key `driver_wellness` already exists.

---

## 6. Recurring Work Orders
**Why:** Some routine jobs recur on a fixed cadence independent of PM programs (e.g. weekly wash, monthly safety check). Whip Around supports recurring WOs.

**Ideal use case:**
Create a WO and mark it **recurring (every N days / interval)** → when it's completed, the next occurrence is scheduled automatically.

> **Key idea:** one new sub-form on the WO + a **clone-on-complete** step inside the existing `completeWorkOrder`. Reuse the interval math already in `service-programs/due-status`.

### 6a. Where it lives
| Where | What |
|---|---|
| **Work Order form → "Repeat" toggle + interval** | Turns a WO into a recurring template |
| **Work Orders list** | A **"Recurring"** badge on repeating WOs |
| Effect | On completion of a recurring WO, the next occurrence is auto-created |

### 6b. The "Repeat" fields (on the WO form)
| Field | Input | Required | Notes |
|---|---|---|---|
| Repeats | Toggle | – | Off by default |
| Every (interval) | Number | ✅ if on | > 0 |
| Unit / trigger | Select — `days` / `weeks` / `months` (time) — *(distance/engine-hours optional later)* | ✅ if on | Time-based is the common case |

### 6c. Data model (add to the work order doc)
```ts
recurrence?: {
  enabled: boolean,
  triggerType: 'time' | 'distance' | 'engine_hours',   // start with 'time'
  interval: number,
  unit?: 'days' | 'weeks' | 'months',                  // for time
}
```

### 6d. Clone-on-complete logic (in `completeWorkOrder`)
When completing a WO with `recurrence.enabled`:
- create a **new** WO copying asset / service tasks / assignee / description,
- fresh `workOrderNumber`, status reset to the default/first status, `isCompleted: false`,
- advance `dueDate` (or the meter target) by the interval — reuse `addCalendar` from `due-status.ts` for time, or `+interval` on the meter for distance/hours,
- carry `recurrence` forward so it keeps repeating.

### 6e. Build steps
1. **Types** — add `recurrence` to `controller/work-orders/types.ts` (+ input type); store it in `createWorkOrder`; expose in `serializeWorkOrder`.
2. **Controller** — at the end of `completeWorkOrder`, if `recurrence?.enabled`, build + insert the next WO (6d). Guard against double-clone (only when transitioning to completed).
3. **UI:** a "Repeat" section in `work-order-form.tsx` (toggle + interval + unit) and a "Recurring" badge in the WO list (like the "Completed" badge).

---

## 7. Faults (engine / DTC)  — *parked (needs telematics)*

**In plain English — what is a "fault"?**
A **fault** is an error reported by the **vehicle's own computer** (the engine ECU) — the codes behind a dashboard "check engine" light, e.g. `P0420`. These are called **DTCs — Diagnostic Trouble Codes**.

**Fault vs Defect (the key difference):**

| | **Defect** | **Fault** |
|---|---|---|
| Who reports it | A **person** during an inspection | The **vehicle's computer** (a code) |
| Source | Inspection / manual | Telematics device / OBD scanner |
| Example | "Cracked windscreen", "brake light out" | `P0420 — catalytic converter efficiency` |

**Why:** Machine-reported faults have a different source and lifecycle than human-reported defects, so Whip Around tracks them separately.

> ⚠️ **Reality check — this is mostly an *integration* feature.** Faults normally arrive **automatically from a telematics/OBD provider**, which is out of scope (integrations excluded). Without that, someone would type codes in by hand — which overlaps with just raising a **Defect**. **Recommendation: keep #7 parked until telematics is in scope.** If you want it sooner, build the manual-entry version below; it behaves exactly like Defects.

**Ideal use case (once telematics exists):**
The vehicle reports a fault code → it appears in an open-faults list → a manager links it to a Work Order to fix → it's cleared when serviced.

> **Key idea:** faults behave like defects (raise → link to a WO → resolve), so **mirror the defect→work-order spine** already built.

### 7a. Where it lives

| Where | What |
|---|---|
| **Maintenance → Faults** (new page) | Fleet fault list with status tabs (Open / Acknowledged / Cleared) + search |
| **Asset detail → "Faults" section/tab** | Faults for that asset |
| **Work Order** | A fault links to a WO (`fault.workOrderId`) — "Create Work Order" action like defects |

### 7b. The "Add / Edit Fault" form — fields

| Field | Input | Required | Notes |
|---|---|---|---|
| Asset | Select | ✅ | The affected asset |
| Fault code | Text | ✅ | DTC code, e.g. `P0420` (≤ 40 chars) |
| Description | Textarea | – | ≤ 500 chars |
| Severity | Select — `info` / `warning` / `critical` | ✅ | Default `warning` |
| Occurred at | Date-time | – | Defaults to now |
| Status | Select — `open` / `acknowledged` / `cleared` | ✅ | Default `open` |

### 7c. Enums
```ts
export const FAULT_SEVERITIES = ['info', 'warning', 'critical'] as const;
export const FAULT_STATUSES  = ['open', 'acknowledged', 'cleared'] as const;
```

### 7d. Data model (`faults` collection — new)
```ts
{
  _id, tenantId,
  assetId: ObjectId, assetName: string,   // denormalised name for lists
  code: string, description?: string,
  severity: 'info'|'warning'|'critical',
  status: 'open'|'acknowledged'|'cleared',
  occurredAt: Date,
  workOrderId?: ObjectId | null,          // set when a WO is raised
  source: 'manual' | 'telematics',        // 'telematics' reserved for later
  createdBy, updatedBy, createdAt, updatedAt,
  isArchived, archivedAt, archivedBy,
}
```
**Index:** `{ tenantId, assetId, status }`.

### 7e. Build steps
1. **Collection** — add `getFaultsCollection` to `mongodb.ts`.
2. **Controller** `controller/faults`: CRUD + `transitionStatus`; a fault→WO link (extend `createWorkOrder` to accept `faultIds` just like `defectIds`, set `fault.workOrderId`, and mark faults `cleared` on WO completion — mirror the defect logic in `completeWorkOrder`).
3. **API:** `/api/faults`, `/api/faults/[id]`, `/api/faults/[id]/status`.
4. **UI:** a **Faults** list page (mirror `defects-page.tsx`) + a Faults section on the asset; "Create Work Order" action; **critical** fault on create → `notifyTenantManagers`.

---

## Priority summary
1. **Service — auto-create WO** — tiny; reuse `createWorkOrder` inside the existing reminder scan.
2. **Documents / Wallet + expiry** — high operational/compliance value; `documents` collection already present.
3. **WO labor + total cost** — completes work-order accounting.
4. **Exception Report** — pure aggregation over existing data.
5. **Driver Wellness** — reuses the inspection engine.
6. **Recurring Work Orders** — clone-on-complete.
7. **Faults** — *parked until telematics integration is in scope* (mostly an integration feature; manual entry overlaps with Defects).
