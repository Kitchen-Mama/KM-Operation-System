# Import Job Database Spec

**Status:** 🟢 Draft v1.0 — Platform table definition (SPEC ONLY — NO code, NO DB migration, NO tables created yet)
**Last Updated:** 2026-07-07
**Maintained By:** Development Team
**Related:** [`IMPORT_JOB_FRAMEWORK_SPEC.md`](./IMPORT_JOB_FRAMEWORK_SPEC.md) (flow + philosophy), [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md) (Import Job Framework Layer), [`CARRIER_AND_ROUTE_SPEC.md`](./CARRIER_AND_ROUTE_SPEC.md) (first adopter).

> **Purpose.** Define the **generic, module-agnostic** tables behind the Import Job Framework: `import_jobs` (one header per import) and `import_job_details` (one row per source row). These two tables serve **every** import module (Carrier, Warehouse Rate, Container Rate, Forecast, Amazon Inventory/Sales, Promotion, Factory, Warehouse, Template Import, Future AI Import). **SPEC ONLY** — no tables are created and no migration is performed here.

> **Changelog:**
> - **Draft v1.0 (2026-07-07)** — Created. Two generic tables (`import_jobs`, `import_job_details`), the 9-state status enum, `action` / `warning_type` / `user_action` / `apply_result` value sets, JSON-column conventions, the 1→N relationship, and the module-mapping guidance (Carrier first adopter).

---

## 1. Design Principles

- **Two tables, all modules.** `import_jobs` + `import_job_details` are **generic**. A module is identified by `module` / `job_type`; module-specific structure lives in JSON columns (`changed_fields_json` / `old_value_json` / `new_value_json`), never in per-module columns.
- **Append-first + controlled update.** A job header is created once; its status advances through the lifecycle. Detail rows are written during Validation and updated during Review (`user_action`) and Apply (`apply_result`).
- **Business tables are written only by Apply**, never by these tables directly (`IMPORT_JOB_FRAMEWORK_SPEC.md` §5). These tables are the **staging + audit** of an import; the business table is the destination.
- **Retained forever.** Rows are never deleted on completion/cancel/failure — this is the audit trail (`IMPORT_JOB_FRAMEWORK_SPEC.md` §6).
- **Missing-tab / missing-header safe** (consistent with the rest of the platform): readers tolerate absent tables/columns and return empty; the tables auto-create with the documented header when first written (future runtime).
- **Record key, not raw row index, is the update anchor.** `import_job_details.record_key` holds the business PK (e.g. `rate_card_id`) for update rows; `row_number` is only the source-file position for display.

---

## 2. Table 1 — `import_jobs`

One row per import (the header / task). Cardinality parent of `import_job_details`.

| Field | Type | Notes |
|-------|------|-------|
| `import_job_id` | string (PK) | system generated, e.g. `IMPJ-<10-char UUID>` |
| `module` | string | owning module — `carrier_rate` / `warehouse_rate` / `container_rate` / `forecast` / `amazon_inventory` / `amazon_sales` / `promotion` / `factory` / `warehouse` / `template_import` / `ai_import` / … |
| `job_type` | string | sub-type within the module (e.g. `update_template` / `master_template` / `snapshot` / `manual` / `email` / `api`) |
| `status` | enum | lifecycle — see §4 (Draft / Uploading / Validating / Waiting Review / Approved / Applying / Completed / Cancelled / Failed) |
| `source` | string | how the data arrived — `upload` / `paste` / `email` *(future)* / `api` *(future)* / `scheduled` *(future)* |
| `source_file_name` | string | original file name / attachment name / payload label |
| `uploaded_by` | string | actor who created the job (MVP placeholder identity ok) |
| `uploaded_at` | timestamp | creation time |
| `reviewed_by` | string | actor who approved at Review (blank until Approved) |
| `reviewed_at` | timestamp | approval time |
| `applied_by` | string | actor who applied (blank until Applying/Completed) |
| `applied_at` | timestamp | apply time |
| `total_rows` | number | count of source data rows (excludes header/example) |
| `created_rows` | number | rows classified/applied as new creates |
| `updated_rows` | number | rows classified/applied as updates |
| `ignored_rows` | number | blank rows auto-ignored |
| `warning_rows` | number | rows carrying ≥1 warning (e.g. locked-field change) |
| `error_rows` | number | rows rejected by validation (excluded from Apply) |
| `note` | string | free text (job-level remarks; e.g. carrier scope, mode) |
| `created_at` | timestamp | system |
| `updated_at` | timestamp | system |

