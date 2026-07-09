# Template UI Standard Spec

**Status:** 🟢 Draft v1.0 — Platform standard (SPEC ONLY — NO code, NO frontend, NO Apps Script, NO DB migration)
**Last Updated:** 2026-07-07
**Maintained By:** Development Team
**Related:** [`IMPORT_JOB_FRAMEWORK_SPEC.md`](./IMPORT_JOB_FRAMEWORK_SPEC.md) (validation/review/apply layer), [`IMPORT_JOB_DATABASE_SPEC.md`](./IMPORT_JOB_DATABASE_SPEC.md), [`CARRIER_AND_ROUTE_SPEC.md`](./CARRIER_AND_ROUTE_SPEC.md) (first adopter: §4C templates + §4.5 Global Logistics Enums), [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md).

> **Purpose (one line).** Define the **standard UI / UX / formatting rules for every exported spreadsheet template** in Kitchen Mama Operation System, so all templates look and behave consistently, guide users toward correct input, and hand off cleanly to the Import Job Framework. This is **SPEC ONLY** — no runtime code, no library choice, no migration is implemented here.

> **Applies to (all current + future export/import templates):** Carrier Rate Template (Master + Update), Warehouse Rate Template, Container Rate Template, PO Template, Shipment Template, Export documents, Forecast Import Template, Inventory Import Template, and future Factory / Warehouse templates.

> **Authority boundary.** Template formatting is **UX guidance only**. The **Import Job Framework** (`IMPORT_JOB_FRAMEWORK_SPEC.md`) is the **official validation / review / apply authority** — color, protection, and dropdowns help users avoid mistakes but **never** replace importer validation or locked-field enforcement.

> **Changelog:**
> - **Draft v1.0 (2026-07-07)** — Created. Standardizes file format (XLSX preferred), freeze panes, header style + auto-filter + auto-width, editable/locked/required cell styling, sheet protection, data-validation dropdowns, comments/notes, example rows (`row_type = example`), the hidden `_SYSTEM` metadata sheet, template versioning (`template_id` / `template_version`), Carrier Master/Update template rules, the Import Job relationship, and the localization mapping rule.

---

## 1. File Format

- **Preferred export format: `.xlsx`.** Formatted templates (with the styling/validation/protection below) require XLSX.
- **CSV may still be supported** for simple import/export, but CSV **cannot** carry: freeze panes, cell color, data validation (dropdowns), protected/locked cells, comments, or a hidden system sheet.
- **Therefore: any template that relies on formatting, dropdowns, protection, or a `_SYSTEM` sheet MUST be XLSX.** Plain data interchange may still offer CSV, but CSV is the "unformatted" fallback — the Import Job importer must accept both and behave identically (validation is format-independent).
- When both are offered, the **XLSX is the canonical formatted template**; the CSV is a convenience export with the same columns/order (minus formatting-only features).

---

## 2. Freeze Pane

- **Default: freeze the header row** so column names stay visible while scrolling.
- **If the template uses a two-row top** (Row 1 = instruction / metadata banner, Row 2 = column header) → **freeze rows 1–2**.
- **Carrier Rate Template: freeze the header row at minimum** (freeze rows 1–2 if an instruction row is present).
- Column freeze (e.g. pinning the left identity columns) is **optional** per template and left to the module.

---

## 3. Header Style

All template headers use a consistent look:

- **Bold** header text.
- **Strong background color** (a single consistent brand header fill across all templates).
- **Readable text color** (sufficient contrast against the header fill).
- **Auto-filter enabled** on the header row.
- **Consistent column naming** — column headers use the **canonical DB field names** (snake_case, e.g. `unit_rate`, `effective_from`) so import mapping is unambiguous; a human label may appear only in an instruction row or a comment, never as the machine header.

---

## 4. Editable vs Locked vs Required Fields (cell styling)

| Field kind | Fill color | Meaning |
|---|---|---|
| **Editable** | **white** | user may enter / change this value |
| **Locked / reference** | **light gray** | structural / identity field — do not change (importer enforces) |
| **Required** | **light yellow** (or a clear required marker, e.g. `*` in the instruction row / comment) | must be filled for the row to validate |

Rules:
- **Color is UX guidance only** — it communicates intent; it does not enforce anything.
- **Importer validation remains the real authority** — a locked field edited despite the gray fill is still handled by the importer (warning + Keep Original default; see §12 / Import Job Framework).
- A cell may be both **required** and **editable** (yellow) or **required** within a **new-row** context; templates should make the required set obvious per §7 comments.
- Locked cells **may also be visually locked and protected** when XLSX protection is used (§5).

