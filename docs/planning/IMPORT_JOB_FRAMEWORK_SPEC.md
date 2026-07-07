# Import Job Framework Spec

**Status:** 🟢 Draft v1.0 — Platform architecture (SPEC ONLY — NO code, NO frontend, NO Apps Script, NO DB migration, NO Gmail/API automation)
**Last Updated:** 2026-07-07
**Maintained By:** Development Team
**Related:** [`IMPORT_JOB_DATABASE_SPEC.md`](./IMPORT_JOB_DATABASE_SPEC.md) (table definitions), [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md) (Import Job Framework Layer), [`CARRIER_AND_ROUTE_SPEC.md`](./CARRIER_AND_ROUTE_SPEC.md) (first adopter), [`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`](./SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md) (Immutable Flow / layer language).

> **Purpose (one line).** Define a **reusable, platform-level Import Job Framework** that every import in Kitchen Mama Operation System flows through — external data becomes a reviewable, approvable, auditable **Import Job** *before* it ever touches a business table. This is **SPEC ONLY**: no runtime code, no schema migration, no email/API automation is implemented here.

> **Scope note.** Import Job is **NOT a Carrier feature.** It is a shared platform layer. **Carrier Rate Card is only the first module to adopt it.** All future imports (Warehouse Rate, Container Rate, Forecast, Amazon Inventory, Amazon Sales, Promotion, Factory, Warehouse, Template Import, Future AI Import) reuse the same framework, tables, and flow.

> **Changelog:**
> - **Draft v1.0 (2026-07-07)** — Created. Introduces the Import Job platform layer, the 9-state job lifecycle, the Task Card → Review Page → Apply workflow (popup = summary only), existing/new/blank row rules (locked-field = Warning + Keep-Original default + user override), Import History, Retry, Cancel, Permissions, and the future Gmail / API automation flows (documentation only). Carrier Rate Card designated the first adopter.

---

## 1. Purpose

Historically, an import path wrote **directly** into a business table (e.g. the carrier importer appended/updated `carrier_rate_cards` on upload). That couples ingestion to mutation: there is no human checkpoint, no consistent audit, no shared review UI, and every module reinvents its own summary/warning handling.

The **Import Job Framework** fixes this by making **every** import a first-class, persisted, review-gated object:

- **One consistent pipeline** for all modules — External Data → Import Job → Validation → Review → Apply → History → Business Tables.
- **Human-in-the-loop by default** — nothing is written to a business table until a user reviews and approves.
- **Full auditability** — who uploaded, who reviewed, who applied, what changed, and the per-row outcome are retained forever.
- **Uniform UX** — a pending **Task Card** and a dedicated **Review Page** (not a popup) for every module.
- **Reusability** — new modules adopt the framework by declaring their target table(s), field rules, and validators; they do **not** build a new import UI.

### 1.1 Framework Philosophy (non-negotiable)

- **Import NEVER directly updates business tables.**
- **Every import first creates an Import Job.**
- **Users review. Users approve. System applies. History remains.**
- **Apply is the only step that writes business tables** — and only from an **Approved** job.
- **Locked/structural changes are surfaced, not silently discarded** — the user decides (Keep Original vs Override).

This aligns with the platform's **Immutable Flow / layer-separation** principles (`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`): ingestion is its own layer with its own truth (the Import Job + its details), and it copies into business tables only on an explicit, recorded commit.

---

## 2. Architecture

Import Job is a **platform layer** that sits between any external data source and the business tables.

```
External Data            (CSV upload · pasted rows · future email attachment · future API push)
      ↓
Import Job               (import_jobs row created — status = Draft/Uploading)
      ↓
Validation               (per-row parse + validate → import_job_details; status = Validating → Waiting Review)
      ↓
Review                   (Task Card → Review Page; user resolves warnings, chooses Keep/Override; status = Approved)
      ↓
Apply                    (system writes business tables from the approved details; status = Applying → Completed)
      ↓
History                  (import_jobs + import_job_details retained, searchable forever)
      ↓
Business Tables          (carrier_rate_cards, forecast, inventory snapshots, … — written ONLY by Apply)
```

Key properties:

