# Fleet Management Application - Complete Blueprint

> Reference: [Whiparound](https://whiparound.com/) | Project: 3PM Asset Manager
> This document provides a thorough breakdown of every module, their interconnections, data flows, entity relationships, and implementation guidance.

---

## Table of Contents

1. [Platform Overview](#platform-overview)
2. [Architecture & Tech Stack](#architecture--tech-stack)
3. [Module Breakdown](#module-breakdown)
   - [Dashboard](#1-dashboard)
   - [Inspections](#2-inspections)
   - [Maintenance](#3-maintenance)
   - [Assets](#4-assets)
   - [Vendors](#5-vendors)
   - [Fuel](#6-fuel)
   - [Reminders](#7-reminders)
   - [People](#8-people)
4. [Entity Relationship Diagram](#entity-relationship-diagram)
5. [Module Interconnection Map](#module-interconnection-map)
6. [Data Flow Pipelines](#data-flow-pipelines)
7. [Database Schema (MongoDB Collections)](#database-schema-mongodb-collections)
8. [API Route Plan](#api-route-plan)
9. [Implementation Order](#implementation-order)
10. [Current Project Status](#current-project-status)

---

## Platform Overview

The fleet management platform digitizes and centralizes vehicle/equipment operations -- replacing paper-based inspection, maintenance, and compliance processes. It serves fleet managers, drivers, mechanics, and safety officers.

### Core Philosophy: Detect -> Assign -> Resolve -> Record

1. **Detect** issues via digital inspections (driver web app), telematics fault codes, or manual creation
2. **Assign** issues (defects) to mechanics, vendors, or external contractors with automated notification
3. **Resolve** via structured work orders with labor tracking, parts consumption, vendor collaboration
4. **Record** full audit trails: inspection PDFs, GPS/timestamps, e-signatures, service history, cost tracking

### Single Plan

All modules are included for every asset -- no tiered subscriptions. Every asset gets full access to Inspections, Defects, Reminders, Documents, Work Orders, Preventative Maintenance, Inventory, Purchase Orders, and all other features.

All plans include unlimited users and support.

---

## Architecture & Tech Stack

### Current 3PM Stack (Already in Use)

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript 5 |
| UI Framework | Radix UI + TailwindCSS 4 |
| State Management | Zustand 5 |
| Backend | Next.js API Routes |
| Database | MongoDB (native driver, no ODM) |
| Auth | 3pm-auth-master (JWT, OAuth, SAML, multi-tenant) |
| Forms | form-builder-portal (embedded via iframe/API) |
| File Storage | Azure Blob Storage / AWS S3 |
| Email | SendGrid |
| HTTP Client | Axios |

### Additional Tech Needed

| Purpose | Technology |
|---------|-----------|
| Real-time Notifications | Socket.io (already in construction-portal) |
| Job Queue | BullMQ + ioredis (for scheduled reminders, auto work orders) |
| PDF Generation | Puppeteer or jsPDF (already in form-builder-portal) |
| GPS/Location | Browser Geolocation API + react-map-gl |
| Barcode/QR | qrcode library for generation, web-based scanning |
| Telematics | REST API integrations (Geotab, Samsara, Motive) |

---

## Module Breakdown

---

### 1. Dashboard

The command center that aggregates real-time data from all modules.

#### 1a. Main Dashboard

**What it displays:**

| Section | Metrics |
|---------|---------|
| Inspections Summary | Total completed, trend vs prior period, average duration |
| Defects Summary | Total count, average correction time, open vs resolved |
| Pie Charts | % of assets inspected, % of drivers inspecting, % assets with open defects |
| Trend Graphs | Inspections over time, defects over time (hover-enabled data points) |
| Driver Leaderboard | Top/bottom drivers by inspection count or average inspection time |
| Asset Leaderboard | Top/bottom assets by inspections, defects, work orders, or total spend |
| Maintenance Summary | Defects by priority, active services, open work orders, out-of-service assets |
| Upcoming Schedule | Weekly calendar of services and work orders due, hover tooltip for task details |

**Filters:** Date range (preset or custom), team selection (single or all)

**Automated Reporting:** Schedule PDF reports (weekly/monthly/yearly) delivered at 9 AM in configured timezone.

#### 1b. Custom Dashboards

- Create multiple named dashboards with personalized views
- Add charts from a "ready-to-go" library or build fully custom chart configurations
- Supports multiple chart types (bar, line, pie, etc.)
- Trackable metrics: inspections, maintenance, fuel, driver behavior
- Export each chart as CSV/Excel
- Dashboards can be shared with team members
- Access: Admins, Managers, Team Managers

**Data Sources for Dashboard:**
```
Inspections Module -----> Inspection counts, pass/fail rates, duration
Defects Module ---------> Defect counts, correction times, priorities
Work Orders ------------> Open/closed counts, costs
Service Programs -------> Upcoming services due
Fuel Module ------------> Consumption trends, costs
Assets Module ----------> Out-of-service status, asset counts
People Module ----------> Driver activity, team breakdowns
```

---

### 2. Inspections

The core compliance module -- captures field data from drivers via web app.

#### 2a. Forms (Inspection Templates)

Forms are configurable templates that drivers use on the web app to conduct inspections.

**Form Structure:**
- A Form contains multiple **Cards** (inspection items/questions)
- Cards are ordered by drag-and-drop (determines display order)
- Templates available: DOT-compliant DVIR, custom from scratch

**Available Card/Field Types:**

| Card Type | Description | Special Behavior |
|-----------|-------------|-----------------|
| Pass/Fail | Primary inspection card | **A FAIL creates a Defect automatically** |
| Text Input | Free text entry | -- |
| Checkbox | Boolean toggle | -- |
| Dropdown | Select from predefined options | -- |
| Mileage/Odometer | Numeric input | Manual entry, syncs to asset profile |
| Engine Hours | Numeric input | Syncs to asset profile |
| Photo Capture | File upload | Can be set as mandatory |
| Signature | Touch signature pad | Used for compliance (driver/mechanic sign-off) |
| Driver Wellness | Health/safety questions | Responses stored separately in Driver Wellness |
| Multiple Photos | Multi-file upload per card | Configurable count |
| Help Text / Label | Instructional text | Not a data field |

**Form Settings:**
- Fields: required vs optional
- Helper text per card
- Forms assigned to specific assets (asset requires at least one form)

**Compliance Settings (DVIR):**
- Require driver signature on last inspection report
- Require mechanic signature on corrected faults (triggers signature modal on defect status -> "Complete")

**AI Inspections (Optional Add-on):**
- AI analyzes submitted photos alongside driver responses post-submission
- Detects: scratches, dents, rust, leaks, visible wear
- Flags inconsistencies (driver marked "no issues" but photo shows damage)
- Managers review flagged items -- approve defect creation or dismiss
- AI does NOT auto-create defects -- human review required

**Integration with form-builder-portal:**
- Forms are built using the embedded form-builder-portal
- Endpoint: `/api/embed/form-builder-session`
- Form definitions stored in form-builder-portal's `forms` collection
- Submissions stored in form-builder-portal's `records` collection

#### 2b. Inspection History

The record store for all completed inspections.

**Data Captured Per Inspection:**

| Field | Description |
|-------|-------------|
| Inspection ID | Unique system-generated identifier |
| Asset | Which vehicle/equipment was inspected |
| Driver | Who performed the inspection |
| Date/Time | When the inspection was submitted |
| GPS Location | Lat/long stamp at submission time |
| Overall Result | Pass or Fail |
| Per-Card Answers | Every driver response to every form item |
| Photos | Images attached to specific cards |
| Defect Items | Failed cards with correction status (red=uncorrected, green=corrected) |
| Mechanic Signature | On corrected faults (when compliance enabled) |
| Driver Signature | On last report (when compliance enabled) |

**User Actions:**
- Filter by: pass/fail, team, date range, custom operators (contains, equals, is after, etc.)
- Keyword search across records
- Customize displayed columns (minimum 4)
- Navigate between "Asset" questions and "Driver Wellness" questions within one inspection
- Click an uncorrected defect description to jump to defect details
- Edit: Asset, Driver, Date, Time (limited fields)
- Download individual reports as PDF
- Export selected/all inspections as CSV or Excel
- Share as PDF via email

**Important:** Deleted assets, drivers, or forms still appear in history marked as "deleted" -- records preserved for compliance.

#### 2c. Exception Report

Compliance monitoring tool tracking whether assets are inspected per schedule.

**Calendar View -- Six Statuses:**

| Status | Meaning | Color |
|--------|---------|-------|
| Inspected | Vehicle inspected that day | Green |
| Not Required | No inspection needed | Gray |
| Exception | Reminder set but no inspection done | Red |
| Exception Attended | Exception occurred but action taken | Orange |
| No Inspection | No reminder set, no inspection done | Light gray |
| No Inspection Attended | No reminder, but action taken | Blue |

**Quick Actions (hover over calendar cell):**
- Create a reminder for un-reminded forms
- Contact the driver about missed inspection
- Omit the record (mark as legitimately not required)
- Export to CSV

**Filters:** Date range, specific forms, specific teams

---

### 3. Maintenance

The most complex module -- seven interconnected sub-modules forming a complete preventative and reactive maintenance system.

#### 3a. Defects

The primary **reactive** maintenance entity. Created automatically when a driver fails a Pass/Fail card during inspection, or manually from the web.

**Defect Data Fields (18 configurable columns):**

| Field | Description |
|-------|-------------|
| Defect ID | System-generated unique identifier |
| Name/Description | What the defect is |
| Status | Customizable (default: New, In Progress, Corrected) |
| Asset | Which vehicle/equipment |
| Priority | Urgency level |
| Severity | Impact level |
| Type/Category | Classification |
| Repetition Count | How many times this defect recurred |
| Inspection Reference | Which inspection found it |
| Assignee | Mechanic, vendor, or third-party contact |
| Team | Which team |
| Created By | Driver (auto) or manager (manual) |
| Created At | Timestamp |
| Last Updated | Timestamp |
| Linked Work Order(s) | Forward reference to work orders |
| Source | inspection / DTC fault / manual / AI flagged |

**Defect Lifecycle Workflow:**
```
1. CREATED
   ├── From inspection (auto -- driver fails a card)
   ├── From DTC fault code (telematics integration)
   ├── From AI photo analysis (manager approves)
   └── Manually (manager creates from web)
       │
2. ASSIGNED
   ├── To internal mechanic (user)
   ├── To vendor contact (sends magic link -- no login required)
   └── To third-party contact (sends magic link)
       │
3. STATUS UPDATES (customizable statuses)
   ├── New -> In Progress -> Corrected
   └── Custom statuses as needed
       │
4. COMPLETED
   ├── If mechanic signature required -> signature modal appears
   ├── Defect record links back to originating inspection
   └── Defect record links forward to work order(s) created
```

**Bulk Operations:** Select multiple defects, update status in batch.

**Out of Service:** A defect can trigger marking an asset as out-of-service.

#### 3b. Service Tasks

Atomic, reusable maintenance activities stored in a library.

- Created individually with title + description
- Stored centrally, reused across multiple service programs and work orders
- Examples: "Oil Change", "Tire Rotation", "Brake Inspection", "Filter Replacement"
- Can be created inline during work order creation if needed

**This is essentially a lookup/reference table.**

#### 3c. Service Programs

Recurring or one-time maintenance plans bundling service tasks with automated triggers.

**Configuration Fields:**

| Field | Description |
|-------|-------------|
| Title | Program name |
| Service Tasks | One or more tasks from the library |
| Assets | All assets, specific groups, or individual assets |
| Trigger Type(s) | Time interval, mileage, engine hours (all 3 can be active simultaneously) |
| Start/End Date | Program validity window |
| Last Service Mileage | Initial baseline for next-due calculation |
| Last Service Date | Initial baseline for next-due calculation |

**Trigger Logic:** All three triggers can be active simultaneously. The first threshold reached fires the program.

**Notification Configuration:**

| Setting | Options |
|---------|---------|
| Threshold | Notify X miles/hours/days before due |
| Recipient | Specific managers |
| Channel | Dashboard notification, email, or both |
| Auto Work Order | Optionally auto-create a work order when reminder fires, pre-assigned to a mechanic |

**Program Types:**
1. Scheduled Maintenance (time/mileage/hours-based recurring)
2. Unscheduled Maintenance (one-off)
3. Inspections
4. Custom

**Duplication:** Programs can be duplicated for quick setup of similar configurations.

#### 3d. Service Schedule

A **view-only** module displaying all upcoming service tasks across assets and programs.

- Weekly calendar/list view, navigable forward/backward
- Assets with upcoming services appear in the list
- Hover over asset name -> tooltip showing specific service tasks due
- Filter by team
- "Create WO" button converts a due service into a work order
- Work Order column shows existing WO number or "Create WO" option
- Available on web

#### 3e. Work Orders

The operational unit for managing repair and maintenance execution.

**Three Creation Paths:**
1. **From Defects list** -- pre-populates asset and defect details
2. **From Service Schedule** -- pre-populates asset and service task
3. **From scratch** -- manual creation

**Work Order Fields:**

| Field | Description |
|-------|-------------|
| WO Number | System-generated (format: WO-####) |
| Asset | Which vehicle/equipment |
| Service Task(s) | At least one required; can add multiple |
| Related Defect(s) | Optional link to originating defects |
| Assignee | Mechanic (internal), Vendor, or Third Party |
| Due Date | When work should be completed |
| Status | Customizable with approval workflow |
| Labor Cost | Cost of labor performed |
| Parts/Components | Linked from inventory (auto-deducted) |
| Attachments | Documents, diagrams, photos |
| Comments/Notes | Update log |
| Out of Service | Toggle to mark asset unavailable during repairs |

**Custom Status & Approval Workflow:**
- Create custom status names beyond defaults
- Statuses can require approval before proceeding
- Approval-required statuses trigger notifications to designated approvers
- Approvers can approve or reject (rejection requires reason)
- Enables multi-step authorization chains for costly repairs

**Smart Bundling:** When creating a WO from a defect, the system offers to include outstanding service program tasks due for that asset -- bundling reactive + scheduled maintenance in one WO.

#### 3f. Inventory

Parts management tracking stock levels, integrated with work orders and purchase orders.

**Part Record Fields:**

| Field | Description |
|-------|-------------|
| Part Name | Required |
| Description | Details about the part |
| Category | Classification |
| Location | Per-location quantity tracking |
| Vendor(s) | Multiple vendors per part, each with unit cost |
| Manufacturer | Who makes it |
| Reorder Point | Triggers low-stock email alert |
| Maximum Quantity | Triggers overstock alert |
| Measurement Units | How it's measured |
| Custom Fields | Text, Date, Select, Checkbox |

**Key Behaviors:**
- **Part added to work order -> automatically subtracted from inventory**
- **Purchase order received -> inventory automatically incremented**
- Two-tier alert: alert at reorder point, second alert at zero stock
- Barcode/QR code generation per part for scanning
- Bulk import via CSV/TSV/XLS/XLSX/XML with AI-assisted column matching

#### 3g. Purchase Orders

Formal procurement workflow to replenish inventory.

**Nine Lifecycle Statuses:**

```
Drafts -> Pending Approval -> Approved -> Purchased -> Received -> Closed
                           \-> Rejected (reason required)
                                                    \-> Received Partial
```

| Status | Description |
|--------|-------------|
| Drafts | Being created or saved for later |
| Pending Approval | Submitted, awaiting approval |
| Rejected | Declined (rejection reason required) |
| Approved | Authorized for purchase |
| Purchased | Ordered, not yet received |
| Received | All items received as ordered |
| Received Partial | Fewer items than ordered |
| Closed | Completely fulfilled and finalized |

**Purchase Order Fields:**
- Vendor (must be "Parts" type in Vendors module)
- Delivery location
- Line items (up to 30): part, quantity, unit cost
- Shipping cost (fixed or percentage)
- Tax (fixed or percentage)
- Description/notes
- Supporting document attachments

**Approval Workflow:**
- Approvers receive notifications based on their communication preferences
- Only users with correct permissions can approve
- Approve or reject with mandatory rejection reason

**Inventory Impact:** When PO is marked "Receive," user selects which line items to receive with quantities. Inventory updates automatically. If fewer items arrive, status becomes "Received Partial."

---

### 4. Assets

The central registry for all physical items managed in the system.

**Supported Asset Types:**
- Vehicles (cars, trucks, buses)
- Trailers
- Equipment (forklifts, pallet jacks, mowers, scaffolds)
- Facilities
- Boats
- Tools and machinery
- Any physical item requiring tracking

**Asset Profile -- Required Fields:**

| Field | Required | Description |
|-------|----------|-------------|
| Asset Name | Yes | Unique identifier |
| Team | Yes | Responsible team |
| Form(s) | Yes | At least one inspection form assigned |

**Asset Profile -- Optional Fields:**
- Make, Model, Year, Color
- VIN (triggers VIN decoder -- auto-fills make, model, year, tire size, color, subtype)
- Tire size, Asset subtype
- Photos

**Asset Profile -- Sub-Sections (Tabs):**

| Tab | Content |
|-----|---------|
| Inspections | All inspections completed on this asset |
| Defects | Active and resolved defects |
| Mileage/Hours | Odometer and engine hour history |
| Maintenance | Service history |
| Work Orders | Open and closed, with associated costs |
| Fuel | Fuel transactions for this asset |
| Documents (Wallet) | Uploaded files and documents |
| Custom Fields | User-defined additional data |

**Functional Features:**
- Assign to a driver or team
- Custom alert configuration for maintenance, inspection, service requirements
- Out-of-service status with reason logging (filterable, exportable)
- Barcode/QR code generation for quick ID and inspection initiation
- Column customization on list view (including custom fields)

**VIN Decoder:** When VIN is entered, auto-populates make, model, year, tire size, color, and asset subtype from DataOne database.

---

### 5. Vendors

Centralized directory of external parties for parts procurement and maintenance work.

**Vendor Types (determines usage context):**

| Type | Can Be Used For |
|------|----------------|
| Parts | Purchase orders (as supplier) |
| Services | Work orders and defects (as assignee) |
| Both | Both procurement and service work |

**Vendor Record Fields:**
- Vendor name (required)
- Vendor type (Parts / Services / Both)
- Multiple contacts per vendor (name, phone, email)
- Designated primary contact

**Magic Link Workflow:**
When a defect or work order is assigned to a vendor contact, the system sends them a **magic link** via email. The vendor can view and update work on that specific item **without needing a login or account**. This enables external mechanics and service shops to participate without being platform users.

**Operations:** Create individually or bulk upload, search, edit, delete, filter by type.

---

### 6. Fuel

Tracks fuel consumption, costs, and efficiency across the fleet.

**Data Ingestion Methods:**
1. Manual file upload (CSV, TSV, XLS, XLSX, XML) with drag-and-drop
2. Automated import via fuel card integrations (WEX/Mastercard, Fleetcor/Coast)
3. AI-assisted data cleaning before final import

**Metrics Tracked Per Transaction:**

| Metric | Formula |
|--------|---------|
| Distance | Ending mileage - starting mileage |
| Volume | Fuel quantity consumed |
| Fuel Cost | Total dollar amount |
| Economy | Distance / Volume = MPG or L/100km |
| Cost per Mile | Total cost / Total distance |

**Analytics Capabilities:**
- Fuel consumption trends over time
- Per-vehicle and per-driver fuel analysis
- High-consumption vehicle/driver identification
- Fuel theft detection (anomaly analysis)
- Idling pattern identification
- Total cost of ownership contribution

**Data Flow:** Fuel transactions appear in both the central Fuel module AND within individual asset profiles (dual visibility). Data also flows into Dashboard reporting and custom dashboards.

**Filters:** Team, date range, asset name search, column customization (4-10 columns)

---

### 7. Reminders

Automated notification and alert engine for operational events.

**Four Reminder Types:**

| Type | Purpose | Delivery | Target |
|------|---------|----------|--------|
| Driver Reminders | Custom messages to drivers | Email + Web notification | Specific drivers |
| Missed Inspection | Alert for incomplete inspections | Email + Web notification (driver) + Email (managers) | Drivers who missed |
| Manager Reminders | General operational reminders | Email | Managers |
| Exception Report Reminders | Alert when vehicles not routinely inspected | Email to Team Managers + Followers | Form-based schedule |

**Configuration Fields (per type):**
- Name/Title
- Days of week
- Time
- Target drivers/assets
- Message/description
- Frequency (for manager reminders)

**Important:** Service program reminders (maintenance-related) are configured within the Service Programs module, not here. This module focuses on inspection compliance and operational communications.

---

### 8. People

Manages all human entities across four sub-sections.

#### 8a. Drivers

Web app users who perform inspections. Distinct from admin/manager web platform users.

**Required Fields:**
- First Name, Last Name
- Email (used as login username)
- Password
- Team assignment (mandatory)

**Invitation Methods:**
- Email: receives setup instructions with login link

**Key Characteristics:**
- Drivers access the web application with a **driver-specific interface** focused on inspections
- A driver can be promoted to a user role (Admin, Manager, etc.) -- auto-creates a User profile with shared credentials

**Driver Wallet:**
- Cloud document storage for driver-specific documents
- File types: photos, JPG, PNG, video, Word, Excel
- Expiration dates with color-coded indicators (yellow=expiring soon, red=expired)
- Reminder options: 30 days, 60 days, or custom date before expiry
- Privacy: personal docs visible only to driver and their manager(s)

#### 8b. Driver Wellness

Health and wellness screening embedded in inspections.

**How It Works:**
- Wellness cards embedded directly into standard inspection forms (specific card types)
- Or standalone wellness-only forms
- Drivers answer wellness questions during normal web inspection workflow
- Responses stored **separately** from vehicle inspection data in a dedicated Driver Wellness area

**Access Paths:**
1. From Inspection History (arrow on specific Inspection ID)
2. From a Driver's individual profile

**Export:** Full export functionality for record-keeping/analysis.

**Use Cases:** Originally COVID-19 health screening, now used for broader safety and wellness programs.

#### 8c. Teams

Organizational hierarchy unit grouping drivers, assets, and managers.

**Team Composition:**
- Drivers
- Assets
- Managers (users)

**User-to-Team Relationship Levels:**

| Level | Visibility | Edits | Alerts |
|-------|-----------|-------|--------|
| Managing | Full | Yes -- edit drivers, assets, managers | Yes -- all defects and inspections |
| Following | Read-only | No | Yes -- all defects and inspections |
| None | No access | No | No |

**Default:** All users follow all teams. Admins can change relationship settings.

**Data Scope:** Following a team means inspection/defect data for every asset and driver in that team appears in Dashboard, Defects, and Inspections modules.

#### 8d. Users

Web platform accounts with role-based access. Distinct from (but can overlap with) drivers.

**Five User Roles:**

| Role | Web Access | Scope | Key Permissions |
|------|-----------|-------|-----------------|
| Admin | Full | All | Everything including settings and billing |
| Manager | Full (read) | All | View everything, cannot change account settings or forms |
| Team Manager | Limited | Assigned teams only | Assets, Drivers, Inspections, Defects, Work Orders within teams |
| Mechanic | Maintenance only | Maintenance | View/update defects and work orders |
| Driver | Driver interface | Assigned assets | Complete inspections on assigned assets via web |

**Custom Permissions:** Admins can set granular permissions for Managers, Team Managers, and Mechanics -- controlling create/update/delete/export/bulk-upload per module (15 modules supported).

---

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ORGANIZATIONAL LAYER                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────┐    has many    ┌──────────┐    has many   ┌────────┐ │
│  │  Tenant   │──────────────>│   Team    │<────────────>│  User  │ │
│  └──────────┘               └──────────┘  (Managing/   └────────┘ │
│       │                      │    │    │   Following/     │        │
│       │                      │    │    │   None)          │        │
│       │              ┌───────┘    │    └───────┐      has role     │
│       │              v            v            v         │        │
│       │         ┌────────┐  ┌──────────┐ ┌────────┐  ┌──────┐   │
│       │         │ Driver │  │  Asset    │ │Manager │  │ Role │   │
│       │         └────────┘  └──────────┘ └────────┘  └──────┘   │
│       │              │           │                                │
└───────┼──────────────┼───────────┼───────────────────────────────┘
        │              │           │
┌───────┼──────────────┼───────────┼───────────────────────────────┐
│       │      INSPECTION LAYER    │                                │
├───────┼──────────────┼───────────┼───────────────────────────────┤
│       │              │           │                                │
│       │              │    ┌──────┴──────┐                        │
│       │              │    │    Form     │ (assigned to asset)     │
│       │              │    │  ┌───────┐  │                        │
│       │              │    │  │ Card  │  │ (Pass/Fail, Text,      │
│       │              │    │  │ Card  │  │  Photo, Signature...)  │
│       │              │    │  │ Card  │  │                        │
│       │              │    │  └───────┘  │                        │
│       │              │    └──────┬──────┘                        │
│       │              │           │                                │
│       │              │    ┌──────┴──────┐                        │
│       │              └───>│ Inspection  │<──── (driver + asset    │
│       │                   │             │       + form + GPS      │
│       │                   │  answers[]  │       + timestamp)      │
│       │                   │  photos[]   │                        │
│       │                   │  signatures │                        │
│       │                   └──────┬──────┘                        │
│       │                          │ (failed card = defect)        │
└───────┼──────────────────────────┼───────────────────────────────┘
        │                          │
┌───────┼──────────────────────────┼───────────────────────────────┐
│       │       MAINTENANCE LAYER  │                                │
├───────┼──────────────────────────┼───────────────────────────────┤
│       │                          v                                │
│       │                   ┌──────────────┐                       │
│       │                   │   Defect      │──────┐               │
│       │                   │              │      │               │
│       │                   └──────────────┘      │ creates       │
│       │                          │              v               │
│       │            ┌─────────────┤      ┌──────────────┐        │
│       │            │             │      │ Work Order   │        │
│       │            v             │      │              │        │
│       │   ┌──────────────┐      │      │ tasks[]      │        │
│       │   │Service Task  │      │      │ parts[] ─────┼──┐     │
│       │   │ (library)    │      │      │ labor cost   │  │     │
│       │   └──────┬───────┘      │      │ assignee ────┼──┼──┐  │
│       │          │              │      └──────────────┘  │  │  │
│       │          v              │                        │  │  │
│       │   ┌──────────────┐      │                        │  │  │
│       │   │Service Program│     │      ┌─────────────┐   │  │  │
│       │   │              │      │      │  Inventory   │<──┘  │  │
│       │   │ tasks[]      │      │      │  (Parts)     │      │  │
│       │   │ assets[]     │      │      │              │      │  │
│       │   │ triggers[]   │──────┘      │ qty auto-    │      │  │
│       │   │ (time/mi/hr) │             │ adjusted     │      │  │
│       │   └──────┬───────┘             └──────┬──────┘      │  │
│       │          │                            │             │  │
│       │          v                            v             │  │
│       │   ┌──────────────┐          ┌──────────────┐        │  │
│       │   │Service       │          │Purchase Order│        │  │
│       │   │Schedule      │          │              │────────┼──┘
│       │   │(view only)   │          │ vendor ──────┼────────┘
│       │   └──────────────┘          │ line items[] │
│       │                             │ (parts+qty)  │
│       │                             └──────────────┘
└───────┼──────────────────────────────────────────────────────┘
        │
┌───────┼──────────────────────────────────────────────────────┐
│       │            SUPPORT LAYER                              │
├───────┼──────────────────────────────────────────────────────┤
│       │                                                      │
│       │   ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│       │   │  Vendor   │  │   Fuel    │  │    Reminder      │  │
│       │   │          │  │Transaction│  │                  │  │
│       │   │ type:    │  │          │  │ driver_reminder   │  │
│       │   │ Parts    │  │ asset    │  │ missed_inspection │  │
│       │   │ Services │  │ volume   │  │ manager_reminder  │  │
│       │   │ Both     │  │ cost     │  │ exception_report  │  │
│       │   │          │  │ economy  │  │                  │  │
│       │   │contacts[]│  │ cost/mi  │  │ schedule         │  │
│       │   └──────────┘  └──────────┘  │ recipients       │  │
│       │                               └──────────────────┘  │
│       │                                                      │
│       │   ┌───────────────────────────────────────────────┐  │
│       │   │              Dashboard                        │  │
│       │   │  Aggregates: inspections, defects, work       │  │
│       │   │  orders, fuel, service schedule, assets,      │  │
│       │   │  driver performance                           │  │
│       │   └───────────────────────────────────────────────┘  │
│       │                                                      │
└───────┴──────────────────────────────────────────────────────┘
```

---

## Module Interconnection Map

Every arrow below represents a data dependency or trigger relationship:

```
┌──────────┐
│  ASSETS  │<──────────────────────────────────────────────────────────┐
│          │                                                           │
│ - profile├──> has forms assigned ──> FORMS                          │
│ - status │                            │                              │
│ - team   │    ┌───────────────────────┘                              │
│ - docs   │    │ driver completes form on asset                       │
└────┬─────┘    v                                                      │
     │    ┌──────────────┐                                             │
     │    │ INSPECTIONS  │                                             │
     │    │              │                                             │
     │    │ history ─────├──> failed card ──> DEFECTS                  │
     │    │ exception ───├──> missed ──> REMINDERS (exception report)  │
     │    │ wellness ────├──> DRIVER WELLNESS                          │
     │    └──────────────┘                                             │
     │                         │                                       │
     │                         v                                       │
     │                   ┌──────────┐                                  │
     │                   │ DEFECTS  │                                  │
     │                   │          │                                  │
     │                   │ assign ──├──> to MECHANIC (user)            │
     │                   │          ├──> to VENDOR (magic link)        │
     │                   │ create ──├──> WORK ORDER                    │
     │                   │ trigger ─├──> ASSET out-of-service          │
     │                   └──────────┘                                  │
     │                         │                                       │
     │                         v                                       │
     │                   ┌──────────────┐                              │
     │                   │ WORK ORDERS  │                              │
     │                   │              │                              │
     │                   │ uses parts ──├──> INVENTORY (auto-deduct)───┤
     │                   │ has tasks ───├──> SERVICE TASKS             │
     │                   │ assigned to ─├──> VENDOR or MECHANIC       │
     │                   │ costs ───────├──> DASHBOARD (total spend)   │
     │                   │ out-of-svc ──├──> ASSET status change ──────┘
     │                   └──────────────┘
     │
     │    ┌─────────────────┐         ┌──────────────┐
     │    │ SERVICE PROGRAMS│         │  INVENTORY   │
     │    │                 │         │              │
     │    │ triggers ───────├──> auto WORK ORDER     │
     │    │ schedule ───────├──> SERVICE SCHEDULE     │
     │    │ reminders ──────├──> DASHBOARD notif     │
     │    └─────────────────┘         │              │
     │                                │ low stock ───├──> PURCHASE ORDER
     │    ┌──────────┐                │ received  <──├──  PURCHASE ORDER
     │    │   FUEL   │                └──────────────┘
     │    │          │                       │
     ├────│ per-asset│                       v
     │    │ trends   │──> DASHBOARD    ┌──────────┐
     │    └──────────┘                 │ VENDORS  │
     │                                 │          │
     │    ┌──────────┐                 │ Parts ───├──> PURCHASE ORDERS
     │    │ REMINDERS│                 │ Services─├──> WORK ORDERS, DEFECTS
     │    │          │                 │ Both   ──├──> All of above
     │    │ driver ──├──> email + web   └──────────┘
     │    │ missed ──├──> email + web
     │    │ manager ─├──> email
     │    │ exception├──> email
     │    └──────────┘
     │
     │    ┌──────────────────────────────────────┐
     │    │              PEOPLE                   │
     │    │                                      │
     │    │  DRIVERS ──> perform INSPECTIONS (web)│
     │    │  TEAMS ────> group DRIVERS + ASSETS  │
     │    │  USERS ────> manage via WEB          │
     │    │  WELLNESS ─> from INSPECTION answers │
     │    └──────────────────────────────────────┘
     │
     v
┌──────────────┐
│  DASHBOARD   │
│              │
│ Aggregates:  │
│ - Inspection counts/trends
│ - Defect counts/correction times
│ - Work order costs
│ - Service schedule (upcoming)
│ - Fuel consumption
│ - Driver leaderboard
│ - Asset leaderboard
│ - Out-of-service count
└──────────────┘
```

---

## Data Flow Pipelines

### Pipeline 1: Reactive Maintenance (Inspection -> Fix)

```
Driver opens web app
  └──> Selects Asset
       └──> Selects Form (assigned to that asset)
            └──> Completes each Card
                 ├──> [All Pass] ──> Inspection saved (pass) ──> Dashboard updates
                 └──> [Card Fails] ──> Inspection saved (fail)
                      └──> Defect auto-created
                           ├──> Dashboard defect count++
                           ├──> Alert to managers following team
                           ├──> Assignee set (mechanic/vendor)
                           │    └──> Vendor gets magic link (no login)
                           └──> Work Order created
                                ├──> Parts consumed from Inventory
                                ├──> Labor cost recorded
                                ├──> Asset marked out-of-service (optional)
                                └──> WO completed
                                     ├──> Mechanic e-signature captured
                                     ├──> Asset back in service
                                     ├──> Service history updated
                                     └──> Dashboard spend updated
```

### Pipeline 2: Preventative Maintenance (Scheduled Service)

```
Service Program configured
  ├──> Assigned to assets
  ├──> Triggers set (mileage/hours/time)
  └──> Thresholds set (notify X before due)
       │
       ├──> [Mileage data from telematics/inspection entry]
       ├──> [Engine hours from telematics/inspection]
       └──> [Time passes]
            │
            └──> Threshold reached
                 ├──> Notification sent (email/dashboard)
                 ├──> Appears in Service Schedule view
                 └──> [Auto WO enabled]
                      └──> Work Order auto-created
                           ├──> Pre-assigned to mechanic
                           ├──> Parts + tasks pre-populated
                           └──> Mechanic completes work
                                └──> Service interval resets
```

### Pipeline 3: Procurement (Inventory -> Purchase -> Restock)

```
Inventory monitoring
  └──> Part quantity <= Reorder Point
       └──> Low stock email alert sent
            └──> Manager creates Purchase Order
                 ├──> Vendor selected (must be "Parts" type)
                 ├──> Line items added (parts + qty + cost)
                 ├──> Shipping + tax calculated
                 └──> Submitted for approval
                      ├──> [Approved] ──> Status: Purchased
                      │    └──> Items arrive
                      │         └──> Mark as "Receive"
                      │              ├──> Select received items + quantities
                      │              ├──> Inventory auto-incremented
                      │              └──> [All received] ──> Status: Received
                      │                   [Partial] ──> Status: Received Partial
                      └──> [Rejected] ──> Rejection reason logged
```

### Pipeline 4: Compliance Monitoring (Exception Tracking)

```
Forms assigned to assets with inspection schedules
  └──> Reminders configured (days/times)
       └──> Each day evaluated:
            ├──> [Inspection completed] ──> Status: Inspected (green)
            ├──> [Reminder set, no inspection] ──> Status: Exception (red)
            │    └──> Exception Report Reminder fires
            │         └──> Email to Team Managers + Followers
            │              └──> Manager actions:
            │                   ├──> Contact driver
            │                   ├──> Omit (legitimate reason)
            │                   └──> Create reminder
            ├──> [No reminder, no inspection] ──> Status: No Inspection
            └──> [Not required] ──> Status: Not Required
```

### Pipeline 5: Fuel Tracking

```
Fuel card transaction occurs (WEX/Fleetcor)
  OR Manual file upload (CSV/XLS)
  │
  └──> AI-assisted data cleaning
       └──> Fuel transaction record created
            ├──> Asset field matched ──> appears in asset profile
            ├──> Metrics calculated: MPG, cost/mile
            ├──> Dashboard fuel trends updated
            ├──> Custom dashboard charts updated
            └──> Anomaly detection
                 ├──> High consumption flagged
                 ├──> Fuel theft patterns identified
                 └──> Idling patterns identified
```

---

## Database Schema (MongoDB Collections)

### Core Collections

```javascript
// ============ ORGANIZATIONAL ============

// tenants (from 3pm-auth)
{
  _id: ObjectId,
  name: String,
  slug: String,
  settings: {
    timezone: String,
    currency: String,
    distanceUnit: "miles" | "km",
    fuelUnit: "gallons" | "liters",
  },
  subscription: { assetLimit: Number },
  createdAt: Date,
  updatedAt: Date,
}

// teams
{
  _id: ObjectId,
  tenantId: ObjectId,          // FK -> tenants
  name: String,
  description: String,
  isActive: Boolean,
  isArchived: Boolean,
  createdBy: ObjectId,         // FK -> users
  createdAt: Date,
  updatedAt: Date,
}

// users (web platform accounts)
{
  _id: ObjectId,
  tenantId: ObjectId,          // FK -> tenants
  firstName: String,
  lastName: String,
  email: String,
  roleId: ObjectId,            // FK -> roles
  teamRelationships: [{
    teamId: ObjectId,          // FK -> teams
    level: "managing" | "following" | "none",
  }],
  customPermissions: {
    modules: {
      [moduleName]: { view, create, update, delete, export, bulkUpload },
    },
  },
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date,
}

// roles
{
  _id: ObjectId,
  tenantId: ObjectId,
  name: String,                // "Admin", "Manager", "Team Manager", "Mechanic", "Driver"
  key: String,                 // "admin", "manager", "team_manager", "mechanic", "driver"
  permissions: {
    scope: "all" | "modules" | "team",
    modules: { [moduleName]: { view, create, update, delete, export, bulkUpload } },
    teamScoped: Boolean,
    driverInterface: Boolean,   // Shows driver-specific web interface
  },
  isSystem: Boolean,
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date,
}

// drivers (web app users who perform inspections)
{
  _id: ObjectId,
  tenantId: ObjectId,
  tenantMemberId: ObjectId,    // FK -> tenantMembers (links to auth system)
  firstName: String,
  lastName: String,
  email: String,
  teamId: ObjectId,            // FK -> teams
  phoneNumber: String,
  employeeNumber: String,
  jobPosition: String,
  driverLicense: String,
  licenseClass: String,
  licenseNumber: String,
  photoUrl: String,
  wallet: [{                   // Document storage
    name: String,
    fileUrl: String,
    fileType: String,
    expiresAt: Date,
    reminderDays: Number,
  }],
  isActive: Boolean,
  isArchived: Boolean,
  createdAt: Date,
  updatedAt: Date,
}

// ============ ASSETS ============

// assets
{
  _id: ObjectId,
  tenantId: ObjectId,
  name: String,                // Unique per tenant
  teamId: ObjectId,            // FK -> teams
  type: String,                // "vehicle", "trailer", "equipment", "facility", etc.
  subtype: String,
  formIds: [ObjectId],         // FK -> forms (at least one required)
  assignedDriverId: ObjectId,  // FK -> drivers (optional)
  make: String,
  model: String,
  year: Number,
  color: String,
  vin: String,
  tireSize: String,
  photos: [String],            // URLs
  currentMileage: Number,
  currentEngineHours: Number,
  isOutOfService: Boolean,
  outOfServiceReason: String,
  outOfServiceAt: Date,
  customFields: [{ key: String, value: Mixed, type: String }],
  documents: [{                // Asset wallet
    name: String,
    fileUrl: String,
    expiresAt: Date,
  }],
  isArchived: Boolean,
  createdAt: Date,
  updatedAt: Date,
}

// assetTypes
{
  _id: ObjectId,
  tenantId: ObjectId,
  name: String,
  description: String,
  icon: String,
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date,
}

// ============ INSPECTIONS ============

// forms (metadata -- actual form definition in form-builder-portal)
{
  _id: ObjectId,
  tenantId: ObjectId,
  name: String,
  description: String,
  formBuilderId: String,       // FK -> form-builder-portal forms collection
  type: "inspection" | "wellness" | "custom",
  compliance: {
    requireDriverSignature: Boolean,
    requireMechanicSignature: Boolean,
    dvir: Boolean,
  },
  isPublished: Boolean,
  isArchived: Boolean,
  createdBy: ObjectId,
  createdAt: Date,
  updatedAt: Date,
}

// inspections
{
  _id: ObjectId,
  tenantId: ObjectId,
  inspectionNumber: String,    // System-generated (e.g., INS-0001)
  assetId: ObjectId,           // FK -> assets
  driverId: ObjectId,          // FK -> drivers
  formId: ObjectId,            // FK -> forms
  formBuilderId: String,       // FK -> form-builder-portal record
  submissionId: String,        // FK -> form-builder-portal submissions
  result: "pass" | "fail",
  location: {
    type: "Point",
    coordinates: [Number, Number],  // [lng, lat]
    address: String,
  },
  answers: [{
    cardId: String,
    cardType: String,          // "pass_fail", "text", "photo", etc.
    label: String,
    value: Mixed,
    passed: Boolean,           // For pass/fail cards
    photos: [String],          // URLs
    isWellness: Boolean,       // Separates wellness responses
  }],
  defectIds: [ObjectId],       // FK -> defects (auto-created on fail)
  mileageReading: Number,      // From odometer card (synced to asset)
  engineHoursReading: Number,  // From engine hours card (synced to asset)
  driverSignature: String,     // Base64 or URL
  duration: Number,            // Seconds to complete
  inspectedAt: Date,
  submittedAt: Date,
  createdAt: Date,
  updatedAt: Date,
}

// exceptionReports (daily status per asset per form)
{
  _id: ObjectId,
  tenantId: ObjectId,
  assetId: ObjectId,
  formId: ObjectId,
  date: Date,                  // Day being tracked
  status: "inspected" | "not_required" | "exception" | "exception_attended" |
          "no_inspection" | "no_inspection_attended",
  inspectionId: ObjectId,      // FK -> inspections (if inspected)
  action: {
    type: "contacted" | "omitted" | null,
    note: String,
    actionBy: ObjectId,        // FK -> users
    actionAt: Date,
  },
  createdAt: Date,
}

// ============ MAINTENANCE ============

// defects
{
  _id: ObjectId,
  tenantId: ObjectId,
  defectNumber: String,        // System-generated (e.g., DEF-0001)
  name: String,
  description: String,
  status: String,              // Customizable: "new", "in_progress", "corrected"
  priority: "low" | "medium" | "high" | "critical",
  severity: "minor" | "moderate" | "major" | "safety",
  category: String,
  assetId: ObjectId,           // FK -> assets
  teamId: ObjectId,            // FK -> teams
  inspectionId: ObjectId,      // FK -> inspections (if auto-created)
  source: "inspection" | "dtc_fault" | "manual" | "ai_flagged",
  assigneeType: "mechanic" | "vendor" | "third_party",
  assigneeId: ObjectId,        // FK -> users (mechanic) or vendors
  assigneeContact: {           // For vendor/third-party
    name: String,
    email: String,
    phone: String,
    magicLinkToken: String,
    magicLinkExpiry: Date,
  },
  workOrderIds: [ObjectId],    // FK -> workOrders
  repetitionCount: Number,
  mechanicSignature: String,   // Base64 or URL
  isOutOfService: Boolean,     // Triggers asset out-of-service
  createdBy: ObjectId,
  createdAt: Date,
  updatedAt: Date,
  correctedAt: Date,
}

// serviceTasks (library/lookup)
{
  _id: ObjectId,
  tenantId: ObjectId,
  title: String,
  description: String,
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date,
}

// servicePrograms
{
  _id: ObjectId,
  tenantId: ObjectId,
  title: String,
  type: "scheduled" | "unscheduled" | "inspection" | "custom",
  serviceTaskIds: [ObjectId],  // FK -> serviceTasks
  assetScope: "all" | "group" | "individual",
  assetIds: [ObjectId],        // FK -> assets (when scope is group/individual)
  triggers: {
    time: { interval: Number, unit: "days" | "weeks" | "months" },
    mileage: { interval: Number },
    engineHours: { interval: Number },
  },
  startDate: Date,
  endDate: Date,
  lastServiceMileage: Number,
  lastServiceDate: Date,
  lastServiceEngineHours: Number,
  notification: {
    threshold: { miles: Number, hours: Number, days: Number },
    recipients: [ObjectId],    // FK -> users
    channel: "dashboard" | "email" | "both",
    autoCreateWorkOrder: Boolean,
    autoAssignMechanicId: ObjectId,  // FK -> users (mechanic)
  },
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date,
}

// workOrders
{
  _id: ObjectId,
  tenantId: ObjectId,
  workOrderNumber: String,     // System-generated (WO-####)
  assetId: ObjectId,           // FK -> assets
  serviceTaskIds: [ObjectId],  // FK -> serviceTasks (at least one)
  defectIds: [ObjectId],       // FK -> defects (optional)
  serviceProgramId: ObjectId,  // FK -> servicePrograms (if triggered by program)
  assigneeType: "mechanic" | "vendor" | "third_party",
  assigneeId: ObjectId,
  assigneeContact: {
    name: String,
    email: String,
    magicLinkToken: String,
  },
  status: String,              // Customizable statuses
  statusHistory: [{
    status: String,
    changedBy: ObjectId,
    changedAt: Date,
    approvedBy: ObjectId,
    rejectionReason: String,
  }],
  requiresApproval: Boolean,
  approverIds: [ObjectId],     // FK -> users
  dueDate: Date,
  laborCost: Number,
  parts: [{
    partId: ObjectId,          // FK -> inventory
    name: String,
    quantity: Number,
    unitCost: Number,
    totalCost: Number,
  }],
  totalCost: Number,           // Labor + parts
  attachments: [{ name: String, url: String, type: String }],
  comments: [{
    text: String,
    authorId: ObjectId,
    createdAt: Date,
  }],
  isOutOfService: Boolean,
  completedAt: Date,
  createdBy: ObjectId,
  createdAt: Date,
  updatedAt: Date,
}

// inventory (parts)
{
  _id: ObjectId,
  tenantId: ObjectId,
  name: String,
  description: String,
  category: String,
  manufacturer: String,
  measurementUnit: String,
  locations: [{
    name: String,
    quantity: Number,
  }],
  totalQuantity: Number,
  reorderPoint: Number,
  maximumQuantity: Number,
  vendors: [{
    vendorId: ObjectId,        // FK -> vendors
    unitCost: Number,
  }],
  barcode: String,
  qrCode: String,
  customFields: [{ key: String, value: Mixed, type: String }],
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date,
}

// purchaseOrders
{
  _id: ObjectId,
  tenantId: ObjectId,
  poNumber: String,            // System-generated (PO-####)
  vendorId: ObjectId,          // FK -> vendors (must be "parts" type)
  deliveryLocation: String,
  status: "draft" | "pending_approval" | "rejected" | "approved" |
          "purchased" | "received" | "received_partial" | "closed",
  lineItems: [{
    partId: ObjectId,          // FK -> inventory
    name: String,
    quantity: Number,
    unitCost: Number,
    receivedQuantity: Number,  // Filled when receiving
  }],
  shippingCost: { value: Number, type: "fixed" | "percentage" },
  tax: { value: Number, type: "fixed" | "percentage" },
  totalCost: Number,
  notes: String,
  attachments: [{ name: String, url: String }],
  approverIds: [ObjectId],
  approvedBy: ObjectId,
  rejectionReason: String,
  receivedAt: Date,
  createdBy: ObjectId,
  createdAt: Date,
  updatedAt: Date,
}

// ============ VENDORS ============

// vendors
{
  _id: ObjectId,
  tenantId: ObjectId,
  name: String,
  type: "parts" | "services" | "both",
  contacts: [{
    name: String,
    email: String,
    phone: String,
    isPrimary: Boolean,
  }],
  address: {
    street: String,
    city: String,
    state: String,
    zip: String,
    country: String,
  },
  notes: String,
  isActive: Boolean,
  isArchived: Boolean,
  createdAt: Date,
  updatedAt: Date,
}

// ============ FUEL ============

// fuelTransactions
{
  _id: ObjectId,
  tenantId: ObjectId,
  assetId: ObjectId,           // FK -> assets
  driverId: ObjectId,          // FK -> drivers (optional)
  date: Date,
  startMileage: Number,
  endMileage: Number,
  distance: Number,            // Calculated: end - start
  volume: Number,              // Gallons or liters
  unitCost: Number,
  totalCost: Number,
  fuelType: String,            // "diesel", "gasoline", "electric", etc.
  economy: Number,             // Calculated: distance / volume
  costPerMile: Number,         // Calculated: totalCost / distance
  station: String,
  source: "manual" | "wex" | "fleetcor" | "coast",
  importBatchId: String,       // Groups transactions from same import
  createdAt: Date,
  updatedAt: Date,
}

// ============ REMINDERS ============

// reminders
{
  _id: ObjectId,
  tenantId: ObjectId,
  type: "driver" | "missed_inspection" | "manager" | "exception_report",
  title: String,
  message: String,
  schedule: {
    daysOfWeek: [Number],      // 0=Sun, 1=Mon, etc.
    time: String,              // "09:00"
    frequency: "daily" | "weekly" | "monthly" | "custom",
    startDate: Date,
    endDate: Date,
  },
  targets: {
    driverIds: [ObjectId],     // FK -> drivers
    assetIds: [ObjectId],      // FK -> assets
    formIds: [ObjectId],       // FK -> forms (for exception report)
    userIds: [ObjectId],       // FK -> users (for manager reminders)
  },
  lastSentAt: Date,
  isActive: Boolean,
  createdBy: ObjectId,
  createdAt: Date,
  updatedAt: Date,
}

// reminderLogs
{
  _id: ObjectId,
  reminderId: ObjectId,        // FK -> reminders
  tenantId: ObjectId,
  type: String,
  sentTo: String,              // Email address
  sentAt: Date,
  status: "sent" | "delivered" | "failed",
  channel: "email" | "web",
}

// ============ DASHBOARD ============

// customDashboards
{
  _id: ObjectId,
  tenantId: ObjectId,
  name: String,
  createdBy: ObjectId,
  sharedWith: [ObjectId],      // FK -> users
  charts: [{
    id: String,
    type: "bar" | "line" | "pie" | "donut" | "table",
    title: String,
    metric: String,            // What's being measured
    module: String,            // Source module
    filters: Object,
    position: { x: Number, y: Number, w: Number, h: Number },
  }],
  isDefault: Boolean,
  createdAt: Date,
  updatedAt: Date,
}

// scheduledReports
{
  _id: ObjectId,
  tenantId: ObjectId,
  name: String,
  frequency: "weekly" | "monthly" | "yearly",
  deliveryTime: String,        // "09:00"
  timezone: String,
  recipients: [String],        // Email addresses
  sections: [String],          // Which dashboard sections to include
  lastGeneratedAt: Date,
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date,
}

// ============ AUDIT ============

// auditLogs
{
  _id: ObjectId,
  tenantId: ObjectId,
  userId: ObjectId,
  action: String,              // "create", "update", "delete", "archive", etc.
  module: String,              // "assets", "inspections", "defects", etc.
  entityId: ObjectId,
  entityType: String,
  changes: Object,             // { field: { old: value, new: value } }
  ipAddress: String,
  userAgent: String,
  createdAt: Date,
}

// ============ COUNTERS (for auto-numbering) ============

// counters
{
  _id: ObjectId,
  tenantId: ObjectId,
  type: String,                // "inspection", "defect", "workOrder", "purchaseOrder"
  currentValue: Number,
  prefix: String,              // "INS-", "DEF-", "WO-", "PO-"
}
```

---

## API Route Plan

### Assets
```
GET    /api/assets                    List assets (paginated, filterable)
POST   /api/assets                    Create asset
GET    /api/assets/:id                Get asset detail (with tabs data)
PUT    /api/assets/:id                Update asset
DELETE /api/assets/:id                Archive asset
PUT    /api/assets/:id/out-of-service Toggle out-of-service status
GET    /api/assets/:id/inspections    Get asset's inspection history
GET    /api/assets/:id/defects        Get asset's defects
GET    /api/assets/:id/work-orders    Get asset's work orders
GET    /api/assets/:id/fuel           Get asset's fuel transactions
GET    /api/assets/:id/documents      Get asset's documents
POST   /api/assets/:id/documents      Upload document to asset
GET    /api/assets/dropdown           Get assets for dropdown selection
POST   /api/assets/import             Bulk import assets
POST   /api/assets/vin-decode         Decode VIN number
```

### Asset Types
```
GET    /api/asset-types               List asset types
POST   /api/asset-types               Create asset type
PUT    /api/asset-types/:id           Update asset type
DELETE /api/asset-types/:id           Delete asset type
```

### Inspections
```
GET    /api/inspections               List inspections (paginated, filterable)
GET    /api/inspections/:id           Get inspection detail
PUT    /api/inspections/:id           Update inspection (limited fields)
GET    /api/inspections/:id/pdf       Download inspection as PDF
POST   /api/inspections/export        Export inspections (CSV/Excel)
GET    /api/inspections/exception-report  Get exception report data
PUT    /api/inspections/exception-report/:id  Update exception (contact/omit)
```

### Forms
```
GET    /api/forms                     List forms
POST   /api/forms                     Create form (via form-builder embed)
GET    /api/forms/:id                 Get form detail
PUT    /api/forms/:id                 Update form
DELETE /api/forms/:id                 Archive form
PUT    /api/forms/:id/publish         Publish/unpublish form
PUT    /api/forms/:id/compliance      Update compliance settings
```

### Defects
```
GET    /api/defects                   List defects (paginated, filterable)
POST   /api/defects                   Create defect manually
GET    /api/defects/:id               Get defect detail
PUT    /api/defects/:id               Update defect
PUT    /api/defects/:id/assign        Assign defect
PUT    /api/defects/:id/status        Update defect status
POST   /api/defects/bulk-status       Bulk status update
POST   /api/defects/export            Export defects
GET    /api/defects/statuses          Get custom statuses
POST   /api/defects/statuses          Create custom status
```

### Service Tasks
```
GET    /api/service-tasks             List service tasks
POST   /api/service-tasks             Create service task
PUT    /api/service-tasks/:id         Update service task
DELETE /api/service-tasks/:id         Delete service task
```

### Service Programs
```
GET    /api/service-programs          List service programs
POST   /api/service-programs          Create service program
GET    /api/service-programs/:id      Get program detail
PUT    /api/service-programs/:id      Update program
DELETE /api/service-programs/:id      Delete program
POST   /api/service-programs/:id/duplicate  Duplicate program
```

### Service Schedule
```
GET    /api/service-schedule          Get weekly schedule view
GET    /api/service-schedule/upcoming Get upcoming services for all assets
```

### Work Orders
```
GET    /api/work-orders               List work orders (paginated, filterable)
POST   /api/work-orders               Create work order
GET    /api/work-orders/:id           Get work order detail
PUT    /api/work-orders/:id           Update work order
PUT    /api/work-orders/:id/status    Update status (with approval workflow)
PUT    /api/work-orders/:id/approve   Approve status change
PUT    /api/work-orders/:id/reject    Reject status change
POST   /api/work-orders/:id/parts     Add parts (auto-deduct inventory)
POST   /api/work-orders/:id/comments  Add comment
POST   /api/work-orders/export        Export work orders
GET    /api/work-orders/statuses      Get custom statuses
POST   /api/work-orders/statuses      Create custom status
```

### Inventory
```
GET    /api/inventory                 List parts (paginated, filterable)
POST   /api/inventory                 Create part
GET    /api/inventory/:id             Get part detail
PUT    /api/inventory/:id             Update part
DELETE /api/inventory/:id             Delete part
PUT    /api/inventory/:id/adjust      Manual quantity adjustment
POST   /api/inventory/import          Bulk import parts
GET    /api/inventory/low-stock       Get parts at/below reorder point
GET    /api/inventory/categories      Get categories
GET    /api/inventory/locations       Get locations
```

### Purchase Orders
```
GET    /api/purchase-orders           List purchase orders (by status tabs)
POST   /api/purchase-orders           Create purchase order
GET    /api/purchase-orders/:id       Get PO detail
PUT    /api/purchase-orders/:id       Update PO
PUT    /api/purchase-orders/:id/submit    Submit for approval
PUT    /api/purchase-orders/:id/approve   Approve PO
PUT    /api/purchase-orders/:id/reject    Reject PO (with reason)
PUT    /api/purchase-orders/:id/purchase  Mark as purchased
PUT    /api/purchase-orders/:id/receive   Receive items (updates inventory)
PUT    /api/purchase-orders/:id/close     Close PO
```

### Vendors
```
GET    /api/vendors                   List vendors (filterable by type)
POST   /api/vendors                   Create vendor
GET    /api/vendors/:id               Get vendor detail
PUT    /api/vendors/:id               Update vendor
DELETE /api/vendors/:id               Delete vendor
POST   /api/vendors/:id/contacts      Add contact
PUT    /api/vendors/:id/contacts/:cid Update contact
DELETE /api/vendors/:id/contacts/:cid Remove contact
POST   /api/vendors/import            Bulk import vendors
GET    /api/vendors/magic-link/:token Access via magic link (no auth)
PUT    /api/vendors/magic-link/:token Update via magic link (no auth)
```

### Fuel
```
GET    /api/fuel                      List fuel transactions (paginated)
POST   /api/fuel                      Create manual transaction
GET    /api/fuel/:id                  Get transaction detail
PUT    /api/fuel/:id                  Update transaction
DELETE /api/fuel/:id                  Delete transaction
POST   /api/fuel/import               Import fuel data (file upload)
GET    /api/fuel/analytics            Get fuel analytics/trends
POST   /api/fuel/export               Export fuel data
```

### Reminders
```
GET    /api/reminders                 List reminders (by type)
POST   /api/reminders                 Create reminder
GET    /api/reminders/:id             Get reminder detail
PUT    /api/reminders/:id             Update reminder
DELETE /api/reminders/:id             Delete reminder
GET    /api/reminders/completed       Get sent/completed reminders log
```

### Drivers
```
GET    /api/drivers                   List drivers (paginated, searchable)
POST   /api/drivers                   Create driver
GET    /api/drivers/:id               Get driver detail (with tabs)
PUT    /api/drivers/:id               Update driver
DELETE /api/drivers/:id               Archive driver
POST   /api/drivers/:id/invite        Send invitation (email)
PUT    /api/drivers/:id/promote       Promote to user role
GET    /api/drivers/:id/wellness      Get driver wellness data
GET    /api/drivers/:id/inspections   Get driver's inspections
GET    /api/drivers/:id/documents     Get driver wallet documents
POST   /api/drivers/:id/documents     Upload document to wallet
```

### Teams
```
GET    /api/teams                     List teams
POST   /api/teams                     Create team
GET    /api/teams/:id                 Get team detail
PUT    /api/teams/:id                 Update team
DELETE /api/teams/:id                 Delete team
GET    /api/teams/:id/assets          Get team's assets
GET    /api/teams/:id/drivers         Get team's drivers
GET    /api/teams/:id/members         Get team's managers/users
PUT    /api/teams/:id/relationship    Update user-team relationship level
```

### Users
```
GET    /api/users                     List users
POST   /api/users                     Create user
GET    /api/users/:id                 Get user detail
PUT    /api/users/:id                 Update user
DELETE /api/users/:id                 Deactivate user
PUT    /api/users/:id/permissions     Update custom permissions
```

### Roles
```
GET    /api/roles                     List roles
POST   /api/roles                     Create role
PUT    /api/roles/:id                 Update role
DELETE /api/roles/:id                 Delete role
```

### Dashboard
```
GET    /api/dashboard                 Get main dashboard data
GET    /api/dashboard/inspection-trends  Get inspection trend data
GET    /api/dashboard/defect-trends   Get defect trend data
GET    /api/dashboard/leaderboard/drivers  Get driver leaderboard
GET    /api/dashboard/leaderboard/assets   Get asset leaderboard
GET    /api/dashboard/maintenance-summary  Get maintenance summary
GET    /api/dashboard/upcoming-schedule    Get upcoming schedule
GET    /api/dashboard/custom          List custom dashboards
POST   /api/dashboard/custom          Create custom dashboard
PUT    /api/dashboard/custom/:id      Update custom dashboard
DELETE /api/dashboard/custom/:id      Delete custom dashboard
GET    /api/dashboard/custom/:id/data Get chart data for custom dashboard
POST   /api/dashboard/reports/schedule Schedule automated report
```

### Auth (delegates to 3pm-auth)
```
POST   /api/auth/login                Login
POST   /api/auth/logout               Logout
GET    /api/auth/me                   Get current session
GET    /api/auth/callback             OAuth callback
POST   /api/tenant/switch             Switch tenant
```

### Misc
```
POST   /api/upload                    File upload (Azure/S3)
GET    /api/profile                   Get user profile
PUT    /api/profile                   Update user profile
GET    /api/audit-logs                Get audit trail
```

---

## Implementation Order

Build in this sequence to ensure each module has its dependencies ready:

### Phase 1: Foundation (Already Partially Built)
1. **Auth Integration** (3pm-auth) -- DONE
2. **Roles & Permissions (RBAC)** -- DONE
3. **Teams** -- DONE
4. **Users** -- DONE
5. **Drivers** -- DONE
6. **Asset Types** -- DONE
7. **Assets** (basic CRUD) -- DONE

### Phase 2: Inspection Core
8. **Forms** (integrate form-builder-portal embed)
9. **Inspections** (submission handling, pass/fail logic, auto-defect creation)
10. **Inspection History** (list, filter, detail view, PDF export)
11. **Exception Report** (calendar view, status tracking)

### Phase 3: Reactive Maintenance
12. **Defects** (auto-creation from inspections, manual creation, status workflow)
13. **Vendors** (directory with contacts, magic link system)
14. **Service Tasks** (library/lookup table)
15. **Work Orders** (creation from defects, status workflow, approval chain)

### Phase 4: Preventative Maintenance
16. **Service Programs** (triggers, thresholds, auto work order creation)
17. **Service Schedule** (weekly calendar view)
18. **Inventory** (parts management, auto-deduction, alerts)
19. **Purchase Orders** (procurement workflow, inventory integration)

### Phase 5: Support Modules
20. **Fuel** (import, analytics, per-asset tracking)
21. **Reminders** (all 4 types, push + email delivery)
22. **Driver Wellness** (separate storage, reporting)
23. **Driver/Asset Wallet** (document management with expiry)

### Phase 6: Dashboard & Analytics
24. **Main Dashboard** (aggregate metrics from all modules)
25. **Custom Dashboards** (chart builder, sharing)
26. **Automated Reports** (scheduled PDF generation)
27. **Audit Logs** (system-wide activity tracking)

### Phase 7: Integrations
28. **Telematics** (Geotab, Samsara, Motive -- mileage, hours, DTC faults)
29. **Fuel Cards** (WEX, Fleetcor -- automated import)
30. **Communication** (Slack, MS Teams notifications)
31. **VIN Decoder** (DataOne API integration)

---

## Current Project Status

### What's Already Built (asset-manager)

| Module | Status | Notes |
|--------|--------|-------|
| Auth (3pm-auth integration) | Done | Login, logout, session, tenant switch |
| Roles | Done | CRUD with permission presets |
| Teams | Done | CRUD with asset/driver assignment |
| Users | Done | CRUD with role assignment |
| Drivers | Done | CRUD with tenantMember linkage |
| Assets | Done | CRUD with type, team, form assignment |
| Asset Types | Done | CRUD |
| Dashboard page | Scaffolded | Page exists, needs metrics integration |
| Inspections page | Scaffolded | Page exists, needs form-builder integration |
| Maintenance page | Scaffolded | Page exists, needs sub-modules |
| Fuel page | Scaffolded | Page exists, needs implementation |
| Vendors page | Scaffolded | Page exists, needs implementation |
| Profile | Done | User profile management |

### What's Available from Other 3PM Projects

| Feature | Source Project | Integration Method |
|---------|--------------|-------------------|
| Form Builder | form-builder-portal | Embed API (`/api/embed/*`) |
| Form Submissions | form-builder-portal | Embed API |
| PDF Generation | form-builder-portal | Puppeteer-based |
| File Storage | construction-portal / form-builder-portal | Azure Blob Storage |
| Real-time Chat | construction-portal | Socket.io |
| Work Orders | construction-portal | Can reference patterns |
| Inventory | construction-portal (stock) | Can reference patterns |
| Purchase Orders | construction-portal | Can reference patterns |

### Database Collections to Create

| Collection | Priority | Phase |
|-----------|----------|-------|
| forms (metadata) | High | Phase 2 |
| inspections | High | Phase 2 |
| exceptionReports | High | Phase 2 |
| defects | High | Phase 3 |
| vendors | High | Phase 3 |
| serviceTasks | High | Phase 3 |
| workOrders | High | Phase 3 |
| servicePrograms | Medium | Phase 4 |
| inventory | Medium | Phase 4 |
| purchaseOrders | Medium | Phase 4 |
| fuelTransactions | Medium | Phase 5 |
| reminders | Medium | Phase 5 |
| reminderLogs | Medium | Phase 5 |
| customDashboards | Low | Phase 6 |
| scheduledReports | Low | Phase 6 |
| auditLogs | Low | Phase 6 |
| counters | High | Phase 2 |

---

## Key Design Decisions

### 1. Multi-Tenancy
Every collection includes `tenantId`. Every query filters by `tenantId`. This is enforced at the controller layer, inherited from 3pm-auth session.

### 2. Soft Deletes
All entities use `isArchived` flag instead of hard deletes. Archived records still appear in historical views (inspections, reports) marked as "deleted" for compliance.

### 3. Auto-Numbering
Use a `counters` collection with atomic `findOneAndUpdate` ($inc) to generate sequential numbers per tenant per entity type (INS-0001, DEF-0001, WO-0001, PO-0001).

### 4. Form Integration
Inspection forms are built in form-builder-portal and referenced by `formBuilderId`. The asset-manager stores form metadata (name, compliance settings, assignment) while form-builder-portal stores the actual form definition and submissions.

### 5. Magic Links
For vendor collaboration, generate a JWT-like token with limited scope (specific defect or work order) and expiry. Vendor accesses a public route that validates the token and renders only the relevant data.

### 6. Event-Driven Side Effects
When certain actions occur, trigger side effects:
- Inspection fail card -> auto-create defect
- Defect status -> "corrected" + compliance enabled -> prompt mechanic signature
- Part added to work order -> auto-deduct inventory
- PO received -> auto-increment inventory
- Service program threshold reached -> auto-create work order (if enabled)
- Inventory at reorder point -> send alert email

### 7. Driver Web Interface
Drivers access a dedicated web interface within the same Next.js application. The driver interface is a simplified, inspection-focused view that loads after driver login. It supports selecting assets, completing inspection forms, uploading photos, and viewing inspection history.
