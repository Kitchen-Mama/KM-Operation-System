// Shipping History Page

const shippingHistoryMockData = [
    {
        id: "SP-20250101-001",
        date: "2025-01-01",
        country: "US",
        marketplace: "amazon",
        method: "AGL Ship",
        totalPcs: 76870,
        totalCartons: 1922,
        totalCost: 192175,
        unitCost: 2.5,
        skus: [
            { sku: "A001", qty: 40000 },
            { sku: "B002", qty: 36870 }
        ]
    },
    {
        id: "SP-20250102-002",
        date: "2025-01-02",
        country: "UK",
        marketplace: "amazon",
        method: "Air Freight",
        totalPcs: 12000,
        totalCartons: 300,
        totalCost: 42000,
        unitCost: 3.5,
        skus: [
            { sku: "C003", qty: 12000 }
        ]
    },
    {
        id: "SP-20250103-003",
        date: "2025-01-03",
        country: "US",
        marketplace: "amazon",
        method: "Private Ship",
        totalPcs: 25000,
        totalCartons: 625,
        totalCost: 80000,
        unitCost: 3.2,
        skus: [
            { sku: "D004", qty: 15000 },
            { sku: "E005", qty: 10000 }
        ]
    }
];

const historyState = {
    data: [],
    hasSearched: false
};

function loadHistoryData() {
    // 從 sessionStorage 讀取實際資料
    const storedHistory = sessionStorage.getItem('shippingHistory');
    if (storedHistory) {
        historyState.data = JSON.parse(storedHistory);
    } else {
        // 如果沒有資料，使用 mock data
        historyState.data = shippingHistoryMockData;
    }
}

function initShippingHistoryPage() {
    const searchBtn = document.querySelector(".history-search-btn");
    if (!searchBtn) return;
    
    // 讀取最新資料
    loadHistoryData();
    
    searchBtn.addEventListener("click", onHistorySearch);
    
    // 初始狀態：只顯示空狀態
    renderHistoryResults([]);
}

function onHistorySearch() {
    const params = collectFilterParams();
    const results = filterHistoryData(historyState.data, params);
    
    historyState.hasSearched = true;
    renderHistoryResults(results);
}

function collectFilterParams() {
    const start = document.querySelector(".history-date-start")?.value || "";
    const end = document.querySelector(".history-date-end")?.value || "";
    const country = document.querySelector(".history-filter-country")?.value || "";
    const sku = document.querySelector(".history-filter-sku")?.value.trim() || "";
    const method = document.querySelector(".history-filter-method")?.value || "";
    
    return { start, end, country, sku, method };
}

function filterHistoryData(data, params) {
    return data.filter(item => {
        // Date filter
        if (params.start && item.date < params.start) return false;
        if (params.end && item.date > params.end) return false;
        
        // Country filter
        if (params.country && item.country !== params.country) return false;
        
        // SKU filter
        if (params.sku) {
            const hasSku = item.skus.some(s => 
                s.sku.toLowerCase().includes(params.sku.toLowerCase())
            );
            if (!hasSku) return false;
        }
        
        // Method filter
        if (params.method && item.method !== params.method) return false;
        
        return true;
    });
}

function renderHistoryResults(list) {
    const emptyStateEl = document.querySelector(".history-empty-state");
    const listEl = document.querySelector(".history-list");
    
    if (!emptyStateEl || !listEl) return;
    
    if (!historyState.hasSearched) {
        // 第一次進來尚未按 Search
        emptyStateEl.innerHTML = 'Use the filters above and click <strong>Search</strong> to view shipping history.';
        emptyStateEl.hidden = false;
        listEl.hidden = true;
        listEl.innerHTML = "";
        return;
    }
    
    if (!list || list.length === 0) {
        emptyStateEl.textContent = "No shipping records found for the selected filters.";
        emptyStateEl.hidden = false;
        listEl.hidden = true;
        listEl.innerHTML = "";
        return;
    }
    
    // 有資料：隱藏空狀態，顯示列表
    emptyStateEl.hidden = true;
    listEl.hidden = false;
    
    listEl.innerHTML = list.map(shipment => renderHistoryCard(shipment)).join("");
}

