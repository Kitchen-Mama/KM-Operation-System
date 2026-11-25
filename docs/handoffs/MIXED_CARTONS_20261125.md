# Mixed Cartons: Deployment And Acceptance

## Scope

Shipping Plan Review > Edit SKUs now supports multiple mixed cartons and partial SKU quantities. Each mixed group is one physical carton. Actual SKU records, stock quantities, PO allocation identities and receipt quantities remain separate.

- Group members stay together in Plan Review and Shipment Draft. Each SKU portion has its own row; the shared carton cell spans the group.
- Any SKU's remaining quantity uses ordinary cartons, rounded up by its units per carton.
- The representative SKU supplies the outer dimensions and carton gross weight. Net weight remains the sum of actual item weights.
- A shipment containing mixed cartons uses automatic sequential carton numbers for its packing blocks, including ordinary remainders. Its old per-SKU range editor is not used.
- Factory SHIPDETAIL keeps every SKU and quantity. CI, PL and forwarder BOOKING models summarize within each physical carton by frozen Series. Different HS/origin/currency facts remain split even within one Series.
- Actual declared amounts are summed. The displayed effective unit value is amount divided by quantity, not the representative SKU's price multiplied by the entire carton quantity.
- PO references retain integer piece counts. Their allocation totals are consumed once across document portions, without fractional proportional allocations.
- Saving packing invalidates the previous quote. Save/select the carrier service again to obtain a fresh quote for the new carton/CBM/gross-weight totals.
- No new master SKU, table or DB column is needed. A versioned JSON envelope `[KMPACK1:...]` lives in each affected canonical line's existing note and follows the existing Plan -> Shipment -> frozen snapshot path. Do not manually edit this envelope.
- Shipment Update import exports human-readable notes and preserves the packing envelope on note changes. Add New import cannot forge system markers.

## Deployment

Base: Git main `60719f79` with its prior GAS release installed. GitHub Pages publication does NOT deploy Apps Script.

Install ALL ten matching files from `output/mixed-cartons-20261125/release/AppsScript` in the existing GAS project, then deploy a new version to the existing Web App endpoint:

1. `01_router.gs`
2. `11_shipping_plan_handlers.gs`
3. `12_shipment_handlers.gs`
4. `34_shipment_final_output_handlers.gs`
5. `35_shipment_document_renderer.gs`
6. `39_document_runtime_service.gs`
7. `63_api_v1_system_health.gs`
8. `80_api_v1_shipment_import.gs`
9. `83_api_v1_weekly_draft_lines.gs`
10. `90_generated_supply_planning_bundle.gs`

Do not deploy only 01/63. Their production gate intentionally refuses partially updated module combinations, including all searches. Leave 00/config, 84/auth, database identities and credentials unchanged. No production DB writes or GAS deployment were performed by this coding task.

The current mirror previously omitted 83 even though the deployed profile pinned it. It was restored from the reviewed archived release with the matching old build before adding packing support. Its existing draft-only/version checks, import journal, replay handling, factory-stock admission, quote invalidation and rollback were retained.

Final policy SHA256: `ead55e3515dc2e807724274b5c27c0b519b0c8f969364e314f0737c1e0e3c87c`.
Bundle source hash: `5aa21ae41f9878279c88173052db4ec6cec5fc360da3a6665120a2d1f9d2dada` (63 modules).

The exact preceding production policy remains accepted for existing actions while GAS is being updated. The NEW `shippingPlan.mixedCartons.save` action requires the matching new backend policy. An old server must never silently ignore a packing payload and save ordinary cartons instead.

## 待驗收清單

請先用可控測試 Draft 驗收。Approve、Confirm 和收貨會正式影響庫存／文件，請勿用正式單反覆測試。