**Notes**
- Counts are computed at Validation and re-settled after Apply (a warning row the user overrides still counts as `updated`; an error row never counts as created/updated).
- `module` + `job_type` + optional scope (in `note` / details) is how the Task Card labels the job.
- No business-table foreign keys live here — the destination table(s) are a property of the `module` (declared by the module adapter), and the concrete target table per row is on the detail (`table_name`).

---

## 3. Table 2 — `import_job_details`

One row per source data row (N per job). Holds the classification, the computed diff, the user's decision, and the apply outcome.

| Field | Type | Notes |
|-------|------|-------|
| `job_detail_id` | string (PK) | system generated, e.g. `IMPD-<10-char UUID>` |
| `import_job_id` | string (FK) | → `import_jobs.import_job_id` |
| `row_number` | number | 1-based source-file row position (display / traceability) |
| `table_name` | string | target business table this row applies to (e.g. `carrier_rate_cards`) |
| `record_key` | string | business PK for `update` rows (e.g. `rate_card_id`); blank for `create` |
| `action` | enum | `create` / `update` / `ignore` (see §5) |
| `warning_type` | string | blank, or a warning code — e.g. `locked_field_change` / `duplicate_key` / `overlap` (see §6) |
| `changed_fields_json` | JSON string | list of field names that differ (update rows), e.g. `["unit_rate","shipping_method"]` |
| `old_value_json` | JSON string | current DB values for the changed fields (update rows) |
| `new_value_json` | JSON string | imported values for the changed fields (all classified rows) |
| `user_action` | enum | Review decision — `keep_original` (default for locked-field warnings) / `override` / `pending` / `n/a` (see §7) |
| `apply_result` | enum | Apply outcome — blank until Apply, then `applied` / `skipped` / `failed` (+ reason in `note`) |
| `note` | string | free text (validation error message, apply failure reason, per-row remarks) |
| `created_at` | timestamp | system |

**Notes**
- **JSON columns** keep the two tables module-agnostic: any module's fields serialize into `changed_fields_json` / `old_value_json` / `new_value_json` without adding per-module columns.
- **Error rows:** `action` may still be `create`/`update`, but a validation error is recorded in `note` and the row is **excluded from Apply**; it is counted in `error_rows` on the header.
- **Locked-field warning rows:** `warning_type = 'locked_field_change'`, `changed_fields_json` lists the locked fields the file tried to change, `user_action` defaults to `keep_original`; on Apply those fields are written only if `override`.
- **Blank rows:** `action = ignore`; typically no detail row is required, but a module may record them for completeness (counted in `ignored_rows` regardless).

---

## 4. Status Lifecycle (`import_jobs.status`)

```
Draft → Uploading → Validating → Waiting Review → Approved → Applying → Completed
                          │              │            │
                          │              └────────────┴──────────────► Cancelled   (pre-apply, terminal)
                          └─────────────────────────────────────────► Failed       (parse/validate/apply failure, terminal)
```

| Status | Meaning | Writes business tables? |
|--------|---------|--------------------------|
| **Draft** | job record created; payload not yet received | No |
| **Uploading** | raw payload being received / attached | No |
| **Validating** | parsing + per-row validation into `import_job_details` | No (reads business data only) |
| **Waiting Review** | validated; awaiting human review (Task Card visible) | No |
| **Approved** | reviewer approved; authorized to apply | No |
| **Applying** | writing business tables from reviewed details | **Yes (the only writing state)** |
| **Completed** | apply finished; terminal | done |
| **Cancelled** | cancelled before apply; terminal; retained | No |
| **Failed** | parse / validation / apply failure; terminal; retained | partial only, per detail `apply_result` |

- **Terminal states:** Completed, Cancelled, Failed. Terminal jobs are never mutated in place; corrective action = a new job (Retry, `IMPORT_JOB_FRAMEWORK_SPEC.md` §7).

---

## 5. `action` values (`import_job_details.action`)

| Value | Row condition | On Apply |
|-------|---------------|----------|
| `create` | no `record_key` + required values present | insert new business row (module generates PK) |
| `update` | `record_key` present + matches an existing business row | update that row, honoring `user_action` per field |
| `ignore` | no `record_key` + no meaningful values (blank row) | nothing (skipped, counted in `ignored_rows`) |

---

## 6. `warning_type` values (extensible per module)

| Value | Meaning |
|-------|---------|
| `locked_field_change` | an update row changed a locked/structural field → default Keep Original |
| `duplicate_key` | two source rows resolve to the same `record_key` |
| `overlap` | effective-date / scope overlap with an existing row (module-defined) |
| *(blank)* | no warning |

