/**
 * ================================================================================================================
 * THE DEPLOYED /exec RESPONSES, CAPTURED  —  P1-B7D evidence, used as a contract fixture      (P1-B7E §5)
 * ================================================================================================================
 *
 * NOT A HAND-WRITTEN FIXTURE, AND THAT IS THE ENTIRE POINT. The P1-B6 suites built their site-universe envelopes by
 * hand, and their meta.action was set to what the author expected the server to send. Both sides agreed in the
 * suite and disagreed in production: the deployed envelope said productPricing.workspace.get for BOTH actions, the
 * accessor rejected it as RESPONSE_ACTION_MISMATCH, and the board would have reported SOURCE_NOT_CONNECTED over a
 * response that had arrived. A fixture encodes its author assumptions unless something pins it to what the server
 * actually does.
 *
 * These two bodies were read from the production Web App /exec on 2026-09-11, by HTTP, through the 302 to the
 * googleusercontent echo target that every Apps Script answer takes. They are the R9 behaviour, frozen — the thing
 * the R10 fix has to be measured against.
 *
 * DE-IDENTIFIED. Removed: the endpoint URL, the Script id, the deployment id, the per-request requestId, the
 * server timestamp and serverDurationMs, the module_build_stamps manifest (large, and its per-file verdict is
 * recorded in the release ledger instead), the caller_probe, and the schema block. What is KEPT is exactly what a
 * contract is made of: the envelope shape, meta.action, data.schema.action, the contract version, the build, the
 * FEATURE_DISABLED refusal, dbOpened/tablesRead, and the read-only and write counters.
 *
 * THE R9 CAPTURE IS IMMUTABLE EVIDENCE. It is not edited to match the fix — the fix is what has to stop matching
 * it. A suite asserts that the OLD body still reproduces the old defect through the real accessor, because an
 * evidence file quietly updated to agree with the current code proves nothing at all.
 * ================================================================================================================
 */
'use strict';

/** The exact bodies, as parsed from the wire. */
var P1B7D_EXEC_CAPTURE = {
  "health": {
    "success": true,
    "ok": true,
    "build_id": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R9",
    "deployment_release": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R9",
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
    "inventory_ai_plan_db_generation_enabled": false
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
        "build": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R9",
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
      "action": "productPricing.workspace.get",
      "workspace": "productPricing",
      "build": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R9",
      "read_only": true,
      "db_writes": 0,
      "cached": false,
      "tablesRead": 0,
      "dbOpened": false,
      "refused": true,
      "refusalCode": "FEATURE_DISABLED"
    },
    "errors": []
  }
};

/** What the capture is evidence OF, stated so a reader does not have to infer it from the numbers. */
P1B7D_EXEC_CAPTURE.provenance = {
  captured_at_utc_date: '2026-09-11',
  transport: 'HTTPS GET to the production /exec, 302 -> script.googleusercontent.com/macros/echo, 200',
  deployed_build: 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R9',
  health_body_bytes: 17934,
  site_universe_body_bytes: 1061,
  defect_this_proves: 'meta.action named productPricing.workspace.get for a productPricing.siteUniverse.get response',
  removed: ['endpoint URL', 'Script id', 'deployment id', 'requestId', 'server timestamp',
    'serverDurationMs', 'module_build_stamps', 'caller_probe', 'schema'],
  is_immutable_evidence: true
};

if (typeof module !== 'undefined' && module.exports) { module.exports = P1B7D_EXEC_CAPTURE; }
