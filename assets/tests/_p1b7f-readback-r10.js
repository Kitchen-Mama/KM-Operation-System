/**
 * ================================================================================================================
 * RUN_P1_SITE_UNIVERSE_READBACK() ON R10, FROZEN  —  and the zero-drift proof it makes reproducible  (P1-B7F §2.4)
 * ================================================================================================================
 *
 * The user ran the readback against the deployed R10 project on 2026-09-12 and the log reported
 *
 *     fp=CA0BB90F  len=7273  chunks 2/2  verdict P1_B6_SITE_UNIVERSE_READY
 *
 * where P1-B6 had frozen fp=D53C96CE len=7272 against R9. TWO DIFFERENT FINGERPRINTS IS EXACTLY WHAT A DRIFT
 * QUESTION LOOKS LIKE, and comparing ten row counts by eye is how one gets answered badly.
 *
 * SO THE PROOF IS AN EXPERIMENT INSTEAD. Roll back the only two fields a redeploy legitimately changes — the
 * endpoint build stamp and the read timestamp — re-serialise, and the P1-B6 fingerprint has to reappear. It does,
 * exactly: 7272 characters and D53C96CE. Not one other byte of the universe moved across the envelope fix. That
 * is stronger than checking the fields somebody thought to check, because it covers the ones nobody did.
 *
 * The +1 in length is the whole difference: "R9" became "R10".
 *
 * This file is the parsed report. It contains company/country/marketplace names and row counts — business
 * identifiers already recorded in the design freeze — and no endpoint, id, credential or price.
 * ================================================================================================================
 */
'use strict';

