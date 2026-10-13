/**
 * ==================================================================================================
 * S8-B3-R3-CP2M-R3 — LEGAL SYNTHETIC FIXTURES, DERIVED FROM THE NORMALIZERS
 * ==================================================================================================
 *
 * WHY THIS FILE EXISTS. CP2M-R2 answered every scoped read with a generic empty envelope, because the
 * alternative at the time was to GUESS a shape. That was the honest choice and it cost two
 * measurements: the Product Strategy board rendered its no-data state, so timing its six sub-pages
 * measured switching an EMPTY board; and the map drew its formal empty state, so the globe was
 * verified with no shipment overlay on it.
 *
 * NOTHING HERE IS GUESSED. Every field name below was read out of the code that consumes it:
 *
 *   shipmentWorkspace()        -> KM.DB.adaptShipmentWorkspace (operation-system-db-api.js), whose
 *                                 per-array normalizers name every key. `shipments` entries carry a
 *                                 `.raw`, because normalizeShipmentRecord reads `s.raw`; route NODES
 *                                 carry latitude/longitude, because that is what makes one drawable.
 *   productPricingWorkspace()  -> KM_PRODUCT_PRICING_ADAPTER.adapt, which requires
 *                                 success === true, an OBJECT `data`, `data.schema.contract_version`
 *                                 equal to EXPECTED_SCHEMA_CONTRACT_VERSION (2), and a `sourceState`;
 *                                 the row fields are PSB_CONTRACT.FIELD_NAMES, all 28 of them.
 *
 * IT IS STILL SYNTHETIC, AND SAYS SO. Every row is obviously fake — TEST-SKU-n, FixtureCarrier, a
 * company called KitchenMama with a sibling called ResourceUS. The point is not that the data is
 * realistic; it is that the SHAPE is lawful, so the page takes the OK branch and renders the layout an
 * operator would see instead of a refusal panel. A measurement of a refusal panel is not a measurement
 * of the page.
 *
 * Used by _cp2m-r3-perf-runner / _cp2m-r2-map-runner so both halves of a before/after comparison are
 * fed from one definition and cannot drift apart.
 * ==================================================================================================
 */
'use strict';

/** Real coordinates, so a route node is drawable and the globe has something to place. */
const PLACES = [
  { code: 'CNSZX', name: 'Shenzhen', country: 'CN', lat: 22.54, lng: 114.06 },
  { code: 'USLAX', name: 'Los Angeles', country: 'US', lat: 33.74, lng: -118.27 },
  { code: 'NLRTM', name: 'Rotterdam', country: 'NL', lat: 51.95, lng: 4.14 },
  { code: 'JPTYO', name: 'Tokyo', country: 'JP', lat: 35.65, lng: 139.84 },
  { code: 'GBFXT', name: 'Felixstowe', country: 'GB', lat: 51.95, lng: 1.35 },
  { code: 'DEHAM', name: 'Hamburg', country: 'DE', lat: 53.55, lng: 9.93 },
  { code: 'CAVAN', name: 'Vancouver', country: 'CA', lat: 49.29, lng: -123.11 }
];

const COMPANIES = ['KitchenMama', 'ResourceUS'];

/**
 * A lawful `shipment.workspace.get` payload: the `data` object adaptShipmentWorkspace consumes.
 * @param {number} n how many shipments
 */
