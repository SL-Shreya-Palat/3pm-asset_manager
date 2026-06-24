# Backend Architecture — Fleet Platform (Whip Around reference)

> Companion to **`01-CODING-STANDARDS.md`**. Defines the data model (collections + every field +
> its validation), the menu/navigation, the RBAC model, and the authentication & tenant
> requirements.
>
> **Stack = identical to the Command platform:** Next.js (App Router) + TypeScript + **MongoDB
> native driver** (no Mongoose/ODM) + **custom validators** (no Zod) + Axios api-client + Zustand +
> Tailwind/Radix, all auth delegated to **3pm-auth**. **Background worker is deferred** (see §H).
>
> **Uploads & file storage:** every binary upload — inspection/defect/comment **photos**,
> **signatures**, and **documents** — is stored in **Azure Blob Storage** (the same object store
> the Command platform uses; the Azure equivalent of S3), **never in Mongo**. Each `*Url` / `*Urls`
> / `fileUrl` / `signatureUrl` / `photoUrl(s)` field holds the returned Blob URL: the client uploads
> the file to Blob via a short-lived signed URL, then persists that URL on the record. See
> `01-CODING-STANDARDS.md` → File storage.

**Responsive web only — no React Native.** The whole product is one responsive Next.js web app:
managers use the portal on desktop; drivers use the **same app in their phone browser** (mobile-first
screens, camera capture). There is no native build and no separate mobile codebase.

**Out of scope (do not build):** Help/Support, analytics Dashboard, Referral/bonus. A simple
post-login landing page is fine; no analytics module.

---

## 0. What the platform does (module flow)

```
Driver runs an Inspection (DVIR) in the mobile browser
        │  a failed item →
        ▼
     Defect ───────────────┐
                           ├──►  Work Order  ──► consumes Parts (Inventory) + Labor
 Telematics Fault (DTC) ───┘         │              ── mechanic signs off
                                     ▼
                         Service History + Asset cost + meter updated
Service Program (PM) due (time / distance / engine-hours) ─────► creates a Work Order
```

Pillars: **Inspections → Maintenance → Compliance**, plus Fuel, Inventory, and Teams.

> **v1 builds the basic flow only:** Inspection → Defect → Work Order (assign a mechanic *or* vendor)
> → done. The **telematics-Fault** and **PM Service-Program** triggers shown above are enhancements —
> see **§H.1** for the exact basic flow and §H.3/§H.4 for what's deferred.

---

## A. Foundation

### A.1 Multi-tenancy
- Every document carries **`tenantId: ObjectId`**. Every query filter, every insert, and the lead
  column of every compound index includes it. `tenantId` is taken from the verified session —
  **never** from the request body. Cross-tenant access is impossible by construction.

### A.2 Data layer
- **MongoDB native driver** via `lib/mongodb.ts` `getXCollection()` helpers (same as Command). No
  Mongoose / no ODM.
- Each collection has a **TS interface** in `controller/<domain>/types.ts` and is created/indexed in
  `lib/setup-indexes.ts`. Validation is done with **custom validators** (`commonValidators.ts`) +
  inline checks — not a schema library.

### A.3 Universal base fields (on EVERY collection — listed once, not repeated per table)
| Field | Type | Notes |
|------|------|------|
| `_id` | ObjectId | Mongo default |
| `tenantId` | ObjectId | tenant isolation; indexed, leads every compound index |
| `createdBy` | ObjectId | ref `members` |
| `updatedBy` | ObjectId | ref `members` |
| `createdAt` | Date | set on insert |
| `updatedAt` | Date | set on every update |
| `isActive` | Boolean | default `true` |
| `isArchived` | Boolean | default `false` — archive is the default "remove" |
| `archivedAt` | Date \| null | set on archive |
| `archivedBy` | ObjectId \| null | set on archive |

Add `isDeleted` / `deletedAt` / `deletedBy` **only** where a true hard soft-delete is needed.
`auditLog` is append-only and is **never** archived or deleted.

### A.4 Folder structure
Per `01-CODING-STANDARDS.md §2`: `app/api/<domain>/`, `controller/<domain>/`, `services/<domain>/`,
`components/`, `lib/` (mongodb, api-client, auth, validation, setup-indexes, rbac), `store/`,
`constants/`, `types/`, `hooks/`, `utils/`.

---

## B. Authentication & Tenant — reuse the existing 3pm-auth system (REQUIRED)

**The reference project MUST use the same authentication and tenant system as Command** — do not
invent a parallel auth. Verify it works end-to-end **before** building any feature module.

### B.1 How it works (reused, not rebuilt)
- **Session source:** this is a **web app** — desktop **and** mobile browsers authenticate via the
  session **cookie** verified against 3pm-auth. One session model for every browser; no native client.
- **`getAuthenticatedUser(req)`** is the first call in every route handler and returns
  `{ userId, tenantId, role }`. No local passwords, no bcrypt anywhere. Redis-backed session cache.
- **Drivers authenticate through 3pm-auth too** (in the browser). There is **no local driver
  password** in the data model.
- **Tenant resolution:** active tenant comes from the session / tenant-switch cookie; all data is
  scoped by the resolved local `tenantId`.