- [ ] 更新上述十個 GS 並重新部署；重新整理網站後 Search 正常，沒有 module mismatch。
- [ ] Edit SKUs 勾選「Mixed cartons / 拚箱」，新增一組，選兩個 SKU、各自件數及代表 SKU，Save 後重新開啟資料仍在。
- [ ] A、B 出貨量各 40，全部放入同一組時，合計 80 件、1 箱；同箱 SKU 相鄰，箱數格只顯示一次 1。
- [ ] A、B 各 40，每箱規格都是 40 件；只各放 20 件進同一拚箱時，剩餘各 20 件分別普通箱，合計是 3 箱，不是 1 箱。
- [ ] 同一 SKU 可分到兩組拚箱，也可同時有普通箱；各列件數加總等於原出貨量，沒有重複。
- [ ] 任一 SKU 在所有拚箱的件數加總超量、填小數、選重複 SKU 或代表 SKU 不在箱內時，Save 被拒絕，DB 沒有半套資料。
- [ ] 移除全部拚箱後，普通箱箱數恢復；舊的普通出貨單仍沿用原箱號輸入流程。
- [ ] 重新儲存貨代服務後，報價使用新箱數、代表外箱毛重及材積，不重複計每個 SKU 的整箱數值。
- [ ] Approve 後 Shipment Draft 保留同組 SKU、各自件數和共享一箱；自動箱號依箱組連續排列。
- [ ] 工廠出貨明細包含全部 SKU；同 Series 的報關用 CI/PL／貨代文件可用一個代表，跨 Series 分列但同箱只計 1 箱。
- [ ] 文件總件數、總金額、PO 件數與原始資料一致；同箱多列共用箱號，總箱數未重複。
- [ ] 可控測試單 Confirm／收貨後，各 SKU 各自扣庫／入庫一次；重複操作不能重複扣庫或入庫。
- [ ] Update Shipment 匯入只改 ETA 或一般備註後，拚箱仍保留；桌機與手機顯示沒有重疊。

Independent CUSTOMS document generation retains its existing authority/readiness gates; this task does not remove those gates or invent an importer identity. Physical packing fit and carton-master accuracy still require operational confirmation.

## Verification

- `node --test assets/tests/mixed-carton-packing.test.cjs assets/tests/mixed-carton-command.test.cjs assets/tests/manual-allocation-production.cjs`: 53 tests passed, including real journal rollback, approved-plan handoff/SKU reservations, duplicate-write prevention and planning/exposure cache invalidation.
- `node assets/tests/mixed-carton-browser.cjs`: 26 assertions passed at 1280px/390px; screenshots under `output/mixed-cartons-20261125` were visually inspected.
- `node assets/tools/check-published-bundle-equivalence.cjs`: executable AST and runtime identity passed.
- Existing CI/carrier mappings: R2 27 checks; R3 17 checks passed.
- Existing warehouse lifecycle 69, Forecast year 62 + browser 18, daily formula 392, calendar-30 sales 92, response deadlines 19, status browser 90 checks passed.
- Shipment marketplace label tests: 8 passed; cache-version assertion updated to this release.
- Existing hard-reload auth browser: 40 passed; calculation Reset browser: 56 passed; shared write-command guards: 19 passed.

Two older unrelated extractor-based suites still cannot run: `shipment-dispatch-po-execution-f1-5b-ship-r3b.test.js` cannot find `slaStr_` after its obsolete marker extraction; `golden-34-partial-carton-e2e-s8-b5-r1.test.js` cannot extract `procurementResolveFactoryId_`. Their 13_/32_ inputs were not changed by this task. These are not represented as passing full end-to-end tests.

The older `dc1-r1-source-write-epoch-and-reader-invalidation.test.js` also reports 13 failures in its outdated read fixtures/classification list. Re-running it with the exact pre-task DB API from `60719f79` reproduces the same 13 failures (30 passing checks). Its wrapper/list-drift checks pass with the new writer. The focused current-client cache/deduplication test above covers the new method directly.

Live Apps Script/Drive Confirm, receipt, actual carrier workbook output and production UAT remain owner acceptance items, not claimed as completed. The existing unrelated untracked roadmap/handoff files are excluded from the commit.
