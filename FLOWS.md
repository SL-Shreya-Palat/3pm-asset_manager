# 3PM Asset Manager — Phase 1 Flows (Must-Have)

The minimum end-to-end path that makes the app usable. Build and verify this first.
**Legend:** ✅ done · 🟡 partial · 🔴 pending

**The spine:** `Log in → Add asset → Inspect → Defect → Work Order → Fix & sign off → done.`

---

## 1. Access — get people in  → ✅ done
**How it should be:** admin adds the team; each person logs in and sees the right view.

1. ✅ Admin invites a person (office user or driver) — name, email, role.
2. ✅ System emails an invite link; they accept and log in (3pm-auth).
3. 🔴 **Role should decide the view:** office users get the portal, **drivers are limited to inspections**.

**Pending:** basic role gating — right now any logged-in user can reach everything. *Must-have:* drivers
can only see/do inspections; office users get the full portal.

---

## 2. Setup — add the fleet  → ✅ done
**How it should be:** create assets and the few lookups the flow needs.

1. ✅ Add **Assets** (number, VIN, odometer, engine hours).
2. ✅ Set each asset's **primary driver** so it shows on their phone.
3. ✅ Add the needed lookups: **vendors, part categories, work-order statuses**.

**Pending:** none for Phase 1.

---

## 3. Inspection (DVIR) — the check on the website  → 🟡 works
**How it should be:** admin builds the form once; drivers fill it from their phone; it auto-scores.

1. ✅ Admin builds the inspection **form** (pass/fail items + photo + signature).
2. ✅ Admin opens **Defect Settings** and ticks which answers count as a fault, and how serious.
3. ✅ Driver fills the form on the website and submits.
4. ✅ System scores it **Pass / Fail** and saves the record.

**Pending:** none required for Phase 1. *(A driver-only fill screen instead of the embedded form is a
later polish, not a must-have.)*

---

## 4. Defect — turn a bad answer into an issue  → 🟡 mostly done
**How it should be:** every fault becomes a tracked issue on the asset.

1. ✅ A **failed** inspection answer **auto-creates a Defect** (status: Open).
2. ✅ A manager can also raise a Defect manually.
3. ✅ Each Defect keeps its severity/priority, photos, and a link to the inspection.
4. 🔴 A **critical** defect should mark the asset **out of service** until fixed.

**Pending:** out-of-service flag. *Must-have:* a critical open defect flips the asset to "out of service",
and it clears when the defect is resolved.

---

## 5. Work Order — fix the defect & record it  → 🔴 the main build
**How it should be:** turn the defect into a job, do the work, sign off, and the asset is usable again.

1. 🟡 Manager turns a Defect into a **Work Order** — *should link back to the defect.*
2. ✅ **Pick the fixer:** an in-house **mechanic** OR an external **vendor**.
3. 🔴 Add **labor** (hours/rate) and **parts** — using a part **deducts stock**.
4. 🔴 Mechanic **signs off**: signature + completion date + odometer/hours; close the WO.
5. 🔴 Then: the **defect resolves**, the asset returns **in service**, and the job is saved to **history + cost**.

**Pending (the core Phase-1 work):**
- Link **Work Order ↔ Defect**.
- Add **parts + labor line items** (with cost) to a Work Order.
- Using a part **auto-deducts inventory** (once per WO).
- **Sign-off** → defect resolves → asset back **in service** → write to **service history**.

> Parts/inventory: a manual parts list with stock already exists; Phase 1 only needs the **deduct on
> use** above. (Restocking via Purchase Orders is a later phase.)

---

## Phase 1 — what's left to build

| Flow | Pending (must-have) |
|---|---|
| 1. Access | Basic role gating — drivers limited to inspections |
| 4. Defect | Critical defect → asset "out of service" |
| 5. Work Order | Link to defect · parts + labor lines · auto-deduct stock · sign-off → resolve + back in service + service history |

Everything else in flows 1–4 is done. **Flow 5 is the bulk of Phase 1** and finishes the spine.

_Later phases (not now): preventative service programs, purchase orders/restocking, exception report,
fuel, vendor public links, document wallet._
