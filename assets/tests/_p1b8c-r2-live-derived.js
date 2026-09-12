// Kitchen Mama Operation System — PRODUCT-STRATEGY-P1-B8C-R2
// THE LIVE-DERIVED REPLAY CAPTURE.
//
// WHAT THIS IS. Sixty rows read out of the production Operation System Database on 2026-09-12 by
// RUN_P1_PRODUCT_STRATEGY_ROW_SHAPE_SAMPLE(), reduced field by field, and rehydrated to the shape the
// accessor receives off the wire. Every value below except the two named substitutions is a value a
// production sheet holds.
//
// WHAT IT IS NOT, AND THE DISTINCTION IS THE WHOLE POINT OF THE ROUND:
//
//   IT IS NOT THE UNIVERSE. 495 rows exist; 60 are here. `NOT_FULL_UNIVERSE` is true and every count
//   an envelope below reports describes THE SAMPLE, not the site. The site's real numbers are kept
//   separately in `live` and asserted separately, because a board that says "101 SKUs" over a 27-row
//   chart is not a render of anything.
//
//   IT IS NOT A DETERMINISTIC FIXTURE. `_p1b8c-capture.js` is; it says so. This one says
//   SOURCE_KIND = LIVE_DERIVED_REDACTED, and the suite refuses to let either be reported as the other.
//
//   IT IS NOT THE RAW LOG. The 240,126-character editor output is NOT in this repository and must not
//   be. What survives here is the field set the renderer contract reads.
//
// THE TWO SUBSTITUTIONS, NAMED RATHER THAN HIDDEN:
//
//   product_image — the live value is an address and the diagnostic removed it, correctly. The two
//   booleans it published decide which of imageStateOf's three states the renderer picks, and those
//   are live. The string here is of the right KIND (non-absolute for every live row) so the STATE is
//   real; the address is not. No live row is an absolute URL, so no product photograph is drawable
//   from production data — recorded as an evidence gap, not papered over.
//
//   regional.* — the join is live (`regional_present`); every field on the object is a locator and is
//   null here. The selectors read the join's presence and nothing else.
//
// PROVENANCE, so this file can always be traced back to the run that produced it:
//   original_report_fingerprint FPe02df215   original_report_length 240126   chunks 35
//   build P1-B8C-R1A   verdict SAMPLE_TAKEN   read_at 1789209554628

