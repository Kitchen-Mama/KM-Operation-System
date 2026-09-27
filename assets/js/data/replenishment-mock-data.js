/**
 * ==================================================================================================
 * SHARED DEMO FIXTURE - replenishmentMockData
 * ==================================================================================================
 *
 * Moved here VERBATIM from inventory-replenishment.js by S4-R5. Not a refactor: same identifier,
 * same rows, same top-level `const`, same boot timing. Only its file changed.
 *
 * WHY IT HAD TO MOVE. Weekly Shipping Plan reads this array in three places, unguarded, to get a
 * SKU's unitsPerCarton. It worked only because both files were loaded at boot and a top-level
 * `const` in a classic script is visible to every other classic script. S4-R5 gave Site Inventory
 * its 947 KB back by loading it when the route is opened - at which point a Weekly Shipping Plan
 * opened first would have thrown ReferenceError. One shared constant, in a file of its own, is the
 * whole of the coupling that stood in the way.
 *
 * This is demo scaffolding, and shipping-history.js §loadHistoryData already says so in plain
 * terms: the writer that consumes it computes totalCost from a hardcoded unitCost of 2.5 and a
 * unitsPerCarton read out of these seven rows - "invented money, one browser tab wide". Retiring
 * that path is shipment business logic and belongs to the round that owns it. This round moves the
 * bytes and changes nothing about what reads them.
 * ==================================================================================================
 */
const replenishmentMockData = [
    { sku: "CO1100-R", lifecycle: "Mature", productName: "Can Opener Pro", forecast90d: 450, onTheWay: 20, unitsPerCarton: 40 },
    { sku: "CO1100-S", lifecycle: "New", productName: "Manual Opener Basic", forecast90d: 320, onTheWay: 15, unitsPerCarton: 50 },
    { sku: "CO1150-R", lifecycle: "Mature", productName: "Kitchen Tool Set", forecast90d: 1100, onTheWay: 50, unitsPerCarton: 30 },
    { sku: "CO1150-AG", lifecycle: "Mature", productName: "Electric Peeler", forecast90d: 380, onTheWay: 10, unitsPerCarton: 40 },
    { sku: "SP3120-R", lifecycle: "New", productName: "Smart Opener", forecast90d: 600, onTheWay: 30, unitsPerCarton: 50 },
    { sku: "SP3410-R", lifecycle: "Phasing Out", productName: "Classic Knife", forecast90d: 280, onTheWay: 5, unitsPerCarton: 30 },
    { sku: "MO5600-R", lifecycle: "Mature", productName: "Food Processor", forecast90d: 750, onTheWay: 40, unitsPerCarton: 40 }
];
