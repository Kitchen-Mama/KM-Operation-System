// ========================================
// SKU Handbook Page Logic
// ========================================

const SkuHandbookState = {
    search: '',
    productLine: 'all',
    brand: 'all',
    lifecycle: 'all',
    selectedSku: null
};

const LIFECYCLE_MAP = {
    'Active': 'Running in the market',
    'Running': 'Running in the market',
    'Upcoming': 'Upcoming SKU',
    'Phasing Out': 'Phasing Out',
    'Closure': 'Closure'
};

function normalizeSkuHandbookItem(item, lifecycleGroup) {
    var lc = window.getNormalizedSkuStatus ? getNormalizedSkuStatus(item) : lifecycleGroup;
    var img = window.getNormalizedSkuImage ? getNormalizedSkuImage(item) : (item.image || item.imageUrl || '');
    return {
        sku: item.sku || '',
        productName: item.productName || item.item || item.name || '',
        productLine: item.category || '',
        series: item.series || '',
        brand: 'Kitchen Mama',
        lifecycle: lc,
        image: img,
        shortDescription: '',
        dimensions: item.itemDimensions || '',
        weight: item.itemWeight || '',
        material: '',
        keyFeatures: '',
        sellingPoints: '',
        useCases: '',
        notes: '',
        msrp: item.msrp || '',
        sellingPrice: item.sellingPrice || '',
        hscode: item.hscode || '',
        pm: item.pm || ''
    };
}

function getSkuHandbookData() {
    const all = [];

    // Try KM.DB.getSkuKnowledgeItems first (merged with product_features & summaries)
    if (window.KM && window.KM.DB && window.KM.DB.getSkuKnowledgeItems) {
        var knowledgeItems = window.KM.DB.getSkuKnowledgeItems();
        if (knowledgeItems && knowledgeItems.length > 0) {
            knowledgeItems.forEach(function(item) {
                var lc = window.getNormalizedSkuStatus ? getNormalizedSkuStatus(item) : (item.lifecycle || 'Running in the Market');
                var img = window.getNormalizedSkuImage ? getNormalizedSkuImage(item) : (item.image || '');
                all.push({
                    sku: item.sku || '',
                    productName: item.productName || '',
                    productLine: item.productLine || item.category || '',
                    series: item.series || '',
                    brand: 'Kitchen Mama',
                    lifecycle: lc,
                    image: img,
                    shortDescription: item.displaySummary || '',
                    dimensions: item.itemDimensions || '',
                    weight: item.itemWeight || '',
                    material: item.material || '',
                    keyFeatures: (item.displayKeyPoints || []).join('|'),
                    sellingPoints: '',
                    useCases: '',
                    notes: '',
                    msrp: item.msrp || '',
                    sellingPrice: item.sellingPrice || '',
                    hscode: item.hsCode || item.hscode || '',
                    pm: item.pm || '',
                    isSellingMaterial: item.isSellingMaterial || false,
                    rawReferenceContent: item.rawReferenceContent || null
                });
            });
            return all;
        }
    }

    // Fallback: use override system
    if (window.getAllSkuDataWithOverrides) {
        const groups = getAllSkuDataWithOverrides();
        Object.entries(groups).forEach(([lifecycle, items]) => {
            items.forEach(item => {
                const normalized = normalizeSkuHandbookItem(item, lifecycle);
                const knowledge = getProductKnowledge(item.sku, item.series, item.category);
                Object.assign(normalized, knowledge);
                all.push(normalized);
            });
        });
    } else {
        (window.upcomingSkuData || []).forEach(item => {
            all.push(normalizeSkuHandbookItem(item, 'Upcoming SKU'));
        });
        (window.runningSkuData || []).forEach(item => {
            all.push(normalizeSkuHandbookItem(item, 'Running in the market'));
        });
        (window.phasingOutSkuData || []).forEach(item => {
            all.push(normalizeSkuHandbookItem(item, 'Phasing Out'));
        });
    }
    return all;
}

