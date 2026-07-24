# logistics_locations — Seed Checklist (Locations Requiring Owner Confirmation)

**Created:** 2026-07-23
**Purpose:** Per `GLOBAL_3D_SHIPMENT_MAP_SPEC_V1.md` §13 ("if actual location data is not yet provided … return a structured list of locations requiring owner confirmation"), this enumerates the location categories the map needs and what must be confirmed. **No coordinates are guessed or pre-filled** — every row below is a placeholder for owner-provided, verified data (spec §2: "Blank is preferable to a fabricated coordinate").

## How to use
Fill `logistics_locations_import_template.csv` (one row per real facility). For each row, `verification_status = verified` requires `coordinate_source_type` + `coordinate_source_reference` + verifier + verification time (spec §3.3). Ambiguous / same-name facilities must be disambiguated by the owner — the system will **not** silently pick one (spec §5.1).

## Categories the map requires (each needs owner-confirmed coordinates + accuracy + source)

| # | Category (`location_type`) | Source of the list today | What the owner must confirm | Accuracy target |
|---|---|---|---|---|
| 1 | `warehouse` / `fulfillment_center` | `warehouses` table (`KM.DB.getWarehouses`) — **has NO coordinates today** | lat/long + accuracy + source for **every** active warehouse (link via `warehouse_id`) | `exact_facility` / `entrance_or_routable_point` |
| 2 | `factory` | Factory master / `factory_stock` warehouse rows (e.g. 東莞侑鑫 CN, 南投勝一 TW) | factory addresses + coordinates (link via `factory_id`/`warehouse_id`) | `exact_facility` |
| 3 | `port` | Origin/destination ports named in route templates (inline `city`/`country` on `shipment_route_template_nodes`) | port centroid or terminal point + `un_locode`/`port_code` | `port_or_terminal` |
| 4 | `airport` | Air-route template nodes | airport point + `iata_code`/`icao_code` | `port_or_terminal` / `exact_facility` |
| 5 | `rail_terminal` | Rail-route template nodes (e.g. China–Europe rail) | terminal point + `rail_terminal_code` | `port_or_terminal` |
| 6 | `border_crossing` | Rail/truck route nodes (e.g. Alashankou / Khorgos, Channel crossing) | **decide per §5.2**: split into exact variants, or mark `virtual_transit_point`/approximate | `approximate` unless a specific crossing is fixed |
| 7 | `customs_facility` | Customs nodes on templates | facility point + `port_code` if applicable | `port_or_terminal` |
| 8 | `transit_hub` / `parcel_hub` / `carrier_facility` | Carrier hub nodes on templates | facility or approximate point + `coordinate_source_type = carrier_source` | per source |
| 9 | `virtual_transit_point` | Intentionally variable ocean/transit legs | leave coordinate blank or approximate midpoint, clearly labeled | `approximate` |

## Rules the seed data must satisfy (spec §3.3, §5)
- `latitude` and `longitude` are **both present or both blank**.
- Any row with coordinates must set `coordinate_accuracy` + `coordinate_source_type` + `verification_status`.
- `warehouse_id` (if set) must resolve to an existing `warehouses` row; ≤ one active primary location per warehouse.
- Approximate / virtual points must be marked so the UI renders them distinctly from verified facilities (spec §6.3).
- No external code (`un_locode`/`iata_code`/`port_code`/…) may be invented — leave blank if unknown.
- Same-name facilities (e.g. two "Shenzhen" terminals) require an explicit owner choice + `note`.

## Open owner decisions blocking seeding
1. **Warehouse coordinates** — `warehouses` has no lat/long; owner must supply them (or approve city/region centroids as an interim, clearly marked).
2. **Generalized crossings** (Alashankou/Khorgos, Channel) — variant-split vs virtual point (spec §5.2).
3. **Map provider + geocoder** — whether stored geocoded coordinates are permitted by the chosen provider's terms (spec §9); this also gates whether the system may auto-propose coordinates at all.

> Until these are provided/decided, planned nodes without a verified/approved coordinate render as **unresolved** and surface in Data Health (spec §10.1) — they are never shown as verified pins.
