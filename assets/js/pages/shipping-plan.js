// ========================================
// Shipping Plan Page Logic
// 從 app.js 搬移，不改行為
// ========================================

function _spUseDb() {
    return !!(window.KM && window.KM.DB && window.KM.DB.isCloudWriteEnabled &&
        window.KM.DB.isCloudWriteEnabled() && window.KM.DB.getShippingPlans);
}

// Set a section-title count badge (e.g. Draft / Pending Approval / Approved). Safe no-op if absent.
function _spSetSectionCount(id, n) {
    var el = document.getElementById(id);
    if (el) el.textContent = n;
}

function renderShippingPlan() {
    // Cloud (DB) path: read shipping_plans / shipping_plan_lines. Falls back to the legacy
    // sessionStorage rendering only when cloud write is not enabled (Demo / unconfigured).
    if (_spUseDb()) { renderShippingPlanFromDb(); return; }

    console.log('=== Render Shipping Plan ===');
    const allPlansStr = sessionStorage.getItem('allShippingPlans');
    console.log('sessionStorage data:', allPlansStr);

    if (!allPlansStr) {
        console.log('No data in sessionStorage');
        document.getElementById('shippingPlanCards').innerHTML = '<p>No shipping plans available.</p>';
        document.getElementById('pendingApprovalCards').innerHTML = '<p>No pending approvals.</p>';
        document.getElementById('approvedCards').innerHTML = '<p>No approved plans.</p>';
        return;
    }

    let allPlans = JSON.parse(allPlansStr);

    allPlans = allPlans.map(plan => {
        if (!plan.status || typeof plan.status === 'string') {
            const newStatus = {};
            Object.keys(plan.plans).forEach(method => {
                newStatus[method] = plan.status || 'draft';
            });
            plan.status = newStatus;
        }
        if (!plan.notes) {
            plan.notes = {};
        }
        return plan;
    });

    console.log('Parsed allPlans:', allPlans);

    const countryFilter = document.getElementById('spCountryFilter').value;
    const filteredPlans = countryFilter ? allPlans.filter(p => p.country === countryFilter) : allPlans;

    const draftPlans = filteredPlans.filter(p => {
        return Object.keys(p.plans).some(method => p.status[method] === 'draft');
    });
    const pendingPlans = filteredPlans.filter(p => {
        return Object.keys(p.plans).some(method => p.status[method] === 'pendingApproval');
    });
    const approvedPlans = filteredPlans.filter(p => {
        return Object.keys(p.plans).some(method => p.status[method] === 'approved');
    });

    // Section count badges (visual — matches Request Order Draft's count display).
    _spSetSectionCount('draftSectionCount', draftPlans.length);
    _spSetSectionCount('pendingSectionCount', pendingPlans.length);
    _spSetSectionCount('approvedSectionCount', approvedPlans.length);

    if (allPlans.length === 0) {
        document.getElementById('shippingPlanCards').innerHTML = '<p>No shipping plans available.</p>';
        document.getElementById('pendingApprovalCards').innerHTML = '<p>No pending approvals.</p>';
        document.getElementById('approvedCards').innerHTML = '<p>No approved plans.</p>';
        return;
    }

    const draftCardCount = renderPlanCards('shippingPlanCards', draftPlans, 'draft', 0);
    const pendingCardCount = renderPlanCards('pendingApprovalCards', pendingPlans, 'pendingApproval', draftCardCount);
    renderPlanCards('approvedCards', approvedPlans, 'approved', pendingCardCount);

    console.log('Render complete');
}