var P1B8C_R2_LIVE = (function () {
  'use strict';
  var C = {};

  C.SOURCE_KIND = "LIVE_DERIVED_REDACTED";
  C.IS_LIVE_DERIVED = true;
  C.IS_A_DETERMINISTIC_FIXTURE = false;
  C.NOT_FULL_UNIVERSE = true;
  C.NOT_LOADED_BY_PRODUCTION = true;
  C.READ_ONLY_CAPTURE = true;
  C.ORIGINAL_REPORT_FINGERPRINT = "FPe02df215";
  C.ORIGINAL_REPORT_LENGTH = 240126;
  C.ORIGINAL_REPORT_CHUNKS = 35;
  C.ORIGINAL_BUILD = "P1-B8C-R1A";
  C.ORIGINAL_VERDICT = "SAMPLE_TAKEN";
  C.ROW_COUNT = 60;
  C.UNIVERSE_TOTAL_ROWS = 495;
  C.OMITTED_ROWS = 435;
  C.SITES_EXAMINED = 10;
  C.CONTRACT_VERSION = 2;
  C.UNIVERSE_CONTRACT_VERSION = 1;
  C.ACTION = "productPricing.workspace.get";
  C.HANDLER_BUILD = "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R10";
  C.IMAGE_ADDRESS_IS_A_SUBSTITUTE = true;
  C.REGIONAL_LOCATORS_ARE_NULL = true;

  /* THE ONE COVERAGE GAP PRODUCTION ITSELF HAS. Every one of the 495 live rows is `Active`, so no
     live row can demonstrate the excluded-by-status path. It is covered by the DETERMINISTIC fixture
     and reported separately — never merged into the live column. */
  C.LIVE_COVERAGE_GAPS = [{"code":"STATE_ABSENT_FROM_PRODUCTION","dimension":"status","values":["non_active"]}];

  C.SITES = [
    {
      "company": "KM",
      "country": "US",
      "marketplace": "Shopify",
      "sourceState": "READY",
      "live": {
        "universe_rows": 101,
        "sampled_rows": 27,
        "counts": {
          "siteSkuCount": 101,
          "activeSiteSkuCount": 101,
          "phasingOutSiteSkuCount": 0,
          "inactiveSiteSkuCount": 0,
          "discontinuedSiteSkuCount": 0,
          "regionalMissingCount": 0,
          "pricingMissingCount": 0,
          "analysableSiteSkuCount": 101
        },
        "membership_in_scope": 101,
        "membership_excluded_by_status": 0,
        "status_distribution": {
          "active": 101,
          "phasing_out": 0,
          "inactive": 0,
          "discontinued": 0,
          "__unknown": 0
        },
        "pagination_total": 101,
        "category_option_count": 10,
        "series_option_count": 25,
        "findings": [],
        "refusals": []
      },
      "rows": [
        {
          "identity": "MSKU:MPSKU-US-SHO-CO0560-2da957",
          "marketplace_sku_id": "MPSKU-US-SHO-CO0560-2da957",
          "master_sku": "CO0560",
          "site_sku": "CO0560",
          "product_name": "Orbit One replacement Blade Set",
          "category": "Electric Can Opener",
          "series": "CO0560",
          "variant_group": "CO0560",
          "variant_name": null,
          "company": "KM",
          "country": "US",
          "marketplace": "Shopify",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 19.99,
          "minimum_price": 16.99,
          "msrp": 25,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "CO0560",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-US-SHO-CO1100-R-7c8ead",
          "marketplace_sku_id": "MPSKU-US-SHO-CO1100-R-7c8ead",
          "master_sku": "CO1100-R",
          "site_sku": "CO1100-R",
          "product_name": "Auto Electric Can Opener 1.0 (Red)",
          "category": "Electric Can Opener",
          "series": "CO1100",
          "variant_group": "CO1100",
          "variant_name": null,
          "company": "KM",
          "country": "US",
          "marketplace": "Shopify",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 29.99,
          "minimum_price": 21,
          "msrp": 35,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "CO1100-R",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-US-SHO-CO1150-AG-a0d119",
          "marketplace_sku_id": "MPSKU-US-SHO-CO1150-AG-a0d119",
          "master_sku": "CO1150-AG",
          "site_sku": "CO1150-AG",
          "product_name": "Auto Electric Can Opener 2.0 (Alpine Green)",
          "category": "Electric Can Opener",
          "series": "CO1150",
          "variant_group": "CO1150",
          "variant_name": null,
          "company": "KM",
          "country": "US",
          "marketplace": "Shopify",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 32.99,
          "minimum_price": 24,
          "msrp": 40,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "CO1150-AG",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-US-SHO-CO1200-B-f5f868",
          "marketplace_sku_id": "MPSKU-US-SHO-CO1200-B-f5f868",
          "master_sku": "CO1200-B",
          "site_sku": "CO1200-B",
          "product_name": "Mini Electric Can Opener (Blue)",
          "category": "Electric Can Opener",
          "series": "CO1200",
          "variant_group": "CO1200",
          "variant_name": null,
          "company": "KM",
          "country": "US",
          "marketplace": "Shopify",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 24.99,
          "minimum_price": 20,
          "msrp": 30,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "CO1200-B",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-US-SHO-CO1200-WR-bfaa9d",
          "marketplace_sku_id": "MPSKU-US-SHO-CO1200-WR-bfaa9d",
          "master_sku": "CO1200-WR",
          "site_sku": "CO1200-WR",
          "product_name": "Mini Electric Can Opener (White)",
          "category": "Electric Can Opener",
          "series": "CO1200",
          "variant_group": "CO1200",
          "variant_name": null,
          "company": "KM",
          "country": "US",
          "marketplace": "Shopify",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 24.99,
          "minimum_price": 20,
          "msrp": 30,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "CO1200-WR",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-US-SHO-CO2100-P-a0fdad",
          "marketplace_sku_id": "MPSKU-US-SHO-CO2100-P-a0fdad",
          "master_sku": "CO2100-P",
          "site_sku": "CO2100-P",
          "product_name": "One Touch Electric Can Opener (Purple)",
          "category": "Electric Can Opener",
          "series": "CO2100",
          "variant_group": "CO2100",
          "variant_name": null,
          "company": "KM",
          "country": "US",
          "marketplace": "Shopify",
          "marketplace_sku_status": "Active",
          "lifecycle": "Phasing Out",
          "currency": "USD",
          "regular_price": 34.99,
          "minimum_price": 29,
          "msrp": 40,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "CO2100-P",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-US-SHO-CO2600-M-cccff8",
          "marketplace_sku_id": "MPSKU-US-SHO-CO2600-M-cccff8",
          "master_sku": "CO2600-M",
          "site_sku": "CO2600-M",
          "product_name": "Mini Plus Rechargeable Electric Can Opener (Metal Gray)",
          "category": "Electric Can Opener",
          "series": "CO2600",
          "variant_group": "CO2600",
          "variant_name": null,
          "company": "KM",
          "country": "US",
          "marketplace": "Shopify",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 39.99,
          "minimum_price": 29.99,
          "msrp": 49.99,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "CO2600-M",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-US-SHO-CO5600-Q-02e68d",
          "marketplace_sku_id": "MPSKU-US-SHO-CO5600-Q-02e68d",
          "master_sku": "CO5600-Q",
          "site_sku": "CO5600-Q",
          "product_name": "Orbit One Rechargeable Can Opener (Stainless Steel)",
          "category": "Electric Can Opener",
          "series": "CO5600",
          "variant_group": "CO5600",
          "variant_name": null,
          "company": "KM",
          "country": "US",
          "marketplace": "Shopify",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 55.99,
          "minimum_price": 45.99,
          "msrp": 65,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "CO5600-Q",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-US-SHO-CO5600-RB-1a363a",
          "marketplace_sku_id": "MPSKU-US-SHO-CO5600-RB-1a363a",
          "master_sku": "CO5600-RB",
          "site_sku": "CO5600-RB",
          "product_name": "Orbit One Rechargeable Can Opener (Royal Burgundy)",
          "category": "Electric Can Opener",
          "series": "CO5600",
          "variant_group": "CO5600",
          "variant_name": null,
          "company": "KM",
          "country": "US",
          "marketplace": "Shopify",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 49.99,
          "minimum_price": 40,
          "msrp": 59.99,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "CO5600-RB",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-US-SHO-GA0150-M-b159cd",
          "marketplace_sku_id": "MPSKU-US-SHO-GA0150-M-b159cd",
          "master_sku": "GA0150-M",
          "site_sku": "GA0150-M",
          "product_name": "DuoEssentials Cutting Board Set (Metal Gray)",
          "category": "Cutting Board",
          "series": "GA0150",
          "variant_group": "GA0150",
          "variant_name": null,
          "company": "KM",
          "country": "US",
          "marketplace": "Shopify",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 39.99,
          "minimum_price": 29.99,
          "msrp": 44,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "GA0150-M",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-US-SHO-GA0450-M-df9d6e",
          "marketplace_sku_id": "MPSKU-US-SHO-GA0450-M-df9d6e",
          "master_sku": "GA0450-M",
          "site_sku": "GA0450-M",
          "product_name": "Q-Series Food Scale (Metal Gray)",
          "category": "Kitchen Scale",
          "series": "GA0450",
          "variant_group": "GA0450",
          "variant_name": null,
          "company": "KM",
          "country": "US",
          "marketplace": "Shopify",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 34.99,
          "minimum_price": 27.99,
          "msrp": 39.99,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "GA0450-M",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-US-SHO-GA3120-M-c9565d",
          "marketplace_sku_id": "MPSKU-US-SHO-GA3120-M-c9565d",
          "master_sku": "GA3120-M",
          "site_sku": "GA3120-M",
          "product_name": "DuoEssentials Cooking tongs Set (Metal Gray)",
          "category": "Tongs",
          "series": "GA3120",
          "variant_group": "GA3120",
          "variant_name": null,
          "company": "KM",
          "country": "US",
          "marketplace": "Shopify",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 24,
          "minimum_price": 22,
          "msrp": 29,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "GA3120-M",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-US-SHO-GM3000-Y1-cf3e41",
          "marketplace_sku_id": "MPSKU-US-SHO-GM3000-Y1-cf3e41",
          "master_sku": "GM3000-Y1",
          "site_sku": "GM3000-Y1",
          "product_name": "FlipTastic Rechargeable Gravity Grinder (Yellow)",
          "category": "Grinders",
          "series": "GM3000",
          "variant_group": "GM3000",
          "variant_name": null,
          "company": "KM",
          "country": "US",
          "marketplace": "Shopify",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 39.99,
          "minimum_price": 38.7,
          "msrp": 49.98,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "GM3000-Y1",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-US-SHO-GM3060-WM-3ca79a",
          "marketplace_sku_id": "MPSKU-US-SHO-GM3060-WM-3ca79a",
          "master_sku": "GM3060-WM",
          "site_sku": "GM3060-WM",
          "product_name": "FlipTastic Rechargeable Gravity Grinder Set (White & Metal Gray)",
          "category": "Grinders",
          "series": "GM3060",
          "variant_group": "GM3060",
          "variant_name": null,
          "company": "KM",
          "country": "US",
          "marketplace": "Shopify",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 69.99,
          "minimum_price": 59.99,
          "msrp": 86.99,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "GM3060-WM",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-US-SHO-MF0023-29ee59",
          "marketplace_sku_id": "MPSKU-US-SHO-MF0023-29ee59",
          "master_sku": "MF0023",
          "site_sku": "MF0023",
          "product_name": "Flow-Mixing Wheel (3 Pack)",
          "category": "Milk Frother",
          "series": "MF0023",
          "variant_group": "MF0023",
          "variant_name": null,
          "company": "KM",
          "country": "US",
          "marketplace": "Shopify",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 10.99,
          "minimum_price": null,
          "msrp": 13.99,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "MF0023",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-US-SHO-MF1000-M1-156d32",
          "marketplace_sku_id": "MPSKU-US-SHO-MF1000-M1-156d32",
          "master_sku": "MF1000-M1",
          "site_sku": "MF1000-M1",
          "product_name": "Silkwhisk Electric Milk Frother (Metal Gray)",
          "category": "Milk Frother",
          "series": "MF1000",
          "variant_group": "MF1000",
          "variant_name": null,
          "company": "KM",
          "country": "US",
          "marketplace": "Shopify",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 24.99,
          "minimum_price": 18,
          "msrp": 29.99,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "MF1000-M1",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-US-SHO-MG0110-E-855e7e",
          "marketplace_sku_id": "MPSKU-US-SHO-MG0110-E-855e7e",
          "master_sku": "MG0110-E",
          "site_sku": "MG0110-E",
          "product_name": "Meat Shredder Claws",
          "category": "Small Kitchen Gadgets",
          "series": "MG0110",
          "variant_group": "MG0110",
          "variant_name": null,
          "company": "KM",
          "country": "US",
          "marketplace": "Shopify",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 29.99,
          "minimum_price": 15,
          "msrp": 35,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "MG0110-E",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-US-SHO-MO5600-B-ac5728",
          "marketplace_sku_id": "MPSKU-US-SHO-MO5600-B-ac5728",
          "master_sku": "MO5600-B",
          "site_sku": "MO5600-B",
          "product_name": "Epic One Multifunction Opener (Blue)",
          "category": "Manual Opener",
          "series": "MO5600",
          "variant_group": "MO5600",
          "variant_name": null,
          "company": "KM",
          "country": "US",
          "marketplace": "Shopify",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 24.99,
          "minimum_price": 16,
          "msrp": 29.99,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "MO5600-B",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-US-SHO-SP0650-RM-a81b29",
          "marketplace_sku_id": "MPSKU-US-SHO-SP0650-RM-a81b29",
          "master_sku": "SP0650-RM",
          "site_sku": "SP0650-RM",
          "product_name": "Extra Wide Silicone Brush Set (Metal Gray & Red)",
          "category": "Silicone Products",
          "series": "SP0650",
          "variant_group": "SP0650",
          "variant_name": null,
          "company": "KM",
          "country": "US",
          "marketplace": "Shopify",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 19.99,
          "minimum_price": 15.99,
          "msrp": 24.99,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "SP0650-RM",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-US-SHO-SP0750-M-eb2720",
          "marketplace_sku_id": "MPSKU-US-SHO-SP0750-M-eb2720",
          "master_sku": "SP0750-M",
          "site_sku": "SP0750-M",
          "product_name": "DuoEssentials Ladle and Cooking Spoon Set (Metal Gray)",
          "category": "Silicone Products",
          "series": "SP0750",
          "variant_group": "SP0750",
          "variant_name": null,
          "company": "KM",
          "country": "US",
          "marketplace": "Shopify",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 31.99,
          "minimum_price": 24,
          "msrp": 39,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "SP0750-M",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-US-SHO-SP3120-B-72d285",
          "marketplace_sku_id": "MPSKU-US-SHO-SP3120-B-72d285",
          "master_sku": "SP3120-B",
          "site_sku": "SP3120-B",
          "product_name": "WaltzGrip Silicone Brush Set (Blue)",
          "category": "Silicone Spatulas",
          "series": "SP3120",
          "variant_group": "SP3120",
          "variant_name": null,
          "company": "KM",
          "country": "US",
          "marketplace": "Shopify",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 17.99,
          "minimum_price": 15.99,
          "msrp": 22.99,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "SP3120-B",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-US-SHO-SP3210-B-5f0b1c",
          "marketplace_sku_id": "MPSKU-US-SHO-SP3210-B-5f0b1c",
          "master_sku": "SP3210-B",
          "site_sku": "SP3210-B",
          "product_name": "WaltzGrip Silicone Scraping Spatula (Blue)",
          "category": "Silicone Spatulas",
          "series": "SP3210",
          "variant_group": "SP3210",
          "variant_name": null,
          "company": "KM",
          "country": "US",
          "marketplace": "Shopify",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 16.99,
          "minimum_price": 13.5,
          "msrp": 20.99,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "SP3210-B",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-US-SHO-SP3320-B-03b606",
          "marketplace_sku_id": "MPSKU-US-SHO-SP3320-B-03b606",
          "master_sku": "SP3320-B",
          "site_sku": "SP3320-B",
          "product_name": "WaltzGrip Silicone Jar Spatula Set (Blue)",
          "category": "Silicone Spatulas",
          "series": "SP3320",
          "variant_group": "SP3320",
          "variant_name": null,
          "company": "KM",
          "country": "US",
          "marketplace": "Shopify",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 20.99,
          "minimum_price": 15,
          "msrp": 25.99,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "SP3320-B",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-US-SHO-SP3320-R-f878e2",
          "marketplace_sku_id": "MPSKU-US-SHO-SP3320-R-f878e2",
          "master_sku": "SP3320-R",
          "site_sku": "SP3320-R",
          "product_name": "WaltzGrip Silicone Jar Spatula Set (Red)",
          "category": "Silicone Spatulas",
          "series": "SP3320",
          "variant_group": "SP3320",
          "variant_name": null,
          "company": "KM",
          "country": "US",
          "marketplace": "Shopify",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 20.99,
          "minimum_price": 15,
          "msrp": 25.99,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "SP3320-R",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-US-SHO-SP3410-B-22493c",
          "marketplace_sku_id": "MPSKU-US-SHO-SP3410-B-22493c",
          "master_sku": "SP3410-B",
          "site_sku": "SP3410-B",
          "product_name": "WaltzGrip Silicone Pancake Turner (Blue)",
          "category": "Silicone Spatulas",
          "series": "SP3410",
          "variant_group": "SP3410",
          "variant_name": null,
          "company": "KM",
          "country": "US",
          "marketplace": "Shopify",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 18.99,
          "minimum_price": 17,
          "msrp": 23.99,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "SP3410-B",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-US-SHO-SP5020-B-b0fb0b",
          "marketplace_sku_id": "MPSKU-US-SHO-SP5020-B-b0fb0b",
          "master_sku": "SP5020-B",
          "site_sku": "SP5020-B",
          "product_name": "UltraShield Silicone Oven Mitts (Blue)",
          "category": "Silicone Products",
          "series": "SP5020",
          "variant_group": "SP5020",
          "variant_name": null,
          "company": "KM",
          "country": "US",
          "marketplace": "Shopify",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 19.99,
          "minimum_price": 17.99,
          "msrp": 24.99,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "SP5020-B",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-US-SHO-SP5120-M-925cf7",
          "marketplace_sku_id": "MPSKU-US-SHO-SP5120-M-925cf7",
          "master_sku": "SP5120-M",
          "site_sku": "SP5120-M",
          "product_name": "Silicone Pot Holders (Metal Gray)",
          "category": "Silicone Products",
          "series": "SP5120",
          "variant_group": "SP5120",
          "variant_name": null,
          "company": "KM",
          "country": "US",
          "marketplace": "Shopify",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 13.99,
          "minimum_price": 11.99,
          "msrp": 17.99,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "SP5120-M",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        }
      ]
    },
    {
      "company": "KM",
      "country": "US",
      "marketplace": "Target",
      "sourceState": "READY",
      "live": {
        "universe_rows": 19,
        "sampled_rows": 2,
        "counts": {
          "siteSkuCount": 19,
          "activeSiteSkuCount": 19,
          "phasingOutSiteSkuCount": 0,
          "inactiveSiteSkuCount": 0,
          "discontinuedSiteSkuCount": 0,
          "regionalMissingCount": 0,
          "pricingMissingCount": 0,
          "analysableSiteSkuCount": 19
        },
        "membership_in_scope": 19,
        "membership_excluded_by_status": 0,
        "status_distribution": {
          "active": 19,
          "phasing_out": 0,
          "inactive": 0,
          "discontinued": 0,
          "__unknown": 0
        },
        "pagination_total": 19,
        "category_option_count": 3,
        "series_option_count": 5,
        "findings": [],
        "refusals": []
      },
      "rows": [
        {
          "identity": "MSKU:MPSKU-US-TAR-GM3000-M1-285007",
          "marketplace_sku_id": "MPSKU-US-TAR-GM3000-M1-285007",
          "master_sku": "GM3000-M1",
          "site_sku": "GM3000-M1",
          "product_name": "FlipTastic Rechargeable Gravity Grinder (Metal Gray)",
          "category": "Grinders",
          "series": "GM3000",
          "variant_group": "GM3000",
          "variant_name": null,
          "company": "KM",
          "country": "US",
          "marketplace": "Target",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 39.99,
          "minimum_price": 38.7,
          "msrp": 49.98,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "GM3000-M1",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-US-TAR-MO5600-B-88f524",
          "marketplace_sku_id": "MPSKU-US-TAR-MO5600-B-88f524",
          "master_sku": "MO5600-B",
          "site_sku": "MO5600-B",
          "product_name": "Epic One Multifunction Opener (Blue)",
          "category": "Manual Opener",
          "series": "MO5600",
          "variant_group": "MO5600",
          "variant_name": null,
          "company": "KM",
          "country": "US",
          "marketplace": "Target",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 24.99,
          "minimum_price": 16,
          "msrp": 29.99,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "MO5600-B",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        }
      ]
    },
    {
      "company": "KM",
      "country": "US",
      "marketplace": "Walmart",
      "sourceState": "READY",
      "live": {
        "universe_rows": 64,
        "sampled_rows": 5,
        "counts": {
          "siteSkuCount": 64,
          "activeSiteSkuCount": 64,
          "phasingOutSiteSkuCount": 0,
          "inactiveSiteSkuCount": 0,
          "discontinuedSiteSkuCount": 0,
          "regionalMissingCount": 61,
          "pricingMissingCount": 0,
          "analysableSiteSkuCount": 3
        },
        "membership_in_scope": 64,
        "membership_excluded_by_status": 0,
        "status_distribution": {
          "active": 64,
          "phasing_out": 0,
          "inactive": 0,
          "discontinued": 0,
          "__unknown": 0
        },
        "pagination_total": 64,
        "category_option_count": 5,
        "series_option_count": 15,
        "findings": [],
        "refusals": []
      },
      "rows": [
        {
          "identity": "MSKU:MPSKU-US-WAL-CO1200-O-8d2e31",
          "marketplace_sku_id": "MPSKU-US-WAL-CO1200-O-8d2e31",
          "master_sku": "CO1200-O",
          "site_sku": "CO1200-O",
          "product_name": "Mini Electric Can Opener (Orange)",
          "category": "Electric Can Opener",
          "series": "CO1200",
          "variant_group": "CO1200",
          "variant_name": null,
          "company": "KM",
          "country": "US",
          "marketplace": "Walmart",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 24.99,
          "minimum_price": 20,
          "msrp": 30,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": null,
          "campaigns": [],
          "analysable": false,
          "source_status": [
            "REGIONAL_DETAILS_MISSING"
          ],
          "missing_reasons": [
            "REGIONAL_DETAILS_MISSING"
          ],
          "findings": [
            {
              "code": "CONTRACT_MISMATCH",
              "detail": "sku_regional_details rows exist for this SKU on other sites and are NOT used"
            }
          ]
        },
        {
          "identity": "MSKU:MPSKU-US-WAL-CO1205-R-b57df9",
          "marketplace_sku_id": "MPSKU-US-WAL-CO1205-R-b57df9",
          "master_sku": "CO1205-R",
          "site_sku": "CO1205-R",
          "product_name": "Mini Electric Can Opener (Red) - Walmart Exclusive",
          "category": "Electric Can Opener",
          "series": "CO1205",
          "variant_group": "CO1205",
          "variant_name": null,
          "company": "KM",
          "country": "US",
          "marketplace": "Walmart",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 50,
          "minimum_price": null,
          "msrp": null,
          "product_image": null,
          "regional": null,
          "campaigns": [],
          "analysable": false,
          "source_status": [
            "REGIONAL_DETAILS_MISSING",
            "IMAGE_SOURCE_MISSING"
          ],
          "missing_reasons": [
            "REGIONAL_DETAILS_MISSING",
            "IMAGE_SOURCE_MISSING"
          ],
          "findings": [
            {
              "code": "CONTRACT_MISMATCH",
              "detail": "sku_regional_details rows exist for this SKU on other sites and are NOT used"
            }
          ]
        },
        {
          "identity": "MSKU:MPSKU-US-WAL-MO5600-B-01ad5f",
          "marketplace_sku_id": "MPSKU-US-WAL-MO5600-B-01ad5f",
          "master_sku": "MO5600-B",
          "site_sku": "MO5600-B",
          "product_name": "Epic One Multifunction Opener (Blue)",
          "category": "Manual Opener",
          "series": "MO5600",
          "variant_group": "MO5600",
          "variant_name": null,
          "company": "KM",
          "country": "US",
          "marketplace": "Walmart",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 24.99,
          "minimum_price": 16,
          "msrp": 29.99,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": null,
          "campaigns": [],
          "analysable": false,
          "source_status": [
            "REGIONAL_DETAILS_MISSING"
          ],
          "missing_reasons": [
            "REGIONAL_DETAILS_MISSING"
          ],
          "findings": [
            {
              "code": "CONTRACT_MISMATCH",
              "detail": "sku_regional_details rows exist for this SKU on other sites and are NOT used"
            }
          ]
        },
        {
          "identity": "MSKU:MPSKU-US-WAL-SP3320-R-6b4228",
          "marketplace_sku_id": "MPSKU-US-WAL-SP3320-R-6b4228",
          "master_sku": "SP3320-R",
          "site_sku": "SP3320-R",
          "product_name": "WaltzGrip Silicone Jar Spatula Set (Red)",
          "category": "Silicone Spatulas",
          "series": "SP3320",
          "variant_group": "SP3320",
          "variant_name": null,
          "company": "KM",
          "country": "US",
          "marketplace": "Walmart",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 20.99,
          "minimum_price": 15,
          "msrp": 25.99,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": null,
          "campaigns": [],
          "analysable": false,
          "source_status": [
            "REGIONAL_DETAILS_MISSING"
          ],
          "missing_reasons": [
            "REGIONAL_DETAILS_MISSING"
          ],
          "findings": [
            {
              "code": "CONTRACT_MISMATCH",
              "detail": "sku_regional_details rows exist for this SKU on other sites and are NOT used"
            }
          ]
        },
        {
          "identity": "MSKU:MPSKU-US-WAL-SP5051-US-779afa",
          "marketplace_sku_id": "MPSKU-US-WAL-SP5051-US-779afa",
          "master_sku": "SP5051-US",
          "site_sku": "SP5051-US",
          "product_name": "UltraShield Silicone Oven Mitts (US Flag)",
          "category": "Silicone Products",
          "series": "SP5020",
          "variant_group": "SP5020",
          "variant_name": null,
          "company": "KM",
          "country": "US",
          "marketplace": "Walmart",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 26.99,
          "minimum_price": 20.99,
          "msrp": 34,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": null,
          "campaigns": [],
          "analysable": false,
          "source_status": [
            "REGIONAL_DETAILS_MISSING"
          ],
          "missing_reasons": [
            "REGIONAL_DETAILS_MISSING"
          ],
          "findings": [
            {
              "code": "CONTRACT_MISMATCH",
              "detail": "sku_regional_details rows exist for this SKU on other sites and are NOT used"
            }
          ]
        }
      ]
    },
    {
      "company": "ResTW",
      "country": "AU",
      "marketplace": "Amazon",
      "sourceState": "READY",
      "live": {
        "universe_rows": 35,
        "sampled_rows": 3,
        "counts": {
          "siteSkuCount": 35,
          "activeSiteSkuCount": 35,
          "phasingOutSiteSkuCount": 0,
          "inactiveSiteSkuCount": 0,
          "discontinuedSiteSkuCount": 0,
          "regionalMissingCount": 0,
          "pricingMissingCount": 0,
          "analysableSiteSkuCount": 35
        },
        "membership_in_scope": 35,
        "membership_excluded_by_status": 0,
        "status_distribution": {
          "active": 35,
          "phasing_out": 0,
          "inactive": 0,
          "discontinued": 0,
          "__unknown": 0
        },
        "pagination_total": 35,
        "category_option_count": 4,
        "series_option_count": 13,
        "findings": [],
        "refusals": []
      },
      "rows": [
        {
          "identity": "MSKU:MPSKU-AU-AMA-CO0560-2b53a5",
          "marketplace_sku_id": "MPSKU-AU-AMA-CO0560-2b53a5",
          "master_sku": "CO0560",
          "site_sku": "CO0560",
          "product_name": "Orbit One replacement Blade Set",
          "category": "Electric Can Opener",
          "series": "CO0560",
          "variant_group": "CO0560",
          "variant_name": null,
          "company": "ResTW",
          "country": "AU",
          "marketplace": "Amazon",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "AUD",
          "regular_price": 19.99,
          "minimum_price": 16.99,
          "msrp": 25,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "CO0560",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-AU-AMA-CO2300-R-4b5e41",
          "marketplace_sku_id": "MPSKU-AU-AMA-CO2300-R-4b5e41",
          "master_sku": "CO2300-R",
          "site_sku": "CO2300-R",
          "product_name": "One-To-Go Electric Can Opener (Red)",
          "category": "Electric Can Opener",
          "series": "CO2300",
          "variant_group": "CO2300",
          "variant_name": null,
          "company": "ResTW",
          "country": "AU",
          "marketplace": "Amazon",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "AUD",
          "regular_price": 34.99,
          "minimum_price": 31,
          "msrp": 45,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "CO2300-R",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-AU-AMA-SP3410-R-16d856",
          "marketplace_sku_id": "MPSKU-AU-AMA-SP3410-R-16d856",
          "master_sku": "SP3410-R",
          "site_sku": "SP3410-R",
          "product_name": "WaltzGrip Silicone Pancake Turner (Red)",
          "category": "Silicone Spatulas",
          "series": "SP3410",
          "variant_group": "SP3410",
          "variant_name": null,
          "company": "ResTW",
          "country": "AU",
          "marketplace": "Amazon",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "AUD",
          "regular_price": 18.99,
          "minimum_price": 17,
          "msrp": 23.99,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "SP3410-R",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        }
      ]
    },
    {
      "company": "ResTW",
      "country": "CA",
      "marketplace": "Amazon",
      "sourceState": "READY",
      "live": {
        "universe_rows": 51,
        "sampled_rows": 4,
        "counts": {
          "siteSkuCount": 51,
          "activeSiteSkuCount": 51,
          "phasingOutSiteSkuCount": 0,
          "inactiveSiteSkuCount": 0,
          "discontinuedSiteSkuCount": 0,
          "regionalMissingCount": 0,
          "pricingMissingCount": 0,
          "analysableSiteSkuCount": 51
        },
        "membership_in_scope": 51,
        "membership_excluded_by_status": 0,
        "status_distribution": {
          "active": 51,
          "phasing_out": 0,
          "inactive": 0,
          "discontinued": 0,
          "__unknown": 0
        },
        "pagination_total": 51,
        "category_option_count": 5,
        "series_option_count": 16,
        "findings": [],
        "refusals": []
      },
      "rows": [
        {
          "identity": "MSKU:MPSKU-CA-AMA-CO1200-B-8d414b",
          "marketplace_sku_id": "MPSKU-CA-AMA-CO1200-B-8d414b",
          "master_sku": "CO1200-B",
          "site_sku": "CO1200-B",
          "product_name": "Mini Electric Can Opener (Blue)",
          "category": "Electric Can Opener",
          "series": "CO1200",
          "variant_group": "CO1200",
          "variant_name": null,
          "company": "ResTW",
          "country": "CA",
          "marketplace": "Amazon",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "CAD",
          "regular_price": 24.99,
          "minimum_price": 20,
          "msrp": 30,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "CO1200-B",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-CA-AMA-CO5600-W-b581f9",
          "marketplace_sku_id": "MPSKU-CA-AMA-CO5600-W-b581f9",
          "master_sku": "CO5600-W",
          "site_sku": "CO5600-W",
          "product_name": "Orbit One Rechargeable Can Opener (White)",
          "category": "Electric Can Opener",
          "series": "CO5600",
          "variant_group": "CO5600",
          "variant_name": null,
          "company": "ResTW",
          "country": "CA",
          "marketplace": "Amazon",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "CAD",
          "regular_price": 49.99,
          "minimum_price": 40,
          "msrp": 59.99,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "CO5600-W",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-CA-AMA-SP0650-RM-415bbd",
          "marketplace_sku_id": "MPSKU-CA-AMA-SP0650-RM-415bbd",
          "master_sku": "SP0650-RM",
          "site_sku": "SP0650-RM",
          "product_name": "Extra Wide Silicone Brush Set (Metal Gray & Red)",
          "category": "Silicone Products",
          "series": "SP0650",
          "variant_group": "SP0650",
          "variant_name": null,
          "company": "ResTW",
          "country": "CA",
          "marketplace": "Amazon",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "CAD",
          "regular_price": 19.99,
          "minimum_price": 15.99,
          "msrp": 24.99,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "SP0650-RM",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-CA-AMA-SP5020-M-c3ea0c",
          "marketplace_sku_id": "MPSKU-CA-AMA-SP5020-M-c3ea0c",
          "master_sku": "SP5020-M",
          "site_sku": "SP5020-M",
          "product_name": "UltraShield Silicone Oven Mitts (Metal Gray)",
          "category": "Silicone Products",
          "series": "SP5020",
          "variant_group": "SP5020",
          "variant_name": null,
          "company": "ResTW",
          "country": "CA",
          "marketplace": "Amazon",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "CAD",
          "regular_price": 19.99,
          "minimum_price": 17.99,
          "msrp": 24.99,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "SP5020-M",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        }
      ]
    },
    {
      "company": "ResTW",
      "country": "EU",
      "marketplace": "Amazon",
      "sourceState": "READY",
      "live": {
        "universe_rows": 39,
        "sampled_rows": 3,
        "counts": {
          "siteSkuCount": 39,
          "activeSiteSkuCount": 39,
          "phasingOutSiteSkuCount": 0,
          "inactiveSiteSkuCount": 0,
          "discontinuedSiteSkuCount": 0,
          "regionalMissingCount": 0,
          "pricingMissingCount": 0,
          "analysableSiteSkuCount": 39
        },
        "membership_in_scope": 39,
        "membership_excluded_by_status": 0,
        "status_distribution": {
          "active": 39,
          "phasing_out": 0,
          "inactive": 0,
          "discontinued": 0,
          "__unknown": 0
        },
        "pagination_total": 39,
        "category_option_count": 4,
        "series_option_count": 13,
        "findings": [],
        "refusals": []
      },
      "rows": [
        {
          "identity": "MSKU:MPSKU-EU-AMA-CO2100-R1-30d375",
          "marketplace_sku_id": "MPSKU-EU-AMA-CO2100-R1-30d375",
          "master_sku": "CO2100-R1",
          "site_sku": "CO2100-R1",
          "product_name": "One Touch Electric Can Opener (Red)",
          "category": "Electric Can Opener",
          "series": "CO2100",
          "variant_group": "CO2100",
          "variant_name": null,
          "company": "ResTW",
          "country": "EU",
          "marketplace": "Amazon",
          "marketplace_sku_status": "Active",
          "lifecycle": "Phasing Out",
          "currency": "EUR",
          "regular_price": 34.99,
          "minimum_price": 29,
          "msrp": 40,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "CO2100-R1",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-EU-AMA-SP3320-M-c213fe",
          "marketplace_sku_id": "MPSKU-EU-AMA-SP3320-M-c213fe",
          "master_sku": "SP3320-M",
          "site_sku": "SP3320-M",
          "product_name": "WaltzGrip Silicone Jar Spatula Set (Metal Gray)",
          "category": "Silicone Spatulas",
          "series": "SP3320",
          "variant_group": "SP3320",
          "variant_name": null,
          "company": "ResTW",
          "country": "EU",
          "marketplace": "Amazon",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "EUR",
          "regular_price": 20.99,
          "minimum_price": 15,
          "msrp": 25.99,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "SP3320-M",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-EU-AMA-SP5120-M-956284",
          "marketplace_sku_id": "MPSKU-EU-AMA-SP5120-M-956284",
          "master_sku": "SP5120-M",
          "site_sku": "SP5120-M",
          "product_name": "Silicone Pot Holders (Metal Gray)",
          "category": "Silicone Products",
          "series": "SP5120",
          "variant_group": "SP5120",
          "variant_name": null,
          "company": "ResTW",
          "country": "EU",
          "marketplace": "Amazon",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "EUR",
          "regular_price": 13.99,
          "minimum_price": 11.99,
          "msrp": 17.99,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "SP5120-M",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        }
      ]
    },
    {
      "company": "ResTW",
      "country": "JP",
      "marketplace": "Amazon",
      "sourceState": "READY",
      "live": {
        "universe_rows": 26,
        "sampled_rows": 3,
        "counts": {
          "siteSkuCount": 26,
          "activeSiteSkuCount": 26,
          "phasingOutSiteSkuCount": 0,
          "inactiveSiteSkuCount": 0,
          "discontinuedSiteSkuCount": 0,
          "regionalMissingCount": 0,
          "pricingMissingCount": 0,
          "analysableSiteSkuCount": 23
        },
        "membership_in_scope": 26,
        "membership_excluded_by_status": 0,
        "status_distribution": {
          "active": 26,
          "phasing_out": 0,
          "inactive": 0,
          "discontinued": 0,
          "__unknown": 0
        },
        "pagination_total": 26,
        "category_option_count": 5,
        "series_option_count": 7,
        "findings": [],
        "refusals": []
      },
      "rows": [
        {
          "identity": "MSKU:MPSKU-JP-AMA-CO1101-R-7324a7",
          "marketplace_sku_id": "MPSKU-JP-AMA-CO1101-R-7324a7",
          "master_sku": "CO1101-R",
          "site_sku": "CO1101-R",
          "product_name": "Auto Electric Can Opener 1.0 (Red) - JP",
          "category": "Electric Can Opener",
          "series": "CO1100",
          "variant_group": "CO1100",
          "variant_name": null,
          "company": "ResTW",
          "country": "JP",
          "marketplace": "Amazon",
          "marketplace_sku_status": "Active",
          "lifecycle": "Phasing Out",
          "currency": "JPY",
          "regular_price": null,
          "minimum_price": null,
          "msrp": null,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "CO1101-R",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": false,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-JP-AMA-CO1200-B-00b3da",
          "marketplace_sku_id": "MPSKU-JP-AMA-CO1200-B-00b3da",
          "master_sku": "CO1200-B",
          "site_sku": "CO1200-B",
          "product_name": "Mini Electric Can Opener (Blue)",
          "category": "Electric Can Opener",
          "series": "CO1200",
          "variant_group": "CO1200",
          "variant_name": null,
          "company": "ResTW",
          "country": "JP",
          "marketplace": "Amazon",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "JPY",
          "regular_price": 24.99,
          "minimum_price": 20,
          "msrp": 30,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "CO1200-B",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-JP-AMA-SP3120-R-ee770d",
          "marketplace_sku_id": "MPSKU-JP-AMA-SP3120-R-ee770d",
          "master_sku": "SP3120-R",
          "site_sku": "SP3120-R",
          "product_name": "WaltzGrip Silicone Brush Set (Red)",
          "category": "Silicone Spatulas",
          "series": "SP3120",
          "variant_group": "SP3120",
          "variant_name": null,
          "company": "ResTW",
          "country": "JP",
          "marketplace": "Amazon",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "JPY",
          "regular_price": 17.99,
          "minimum_price": 15.99,
          "msrp": 22.99,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "SP3120-R",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        }
      ]
    },
    {
      "company": "ResTW",
      "country": "UK",
      "marketplace": "Amazon",
      "sourceState": "READY",
      "live": {
        "universe_rows": 42,
        "sampled_rows": 3,
        "counts": {
          "siteSkuCount": 42,
          "activeSiteSkuCount": 42,
          "phasingOutSiteSkuCount": 0,
          "inactiveSiteSkuCount": 0,
          "discontinuedSiteSkuCount": 0,
          "regionalMissingCount": 0,
          "pricingMissingCount": 0,
          "analysableSiteSkuCount": 42
        },
        "membership_in_scope": 42,
        "membership_excluded_by_status": 0,
        "status_distribution": {
          "active": 42,
          "phasing_out": 0,
          "inactive": 0,
          "discontinued": 0,
          "__unknown": 0
        },
        "pagination_total": 42,
        "category_option_count": 4,
        "series_option_count": 13,
        "findings": [],
        "refusals": []
      },
      "rows": [
        {
          "identity": "MSKU:MPSKU-UK-AMA-CO2300-W-3c8a7e",
          "marketplace_sku_id": "MPSKU-UK-AMA-CO2300-W-3c8a7e",
          "master_sku": "CO2300-W",
          "site_sku": "CO2300-W",
          "product_name": "One-To-Go Electric Can Opener (White)",
          "category": "Electric Can Opener",
          "series": "CO2300",
          "variant_group": "CO2300",
          "variant_name": null,
          "company": "ResTW",
          "country": "UK",
          "marketplace": "Amazon",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "GBP",
          "regular_price": 34.99,
          "minimum_price": 31,
          "msrp": 45,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "CO2300-W",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-UK-AMA-SP3210-T-1c5957",
          "marketplace_sku_id": "MPSKU-UK-AMA-SP3210-T-1c5957",
          "master_sku": "SP3210-T",
          "site_sku": "SP3210-T",
          "product_name": "WaltzGrip Silicone Scraping Spatula (Teal)",
          "category": "Silicone Spatulas",
          "series": "SP3210",
          "variant_group": "SP3210",
          "variant_name": null,
          "company": "ResTW",
          "country": "UK",
          "marketplace": "Amazon",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "GBP",
          "regular_price": 16.99,
          "minimum_price": 13.5,
          "msrp": 20.99,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "SP3210-T",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-UK-AMA-SP5120-M-112f0a",
          "marketplace_sku_id": "MPSKU-UK-AMA-SP5120-M-112f0a",
          "master_sku": "SP5120-M",
          "site_sku": "SP5120-M",
          "product_name": "Silicone Pot Holders (Metal Gray)",
          "category": "Silicone Products",
          "series": "SP5120",
          "variant_group": "SP5120",
          "variant_name": null,
          "company": "ResTW",
          "country": "UK",
          "marketplace": "Amazon",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "GBP",
          "regular_price": 13.99,
          "minimum_price": 11.99,
          "msrp": 17.99,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "SP5120-M",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        }
      ]
    },
    {
      "company": "ResUS",
      "country": "US",
      "marketplace": "Amazon",
      "sourceState": "READY",
      "live": {
        "universe_rows": 100,
        "sampled_rows": 7,
        "counts": {
          "siteSkuCount": 100,
          "activeSiteSkuCount": 100,
          "phasingOutSiteSkuCount": 0,
          "inactiveSiteSkuCount": 0,
          "discontinuedSiteSkuCount": 0,
          "regionalMissingCount": 0,
          "pricingMissingCount": 0,
          "analysableSiteSkuCount": 100
        },
        "membership_in_scope": 100,
        "membership_excluded_by_status": 0,
        "status_distribution": {
          "active": 100,
          "phasing_out": 0,
          "inactive": 0,
          "discontinued": 0,
          "__unknown": 0
        },
        "pagination_total": 100,
        "category_option_count": 10,
        "series_option_count": 24,
        "findings": [],
        "refusals": []
      },
      "rows": [
        {
          "identity": "MSKU:MPSKU-US-AMA-CO1100-T-f738bd",
          "marketplace_sku_id": "MPSKU-US-AMA-CO1100-T-f738bd",
          "master_sku": "CO1100-T",
          "site_sku": "CO1100-T",
          "product_name": "Auto Electric Can Opener 1.0 (Teal)",
          "category": "Electric Can Opener",
          "series": "CO1100",
          "variant_group": "CO1100",
          "variant_name": null,
          "company": "ResUS",
          "country": "US",
          "marketplace": "Amazon",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 29.99,
          "minimum_price": 21,
          "msrp": 35,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "CO1100-T",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-US-AMA-CO2102-FA-52bef5",
          "marketplace_sku_id": "MPSKU-US-AMA-CO2102-FA-52bef5",
          "master_sku": "CO2102-FA",
          "site_sku": "CO2102-FA",
          "product_name": "One Touch Electric Can Opener (Avocado)",
          "category": "Electric Can Opener",
          "series": "CO2100",
          "variant_group": "CO2100",
          "variant_name": null,
          "company": "ResUS",
          "country": "US",
          "marketplace": "Amazon",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 36.99,
          "minimum_price": null,
          "msrp": 46,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "CO2102-FA",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-US-AMA-CO2300-Y-d47803",
          "marketplace_sku_id": "MPSKU-US-AMA-CO2300-Y-d47803",
          "master_sku": "CO2300-Y",
          "site_sku": "CO2300-Y",
          "product_name": "One-To-Go Electric Can Opener (Yellow)",
          "category": "Electric Can Opener",
          "series": "CO2300",
          "variant_group": "CO2300",
          "variant_name": null,
          "company": "ResUS",
          "country": "US",
          "marketplace": "Amazon",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 34.99,
          "minimum_price": 31,
          "msrp": 45,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "CO2300-Y",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [
            {
              "status": "active",
              "line_status": "active",
              "start_date": "Sat Jul 25 2026 00:00:00 GMT+0800 (Taiwan Standard Time)",
              "end_date": "Thu Jul 30 2026 00:00:00 GMT+0800 (Taiwan Standard Time)",
              "promo_price": 27.99,
              "regular_price_snapshot": 34.99,
              "price_units": null,
              "discount_percent": 20
            }
          ],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-US-AMA-CO5600-Z-2bdb67",
          "marketplace_sku_id": "MPSKU-US-AMA-CO5600-Z-2bdb67",
          "master_sku": "CO5600-Z",
          "site_sku": "CO5600-Z",
          "product_name": "Orbit One Rechargeable Can Opener (Black)",
          "category": "Electric Can Opener",
          "series": "CO5600",
          "variant_group": "CO5600",
          "variant_name": null,
          "company": "ResUS",
          "country": "US",
          "marketplace": "Amazon",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 49.99,
          "minimum_price": 40,
          "msrp": 59.99,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "CO5600-Z",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-US-AMA-GM3061-WW-1a30d2",
          "marketplace_sku_id": "MPSKU-US-AMA-GM3061-WW-1a30d2",
          "master_sku": "GM3061-WW",
          "site_sku": "GM3061-WW",
          "product_name": "FlipTastic Rechargeable Gravity Grinder Set (White)",
          "category": "Grinders",
          "series": "GM3060",
          "variant_group": "GM3060",
          "variant_name": null,
          "company": "ResUS",
          "country": "US",
          "marketplace": "Amazon",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 69.99,
          "minimum_price": 59.99,
          "msrp": 86.99,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "GM3061-WW",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-US-AMA-SP0750-T-05883b",
          "marketplace_sku_id": "MPSKU-US-AMA-SP0750-T-05883b",
          "master_sku": "SP0750-T",
          "site_sku": "SP0750-T",
          "product_name": "DuoEssentials Ladle and Cooking Spoon Set (Teal)",
          "category": "Silicone Products",
          "series": "SP0750",
          "variant_group": "SP0750",
          "variant_name": null,
          "company": "ResUS",
          "country": "US",
          "marketplace": "Amazon",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 31.99,
          "minimum_price": 24,
          "msrp": 39,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "SP0750-T",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-US-AMA-SP3410-M-5cd29b",
          "marketplace_sku_id": "MPSKU-US-AMA-SP3410-M-5cd29b",
          "master_sku": "SP3410-M",
          "site_sku": "SP3410-M",
          "product_name": "WaltzGrip Silicone Pancake Turner (Metal Gray)",
          "category": "Silicone Spatulas",
          "series": "SP3410",
          "variant_group": "SP3410",
          "variant_name": null,
          "company": "ResUS",
          "country": "US",
          "marketplace": "Amazon",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 18.99,
          "minimum_price": 17,
          "msrp": 23.99,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "SP3410-M",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        }
      ]
    },
    {
      "company": "ResUS",
      "country": "US",
      "marketplace": "Walmart",
      "sourceState": "READY",
      "live": {
        "universe_rows": 18,
        "sampled_rows": 3,
        "counts": {
          "siteSkuCount": 18,
          "activeSiteSkuCount": 18,
          "phasingOutSiteSkuCount": 0,
          "inactiveSiteSkuCount": 0,
          "discontinuedSiteSkuCount": 0,
          "regionalMissingCount": 0,
          "pricingMissingCount": 0,
          "analysableSiteSkuCount": 15
        },
        "membership_in_scope": 18,
        "membership_excluded_by_status": 0,
        "status_distribution": {
          "active": 18,
          "phasing_out": 0,
          "inactive": 0,
          "discontinued": 0,
          "__unknown": 0
        },
        "pagination_total": 18,
        "category_option_count": 4,
        "series_option_count": 9,
        "findings": [],
        "refusals": []
      },
      "rows": [
        {
          "identity": "MSKU:MPSKU-US-WAL-CO1100-S-7e2e53",
          "marketplace_sku_id": "MPSKU-US-WAL-CO1100-S-7e2e53",
          "master_sku": "CO1100-S",
          "site_sku": "CO1100-S",
          "product_name": "Auto Electric Can Opener 1.0 (Sky Blue)",
          "category": "Electric Can Opener",
          "series": "CO1100",
          "variant_group": "CO1100",
          "variant_name": null,
          "company": "ResUS",
          "country": "US",
          "marketplace": "Walmart",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 29.99,
          "minimum_price": 21,
          "msrp": 35,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "CO1100-S",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-US-WAL-CO1205-B-ae9829",
          "marketplace_sku_id": "MPSKU-US-WAL-CO1205-B-ae9829",
          "master_sku": "CO1205-B",
          "site_sku": "CO1205-B",
          "product_name": "Mini Electric Can Opener (Blue) - Walmart Exclusive",
          "category": "Electric Can Opener",
          "series": "CO1205",
          "variant_group": "CO1205",
          "variant_name": null,
          "company": "ResUS",
          "country": "US",
          "marketplace": "Walmart",
          "marketplace_sku_status": "Active",
          "lifecycle": "Running in the Market",
          "currency": "USD",
          "regular_price": 50,
          "minimum_price": null,
          "msrp": null,
          "product_image": null,
          "regional": {
            "regional_detail_id": null,
            "site_sku": "CO1205-B",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": true,
          "source_status": [
            "IMAGE_SOURCE_MISSING"
          ],
          "missing_reasons": [
            "IMAGE_SOURCE_MISSING"
          ],
          "findings": []
        },
        {
          "identity": "MSKU:MPSKU-US-WAL-GM1100-P-64df6c",
          "marketplace_sku_id": "MPSKU-US-WAL-GM1100-P-64df6c",
          "master_sku": "GM1100-P",
          "site_sku": "GM1100-P",
          "product_name": "Electric Salt or Pepper Grinder (Purple)",
          "category": "Grinders",
          "series": "GM1100",
          "variant_group": "GM1100",
          "variant_name": null,
          "company": "ResUS",
          "country": "US",
          "marketplace": "Walmart",
          "marketplace_sku_status": "Active",
          "lifecycle": "Phasing Out",
          "currency": "USD",
          "regular_price": null,
          "minimum_price": null,
          "msrp": null,
          "product_image": "REDACTED_NON_ABSOLUTE_IMAGE_REFERENCE",
          "regional": {
            "regional_detail_id": null,
            "site_sku": "GM1100-P",
            "marketplace_product_id": null,
            "product_url": null,
            "packaging_regulation": null,
            "language": null
          },
          "campaigns": [],
          "analysable": false,
          "source_status": [],
          "missing_reasons": [],
          "findings": []
        }
      ]
    }
  ];

  /* THE KEY CONVENTION IS THE REPLAY HARNESS'S, CASE AND ALL. _p1b8c-capture.js keys on
     company|country|marketplace verbatim and _p1b8c-replay.js looks the site up by that same string.
     Lower-casing it here made every live site miss with
     "P1B8C REPLAY HAS NO CAPTURE FOR SITE: KM|US|Shopify" — a harness contract, not a data fault. */
  C.siteKey = function (s) {
    return s.company + '|' + s.country + '|' + s.marketplace;
  };

  function rowsFor(site) {
    var hit = null;
    C.SITES.forEach(function (s) { if (C.siteKey(s) === C.siteKey(site)) hit = s; });
    return hit ? hit.rows : [];
  }
  C.rowsFor = rowsFor;
  C.siteRecord = function (site) {
    var hit = null;
    C.SITES.forEach(function (s) { if (C.siteKey(s) === C.siteKey(site)) hit = s; });
    return hit;
  };

  /* OPTIONS ARE RECOMPUTED FROM THE ROWS THAT ARE ACTUALLY CARRIED, and that is deliberate. The live
     run reported the site's whole option set — ten categories over 101 rows for KM/US/Shopify — and
     shipping those beside 27 rows would offer a menu whose counts no row supports. The live option
     counts are kept in `live` and asserted there. */
  function filterOptions(rows) {
    function opts(field) {
      var seen = {};
      rows.forEach(function (r) {
        var v = r[field];
        if (v === null || v === undefined || v === '') return;
        if (!seen[v]) seen[v] = { value: v, siteSkuCount: 0, analysableSiteSkuCount: 0 };
        seen[v].siteSkuCount++;
        if (r.analysable) seen[v].analysableSiteSkuCount++;
      });
      return Object.keys(seen).sort().map(function (k) { return seen[k]; });
    }
    return { categories: opts('category'), series: opts('series') };
  }

  /** The workspace envelope for one site, exactly as the accessor will receive it off the wire. */
  C.workspaceEnvelope = function (site) {
    var rec = C.siteRecord(site);
    var rows = rec ? rec.rows : [];
    var analysable = 0, regionalMissing = 0, pricingMissing = 0, findings = [];
    rows.forEach(function (x) {
      if (x.analysable) analysable++;
      if (x.regional === null) regionalMissing++;
      if (x.regular_price === null || x.regular_price === undefined) pricingMissing++;
      (x.findings || []).forEach(function (f) { findings.push(f); });
    });
    var state = rows.length === 0 ? 'SOURCE_EMPTY' : (rec ? rec.sourceState : 'READY');
    return {
      success: true,
      data: {
        sourceState: state,
        scope: { company: site.company, country: site.country, marketplace: site.marketplace },
        filtersApplied: { category: null, series: null, status: ['active', 'phasing_out'] },
        normalizedRows: rows,
        counts: {
          siteSkuCount: rows.length,
          analysableSiteSkuCount: analysable,
          regionalMissingCount: regionalMissing,
          pricingMissingCount: pricingMissing
        },
        filterOptions: filterOptions(rows),
        pagination: { total: rows.length, limit: 1000, nextCursor: null },
        membership: {
          identity_authority: 'marketplace_skus (company + country + marketplace)',
          in_scope_before_status_filter: rows.length,
          excluded_by_status: 0,
          status_distribution: { active: rows.length, phasing_out: 0 }
        },
        analysis_permitted: state === 'READY',
        findings: findings,
        refusals: [],
        schema: {
          contract_version: C.CONTRACT_VERSION,
          action: C.ACTION,
          build: C.HANDLER_BUILD,
          read_at: '2026-09-12T10:39:14.628Z',
          read_at_is: 'WHEN_THE_SERVER_READ_THE_TABLES',
          source_modified_at: null,
          table: null
        }
      },
      meta: {
        apiVersion: '1', source: 'workspace', workspace: 'productPricing',
        build: C.HANDLER_BUILD, read_only: true, db_writes: 0, cached: false,
        tablesRead: 4, dbOpened: true, refused: false,
        action: C.ACTION
      },
      errors: []
    };
  };

  /* THE SCOPE LADDER IS THE ONE PLACE THE WHOLE UNIVERSE IS TOLD THE TRUTH. `marketplace_sku_count`
     is the SITE's real row count (101, 19, 64, …), not its share of the sample, because that is what
     the live siteUniverse read returns and what the ladder is for. */
  C.universeEnvelope = function () {
    var companies = [], byCompany = {}, byCountry = {};
    var sites = C.SITES.map(function (s) {
      if (companies.indexOf(s.company) < 0) companies.push(s.company);
      byCompany[s.company] = byCompany[s.company] || [];
      if (byCompany[s.company].indexOf(s.country) < 0) byCompany[s.company].push(s.country);
      var mk = s.company + '|' + s.country;
      byCountry[mk] = byCountry[mk] || [];
      if (byCountry[mk].indexOf(s.marketplace) < 0) byCountry[mk].push(s.marketplace);
      return {
        company: s.company, country: s.country, marketplace: s.marketplace,
        marketplace_sku_count: s.live.universe_rows, selectable: s.live.universe_rows > 0,
        statuses: { active: s.live.universe_rows, phasing_out: 0 }
      };
    });
    return {
      success: true,
      data: {
        sourceState: 'READY',
        sites: sites,
        site_count: sites.length,
        hierarchy: { companies: companies.sort(), countries_by_company: byCompany,
          marketplaces_by_country: byCountry },
        identity_authority: 'marketplace_skus (company + country + marketplace)',
        identity_normalization: 'trim and case-fold for comparison; the RAW value is what is published',
        excluded: { blank_company_rows: 0, blank_country_rows: 0, blank_marketplace_rows: 0,
          blank_identity_rows: 0, blank_marketplace_sku_id_rows: 0, unknown_status_rows: 0 },
        findings: [],
        refusals: [],
        completeness: { rows_examined: C.UNIVERSE_TOTAL_ROWS, capped: false, cap: 50000,
          is_whole_universe: true },
        schema: { contract_version: C.UNIVERSE_CONTRACT_VERSION,
          action: 'productPricing.siteUniverse.get', build: C.HANDLER_BUILD,
          read_at: '2026-09-12T10:39:14.628Z', table: null }
      },
      meta: {
        apiVersion: '1', source: 'workspace', workspace: 'productPricing',
        build: C.HANDLER_BUILD, read_only: true, db_writes: 0, cached: false,
        tablesRead: 1, dbOpened: true, refused: false,
        action: 'productPricing.siteUniverse.get'
      },
      errors: []
    };
  };

  C.workspaces = function () {
    var out = {};
    C.SITES.forEach(function (s) { out[C.siteKey(s)] = C.workspaceEnvelope(s); });
    return out;
  };

  C.allRows = function () {
    var out = [];
    C.SITES.forEach(function (s) { s.rows.forEach(function (r) { out.push(r); }); });
    return out;
  };

  /** Identity only, so a suite run, a screenshot and a report can name the same bytes. */
  C.fingerprint = function (value) {
    var s = JSON.stringify(value === undefined
      ? { u: C.universeEnvelope(), w: C.workspaces() } : value);
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var i = 0; i < s.length; i++) {
      h1 = ((h1 ^ s.charCodeAt(i)) >>> 0) * 16777619 >>> 0;
      h2 = ((h2 + s.charCodeAt(i) * (i % 31 + 1)) >>> 0) * 2246822519 >>> 0;
    }
    return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
  };

  /** The fields §4 removes, as a list the suite runs rather than a paragraph it trusts. */
  C.MUST_BE_ABSENT_OR_NULL = ['product_url', 'regional_detail_id', 'marketplace_product_id',
    'spreadsheet_id', 'spreadsheetId', 'script_id', 'scriptId', 'deployment_id', 'deploymentId',
    'endpoint', 'url', 'token', 'email', 'actor', 'requestId', 'request_url', 'sheet_name',
    'sheetName', 'caller_probe', 'pricing_id', 'campaign_id', 'campaign_sku_line_id',
    'campaign_name', 'created_by', 'updated_by'];

  return C;
}());

if (typeof module !== 'undefined' && module.exports) { module.exports = P1B8C_R2_LIVE; }
if (typeof window !== 'undefined') { window.P1B8C_R2_LIVE = P1B8C_R2_LIVE; }