- **Cookies (reuse Command's set):** `session`, `current_tenant_id`, `active_tenant`,
  `admin_portal_session`. Logout clears them all.
  *(Admin **impersonation is out of scope for now** — omit the `impersonation` / `impersonation_flag`
  cookies and the masquerade flows. Can be added later from Command's pattern.)*

### B.2 ✅ Verification checklist — must all pass before feature work
1. **Login** through 3pm-auth issues the session cookie and `getAuthenticatedUser()` resolves the user.
2. **Tenant switch** updates `current_tenant_id`; subsequent reads/writes scope to the new tenant.
3. **Isolation:** a user in Tenant A cannot read/modify Tenant B data (cross-tenant → `403`/empty).
4. **Logout** clears all auth cookies; protected routes then return `401`.
5. **Mobile browser** uses the **same cookie session** (responsive) — the app works on a phone with no separate client.
6. **Write safety:** an API call that puts a foreign `tenantId` in the body is ignored — the
   session tenant always wins.

---

## C. RBAC model (build the structure now, fill the matrix later)

### C.1 Roles (5 system roles + custom)
| Role (`key`) | Scope | Notes |
|---|---|---|
| `admin` | `all` (wildcard) | full access; matrix ignored. The owner-level role. |
| `manager` | `modules` | org-wide; customizable matrix |
| `team_manager` | `modules` + **`teamScoped`** | data limited to teams they manage |
| `mechanic` | `modules` | maintenance/defects/inventory leaning |
| `driver` | `modules` + **`mobileOnly`** | mobile-browser only; no portal |
| *(custom)* | `modules` | tenant-authored; `isSystem:false`; fully editable |

Seed the 5 system roles with the **full structure**; per-cell matrix values default to `false`
and are filled later from the Whip Around grid **with no schema change**.

### C.2 Permission map shape (stored on `roles.permissions`)
```ts
type ModuleKey =
  | 'teams' | 'assets' | 'inspections' | 'forms' | 'exception_report' | 'defects'
  | 'service_tasks' | 'service_programs' | 'work_order' | 'inventory'
  | 'drivers' | 'driver_wellness' | 'fuel';

type ActionSet = { view: boolean; create: boolean; update: boolean; delete: boolean; export: boolean; bulkUpload: boolean };

type RolePermissions =
  | { scope: 'all';     teamScoped: false; mobileOnly: false }                                   // Admin/Owner
  | { scope: 'modules'; modules: Partial<Record<ModuleKey, Partial<ActionSet>>>; teamScoped: boolean; mobileOnly: boolean };
```
Validator rule: when `scope === 'all'`, `modules` must be empty/absent.

### C.3 The seam (built now)
- **Single chokepoint:** `roleHasPermission(role, module, action)` → `true` if `scope==='all'`,
  else `modules[module]?.[action] === true`. Called before every handler body.
- **`teamScoped`** is enforced as *query scoping*: inject `{ teamId: { $in: managedTeamIds } }`
  (and the asset/driver team-membership equivalents) into every list/detail query.
- **`mobileOnly`** → `403` on all portal routes; mobile asset visibility limited to assets in the
  driver's `teamIds`.
- Only the tenant owner may edit system roles; `key`/`name`/`permissions` of system roles are
  locked server-side. **Menu `rolesVisible` is cosmetic — the chokepoint is the real gate.**

---

## D. Cross-cutting conventions (same as Command)

- **Response envelope:** `{ data, error }` with exactly one non-null (standards §9).
- **Pagination:** `page`/`limit` (default 25, max 100) → `{ items, pagination: { page, limit,
  total, hasMore } }`.
- **Refs:** cross-collection references stored as **ObjectId** (validate as 24-hex with
  `isValidObjectId`, then `new ObjectId(...)`). Resolve via `$lookup` on `_id`. Keep
  **denormalized snapshots** beside the ref where history must render stably (e.g. `partName`,
  `templateSnapshot`, defect `title`).
- **Per-tenant human numbers:** `counters` collection issues atomic sequences via `findOneAndUpdate
  {$inc}` → `WO-000123`, `PO-000045`, `INS-...`, `DEF-...`. Immutable after create; unique per tenant.
- **Idempotency:** synced imports dedupe on a unique partial index
  `{ tenantId, integrationId, externalRef }`; inventory side-effects guard with booleans
  (`partLines[].inventoryDeducted`, PO line `quantityReceived`) so re-runs never double-apply.
- **Validation:** custom validators + inline checks at the top of each handler; cross-field rules
  are explicit controller checks (standards §13); `400` + clear message on failure. Enum membership
  validated against the shared `as const` arrays.

---

## E. Shared enums (`constants/`)
Single source of truth; the same `as const` array feeds the validator (membership check), the TS
input interface, and the UI label maps.

| Enum | Values |
|---|---|
| `MemberStatus` | `invited`, `active`, `suspended`, `deactivated` |
| `RoleKey` | `admin`, `manager`, `team_manager`, `mechanic`, `driver`, `custom` |
| `InvitationStatus` | `pending`, `accepted`, `expired`, `revoked` |
| `AssetStatus` | `active`, `in_shop`, `out_of_service`, `sold`, `inactive` |
| `MeterType` | `odometer`, `engine_hours` |
| `DocumentType` | `registration`, `insurance`, `inspection_cert`, `license`, `medical_card`, `certification`, `permit`, `other` |
| `TemplateType` | `inspection`, `driver_wellness` |
| `InspectionItemType` | `pass_fail`, `photo`, `signature`, `note`, `number`, `mileage`, `engine_hours`, `tire_reading`, `brake_reading`, `date_time`, `multiple_choice` |
| `InspectionResult` | `pass`, `fail` |
| `DefectSeverity` | `critical`, `non_critical` |
| `DefectPriority` | `low`, `medium`, `high` |
| `DefectStatus` | `new`, `in_progress`, `corrected`, `ignored` |
| `FaultStatus` | `open`, `acknowledged`, `cleared` |
| `WorkOrderStatus` | `open`, `in_progress`, `on_hold`, `completed`, `closed` (org-extensible — see note) |
| `WorkOrderApprovalStatus` | `not_required`, `pending`, `approved`, `rejected` |
| `LineBillingType` | `flat`, `hourly` |
| `ServiceProgramCategory` | `scheduled_maintenance`, `unscheduled_maintenance`, `inspections`, `custom` |
| `ServiceTriggerType` | `time`, `distance`, `engine_hours` |
| `ScheduleScope` | `asset`, `asset_group`, `team` |
| `PurchaseOrderStatus` | `draft`, `ordered`, `partially_received`, `received`, `cancelled` |
| `FuelType` | `diesel`, `petrol`, `electric`, `lpg`, `cng`, `other` |
| `CommentEntityType` | `defect`, `work_order`, `inspection`, `asset` |
| `NotificationChannel` | `in_app`, `push`, `email`, `sms` |
| `IntegrationProvider` | `samsara`, `geotab`, `motive`, `verizon_connect`, `fuel_card`, `other` |

> **Customizable statuses:** Whip Around lets orgs rename/extend Work-Order statuses. Model
> `WorkOrderStatus` as a **per-tenant lookup** (a small `workflowStatuses` set seeded from the enum)
> if you need custom statuses; otherwise the fixed enum above is the default. Same option for POs.

---

## F. Collections

> ~30 collections in 5 groups. Field tables list **domain-specific** fields only (base fields from
> §A.3 are implicit). `Req` = required. Every ObjectId field is validated with `isValidObjectId`
> then cast. The **Validation / rules** column is the spec the custom validators must enforce.

### F.1 Identity & Access

#### `members` — one person per tenant (portal user and/or mobile driver)
A single human = one member. `account` subdoc → portal user; `driver` subdoc → mobile driver.
At least one of the two must be present (controller rule).
| Field | Type | Req | Validation / rules | Notes |
|---|---|---|---|---|
| `firstName` | String | ✓ | required, trimmed, 1–80 chars | |
| `lastName` | String | ✓ | required, trimmed, 1–80 chars | |
| `email` | String | – | optional, valid email (`isValidEmail`), lowercased | unique per tenant when present (sparse) |
| `phone` | String | – | optional, phone format `^\+?[0-9 ()-]{6,20}$` | |
| `status` | String | ✓ | enum `MemberStatus`, default `invited` | |
| `roleId` | ObjectId | ✓ | required, valid ObjectId | ref `roles` — exactly one role |
| `authUserId` | String | – | optional, non-empty when present | link to 3pm-auth identity (set after first login). **No password stored.** |
| `photoUrl` | String | – | optional, valid URL, ≤2048 | |
| `laborRatePerHour` | Number | – | optional, ≥ 0 | mechanic's default labor rate (cost roll-ups) |
| `account` | Subdoc | – | object below | present for portal users |
| `account.notifications` | Subdoc | – | `{ inApp, push, email, sms }` booleans (default true/true/true/false) | per-channel opt-in |
| `account.followedTeamIds` | [ObjectId] | – | array of valid ObjectIds, default `[]` | teams this user follows for alerts |
| `account.driverWellnessAccess` | Boolean | – | boolean, default false | can view Driver Wellness responses |
| `driver` | Subdoc | – | object below | present for mobile drivers |
| `driver.employeeNumber` | String | – | optional, ≤40 chars | |
| `driver.teamIds` | [ObjectId] | ✓* | array of valid ObjectIds, **min 1** | *required when `driver` present; visibility scope |
| `driver.license` | Subdoc | – | `{ number ≤60, expiresAt date, reminderDays 0–365 }` | Wallet license; expiry drives reminders |
| `driver.device` | Subdoc | – | `{ platform, model, appVersion }` | browser/app telemetry |
| `driver.lastInspectionAt` | Date | – | optional date | last DVIR submitted |

**Controller rules:** at least one of `account`/`driver` present; if `driver` present then
`driver.teamIds` non-empty.
**Indexes:** `{tenantId,status}`, `{tenantId,roleId}`, `{tenantId,email}` unique partial,
`{tenantId,authUserId}` unique partial, `{tenantId,'driver.teamIds'}`,
`{tenantId,'driver.license.expiresAt'}`.

#### `teams` — group of assets + drivers (basis of team-scoped RBAC)
| Field | Type | Req | Validation / rules | Notes |
|---|---|---|---|---|
| `name` | String | ✓ | required, trimmed, 1–120 | |
| `nameLower` | String | ✓ | derived (lowercased name) | per-tenant uniqueness index |
| `description` | String | – | optional, ≤500 | |
| `managerIds` | [ObjectId] | – | array of valid ObjectIds, default `[]` | ref `members`; Team Managers — defines their scope |
| `address` | String | – | optional, ≤300 | |
| `timezone` | String | – | optional, ≤60 | |

Assets/drivers link **inbound** (`assets.teamIds`, `members.driver.teamIds`) — not embedded here.
**Indexes:** `{tenantId,nameLower}` unique, `{tenantId,managerIds}`, `{tenantId,isArchived}`.

#### `roles` — RBAC role with embedded permission map (see §C)
| Field | Type | Req | Validation / rules | Notes |
|---|---|---|---|---|
| `key` | String | ✓ | enum `RoleKey` | `custom` for tenant-created |
| `name` | String | ✓ | required, trimmed, 1–80 | |
| `nameLower` | String | ✓ | derived | uniqueness index |
| `description` | String | – | optional, ≤500 | |
| `permissions` | Subdoc | ✓ | matches `RolePermissions` shape (§C.2); `scope='all'` ⇒ no module matrix | the matrix |
| `isSystem` | Boolean | ✓ | boolean, default false | locked server-side |
| `isCustomizable` | Boolean | ✓ | boolean, default false | matrix editable in UI |

**Indexes:** `{tenantId,nameLower}` unique, `{tenantId,key}`, `{tenantId,isSystem}`.

#### `invitations` — pending invite (email for users, SMS/email for drivers)
| Field | Type | Req | Validation / rules | Notes |
|---|---|---|---|---|
| `email` | String | –* | optional, valid email, lowercased | *required when `channel='email'` |
| `phone` | String | –* | optional, phone format | *required when `channel='sms'` |
| `firstName` / `lastName` | String | – | optional, 1–80 | |
| `roleId` | ObjectId | ✓ | required, valid ObjectId | role granted on accept |
| `teamIds` | [ObjectId] | – | array of valid ObjectIds, default `[]` | required for `team_manager`/driver |
| `channel` | String | ✓ | enum `email|sms`, default `email` | |
| `tokenHash` | String | ✓ | required, non-empty | SHA-256 of single-use token (raw never stored) |
| `status` | String | ✓ | enum `InvitationStatus`, default `pending` | |
| `expiresAt` | Date | ✓ | required date | expiry sweep |
| `acceptedAt` | Date | – | optional date | |
| `acceptedMemberId` | ObjectId | – | optional valid ObjectId | member created/linked on accept |
| `resendCount` | Number | ✓ | integer ≥ 0, default 0 | |
| `lastSentAt` | Date | – | optional date | |

**Controller rules:** `channel='email' ⇒ email`; `channel='sms' ⇒ phone`.
**Indexes:** `{tenantId,status}`, `{tenantId,email,status}`, `{tenantId,tokenHash}` unique,
`{tenantId,expiresAt}`.

### F.2 Assets

#### `assets` — vehicle / equipment / any physical asset
| Field | Type | Req | Validation / rules | Notes |
|---|---|---|---|---|
| `name` | String | ✓ | required, trimmed, 1–160 | display name / unit # |
| `assetNumber` | String | – | optional, ≤60 | fleet/unit number, unique per tenant |
| `type` | String | – | optional, ≤60 | vehicle, trailer, equipment… |
| `status` | String | ✓ | enum `AssetStatus`, default `active` | **single source of truth** for in/out of service |
| `vin` | String | – | optional, exactly 17 chars | VIN-lookup populates make/model |
| `year` | Number | – | optional integer 1900–2100 | |
| `make` / `model` | String | – | optional, ≤80 | |
| `licensePlate` | String | – | optional, ≤20 | |
| `fuelType` | String | – | optional, enum `FuelType` | |
| `currentOdometer` | Number | – | optional, ≥ 0 | latest reading (mirror of `meterReadings`) |
| `currentEngineHours` | Number | – | optional, ≥ 0 | |
| `primaryMeter` | String | – | enum `MeterType`, default `odometer` | drives PM triggers |
| `teamIds` | [ObjectId] | – | array of valid ObjectIds, default `[]` | ref `teams` |
| `assetGroupIds` | [ObjectId] | – | array of valid ObjectIds, default `[]` | ref `assetGroups` (PM scoping) |
| `locationId` | ObjectId | – | optional valid ObjectId | ref `locations` (home depot) |
| `assignedDriverId` | ObjectId | – | optional valid ObjectId | ref `members` (primary driver) |
| `driverAccessIds` | [ObjectId] | – | array of valid ObjectIds, default `[]` | ref `members`; **direct cross-team driver access** (a driver outside the asset's teams can still inspect it) |
| `qrCode` | String | – | optional, ≤120 | scan-to-inspect; globally unique (carry tenant hint) |
| `photoUrls` | [String] | – | array of valid URLs, default `[]` | |
| `customFields` | Object | – | validated against `assetCustomFieldDefs` | tenant-defined fields |

**Indexes:** `{tenantId,status}`, `{tenantId,assetNumber}` unique partial, `{tenantId,teamIds}`,
`{tenantId,assetGroupIds}`, `{tenantId,qrCode}` unique partial, `{tenantId,isArchived}`.

#### `assetGroups` — grouping used by Service Programs (distinct from teams)
| Field | Type | Req | Validation / rules | Notes |
|---|---|---|---|---|
| `name` | String | ✓ | required, trimmed, 1–120 | |
| `nameLower` | String | ✓ | derived | uniqueness |
| `description` | String | – | optional, ≤500 | |

Assets link via `assets.assetGroupIds`. **Index:** `{tenantId,nameLower}` unique.

#### `locations` — depots + inventory stock locations (one master)
| Field | Type | Req | Validation / rules | Notes |
|---|---|---|---|---|
| `name` | String | ✓ | required, trimmed, 1–120 | |
| `type` | String | – | enum `depot|warehouse|shop|other`, default `depot` | |
| `address` | String | – | optional, ≤300 | |
| `isStockLocation` | Boolean | – | boolean, default false | holds parts inventory |

**Index:** `{tenantId,name}`.

#### `documents` — Wallet (asset / team / **driver** / tenant documents with expiry)
Covers both the asset Wallet **and** the driver Wallet (license, medical card, certifications).
| Field | Type | Req | Validation / rules | Notes |
|---|---|---|---|---|
| `scope` | String | ✓ | enum `asset|team|driver|tenant` | what the doc attaches to |
| `assetId` | ObjectId | –* | optional valid ObjectId | *required when `scope='asset'` |
| `teamId` | ObjectId | –* | optional valid ObjectId | *required when `scope='team'` |
| `driverId` | ObjectId | –* | optional valid ObjectId | *required when `scope='driver'` (ref `members`) |
| `docType` | String | ✓ | enum `DocumentType` | incl. `license`, `medical_card`, `certification` |
| `title` | String | ✓ | required, trimmed, 1–160 | |
| `fileUrl` | String | ✓ | required, valid URL | Azure Blob (signed-URL upload) |
| `expires` | Boolean | ✓ | boolean, default false | |
| `expiryDate` | Date | –* | optional date | *required when `expires=true` |
| `reminderDays` | Number | – | optional integer 0–365 | lead time |
| `reminderRecipientIds` | [ObjectId] | – | array of valid ObjectIds, default `[]` | ref `members` |

**Controller rules:** scope→id presence; `expires=true ⇒ expiryDate`.
**Indexes:** `{tenantId,scope,assetId}`, `{tenantId,scope,driverId}`, `{tenantId,expiryDate}`.

#### `meterReadings` — odometer / engine-hour history
| Field | Type | Req | Validation / rules | Notes |
|---|---|---|---|---|
| `assetId` | ObjectId | ✓ | required valid ObjectId | ref `assets` |
| `meterType` | String | ✓ | enum `MeterType` | |
| `value` | Number | ✓ | required, ≥ 0 | |
| `readingAt` | Date | ✓ | required date | |
| `source` | String | ✓ | enum `manual|inspection|fuel|telematics`, default `manual` | |
| `sourceRefId` | ObjectId | – | optional valid ObjectId | origin doc (inspection/fuel/integration) |

**Index:** `{tenantId,assetId,meterType,readingAt:-1}`.

#### `assetCustomFieldDefs` — tenant-defined custom asset fields
| Field | Type | Req | Validation / rules | Notes |
|---|---|---|---|---|
| `label` | String | ✓ | required, trimmed, 1–80 | |
| `key` | String | ✓ | required, `^[a-z0-9_]+$` | stable key |
| `fieldType` | String | ✓ | enum `text|number|date|select|boolean` | |
| `options` | [String] | –* | optional array of strings | *required when `fieldType='select'` |
| `required` | Boolean | – | boolean, default false | |

**Controller rule:** `fieldType='select' ⇒ options` non-empty. **Index:** `{tenantId,key}` unique.

### F.3 Inspections

#### `inspectionTemplates` — the form builder
| Field | Type | Req | Validation / rules | Notes |
|---|---|---|---|---|
| `name` | String | ✓ | required, trimmed, 1–160 | |
| `templateType` | String | ✓ | enum `TemplateType`, default `inspection` | `inspection` or `driver_wellness` |
| `description` | String | – | optional, ≤500 | |
| `version` | Number | ✓ | integer ≥ 1, default 1 | bump on edit; submissions snapshot it |
| `sections` | [Subdoc] | ✓ | non-empty array | ordered |
| `sections[].title` | String | ✓ | required, trimmed, non-empty | |
| `sections[].items` | [Subdoc] | ✓ | non-empty array | |
| `items[].label` | String | ✓ | required, trimmed, non-empty | |
| `items[].itemType` | String | ✓ | enum `InspectionItemType` | pass_fail, photo, tire_reading… |
| `items[].required` | Boolean | – | boolean, default false | |
| `items[].options` | [String] | –* | optional array of strings | *required when `itemType='multiple_choice'` |
| `items[].failOn` | [String] | – | optional array of strings | values that mark the item failed |
| `items[].photoRequiredOnFail` | Boolean | – | boolean, default false | |

**Controller rule:** `multiple_choice ⇒ options` non-empty.
**Indexes:** `{tenantId,templateType}`, `{tenantId,name}`.

#### `inspections` — a completed DVIR (immutable record)
| Field | Type | Req | Validation / rules | Notes |
|---|---|---|---|---|
| `inspectionNumber` | String | ✓ | from `counters` | `INS-000123`, immutable |
| `type` | String | ✓ | enum `TemplateType` | so wellness responses are queryable |
| `assetId` | ObjectId | –* | optional valid ObjectId | *required for `type='inspection'`; null for wellness |
| `driverId` | ObjectId | ✓ | required valid ObjectId | ref `members` |
| `templateId` | ObjectId | ✓ | required valid ObjectId | ref `inspectionTemplates` |
| `templateSnapshot` | Object | ✓ | frozen copy | renders historically even if template changes |
| `result` | String | ✓ | enum `InspectionResult` | derived from responses; immutable |
| `odometer` | Number | – | optional, ≥ 0 | writes a `meterReadings` row |
| `engineHours` | Number | – | optional, ≥ 0 | |
| `responses` | [Subdoc] | ✓ | non-empty array | one per item |
| `responses[].itemKey` | String | ✓ | required, non-empty | maps to template item |
| `responses[].value` | Any | – | type depends on item | |
| `responses[].passed` | Boolean | – | optional boolean | for pass_fail items |
| `responses[].photoUrls` | [String] | – | array of valid URLs | |
| `responses[].defectId` | ObjectId | – | optional valid ObjectId | set if this item raised a defect |
| `signatureUrl` | String | – | optional valid URL | driver signature |
| `geo` | Subdoc | – | `{ lat, lng }` numbers | capture location |
| `submittedAt` | Date | ✓ | required date | |

**Controller rule:** `type='inspection' ⇒ assetId`. Record is immutable after submit (no edits).
**Indexes:** `{tenantId,assetId,submittedAt:-1}`, `{tenantId,type,driverId,submittedAt:-1}`,
`{tenantId,result}`, `{tenantId,inspectionNumber}` unique.

#### `inspectionSchedules` — recurring inspection requirements
| Field | Type | Req | Validation / rules | Notes |
|---|---|---|---|---|
| `templateId` | ObjectId | ✓ | required valid ObjectId | which form |
| `scope` | String | ✓ | enum `ScheduleScope` | asset / asset_group / team |
| `assetIds` / `assetGroupId` / `teamId` | per scope | –* | valid ObjectId(s) | *one required per `scope` |
| `frequency` | String | ✓ | enum `daily|weekly|monthly|custom_days` | |
| `intervalDays` | Number | –* | optional integer > 0 | *required when `frequency='custom_days'` |
| `reminderRecipientIds` | [ObjectId] | – | array of valid ObjectIds | |
| `nextDueAt` | Date | – | computed at query time (no worker yet) | |

**Controller rules:** scope→target required; `custom_days ⇒ intervalDays`.
**Index:** `{tenantId,scope}`, `{tenantId,nextDueAt}`.

#### `defects` — fault raised from an inspection item or manually
| Field | Type | Req | Validation / rules | Notes |
|---|---|---|---|---|
| `defectNumber` | String | ✓ | from `counters` | `DEF-000123` |
| `assetId` | ObjectId | ✓ | required valid ObjectId | ref `assets` |
| `title` | String | ✓ | required, trimmed, 1–200 | |
| `description` | String | – | optional, ≤2000 | |
| `severity` | String | ✓ | enum `DefectSeverity` | `critical` \| `non_critical` (DOT classification) |
| `priority` | String | – | enum `DefectPriority`, default `medium` | manager-assigned work priority (separate from severity) |
| `status` | String | ✓ | enum `DefectStatus`, default `new` | new→in_progress→corrected/ignored |
| `source` | String | ✓ | enum `inspection|manual`, default `manual` | |
| `inspectionId` | ObjectId | – | optional valid ObjectId | origin DVIR |
| `sourceItemKey` | String | – | optional string | which inspection item |
| `reportedById` | ObjectId | ✓ | required valid ObjectId | ref `members` |
| `photoUrls` | [String] | – | array of valid URLs | |
| `workOrderId` | ObjectId | – | optional valid ObjectId | **canonical defect↔WO link** |
| `resolvedAt` | Date | – | optional date | |

**Indexes:** `{tenantId,assetId,status}`, `{tenantId,status,severity}`,
`{tenantId,workOrderId}`, `{tenantId,defectNumber}` unique.

#### `exceptionReports` — daily per-asset inspection-compliance status
| Field | Type | Req | Validation / rules | Notes |
|---|---|---|---|---|
| `assetId` | ObjectId | ✓ | required valid ObjectId | |
| `date` | String | ✓ | `^\d{4}-\d{2}-\d{2}$` (YYYY-MM-DD) | local day |
| `status` | String | ✓ | enum `inspected|not_required|exception|no_inspection` | |
| `attended` | Boolean | ✓ | boolean, default false | manager actioned the exception |
| `attendedById` | ObjectId | – | optional valid ObjectId | |
| `attendedNote` | String | – | optional, ≤1000 | e.g. "contacted driver" |
| `omitted` | Boolean | – | boolean, default false | record intentionally omitted |
| `inspectionId` | ObjectId | – | optional valid ObjectId | the satisfying DVIR if any |

**Index:** `{tenantId,date,assetId}` unique, `{tenantId,status,date}`.

### F.4 Maintenance

#### `workOrders` — repair/maintenance job (groups defects + faults + labor + parts)
| Field | Type | Req | Validation / rules | Notes |
|---|---|---|---|---|
| `workOrderNumber` | String | ✓ | from `counters` | `WO-000123`, immutable |
| `assetId` | ObjectId | ✓ | required valid ObjectId | |
| `title` | String | – | optional, ≤200 | problem summary |
| `description` | String | – | optional, ≤2000 | problem detail |
| `status` | String | ✓ | enum `WorkOrderStatus`, default `open` | **org-customizable** statuses (§E note) |
| `statusLog` | [Subdoc] | – | `{ toStatus, byId, at }[]` | audit of transitions |
| `priority` | String | – | enum `low|medium|high`, default `medium` | |
| `dueDate` | Date | – | optional date | deadline for completion |
| `approvalStatus` | String | – | enum `WorkOrderApprovalStatus`, default `not_required` | approval workflow (review checkpoint) |
| `approvedById` | ObjectId | – | optional valid ObjectId | ref `members` |
| `approvedAt` | Date | – | optional date | |
| `recurrence` | Subdoc | – | `{ enabled, triggerType (ServiceTriggerType), interval > 0 }` | **recurring work orders** for routine tasks |
| `serviceProgramId` | ObjectId | – | optional valid ObjectId | ref `servicePrograms` (PM-generated WO) |
| `defectIds` | [ObjectId] | – | array of valid ObjectIds | ref `defects` (link only; severity lives on the defect) |
| `faultIds` | [ObjectId] | – | array of valid ObjectIds | ref `faults` |
| `serviceTaskIds` | [ObjectId] | – | array of valid ObjectIds | ref `serviceTasks` (planned PM work) |
| `assignedMechanicId` | ObjectId | – | optional valid ObjectId | ref `members` |
| `vendorId` | ObjectId | – | optional valid ObjectId | ref `vendors` (external repair) |
| `laborLines` | [Subdoc] | – | array; see below | |
| `laborLines[].description` | String | ✓ | required, non-empty | |
| `laborLines[].billingType` | String | ✓ | enum `LineBillingType` | flat / hourly |
| `laborLines[].hours` | Number | –* | optional, > 0 | *required when `hourly` |
| `laborLines[].rate` | Number | –* | optional, ≥ 0 | *required when `hourly` |
| `laborLines[].amount` | Number | –* | optional, ≥ 0 | *required when `flat` |
| `partLines` | [Subdoc] | – | array; see below | |
| `partLines[].partId` | ObjectId | ✓ | required valid ObjectId | ref `parts` |
| `partLines[].partName` | String | ✓ | snapshot string | stable history |
| `partLines[].quantity` | Number | ✓ | required, > 0 | |
| `partLines[].unitCost` | Number | ✓ | required, ≥ 0 | |
| `partLines[].locationId` | ObjectId | – | optional valid ObjectId | stock location to deduct |
| `partLines[].inventoryDeducted` | Boolean | ✓ | boolean, default false | idempotency guard |
| `laborCost` / `partsCost` | Number | – | computed, ≥ 0 | roll-up |
| `taxAmount` | Number | – | computed, ≥ 0 | from tenant tax rate |
| `totalCost` | Number | – | computed, ≥ 0 | labor + parts + tax |
| `meterAtService` | Number | – | optional, ≥ 0 | odometer/hours at service |
| `mechanicSignatureUrl` | String | – | optional valid URL | sign-off |
| `openedAt` / `completedAt` | Date | – | optional dates | |

**Controller rules:** per-line billing (hourly→hours+rate; flat→amount).
**Indexes:** `{tenantId,assetId,status}`, `{tenantId,status,priority}`,
`{tenantId,assignedMechanicId,status}`, `{tenantId,workOrderNumber}` unique.

#### `faults` — telematics DTC / engine fault (distinct from inspection defects)
| Field | Type | Req | Validation / rules | Notes |
|---|---|---|---|---|
| `assetId` | ObjectId | ✓ | required valid ObjectId | |
| `code` | String | ✓ | required, trimmed, 1–40 | DTC code |
| `description` | String | – | optional, ≤500 | |
| `severity` | String | – | optional, enum `info|warning|critical` | provider-supplied |
| `status` | String | ✓ | enum `FaultStatus`, default `open` | |
| `source` | String | ✓ | enum `IntegrationProvider` | which telematics |
| `integrationId` | ObjectId | – | optional valid ObjectId | ref `integrations` |
| `externalRef` | String | – | optional string | dedupe key |
| `occurredAt` | Date | ✓ | required date | |
| `workOrderId` | ObjectId | – | optional valid ObjectId | link when serviced |

**Indexes:** `{tenantId,assetId,status}`, `{tenantId,integrationId,externalRef}` unique partial.
> Telematics ingestion is **deferred** (no worker yet) — schema in place; populate via webhook/manual.

#### `serviceTasks` — catalog of maintenance tasks (seeds programs + WOs)
| Field | Type | Req | Validation / rules | Notes |
|---|---|---|---|---|
| `name` | String | ✓ | required, trimmed, 1–160 | e.g. "Oil & filter change" |
| `category` | String | – | optional, ≤80 | engine, brakes… |
| `defaultLaborHours` | Number | – | optional, ≥ 0 | estimate |
| `defaultPartIds` | [ObjectId] | – | array of valid ObjectIds | typical parts |

**Index:** `{tenantId,name}`.

#### `servicePrograms` — preventative-maintenance schedule definition (hierarchical A/B/C/D)
| Field | Type | Req | Validation / rules | Notes |
|---|---|---|---|---|
| `name` | String | ✓ | required, trimmed, 1–160 | |
| `category` | String | ✓ | enum `ServiceProgramCategory` | scheduled / unscheduled maintenance / inspections / custom |
| `scope` | String | ✓ | enum `ScheduleScope` | asset / asset_group / team |
| `assetIds` / `assetGroupId` / `teamId` | per scope | –* | valid ObjectId(s) | *one required per scope |
| `serviceTaskIds` | [ObjectId] | ✓ | non-empty array of valid ObjectIds | tasks performed |
| `inspectionTemplateId` | ObjectId | – | optional valid ObjectId | for `category='inspections'` (checklist program) |
| `triggerType` | String | ✓ | enum `ServiceTriggerType` | time / distance / engine_hours |
| `interval` | Number | ✓ | required, > 0 | days / km-mi / hours |
| `reminderThreshold` | Number | – | optional, ≥ 0 | warn before due |
| `tier` | String | – | optional, enum `A|B|C|D` | hierarchy — higher tier resets lower |
| `lastPerformedAt` / `lastPerformedMeter` | mixed | – | optional | basis for next-due |
| `nextDueAt` / `nextDueMeter` | mixed | – | **computed at query time (no worker yet)** | |

**Controller rule:** scope→target required.
**Indexes:** `{tenantId,scope}`, `{tenantId,nextDueAt}`.
> **PM due-status:** for v1, computed at query time from `meterReadings`/date vs interval & last
> completion (no scheduler). Completing a higher-tier service resets lower tiers. A worker will
> later push reminders and auto-create Work Orders — **no schema change required** (see §H).

#### `serviceHistory` — materialized record of a completed service
| Field | Type | Req | Validation / rules | Notes |
|---|---|---|---|---|
| `assetId` | ObjectId | ✓ | required valid ObjectId | |
| `workOrderId` | ObjectId | – | optional valid ObjectId | source WO |
| `servicePrograms` | [ObjectId] | – | array of valid ObjectIds | programs satisfied |
| `serviceTaskIds` | [ObjectId] | – | array of valid ObjectIds | |
| `performedAt` | Date | ✓ | required date | |
| `meterAtService` | Number | – | optional, ≥ 0 | |
| `totalCost` | Number | – | optional, ≥ 0 | |
| `performedById` | ObjectId | – | optional valid ObjectId | mechanic |

**Index:** `{tenantId,assetId,performedAt:-1}`.

#### `parts` — inventory item (multi-location stock)
| Field | Type | Req | Validation / rules | Notes |
|---|---|---|---|---|
| `name` | String | ✓ | required, trimmed, 1–160 | |
| `partNumber` | String | – | optional, ≤80 | unique per tenant |
| `barcode` | String | – | optional string | scan support |
| `unitCost` | Number | – | optional, ≥ 0 | |
| `reorderLevel` | Number | – | optional integer ≥ 0 | low-stock alert |
| `stockLocations` | [Subdoc] | – | `{ locationId (valid ObjectId), quantity (int ≥ 0) }[]` | per-location qty |
| `vendorId` | ObjectId | – | optional valid ObjectId | preferred supplier |

**Indexes:** `{tenantId,partNumber}` unique partial, `{tenantId,barcode}`.

#### `purchaseOrders` — order parts from a supplier; receive into inventory
| Field | Type | Req | Validation / rules | Notes |
|---|---|---|---|---|
| `poNumber` | String | ✓ | from `counters` | `PO-000045`, immutable |
| `vendorId` | ObjectId | ✓ | required valid ObjectId | ref `vendors` |
| `status` | String | ✓ | enum `PurchaseOrderStatus`, default `draft` | |
| `deliveryLocationId` | ObjectId | – | optional valid ObjectId | ref `locations` |
| `lines` | [Subdoc] | ✓ | non-empty array | |
| `lines[].partId` | ObjectId | ✓ | required valid ObjectId | |
| `lines[].quantityOrdered` | Number | ✓ | required integer > 0 | |
| `lines[].quantityReceived` | Number | ✓ | integer ≥ 0, default 0 | idempotent receiving |
| `lines[].unitCost` | Number | ✓ | required, ≥ 0 | |
| `taxAmount` | Number | – | computed, ≥ 0 | from tenant tax rate |
| `total` | Number | – | computed (lines + tax) | |
| `orderedAt` / `receivedAt` | Date | – | optional dates | |

**Index:** `{tenantId,status}`, `{tenantId,vendorId}`, `{tenantId,poNumber}` unique.

#### `vendors` — external parts & service suppliers
> Fields mirror Whip Around's **"Create a new vendor"** form: vendor name, address, website, a
> **Primary contact** (name/phone/email), a **Public edit access** toggle, and **Vendor type**
> checkboxes (Parts / Services — both may be selected).

| Field | Type | Req | Validation / rules | Notes |
|---|---|---|---|---|
| `name` | String | ✓ | required, trimmed, 1–160 | vendor / company name |
| `address` | String | – | optional, ≤300 | |
| `website` | String | – | optional, valid URL, ≤2048 | |
| `contactName` | String | ✓ | required, trimmed, 1–120 | primary contact ("Name \*" on the form) |
| `phone` | String | – | optional, phone format | primary contact phone |
| `email` | String | –\* | optional, valid email | \*required to assign a work order or defect to this vendor (form note) |
| `vendorTypes` | [String] | – | array, enum `parts\|services`, default `[]` | "Vendor type" checkboxes — both allowed |
| `publicEditAccess` | Boolean | – | boolean, default `true` | lets the vendor view/update its assigned work orders & defects via a public link |
| `laborRatePerHour` | Number | – | optional, ≥ 0 | external rate (set on edit / settings, not the create modal) |

**Controller rule:** `email` is required when the vendor is assigned to a work order or defect — the
assignment endpoint rejects a vendor that has no email.
**Index:** `{tenantId,name}`.

### F.5 Operations

#### `fuelLogs` — fuel transaction + computed efficiency
| Field | Type | Req | Validation / rules | Notes |
|---|---|---|---|---|
| `assetId` | ObjectId | ✓ | required valid ObjectId | |
| `driverId` | ObjectId | – | optional valid ObjectId | ref `members` |
| `date` | Date | ✓ | required date | |
| `fuelType` | String | – | optional, enum `FuelType` | |
| `volume` | Number | ✓ | required, > 0 | litres/gallons (unit from settings) |
| `cost` | Number | ✓ | required, ≥ 0 | |
| `startingOdometer` | Number | – | optional, ≥ 0 | |
| `endingOdometer` | Number | – | optional, ≥ 0 | writes `meterReadings` |
| `locationId` | ObjectId | – | optional valid ObjectId | |
| `integrationId` / `externalRef` | mixed | – | optional | fuel-card import dedupe |
| `economy` | Number | – | computed | MPG or L/100km per tenant units |

**Controller rule:** `endingOdometer ≥ startingOdometer` when both present.
**Indexes:** `{tenantId,assetId,date:-1}`, `{tenantId,integrationId,externalRef}` unique partial.

#### `notifications` — in-app / push / email / sms alerts
| Field | Type | Req | Validation / rules | Notes |
|---|---|---|---|---|
| `recipientId` | ObjectId | ✓ | required valid ObjectId | ref `members` |
| `type` | String | ✓ | required, non-empty | event key (defect.created, pm.due…) |
| `channels` | [String] | ✓ | non-empty array, enum `NotificationChannel` | |
| `title` | String | ✓ | required, 1–200 | |
| `body` | String | – | optional, ≤1000 | |
| `entityType` | String | – | optional string | polymorphic ref type |
| `entityId` | ObjectId | – | optional valid ObjectId | linked record |
| `readAt` | Date | – | optional date | null = unread |

**Index:** `{tenantId,recipientId,readAt}`, `{tenantId,recipientId,createdAt:-1}`.
> In v1, notifications are written **in-app** on the relevant action; push/email/sms dispatch waits
> for the worker.

#### `integrations` — per-provider telematics / fuel-card connection
| Field | Type | Req | Validation / rules | Notes |
|---|---|---|---|---|
| `provider` | String | ✓ | enum `IntegrationProvider` | |
| `category` | String | ✓ | enum `telematics|fuel`, default `telematics` | |
| `status` | String | ✓ | enum `connected|error|disconnected`, default `disconnected` | |
| `credentialsRef` | String | – | secret-vault reference (never store raw secrets) | |
| `features` | Subdoc | – | `{ syncOdometer, incomingDtc, fuelImport }` booleans | |
| `lastSyncAt` / `syncCursor` / `lastError` | mixed | – | optional | resumable sync (worker, later) |

**Index:** `{tenantId,provider}` unique, `{tenantId,status,lastSyncAt}`.

#### `tenantSettings` — per-module config singletons
One document per `(tenantId, module)`.
| Field | Type | Req | Validation / rules | Notes |
|---|---|---|---|---|
| `module` | String | ✓ | enum `company|localization|notifications|teams|service|fuel|maintenance|tax|data_retention|subscription|mobile` | singleton discriminator |
| `company` | Subdoc | – | `{ name, logoUrl, address, dateFormat, timeFormat }` | company info |
| `localization` | Subdoc | – | `{ language, timezone, distance: mi|km, volume: gal|ltr, economy: mpg|l_per_100km }` | **multi-language**, timezone, units |
| `notificationDefaults` | Subdoc | – | channel defaults + per-event routing | |
| `maintenance` | Subdoc | – | `{ defaultLaborRate ≥0, shopRatePerHour ≥0, partsMarkupPct ≥0 }` | cost roll-ups |
| `serviceDefaults` | Subdoc | – | `{ defaultTrigger (ServiceTriggerType), defaultThreshold ≥0 }` | |
| `tax` | Subdoc | – | `{ taxName, taxRatePct ≥0 }` | applied to WO/PO totals |
| `dataRetention` | Subdoc | – | `{ inspectionRetentionDays ≥0 }` | record retention policy |
| `subscription` | Subdoc | – | `{ plan, assetLimit }` | per-asset plan info (read-only display) |
| `mobile` | Subdoc | – | `{ requirePhotoOnFail }` | mobile-browser inspection behaviour |
| `config` | Object | – | free-form map | extensibility escape hatch |

**Index:** `{tenantId,module}` unique.

#### `auditLog` — append-only compliance log (never archived/deleted)
| Field | Type | Req | Validation / rules | Notes |
|---|---|---|---|---|
| `actorId` | ObjectId | – | optional valid ObjectId | ref `members`; null for system/integration |
| `actorType` | String | ✓ | enum `user|system|integration|admin` | |
| `action` | String | ✓ | enum `create|update|delete|archive|restore|login|logout|export|sync` | |
| `entityType` | String | ✓ | required, non-empty | affected collection |
| `entityId` | ObjectId | – | optional valid ObjectId | |
| `summary` | String | – | optional, ≤300 | human-readable |
| `changedFields` | [String] | – | array of strings | drives compact diff |
| `before` / `after` | Object | – | optional snapshots | |
| `ipAddress` / `userAgent` / `requestId` | String | – | optional | forensics |
| `occurredAt` | Date | ✓ | required date | primary sort/export key |

**Indexes:** `{tenantId,occurredAt:-1}`, `{tenantId,entityType,entityId,occurredAt:-1}`,
`{tenantId,actorId,occurredAt:-1}`.

#### `comments` — reusable comment / photo thread (defects, work orders, inspections, assets)
Powers Whip Around's "view photos and comments" on defects and the work-order notes section.
| Field | Type | Req | Validation / rules | Notes |
|---|---|---|---|---|
| `entityType` | String | ✓ | enum `CommentEntityType` | what the comment is attached to |
| `entityId` | ObjectId | ✓ | required valid ObjectId | the target record |
| `authorId` | ObjectId | ✓ | required valid ObjectId | ref `members` |
| `body` | String | –* | optional, ≤2000 | *required if no photos |
| `photoUrls` | [String] | – | array of valid URLs | attached photos |

**Controller rule:** at least one of `body` / `photoUrls` present.
**Index:** `{tenantId,entityType,entityId,createdAt:-1}`.

#### `counters` — atomic per-tenant numbering
| Field | Type | Req | Validation / rules | Notes |
|---|---|---|---|---|
| `key` | String | ✓ | enum `work_order|purchase_order|inspection|defect` | sequence name |
| `prefix` | String | ✓ | e.g. `WO-` | |
| `seq` | Number | ✓ | integer ≥ 0; `$inc` atomically | |

**Index:** `{tenantId,key}` unique.

---

## G. Portal menu / navigation (sidebar)

Dashboard analytics excluded (scope). `rolesVisible` is cosmetic — the real gate is
`roleHasPermission` (§C.3). All screens are **responsive** (same app on desktop and phone browser).

| Module | Icon (lucide) | Submodules | Roles that see it |
|---|---|---|---|
| **Assets** | `Truck` | All Assets · Documents (Wallet) · Meter Readings · Asset Groups · Custom Fields | admin, manager, team_manager, mechanic |
| **Inspections** | `ClipboardCheck` | Inspection History · Forms (builder) · Schedules · Exception Report | admin, manager, team_manager |
| **Defects** | `TriangleAlert` | — | admin, manager, team_manager, mechanic |
| **Maintenance** | `Wrench` | Work Orders · Faults · Service Tasks · Service Programs · Service History | admin, manager, team_manager, mechanic |
| **Inventory** | `Package` | Parts · Purchase Orders · Vendors · Locations | admin, manager, mechanic |
| **Drivers** | `IdCard` | All Drivers · Driver Wellness | admin, manager, team_manager |
| **Fuel** | `Fuel` | — | admin, manager, team_manager |
| **Teams** | `Users` | — | admin, manager |
| **People & Access** | `ShieldCheck` | Users · Roles & Permissions · Invitations | admin |
| **Settings** *(deferred — v1 uses hardcoded defaults in `constants/`; see §H Deferred)* | `Settings` | Company · Localization (language/timezone/units) · Notifications · Maintenance Rates · Service Defaults · Tax · Fuel · Integrations · Data Retention · Audit Log | admin |

> Drivers don't see the portal sidebar — they use the **mobile-browser inspection experience** of the
> same responsive app (inspections, defect reporting, fuel logging), gated by `mobileOnly`.

---

## H. Build roadmap

### H.1 The basic complete flow (build this FIRST — v1 MVP)

The minimum end-to-end path that makes the platform usable. Build only the fields this flow needs,
get it working start-to-finish, **then** layer the H.3 enhancements. This is the spine; everything
else is an add-on.

1. **Set up org & people.** The admin's tenant exists (3pm-auth). Admin invites **office users**
   (manager / mechanic) and **drivers** — all are `members`; their `role` decides portal vs. mobile.
2. **Add assets.** Admin creates `assets` (vehicles / equipment). **← pick a driver here (optional):**
   set the asset's **`assignedDriverId`** (primary driver) so that driver sees it on their phone.
   *(Team-based access is an enhancement — v1 uses this direct assignment.)*
3. **Driver inspects (DVIR).** The driver opens the asset in the phone browser and completes an
   `inspection` from an `inspectionTemplate` (pass/fail + photo → Azure Blob). The inspection records
   **who performed it** and the `assetId`.
4. **Failed item → Defect.** Any failed item auto-creates a `defect` on that asset (`status: open`);
   a manager can also raise one manually.
5. **Defect → Work Order.** A manager / mechanic converts the defect into a `workOrder`
   (`workOrder.defectIds` ↔ `defect.workOrderId`). **← pick the fixer here (the key decision):**
   assign it to an **internal mechanic** (`assignedMechanicId` → a `member`) **OR** an **external
   vendor** (`vendorId` → a `vendor`) — in-house labor vs. outsourced repair.
6. **Do the work.** Add **labor** (`laborLines`) and **parts** (`partLines` → deduct `parts` stock,
   made idempotent by `inventoryDeducted`).
7. **Complete & sign off.** Close the WO (`mechanicSignatureUrl`, `completedAt`, `meterAtService`)
   → the `defect` resolves, a `meterReadings` update lands, and the asset returns **in service**
   (`assets.status`).

**When each actor/entity is chosen** (the bit that was missing):
- **Driver** — (a) when you set an asset's `assignedDriverId`, and (b) implicitly when a driver runs a
  DVIR (the inspection stamps the performing driver).
- **Internal mechanic** — when a Work Order is done in-house (`workOrders.assignedMechanicId`).
- **Vendor** — when a Work Order is **outsourced** instead of done in-house (`workOrders.vendorId`).
  *(Vendors are also chosen on Purchase Orders — but PO is an enhancement.)*

### H.2 Build phases for the basic flow

Dependency-ordered; each ends in a testable slice. Build **only** the fields step H.1 uses.

- **Phase 0 — Foundation.** `mongodb.ts` / `api-client.ts` / `commonValidators.ts` /
  `setup-indexes.ts` / `counters`, universal base fields, RBAC seam (§C, matrix stubbed permissive),
  3pm-auth `getAuthenticatedUser` (§B checklist), Azure Blob signed-URL upload helper.
- **Phase 1 — Identity.** `members`, `roles` (seed 5 system roles), `invitations`.
- **Phase 2 — Assets.** `assets` (+ `assignedDriverId`), `meterReadings`.
- **Phase 3 — Inspections → Defects.** `inspectionTemplates`, `inspections` (mobile DVIR, photo→Blob),
  `defects`, shared `comments`.
- **Phase 4 — Inventory basics.** `vendors`, `parts` (stock).
- **Phase 5 — Maintenance core.** `workOrders` (defect→WO, assign mechanic **or** vendor, labor +
  `partLines` auto-deduct, complete + signature), `serviceHistory`.

→ **End of Phase 5 = the basic complete flow runs end-to-end.** Demo it before starting H.3.

### H.3 Enhancements (add only after the basic flow works)
- **Teams** + team-scoped RBAC, `driverAccessIds`, asset **groups**, **custom fields**,
  document **Wallet** + expiry, VIN-lookup, QR scan-to-inspect, bulk upload.
- **Inspection schedules** + **exception reports** (compliance).
- **Service Tasks** catalog + **Service Programs** (PM due computed at query time) + auto-generated WOs.
- **Purchase Orders** (reorder + receive into stock) + multi-location stock / `locations`.
- **Work Order** extras: custom statuses, **approval**, **recurrence**, **deadline/priority**.
- **Fuel logs** + economy; **notifications** (in-app); **audit log** surfacing.

### H.4 Deferred (out of scope now — no schema change to add later)
- **Settings module** — `tenantSettings` stays defined; **hardcode** its values in `constants/` for v1
  (units, maintenance rates / parts markup / tax = 0, service defaults).
- **Integrations + telematics** — `integrations` / `faults` stay defined but unused; **v1 Work Orders
  come from defects only**; the Maintenance ▸ Faults screen is hidden.
- **Dashboard** (analytics) & **Help/Support** — a plain post-login landing page suffices.
- **Background worker** — PM-due checks, reminder dispatch (push/email/sms), telematics/fuel polling.
  `nextDueAt`, `integrations`, `faults`, `notifications` are already in place for it.

---

## I. Whip Around feature-parity map

Every Whip Around platform capability mapped to where it lives in this architecture. Goal: the
reference provides **the same functionality** as Whip Around.

| Whip Around feature | Covered by |
|---|---|
| Assets (vehicles/equipment) + VIN, mileage, engine hours, photos, bulk upload, column views | `assets`, `meterReadings`, `assetCustomFieldDefs`; `bulkUpload` action |
| Telematics import of mileage/engine hours | `meterReadings` (source=`telematics`) + `integrations` |
| QR / barcode scan-to-inspect | `assets.qrCode` |
| Digital inspections (DVIR) + photo, signature, mileage, GPS | `inspections` (+ `geo`, `signatureUrl`) |
| Inspection form builder + template library + DOT templates | `inspectionTemplates` (sections/items, all item types) |
| Driver Wellness / COVID questionnaires | `inspectionTemplates.templateType='driver_wellness'` + `inspections.type` |
| Defects/Issues: status, **priority**, photos, **comments** | `defects` (+ `priority`) + `comments` |
| Work Orders: assign, statuses (**custom**), **approval**, **recurring**, **deadline**, labor/parts, costs, time, signature, notes | `workOrders` (+ approval/recurrence/dueDate) + `comments` |
| Faults (DTC from telematics) | `faults` |
| Service Programs (4 categories) + Service Tasks + schedules by time/mileage/hours + reminders + auto WO | `servicePrograms` (+ `category`), `serviceTasks`, `serviceHistory` |
| Parts & inventory (multi-location, reorder, auto-deduct) | `parts` (+ `stockLocations`) |
| Purchase Orders + receiving + suppliers | `purchaseOrders`, `vendors` |
| Fuel management + economy + fuel-card import | `fuelLogs` + `integrations` |
| Wallet — asset **and driver** documents + expiry reminders | `documents` (scope asset/team/driver/tenant) |
| Users, Drivers, Teams, unlimited users, roles & permissions, **cross-team driver access** | `members`, `teams`, `roles`, `invitations`, `assets.driverAccessIds` |
| Reminders & notifications (email/push/SMS/in-app) | `notifications` (+ tenant routing); dispatch via worker (deferred) |
| Exception report (missed inspections) + attended action + export | `exceptionReports` + `export` action |
| Integrations (Samsara, Geotab, Motive, Verizon Connect, fuel cards) | `integrations` |
| Settings: company, **language**, timezone, units, **tax**, **data retention**, mobile, subscription | `tenantSettings` (modules) |
| Audit / compliance records + export | `auditLog` + `export` action |
| Multi-company switcher | 3pm-auth tenant switch (§B) |
| Magic-link / SMS driver login | 3pm-auth (auth); drivers sign in to the responsive web app in the browser |
| Per-tenant human IDs (WO-/PO-/INS-/DEF-) | `counters` |

**Intentionally excluded (per your scope):** the analytics **Dashboard** (insights, asset/driver
**leaderboards**, maintenance summary charts), **Help/Support**, and **Referral/bonus**. The
underlying data for the dashboard already exists in the collections above, so it can be added later
with no schema change. If you later want full parity here too, say so and I'll add a reporting
layer.
