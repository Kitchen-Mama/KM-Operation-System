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
    (window.upcomingSkuData || []).forEach(item => {
        all.push(normalizeSkuHandbookItem(item, 'Upcoming SKU'));
    });
    (window.runningSkuData || []).forEach(item => {
        all.push(normalizeSkuHandbookItem(item, 'Running in the market'));
    });
    (window.phasingOutSkuData || []).forEach(item => {
        all.push(normalizeSkuHandbookItem(item, 'Phasing Out'));
    });
    return all;
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
            <div class="skuh-modal-row"><span>Description</span><span>${item.shortDescription || 'Not provided yet'}</span></div>
            <div class="skuh-modal-row"><span>Key Features</span><span>${item.keyFeatures || 'Not provided yet'}</span></div>
            <div class="skuh-modal-row"><span>Selling Points</span><span>${item.sellingPoints || 'Not provided yet'}</span></div>
            <div class="skuh-modal-row"><span>Use Cases</span><span>${item.useCases || 'Not provided yet'}</span></div>
            <div class="skuh-modal-row"><span>Notes</span><span>${item.notes || 'Not provided yet'}</span></div>
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
