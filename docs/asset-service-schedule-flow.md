# Asset Service Schedule - Data Flow & Archive Behavior

## 1. Where Does Service Schedule Data Come From?

The **Asset Service Schedule** page is a **computed, read-only view** — it does not have its own database collection. It aggregates data from three sources:

```
┌─────────────────────────────────────────────────────────────────┐
│                   ASSET SERVICE SCHEDULE PAGE                   │
│   (Computed view - no dedicated DB collection)                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ assembles from
          ┌────────────────┼────────────────────┐
          ▼                ▼                    ▼
   ┌─────────────┐  ┌──────────────┐   ┌───────────────────┐
   │   assets     │  │ servicePlans │   │  serviceHistory   │
   │ (collection) │  │ (collection) │   │   (collection)    │
   └─────────────┘  └──────────────┘   └───────────────────┘
```

| Source Collection | What It Provides |
|---|---|
| `assets` | Asset name, icon, current odometer, current engine hours, `servicePlanId` |
| `servicePlans` | Plan name, list of schedules (name, interval, unit, recurring, hierarchy) |
| `serviceHistory` | Completed service logs (used to calculate "remaining" distance/time/hours) |

### Data Assembly Pipeline

```
API: GET /api/service-schedule?page=1&limit=25&search=...
         │
         ▼
Controller: getServiceSchedule(tenantId, options)
         │
         ├─ 1. Query all NON-archived assets that have a servicePlanId assigned
         │     Filter: { servicePlanId: { $ne: null }, isArchived: { $ne: true } }
         │
         ├─ 2. For EACH asset, call getAssetServiceStatus(tenantId, asset)
         │         │
         │         ├─ Load the assigned ServicePlan (by asset.servicePlanId)
         │         ├─ Load all approved service history for this asset
         │         ├─ Get current meter readings (odometer, engine hours)
         │         └─ Call calculateAllScheduleServices(plan.schedules, logs, meters)
         │                   │
         │                   ├─ Filter out archived schedules: scheduleIsActive(s)
         │                   │     → returns false if s.archived === true
         │                   │     → returns false if not recurring or interval <= 0
         │                   │
         │                   ├─ For each ACTIVE schedule:
         │                   │     • Find latest matching service log
         │                   │     • Apply hierarchy rules (serviceGroup + sortOrder)
         │                   │     • Calculate: remaining = interval - (currentMeter - lastServiceMeter)
         │                   │     • Determine status based on thresholds
         │                   │
         │                   └─ Return PerScheduleServiceInfo[]
         │
         ├─ 3. Map each schedule result to a ServiceScheduleItem row
         │     with status: "overdue" | "due_soon" | "upcoming"
         │
         └─ 4. Sort by priority (overdue first) and paginate
```

### Status Thresholds

| Unit | Overdue | Due Soon | Upcoming |
|---|---|---|---|
| Kilometers | remaining < 0 | remaining <= 100 km | remaining <= 500 km |
| Hours | remaining < 0 | remaining <= 10 hrs | remaining <= 50 hrs |
| Days/Months | remaining < 0 | remaining <= 7 days | remaining <= 30 days |

---

## 2. How Service Schedule Connects With Assets

The connection flows through a single field on the Asset: **`servicePlanId`**.

```
┌──────────────────────┐         ┌───────────────────────────────────┐
│        ASSET          │         │          SERVICE PLAN              │
│                       │         │                                   │
│  _id: ObjectId        │         │  _id: ObjectId                    │
│  name: "Truck A"      │  ───►   │  name: "Fleet Maintenance Plan"   │
│  servicePlanId: ──────┼────┘    │                                   │
│  currentOdometer: 150k│         │  schedules: [                     │
│  currentEngineHours   │         │    { id: "s1",                    │
│  lastServiceDate      │         │      name: "Wheel Alignment",     │
│  lastServiceMileage   │         │      unitOfMeasurement: "Km",     │
│                       │         │      serviceInterval: 10000,      │
└──────────────────────┘         │      recurring: true,              │
                                  │      archived: false,              │
                                  │      sortOrder: 0,                 │
                                  │      serviceGroup: null },         │
                                  │                                   │
                                  │    { id: "s2",                    │
                                  │      name: "Tire Replacement",    │
                                  │      unitOfMeasurement: "Km",     │
                                  │      serviceInterval: 50000,      │
                                  │      recurring: true,              │
                                  │      archived: false,              │
                                  │      sortOrder: 1,                 │
                                  │      serviceGroup: null }          │
                                  │  ]                                 │
                                  │  serviceTaskIds: [...]             │
                                  │  isArchived: false                 │
                                  └───────────────────────────────────┘
```

