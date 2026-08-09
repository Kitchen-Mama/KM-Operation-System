# Kitchen Mama OS — Responsive Foundation (authority)

**Status:** FROZEN — SYSTEM-RESPONSIVE-R1 (2026-08-09). This is the SINGLE responsive/viewport design authority
for the whole system. Do not create competing responsive docs. Owner CSS: `assets/css/responsive-foundation.css`
(tokens + safe guards + opt-in utilities), loaded after the shell owners and before page CSS.

Kitchen Mama OS is an operation/ERP system. The primary experience is **Laptop + Desktop**. Phones safe-degrade;
**horizontal scroll on wide ERP tables is intentional**, never a defect. Not mobile-first.

## Supported viewport tiers (breakpoint authority)

Frozen in `:root` of `responsive-foundation.css` as `--km-bp-*` tokens. `@media` cannot read `var()`, so these
values are the documented source of truth; page media queries must use THESE values, never re-invent them.

| Tier      | Bound            | Token             | Notes                                              |
|-----------|------------------|-------------------|----------------------------------------------------|
| Tablet    | `max-width:1024` | `--km-bp-tablet`  | constrained / tablet-landscape; table scroll expected |
| Compact   | `max-width:1280` | `--km-bp-compact` | small laptop (e.g. 1280, 1366 fall here)           |
| Laptop    | `max-width:1440` | `--km-bp-laptop`  | standard laptop                                    |
| Desktop   | `max-width:1680` | `--km-bp-desktop` | standard desktop                                   |
| XL        | `≥ 1681`         | `--km-bp-xl`      | ultrawide                                          |

Target validation matrix: 1920 / 1600 / 1440 / 1366 / 1280 / ~1024. Anything requiring a screenshot to confirm is
**USER_VERIFY** — never claimed as a source-proven PASS.

## Frozen rules

1. **Page width.** Default content is full-width with `.content-area` horizontal padding
   (`--km-page-pad-x` 2rem → `--km-page-pad-x-compact` 1.25rem ≤1280 → `--km-page-pad-x-tablet` 1rem ≤1024).
   Form/dashboard pages MAY opt into `.km-content-constrained` (`max-width:--km-content-max` 1680px, centered).
   Wide ERP **table** pages stay full-width by design.
2. **Table overflow.** A wide table scrolls **inside its own container** (`.km-table-scroll`, or the proven
   `.dual-layer-table` / `.replen-horizon-tablewrap` / `.scroll-col` owners) — the outer page never scrolls
   horizontally. The page-level guard is `layout.css .main-content { overflow-x: hidden }` (single owner).
   Pair the inner table with `.km-table-min` (`min-width:--km-min-safe-width` 1024px) so columns stay readable
   and scroll rather than being crushed. Numeric cells: `.km-num` (nowrap, tabular). Long text: `.km-wrap`.
3. **Fixed first column + scroll columns.** Canonical structure: `.table-body-bar` (flex, `align-items:stretch`
   owns height) → sticky `.fixed-col` + `.scroll-col` (`overflow-x:auto`); the `.scroll-body` spans its widest
   child (`width:max-content`) so a selected/logical row background is continuous across the full width (no white
   gutter/ghost block); the fixed and scroll layers share one row height. Grouped 2-row headers stay contained via
   `.dual-layer-table { max-width:100% }` + `.scroll-header { min-width:max-content }` synced by scrollLeft.
4. **Cards.** Stay inside the parent, use available width, wrap intelligently, never force the page wider than the
   viewport. Chart cards: the canvas is `.km-fluid`/`.km-fluid-canvas` (`max-width:100%`) so it resizes with its
   parent. Do not touch chart data/calculation.
5. **Filter / action bars.** `.km-responsive-bar` / `.km-action-bar` (`flex-wrap:wrap`): single row on large
   viewports, controlled wrapping on Laptop/Compact, multiple rows when constrained. Controls never overlap; text
   is never shrunk to unreadable sizes.
6. **Header / sidebar.** Single offset owner `--header-height` (base.css) drives `.top-header` height,
   `.app-layout` top, `.sidebar` top/height, and `.main-content` height — never double-counted. Sidebar is a fixed
   240px column with a manual collapse (`.is-collapsed` → 64px); core navigation never disappears automatically.
7. **Future columns.** Layouts must be content-driven (scroll container + `min-width` + flex/grid contracts +
   shared tokens). Never hard-code "this table has N columns"; adding a column must not require a page redesign.
8. **Page-specific exception policy.** Prefer the shared tokens/utilities. A page may override foundation defaults
   ONLY when a genuine page-specific need exists, kept page-scoped (`#<page>-section …`), documented in the page
   CSS, and never re-declaring the breakpoint tokens. Inventory-only or OP-only fixes stay page-scoped.