// Product knowledge database - based on Kitchen Mama brand
const PRODUCT_KNOWLEDGE = {
    // === Electric Can Openers ===
    'CO1100': {
        shortDescription: 'One-touch automatic electric can opener. Smooth edge cutting, no sharp edges. The original Kitchen Mama best-seller.',
        keyFeatures: 'One-touch operation|Smooth edge cutting (no sharp edges)|Ergonomic soft-grip handle|Battery powered (4x AA)|Works on most standard cans|Auto-stop when complete|Compact & portable|Lid lifts off with magnet',
        sellingPoints: 'Safest can opener for families with kids|No hand strain - perfect for seniors & arthritis|Opens cans in seconds with one button|No sharp edges on lid or can|#1 Best Seller on Amazon|Over 100,000+ 5-star reviews',
        useCases: 'Daily kitchen use|Elderly & arthritis-friendly|Camping & outdoor|Gift for parents/grandparents|RV & boat kitchens',
        material: 'ABS Plastic + Stainless Steel Cutting Blade'
    },
    'CO1150': {
        shortDescription: 'Auto 2.0 - upgraded electric can opener with improved motor, faster cutting speed, and modern trendy colorways.',
        keyFeatures: 'Upgraded 2.0 motor (30% faster)|One-touch smooth edge cutting|New trendy color options (Alpine Green, Morandi Blue, Marble)|Improved battery life|Universal fit for standard cans|Auto-stop mechanism|Magnetic lid holder|Sleek modern design',
        sellingPoints: 'Next-gen upgrade from best-selling CO1100|Faster opening speed|Premium color options for modern kitchens|Same safety features families love|Great for gifting|Aesthetic kitchen countertop display',
        useCases: 'Daily kitchen use|Modern kitchen aesthetic|Upgrade from CO1100|Holiday gift sets|Housewarming gifts|Wedding registry',
        material: 'ABS Plastic + Stainless Steel Cutting Blade'
    },
    'CO1200': {
        shortDescription: 'Mini electric can opener. Ultra-compact design for small kitchens and on-the-go use.',
        keyFeatures: 'Ultra-compact mini size|One-touch smooth edge cutting|Lightweight & portable|Battery powered (2x AA)|Fits in drawers easily|Auto-stop|Travel-friendly',
        sellingPoints: 'Smallest electric can opener on the market|Perfect for tiny kitchens & dorms|Easy to pack for travel|Same smooth-edge safety|Great stocking stuffer gift',
        useCases: 'Small apartments & dorms|Travel & camping|Office kitchen|Emergency kit|Gift for college students',
        material: 'ABS Plastic + Stainless Steel Blade'
    },
    'CO2102': {
        shortDescription: 'Electric can opener with built-in knife sharpener. Two kitchen tools in one compact device.',
        keyFeatures: 'Electric can opener + knife sharpener combo|One-touch smooth edge cutting|2-stage knife sharpening system|Battery powered|Compact 2-in-1 design|Auto-stop|Space-saving',
        sellingPoints: 'Two tools in one - saves counter space|Keep knives sharp without separate sharpener|Same safe smooth-edge cutting|Great value combo product|Unique gift idea',
        useCases: 'Small kitchens needing multi-function tools|Knife maintenance + can opening|Gift for home cooks|RV & boat (space-saving)',
        material: 'ABS Plastic + Stainless Steel + Ceramic Sharpener'
    },
    'CO2300': {
        shortDescription: 'Electric can opener with built-in bottle opener. Versatile kitchen companion for cans and bottles.',
        keyFeatures: 'Electric can opener + bottle opener combo|One-touch smooth edge cutting|Built-in bottle cap opener|Battery powered (4x AA)|Ergonomic design|Auto-stop|Multi-function',
        sellingPoints: 'Opens both cans and bottles|No need for separate bottle opener|Same safe smooth-edge technology|Convenient all-in-one tool|Great for parties & entertaining',
        useCases: 'Kitchen multi-tasking|Party & entertaining|BBQ & outdoor cooking|Gift for beer/soda lovers|Everyday convenience',
        material: 'ABS Plastic + Stainless Steel Blade'
    },
    'CO2600': {
        shortDescription: 'Electric can opener with food-safe container lid. Opens can and provides a reusable storage lid.',
        keyFeatures: 'Electric can opener + snap-on storage lid|One-touch smooth edge cutting|Includes reusable silicone lid|Keeps opened cans fresh in fridge|Battery powered|Auto-stop|BPA-free lid',
        sellingPoints: 'No more plastic wrap on opened cans|Reusable lid saves money & reduces waste|Same safe smooth-edge cutting|Eco-friendly kitchen solution|Unique problem-solving product',
        useCases: 'Storing half-used cans|Reducing food waste|Pet food cans (store leftovers)|Eco-conscious kitchens|Meal prep',
        material: 'ABS Plastic + Stainless Steel Blade + Silicone Lid'
    },
    'CO5600': {
        shortDescription: 'Premium electric can opener with rechargeable USB-C battery. No disposable batteries needed.',
        keyFeatures: 'USB-C rechargeable battery|One-touch smooth edge cutting|No disposable batteries needed|LED charging indicator|Long battery life (100+ cans per charge)|Premium build quality|Auto-stop|Magnetic lid holder',
        sellingPoints: 'Never buy batteries again|Eco-friendly rechargeable design|Premium feel & build quality|USB-C universal charging|Best for daily heavy use|Modern sustainable kitchen',
        useCases: 'Daily heavy use households|Eco-conscious consumers|Premium kitchen upgrade|Gift for sustainability-minded people|Commercial/restaurant light use',
        material: 'ABS Plastic + Stainless Steel Blade + Li-ion Battery'
    },
    'CO0560': {
        shortDescription: 'Classic electric can opener. Reliable everyday kitchen essential with proven performance.',
        keyFeatures: 'One-touch operation|Smooth edge cutting|Battery powered|Reliable classic design|Universal can fit|Auto-stop|Easy to clean',
        sellingPoints: 'Proven reliable performance|Simple & straightforward|Affordable entry point|Same safety features|Great everyday workhorse',
        useCases: 'Daily kitchen use|Budget-friendly option|Replacement for old can openers|Basic kitchen setup',
        material: 'ABS Plastic + Stainless Steel Blade'
    },
    // === Manual Openers ===
    'MO5600': {
        shortDescription: 'Manual can opener with smooth edge cutting technology. No electricity needed, portable and reliable.',
        keyFeatures: 'Smooth edge cut (no sharp edges)|Manual operation - no batteries needed|Heavy-duty stainless steel blade|Ergonomic soft-grip handles|Built-in bottle opener|Compact & lightweight|Rust-resistant|Oversized turning knob',
        sellingPoints: 'Safe smooth edge - no cuts ever|Always works - no batteries or charging|Durable stainless steel construction|Comfortable even for extended use|Multi-function with bottle opener|Perfect backup tool',
        useCases: 'Emergency preparedness|Camping & hiking|RV & boat|Power outage backup|Everyday kitchen use|Outdoor adventures',
        material: 'Stainless Steel + TPR Soft Grip Handle'
    },
    // === Silicone Products - Waltzgrip Series ===
    'SP3020': {
        shortDescription: 'Waltzgrip silicone tongs. Heat-resistant, non-slip grip, perfect for cooking, grilling, and serving.',
        keyFeatures: 'Heat resistant up to 480\u00b0F/250\u00b0C|BPA-free food-grade silicone tips|Ergonomic Waltzgrip handle|Locking mechanism for storage|Non-slip grip|Safe for non-stick cookware|Dishwasher safe|Pull-to-lock design',
        sellingPoints: "Won't scratch non-stick pans|Comfortable grip for long cooking sessions|Easy lock for compact storage|Heat-safe silicone tips|Stylish colors match any kitchen",
        useCases: 'Grilling & BBQ|Stir-frying|Serving salads|Pasta handling|Flipping meats',
        material: 'Food-grade Silicone Tips + Stainless Steel + PP Handle'
    },
    'SP3120': {
        shortDescription: 'Waltzgrip silicone basting brushes with ergonomic handle. Heat-resistant, BPA-free, dishwasher safe.',
        keyFeatures: 'Heat resistant up to 480\u00b0F/250\u00b0C|BPA-free food-grade silicone|Ergonomic Waltzgrip handle|Dishwasher safe|No bristle shedding|Even sauce distribution|Hanging hole for storage|Angled brush head',
        sellingPoints: "Won't shed bristles like traditional brushes|Safe for non-stick cookware|Easy to clean - dishwasher safe|Comfortable grip reduces hand fatigue|Vibrant colors to match any kitchen|Hygienic - no bacteria buildup",
        useCases: 'BBQ & grilling (sauce/marinade)|Baking (egg wash, butter)|Marinading meats|Oiling pans & griddles|Sauce application on pastries',
        material: 'Food-grade Silicone + PP Handle'
    },
    'SP3210': {
        shortDescription: 'Waltzgrip silicone slotted turner/spatula. Ideal for draining grease while flipping foods.',
        keyFeatures: 'Slotted design for grease drainage|Heat resistant up to 480\u00b0F/250\u00b0C|BPA-free food-grade silicone|Safe for non-stick cookware|Ergonomic Waltzgrip handle|Flexible yet sturdy|Dishwasher safe',
        sellingPoints: "Drains grease while flipping - healthier cooking|Won't scratch non-stick pans|Flexible edge slides under food easily|Comfortable grip|Easy to clean",
        useCases: 'Frying bacon & sausages|Flipping burgers (drain grease)|Fish fillets|Hash browns|Fried eggs',
        material: 'Food-grade Silicone + PP Handle'
    },
    'SP3320': {
        shortDescription: 'Waltzgrip silicone solid spoon. Perfect for stirring, mixing, and serving soups and sauces.',
        keyFeatures: 'Deep spoon bowl for scooping|Heat resistant up to 480\u00b0F/250\u00b0C|BPA-free food-grade silicone|Safe for non-stick cookware|Ergonomic Waltzgrip handle|Non-stick surface|Dishwasher safe',
        sellingPoints: "Deep bowl holds more liquid|Won't scratch pots & pans|Comfortable for stirring large pots|Easy to clean|Vibrant kitchen colors",
        useCases: 'Stirring soups & stews|Serving sauces|Mixing batters|Scooping grains & rice|Everyday cooking',
        material: 'Food-grade Silicone + PP Handle'
    },
    'SP3410': {
        shortDescription: 'Waltzgrip silicone pancake turner/spatula. Flexible thin edge, heat-resistant, perfect for flipping delicate foods.',
        keyFeatures: 'Thin flexible edge for easy sliding|Heat resistant up to 480\u00b0F/250\u00b0C|BPA-free food-grade silicone|Safe for non-stick cookware|Ergonomic Waltzgrip handle|Wide surface area|Dishwasher safe|Beveled edge',
        sellingPoints: "Perfect flip every time - thin flexible edge|Won't scratch non-stick pans|Comfortable grip for extended cooking|Easy to clean|Great for pancakes, eggs, fish, burgers",
        useCases: 'Pancakes & crepes|Eggs (fried, omelettes)|Fish fillets|Burgers & patties|Cookies & baking sheets',
        material: 'Food-grade Silicone + PP Handle'
    },
    'SP5020': {
        shortDescription: 'Waltzgrip silicone ladle. Deep bowl for serving soups, stews, and sauces with precision.',
        keyFeatures: 'Deep ladle bowl (4oz capacity)|Heat resistant up to 480\u00b0F/250\u00b0C|BPA-free food-grade silicone|Pour spout for drip-free serving|Ergonomic Waltzgrip handle|Safe for non-stick cookware|Dishwasher safe',
        sellingPoints: "Drip-free pouring spout|Deep bowl serves generous portions|Won't scratch pots|Comfortable long handle|Easy to clean",
        useCases: 'Serving soups & stews|Ladling sauces & gravies|Punch bowls|Portioning batters|Hot pot cooking',
        material: 'Food-grade Silicone + PP Handle'
    },
    'SP5120': {
        shortDescription: 'Waltzgrip silicone skimmer/strainer spoon. Perfect for removing food from hot liquids.',
        keyFeatures: 'Fine mesh-style holes for straining|Heat resistant up to 480\u00b0F/250\u00b0C|BPA-free food-grade silicone|Large surface area|Ergonomic Waltzgrip handle|Safe for non-stick cookware|Dishwasher safe',
        sellingPoints: "Strains liquid while scooping food|Large head covers more area|Won't scratch pots|Comfortable grip|Versatile kitchen tool",
        useCases: 'Skimming foam from broths|Removing dumplings from water|Frying (removing food from oil)|Blanching vegetables|Hot pot cooking',
        material: 'Food-grade Silicone + PP Handle'
    },
    'SP5023': {
        shortDescription: 'Waltzgrip silicone whisk. Flexible silicone-coated wires safe for non-stick cookware.',
        keyFeatures: 'Silicone-coated wires|Heat resistant up to 480\u00b0F/250\u00b0C|Safe for non-stick cookware|Ergonomic Waltzgrip handle|Flexible yet effective whisking|Dishwasher safe|No scratching',
        sellingPoints: "Won't scratch non-stick pans|Silicone coating is heat-safe|Comfortable grip|Quiet whisking (no metal clanging)|Easy to clean",
        useCases: 'Whisking eggs|Making sauces & gravies|Mixing batters|Salad dressings|Hot beverages',
        material: 'Silicone-coated Steel Wires + PP Handle'
    },
    'SP5051': {
        shortDescription: 'Kitchen Mama silicone utensil set. Complete cooking set with holder stand.',
        keyFeatures: 'Complete utensil set with holder|Heat resistant up to 480\u00b0F/250\u00b0C|BPA-free food-grade silicone|Safe for non-stick cookware|Ergonomic handles|Dishwasher safe|Matching color set',
        sellingPoints: 'Complete set - everything you need|Matching colors look great on counter|Safe for all cookware|Easy to clean|Great gift set',
        useCases: 'Complete kitchen setup|Housewarming gift|Wedding registry|Replacing old utensils|Kitchen makeover',
        material: 'Food-grade Silicone + PP Handles + Holder'
    },
    // === Gadgets & Accessories ===
    'GA0150': {
        shortDescription: 'Kitchen Mama bag sealer. Portable heat sealer for keeping snacks and food bags fresh.',
        keyFeatures: 'Portable handheld design|Heat-seal technology|Works on most plastic bags|Battery powered (2x AA)|Compact & lightweight|Magnetic for fridge mounting|One-hand operation',
        sellingPoints: 'Keep snacks fresh longer|No more bag clips needed|Portable - take anywhere|Easy one-hand operation|Great for chip bags, frozen food bags',
        useCases: 'Sealing chip & snack bags|Frozen food storage|Camping & travel|Office snack storage|Pet food bags',
        material: 'ABS Plastic + Ceramic Heating Element'
    },
    'GA0450': {
        shortDescription: 'Kitchen Mama electric salt & pepper grinder. One-touch grinding with adjustable coarseness.',
        keyFeatures: 'One-touch electric grinding|Adjustable coarseness (fine to coarse)|Ceramic grinding mechanism|Battery powered|LED light illuminates food|Clear window shows fill level|Ergonomic one-hand design',
        sellingPoints: 'Grind with one hand while cooking|LED light helps see seasoning on food|Adjustable from fine to coarse|Ceramic grinder never rusts|Stylish countertop display',
        useCases: 'Cooking & seasoning|Table-side grinding|BBQ & grilling|Meal prep|Gift for home chefs',
        material: 'ABS Plastic + Ceramic Grinder + Acrylic Window'
    },
    'GA3120': {
        shortDescription: 'Kitchen Mama electric milk frother. Create cafe-quality foam for lattes, cappuccinos, and more.',
        keyFeatures: 'Powerful motor for thick foam|Dual-speed (froth & mix)|Stainless steel whisk head|Battery powered (2x AA)|Lightweight & portable|Easy to clean|Works with all milk types',
        sellingPoints: 'Cafe-quality foam at home|Works with dairy & plant milks|Dual speed for different drinks|Portable - great for travel|Saves money vs coffee shops',
        useCases: 'Lattes & cappuccinos|Matcha latte|Hot chocolate|Protein shake mixing|Bulletproof coffee',
        material: 'ABS Plastic + Stainless Steel Whisk'
    },
    // === Specialty ===
    'SP0650': {
        shortDescription: 'Silicone oven mitts with quilted cotton lining. Heat-resistant, non-slip grip, waterproof.',
        keyFeatures: 'Heat resistant up to 480\u00b0F/250\u00b0C|Waterproof silicone exterior|Quilted cotton lining for comfort|Non-slip textured grip|Extra long cuff protects forearms|BPA-free|Machine washable',
        sellingPoints: 'Waterproof - no more wet potholder burns|Non-slip grip on hot dishes|Extra long protects arms|Comfortable cotton lining|Easy to clean',
        useCases: 'Oven & baking|Grilling|Handling hot pots & pans|Microwave use|Dutch oven cooking',
        material: 'Silicone + Quilted Cotton Lining'
    },
    'SP0750': {
        shortDescription: 'Silicone trivets/pot holders. Heat-resistant mats to protect countertops and tables.',
        keyFeatures: 'Heat resistant up to 480\u00b0F/250\u00b0C|Non-slip surface|BPA-free food-grade silicone|Flexible & stackable|Dishwasher safe|Multi-use (trivet, jar opener, spoon rest)|Honeycomb design',
        sellingPoints: 'Protects countertops from heat damage|Non-slip - pots won\'t slide|Multi-function (trivet + jar opener + spoon rest)|Easy to store - stackable|Vibrant colors',
        useCases: 'Hot pot/pan placement|Jar opening grip|Spoon rest|Table protection|Baking mat',
        material: 'Food-grade Silicone'
    },
    'MF1000': {
        shortDescription: 'Kitchen Mama electric food chopper. One-touch chopping for vegetables, fruits, nuts, and more.',
        keyFeatures: 'Powerful motor for quick chopping|One-touch pulse operation|Stainless steel blades|BPA-free bowl (2-cup capacity)|Non-slip base|Dishwasher-safe parts|Compact storage',
        sellingPoints: 'Chop vegetables in seconds|No more tears from onions|Consistent uniform cuts|Easy to clean|Saves prep time',
        useCases: 'Chopping onions & garlic|Making salsa & guacamole|Baby food prep|Nut chopping|Herb mincing',
        material: 'ABS Plastic + Stainless Steel Blades + BPA-free Bowl'
    },
    'MG0110': {
        shortDescription: 'Kitchen Mama electric egg cooker. Perfectly cooked eggs every time - soft, medium, or hard boiled.',
        keyFeatures: 'Cooks up to 6 eggs|Soft/medium/hard boil settings|Auto shut-off|Measuring cup included|Egg piercer built-in|Compact design|BPA-free|Audible alert when done',
        sellingPoints: 'Perfect eggs every single time|Set it and forget it|No more guessing cook times|Easy to use - just add water|Compact countertop footprint',
        useCases: 'Breakfast prep|Meal prep (batch cooking)|Hard boiled eggs for salads|Deviled eggs|Protein-rich snacks',
        material: 'BPA-free Plastic + Stainless Steel Heating Plate'
    },
    'SM1251': {
        shortDescription: 'Kitchen Mama sandwich maker. Makes perfectly sealed crustless sandwiches in minutes.',
        keyFeatures: 'Seals & cuts sandwiches|Removes crusts automatically|Non-stick cooking plates|Indicator lights (power & ready)|Compact upright storage|Cool-touch handle|Makes sandwiches in 3-5 minutes',
        sellingPoints: 'Kids love crustless sealed sandwiches|Quick & easy lunch prep|Non-stick - easy cleanup|Compact storage|Fun shapes kids enjoy',
        useCases: "Kids' school lunches|Quick breakfast|After-school snacks|Camping meals|Dorm room cooking",
        material: 'BPA-free Plastic + Non-stick Coated Plates'
    },
    'MF0023': {
        shortDescription: 'Kitchen Mama electric hand mixer. Lightweight, powerful mixing for baking and cooking.',
        keyFeatures: 'Multiple speed settings|Lightweight ergonomic design|Stainless steel beaters|Eject button for easy removal|Compact storage|Powerful motor|Low noise operation',
        sellingPoints: 'Lightweight - no arm fatigue|Powerful enough for thick batters|Easy beater ejection|Compact storage|Affordable baking essential',
        useCases: 'Baking (cakes, cookies)|Whipping cream|Mixing batters|Mashed potatoes|Meringues',
        material: 'ABS Plastic + Stainless Steel Beaters'
    }
};