- **Two-table core** (`IMPORT_JOB_DATABASE_SPEC.md`): `import_jobs` (1 header per upload) → `import_job_details` (N rows, one per source row). Generic across all modules.
- **Module adapter** (future runtime concept): each module declares `module`, target `table_name(s)`, the editable/locked field sets, the required-field validators, and the record-key rule. The framework owns everything else (lifecycle, UI, history).
- **No business-table write outside Apply.** Validation and Review are read-only against business data (they may *read* existing rows to compute diffs/warnings, but never write).
- **Idempotent Apply.** Apply is driven by the reviewed `import_job_details`; re-applying a Completed job is blocked (see §7 Retry).

---

## 3. Import Flow

The producing side — how a job is created and validated. Applies identically regardless of source (manual upload today; email/API in the future).

1. **Create (Draft).** A source (upload / paste / future email / future API) creates an `import_jobs` row with `module`, `job_type`, `source`, `source_file_name`, `uploaded_by`, `uploaded_at`. Status = **Draft**.
2. **Uploading.** The raw payload is received/attached. Status = **Uploading**. (For a synchronous CSV upload this is transient.)
3. **Validating.** The framework parses each source row into an `import_job_details` row and runs the module's validators:
   - Classify each row's **action**: `create` (new), `update` (existing key found), `ignore` (blank / no meaningful values).
   - Compute `changed_fields_json`, `old_value_json`, `new_value_json` for update rows.
   - Detect **warnings** (e.g. locked-field change on an existing row) → set `warning_type`, default `user_action` (see §5.2).
   - Detect **errors** (required field missing, invalid enum, bad date, unknown foreign key) → mark the detail row `error`.
   - Roll counts up onto `import_jobs` (`total_rows`, `created_rows`, `updated_rows`, `ignored_rows`, `warning_rows`, `error_rows`).
   - Status = **Validating** → **Waiting Review** when validation finishes. A job that cannot be parsed at all → **Failed**.
4. **Waiting Review.** The job now appears as a **Task Card** (§ Import Review UI). No business table has been touched.

> Validation is **read-only** with respect to business tables. It may read existing rows to compute diffs, but writes only to `import_job_details`.

---

## 4. Review Flow

The human checkpoint. **Primary workflow is a full Review Page, not a popup.**

```
Task Card  →  Review Page  →  Apply
```

- **Popup is only for quick summaries** (e.g. a hover/peek of counts). It is **never** the place where a user resolves warnings or approves — that is always the Review Page.
- On the Review Page the user:
  1. reads the **Top Summary** (counts),
  2. works the **Row-Level Review** (resolve each warning: Keep Original vs Override; fix nothing on error rows — those are excluded from Apply),
  3. **Approves** the job → status = **Approved** (records `reviewed_by`, `reviewed_at`).
- Approving is what authorizes Apply. A job can be **Cancelled** from Review instead (see §8).

### 4.1 Row classification recap (see §5 Row Rules for detail)

| Row | Condition | Action | Editable |
|-----|-----------|--------|----------|
| **Existing** | has a record key / ID | `update` | allowed fields only (module-defined); locked-field edits → Warning |
| **New** | no ID + required values present | `create` | all fields |
| **Blank** | no ID + no meaningful values | `ignore` | — (auto-skipped) |

---

## 5. Apply Flow

Apply is the **only** step that writes business tables, and only from an **Approved** job.

1. Status **Approved → Applying**.
2. For each `import_job_details` row (excluding `error` and `ignore`):
   - **create** → insert a new business-table row (module generates the new PK).
   - **update** → update the existing business-table row by `record_key`, honoring each row's resolved `user_action`:
     - locked field with `user_action = keep_original` → **not written** (DB value kept).
     - locked field with `user_action = override` → written.
     - non-locked editable field → written.
   - Record the outcome into `apply_result` on the detail row (`applied` / `skipped` / `failed` + reason).
3. Roll the applied outcome onto `import_jobs` (`applied_by`, `applied_at`; final `created_rows` / `updated_rows` reflect what actually applied).
4. Status **Applying → Completed** (or **Failed** if Apply aborts; partial-apply policy is per-module and recorded per detail row).

