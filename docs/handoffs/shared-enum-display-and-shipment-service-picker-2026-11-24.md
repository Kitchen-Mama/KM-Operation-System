# Shared Enum Display and Shipment Service Picker

## Public Helpers

Owner: existing `codeDisplay_` / `window.KM.display` section of `assets/js/api/operation-system-db-api.js` only. All adapter writers, payload filters and guards are unchanged.

- `KM.display.enumLabel(code, scope?)`: one-argument finite method/last-mile/status vocabulary. Optional scope: `shippingMethod`, `lastMileDelivery`, `status`.
- Existing `shippingMethod(code)` and `lastMileDelivery(code)` now use scoped finite vocabularies. `truck`, `parcel`, `air`, `sea_express` display as Truck, Parcel, Air, Sea Express. Unknown names, IDs and acronyms retain their spelling. Existing customs localization is unchanged.
- `KM.display.status(code)`: finite status labels, without changing lifecycle semantics or the existing localized arrival labels.
- `KM.display.shippingService(service)`: accepts `{shipping_method, last_mile_delivery, shipping_method_label?}` and camelCase aliases. A nonblank supplied name is returned verbatim; otherwise join displayed method and last mile with a middle dot, omitting blanks. No SPD/LTL inference.
- Display strings are not canonical tokens and must never be persisted or used for joins.

## Page Scope

- `shipping-history.js`: method filter labels retain raw values; overview cards, editor and confirmation format method enums. Rate-card choices use shared paired service labels rather than `(no label)` when a tuple is present.
- Shipment Workspace service editor: `services_known:true` uses one `.sh-svc-service` select from complete `carrier.services` tuples. Deduplicates exact tuples, never creates a Cartesian product, and never silently selects a new service. Hidden `.sh-svc-method` / `.sh-svc-lastmile` preserve canonical tokens for the existing save path. Changing carrier retains only a matching tuple; blank or inconsistent paired selections refuse Save.
- Contract limit: TBA and `services_known:false` expose no authoritative tuple list. Their existing independent vocabulary controls remain available, including zero-rate-card carriers. Do not infer capabilities from another carrier, rate-card availability or SPD/LTL. Known-empty declarations are not treated as unknown.
- Carrier assignment reason, explicit TBA marker, concurrency token, dirty-editor gate, backend update helper, uncertain-write handling and skip-quote flow remain intact. No new backend action.
- `carrier-rate-card.js`: method/last-mile facet labels, rate rows and lead-time rows/lane summaries reuse the shared helper. Country/carrier identities, filters and master editor/export/input values are unchanged; transit/status display uses the corresponding bounded vocabulary.
- `global-logistics-map.js`: method option labels are separate from raw method values. Drawer/list/tooltip status and method rendering use the helper; projected arrival wording and transport classification are retained. Raw diagnostic/event status text remains raw.
- Other page JS files contain no `shippingMethod` / `shipping_method` / `lastMileDelivery` / `last_mile_delivery` references in the targeted audit (excluding the other owners' inventory/shipping-plan files).

## Verification

- `node assets/tests/shared-enum-display.test.js`: PASS, 100 assertions over shipped helper functions, normalization, filter values, escaped options and the existing Save payload. No transport loaded.
- `node assets/tests/shipment-service-picker-browser.cjs`: PASS, 40 assertions in Chrome at 1440px and 390px. Actual helper/editor source; network blocked; writes intercepted into an in-memory fixture. Covers exact/deduplicated tuples, no auto-selection, carrier changes, stale hidden values, unknown capabilities, TBA reason and marker, known-empty services and viewport fit.
- Screenshots inspected: `output/shared-enum-display/shipment-service-1440.png` and `shipment-service-390.png`. This is an isolated editor fixture, not a production/full-page acceptance run.
- Carrier-rate-card (41), global-logistics-map (22), shared-filter-migration (30), shipment-map-control-panel-r12 (41): PASS.
- All four changed application JS files and both new test files pass `node --check`.
- Map-transport-mode-icons: 75 PASS during the earlier audit; not rerun after the final editor-only changes.

Broader legacy suites are NOT all green and were not repaired in this scope:

- `s7-r2a-shipment-carrier-name.test.js`: 66 pass / 8 fail. Old global source-count assumptions about `carrier_name`, workspace read count, old confirmation rendering, and one mutation anchor no longer match the current tree.
- `s7-r3-carrier-lead-time-maintenance.test.js`: 97 pass / 1 fail, F7a deployment/browser action-contract version pin.
- `shipment-map-ui-r11.test.js`: 26 pass / 4 fail, old KPI/card hierarchy/click-binding source pins.
- `api-bounded-reference-include-extensions-f1-7j-a2-r1.test.js`: fixture throws `ReferenceError: normalizeCarrierRecord is not defined` when adapting the inventory workspace.
- No clean baseline comparison was performed; do not treat the above as newly proven regressions or a green full-suite result.
- The old domestic-workflow browser harness extracts a hardcoded function list. For the updated Shipment editor it must also load `_shEnumDisplay_`, `_shSvcServiceLabel_`, `_shSvcDeclaredPairs_`, `_shSvcFieldsHtml_`, `shSvcPickService`; the dedicated new browser test already does so.

## Coordination and Boundaries

Frontend owner `01a20d30-6e27-76e3-8c39-e14312805fa4` was notified of helper signatures and completed tests, with a request to relay to parent. Direct app messaging to the native ancestor was rejected; parent also received in-chat status updates and this handoff.

No retained changes to inventory main, shipping-plan JS, CSS, backend GS, index/app, method registry, production data or deployment. Parent owns versioning/integration. No commit or other Git mutation.