function getProductKnowledge(sku, series, category) {
    const knowledge = PRODUCT_KNOWLEDGE[series] || {};
    const lang = window.i18n ? i18n.getLang() : 'en';
    if (lang === 'zh') {
        // Try Chinese translation first, fallback to English
        const zhDesc = tProduct(series, 'shortDescription');
        const zhFeatures = tProduct(series, 'keyFeatures');
        const zhSelling = tProduct(series, 'sellingPoints');
        const zhUses = tProduct(series, 'useCases');
        return {
            shortDescription: zhDesc || knowledge.shortDescription || '',
            keyFeatures: zhFeatures || knowledge.keyFeatures || '',
            sellingPoints: zhSelling || knowledge.sellingPoints || '',
            useCases: zhUses || knowledge.useCases || '',
            material: knowledge.material || ''
        };
    }
    return {
        shortDescription: knowledge.shortDescription || '',
        keyFeatures: knowledge.keyFeatures || '',
        sellingPoints: knowledge.sellingPoints || '',
        useCases: knowledge.useCases || '',
        material: knowledge.material || ''
    };
}

function applySkuHandbookFilters(items) {
    let filtered = items;
    const s = SkuHandbookState;

    if (s.search) {
        const q = s.search.toLowerCase();
        filtered = filtered.filter(i => {
            var base = (i.sku || '').toLowerCase().includes(q) ||
                (i.productName || '').toLowerCase().includes(q) ||
                (i.series || '').toLowerCase().includes(q) ||
                (i.productLine || '').toLowerCase().includes(q);
            if (base) return true;
            // Search in displaySummary / keyFeatures / rawReferenceContent
            if ((i.shortDescription || i.displaySummary || '').toLowerCase().includes(q)) return true;
            if ((i.keyFeatures || '').toLowerCase().includes(q)) return true;
            var raw = i.rawReferenceContent;
            if (raw) {
                if ((raw.productTitle || '').toLowerCase().includes(q)) return true;
                if ((raw.productDescription || '').toLowerCase().includes(q)) return true;
                if ((raw.genericKeyword || '').toLowerCase().includes(q)) return true;
                if (raw.bulletPoints && raw.bulletPoints.some(function(b) { return b.toLowerCase().includes(q); })) return true;
            }
            return false;
        });
    }
    if (s.productLine !== 'all') {
        filtered = filtered.filter(i => i.productLine === s.productLine);
    }
    if (s.brand !== 'all') {
        filtered = filtered.filter(i => i.brand === s.brand);
    }
    if (s.lifecycle !== 'all') {
        filtered = filtered.filter(i => i.lifecycle === s.lifecycle);
    }
    return filtered;
}