> **Apply reads the reviewed details, not the raw file.** The user's Keep/Override decisions made during Review are authoritative.

---

## 6. History

**Every completed job (and its details) is retained and searchable — forever.**

- **Retained:** the `import_jobs` header + all `import_job_details` rows. Nothing is deleted on completion.
- **Searchable by:** module, job_type, status, uploaded_by / reviewed_by / applied_by, date range, source_file_name.
- **History record surfaces at minimum:** **Who** (uploaded / reviewed / applied), **When** (timestamps), **File** (`source_file_name` + `source`), **Module** (`module` / `job_type`), **Summary** (the six counts), and drill-down into per-row `import_job_details` (old→new values, warnings, user actions, apply results).
- Cancelled and Failed jobs are **also** retained (they are part of the audit trail).

---

## 7. Retry

- A **Failed** job may be **retried**: create a **new** Import Job from the same source payload (new `import_job_id`); the original stays in History as Failed. The framework never mutates a terminal job in place.
- A **partially applied** job (some detail rows `failed` during Apply) records each failure on `apply_result`; retry re-imports the source and re-reviews (already-applied rows will re-classify as `update`/no-op on the next pass, so retry is safe).
- **Completed** jobs are terminal and are **not** re-applied (Apply is blocked). To change data again, run a new import.
- Retry is a **new job**, never an edit of an old one — this preserves the immutable audit trail.

---

## 8. Cancel

- A job in **Draft / Uploading / Validating / Waiting Review / Approved** may be **Cancelled** → status = **Cancelled** (terminal).
- Cancel **never** writes business tables and **never** deletes the job — the Cancelled job + its details remain in History.
- A job already **Applying / Completed** cannot be cancelled (Apply has begun / finished). Corrective action is a new import.

---

## 9. Permissions

Role-gating is **specified here, enforced later** (ties into the future Role & Permission model). Minimum role split:

| Capability | Who (planned) |
|------------|----------------|
| **Upload / Create job** | any operator with the module's import right |
| **Review + Approve** | a reviewer/approver role for that module |
| **Apply** | typically the approver (Apply may auto-follow Approve, or be a separate click, per module policy) |
| **Cancel** | uploader (own job, pre-apply) or an approver |
| **View History** | any user with read access to the module |

- **Separation of duties** is supported (uploader ≠ approver) but not mandatory in v1 — actor fields are captured regardless so audit is complete.
- Actor identity is recorded on every transition (`uploaded_by` / `reviewed_by` / `applied_by`) even before formal roles exist (MVP placeholder identities, consistent with the rest of the platform).

---

## 10. Future Gmail Automation (documentation only — NOT implemented)

The Import Job Framework is the **landing point** for a future email round-trip. Nothing below is built now; there is **no** Gmail/Inbox reader, parser, attachment extractor, or Export Center.

```
Export Center
      ↓  send carrier-scoped template
Carrier Email
      ↓  carrier fills prices / dates / new rows, replies
Reply + Attachment
      ↓  future inbox reader extracts the attachment
Import Job            (source = 'email'; auto-created)
      ↓
Validation
      ↓
Task Card
      ↓
Review               (human still reviews — automation stops at Waiting Review)
      ↓
Apply
      ↓
History
```

- Email automation only **creates and validates** the job (up to **Waiting Review**). **Human review + approval remain required** — automation never auto-applies.
- The Carrier module's future email round-trip (`CARRIER_AND_ROUTE_SPEC.md` §4C.7) is a **specialization** of this generic flow.

## 11. Future API Automation (documentation only — NOT implemented)

Future external systems may push data straight into the framework as the source:

- **Warehouse APIs** (3PL / FBA inventory + rates) → Import Job (`source = 'api'`, module = warehouse / warehouse_rate).
- **Factory APIs** (production / stock) → Import Job (module = factory).
- **Marketplace APIs** (Amazon inventory / sales / promotions) → Import Job (module = amazon_inventory / amazon_sales / promotion).

