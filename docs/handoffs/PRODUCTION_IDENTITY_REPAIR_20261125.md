# Production Identity Repair

The warehouse release changed OSW_BUILD_VERSION_ but omitted the corresponding router production-profile pin. The router therefore rejected every API request with a production module identity failure. Its allowed/read action arrays also changed without regenerating the policy digest or synchronizing production-config.js.

This repair keeps all production identity checks enabled:

- Router and health both require the actual OSW/FIW warehouse lifecycle module stamps.
- Router policy SHA-256 is regenerated from the complete structured profile, excluding its digest field.
- Public frontend config is the exact permitted projection of that profile.
- The guard accepts only the current policy or two explicitly pinned prior rollout policies, and blocks actions unavailable in a prior policy.
- A failed identity read no longer poisons every later read with a permanently cached rejected promise. A retry still performs all identity checks.

## Required Owner Deployment

If the five-file warehouse ZIP was already installed, replace ONLY `01_router.gs` with the current repository copy and publish a new version of the EXISTING Apps Script Web App deployment.

Otherwise install `01_router.gs`, `63_api_v1_system_health.gs`, `70_api_v1_overseas_stock_workspace.gs`, `88_api_v1_warehouse_lifecycle.gs` (new), and the published `90_generated_supply_planning_bundle.gs` together.

Do not change endpoint, database, credentials, configuration, or other installed handlers. The frontend `production-config.js` and `production-guard.js` must also be published from this repair; hard-refresh the app after GitHub Pages deployment.

Policy SHA-256: `ab29a81c6c86068efdaebd4d2e2ee19846dc953709c14e1373e17cbe8d8842ab`.
OSW/FIW stamps: `WAREHOUSE-LIFECYCLE-20261125-V1`.

The updated production integration suite checks profile digest, config projection, actual module stamps, backend readiness, old-policy compatibility, wrong-database rejection, partial-deployment rejection, and failed-read recovery.

No production database writes or live calculation reset were performed by the agent.