function groupSkuHandbookItems(items) {
    const groups = {};
    items.forEach(item => {
        const lc = item.lifecycle || 'Other';
        const pl = item.productLine || 'Uncategorized';
        const sr = item.series || 'No Series';
        if (!groups[lc]) groups[lc] = {};
        if (!groups[lc][pl]) groups[lc][pl] = {};
        if (!groups[lc][pl][sr]) groups[lc][pl][sr] = [];
        groups[lc][pl][sr].push(item);
    });
    return groups;
}

function renderSkuHandbookFilters() {
    const data = getSkuHandbookData();
    const productLines = [...new Set(data.map(i => i.productLine).filter(Boolean))];
    const brands = [...new Set(data.map(i => i.brand).filter(Boolean))];

    const plSelect = document.getElementById('skuh-filter-productline');
    const brSelect = document.getElementById('skuh-filter-brand');
    if (plSelect) {
        plSelect.innerHTML = '<option value="all">All Product Lines</option>' +
            productLines.map(pl => `<option value="${pl}">${pl}</option>`).join('');
        plSelect.value = SkuHandbookState.productLine;
    }
    if (brSelect) {
        brSelect.innerHTML = '<option value="all">All Brands</option>' +
            brands.map(b => `<option value="${b}">${b}</option>`).join('');
        brSelect.value = SkuHandbookState.brand;
    }
}