- Modules may add codes; the framework treats any non-blank `warning_type` as "requires review attention" and counts it in `warning_rows`.

---

## 7. `user_action` values (`import_job_details.user_action`)

| Value | Meaning |
|-------|---------|
| `keep_original` | **default** for locked-field warnings — keep the DB value, ignore the imported value for that field |
| `override` | apply the imported value even for a locked field |
| `pending` | not yet decided (blocks Apply for that row's warnings until resolved, per module policy) |
| `n/a` | no decision needed (clean create/update/ignore row) |

---

## 8. `apply_result` values (`import_job_details.apply_result`)

| Value | Meaning |
|-------|---------|
| *(blank)* | not yet applied |
| `applied` | business row created/updated successfully |
| `skipped` | intentionally not applied (blank/ignore row, or an error row excluded) |
| `failed` | apply attempted but failed (reason in `note`) |

---

## 9. Relationship

```
import_jobs
    │ 1
    │
    ▼ N
import_job_details        (import_job_id → import_jobs.import_job_id)
```

| Relationship | Key | Cardinality |
|--------------|-----|-------------|
| `import_jobs` → `import_job_details` | `import_job_id` | 1 → many |
| `import_job_details` → *business table* | `table_name` + `record_key` | reference (resolved on Apply; not a stored FK) |

- **No stored FK to business tables** — the link is logical (`table_name` + `record_key`), resolved at Apply time. This keeps the two tables generic and avoids per-module coupling.

---

## 10. Module Mapping (how a module adopts the tables)

A module declares (future runtime, via a module adapter — not built here):

- `module` / `job_type` values it uses.
- Target `table_name`(s) and the **record-key field** (the business PK used as `record_key`).
- The **editable vs locked** field sets (drives `locked_field_change` warnings).
- The **required-field validators** for `create` rows.
- The row-classification rule (how to tell create / update / blank).

### 10.1 First adopter — Carrier Rate Card

| Framework concept | Carrier Update Template mapping |
|-------------------|----------------------------------|
| `module` / `job_type` | `carrier_rate` / `update_template` (or `master_template`) |
| `table_name` | `carrier_rate_cards` |
| `record_key` | `rate_card_id` (present ⇒ `update`; blank ⇒ `create`) |
| editable fields (update) | `unit_rate`, `effective_from`, `effective_to`, `fuel_surcharge`, `customs_fee`, `doc_fee`, `status`, `note` |
| locked fields (update) | all other stored columns (carrier/origin/destination keys, `marketplace`, `shipping_method`, `last_mile_delivery`, `charge_type`, `charge_unit`, `dim_divisor`, `min_box_weight(+unit)`, `weight_tier(+unit)`, `currency`, `min_charge`, `transit_type`, `battery_type`, `customs_type`) |
| create required fields | `carrier_id` (or carrier scope), `origin_country`, `destination_country`, `shipping_method`, `last_mile_delivery`, `charge_type`, `charge_unit`, `currency`, `unit_rate`, `effective_from`, `effective_to` |
| warnings | `locked_field_change` (default `keep_original`), optional `overlap` on effective dates |

- The carrier importer's current summary counts (`updated_existing_count` / `created_new_count` / `blank_skipped_count` / `rejected_count` / `locked_fields_ignored_count`) map onto the header counts (`updated_rows` / `created_rows` / `ignored_rows` / `error_rows` / `warning_rows`) — see `CARRIER_AND_ROUTE_SPEC.md` §4C.

### 10.2 Future adopters

Warehouse Rate, Container Rate, Forecast, Amazon Inventory, Amazon Sales, Promotion, Factory, Warehouse, Template Import, Future AI Import — each declares its own `table_name` / keys / field rules; **no new import tables are needed.**

---

## 11. Relationship to existing `import_sync_runs`

- `import_sync_runs` (Amazon scheduled/rolling snapshot imports) is a **system-only audit log** for automated syncs that write directly to their destination — **no human review**.
- `import_jobs` / `import_job_details` are the **review-gated, human-in-the-loop** framework.
- They are **complementary**: `import_sync_runs` stays for unattended scheduled syncs; a future scheduled sync that needs oversight can instead **create an Import Job** (`source = 'scheduled'`) for review before Apply. This spec does **not** change or migrate `import_sync_runs`.

---

## 12. Non-Goals

- No tables are created and no migration is performed (SPEC ONLY).
- No indexes/constraints are physically defined (the platform DB is a Google Sheet today; keys are logical).
- No per-module columns — module structure lives in the JSON columns.
- No change to `import_sync_runs` or any business table.