- API-sourced jobs follow the **identical** lifecycle: they create + validate a job to **Waiting Review**; a human reviews and applies (unless a future module explicitly opts into auto-apply under policy + permissions).
- This unifies today's scheduled Amazon snapshot imports (`import_sync_runs`, a system-only audit log with no human review) with a future review-gated path: a scheduled sync **may** create an Import Job for review instead of writing directly, when the module requires oversight.

---

## Import Review UI

> **Primary workflow: Task Card → Review Page → Apply. Popup is ONLY for quick summaries — never the main workflow.**

### Task Card

Each Import Job in **Waiting Review** surfaces as a **pending task card** (in a shared "Imports / Tasks" area, and optionally echoed on the owning module's page). The card shows the module, source scope, counts, status, and a **Review** action.

```
┌─────────────────────────────────────────────┐
│  Carrier Import          [Waiting Review]     │
│  DHL                                          │
│  245 rows · 12 warnings                       │
│                                    [ Review ] │
└─────────────────────────────────────────────┘
```

- Fields shown map to `import_jobs`: `module`/`job_type` (title), `source` scope (e.g. carrier name), `total_rows`, `warning_rows`, `status`, and the Review button.

### Review Page

A full page (not a popup). Two regions:

**Top Summary** — the six job counts:

| Total Rows | Created | Updated | Ignored | Warnings | Errors |
|-----------|---------|---------|---------|----------|--------|
| `total_rows` | `created_rows` | `updated_rows` | `ignored_rows` | `warning_rows` | `error_rows` |

**Row-Level Review** — below the summary, every **warning** row shows the change and the decision, in this shape:

```
Original Value   →   Imported Value   →   Recommended Action
```

- For a locked-field change on an existing row: **Original Value** (current DB value) → **Imported Value** (what the file contains) → **Recommended Action** (default **Keep Original**, with a one-click **Override**).
- Error rows are listed and are **excluded from Apply** until fixed (fix = re-import; the framework does not silently apply error rows).
- New/blank rows appear in the summary counts; new rows may be inspected; blank rows are auto-ignored.

---

## Existing Row Rules

Rows **with an existing ID / record key** are treated as **updates**.

- **Locked fields are NOT immediately discarded.** Instead:

```
System detects locked-field change
        ↓
Create Warning  (import_job_details.warning_type = 'locked_field_change')
        ↓
User decides    (Keep Original  or  Override)
```

- **Default action for locked-field changes: Keep Original.** The user may manually **Override** per field/row.
- Allowed (non-locked) editable fields update normally without a warning.
- The module defines which fields are editable vs locked (e.g. Carrier Update Template: editable = `unit_rate` / `effective_from` / `effective_to` / `fuel_surcharge` / `customs_fee` / `doc_fee` / `status` / `note`; everything else locked — see `CARRIER_AND_ROUTE_SPEC.md` §4C.3A).

## New Rows

Rows **without an ID**:

```
No ID  →  Create  →  all fields editable
```

- Validated against the module's required-field set; valid rows are appended as new business-table rows on Apply; invalid rows become `error` details (reported, not applied).

## Blank Rows

- Rows with no ID and no meaningful required values are **ignored automatically** (`action = ignore`, counted in `ignored_rows`). Silent — no warning, no error.

---

## Import History (summary)

- Every completed job remains searchable (§6). History includes **Who / When / File / Module / Summary**, with drill-down to `import_job_details`.

---

## Roadmap Position

The Import Job Framework is sequenced **before Export Center**: Export Center's future email round-trip (send template → carrier reply → attachment) **lands on** the Import Job Framework, so the framework must exist first. See the Blueprint roadmap (Import Job Framework module placed before Export Center) and `DATABASE_RELATIONSHIP_MAP.md` (Import Job Framework Layer).

---

## Non-Goals (explicit)

- **No runtime code, frontend, Apps Script, API, or DB migration** in this spec.
- **No Gmail/Inbox reading, parsing, or attachment extraction** (documented as future only).
- **No API ingestion** (documented as future only).
- **No auto-apply** — human review + approval is required before Apply (a module may later opt into auto-apply under explicit policy + permissions).
- **No Export Center** (separate future module; consumes this framework).
- **No calculation / pricing / cost engine** — Import Job moves data, it does not compute business math.