function renderSkuHandbookStats(data) {
    const statsEl = document.getElementById('skuh-stats');
    if (!statsEl) return;
    const total = data.length;
    const running = data.filter(i => i.lifecycle === 'Running in the Market' || i.lifecycle === 'Running in the market').length;
    const upcoming = data.filter(i => i.lifecycle === 'Upcoming SKU').length;
    const phasing = data.filter(i => i.lifecycle === 'Phasing Out').length;
    var mode = (window.KM && window.KM.DB && window.KM.DB.getDataSourceMode) ? window.KM.DB.getDataSourceMode() : 'mock';
    var modeBadge = mode === 'google-sheet' ? '<span class="skuh-stat skuh-stat--mode">Data: Google Sheet</span>' : '<span class="skuh-stat skuh-stat--mode">Data: Mock</span>';
    statsEl.innerHTML = `
        <div class="skuh-stat"><strong>${total}</strong> Total</div>
        <div class="skuh-stat"><strong>${running}</strong> Running</div>
        <div class="skuh-stat"><strong>${upcoming}</strong> Upcoming</div>
        <div class="skuh-stat"><strong>${phasing}</strong> Phasing Out</div>
        ${modeBadge}
    `;
}

function renderSkuCard(item) {
    const imgHtml = item.image
        ? `<img src="${item.image}" alt="${item.productName}" onerror="this.parentElement.innerHTML='<div class=\\'skuh-placeholder\\'>📦</div>'">`
        : '<div class="skuh-placeholder">📦</div>';

    let badgeClass = 'skuh-badge--lifecycle';
    if (item.lifecycle === 'Upcoming SKU') badgeClass = 'skuh-badge--upcoming';
    if (item.lifecycle === 'Phasing Out') badgeClass = 'skuh-badge--phasing';
    if (item.lifecycle === 'Closure') badgeClass = 'skuh-badge--phasing';
    var sellingBadge = item.isSellingMaterial ? '<span class="skuh-badge skuh-badge--selling">Selling Material</span>' : '';

    return `
        <div class="skuh-card" onclick="openSkuDetailModal('${item.sku}')">
            <div class="skuh-card-img">${imgHtml}</div>
            <div class="skuh-card-body">
                <p class="skuh-card-name">${item.productName}</p>
                <p class="skuh-card-sku">${item.sku}</p>
                <div class="skuh-badges">
                    <span class="skuh-badge ${badgeClass}">${item.lifecycle}</span>
                    <span class="skuh-badge skuh-badge--category">${item.productLine}</span>
                    ${sellingBadge}
                </div>
            </div>
        </div>
    `;
}

