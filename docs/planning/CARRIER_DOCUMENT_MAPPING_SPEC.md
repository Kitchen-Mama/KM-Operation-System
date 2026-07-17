# Carrier Document Runtime Mapping Spec

**Status:** 🟢 SPEC ONLY — carrier-specific **document runtime behavior** (no Document Engine runtime implemented, no live template edits, no DB migration).
**Last Updated:** 2026-07-17
**Maintained By:** Development Team
**Related (authoritative):** [`DOCUMENT_GENERATION_SYSTEM_SPEC.md`](./DOCUMENT_GENERATION_SYSTEM_SPEC.md) — shared Document Engine architecture + runtime rules (**§O** Google-Sheet runtime, **§P** canonical finalization: pipeline, `collection_key` convention, formula split, lookup priority, snapshot rule) · [`CARRIER_BOOKING_MAPPING_SPEC.md`](./CARRIER_BOOKING_MAPPING_SPEC.md) — full per-carrier Carrier Booking field inventory (AGL / TOP SEALAND) · [`TAX_AND_REFERRAL_RATES_SPEC.md`](./TAX_AND_REFERRAL_RATES_SPEC.md) — HS Code / declared-value lookup SSOT.

> **Scope & non-duplication.** This document describes **carrier-specific document RUNTIME behavior** — runtime pipeline, collection controllers, lookup usage, dynamic-row behavior, and special rules — for every carrier/customs document family. It **does NOT duplicate `document_template_fields`**: the **database (`document_template_fields`) remains the single source of truth for field-level token → data-source mappings.** Where a full field inventory already exists (AGL Carrier Booking), this spec points to it rather than restating it. All documents inherit the shared runtime in DOCUMENT_GENERATION_SYSTEM_SPEC §O/§P; only the **differences** are recorded here.

---

## 0. Shared Runtime (inherited by every document below)

Every carrier document follows the canonical runtime — do not restate it per carrier:

- **Immutable template + copy-before-render** (§O.1 / §P.2): the original template is never edited; all replacement / expansion / formula updates happen on a copy; the result is an immutable snapshot logged in `generated_documents`.
- **Collection controller → `collection_item`** with one `collection_key` per worksheet section (§O.2 / §P.3); `collection_key` naming = `{SCOPE}_{DOCTYPE}_LINES`.
- **Dynamic rows** (§O.4 / §P.4): actual ≤ reserved → overwrite placeholder rows; actual > reserved → insert before the footer, preserving footer + formulas.
- **Formula split** (§P.5): template formulas (`SUM`/`COUNT`/totals) stay in the sheet; runtime formulas (Amount, Invoice No, PO No, Material Summary, Carton Reference, Collection Summary) are computed before writing.
- **Lookup priority** (§P.6): HS Code / Declared Value / Warehouse / Regional Product / Pricing chains; effective-date rule with blank `effective_to` = open-ended; document date = ETD → creation → current (Draft fallback).
- **Transaction snapshot first, then reference lookup** (§P.7 A/B): generation reads committed PO / Shipment snapshot truth (quantities, weights/CBM, labels, committed carrier/rate-card, allocation, dates, identifiers) and **never recomputes** planning/allocation/execution; where a field is **not** in the snapshot, the Dataset Builder resolves it via the §P.6 Reference Master lookup (`tax_referral_rates` / `warehouses` / `sku_regional_details` / `pricing_list`) using the transaction target date.
- **Snapshot immutability** (§P.7): once generated, the output is immutable — later Pricing / Tax / SKU / Warehouse / Carrier / Regional edits never alter a historical generated document or mutate its `generated_documents` record; only a **new regeneration** creates a new record/version.

---

## 1. AGL

**Full field inventory + template registry: [`CARRIER_BOOKING_MAPPING_SPEC.md`](./CARRIER_BOOKING_MAPPING_SPEC.md) §2 (FINALIZED V1).** Runtime behavior summary:

- **Documents:** Carrier Booking / Carrier Invoice / Customs workbook — one `google_sheet` template, `worksheet_name = Template` (`Instructions` tab unmapped, never expanded).
- **Collection:** `AGL_INVOICE_LINES` — grain = one row per `shipment_lines` record; controller in the hidden control column on line-template **row 22**.
- **Lookup:** HS Code + Declared Value from `tax_referral_rates` (series + origin + duty_country + effective date); shared §P.6 chains.
- **Dynamic rows:** reserved region row 22 → footer = initial capacity; insert before footer when lines exceed it (§O.4).
- **Runtime formula:** `AMOUNT = QTY × DECLARED_UNIT_VALUE`. Footer totals stay template formulas; runtime validates ranges (§O.5).
- **Special rules (AGL v1):** fixed **USD** retained in the template (`DECLARED_CURRENCY` registered but runtime need not overwrite the fixed cell); **Country of Origin = constant "China"** (v1 limitation, not system-wide); no Manufacturer master fields (fixed template content).

---

## 2. SINOTRANS *(mapping recorded; field-level mapping owned by `document_template_fields`)*

- **Documents:** Commercial Invoice + Packing List.
- **Collections:** `SINOTRANS_INVOICE_LINES` (Commercial Invoice), `SINOTRANS_PACKING_LINES` (Packing List) — each owns one dynamic section; grain = `shipment_lines`.
- **Runtime:** shared pipeline (§0). Multi-tab workbook → each mapped worksheet has its own controller + footer; unmapped tabs preserved, never expanded (§O.3).
- **Lookup:** shared §P.6 (HS Code / Declared Value from `tax_referral_rates`; Warehouse recipient via `warehouses`).
- **Special rules:** carrier-specific fixed content and any packing-only columns live in the template; field tokens are defined in `document_template_fields` (not restated here).

---

## 3. Taiwan Export

- **Documents:** Commercial Invoice + Packing List.
- **Collections:** `EXPORT_INVOICE_LINES` (Commercial Invoice), `EXPORT_PACKING_LINES` (Packing List); grain = `shipment_lines`.
- **Runtime:** shared pipeline (§0).
- **Invoice Number rule / PO rule / Material Summary / Totals** are **runtime formulas** (§P.5) — Invoice Number and PO Number resolved by runtime; Material Summary and Collection Summary computed before writing; footer Totals stay template formulas.
- **Lookup:** shared §P.6.

---

## 4. US Import

- **Documents:** Commercial Invoice + Packing List.
- **Collections:** `US_IMPORT_INVOICE_LINES`, `US_IMPORT_PACKING_LINES`; grain = `shipment_lines`.
- **Runtime:** **shares the Taiwan Export runtime** (§3) — same pipeline, same collection/formula/lookup behavior. **Only the import-specific fixed template content differs** (import declarations / fixed header blocks live in the template, not the runtime).
- **Lookup:** shared §P.6.

---

## 5. Future Extension Point

**FedEx · UPS · DHL · Expeditors · Flexport** (and any new carrier) **MUST follow the same canonical runtime** (§0 / DOCUMENT_GENERATION_SYSTEM_SPEC §O/§P): copy-before-render, `{SCOPE}_{DOCTYPE}_LINES` collection keys, dynamic-row expansion before footer, template-vs-runtime formula split, canonical lookup priority, and generated-document snapshot immutability. Each new carrier adds its collection keys + a short runtime-behavior section here; its **field-level mapping is registered in `document_template_fields`** (the SSOT), never duplicated in markdown.

---

**Carrier Document Runtime Mapping — SPEC ONLY. Runtime behavior + collection/lookup contracts only; `document_template_fields` remains the SSOT for field mappings. No runtime, no live-template edits, no DB migration.**

**End of Document**