function shipmentWorkspace(n) {
  n = n || 8;
  const shipments = [];
  const shipmentLines = [];
  const shipmentRoutes = [];
  const shipmentEvents = [];
  const logisticsLocations = [];
  const warehouses = [];

  PLACES.forEach((p, i) => {
    warehouses.push({ warehouse_id: 'WH-' + p.code, warehouse_name: 'Fixture WH ' + p.name,
      country: p.country, warehouse_type: i === 0 ? 'factory' : 'overseas' });
    logisticsLocations.push({ logistics_location_id: 'LOC-' + p.code, location_code: p.code,
      location_name: p.name, country: p.country, latitude: p.lat, longitude: p.lng,
      warehouse_id: 'WH-' + p.code });
  });

  for (let i = 0; i < n; i++) {
    const origin = PLACES[0];                               // everything sails from the factory port
    const dest = PLACES[1 + (i % (PLACES.length - 1))];
    const id = 'SHP-FIXTURE-' + String(i + 1).padStart(3, '0');
    shipments.push({
      raw: {
        shipment_id: id, shipment_no: 'FX' + (1000 + i),
        shipping_plan_id: 'PLAN-FIXTURE-' + (1 + (i % 3)),
        source_warehouse_id: 'WH-' + origin.code,
        destination_warehouse_id: 'WH-' + dest.code,
        destination_type: 'overseas_warehouse',
        warehouse_code: dest.code,
        company: COMPANIES[i % COMPANIES.length],
        country: dest.country, marketplace: 'Amazon',
        status: 'in_transit',
        shipping_method: i % 2 ? 'SEA' : 'AIR',
        carrier_id: 'CARR-FIXTURE-' + (1 + (i % 2)),
        etd: '2026-10-0' + (1 + (i % 9)), eta: '2026-11-0' + (1 + (i % 9)),
        total_qty: 100 + i * 7, total_cartons: 5 + i
      }
    });
    shipmentLines.push({ shipment_line_id: id + '-L1', shipment_id: id,
      sku: 'TEST-SKU-' + (i % 40), qty: 100 + i * 7 });

    // TWO NODES make a drawable leg: an origin and a destination with real coordinates.
    [origin, dest].forEach((p, k) => {
      shipmentRoutes.push({
        shipment_route_id: id + '-N' + (k + 1), shipment_id: id,
        sequence_no: k + 1, node_type: k === 0 ? 'ORIGIN' : 'DESTINATION',
        node_code: p.code, location_ref_type: 'WAREHOUSE', location_ref_id: 'WH-' + p.code,
        location_name: p.name, country: p.country, city: p.name,
        latitude: p.lat, longitude: p.lng,
        transport_mode: i % 2 ? 'SEA' : 'AIR',
        planned_event_type: k === 0 ? 'DEPARTURE' : 'ARRIVAL',
        planned_departure_date: '2026-10-0' + (1 + (i % 9)),
        planned_arrival_date: '2026-11-0' + (1 + (i % 9))
      });
    });
    shipmentEvents.push({ shipment_event_id: id + '-E1', shipment_id: id,
      event_type: 'DEPARTED', event_date: '2026-10-0' + (1 + (i % 9)),
      location_name: origin.name, country: origin.country });
  }

  return {
    shipments, shipmentLines, shipmentRoutes, shipmentEvents,
    logisticsLocations, warehouses,
    carrierRateCards: [{ rate_card_id: 'RC-1', carrier_id: 'CARR-FIXTURE-1', carrier: 'FixtureCarrier A',
      origin_country: 'CN', destination_country: 'US', shipping_method: 'SEA', rate: 2.5, currency: 'USD' }],
    carriers: [{ carrier_id: 'CARR-FIXTURE-1', carrier_name: 'FixtureCarrier A' },
      { carrier_id: 'CARR-FIXTURE-2', carrier_name: 'FixtureCarrier B' }],
    shipmentRouteTemplates: [], shipmentRouteTemplateNodes: []
  };
}

/** The 28 fields PSB_CONTRACT.FIELD_NAMES names, every one populated. */
function psbRow(i) {
  const company = COMPANIES[i % COMPANIES.length];
  const place = PLACES[1 + (i % (PLACES.length - 1))];
  const master = 'TEST-SKU-' + String(i + 1).padStart(3, '0');
  const regular = 1999 + i * 37;
  const minimum = Math.round(regular * 0.8);
  const msrp = Math.round(regular * 1.25);
  const cat = ['Openers', 'Grinders', 'Knives', 'Storage'][i % 4];
  return {
    identity: company + '|' + place.country + '|Amazon|' + master,
    master_sku: master,
    site_sku: master + '-' + place.country,
    category: cat,
    product_name: 'Fixture ' + cat + ' ' + (i + 1),
    series: cat + ' Series',
    variant_group: cat + '-VG',
    variant_name: ['Classic', 'Pro', 'Mini'][i % 3],
    company: company,
    country: place.country,
    marketplace: 'Amazon',
    currency: 'USD',
    regular_price: regular,
    minimum_price: minimum,
    msrp: msrp,
    resolved_regular_price: regular,
    resolved_minimum_price: minimum,
    resolved_msrp: msrp,
    official_deal_price: i % 3 === 0 ? Math.round(regular * 0.9) : null,
    official_deal_start: i % 3 === 0 ? '2026-10-01' : null,
    official_deal_end: i % 3 === 0 ? '2026-10-31' : null,
    product_image: 'https://fixture.invalid/img/' + master + '.png',
    /* The ADAPTER reads `live.lifecycle`, not `lifecycle_status` -- that is the OUTPUT name. Supplying
       only the output name left the adapted row with a null the contract forbids, and the board
       correctly refused all 24 rows with CONTRACT_MISMATCH. */
    lifecycle: 'active',
    lifecycle_status: 'active',
    source_status: 'OK',
    missing_reasons: [],
    provenance: { source: 'FIXTURE' },
    regional: { country: place.country, marketplace: 'Amazon' },
    image_identity_status: i % 4 === 0 ? 'VERIFIED_DB_MAPPING' : 'NO_IMAGE',
    /* NOT IN FIELD_NAMES, BUT READ BY THE ADAPTER. Without these two the adapter raises
       SITE_STATUS_MISSING and IMAGE_SOURCE_MISSING for every row, and the board renders a
       data-quality banner over the view being timed. Both names come from adaptRow, not from a guess:
       `marketplace_sku_status` is what siteStatus reads, and a non-empty `product_image` is what stops
       the image state collapsing to IMAGE_SOURCE_MISSING. */
    marketplace_sku_id: 'MSKU-' + String(i + 1).padStart(3, '0'),
    marketplace_sku_status: 'active'
  };
}

