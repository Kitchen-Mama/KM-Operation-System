/**
 * ================================================================================================================
 * THE DEPLOYED /exec RESPONSES AFTER THE FIX  —  R10, captured by HTTP                        (P1-B7F §2)
 * ================================================================================================================
 *
 * THE PAIR IS THE EVIDENCE, NOT EITHER FILE ALONE. `_p1b7d-exec-capture.js` is the R9 wire body, frozen: its
 * meta.action says productPricing.workspace.get for a siteUniverse response, and the shipped accessor still
 * answers SOURCE_NOT_CONNECTED when handed it. This file is the R10 wire body for the SAME action, read the same
 * way, through the same 302. Run both through the same unmodified accessor and one is refused and one is
 * classified correctly — so the thing that changed is THE DEPLOYMENT, not the test.
 *
 * Read from the production Web App /exec on 2026-09-12 by HTTPS GET, following the redirect to the
 * googleusercontent echo target that every Apps Script answer takes. GENERATED PROGRAMMATICALLY from the two
 * captured bodies rather than typed, so the frozen file cannot quietly differ from what the wire said.
 *
 * DE-IDENTIFIED, and the generator RUNS the check rather than claiming it. Removed: the endpoint URL, the Script
 * id, the deployment id, the requestId, the server timestamp and serverDurationMs, the caller_probe, the schema
 * block, and the full module manifest. THREE MANIFEST ROWS ARE KEPT, because they are what this round is about:
 * 63_ and 72_ declare R10 and 01_router.gs declares R9 — the file the fix did not touch, still carrying its own
 * round. File names and build strings are already in the repository and identify nothing.
 *
 * IMMUTABLE. Like the R9 capture, this is not edited to agree with later code. If a future round makes the
 * accessor answer something else for this body, that is a finding, not a fixture to update.
 * ================================================================================================================
 */
'use strict';

var P1B7F_EXEC_CAPTURE_R10 = {
  "health": {
    "success": true,
    "ok": true,
    "build_id": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R10",
    "deployment_release": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R10",
    "router_build": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R9",
    "deployed_action_contract_version": 14,
    "required_action_list_version": 12,
    "required_action_count": 44,
    "transport_contract_version": 1,
    "environment_mode": "production",
    "router_ready": true,
    "entrypoints": {
      "doGet": true,
      "doPost": true
    },
    "missing_actions": [],
    "mixed_deployment": false,
    "read_only": true,
    "db_writes": 0,
    "drive_writes": 0,
    "status_transitions": 0,
    "emails": 0,
    "demo_mutations": 0,
    "product_strategy_enabled": false,
    "inventory_ai_plan_db_generation_enabled": false,
    "module_builds": [
      {
        "file": "63_api_v1_system_health.gs",
        "expected_build": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R10",
        "declared_build": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R10",
        "matches_expected": true
      },
      {
        "file": "72_api_v1_product_pricing_workspace.gs",
        "expected_build": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R10",
        "declared_build": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R10",
        "matches_expected": true
      },
      {
        "file": "01_router.gs",
        "expected_build": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R9",
        "declared_build": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R9",
        "matches_expected": true
      }
    ],
    "deployment_uniformity_verdict": "UNIFORM — every probed owner file declares the build its manifest entry expects, AND the writer and lifecycle resolve identically at every known schema generation"
  },
  "siteUniverse": {
    "success": true,
    "data": {
      "sourceState": null,
      "sites": [],
      "site_count": 0,
      "hierarchy": null,
      "identity_authority": "marketplace_skus (company + country + marketplace)",
      "identity_normalization": null,
      "excluded": null,
      "findings": [],
      "refusals": [
        {
          "code": "FEATURE_DISABLED",
          "detail": "PRODUCT_STRATEGY_ENABLED_ is false in the deployment that answered",
          "subject": null
        }
      ],
      "completeness": {
        "rows_examined": 0,
        "capped": false,
        "cap": 2000,
        "is_whole_universe": false
      },
      "schema": {
        "contract_version": 1,
        "build": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R10",
        "action": "productPricing.siteUniverse.get",
        "read_at": null,
        "read_at_is": null,
        "source_modified_at": null,
        "source_modified_at_unavailable_because": null,
        "table": null
      },
      "publishes": [],
      "does_not_publish": []
    },
    "meta": {
      "apiVersion": "1",
      "source": "workspace",
      "workspace": "productPricing",
      "build": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R10",
      "read_only": true,
      "db_writes": 0,
      "cached": false,
      "tablesRead": 0,
      "dbOpened": false,
      "refused": true,
      "refusalCode": "FEATURE_DISABLED",
      "action": "productPricing.siteUniverse.get"
    },
    "errors": []
  },
  "provenance": {
    "captured_at_utc_date": "2026-09-12",
    "transport": "HTTPS GET to the production /exec, 302 -> script.googleusercontent.com/macros/echo, 200",
    "deployed_build": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R10",
    "health_body_bytes": 17949,
    "site_universe_body_bytes": 1074,
    "what_this_proves": "meta.action names productPricing.siteUniverse.get for a siteUniverse response, ON THE WIRE, from the deployed R10 project",
    "removed": [
      "endpoint URL",
      "Script id",
      "deployment id",
      "requestId",
      "server timestamp",
      "serverDurationMs",
      "the full module_build_stamps manifest (three relevant rows kept)",
      "caller_probe",
      "schema"
    ],
    "is_immutable_evidence": true
  }
};

if (typeof module !== 'undefined' && module.exports) { module.exports = P1B7F_EXEC_CAPTURE_R10; }