function renderPlanCards(containerId, plans, statusType, startIndex) {
    const cardsContainer = document.getElementById(containerId);
    cardsContainer.innerHTML = '';

    let hasMatchingPlans = false;
    plans.forEach(planData => {
        if (!planData.status || typeof planData.status === 'string') {
            planData.status = {};
            Object.keys(planData.plans).forEach(m => planData.status[m] = 'draft');
        }
        if (!planData.notes) {
            planData.notes = {};
        }
        Object.keys(planData.plans).forEach(method => {
            if (planData.status[method] === statusType) {
                hasMatchingPlans = true;
            }
        });
    });

    if (!hasMatchingPlans) {
        const messages = {
            'draft': 'No shipping plans available.',
            'pendingApproval': 'No pending approvals.',
            'approved': 'No approved plans.'
        };
        cardsContainer.innerHTML = `<p>${messages[statusType]}</p>`;
        return startIndex;
    }

    let cardIndex = startIndex;
    plans.forEach(planData => {
        if (!planData.status || typeof planData.status === 'string') {
            planData.status = {};
            Object.keys(planData.plans).forEach(m => planData.status[m] = 'draft');
        }
        if (!planData.notes) {
            planData.notes = {};
        }
        Object.keys(planData.plans).forEach(m => {
            if (!Array.isArray(planData.notes[m])) {
                planData.notes[m] = planData.notes[m] ? [planData.notes[m]] : [];
            }
        });

        Object.keys(planData.plans).forEach(method => {
            if (planData.status[method] !== statusType) return;
            const skus = planData.plans[method];
            const totalPcs = skus.reduce((sum, item) => sum + item.qty, 0);
            const mockData = replenishmentMockData.find(m => m.sku === skus[0].sku);
            const unitsPerCarton = mockData?.unitsPerCarton || 40;
            const totalCartons = Math.ceil(totalPcs / unitsPerCarton);
            const totalCost = totalPcs * 2.5;
            const unitCost = 2.5;

            let actionButtons;
            if (statusType === 'draft') {
                actionButtons = `
                    <button class="sp-btn sp-btn-expand" onclick="toggleShippingPlanCard(${cardIndex})">Expand</button>
                    <button class="sp-btn sp-btn-submit" onclick="submitToPending(${planData.id}, '${method}')">Submit</button>
                    <button class="sp-btn sp-btn-cancel" onclick="cancelShippingPlanCard(${planData.id}, '${method}')">Cancel</button>
                `;
            } else if (statusType === 'pendingApproval') {
                actionButtons = `
                    <button class="sp-btn sp-btn-expand" onclick="toggleShippingPlanCard(${cardIndex})">Expand</button>
                    <button class="sp-btn sp-btn-submit" onclick="approvePlan(${planData.id}, '${method}')">Approve</button>
                    <button class="sp-btn sp-btn-cancel" onclick="sendBackToDraft(${planData.id}, '${method}')">Send Back</button>
                `;
            } else {
                actionButtons = `
                    <button class="sp-btn sp-btn-expand" onclick="toggleShippingPlanCard(${cardIndex})">Expand</button>
                    <button class="sp-btn sp-btn-submit" onclick="markAsDone(${planData.id}, '${method}')">Done</button>
                `;
            }

            const card = document.createElement('div');
            card.className = 'sp-card';
            card.setAttribute('data-plan-id', planData.id);
            card.setAttribute('data-method', method);
            card.setAttribute('data-status', statusType);
            card.innerHTML = `
                <div class="sp-card-header">
                    <div class="sp-card-summary">
                        <div class="sp-summary-item">
                            <span class="sp-summary-label">Status</span>
                            <span class="plan-status-badge plan-status-badge--${statusType}">${statusType === 'draft' ? 'Draft' : statusType === 'pendingApproval' ? 'Pending Approval' : 'Approved'}</span>
                        </div>
                        <div class="sp-summary-item">
                            <span class="sp-summary-label">Submitted Date</span>
                            <span class="sp-summary-value">${planData.date}</span>
                        </div>
                        <div class="sp-summary-item">
                            <span class="sp-summary-label">Country</span>
                            <span class="sp-summary-value">${planData.country}</span>
                        </div>
                        <div class="sp-summary-item">
                            <span class="sp-summary-label">Marketplace</span>
                            <span class="sp-summary-value">${planData.marketplace}</span>
                        </div>
                        <div class="sp-summary-item">
                            <span class="sp-summary-label">Shipping Method</span>
                            <span class="sp-summary-value">${method}</span>
                        </div>
                        <div class="sp-summary-item">
                            <span class="sp-summary-label">Total SKU</span>
                            <span class="sp-summary-value">${skus.length}</span>
                        </div>
                        <div class="sp-summary-item">
                            <span class="sp-summary-label">Total Pcs</span>
                            <span class="sp-summary-value">${totalPcs}</span>
                        </div>
                        <div class="sp-summary-item">
                            <span class="sp-summary-label">Total Cartons</span>
                            <span class="sp-summary-value">${totalCartons}</span>
                        </div>
                        <div class="sp-summary-item">
                            <span class="sp-summary-label">Total Cost</span>
                            <span class="sp-summary-value">$${totalCost.toFixed(2)}</span>
                        </div>
                        <div class="sp-summary-item">
                            <span class="sp-summary-label">Unit Cost</span>
                            <span class="sp-summary-value">$${unitCost.toFixed(2)}</span>
                        </div>
                    </div>
                    <div class="sp-card-actions">
                        ${actionButtons}
                    </div>
                </div>
                <div class="sp-card-details">
                    <div class="sp-details-grid">
                        <div class="sp-section">
                            <h4 class="sp-section-title">SKU Shipping Details</h4>
                            <table class="sp-sku-table">
                                <thead>
                                    <tr>
                                        <th>SKU</th>
                                        <th>Current Stock</th>
                                        <th>Avg. Sales</th>
                                        <th>Days of Supply</th>
                                        <th>Shipping Qty</th>
                                        <th>Cartons</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${skus.map(item => {
                                        const itemMockData = replenishmentMockData.find(m => m.sku === item.sku);
                                        const itemUnitsPerCarton = itemMockData?.unitsPerCarton || 40;
                                        return `
                                        <tr>
                                            <td>${item.sku}</td>
                                            <td>${item.skuData.currentInventory}</td>
                                            <td>${item.skuData.avgDailySales}</td>
                                            <td>${item.skuData.daysOfSupply}</td>
                                            <td>
                                                <input type="number" value="${item.qty}" max="${item.qty}"
                                                       oninput="validateShippingQty(this, ${item.qty})"
                                                       style="text-align: right;">
                                                <div class="qty-error" style="display: none; color: #EF4444; font-size: 11px; margin-top: 2px;">\u4e0d\u53ef\u5927\u65bc ${item.qty}</div>
                                            </td>
                                            <td>${Math.ceil(item.qty / itemUnitsPerCarton)}</td>
                                        </tr>
                                    `}).join('')}
                                </tbody>
                            </table>
                        </div>
                        <div class="sp-section">
                            <h4 class="sp-section-title" style="display: flex; justify-content: space-between; align-items: center;">
                                <span>Plan Rationale</span>
                                <button class="sp-btn sp-btn-submit" onclick="showNoteInput(${cardIndex})" style="font-size: 12px; padding: 4px 12px;">+ Add Note</button>
                            </h4>
                            <div class="sp-rationale-text">
                                <div class="sp-rationale-item"><strong>Target Days:</strong> ${planData.targetDays}</div>
                                <div class="sp-rationale-item"><strong>Method:</strong> ${method}</div>
                                <div id="note-input-${cardIndex}" style="display: none; margin-top: 8px;">
                                    <textarea id="note-text-${cardIndex}" style="width: 100%; min-height: 60px; padding: 8px; border: 1px solid #E2E8F0; border-radius: 4px; font-size: 13px; resize: vertical;"></textarea>
                                    <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px;">
                                        <button onclick="cancelNote(${cardIndex})" style="background: #EF4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">\u2715</button>
                                        <button onclick="saveNote(${cardIndex})" style="background: #10B981; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">\u2713</button>
                                    </div>
                                </div>
                                <div id="note-display-${cardIndex}" style="margin-top: 8px;">${planData.notes[method] && planData.notes[method].length > 0 ? planData.notes[method].map(note => `<div class="sp-rationale-item" style="background: #F0F9FF; padding: 8px; border-radius: 4px; border-left: 3px solid #3B82F6; margin-bottom: 4px;"><strong>Note:</strong> ${note}</div>`).join('') : ''}</div>
                            </div>
                        </div>
                        <div class="sp-section">
                            <h4 class="sp-section-title">Cost Breakdown</h4>
                            <div class="sp-cost-row">
                                <span class="sp-cost-label">Carrier Name</span>
                                <select onchange="updateCarrierCost(${cardIndex}, this.value, ${totalPcs})" style="padding: 4px 8px; border: 1px solid #E2E8F0; border-radius: 4px; font-size: 13px;">
                                    <option value="DHL">DHL</option>
                                    <option value="FedEx">FedEx</option>
                                    <option value="UPS">UPS</option>
                                    <option value="Maersk">Maersk</option>
                                </select>
                            </div>
                            <div class="sp-cost-row">
                                <span class="sp-cost-label">Carrier Fee</span>
                                <span class="sp-cost-value" id="carrier-fee-${cardIndex}">$${(totalCost * 0.7).toFixed(2)}</span>
                            </div>
                            <div class="sp-cost-row">
                                <span class="sp-cost-label">Duty / Custom</span>
                                <span class="sp-cost-value" id="duty-${cardIndex}">$${(totalCost * 0.3).toFixed(2)}</span>
                            </div>
                            <div class="sp-cost-row">
                                <span class="sp-cost-label">Total Cost</span>
                                <span class="sp-cost-value" id="total-cost-${cardIndex}">$${totalCost.toFixed(2)}</span>
                            </div>
                            <div class="sp-cost-row">
                                <span class="sp-cost-label">Unit Cost</span>
                                <span class="sp-cost-value" id="unit-cost-${cardIndex}">$${unitCost.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            cardsContainer.appendChild(card);
            cardIndex++;
        });
    });

    return cardIndex;
}

function toggleShippingPlanCard(index) {
    const cards = document.querySelectorAll('.sp-card');
    const card = cards[index];
    const btn = card.querySelector('.sp-btn-expand');
    card.classList.toggle('is-expanded');
    btn.textContent = card.classList.contains('is-expanded') ? 'Collapse' : 'Expand';
}

function submitShippingPlanCard(index) {
    alert('Shipping Plan submitted successfully!');
}

function cancelShippingPlanCard(planId, method) {
    if (!confirm('Cancel this shipping plan?')) return;
    const allPlansStr = sessionStorage.getItem('allShippingPlans');
    if (allPlansStr) {
        const allPlans = JSON.parse(allPlansStr);
        const plan = allPlans.find(p => p.id === planId);
        if (plan && plan.plans[method]) {
            delete plan.plans[method];
            if (Object.keys(plan.plans).length === 0) {
                const planIndex = allPlans.findIndex(p => p.id === planId);
                if (planIndex >= 0) {
                    allPlans.splice(planIndex, 1);
                }
            }
            sessionStorage.setItem('allShippingPlans', JSON.stringify(allPlans));
        }
    }
    renderShippingPlan();
}

function validateShippingQty(input, maxQty) {
    const value = parseInt(input.value) || 0;
    const errorDiv = input.nextElementSibling;
    if (value > maxQty) {
        input.style.border = '2px solid #EF4444';
        input.style.background = '#FEE2E2';
        if (errorDiv) errorDiv.style.display = 'block';
    } else {
        input.style.border = '1px solid #E2E8F0';
        input.style.background = 'white';
        if (errorDiv) errorDiv.style.display = 'none';
    }
}

function showNoteInput(cardIndex) {
    const inputDiv = document.getElementById(`note-input-${cardIndex}`);
    if (inputDiv) {
        inputDiv.style.display = 'block';
    }
}

function cancelNote(cardIndex) {
    const inputDiv = document.getElementById(`note-input-${cardIndex}`);
    const textarea = document.getElementById(`note-text-${cardIndex}`);
    if (inputDiv) inputDiv.style.display = 'none';
    if (textarea) textarea.value = '';
}

function saveNote(cardIndex) {
    const textarea = document.getElementById(`note-text-${cardIndex}`);
    const displayDiv = document.getElementById(`note-display-${cardIndex}`);
    const inputDiv = document.getElementById(`note-input-${cardIndex}`);
    const cards = document.querySelectorAll('.sp-card');
    const card = cards[cardIndex];
    if (textarea && displayDiv && card) {
        const noteText = textarea.value.trim();
        if (noteText) {
            const planId = parseInt(card.getAttribute('data-plan-id'));
            const method = card.getAttribute('data-method');
            const allPlansStr = sessionStorage.getItem('allShippingPlans');
            if (allPlansStr) {
                const allPlans = JSON.parse(allPlansStr);
                const plan = allPlans.find(p => p.id === planId);
                if (plan) {
                    if (!plan.notes) plan.notes = {};
                    if (!Array.isArray(plan.notes[method])) plan.notes[method] = [];
                    plan.notes[method].push(noteText);
                    sessionStorage.setItem('allShippingPlans', JSON.stringify(allPlans));
                }
            }
            const newNoteHtml = `<div class="sp-rationale-item" style="background: #F0F9FF; padding: 8px; border-radius: 4px; border-left: 3px solid #3B82F6; margin-bottom: 4px;"><strong>Note:</strong> ${noteText}</div>`;
            displayDiv.innerHTML += newNoteHtml;
            textarea.value = '';
            if (inputDiv) inputDiv.style.display = 'none';
        }
    }
}

function updateCarrierCost(cardIndex, carrier, totalPcs) {
    const carrierRates = {
        'DHL': 3.5,
        'FedEx': 3.2,
        'UPS': 3.0,
        'Maersk': 2.0
    };
    const unitCost = carrierRates[carrier] || 2.5;
    const totalCost = totalPcs * unitCost;
    const carrierFee = totalCost * 0.7;
    const duty = totalCost * 0.3;
    document.getElementById(`carrier-fee-${cardIndex}`).textContent = `$${carrierFee.toFixed(2)}`;
    document.getElementById(`duty-${cardIndex}`).textContent = `$${duty.toFixed(2)}`;
    document.getElementById(`total-cost-${cardIndex}`).textContent = `$${totalCost.toFixed(2)}`;
    document.getElementById(`unit-cost-${cardIndex}`).textContent = `$${unitCost.toFixed(2)}`;
}

function submitToPending(planId, method) {
    const allPlansStr = sessionStorage.getItem('allShippingPlans');
    if (!allPlansStr) return;
    const allPlans = JSON.parse(allPlansStr);
    const plan = allPlans.find(p => p.id === planId);
    if (plan) {
        if (!plan.status || typeof plan.status === 'string') {
            plan.status = {};
        }
        plan.status[method] = 'pendingApproval';
        sessionStorage.setItem('allShippingPlans', JSON.stringify(allPlans));
        renderShippingPlan();
    }
}

function approvePlan(planId, method) {
    const allPlansStr = sessionStorage.getItem('allShippingPlans');
    if (!allPlansStr) return;
    const allPlans = JSON.parse(allPlansStr);
    const plan = allPlans.find(p => p.id === planId);
    if (plan) {
        if (!plan.status || typeof plan.status === 'string') {
            plan.status = {};
        }
        plan.status[method] = 'approved';
        sessionStorage.setItem('allShippingPlans', JSON.stringify(allPlans));
        renderShippingPlan();
    }
}

function sendBackToDraft(planId, method) {
    const allPlansStr = sessionStorage.getItem('allShippingPlans');
    if (!allPlansStr) return;
    const allPlans = JSON.parse(allPlansStr);
    const plan = allPlans.find(p => p.id === planId);
    if (plan) {
        if (!plan.status || typeof plan.status === 'string') {
            plan.status = {};
        }
        plan.status[method] = 'draft';
        sessionStorage.setItem('allShippingPlans', JSON.stringify(allPlans));
        renderShippingPlan();
    }
}

function markAsDone(planId, method) {
    const allPlansStr = sessionStorage.getItem('allShippingPlans');
    if (!allPlansStr) return;
    const allPlans = JSON.parse(allPlansStr);
    const plan = allPlans.find(p => p.id === planId);
    if (plan && plan.plans[method]) {
        const skus = plan.plans[method];
        const totalPcs = skus.reduce((sum, item) => sum + item.qty, 0);
        const mockData = replenishmentMockData.find(m => m.sku === skus[0].sku);
        const unitsPerCarton = mockData?.unitsPerCarton || 40;
        const totalCartons = Math.ceil(totalPcs / unitsPerCarton);
        const unitCost = 2.5;
        const totalCost = totalPcs * unitCost;
        const historyRecord = {
            id: `SP-${plan.date.replace(/-/g, '')}-${plan.id}`,
            date: new Date().toISOString().split('T')[0],
            country: plan.country,
            marketplace: plan.marketplace,
            method: method,
            totalPcs: totalPcs,
            totalCartons: totalCartons,
            totalCost: totalCost,
            unitCost: unitCost,
            skus: skus.map(item => ({ sku: item.sku, qty: item.qty }))
        };
        let historyData = [];
        const existingHistory = sessionStorage.getItem('shippingHistory');
        if (existingHistory) {
            historyData = JSON.parse(existingHistory);
        }
        historyData.push(historyRecord);
        sessionStorage.setItem('shippingHistory', JSON.stringify(historyData));
        delete plan.plans[method];
        if (plan.status) delete plan.status[method];
        if (plan.notes) delete plan.notes[method];
        if (Object.keys(plan.plans).length === 0) {
            const planIndex = allPlans.findIndex(p => p.id === planId);
            if (planIndex >= 0) {
                allPlans.splice(planIndex, 1);
            }
        }
        sessionStorage.setItem('allShippingPlans', JSON.stringify(allPlans));
        alert('Plan marked as Done and sent to Shipping History.');
        renderShippingPlan();
    }
}

function filterByStatus() {
    const sel = document.getElementById('spStatusFilter');
    const statusFilter = sel ? sel.value : 'all';
    const allCards = document.querySelectorAll('.sp-card');
    // section key (matches card data-status tokens) → { title element id, cards container id }
    const sections = {
        draft:           { title: 'draftSectionTitle',     cards: 'shippingPlanCards' },
        pendingApproval: { title: 'pendingSectionTitle',   cards: 'pendingApprovalCards' },
        approved:        { title: 'approvedSectionTitle',  cards: 'approvedCards' },
        completed:       { title: 'completedSectionTitle', cards: 'completedCards' },
        cancelled:       { title: 'cancelledSectionTitle', cards: 'cancelledCards' }
    };
    function showSec(key, show) {
        const t = document.getElementById(sections[key].title);
        const c = document.getElementById(sections[key].cards);
        if (t) t.style.display = show ? '' : 'none';
        if (c) c.style.display = show ? '' : 'none';
    }

    // Hidden-by-default statuses (preserved in DB, viewable only via their own filter option).
    var HIDDEN_DEFAULT = { completed: true, cancelled: true };
    if (statusFilter === 'all') {
        // "All Active" = draft + pending_approval + approved; EXCLUDES completed and cancelled.
        showSec('draft', true); showSec('pendingApproval', true); showSec('approved', true);
        showSec('completed', false); showSec('cancelled', false);
        allCards.forEach(card => {
            card.style.display = HIDDEN_DEFAULT[card.getAttribute('data-status')] ? 'none' : '';
        });
    } else {
        showSec('draft', statusFilter === 'draft');
        showSec('pendingApproval', statusFilter === 'pendingApproval');
        showSec('approved', statusFilter === 'approved');
        showSec('completed', statusFilter === 'completed');
        showSec('cancelled', statusFilter === 'cancelled');
        allCards.forEach(card => {
            card.style.display = card.getAttribute('data-status') === statusFilter ? '' : 'none';
        });
    }
}

// ========================================
// Weekly Shipping Plan — DB (Decision Layer) rendering + actions
// Reads shipping_plans / shipping_plan_lines via KM.DB; one shipping_plan = one card.
// ========================================
function _spEsc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function _spNum(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
// True only when a raw snapshot cell actually carries a value (distinguishes a stored 0 / blank).
function _spHasRaw(line, key) {
    var r = line && line.raw;
    if (!r) return false;
    var v = r[key];
    return !(v === '' || v == null);
}
function _spKey(country, marketplace, sku) {
    return String(country || '').trim().toLowerCase() + '||' +
           String(marketplace || '').trim().toLowerCase() + '||' +
           String(sku || '').trim().toLowerCase();
}
// Latest-by-snapshot-date map: key country||marketplace||sku → record. Also keeps a sku-only fallback.
function _spLatestMap(rows) {
    var byScope = {}, bySku = {};
    (rows || []).forEach(function(r) {
        var d = String(r.snapshotDate || '');
        var k = _spKey(r.country, r.marketplace, r.sku);
        if (!byScope[k] || d >= String(byScope[k].snapshotDate || '')) byScope[k] = r;
        var sk = String(r.sku || '').trim().toLowerCase();
        if (!bySku[sk] || d >= String(bySku[sk].snapshotDate || '')) bySku[sk] = r;
    });
    return { byScope: byScope, bySku: bySku };
}
function _spLookup(map, country, marketplace, sku) {
    if (!map) return null;
    return map.byScope[_spKey(country, marketplace, sku)] ||
           map.bySku[String(sku || '').trim().toLowerCase()] || null;
}

// plan_id → true when a shipment exists for it (rebuilt each render). Lets the Done button appear
// even if the plan's transferred_* columns were never persisted (missing header on an old tab).
var _spPlanHasShipment = {};
// Has the plan been transferred to a Shipment Draft (Execution Commit done)? → eligible for Done.
function _spTransferred(p) {
    return !!((p.transferredShipmentId && String(p.transferredShipmentId).trim()) ||
              (p.transferredToShipmentAt && String(p.transferredToShipmentAt).trim()) ||
              (p.shippingPlanId && _spPlanHasShipment[p.shippingPlanId]));
}
// Has the Decision Layer been marked Completed (Done pressed)? → leaves the Active view.
function _spCompleted(p) {
    return !!(p.completedAt && String(p.completedAt).trim());
}

function renderShippingPlanFromDb() {
    _spSkuLogiCache = null;   // rebuild the sku logistics lookup from the freshest cache each render
    var plans = window.KM.DB.getShippingPlans() || [];
    var lines = window.KM.DB.getShippingPlanLines() || [];
    // Map which plans already have a shipment (robust Done-button detection).
    _spPlanHasShipment = {};
    ((window.KM.DB.getShipments && window.KM.DB.getShipments()) || []).forEach(function(sh) {
        if (sh.shippingPlanId) _spPlanHasShipment[sh.shippingPlanId] = true;
    });
    var linesByPlan = {};
    lines.forEach(function(l) {
        (linesByPlan[l.shippingPlanId] = linesByPlan[l.shippingPlanId] || []).push(l);
    });

    // Live fallback sources (Current Stock / Avg Sales) — used only when a line snapshot is absent.
    var invMap = _spLatestMap((window.KM.DB.getAmazonInventorySnapshot && window.KM.DB.getAmazonInventorySnapshot()) || []);
    var weeklyMap = _spLatestMap((window.KM.DB.getAmazonWeeklySalesSnapshot && window.KM.DB.getAmazonWeeklySalesSnapshot()) || []);
    // Company live-join map (country||marketplace → company). LEGACY DISPLAY FALLBACK ONLY —
    // new rows persist shipping_plans.company at Submit Plan (WEEKLY_SHIPPING_PLAN_MAPPING_SPEC §3.3).
    var mpCompany = {};
    ((window.KM.DB.getMarketplaces && window.KM.DB.getMarketplaces()) || []).forEach(function(m) {
        var k = String(m.country || '').trim().toLowerCase() + '||' + String(m.marketplace || '').trim().toLowerCase();
        if (m.company && !mpCompany[k]) mpCompany[k] = m.company;
    });
    var live = { inv: invMap, weekly: weeklyMap, mpCompany: mpCompany };

    var countryFilter = (document.getElementById('spCountryFilter') || {}).value || '';
    var inScope = plans.filter(function(p) {
        if (countryFilter && p.country !== countryFilter) return false;
        return true;
    });

    // Decision Layer Completion: a plan is "Completed" once Done is pressed (completed_at set).
    // Completed plans leave the Active view entirely (preserved in DB; viewable via the Completed
    // filter). An Approved plan that has been transferred to a Shipment Draft STAYS in Approved with
    // a Done button until the user marks it Completed (supersedes the v1.8 auto-hide-on-transfer rule).
    var draft = inScope.filter(function(p) { return p.status === 'draft' && !_spCompleted(p); });
    var pending = inScope.filter(function(p) { return p.status === 'pending_approval' && !_spCompleted(p); });
    var approved = inScope.filter(function(p) { return p.status === 'approved' && !_spCompleted(p); });
    var cancelled = inScope.filter(function(p) { return p.status === 'cancelled' && !_spCompleted(p); });
    var completed = inScope.filter(function(p) { return _spCompleted(p); });

    // Section count badges (visual — matches Request Order Draft's count display).
    _spSetSectionCount('draftSectionCount', draft.length);
    _spSetSectionCount('pendingSectionCount', pending.length);
    _spSetSectionCount('approvedSectionCount', approved.length);
    _spSetSectionCount('completedSectionCount', completed.length);
    _spSetSectionCount('cancelledSectionCount', cancelled.length);

    _spRenderDbSection('shippingPlanCards', draft, 'draft', linesByPlan, 'No shipping plans available.', live);
    _spRenderDbSection('pendingApprovalCards', pending, 'pending_approval', linesByPlan, 'No pending approvals.', live);
    _spRenderDbSection('approvedCards', approved, 'approved', linesByPlan, 'No approved plans.', live);
    _spRenderDbSection('completedCards', completed, 'completed', linesByPlan, 'No completed plans.', live);
    _spRenderDbSection('cancelledCards', cancelled, 'cancelled', linesByPlan, 'No cancelled plans.', live);

    // Apply the current Status filter so cancelled stays hidden under "All Active".
    if (typeof filterByStatus === 'function') filterByStatus();
}

// Resolve the three SKU-detail display values per spec §7 priority (snapshot → live → 0 / --).
function _spLineDisplay(line, plan, live) {
    // Current Stock: snapshot → available_qty + fc_transfer_qty + fc_processing_qty → 0
    var currentStock;
    if (_spHasRaw(line, 'snapshot_current_stock')) {
        currentStock = _spNum(line.snapshotCurrentStock);
    } else {
        var inv = live && _spLookup(live.inv, plan.country, plan.marketplace, line.sku);
        currentStock = inv ? (_spNum(inv.availableQty) + _spNum(inv.fcTransferQty) + _spNum(inv.fcProcessingQty)) : 0;
    }
    // Avg Sales: snapshot → sales_units_7d / 7 → 0
    var avgSales;
    if (_spHasRaw(line, 'snapshot_avg_sales_per_day')) {
        avgSales = _spNum(line.snapshotAvgSalesPerDay);
    } else {
        var wk = live && _spLookup(live.weekly, plan.country, plan.marketplace, line.sku);
        avgSales = wk ? (_spNum(wk.salesUnits7d) / 7) : 0;
    }
    // Days of Supply: snapshot → currentStock / avgSales → --
    var dos;
    if (_spHasRaw(line, 'snapshot_days_of_supply')) {
        dos = line.snapshotDaysOfSupply;
    } else if (avgSales > 0) {
        dos = (currentStock / avgSales).toFixed(1);
    } else {
        dos = '--';
    }
    var avgDisp = (avgSales > 0) ? avgSales.toFixed(1) : (_spHasRaw(line, 'snapshot_avg_sales_per_day') ? _spNum(line.snapshotAvgSalesPerDay).toFixed(1) : '0.0');
    return { currentStock: currentStock, avgSales: avgDisp, daysOfSupply: (dos === '' || dos == null) ? '--' : dos };
}

function _spRenderDbSection(containerId, plans, statusType, linesByPlan, emptyMsg, live) {
    var container = document.getElementById(containerId);
    if (!container) return;
    if (!plans.length) { container.innerHTML = '<p>' + emptyMsg + '</p>'; return; }

    var statusLabel = { draft: 'Draft', pending_approval: 'Pending Approval', approved: 'Approved', cancelled: 'Cancelled', completed: 'Completed' }[statusType] || statusType;
    var html = '';

    plans.forEach(function(plan) {
        var planLines = linesByPlan[plan.shippingPlanId] || [];
        var totalSku = planLines.length;
        var totalPcs = planLines.reduce(function(s, l) { return s + _spNum(l.approvedQty); }, 0);
        var totalCartons = planLines.reduce(function(s, l) { return s + _spNum(l.cartonQty); }, 0);
        // Header logistics totals are RUNTIME (Σ of the line Decision-Snapshot values) — not stored on the header.
        var totalCbm = planLines.reduce(function(s, l) { return s + _spNum(l.cbm); }, 0);
        var totalGross = planLines.reduce(function(s, l) { return s + _spNum(l.grossWeight); }, 0);
        var totalNet = planLines.reduce(function(s, l) { return s + _spNum(l.netWeight); }, 0);
        var totalCostNum = (plan.estimatedTotalCost === '' || plan.estimatedTotalCost == null) ? null : _spNum(plan.estimatedTotalCost);
        var totalCostDisp = (totalCostNum == null) ? '--' : ('$' + totalCostNum.toFixed(2));
        var unitCostDisp = (totalCostNum == null || totalPcs <= 0) ? '--' : ('$' + (totalCostNum / totalPcs).toFixed(2));
        var editable = (statusType === 'draft');
        var pid = plan.shippingPlanId;
        // Company: persisted snapshot first; live-join marketplaces ONLY as a legacy fallback when blank.
        var companyDisp = plan.company ||
            (live && live.mpCompany ? (live.mpCompany[String(plan.country || '').trim().toLowerCase() + '||' + String(plan.marketplace || '').trim().toLowerCase()] || '') : '');
        // Match the spStatusFilter dropdown tokens (draft / pendingApproval / approved) so filterByStatus works.
        var dsAttr = (statusType === 'pending_approval') ? 'pendingApproval' : statusType;

        var actions = '<button class="sp-btn sp-btn-expand" onclick="toggleSpDbCard(\'' + pid + '\')">Expand</button>';
        if (statusType === 'draft') {
            actions += '<button class="sp-btn sp-btn-submit" onclick="spDbSaveQty(\'' + pid + '\')">Save</button>'
                    + '<button class="sp-btn sp-btn-submit" onclick="spDbSubmit(\'' + pid + '\')">Submit</button>'
                    + '<button class="sp-btn sp-btn-cancel" onclick="spDbCancel(\'' + pid + '\')">Cancel</button>';
        } else if (statusType === 'pending_approval') {
            actions += '<button class="sp-btn sp-btn-submit" onclick="spDbApprove(\'' + pid + '\')">Approve</button>'
                    + '<button class="sp-btn sp-btn-cancel" onclick="spDbReject(\'' + pid + '\')">Reject</button>'
                    + '<button class="sp-btn sp-btn-cancel" onclick="spDbCancel(\'' + pid + '\')">Cancel</button>';
        } else if (statusType === 'approved' && _spTransferred(plan)) {
            // Execution Commit done → Decision Layer can be marked Completed (Done).
            actions += '<button class="sp-btn sp-btn-submit" onclick="spDbDone(\'' + pid + '\')">Done</button>';
        }

        var rows = planLines.map(function(l) {
            var qtyCell = editable
                ? '<input type="number" min="0" value="' + _spNum(l.approvedQty) + '" data-line-id="' + _spEsc(l.shippingPlanLineId) + '" data-upc="' + _spNum(l.unitsPerCarton) + '" data-sku="' + _spEsc(l.sku) + '" oninput="spDbOnQtyInput(this, \'' + pid + '\')" style="text-align:right; width:90px;">'
                : _spNum(l.approvedQty);
            var disp = _spLineDisplay(l, plan, live);
            return '<tr>' +
                '<td>' + _spEsc(l.sku) + '</td>' +
                '<td>' + disp.currentStock + '</td>' +
                '<td>' + disp.avgSales + '</td>' +
                '<td>' + disp.daysOfSupply + '</td>' +
                '<td>' + qtyCell + '</td>' +
                '<td id="sp-line-carton-' + _spEsc(l.shippingPlanLineId) + '">' + _spNum(l.cartonQty) + '</td>' +
                '</tr>';
        }).join('');

        // SKU Shipping Details footer totals (Total SKU / Total Qty / Total Cartons).
        var footer = '<tfoot><tr class="sp-sku-footer" style="font-weight:600; border-top:2px solid #CBD5E1;">' +
            '<td>Total SKU: ' + totalSku + '</td>' +
            '<td>—</td><td>—</td><td>—</td>' +
            '<td id="sp-foot-pcs-' + _spEsc(pid) + '" style="text-align:right;">' + totalPcs + '</td>' +
            '<td id="sp-foot-cartons-' + _spEsc(pid) + '">' + totalCartons + '</td>' +
            '</tr></tfoot>';

        var noteHtml = plan.note ? ('<div class="sp-rationale-item" style="white-space:pre-line; background:#FEF2F2; padding:8px; border-radius:4px; border-left:3px solid #EF4444; margin-top:6px;"><strong>Notes:</strong>\n' + _spEsc(plan.note) + '</div>') : '';
        // Plan Rationale Add Note (Draft/Pending/Approved all allow appending history; append-only).
        var addNoteBtn = '<button class="sp-btn sp-btn-submit" onclick="spDbShowNote(\'' + pid + '\')" style="font-size:12px; padding:4px 12px;">+ Add Note</button>';
        var noteInput = '<div id="sp-note-input-' + _spEsc(pid) + '" style="display:none; margin-top:8px;">' +
            '<textarea id="sp-note-text-' + _spEsc(pid) + '" style="width:100%; min-height:60px; padding:8px; border:1px solid #E2E8F0; border-radius:4px; font-size:13px; resize:vertical;"></textarea>' +
            '<div style="display:flex; justify-content:flex-end; gap:8px; margin-top:4px;">' +
                '<button onclick="spDbCancelNote(\'' + pid + '\')" style="background:#EF4444; color:#fff; border:none; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:12px;">✕</button>' +
                '<button onclick="spDbSaveNote(\'' + pid + '\')" style="background:#10B981; color:#fff; border:none; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:12px;">✓</button>' +
            '</div></div>';

        // Cost Breakdown placeholder (UI only — final logic in the future Carrier Price Spec).
        var cbTotalCost = (plan.estimatedTotalCost === '' || plan.estimatedTotalCost == null) ? '--' : ('$' + _spNum(plan.estimatedTotalCost).toFixed(2));
        var cbFreight = _spHasRaw(plan, 'estimated_freight_cost') ? ('$' + _spNum(plan.estimatedFreightCost).toFixed(2)) : '--';
        var cbDuty = _spHasRaw(plan, 'estimated_duty') ? ('$' + _spNum(plan.estimatedDuty).toFixed(2)) : '--';
        var cbCarrier = plan.carrierId ? _spEsc(plan.carrierId) : '--';
        var costBreakdown =
            '<div class="sp-section">' +
                '<h4 class="sp-section-title">Cost Breakdown</h4>' +
                '<div class="sp-cost-row"><span class="sp-cost-label">Carrier Name</span><span class="sp-cost-value">' + cbCarrier + '</span></div>' +
                '<div class="sp-cost-row"><span class="sp-cost-label">Carrier Fee</span><span class="sp-cost-value">' + cbFreight + '</span></div>' +
                '<div class="sp-cost-row"><span class="sp-cost-label">Duty / Custom</span><span class="sp-cost-value">' + cbDuty + '</span></div>' +
                '<div class="sp-cost-row"><span class="sp-cost-label">Total Cost</span><span class="sp-cost-value">' + cbTotalCost + '</span></div>' +
                '<div class="sp-cost-row"><span class="sp-cost-label">Unit Cost</span><span class="sp-cost-value">' + unitCostDisp + '</span></div>' +
                '<div style="font-size:11px; color:#94A3B8; margin-top:6px;">Placeholder — carrier pricing not yet calculated.</div>' +
            '</div>';

        html += '' +
        '<div class="sp-card" id="sp-card-' + _spEsc(pid) + '" data-plan-id="' + _spEsc(pid) + '" data-status="' + dsAttr + '">' +
            '<div class="sp-card-header">' +
                '<div class="sp-card-summary">' +
                    _spSummary('Status', '<span class="plan-status-badge plan-status-badge--' + (statusType === 'pending_approval' ? 'pendingApproval' : statusType) + '">' + statusLabel + ' (v' + _spNum(plan.planVersion) + ')</span>') +
                    _spSummary('Submitted Date', _spEsc(plan.createdAt || '')) +
                    _spSummary('Company', _spEsc(companyDisp)) +
                    _spSummary('Country', _spEsc(plan.country || '')) +
                    _spSummary('Marketplace', _spEsc(plan.marketplace || '')) +
                    _spSummary('Shipping Method', _spEsc(plan.shippingMethod || '')) +
                    _spSummary('Total Pcs', '<span id="sp-total-pcs-' + _spEsc(pid) + '">' + totalPcs + '</span>') +
                    _spSummary('Total Cartons', '<span id="sp-total-cartons-' + _spEsc(pid) + '">' + totalCartons + '</span>') +
                    _spSummary('Total CBM', '<span id="sp-total-cbm-' + _spEsc(pid) + '">' + totalCbm.toFixed(3) + '</span>') +
                    _spSummary('Total Gross Wt', '<span id="sp-total-gross-' + _spEsc(pid) + '">' + totalGross.toFixed(2) + '</span>') +
                    _spSummary('Total Net Wt', '<span id="sp-total-net-' + _spEsc(pid) + '">' + totalNet.toFixed(2) + '</span>') +
                    _spSummary('Total Cost', totalCostDisp) +
                    _spSummary('Unit Cost', '<span id="sp-unit-cost-' + _spEsc(pid) + '">' + unitCostDisp + '</span>') +
                '</div>' +
                '<div class="sp-card-actions">' + actions + '</div>' +
            '</div>' +
            '<div class="sp-card-details">' +
                '<div class="sp-details-grid">' +
                    '<div class="sp-section">' +
                        '<h4 class="sp-section-title">SKU Shipping Details</h4>' +
                        '<table class="sp-sku-table"><thead><tr>' +
                            '<th>SKU</th><th>Current Stock</th><th>Avg. Sales</th><th>Days of Supply</th><th>Shipping Qty</th><th>Cartons</th>' +
                        '</tr></thead><tbody>' + rows + '</tbody>' + footer + '</table>' +
                    '</div>' +
                    '<div class="sp-section">' +
                        '<h4 class="sp-section-title" style="display:flex; justify-content:space-between; align-items:center;">' +
                            '<span>Plan Rationale</span>' + addNoteBtn +
                        '</h4>' +
                        '<div class="sp-rationale-text">' +
                            '<div class="sp-rationale-item"><strong>Target Days:</strong> ' + (planLines[0] ? _spNum(planLines[0].snapshotTargetDays) : '--') + '</div>' +
                            '<div class="sp-rationale-item"><strong>Method:</strong> ' + _spEsc(plan.shippingMethod || '') + '</div>' +
                            '<div class="sp-rationale-item"><strong>Plan No:</strong> ' + _spEsc(plan.shippingPlanNo || '') + '</div>' +
                            (plan.transferredShipmentId ? '<div class="sp-rationale-item"><strong>Shipment Draft:</strong> ' + _spEsc(plan.transferredShipmentId) + (plan.transferredToShipmentAt ? ' (' + _spEsc(plan.transferredToShipmentAt) + ')' : '') + '</div>' : '') +
                            (plan.completedAt ? '<div class="sp-rationale-item"><strong>Decision Completed:</strong> ' + _spEsc(plan.completedAt) + (plan.completedBy ? ' by ' + _spEsc(plan.completedBy) : '') + '</div>' : '') +
                            noteInput +
                            noteHtml +
                        '</div>' +
                    '</div>' +
                    costBreakdown +
                '</div>' +
            '</div>' +
        '</div>';
    });

    container.innerHTML = html;
}

function _spSummary(label, valueHtml) {
    return '<div class="sp-summary-item"><span class="sp-summary-label">' + label + '</span>' +
        '<span class="sp-summary-value">' + valueHtml + '</span></div>';
}

function toggleSpDbCard(planId) {
    var card = document.getElementById('sp-card-' + planId);
    if (!card) return;
    var btn = card.querySelector('.sp-btn-expand');
    card.classList.toggle('is-expanded');
    if (btn) btn.textContent = card.classList.contains('is-expanded') ? 'Collapse' : 'Expand';
}

// sku_details logistics lookup (rebuilt each render). Used for the live header CBM/weight totals
// and the post-Save local cache patch. Mirrors the Apps Script logistics formula (cm only for now).
var _spSkuLogiCache = null;
function _spSkuDetail(sku) {
    if (!_spSkuLogiCache) {
        _spSkuLogiCache = {};
        var list = (window.KM.DB.getSkuDetails && window.KM.DB.getSkuDetails()) || [];
        list.forEach(function(d) { if (d.sku) _spSkuLogiCache[String(d.sku).trim().toLowerCase()] = d; });
    }
    return _spSkuLogiCache[String(sku || '').trim().toLowerCase()] || null;
}
function _spLineLogistics(sku, approvedQty, cartonQty) {
    var d = _spSkuDetail(sku);
    if (!d) return { cbm: 0, gross: 0, net: 0 };
    var cl = parseFloat(d.cartonLength) || 0, cw = parseFloat(d.cartonWidth) || 0, ch = parseFloat(d.cartonHeight) || 0;
    var unit = String(d.cartonDimensionUnit || 'cm').toLowerCase();
    var cartonCbm = (unit === 'cm' || unit === '') ? (cl * cw * ch / 1000000) : 0;
    return {
        cartonCbm: cartonCbm,
        cbm: cartonQty * cartonCbm,
        gross: cartonQty * (parseFloat(d.cartonWeight) || 0),
        net: approvedQty * (parseFloat(d.itemWeight) || 0)
    };
}

// Live recompute of card totals while editing Shipping Qty (Draft only) — including Runtime
// Total CBM / Gross / Net (Σ of per-line logistics).
function spDbOnQtyInput(input, planId) {
    var card = document.getElementById('sp-card-' + planId);
    if (!card) return;
    var inputs = card.querySelectorAll('input[data-line-id]');
    var totalPcs = 0, totalCartons = 0, totalCbm = 0, totalGross = 0, totalNet = 0;
    inputs.forEach(function(inp) {
        var qty = parseInt(inp.value) || 0;
        var upc = parseFloat(inp.getAttribute('data-upc')) || 0;
        var carton = upc > 0 ? Math.ceil(qty / upc) : 0;
        totalPcs += qty;
        totalCartons += carton;
        var L = _spLineLogistics(inp.getAttribute('data-sku'), qty, carton);
        totalCbm += L.cbm; totalGross += L.gross; totalNet += L.net;
        var cartonCell = document.getElementById('sp-line-carton-' + inp.getAttribute('data-line-id'));
        if (cartonCell) cartonCell.textContent = carton;
    });
    var pcsEl = document.getElementById('sp-total-pcs-' + planId);
    var ctnEl = document.getElementById('sp-total-cartons-' + planId);
    if (pcsEl) pcsEl.textContent = totalPcs;
    if (ctnEl) ctnEl.textContent = totalCartons;
    var cbmEl = document.getElementById('sp-total-cbm-' + planId);
    var grossEl = document.getElementById('sp-total-gross-' + planId);
    var netEl = document.getElementById('sp-total-net-' + planId);
    if (cbmEl) cbmEl.textContent = totalCbm.toFixed(3);
    if (grossEl) grossEl.textContent = totalGross.toFixed(2);
    if (netEl) netEl.textContent = totalNet.toFixed(2);
    // Keep the SKU Shipping Details footer totals in sync with header totals.
    var footPcs = document.getElementById('sp-foot-pcs-' + planId);
    var footCtn = document.getElementById('sp-foot-cartons-' + planId);
    if (footPcs) footPcs.textContent = totalPcs;
    if (footCtn) footCtn.textContent = totalCartons;
}

function _spCollectQtyLines(planId) {
    var card = document.getElementById('sp-card-' + planId);
    if (!card) return [];
    var out = [];
    card.querySelectorAll('input[data-line-id]').forEach(function(inp) {
        out.push({ shipping_plan_line_id: inp.getAttribute('data-line-id'), approved_qty: parseInt(inp.value) || 0 });
    });
    return out;
}

// Patch the in-memory cache lines with the just-saved qty so a re-render shows the new values
// immediately — even if the forced reload returned stale data. Save NEVER touches plan.status.
function _spPatchLocalQty(savedLines) {
    if (!window._opDbCache || !Array.isArray(window._opDbCache.shippingPlanLines)) return;
    var byId = {};
    savedLines.forEach(function(l) { byId[String(l.shipping_plan_line_id)] = l; });
    window._opDbCache.shippingPlanLines.forEach(function(rec) {
        var s = byId[String(rec.shippingPlanLineId)];
        if (!s) return;
        var qty = parseInt(s.approved_qty) || 0;
        rec.approvedQty = qty;
        var upc = parseFloat(rec.unitsPerCarton) || 0;
        rec.cartonQty = upc > 0 ? Math.ceil(qty / upc) : 0;
        // Recompute the logistics Decision Snapshot locally so the Runtime header totals are correct
        // immediately after Save (the backend persisted the same values).
        var L = _spLineLogistics(rec.sku, qty, rec.cartonQty);
        rec.cartonCbm = L.cartonCbm; rec.cbm = L.cbm; rec.grossWeight = L.gross; rec.netWeight = L.net;
    });
}

function spDbSaveQty(planId) {
    var lines = _spCollectQtyLines(planId);
    if (!lines.length) { renderShippingPlan(); return; }
    window.KM.DB.updateShippingPlanLineQty({ lines: lines }).then(function() {
        // Write persisted. Patch the local cache so the re-render keeps the card in the Draft section
        // with the new qty/cartons/totals (status stays 'draft'; no navigation, no state clear).
        _spPatchLocalQty(lines);
        alert('Shipping Qty saved.');
        renderShippingPlan();
    }).catch(function(err) {
        // Write failed → keep the current cards on screen; just report the error (no destructive render).
        alert('Save failed: ' + (err && err.message ? err.message : err));
    });
}

function spDbSubmit(planId) {
    // Persist any qty edits first, then move Draft → Pending Approval.
    var lines = _spCollectQtyLines(planId);
    var doSubmit = function() {
        window.KM.DB.updateShippingPlanStatus({ shipping_plan_id: planId, transition: 'submit', actor: 'operation-system' })
            .then(function() { alert('Submitted for approval.'); renderShippingPlan(); })
            .catch(function(err) { alert('Submit failed: ' + (err && err.message ? err.message : err)); });
    };
    if (lines.length) {
        window.KM.DB.updateShippingPlanLineQty({ lines: lines }).then(doSubmit).catch(doSubmit);
    } else { doSubmit(); }
}

function spDbApprove(planId) {
    // Approve = Execution Commit: the backend also creates the Shipment Draft (shipments +
    // shipment_lines), copying the Decision Snapshot into the Execution Snapshot.
    window.KM.DB.updateShippingPlanStatus({ shipping_plan_id: planId, transition: 'approve', actor: 'operation-system' })
        .then(function(data) {
            var sh = data && data.shipment;
            var msg = 'Plan approved.';
            if (sh && sh.created) msg += '\nShipment Draft created: ' + (sh.shipment_no || sh.shipment_id) + ' (' + (sh.line_count || 0) + ' lines).';
            else if (sh && sh.reason === 'already_exists') msg += '\nShipment Draft already exists (' + (sh.shipment_id || '') + ').';
            else if (sh && (sh.error || (sh.created === false && sh.reason))) msg += '\nNote: Shipment Draft not created (' + (sh.error || sh.reason) + '). You can retry from Shipment Overview.';
            alert(msg);
            renderShippingPlan();
        })
        .catch(function(err) { alert('Approve failed: ' + (err && err.message ? err.message : err)); });
}

function spDbReject(planId) {
    var reason = prompt('Rejection reason (required):', '');
    if (reason == null) return;            // cancelled the prompt
    reason = String(reason).trim();
    if (!reason) { alert('Rejection reason is required.'); return; }
    window.KM.DB.updateShippingPlanStatus({ shipping_plan_id: planId, transition: 'reject', rejected_reason: reason, actor: 'operation-system' })
        .then(function() { alert('Plan rejected and returned to Draft.'); renderShippingPlan(); })
        .catch(function(err) { alert('Reject failed: ' + (err && err.message ? err.message : err)); });
}

// Decision Layer Completion (Done). Allowed only on an Approved + transferred plan. Writes
// completed_at / completed_by; the card then leaves the Active view (preserved in DB).
function spDbDone(planId) {
    if (!confirm('This shipping plan has already been transferred to Shipment Draft.\n\nMark this planning task as completed?')) return;
    window.KM.DB.completeShippingPlan({ shipping_plan_id: planId, actor: 'system_user' })
        .then(function() { alert('Planning task marked as completed.'); renderShippingPlan(); })
        .catch(function(err) { alert('Done failed: ' + (err && err.message ? err.message : err)); });
}

function spDbCancel(planId) {
    if (!confirm('Cancel this shipping plan?')) return;
    window.KM.DB.updateShippingPlanStatus({ shipping_plan_id: planId, transition: 'cancel', actor: 'operation-system' })
        .then(function() { renderShippingPlan(); })
        .catch(function(err) { alert('Cancel failed: ' + (err && err.message ? err.message : err)); });
}

// ---- Plan Rationale: Add Note (append-only to shipping_plans.note) ----
function spDbShowNote(planId) {
    var box = document.getElementById('sp-note-input-' + planId);
    if (box) box.style.display = 'block';
}
function spDbCancelNote(planId) {
    var box = document.getElementById('sp-note-input-' + planId);
    var ta = document.getElementById('sp-note-text-' + planId);
    if (box) box.style.display = 'none';
    if (ta) ta.value = '';
}
function spDbSaveNote(planId) {
    var ta = document.getElementById('sp-note-text-' + planId);
    var note = ta ? String(ta.value || '').trim() : '';
    if (!note) { alert('Please enter a note.'); return; }
    if (!window.KM.DB.appendShippingPlanNote) { alert('Add Note is not available.'); return; }
    // Append-only: the backend preserves existing note history and never touches rejected_reason.
    window.KM.DB.appendShippingPlanNote({ shipping_plan_id: planId, note: note, actor: 'operation-system' })
        .then(function() { alert('Note added.'); renderShippingPlan(); })
        .catch(function(err) { alert('Add note failed: ' + (err && err.message ? err.message : err)); });
}

window.renderShippingPlanFromDb = renderShippingPlanFromDb;
window.spDbShowNote = spDbShowNote;
window.spDbCancelNote = spDbCancelNote;
window.spDbSaveNote = spDbSaveNote;
window.toggleSpDbCard = toggleSpDbCard;
window.spDbOnQtyInput = spDbOnQtyInput;
window.spDbSaveQty = spDbSaveQty;
window.spDbSubmit = spDbSubmit;
window.spDbApprove = spDbApprove;
window.spDbReject = spDbReject;
window.spDbCancel = spDbCancel;
window.spDbDone = spDbDone;

// 暴露到全域
window.renderShippingPlan = renderShippingPlan;
window.toggleShippingPlanCard = toggleShippingPlanCard;
window.submitShippingPlanCard = submitShippingPlanCard;
window.cancelShippingPlanCard = cancelShippingPlanCard;
window.validateShippingQty = validateShippingQty;
window.showNoteInput = showNoteInput;
window.cancelNote = cancelNote;
window.saveNote = saveNote;
window.updateCarrierCost = updateCarrierCost;
window.submitToPending = submitToPending;
window.approvePlan = approvePlan;
window.sendBackToDraft = sendBackToDraft;
window.markAsDone = markAsDone;
window.filterByStatus = filterByStatus;


// ========================================
// Lifecycle 註冊
// ========================================
// Ensure the Shipping Plan markup is present before renderShippingPlan runs.
// Idempotent: if #shippingplan-section already exists, resolves immediately (no re-fetch, no
// duplicate). Loads the partial via KM.partialLoader; on any failure it warns and resolves (never throws).
function _ensureShippingPlanMarkup() {
    if (document.getElementById('shippingplan-section')) {
        return Promise.resolve(true);
    }
    if (window.KM && window.KM.partialLoader && window.KM.partialLoader.loadPartial) {
        return window.KM.partialLoader
            .loadPartial('shipping-plan', 'assets/html/pages/shipping-plan.html', '#shipping-plan-mount')
            .then(function() {
                if (!document.getElementById('shippingplan-section')) {
                    console.warn('[ShippingPlan] partial loaded but #shippingplan-section not found');
                }
                return true;
            })
            .catch(function(err) {
                console.warn('[ShippingPlan] failed to load partial:', err);
                return false;
            });
    }
    console.warn('[ShippingPlan] KM.partialLoader unavailable; markup not loaded.');
    return Promise.resolve(false);
}

if (window.KM && window.KM.lifecycle) {
    KM.lifecycle.register('shippingplan-section', {
        mount() {
            console.log('[ShippingPlan] mount');
            // Markup is partial-loaded (Phase 3-8). Ensure it exists, then (re)apply the .active
            // class (showSection ran before the async injection on first open) and render.
            _ensureShippingPlanMarkup().then(function() {
                var sec = document.getElementById('shippingplan-section');
                if (sec) sec.classList.add('active');
                // Cloud mode: ensure the operation DB cache is loaded so shipping_plans render
                // even on a direct visit (Submit Plan also reloads the cache after writing).
                if (_spUseDb() && !window._opDbCache && window.KM.DB.loadOperationDb) {
                    window.KM.DB.loadOperationDb({ force: true }).then(renderShippingPlan).catch(renderShippingPlan);
                } else {
                    renderShippingPlan();
                }
            });
        },
        unmount() {
            console.log('[ShippingPlan] unmount');
            // 此頁無 chart / interval / scroll listener 需清理
            // 未來若新增，在此處理
        }
    });
}