/**
 * A lawful `productPricing.workspace.get` envelope. `schema.contract_version` MUST equal the adapter's
 * EXPECTED_SCHEMA_CONTRACT_VERSION (2) or the adapter raises SCHEMA_CONTRACT_VERSION_MISMATCH and the
 * board shows a data-quality warning instead of the view under test.
 */
function productPricingWorkspace(n) {
  n = n || 24;
  const rows = [];
  for (let i = 0; i < n; i++) rows.push(psbRow(i));
  return {
    success: true,
    data: {
      /* 'READY', NOT 'OK'. L.SERVER_SOURCE_STATES is READY | SOURCE_EMPTY | SOURCE_PARTIALLY_READABLE |
         STOP_DATA_INTEGRITY. 'OK' is the live adapter's own VERDICT vocabulary, not the server's, and
         sending it produced UNKNOWN_SOURCE_STATE -- a build refusing to adapt a shape it was not
         written against, which is the correct behaviour and was my error. */
      sourceState: 'READY',
      /* `normalizedRows` IS THE KEY THE ADAPTER READS, and `rows` is not. Written as `rows` first, the
         real adapter returned sourceState OK, schema matched, zero refusals -- and ZERO ROWS. A board
         fed that renders an empty OK state, which is exactly the confident nothing this file exists to
         avoid. Both are supplied: `normalizedRows` because it is the contract, `rows` because other
         readers of this envelope use the plain name. */
      normalizedRows: rows,
      rows: rows,
      schema: { contract_version: 2 },
      scope: { company: COMPANIES[0], country: 'US', marketplace: 'Amazon' },
      refusals: [], findings: [], dataQuality: [],
      counts: { rows: rows.length, sites: 1 },
      pagination: { has_more: false },
      /* REQUIRED BY km-product-pricing-workspace.js validateResponse, and both were wrong first time.
         `analysis_permitted` must be a BOOLEAN -- absent it is RESPONSE_MISSING_ANALYSIS_FLAG -- and
         filterOptions must carry `categories` and `series` as arrays of OBJECTS with a string `value`,
         not arrays of strings, or it is RESPONSE_BAD_FILTER_OPTIONS. Both failures surface to the
         operator as the same generic "RESPONSE_NOT_READABLE" panel, because that is the DEFAULT branch
         of stateForValidationCode -- so the symptom named neither cause. */
      analysis_permitted: true,
      filterOptions: {
        categories: ['Openers', 'Grinders', 'Knives', 'Storage'].map(c => ({ value: c, label: c, count: 6 })),
        series: ['Openers Series', 'Grinders Series', 'Knives Series', 'Storage Series']
          .map(c => ({ value: c, label: c, count: 6 }))
      }
    }
  };
}

/**
 * A lawful `productPricing.siteUniverse.get` envelope.
 *
 * ITS CONTRACT VERSION IS 1, NOT 2. km-product-strategy-site-universe.js has its own
 * EXPECTED_CONTRACT_VERSION and its own state vocabulary: the state must be the literal 'READY'
 * (SERVER_STATES = READY | SOURCE_EMPTY | SOURCE_PARTIALLY_READABLE | STOP_DATA_INTEGRITY), and a
 * state outside that list is rejected as SCHEMA_CONTRACT_MISMATCH rather than believed. The menus are
 * built from `hierarchy`, NOT from `sites` -- companies(), countriesFor() and marketplacesFor() all
 * read hierarchy maps, so a fixture with sites alone yields three empty menus and an unusable chooser.
 */
function siteUniverse() {
  const sites = [];
  const countriesByCompany = {};
  const marketplacesByCountry = {};
  const plan = [
    { company: COMPANIES[0], country: 'US', marketplace: 'Amazon' },
    { company: COMPANIES[0], country: 'GB', marketplace: 'Amazon' },
    { company: COMPANIES[0], country: 'JP', marketplace: 'Rakuten' },
    { company: COMPANIES[1], country: 'US', marketplace: 'Amazon' }
  ];
  plan.forEach(function (p) {
    sites.push({ company: p.company, country: p.country, marketplace: p.marketplace, selectable: true });
    (countriesByCompany[p.company] = countriesByCompany[p.company] || []);
    if (countriesByCompany[p.company].indexOf(p.country) < 0) countriesByCompany[p.company].push(p.country);
    var k = p.company + '|' + p.country;
    (marketplacesByCountry[k] = marketplacesByCountry[k] || []);
    if (marketplacesByCountry[k].indexOf(p.marketplace) < 0) marketplacesByCountry[k].push(p.marketplace);
  });
  return {
    success: true,
    data: {
      sourceState: 'READY',
      schema: { contract_version: 1 },
      sites: sites,
      hierarchy: {
        companies: COMPANIES.slice(),
        countries_by_company: countriesByCompany,
        marketplaces_by_country: marketplacesByCountry
      },
      refusals: [], findings: [],
      completeness: { sites: sites.length, complete: true }
    }
  };
}

module.exports = { PLACES, COMPANIES, shipmentWorkspace, productPricingWorkspace, psbRow, siteUniverse };