### Key Rules

- **One plan per asset** — each asset has at most one `servicePlanId`
- **One plan serves many assets** — the same plan can be assigned to multiple assets
- **Schedules live inside the plan** — they are embedded subdocuments, not separate collections
- **Each schedule has its own `archived` flag** — independent of the plan-level `isArchived`

### Hierarchy (Service Groups)

Schedules with the same `serviceGroup` number are linked by `sortOrder`:

```
Service Group 1:
  sortOrder 0: Oil Change       (every 5,000 km)
  sortOrder 1: Major Service    (every 20,000 km)

Rule: Completing "Major Service" (higher sortOrder) automatically
      resets "Oil Change" (lower sortOrder) in the same group.
```

---

## 3. Related Modules & Data Connections

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        COMPLETE DATA RELATIONSHIP                        │
│                                                                          │
│  ┌─────────┐    servicePlanId     ┌──────────────┐                       │
│  │  Asset   │ ──────────────────► │ Service Plan │                       │
│  └────┬─────┘                     └──────┬───────┘                       │
│       │                                  │                               │
│       │ assetId                    schedules[] (embedded)                 │
│       │                                  │                               │
│       ▼                                  ▼                               │
│  ┌──────────────┐   servicePlanSchedule  ┌────────────────┐              │
│  │   Service     │ ◄────────────────────  │   Schedule     │              │
│  │   History     │   (references which    │   (embedded)   │              │
│  │  (completed)  │    schedule was done)   │                │              │
│  └──────┬───────┘                        └────────────────┘              │
│         │                                                                │
│         │ workOrderId (back-reference)                                   │
│         │                                                                │
│         ▼                                                                │
│  ┌──────────────┐                                                        │
│  │  Work Order   │ ◄── On completion, can log a service entry            │
│  │              │      via servicePlanId + servicePlanSchedule            │
│  └──────┬───────┘                                                        │
│         │                                                                │
│         ├── defectIds[] ──► Defects (marked "corrected" on WO complete)   │
│         ├── faultIds[]  ──► Faults  (marked "corrected" on WO complete)   │
│         └── serviceTaskIds[] ──► Service Tasks                            │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Modules That Display/Use Service Schedule Data

| Module | How It Uses Schedule Data |
|---|---|
| **Asset Service Schedule** (fleet view) | Shows all assets' per-schedule due status (the page in your screenshot) |
| **Asset Detail → Service Tab** | Shows one asset's service plan, per-schedule status, and service history |
| **Work Orders** | Can reference a `servicePlanSchedule` on completion to log a service entry |
| **Service History** | Stores completed service records with `servicePlanSchedule` reference |
| **Service Plans** (management page) | CRUD for plans and their embedded schedules |

---

## 4. Archive Behavior — What Should Happen

### Two Levels of Archive

| Level | Field | What It Means |
|---|---|---|
| **Plan-level** | `ServicePlan.isArchived` | The entire plan is archived — no assets using this plan will show in schedule |
| **Schedule-level** | `ScheduleItem.archived` | A single schedule within a plan is archived — that schedule row disappears |

### Current Behavior When a Schedule Is Archived

When `schedule.archived = true` is set on a schedule inside a Service Plan:

1. `scheduleIsActive()` in `calc.ts` returns `false` for that schedule
2. `calculateAllScheduleServices()` skips it entirely
3. The schedule **does not appear** in the Asset Service Schedule fleet view
4. The schedule **does not appear** in the Asset Detail → Service Tab status

### Required Cascade Behavior (Archive/Remove a Schedule from a Plan)

