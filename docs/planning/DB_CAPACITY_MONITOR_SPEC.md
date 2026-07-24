# DB Capacity Monitor — Spec (PLANNED; docs only)

**Created:** 2026-07-22
**Status:** **Planned — Phase 2; implement together with Role & Permission Management (`SYSTEM_ROADMAP.md` P2-A, formerly P1-H). NOT a Phase-1A Go-Live blocker.**
**Scope of this document:** definition only. **No DB tab, no trigger, no email, no runtime handler is created by this spec.** Nothing in the app reads or writes anything described here yet.

---

## 1. Purpose

The system's temporary database is a **Google Sheet**, which has a hard **per-spreadsheet cell limit** (allocated cells across all tabs). Large Snapshot Imports (Amazon inventory / daily sales, overseas inventory, etc.) grow allocated cells quickly. The DB Capacity Monitor exists to **warn before the sheet hits the cell ceiling** and to recommend Archive / BigQuery migration in time — never to silently fail an import.

## 2. Why it is coupled to Role & Permission Management (P2-A)

The Monitor is **not** implemented before Role & Permission Management because:
- Notification **recipients** must be resolved by **Admin / System Admin** role, not a hard-coded email.
- Dashboard **alert visibility** must be role-controlled.
- **Email recipient, notification preference, and escalation policy** belong in the People / Role master, not in code.

Until P2-A exists, there is **no correct place to store recipients or gate visibility**, so the Monitor stays docs-only. **Do not hard-code an Admin email in the codebase as an interim.**

## 3. Recorded metrics (planned `db_capacity_log`, NOT created yet)

Each scheduled check would append one row per spreadsheet:

| Field | Meaning |
|-------|---------|
| `spreadsheet_id` | Google Sheet id |
| `spreadsheet_name` | human-facing name |
| `total_allocated_cells` | `SUM(max_rows × max_columns)` across all tabs |
| `cell_limit` | the spreadsheet's hard cell ceiling |
| `usage_rate` | `total_allocated_cells / cell_limit` |
| `largest_tabs` | ranked list of the biggest tabs (name + allocated cells) |
| `checked_at` | check timestamp |
| `status` | Normal / Warning / High Risk / Critical (see §4) |

`total_allocated_cells = SUM(max_rows × max_columns)` — allocated (not just used) cells, because Google counts allocated grid cells against the limit.

## 4. Thresholds (default)

| Usage rate | Status | Planned action |
|------------|--------|----------------|
| `< 70%` | **Normal** | no notification |
| `70–84%` | **Warning** | Admin Dashboard yellow indicator |
| `85–94%` | **High Risk** | red indicator + notify role-permitted Admins |
| `≥ 95%` | **Critical** | block non-essential large Snapshot Imports; require Archive / BigQuery Migration review |

## 5. Planned features (none implemented)

- **Scheduled capacity check** (periodic; appends `db_capacity_log`).
- **Import preflight capacity check** — before a large Snapshot Import, estimate the added cells and refuse/queue when it would cross Critical.
- **Dashboard notification** — role-gated status indicator + largest-tabs ranking.
- **Email notification** — role-based recipients (from People / Role master).
- **Dismiss / acknowledge state** — per alert, with actor + timestamp.
- **Alert audit log** — every raised / acknowledged / escalated alert recorded.
- **Role-based recipients** — resolved from Role & Permission master (P2-A).
- **Largest-tabs ranking** — to guide which tabs to archive first.
- **Archive / BigQuery migration recommendation** — surfaced at High Risk / Critical.

## 6. Explicitly NOT in scope now

- No `db_capacity_log` (or any) DB tab created.
- No Apps Script trigger / scheduled job.
- No email sending, no recipient list.
- No runtime handler, no Dashboard widget wired.
- No hard-coded Admin email.

All of the above is deferred to the P2-A Role & Permission implementation round.

---

**End of Document (planned; docs only).**