---

## 5. Sheet Protection

When XLSX protection is supported:

- **Protect the sheet.**
- **Unlock only the editable cells** (white / yellow editable).
- **Lock the gray / reference cells** (and header row).
- Leave the **example row** and the blank new-row area editable as the template intends (Update templates: new rows fully editable; see §12).

> **Sheet protection improves UX but is NOT security.** It only discourages accidental edits. The **Import Job importer must still enforce all validation and locked-field rules** regardless of whether the file was protected, unprotected, or re-saved by the user.

---

## 6. Data Validation (dropdowns)

Use dropdown (list) validation wherever a field is an enum, to reduce free-text errors. Apply to at least:

- `status`
- `battery_type`
- `magnet_type`
- `customs_type`
- `transit_type`
- `last_mile_delivery`
- `shipping_method`
- `charge_type`
- `charge_unit`
- `currency` (if practical — the list can be large; a curated subset is acceptable)

Rules:
- **Dropdown lists may display localized labels** (e.g. zh-TW) for readability.
- **The importer must map the localized label back to the canonical DB enum** (§14). The dropdown is a convenience; the importer is the authority.
- Enum value sources are owned by the module (e.g. Carrier **Global Logistics Enums**, `CARRIER_AND_ROUTE_SPEC.md` §4.5). Templates should generate dropdown lists **from those canonical enum sets** so they never drift.

---

## 7. Comments / Notes (helper text)

Add cell comments or an instruction row for fields that are easy to get wrong. Standard examples:

- `effective_from` = `yyyy-mm-dd`
- `effective_to` = blank means **open-ended** (no expiration)
- `rate_card_id` = blank **creates a new row**; filled **updates** the existing row
- `carrier_id` = blank can be **resolved from `carrier_name`** when the module supports it
- required fields → note which are mandatory
- enum fields → note "pick from list; localized labels accepted"

Keep helper text short and consistent; it complements (does not replace) the Import Job validation messages.

---

## 8. Auto Width

- Exported templates **auto-size columns** where possible so headers and typical values are fully visible.
- **Avoid clipped headers.** If auto-sizing is not available in the export path, set sensible fixed widths per column.

---

## 9. Example Row

- Templates **may include one or more example rows** demonstrating the expected format.
- Example rows are marked with **`row_type = example`** (the `row_type` helper column, not persisted — consistent with the Import Job / Carrier templates).
- **The importer MUST skip `row_type = example`** rows (counted as `skipped_examples`, never imported).
- Example rows should be **clearly marked visually** (e.g. a distinct fill / an "EXAMPLE — ignored on import" note in the row) so users know to delete or ignore them.

---

## 10. Hidden `_SYSTEM` Sheet

Formatted XLSX templates **should include a hidden sheet named `_SYSTEM`** carrying template metadata (one key/value block). Suggested fields:

| Key | Purpose |
|---|---|
| `template_id` | stable identifier of the template kind (e.g. `carrier_rate_update`) |
| `template_name` | human name |
| `template_version` | version string (see §11) |
| `module` | owning module (matches Import Job `module`, e.g. `carrier_rate`) |
| `generated_at` | export timestamp |
| `generated_by` | actor / system that generated it |
| `export_mode` | e.g. `master` / `update` (or module-specific) |
| `source_system` | originating system (e.g. `kmos`) |
| `carrier_id` / `carrier_name` | when the template is **carrier-scoped** (Update Template) |
| `notes` | free text |

Purpose:
- **Identify the template version** and kind on import.
- **Prevent old-template misuse** (a stale template can be detected and warned).
- **Support future Import Job validation** (the importer reads `_SYSTEM` to set `module` / `export_mode` / scope instead of guessing from the file name).
- **Support future Export Center automation** (round-trip identification of emailed templates).

> The `_SYSTEM` sheet is metadata only; it is never a data sheet and is not imported as rows.

---

## 11. Template Version

- Every template carries **`template_id`** and **`template_version`** (in `_SYSTEM`, §10; a CSV fallback may carry them in a metadata row/column).
- On import the importer **should warn** if:
  - `template_id` is **unknown**;
  - `template_version` is **outdated**;
  - the template version is **incompatible**.
- **Do not block by default.** Only **structural incompatibility** (columns the importer cannot map) should hard-fail; a merely-outdated but structurally-valid template proceeds with a warning surfaced on the Import Job Review Page.