When a service schedule is **removed or archived** from a Service Plan, the following cascade **must** occur:

```
┌─────────────────────────────────────────────────────────────────┐
│   TRIGGER: Schedule archived/removed from Service Plan          │
│   (schedule.archived = true  OR  schedule removed from array)   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────┐
        │  STEP 1: Find Affected Assets        │
        │                                      │
        │  Query: All assets where              │
        │  asset.servicePlanId === this plan    │
        └──────────────────┬───────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────┐
        │  STEP 2: Find Upcoming Services      │
        │                                      │
        │  For each affected asset, identify    │
        │  any "upcoming service" entries that  │
        │  were created from the archived       │
        │  schedule (matching by scheduleId     │
        │  or scheduleName)                     │
        └──────────────────┬───────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────┐
        │  STEP 3: Handle Work Orders          │
        │                                      │
        │  For each upcoming service found:     │
        │                                      │
        │  ┌────────────────────────────────┐   │
        │  │ Is the Work Order COMPLETED?   │   │
        │  │                                │   │
        │  │  YES → Leave it untouched      │   │
        │  │        (historical record)     │   │
        │  │                                │   │
        │  │  NO  → DELETE the open         │   │
        │  │        Work Order              │   │
        │  └────────────────────────────────┘   │
        └──────────────────┬───────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────┐
        │  STEP 4: Delete Upcoming Services    │
        │                                      │
        │  Delete/remove the upcoming service   │
        │  entries that are no longer valid      │
        │  (the schedule no longer exists or     │
        │  is archived)                          │
        └──────────────────┬───────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────┐
        │  STEP 5: Preserve History            │
        │                                      │
        │  DO NOT delete:                       │
        │  • Completed Work Orders             │
        │  • Service History records           │
        │    (permanent audit trail)            │
        └──────────────────────────────────────┘
```

### What Should NOT Be Visible After Archive

| Data | Visible? | Reason |
|---|---|---|
| Archived schedule row in **Asset Service Schedule** page | **NO** | `scheduleIsActive()` filters it out |
| Archived schedule in **Asset Detail → Service Tab** status | **NO** | Same filter applies |
| **Open Work Orders** linked to the archived schedule | **NO** | Should be deleted (cascade) |
| **Upcoming Services** from the archived schedule | **NO** | Should be deleted (cascade) |
| **Completed Work Orders** that referenced this schedule | **YES** | Historical record — must be preserved |
| **Service History** entries for the archived schedule | **YES** | Permanent audit trail — never deleted |
| The schedule in **Service Plan edit** view | **YES** | Shown as archived/greyed out for admin reference |

### What Should Remain Untouched

| Data | Why |
|---|---|
| **Completed Work Orders** | These represent actual work done — they are historical records |
| **Service History records** | Permanent audit trail of all services performed; needed for compliance |
| **Asset's `servicePlanId`** | The asset still references the plan; only one schedule within it is archived |
| **Other active schedules** in the same plan | Unaffected — they continue to compute normally |

---

## 5. Implementation Flow — Cascade on Schedule Archive

### Pseudocode

```
function archiveScheduleFromPlan(tenantId, planId, scheduleId):

    // 1. Mark the schedule as archived in the plan
    update servicePlans
      where _id = planId AND schedules.id = scheduleId
      set   schedules.$.archived = true

    // 2. Find all assets using this plan
    affectedAssets = find assets
      where tenantId = tenantId AND servicePlanId = planId

    // 3. For each affected asset, find open work orders
    //    that reference this specific schedule
    for each asset in affectedAssets:

        openWorkOrders = find workOrders
          where tenantId = tenantId
            AND assetId = asset._id
            AND servicePlanSchedule = scheduleId (or scheduleName)
            AND isCompleted != true
            AND isArchived != true

        // 4. Delete (or archive) open work orders
        for each wo in openWorkOrders:
            delete workOrder where _id = wo._id
            // Also clean up any linked defects/faults if needed

    // 5. Service History — DO NOTHING
    //    (completed records are permanent audit trail)

    // 6. The computed service schedule will automatically
    //    exclude this schedule on next request
    //    (scheduleIsActive() returns false)
```

