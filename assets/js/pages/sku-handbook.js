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
    // Use override system to include imported SKUs
    if (window.getAllSkuDataWithOverrides) {
        const groups = getAllSkuDataWithOverrides();
        Object.entries(groups).forEach(([lifecycle, items]) => {
            items.forEach(item => {
                const normalized = normalizeSkuHandbookItem(item, lifecycle);
                // Enrich with product knowledge
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
    'CO1100': {
        shortDescription: 'One-touch automatic electric can opener. Smooth edge cutting, no sharp edges. Ergonomic design for easy grip.',
        keyFeatures: 'One-touch operation|Smooth edge cutting (no sharp edges)|Ergonomic soft-grip handle|Battery powered (4x AA)|Works on most standard cans|Auto-stop when complete|Compact & portable',
        sellingPoints: 'Safest can opener for families with kids|No hand strain - perfect for seniors & arthritis|Opens cans in seconds with one button|No sharp edges on lid or can|#1 Best Seller on Amazon',
        useCases: 'Daily kitchen use|Elderly & arthritis-friendly|Camping & outdoor|Gift for parents/grandparents|RV & boat kitchens',
        material: 'ABS Plastic + Stainless Steel Blade'
    },
    'CO1150': {
        shortDescription: 'Auto 2.0 - upgraded electric can opener with improved motor, faster cutting speed, and modern colorways.',
        keyFeatures: 'Upgraded 2.0 motor (30% faster)|One-touch smooth edge cutting|New trendy color options|Improved battery life|Universal fit for standard cans|Auto-stop mechanism|Magnetic lid holder',
        sellingPoints: 'Next-gen upgrade from best-selling CO1100|Faster opening speed|Premium color options for modern kitchens|Same safety features families love|Great for gifting',
        useCases: 'Daily kitchen use|Modern kitchen aesthetic|Upgrade from CO1100|Holiday gift sets|Housewarming gifts',
        material: 'ABS Plastic + Stainless Steel Blade'
    },
    'SP3120': {
        shortDescription: 'Waltzgrip silicone basting brushes with ergonomic handle. Heat-resistant, BPA-free, dishwasher safe.',
        keyFeatures: 'Heat resistant up to 480°F/250°C|BPA-free food-grade silicone|Ergonomic Waltzgrip handle|Dishwasher safe|No bristle shedding|Even sauce distribution|Hanging hole for storage',
        sellingPoints: 'Won\'t shed bristles like traditional brushes|Safe for non-stick cookware|Easy to clean - dishwasher safe|Comfortable grip reduces hand fatigue|Vibrant colors to match any kitchen',
        useCases: 'BBQ & grilling|Baking (egg wash, butter)|Marinading meats|Oiling pans|Sauce application',
        material: 'Food-grade Silicone + PP Handle'
    },
    'SP3410': {
        shortDescription: 'Waltzgrip silicone pancake turner/spatula. Flexible, heat-resistant, perfect for flipping delicate foods.',
        keyFeatures: 'Thin flexible edge for easy sliding|Heat resistant up to 480°F/250°C|BPA-free food-grade silicone|Safe for non-stick cookware|Ergonomic Waltzgrip handle|Wide surface area|Dishwasher safe',
        sellingPoints: 'Perfect flip every time - thin flexible edge|Won\'t scratch non-stick pans|Comfortable grip for extended cooking|Easy to clean|Great for pancakes, eggs, fish, burgers',
        useCases: 'Pancakes & crepes|Eggs (fried, omelettes)|Fish fillets|Burgers & patties|Cookies & baking',
        material: 'Food-grade Silicone + PP Handle'
    },
    'MO5600': {
        shortDescription: 'Manual can opener with smooth edge cutting technology. No electricity needed, portable and reliable.',
        keyFeatures: 'Smooth edge cut (no sharp edges)|Manual operation - no batteries needed|Heavy-duty stainless steel blade|Ergonomic soft-grip handles|Built-in bottle opener|Compact & lightweight|Rust-resistant',
        sellingPoints: 'Safe smooth edge - no cuts|Always works - no batteries or charging|Durable stainless steel construction|Comfortable even for extended use|Multi-function with bottle opener',
        useCases: 'Emergency preparedness|Camping & hiking|RV & boat|Power outage backup|Everyday kitchen use',
        material: 'Stainless Steel + TPR Soft Grip Handle'
    }
};

function getProductKnowledge(sku, series, category) {
    const knowledge = PRODUCT_KNOWLEDGE[series] || {};
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
        filtered = filtered.filter(i =>
            i.sku.toLowerCase().includes(q) ||
            i.productName.toLowerCase().includes(q) ||
            i.series.toLowerCase().includes(q) ||
            i.productLine.toLowerCase().includes(q)
        );
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
    const running = data.filter(i => i.lifecycle === 'Running in the market').length;
    const upcoming = data.filter(i => i.lifecycle === 'Upcoming SKU').length;
    const phasing = data.filter(i => i.lifecycle === 'Phasing Out').length;
    statsEl.innerHTML = `
        <div class="skuh-stat"><strong>${total}</strong> Total</div>
        <div class="skuh-stat"><strong>${running}</strong> Running</div>
        <div class="skuh-stat"><strong>${upcoming}</strong> Upcoming</div>
        <div class="skuh-stat"><strong>${phasing}</strong> Phasing Out</div>
    `;
}

function renderSkuCard(item) {
    const imgHtml = item.image
        ? `<img src="${item.image}" alt="${item.productName}" onerror="this.parentElement.innerHTML='<div class=\\'skuh-placeholder\\'>📦</div>'">`
        : '<div class="skuh-placeholder">📦</div>';

    let badgeClass = 'skuh-badge--lifecycle';
    if (item.lifecycle === 'Upcoming SKU') badgeClass = 'skuh-badge--upcoming';
    if (item.lifecycle === 'Phasing Out') badgeClass = 'skuh-badge--phasing';

    return `
        <div class="skuh-card" onclick="openSkuDetailModal('${item.sku}')">
            <div class="skuh-card-img">${imgHtml}</div>
            <div class="skuh-card-body">
                <p class="skuh-card-name">${item.productName}</p>
                <p class="skuh-card-sku">${item.sku}</p>
                <div class="skuh-badges">
                    <span class="skuh-badge ${badgeClass}">${item.lifecycle}</span>
                    <span class="skuh-badge skuh-badge--category">${item.productLine}</span>
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
        ? `<img src="${item.image}" alt="${item.productName}" onerror="this.parentElement.innerHTML='<div class=\\'skuh-placeholder\\' style=\\'font-size:3rem;color:#cbd5e1\\'>📦</div>'">`
        : '<div class="skuh-placeholder" style="font-size:3rem;color:#cbd5e1">📦</div>';

    let badgeClass = 'skuh-badge--lifecycle';
    if (item.lifecycle === 'Upcoming SKU') badgeClass = 'skuh-badge--upcoming';
    if (item.lifecycle === 'Phasing Out') badgeClass = 'skuh-badge--phasing';

    modal.innerHTML = `
        <div class="skuh-modal-img">${imgHtml}</div>
        <h3>${item.productName}</h3>
        <p class="skuh-modal-sku">${item.sku}</p>
        <div class="skuh-badges" style="margin-bottom:16px;">
            <span class="skuh-badge ${badgeClass}">${item.lifecycle}</span>
            <span class="skuh-badge skuh-badge--category">${item.productLine}</span>
            <span class="skuh-badge skuh-badge--series">${item.series}</span>
        </div>
        <div class="skuh-modal-section">
            <h4>Basic Info</h4>
            <div class="skuh-modal-row"><span>Dimensions</span><span>${item.dimensions || '—'}</span></div>
            <div class="skuh-modal-row"><span>Weight</span><span>${item.weight || '—'}</span></div>
            <div class="skuh-modal-row"><span>Material</span><span>${item.material || '—'}</span></div>
            <div class="skuh-modal-row"><span>MSRP</span><span>${item.msrp || '—'}</span></div>
            <div class="skuh-modal-row"><span>Selling Price</span><span>${item.sellingPrice || '—'}</span></div>
            <div class="skuh-modal-row"><span>HS Code</span><span>${item.hscode || '—'}</span></div>
            <div class="skuh-modal-row"><span>PM</span><span>${item.pm || '—'}</span></div>
        </div>
        <div class="skuh-modal-section">
            <h4>Product Knowledge</h4>
            ${item.shortDescription ? '<div class="skuh-modal-row"><span>Description</span><span>' + item.shortDescription + '</span></div>' : ''}
            ${item.keyFeatures ? '<div class="skuh-modal-subsection"><strong>Key Features</strong><ul class="skuh-modal-list">' + item.keyFeatures.split('|').map(f => '<li>' + f.trim() + '</li>').join('') + '</ul></div>' : ''}
            ${item.sellingPoints ? '<div class="skuh-modal-subsection"><strong>Selling Points</strong><ul class="skuh-modal-list">' + item.sellingPoints.split('|').map(f => '<li>' + f.trim() + '</li>').join('') + '</ul></div>' : ''}
            ${item.useCases ? '<div class="skuh-modal-subsection"><strong>Use Cases</strong><ul class="skuh-modal-list">' + item.useCases.split('|').map(f => '<li>' + f.trim() + '</li>').join('') + '</ul></div>' : ''}
            ${item.notes ? '<div class="skuh-modal-row"><span>Notes</span><span>' + item.notes + '</span></div>' : ''}
        </div>
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

// Expose globals
window.initSkuHandbook = initSkuHandbook;
window.renderSkuHandbook = renderSkuHandbook;
window.openSkuDetailModal = openSkuDetailModal;
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
