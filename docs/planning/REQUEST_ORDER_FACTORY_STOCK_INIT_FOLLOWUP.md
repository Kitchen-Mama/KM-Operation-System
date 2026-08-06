# Follow-up — Over-broad Factory Stock initialization on new SKU (Request Order) — OUT OF SCOPE (2026-08-06)

> **Status: DOCUMENTED FOLLOW-UP — NOT ADDRESSED in the Request Order Phase-1 Supplier-dependency hotfix.**
> Recorded per that hotfix's §6/§11, which explicitly deferred this issue: *"Do not address the separate Factory
> Stock initialization issue in this hotfix. The known behavior where a new SKU may currently create Factory Stock
> rows for multiple factories is out of scope and must be documented as a separate follow-up."*

## Observed behavior (to be confirmed in its own slice)

When a manual Request Order Draft is created for a SKU that does not yet exist in the operational planning tables,
the system may (elsewhere in the pipeline — **not** in `handleCreateRequestOrderDraft_`, which only writes
`request_orders` / `request_order_lines` / `request_order_line_sources`) initialize `factory_stock` rows for
**multiple** factory warehouses rather than only the factory the user actually selected.

## Why it is out of scope here

The Supplier-dependency hotfix is a bounded change to the Manual Request Order Draft **modal + create validation**:
Factory ID becomes the required production authority, Supplier becomes optional, and SKU is sourced from canonical
`sku_details`. It touches only `assets/js/pages/request-order-draft.js` and the manual-draft validation guard in
`assets/specs/active/apps-script/13_procurement_handlers.gs`. Factory Stock initialization is a **separate
write-path** with its own governance and test surface; changing it inside a Supplier hotfix would violate the
"bounded, isolated hotfix / no unrelated change" constraint.

## Recommended follow-up slice (separate, to be authorized)

1. **Audit** the exact write-path that creates `factory_stock` rows on first sighting of a SKU (which handler, which
   trigger, which factory set) and cite the code.
2. **Confirm the intended rule**: should Factory Stock be initialized for exactly the selected factory only, lazily
   on first real movement, or per an explicit factory scope? (Business decision — do not guess.)
3. **Fix** so initialization is scoped to the authorized factory (no fan-out to all factories), validate-before-mutate,
   with focused tests and the Golden Matrix protected.

No code was changed for this item in the current round.