function renderHistoryCard(shipment) {
    const cardId = `history-card-${shipment.id}`;
    return `
        <div class="history-card" id="${cardId}" style="border: 1px solid #E2E8F0; border-radius: 8px; background: white;">
            <div class="history-card-header" style="padding: 16px; display: flex; justify-content: space-between; align-items: center; cursor: pointer;" onclick="toggleHistoryCard('${shipment.id}')">
                <div>
                    <strong style="font-size: 14px;">${shipment.id}</strong>
                    <span style="margin-left: 12px; color: #64748B; font-size: 13px;">${shipment.date}</span>
                </div>
                <div style="display: flex; gap: 16px; align-items: center; font-size: 13px;">
                    <span><strong>Country:</strong> ${shipment.country}</span>
                    <span><strong>Method:</strong> ${shipment.method}</span>
                    <span><strong>Total Pcs:</strong> ${shipment.totalPcs.toLocaleString()}</span>
                    <span><strong>Cost:</strong> $${shipment.totalCost.toLocaleString()}</span>
                    <button class="history-expand-btn" style="padding: 6px 12px; border: 1px solid #E2E8F0; border-radius: 4px; background: white; cursor: pointer; font-size: 13px; color: #3B82F6;" onclick="event.stopPropagation(); toggleHistoryCard('${shipment.id}')">
                        Expand
                    </button>
                </div>
            </div>
            <div class="history-card-details" style="display: none; padding: 16px; border-top: 1px solid #E2E8F0; background: #F8FAFC;">
                <h4 style="font-size: 14px; margin-bottom: 12px; color: #1E293B;">SKU Details</h4>
                <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
                    <thead>
                        <tr style="background: #F1F5F9;">
                            <th style="padding: 8px; text-align: left; border-bottom: 1px solid #E2E8F0;">SKU</th>
                            <th style="padding: 8px; text-align: right; border-bottom: 1px solid #E2E8F0;">Quantity</th>
                            <th style="padding: 8px; text-align: right; border-bottom: 1px solid #E2E8F0;">Cartons</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${shipment.skus.map(sku => {
                            const cartons = Math.ceil(sku.qty / 40);
                            return `
                            <tr>
                                <td style="padding: 8px; border-bottom: 1px solid #F1F5F9;">${sku.sku}</td>
                                <td style="padding: 8px; text-align: right; border-bottom: 1px solid #F1F5F9;">${sku.qty.toLocaleString()}</td>
                                <td style="padding: 8px; text-align: right; border-bottom: 1px solid #F1F5F9;">${cartons}</td>
                            </tr>
                        `}).join('')}
                    </tbody>
                </table>
                <div style="margin-top: 16px; display: flex; justify-content: space-between; padding: 12px; background: white; border-radius: 4px; border: 1px solid #E2E8F0;">
                    <div>
                        <span style="color: #64748B; font-size: 12px;">Total Cartons:</span>
                        <strong style="margin-left: 8px; font-size: 14px;">${shipment.totalCartons}</strong>
                    </div>
                    <div>
                        <span style="color: #64748B; font-size: 12px;">Unit Cost:</span>
                        <strong style="margin-left: 8px; font-size: 14px;">$${shipment.unitCost.toFixed(2)}</strong>
                    </div>
                    <div>
                        <span style="color: #64748B; font-size: 12px;">Total Cost:</span>
                        <strong style="margin-left: 8px; font-size: 14px; color: #3B82F6;">$${shipment.totalCost.toLocaleString()}</strong>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function toggleHistoryCard(shipmentId) {
    const card = document.getElementById(`history-card-${shipmentId}`);
    if (!card) return;
    
    const details = card.querySelector('.history-card-details');
    const btn = card.querySelector('.history-expand-btn');
    
    if (details.style.display === 'none') {
        details.style.display = 'block';
        if (btn) btn.textContent = 'Collapse';
    } else {
        details.style.display = 'none';
        if (btn) btn.textContent = 'Expand';
    }
}

window.toggleHistoryCard = toggleHistoryCard;

// 當頁面切換到 Shipping History 時初始化
window.initShippingHistoryPage = initShippingHistoryPage;

window.addEventListener('DOMContentLoaded', () => {
    // 延遲初始化，確保 DOM 已載入
    setTimeout(() => {
        const historySection = document.getElementById('shippinghistory-section');
        if (historySection) {
            initShippingHistoryPage();
        }
    }, 100);
});