var P1B7F_READBACK_R10 = {
  "readback": "P1_B6_SITE_UNIVERSE",
  "build": "PRODUCT-STRATEGY-P1-B6",
  "endpoint_build": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R10",
  "action": "productPricing.siteUniverse.get",
  "contract_version": 1,
  "read_only": true,
  "writes": 0,
  "writer_calls": 0,
  "sheets_created": 0,
  "rows_modified": 0,
  "zero_write_basis": {
    "writes": "DECLARED_NO_WRITER_IN_FILE",
    "rows_modified": "MEASURED_EXTENT_DELTA"
  },
  "gate_proof": {
    "feature_flag": false,
    "refusal_code": "FEATURE_DISABLED",
    "db_opened": false,
    "tables_read": 0,
    "flag_was_modified_by_this_readback": false,
    "proof_is": "the real endpoint was called and refused; the flag was never written"
  },
  "universe": {
    "source_state": "READY",
    "site_count": 10,
    "identity_authority": "marketplace_skus (company + country + marketplace)",
    "sites": [
      {
        "company": "KM",
        "country": "US",
        "marketplace": "Shopify",
        "membership_row_count": 101,
        "active_count": 101,
        "phasing_out_count": 0,
        "inactive_count": 0,
        "discontinued_count": 0,
        "unknown_status_count": 0,
        "blank_id_count": 0,
        "selectable": true,
        "selectable_with_inactive": true,
        "refusal_reasons": []
      },
      {
        "company": "KM",
        "country": "US",
        "marketplace": "Target",
        "membership_row_count": 19,
        "active_count": 19,
        "phasing_out_count": 0,
        "inactive_count": 0,
        "discontinued_count": 0,
        "unknown_status_count": 0,
        "blank_id_count": 0,
        "selectable": true,
        "selectable_with_inactive": true,
        "refusal_reasons": []
      },
      {
        "company": "KM",
        "country": "US",
        "marketplace": "Walmart",
        "membership_row_count": 64,
        "active_count": 64,
        "phasing_out_count": 0,
        "inactive_count": 0,
        "discontinued_count": 0,
        "unknown_status_count": 0,
        "blank_id_count": 0,
        "selectable": true,
        "selectable_with_inactive": true,
        "refusal_reasons": []
      },
      {
        "company": "ResTW",
        "country": "AU",
        "marketplace": "Amazon",
        "membership_row_count": 35,
        "active_count": 35,
        "phasing_out_count": 0,
        "inactive_count": 0,
        "discontinued_count": 0,
        "unknown_status_count": 0,
        "blank_id_count": 0,
        "selectable": true,
        "selectable_with_inactive": true,
        "refusal_reasons": []
      },
      {
        "company": "ResTW",
        "country": "CA",
        "marketplace": "Amazon",
        "membership_row_count": 51,
        "active_count": 51,
        "phasing_out_count": 0,
        "inactive_count": 0,
        "discontinued_count": 0,
        "unknown_status_count": 0,
        "blank_id_count": 0,
        "selectable": true,
        "selectable_with_inactive": true,
        "refusal_reasons": []
      },
      {
        "company": "ResTW",
        "country": "EU",
        "marketplace": "Amazon",
        "membership_row_count": 39,
        "active_count": 39,
        "phasing_out_count": 0,
        "inactive_count": 0,
        "discontinued_count": 0,
        "unknown_status_count": 0,
        "blank_id_count": 0,
        "selectable": true,
        "selectable_with_inactive": true,
        "refusal_reasons": []
      },
      {
        "company": "ResTW",
        "country": "JP",
        "marketplace": "Amazon",
        "membership_row_count": 26,
        "active_count": 26,
        "phasing_out_count": 0,
        "inactive_count": 0,
        "discontinued_count": 0,
        "unknown_status_count": 0,
        "blank_id_count": 0,
        "selectable": true,
        "selectable_with_inactive": true,
        "refusal_reasons": []
      },
      {
        "company": "ResTW",
        "country": "UK",
        "marketplace": "Amazon",
        "membership_row_count": 42,
        "active_count": 42,
        "phasing_out_count": 0,
        "inactive_count": 0,
        "discontinued_count": 0,
        "unknown_status_count": 0,
        "blank_id_count": 0,
        "selectable": true,
        "selectable_with_inactive": true,
        "refusal_reasons": []
      },
      {
        "company": "ResUS",
        "country": "US",
        "marketplace": "Amazon",
        "membership_row_count": 100,
        "active_count": 100,
        "phasing_out_count": 0,
        "inactive_count": 0,
        "discontinued_count": 0,
        "unknown_status_count": 0,
        "blank_id_count": 0,
        "selectable": true,
        "selectable_with_inactive": true,
        "refusal_reasons": []
      },
      {
        "company": "ResUS",
        "country": "US",
        "marketplace": "Walmart",
        "membership_row_count": 18,
        "active_count": 18,
        "phasing_out_count": 0,
        "inactive_count": 0,
        "discontinued_count": 0,
        "unknown_status_count": 0,
        "blank_id_count": 0,
        "selectable": true,
        "selectable_with_inactive": true,
        "refusal_reasons": []
      }
    ],
    "companies": [
      "KM",
      "ResTW",
      "ResUS"
    ],
    "countries_by_company": {
      "KM": [
        "US"
      ],
      "ResTW": [
        "AU",
        "CA",
        "EU",
        "JP",
        "UK"
      ],
      "ResUS": [
        "US"
      ]
    },
    "marketplaces_by_country": {
      "KM|US": [
        "Shopify",
        "Target",
        "Walmart"
      ],
      "ResTW|AU": [
        "Amazon"
      ],
      "ResTW|CA": [
        "Amazon"
      ],
      "ResTW|EU": [
        "Amazon"
      ],
      "ResTW|JP": [
        "Amazon"
      ],
      "ResTW|UK": [
        "Amazon"
      ],
      "ResUS|US": [
        "Amazon",
        "Walmart"
      ]
    },
    "excluded": {
      "blank_company_rows": 0,
      "blank_country_rows": 0,
      "blank_marketplace_rows": 0,
      "blank_identity_rows": 0,
      "blank_marketplace_sku_id_rows": 0,
      "unknown_status_rows": 0
    },
    "findings": [],
    "refusals": [],
    "table_fingerprint": {
      "columns": 15,
      "headers": [
        "company",
        "country",
        "created_at",
        "currency",
        "fulfillment_model",
        "launch_date",
        "marketplace",
        "marketplace_id",
        "marketplace_product_id",
        "marketplace_sku_id",
        "marketplace_sku_status",
        "replenishment_model",
        "site_sku",
        "sku",
        "updated_at"
      ],
      "fingerprint": "2AF82658",
      "rows": 495
    },
    "read_at": "2026-09-12T01:05:19.946Z",
    "publishes": [
      "company",
      "country",
      "marketplace",
      "counts",
      "selectability"
    ],
    "does_not_publish": [
      "price",
      "currency",
      "image_url",
      "product_url",
      "spreadsheet_id",
      "sheet_name",
      "sku_rows",
      "master_sku",
      "category",
      "series"
    ]
  },
  "completeness": {
    "rows_examined": 495,
    "capped": false,
    "cap": 2000,
    "is_whole_universe": true
  },
  "evidence_gaps": [
    "SOURCE_MODIFIED_AT_NOT_MEASURABLE_IN_THIS_DEPLOYMENT_SCOPE"
  ],
  "verdict": "P1_B6_SITE_UNIVERSE_READY",
  "next_action": "RECORD_THE_UNIVERSE_AND_WIRE_THE_SCOPE_LADDER"
};

/** FNV-1a, character for character the hash the readback tool uses, so the two agree by construction. */
function p1b7fHash_(s) {
  var h = 2166136261;
  s = String(s === undefined || s === null ? '' : s);
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('0000000' + h.toString(16).toUpperCase()).slice(-8);
}

var P1B7F_READBACK_EVIDENCE = {
  report: P1B7F_READBACK_R10,
  hash: p1b7fHash_,
  r10: { fingerprint: 'CA0BB90F', length: 7273, build: 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R10',
         read_at: '2026-09-12T01:05:19.946Z' },
  r9:  { fingerprint: 'D53C96CE', length: 7272, build: 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R9',
         read_at: '2026-09-11T13:31:30.059Z' }
};

if (typeof module !== 'undefined' && module.exports) { module.exports = P1B7F_READBACK_EVIDENCE; }