function renderSkuHandbookGroups(filtered) {
    const container = document.getElementById('skuh-content');
    if (!container) return;

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="skuh-empty">
                <p>No products found matching your filters.</p>
                <button onclick="clearSkuHandbookFilters()">Clear Filters</button>
            </div>
        `;
        return;
    }

    const groups = groupSkuHandbookItems(filtered);
    const lifecycleOrder = ['Running in the market', 'Running in the Market', 'Upcoming SKU', 'Phasing Out', 'Closure', 'Other'];
    let html = '';

    lifecycleOrder.forEach(lc => {
        if (!groups[lc]) return;
        const lcItems = Object.values(groups[lc]).flatMap(pl => Object.values(pl).flat());
        html += `<div class="skuh-lifecycle-group">
            <h3 class="skuh-lifecycle-title" onclick="toggleSkuhGroup(this)">
                <span class="skuh-arrow">▼</span>${lc}<span class="skuh-count">(${lcItems.length})</span>
            </h3>
            <div class="skuh-lifecycle-content">`;

        Object.keys(groups[lc]).sort().forEach(pl => {
            html += `<div class="skuh-productline-group">
                <h4 class="skuh-productline-title">${pl}</h4>`;

            Object.keys(groups[lc][pl]).sort().forEach(sr => {
                const items = groups[lc][pl][sr];
                html += `<div class="skuh-series-group">
                    <p class="skuh-series-title">${sr} (${items.length})</p>
                    <div class="skuh-card-grid">
                        ${items.map(renderSkuCard).join('')}
                    </div>
                </div>`;
            });

            html += '</div>';
        });

        html += '</div></div>';
    });

    container.innerHTML = html;
}

function renderSkuHandbook() {
    const allData = getSkuHandbookData();
    renderSkuHandbookFilters();
    renderSkuHandbookStats(allData);
    const filtered = applySkuHandbookFilters(allData);
    renderSkuHandbookGroups(filtered);
}

function openSkuDetailModal(sku) {
    const data = getSkuHandbookData();
    const item = data.find(i => i.sku === sku);
    if (!item) return;

    SkuHandbookState.selectedSku = sku;
    renderSkuDetailModal(item);

    const overlay = document.getElementById('skuh-modal-overlay');
    if (overlay) overlay.classList.add('is-open');
}

function closeSkuDetailModal() {
    SkuHandbookState.selectedSku = null;
    const overlay = document.getElementById('skuh-modal-overlay');
    if (overlay) overlay.classList.remove('is-open');
}

function renderSkuDetailModal(item) {
    const modal = document.getElementById('skuh-modal-body');
    if (!modal) return;

    const imgHtml = item.image
        ? `<img src="${item.image}" alt="${item.productName}" onerror="this.parentElement.innerHTML='<div class=\\'skuh-placeholder\\' style=\\'font-size:3rem;color:#cbd5e1\\'>IMG</div>'">`
        : '<div class="skuh-placeholder" style="font-size:3rem;color:#cbd5e1">IMG</div>';

    let badgeClass = 'skuh-badge--lifecycle';
    if (item.lifecycle === 'Upcoming SKU') badgeClass = 'skuh-badge--upcoming';
    if (item.lifecycle === 'Phasing Out' || item.lifecycle === 'Closure') badgeClass = 'skuh-badge--phasing';
    var sellingBadge = item.isSellingMaterial ? '<span class="skuh-badge skuh-badge--selling">Internal / Selling Material</span>' : '';

    // Summary source label
    var summarySourceLabel = '';
    if (item.summarySource === 'product_features_fallback') summarySourceLabel = 'Source: Product Features';
    else if (item.summarySource && item.summarySource.startsWith('handbook_summary')) summarySourceLabel = 'Source: Handbook Summary';
    else summarySourceLabel = 'Source: Not provided';

    // Key points
    var keyPoints = item.displayKeyPoints || (item.keyFeatures ? item.keyFeatures.split('|').filter(function(f){return f.trim();}) : []);
    var keyPointsHtml = '';
    if (keyPoints.length > 0) {
        keyPointsHtml = '<ul class="skuh-modal-list">' + keyPoints.slice(0, 5).map(function(f) { return '<li>' + f.trim() + '</li>'; }).join('') + '</ul>';
    } else {
        keyPointsHtml = '<p style="color:#94a3b8;font-style:italic;">No key features provided yet.</p>';
    }
    var kpSourceLabel = (item.keyPointsSource === 'product_features_bullets') ? 'Source: Product Features bullets' : 'Source: Not provided';

    // Selling material warning
    var sellingWarning = item.isSellingMaterial ? '<div class="skuh-modal-selling-warning">This SKU is used for internal selling material, packaging, spare parts, or operational reference. It may not be a consumer-facing product.</div>' : '';

    // Summary text
    var summaryText = item.displaySummary || item.shortDescription || 'Not provided yet.';

    // Raw reference content
    var rawRef = item.rawReferenceContent;
    var rawHtml = '';
    if (rawRef) {
        var rawBullets = (rawRef.bulletPoints || []).map(function(b, i) { return '<li><strong>Bullet ' + (i+1) + ':</strong> ' + b + '</li>'; }).join('');
        rawHtml = `
            <div class="skuh-modal-section skuh-raw-section">
                <h4 class="skuh-raw-toggle" onclick="this.parentElement.classList.toggle('is-open')">Raw Reference Content <span class="skuh-raw-arrow">▶</span></h4>
                <div class="skuh-raw-content">
                    <div class="skuh-modal-row"><span>Product Title</span><span>${rawRef.productTitle || '—'}</span></div>
                    <div class="skuh-modal-row"><span>Product Description</span></div>
                    <p style="font-size:0.8rem;color:#475569;margin:4px 0 8px;">${rawRef.productDescription || '—'}</p>
                    ${rawBullets ? '<ul class="skuh-modal-list" style="font-size:0.8rem;">' + rawBullets + '</ul>' : ''}
                    <div class="skuh-modal-row"><span>Generic Keyword</span></div>
                    <p style="font-size:0.75rem;color:#64748b;margin:4px 0;word-break:break-all;">${rawRef.genericKeyword || '—'}</p>
                </div>
            </div>`;
    }

    modal.innerHTML = `
        <div class="skuh-modal-img">${imgHtml}</div>
        <h3>${item.productName}</h3>
        <p class="skuh-modal-sku">${item.sku}</p>
        <div class="skuh-badges" style="margin-bottom:16px;">
            <span class="skuh-badge ${badgeClass}">${item.lifecycle}</span>
            <span class="skuh-badge skuh-badge--category">${item.productLine || item.category || ''}</span>
            <span class="skuh-badge skuh-badge--series">${item.series}</span>
            ${sellingBadge}
        </div>
        ${sellingWarning}
        <div class="skuh-modal-section">
            <h4>Employee-Friendly Summary</h4>
            <p style="font-size:0.85rem;line-height:1.6;color:#334155;">${summaryText}</p>
            <p class="skuh-source-label">${summarySourceLabel}</p>
        </div>
        <div class="skuh-modal-section">
            <h4>Key Features</h4>
            ${keyPointsHtml}
            <p class="skuh-source-label">${kpSourceLabel}</p>
        </div>
        <div class="skuh-modal-section">
            <h4>Basic Product Info</h4>
            <div class="skuh-modal-row"><span>SKU</span><span>${item.sku}</span></div>
            <div class="skuh-modal-row"><span>Product Name</span><span>${item.productName}</span></div>
            <div class="skuh-modal-row"><span>Category</span><span>${item.productLine || item.category || '—'}</span></div>
            <div class="skuh-modal-row"><span>Series</span><span>${item.series || '—'}</span></div>
            <div class="skuh-modal-row"><span>Lifecycle</span><span>${item.lifecycle || '—'}</span></div>
            <div class="skuh-modal-row"><span>AMZ ASIN</span><span>${item.amzAsin || item.amz_asin || '—'}</span></div>
            <div class="skuh-modal-row"><span>GS1 Code</span><span>${item.gs1Code || item.gs1_code || '—'}</span></div>
            <div class="skuh-modal-row"><span>GS1 Type</span><span>${item.gs1Type || item.gs1_type || '—'}</span></div>
            <div class="skuh-modal-row"><span>PM</span><span>${item.pm || '—'}</span></div>
            <div class="skuh-modal-row"><span>Item Dimensions</span><span>${item.itemDimensions || item.dimensions || '—'}</span></div>
            <div class="skuh-modal-row"><span>Item Weight</span><span>${item.itemWeight || item.weight || '—'}</span></div>
            <div class="skuh-modal-row"><span>Package Dimensions</span><span>${item.packageDimensions || '—'}</span></div>
            <div class="skuh-modal-row"><span>Package Weight</span><span>${item.packageWeight || '—'}</span></div>
            <div class="skuh-modal-row"><span>Carton Dimensions</span><span>${item.cartonDimensions || '—'}</span></div>
            <div class="skuh-modal-row"><span>Carton Weight</span><span>${item.cartonWeight || '—'}</span></div>
            <div class="skuh-modal-row"><span>Units per Carton</span><span>${item.unitsPerCarton || '—'}</span></div>
            <div class="skuh-modal-row"><span>HS Code</span><span>${item.hsCode || item.hscode || '—'}</span></div>
            <div class="skuh-modal-row"><span>Declared Value</span><span>${item.declaredValue || '—'}</span></div>
            <div class="skuh-modal-row"><span>Minimum Price</span><span>${item.minimumPrice || '—'}</span></div>
            <div class="skuh-modal-row"><span>MSRP</span><span>${item.msrp || '—'}</span></div>
            <div class="skuh-modal-row"><span>Selling Price</span><span>${item.sellingPrice || '—'}</span></div>
        </div>
        ${rawHtml}
    `;
}


function toggleSkuhGroup(el) {
    el.parentElement.classList.toggle('is-collapsed');
}

function clearSkuHandbookFilters() {
    SkuHandbookState.search = '';
    SkuHandbookState.productLine = 'all';
    SkuHandbookState.brand = 'all';
    SkuHandbookState.lifecycle = 'all';
    const searchInput = document.getElementById('skuh-filter-search');
    if (searchInput) searchInput.value = '';
    renderSkuHandbook();
}

function initSkuHandbook() {
    updateSkuhLangButtons();
    renderSkuHandbook();

    // Bind filter events
    const searchInput = document.getElementById('skuh-filter-search');
    const plSelect = document.getElementById('skuh-filter-productline');
    const brSelect = document.getElementById('skuh-filter-brand');
    const lcSelect = document.getElementById('skuh-filter-lifecycle');

    if (searchInput) {
        searchInput.addEventListener('input', function() {
            SkuHandbookState.search = this.value;
            const filtered = applySkuHandbookFilters(getSkuHandbookData());
            renderSkuHandbookGroups(filtered);
        });
    }
    if (plSelect) {
        plSelect.addEventListener('change', function() {
            SkuHandbookState.productLine = this.value;
            const filtered = applySkuHandbookFilters(getSkuHandbookData());
            renderSkuHandbookGroups(filtered);
        });
    }
    if (brSelect) {
        brSelect.addEventListener('change', function() {
            SkuHandbookState.brand = this.value;
            const filtered = applySkuHandbookFilters(getSkuHandbookData());
            renderSkuHandbookGroups(filtered);
        });
    }
    if (lcSelect) {
        lcSelect.addEventListener('change', function() {
            SkuHandbookState.lifecycle = this.value;
            const filtered = applySkuHandbookFilters(getSkuHandbookData());
            renderSkuHandbookGroups(filtered);
        });
    }
}


// --- i18n Integration ---
function t(key) {
    return window.i18n ? i18n.t('sku-handbook', key) : key;
}

function tProduct(series, field) {
    if (!window.i18n) return '';
    const lang = i18n.getLang();
    if (lang === 'en') return ''; // English uses PRODUCT_KNOWLEDGE directly
    const val = i18n.t('product-knowledge', series + '.' + field);
    return (val !== series + '.' + field) ? val : '';
}

function setSkuhLang(lang) {
    if (window.i18n) i18n.setLang(lang);
    updateSkuhLangButtons();
    renderSkuHandbook();
}

function updateSkuhLangButtons() {
    const lang = window.i18n ? i18n.getLang() : 'en';
    document.querySelectorAll('.skuh-lang-btn').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.lang === lang);
    });
    // Update static text
    const title = document.getElementById('skuh-title');
    const subtitle = document.getElementById('skuh-subtitle');
    if (title) title.textContent = t('pageTitle');
    if (subtitle) subtitle.textContent = t('pageSubtitle');
}

// Expose globals
window.initSkuHandbook = initSkuHandbook;
window.renderSkuHandbook = renderSkuHandbook;
window.openSkuDetailModal = openSkuDetailModal;
window.setSkuhLang = setSkuhLang;
window.updateSkuhLangButtons = updateSkuhLangButtons;
window.closeSkuDetailModal = closeSkuDetailModal;
window.toggleSkuhGroup = toggleSkuhGroup;
window.clearSkuHandbookFilters = clearSkuHandbookFilters;

// Lifecycle registration
if (window.KM && window.KM.lifecycle) {
    KM.lifecycle.register('sku-handbook-section', {
        mount() { initSkuHandbook(); },
        unmount() { closeSkuDetailModal(); }
    });
}