### Key Files to Modify

| File | Change Needed |
|---|---|
| `src/controller/service-plans/index.ts` | Add cascade logic in the update/archive schedule function |
| `src/controller/work-orders/index.ts` | Add a function to delete/archive open WOs by schedule reference |
| `src/app/api/service-plans/[id]/route.ts` | Trigger cascade when PATCH updates a schedule's `archived` flag |

---

## 6. Summary Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   SERVICE PLAN                                                               │
│   ┌────────────────────────────────────────────────────────┐                  │
│   │  Plan: "Fleet Maintenance"                             │                  │
│   │                                                        │                  │
│   │  Schedule A: Wheel Alignment  (every 10,000 km) ✓      │                  │
│   │  Schedule B: Tire Replacement (every 50,000 km) ✓      │                  │
│   │  Schedule C: Brake Check      (every 20,000 km) ✗ ←── ARCHIVED          │
│   └─────────────────────┬──────────────────────────────────┘                  │
│                         │                                                    │
│                    assigned to                                                │
│                         │                                                    │
│              ┌──────────┴──────────┐                                          │
│              ▼                     ▼                                          │
│         ┌─────────┐          ┌─────────┐                                     │
│         │ Asset 1  │          │ Asset 2  │                                     │
│         └────┬─────┘          └────┬─────┘                                     │
│              │                     │                                          │
│              ▼                     ▼                                          │
│   ASSET SERVICE SCHEDULE shows:                                               │
│                                                                              │
│   ┌──────────┬───────────────────┬─────────┐                                  │
│   │ Asset    │ Schedule          │ Status  │                                  │
│   ├──────────┼───────────────────┼─────────┤                                  │
│   │ Asset 1  │ Wheel Alignment   │ Overdue │  ← visible                      │
│   │ Asset 1  │ Tire Replacement  │ Upcoming│  ← visible                      │
│   │ Asset 1  │ Brake Check       │   —     │  ← HIDDEN (archived)            │
│   │ Asset 2  │ Wheel Alignment   │ Due Soon│  ← visible                      │
│   │ Asset 2  │ Tire Replacement  │ Upcoming│  ← visible                      │
│   │ Asset 2  │ Brake Check       │   —     │  ← HIDDEN (archived)            │
│   └──────────┴───────────────────┴─────────┘                                  │
│                                                                              │
│   WORK ORDERS for "Brake Check":                                              │
│   ┌──────────────────────────────────────────┐                                │
│   │ WO-001: Brake Check on Asset 1           │                                │
│   │   Status: Open       → DELETED           │                                │
│   │                                          │                                │
│   │ WO-002: Brake Check on Asset 2           │                                │
│   │   Status: Completed  → KEPT (historical) │                                │
│   └──────────────────────────────────────────┘                                │
│                                                                              │
│   SERVICE HISTORY:                                                            │
│   ┌──────────────────────────────────────────┐                                │
│   │ All past "Brake Check" service logs      │                                │
│   │   → KEPT (permanent audit trail)         │                                │
│   └──────────────────────────────────────────┘                                │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Quick Reference

### Database Collections Involved

| Collection | Role |
|---|---|
| `servicePlans` | Stores plans with embedded schedules (source of truth) |
| `assets` | Links to plan via `servicePlanId` |
| `serviceHistory` | Completed service audit trail (never deleted) |
| `workOrders` | Maintenance tasks; open ones deleted on schedule archive |
| `meterReadings` | Odometer/engine hour snapshots (unaffected by archive) |
| `defects` | Linked to work orders (may need cleanup if WO is deleted) |
| `faults` | Linked to work orders (may need cleanup if WO is deleted) |

### API Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/service-schedule` | Computed fleet schedule view (reads only) |
| `GET /api/assets/[id]/service-status` | Single asset's service plan + status |
| `PATCH /api/service-plans/[id]` | Update plan (including archiving schedules) |
| `PATCH /api/service-plans/[id]/archive` | Archive entire plan |
| `PUT /api/work-orders/[id]/complete` | Complete WO + optionally log service |
| `GET /api/service-history` | List completed service records |