---

## 12. Carrier Rate Template Specific Rules

Aligns with `CARRIER_AND_ROUTE_SPEC.md` §4C (v2.0). Both carrier templates carry `row_type` + `rate_card_id` as the leading helper/identity columns and **exclude Lead Time** (`transit_days` / lead-time columns forbidden).

**Carrier Master Template** (initial full setup / internal maintenance)
- **All fields editable** (white); XLSX may still **style required fields** (yellow) and lock the `row_type` helper.
- `rate_card_id` **blank → creates** a new row (auto-generated `CRC-<10-char UUID>` on import); filled → updates.
- `carrier_id` **may be blank** if `carrier_name` resolves to exactly one existing carrier (§14 mapping + `CARRIER_AND_ROUTE_SPEC.md` §4C.3B).
- **Unknown `carrier_name` is rejected**; **no carrier auto-create** (carrier master maintained separately).

**Carrier Update Template** (routine carrier quotation update — carrier-scoped)
- **Carrier-scoped**; `_SYSTEM` carries `carrier_id` / `carrier_name`.
- **Existing rows** (have `rate_card_id`): **editable fields white, locked fields gray** (+ protected when XLSX protection is used).
- **New blank rows** (blank `rate_card_id`): **all fields editable where needed** to create a new route/method row.
- **Existing rows must include `rate_card_id`.** **No Lead Time fields, no `transit_days`.**

**Existing-row editable fields:** `unit_rate`, `effective_from`, `effective_to`, `fuel_surcharge`, `customs_fee`, `doc_fee`, `status`, `note`.
**Locked fields:** all other structural fields (carrier/origin/destination keys, `marketplace`, `shipping_method`, `last_mile_delivery`, `charge_type`, `charge_unit`, `dim_divisor`, `min_box_weight(+unit)`, `weight_tier(+unit)`, `currency`, `min_charge`, `transit_type`, `battery_type`, `customs_type`).

**Importer enforcement (authority):** a locked-field change on an existing row becomes an **Import Job warning** (`warning_type = 'locked_field_change'`), **default action = Keep Original**, and the user **may Override on the Review Page** (`IMPORT_JOB_FRAMEWORK_SPEC.md`). The gray fill / protection is only guidance.

---

## 13. Import Job Relationship

Template UI Standard **supports** the Import Job Framework. The formatted template is the *input surface*; the Import Job is the *system of record for validation/review/apply*:

```
Template Export
      ↓
User edits file (guided by freeze/color/dropdown/comments/protection)
      ↓
Import creates Import Job
      ↓
Validation      (enum mapping §14, required fields, locked-field + overlap warnings)
      ↓
Task Card
      ↓
Review Page     (Keep Existing/Override/Cancel; Original → Imported → Recommended Action)
      ↓
Apply           (only writes business tables from an Approved job)
      ↓
History
```

**Template formatting helps users avoid mistakes, but the Import Job is the official validation / review / apply layer.** Nothing in a template (color, protection, dropdown) is trusted over importer validation.

---

## 14. Localization Rule

- **DB / API values use stable English enums.**
- **UI / Template may display localized labels** (e.g. zh-TW) in dropdowns and helper text.
- **The importer must map localized label → DB enum** (case/trim-normalized); an unmappable value is a **row error** (`invalid enum`), never a silent guess.

Examples (Carrier Global Logistics Enums, `CARRIER_AND_ROUTE_SPEC.md` §4.5):

| Localized label | DB enum |
|---|---|
| 不帶電 | `no_battery` |
| 鹼性電池 | `alkaline_battery` |
| 鋰電池 | `lithium_battery` |
| 可充電鋰電池 | `rechargeable_lithium` |
| 不帶磁 | `no_magnet` |
| 帶磁 | `magnetic` |
| 買單報關 | `third_party_customs` |
| 退稅報關 | `tax_refund_customs` |
| 正式報關 | `formal_customs` |

---

## Non-Goals (explicit)

- **No runtime code, no XLSX library selection, no frontend/Apps Script, no DB migration** in this spec.
- **No security claim** — sheet protection is UX only; the importer is the authority.
- **No per-module column definitions** — those live in each module's spec (e.g. Carrier `CARRIER_AND_ROUTE_SPEC.md` §4C). This document standardizes *how templates look and behave*, not *which columns each module ships*.
- **No Export Center / email automation** — future; this standard is what those will produce/consume.
