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

// API-3A — reversible READ cutover. Weekly read routes to window.KM.api.getWorkspace("weeklyShipping")
// ONLY when the Foundation reports the per-workspace flag effective (global master AND weeklyShipping AND
// IMPLEMENTED). Production defaults are false → Legacy. Writes ALWAYS stay on Legacy KM.DB (below).
function _spEffectiveWorkspace() {
    return !!(window.KM && window.KM.api && typeof window.KM.api.workspaceApiActive === 'function' &&
        window.KM.api.workspaceApiActive('weeklyShipping'));
}

function renderShippingPlan() {
    // Cloud (DB) path: read shipping_plans / shipping_plan_lines (Legacy) OR the Weekly Workspace API when its
    // flag is effective. Falls back to the legacy sessionStorage rendering only when neither is available (Demo).
    if (_spUseDb() || _spEffectiveWorkspace()) { renderShippingPlanFromDb(); return; }

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
    // Completed planning tasks belong to Shipment views, not this operational workspace.
    if (sel) {
        if (sel.value === 'completed') sel.value = 'all';
        var completedOption = sel.querySelector('option[value="completed"]');
        if (completedOption && completedOption.parentNode) completedOption.parentNode.removeChild(completedOption);
    }
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
        // R71-FE-10: the reading's OWN company is part of the key ('' when the source row carries none)
        var _co10 = String((r.company != null && r.company !== '') ? r.company : ((r.raw && r.raw.company) || '')).trim().toLowerCase();
        var k = _co10 + '##' + _spKey(r.country, r.marketplace, r.sku);
        if (!byScope[k] || d >= String(byScope[k].snapshotDate || '')) byScope[k] = r;
        var sk = String(r.sku || '').trim().toLowerCase();
        if (!bySku[sk] || d >= String(bySku[sk].snapshotDate || '')) bySku[sk] = r;
    });
    return { byScope: byScope, bySku: bySku };
}
function _spLookup(map, country, marketplace, sku, company, siteCompanies) {
    if (!map) return null;
    // R71-FE-9 (W5): the site's OWN row only. R71-FE-10: the site is company + country + marketplace - a reading of another company is
    // never used; a reading with no company is used only when the master names at most one company for this country + marketplace.
    var base = _spKey(country, marketplace, sku), co = String(company || '').trim().toLowerCase();
    if (co && map.byScope[co + '##' + base]) return map.byScope[co + '##' + base];
    var nc = map.byScope['##' + base];
    if (!nc) return null;
    if ((siteCompanies || []).length > 1) return { __ambiguousCompany: true };
    return nc;
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
// __SP_RECOVERY_PURE_START__ (test extraction marker - do not remove)
// F1-7N-FC-1A §D/§C — THE RECOVERABLE CONDITION, DERIVED - NEVER STORED.
//
// A plan sits in exactly one of three execution-commit states, and all three are computed from rows that
// already exist. There is deliberately no fourth stored status column: a status word would be a third copy of
// a fact `shipping_plans.status` and the `shipments` reference already carry between them, and the one thing
// this codebase has proved repeatedly is that a duplicated fact eventually disagrees with its sources.
//
//   NOT_APPROVED                          the plan has not been approved, so no Execution Commit is due
//   SHIPMENT_PRESENT                      approved AND a Shipment Draft exists (transferred_* or shipmentMap)
//   APPROVED_SHIPMENT_CREATION_PENDING    approved AND no Shipment Draft - the recoverable condition
//
// Because it is derived, a reload shows the same answer with no migration and no reconciliation step (§D.5),
// and a lost transport answer cannot leave the UI claiming something the rows do not say.
//
// canRetry is separately AND-ed with the two gates §J requires, so the button is absent (not merely
// unhelpful) when the deployment cannot serve the action or a retry is already in flight.
function spShipmentRecoveryState_(statusType, hasShipment, contractOk, retryInFlight) {
    var state = (String(statusType || '') !== 'approved')
        ? 'NOT_APPROVED'
        : (hasShipment ? 'SHIPMENT_PRESENT' : 'APPROVED_SHIPMENT_CREATION_PENDING');
    var blocked = '';
    if (state === 'APPROVED_SHIPMENT_CREATION_PENDING') {
        if (contractOk === false) blocked = 'DEPLOYMENT_CONTRACT_MISMATCH';
        else if (retryInFlight === true) blocked = 'RETRY_IN_FLIGHT';
    }
    return {
        state: state,
        isRecoverable: state === 'APPROVED_SHIPMENT_CREATION_PENDING',
        canRetry: state === 'APPROVED_SHIPMENT_CREATION_PENDING' && contractOk !== false && retryInFlight !== true,
        blockedBy: blocked
    };
}
// __SP_RECOVERY_PURE_END__

// F1-7N-FC-1A §J.2 — THE DEPLOYMENT GATE. Read ONCE per page read, cached, and never auto-retried: a stale
// deployment is a publish step and retrying a read cannot publish anything. `null` means "not yet answered",
// which is deliberately NOT the same as false - an unanswered probe must not disable the page's buttons.
var _spContract = null;
function _spContractOk_() { return _spContract === null ? null : !!_spContract.ok; }
function _spContractMsg_() {
    if (!_spContract || _spContract.ok) return '';
    return String(_spContract.message || 'The deployed Apps Script cannot serve this page.') +
        (_spContract.missing && _spContract.missing.length ? (' Missing: ' + _spContract.missing.join(', ') + '.') : '');
}
// Refresh the page-scoped verdict. Never throws and never blocks the render: a probe that itself fails leaves
// the verdict unanswered rather than fabricating either answer.
function _spRefreshContract_() {
    if (!(window.KM && window.KM.DB && typeof window.KM.DB.checkPageDeploymentContract === 'function')) return Promise.resolve(null);
    return Promise.resolve()
        .then(function () { return window.KM.DB.checkPageDeploymentContract('weekly-shipping-plan'); })
        .then(function (v) { _spContract = v || null; return _spContract; })
        .catch(function () { return null; });
}
// A disabled-button attribute pair that always states WHY. A button that is merely inert teaches the operator
// that the page is broken; one that says the deployment is behind teaches them to publish it.
function _spGateAttrs_() {
    if (_spContractOk_() !== false) return '';
    return ' disabled title="' + _spEsc(_spContractMsg_()) + '"';
}

// Has the Decision Layer been marked Completed (Done pressed)? → leaves the Active view.
function _spCompleted(p) {
    return !!String(p.completedAt || (p.raw && p.raw.completed_at) || '').trim();
}

// ---- API-3A page read-source boundary ---------------------------------------------------------------
// ONE predictable read model regardless of source. Legacy → getShippingPlans/Lines (+ live enrichment maps).
// Workspace → KM.api.getWorkspace("weeklyShipping") adapted to the SAME normalized record shape (live=null:
// Workspace mode renders the canonical persisted Decision Snapshot; the cross-domain live fallback is a
// Legacy-only display aid). No dual read; no silent fallback after a Workspace request starts.
var _spReadSeq = 0;   // stale-response guard: only the newest load may update the page
// S3-R4 §5 — the model the page is CURRENTLY showing. The deployment verdict arrives after the read and can
// change one thing about the view (whether the recovery buttons are gated), so it needs something to repaint
// FROM. Without it the only way to reflect a late verdict was to run the read again, which is the defect below.
var _spLastModel = null;

function _spCurrentFilters_() {
    // The current Weekly UI filters client-side (grouped-by-status view); server-side filter/sort/pagination
    // wiring is deferred until the UI gains those controls. Request the (bounded) full set and filter locally.
    return {};
}

// Map one Workspace View-Model plan (typed + §22 raw) → the normalized record the existing render consumes.
function _spWorkspacePlanRecord(p) {
    var raw = (p && p.raw) || {};
    return {
        shippingPlanId: p.planId, shippingPlanNo: p.planNo, planName: p.planName,
        company: p.company, country: p.country, marketplace: p.marketplace,
        status: p.status, planVersion: _spNum(p.planVersion) || 1,
        shippingMethod: p.shippingMethod, lastMileDelivery: p.lastMileDelivery, customsType: p.customsType,
        // WK1: the saved To (Site Inventory -> Plan) travels in the raw row; the Workspace record dropped it, so the header read '--'
        destination: String(raw.destination == null ? '' : raw.destination).trim(), destinationType: String(raw.destination_type == null ? '' : raw.destination_type).trim(),
        destinationWarehouseId: String(raw.destination_warehouse_id == null ? '' : raw.destination_warehouse_id).trim(),
        // S7-R2A1 — 40_ joins the master and serves carrier { id, name }; the name was dropped here.
        carrierId: (p.carrier && p.carrier.id) || '',
        carrierName: (p.carrier && p.carrier.name) || '',
        estimatedTotalCost: (raw.estimated_total_cost == null ? '' : raw.estimated_total_cost),
        estimatedFreightCost: (raw.estimated_freight_cost == null ? '' : raw.estimated_freight_cost),
        estimatedDutyCurrency: String(raw.estimated_duty_currency || ''),
        estimatedDuty: (raw.estimated_duty == null ? '' : raw.estimated_duty),
        currency: p.currency || '',
        createdAt: String(raw.created_at || ''), note: String(raw.note || ''),
        completedAt: String(raw.completed_at || ''),
        transferredShipmentId: String(raw.transferred_shipment_id || ''),
        transferredToShipmentAt: String(raw.transferred_to_shipment_at || ''),
        updatedAt: p.updatedAt || '',
        raw: raw
    };
}
function _spWorkspaceLineRecord(l, planId) {
    var raw = (l && l.raw) || {};
    return {
        shippingPlanLineId: l.lineId, shippingPlanId: l.planId || planId, sku: l.sku, siteSku: l.siteSku, marketplace: l.marketplace,
        requestedQty: _spNum(l.requestedQty), approvedQty: _spNum(l.approvedQty),
        cartonQty: _spNum(l.cartonQty), planCartonQty: _spNum(l.cartonQty), unitsPerCarton: _spNum(l.unitsPerCarton),
        cbm: _spNum(raw.cbm), grossWeight: _spNum(raw.gross_weight), netWeight: _spNum(raw.net_weight),
        snapshotCurrentStock: _spNum(raw.snapshot_current_stock), snapshotAvgSalesPerDay: _spNum(raw.snapshot_avg_sales_per_day),
        snapshotDaysOfSupply: (raw.snapshot_days_of_supply == null ? '' : raw.snapshot_days_of_supply),
        snapshotTargetDays: _spNum(raw.snapshot_target_days),
        note: l.note || '', raw: raw
    };
}
function _spAdaptWorkspaceToRecords(data) {
    var wsPlans = (data && data.plans) || [];
    var detailsByPlanId = (data && data.detailsByPlanId) || {};
    var plans = wsPlans.map(_spWorkspacePlanRecord);
    var lines = [];
    wsPlans.forEach(function(p) {
        var d = detailsByPlanId[p.planId];
        ((d && d.lines) || []).forEach(function(l) { lines.push(_spWorkspaceLineRecord(l, p.planId)); });
    });
    // F1-7J-A2: bounded SKU logistics projection (40_ `skuDetails`, only the page's line SKUs) re-normalized through the
    // SAME canonical normalizer as the broad getSkuDetails() → BEFORE == AFTER for _spLineLogistics carton dims/weights.
    var norm = (typeof window !== 'undefined' && window.KM && window.KM.DB && window.KM.DB.normalizeSkuDetail) ? window.KM.DB.normalizeSkuDetail : function(x){ return x; };
    var skuDetails = ((data && data.skuDetails) || []).map(function(r){ return norm(r); }).filter(function(r){ return r && r.sku; });
    return { plans: plans, lines: lines, skuDetails: skuDetails };
}
function _spBuildLegacyLiveMaps_() {
    var shipmentMap = {};
    ((window.KM.DB.getShipments && window.KM.DB.getShipments()) || []).forEach(function(sh) {
        if (sh.shippingPlanId) shipmentMap[sh.shippingPlanId] = true;
    });
    var nb16 = function (r) { var raw = r && r.raw; return !(raw && typeof raw === 'object' && String(raw.marketplace == null ? '' : raw.marketplace).trim() === ''); };   // R71-FE-16 (A-1): a blank RAW marketplace is excluded
    var invMap = _spLatestMap(((window.KM.DB.getAmazonInventorySnapshot && window.KM.DB.getAmazonInventorySnapshot()) || []).filter(nb16));
    var weeklyMap = _spLatestMap(((window.KM.DB.getAmazonWeeklySalesSnapshot && window.KM.DB.getAmazonWeeklySalesSnapshot()) || []).filter(nb16));
    var mpCompany = {}, mpCompanies = {}, mpSkuCompanies = {};   // R71-FE-14: + per country + marketplace + SKU (marketplace_skus)
    ((window.KM.DB.getMarketplaceSkus && window.KM.DB.getMarketplaceSkus()) || []).forEach(function (m) {
        var c0 = String(m.country || '').trim().toLowerCase(); if (c0 === 'gb') c0 = 'uk';
        var k = c0 + '||' + String(m.marketplace || '').trim().toLowerCase() + '||' + String(m.sku || '').trim().toLowerCase(), co = String(m.company || '').trim() || '(blank company)';
        var l = mpSkuCompanies[k] || (mpSkuCompanies[k] = []); if (l.indexOf(co) < 0) l.push(co);
    });
    ((window.KM.DB.getMarketplaces && window.KM.DB.getMarketplaces()) || []).forEach(function(m) {
        var k = String(m.country || '').trim().toLowerCase() + '||' + String(m.marketplace || '').trim().toLowerCase();
        if (m.company && !mpCompany[k]) mpCompany[k] = m.company;
        if (m.company) { var _l10 = mpCompanies[k] || (mpCompanies[k] = []); if (_l10.indexOf(String(m.company).trim()) < 0) _l10.push(String(m.company).trim()); }   // R71-FE-10
    });
    var mpRows15 = {};   // R71-FE-15: one entry per marketplaces ROW for country + marketplace (blank company kept as unknown)
    ((window.KM.DB.getMarketplaces && window.KM.DB.getMarketplaces()) || []).forEach(function (m) { var c0 = String(m.country || '').trim().toLowerCase(); if (c0 === 'gb') c0 = 'uk'; var mk = String(m.marketplace || '').trim().toLowerCase(); if (!mk) return; (mpRows15[c0 + '||' + mk] || (mpRows15[c0 + '||' + mk] = [])).push(String(m.company || '').trim() || '(blank company)'); });
    return { shipmentMap: shipmentMap, live: { inv: invMap, weekly: weeklyMap, mpCompany: mpCompany, mpCompanies: mpCompanies, mpSkuCompanies: mpSkuCompanies, mpRows15: mpRows15 } };
}
function loadWeeklyShippingReadModel_() {
    if (_spEffectiveWorkspace()) {
        if (!(window.KM.api && typeof window.KM.api.getWorkspace === 'function')) {
            // Flag says Workspace but the API is missing → fail VISIBLY (never silently pretend success).
            return Promise.resolve({ source: 'workspace', error: { code: 'WORKSPACE_UNAVAILABLE', message: 'Weekly Workspace is enabled but the API client is unavailable.' } });
        }
        var params = { filters: _spCurrentFilters_(), sort: [{ field: 'updated_at', direction: 'desc' }],
            page: { number: 1, size: 100 }, include: { summary: true, plans: true, details: true, filterOptions: true } };
        return Promise.resolve(window.KM.api.getWorkspace('weeklyShipping', params)).then(function(env) {
            if (env && env.success) {
                var rec = _spAdaptWorkspaceToRecords(env.data);
                // Workspace mode: shipmentMap empty (plan transferred_* drives Done) + live=null (snapshot-primary).
                // skuDetails = the bounded SKU logistics projection (F1-7J-A2) for the line-editor recompute.
                return { source: 'workspace', plans: rec.plans, lines: rec.lines, skuDetails: rec.skuDetails, shipmentMap: {}, live: null, meta: env.meta };
            }
            return { source: 'workspace', error: (env && env.errors && env.errors[0]) || { code: 'WORKSPACE_ERROR', message: 'Weekly Workspace request failed.' }, meta: env && env.meta };
        });
    }
    var maps = _spBuildLegacyLiveMaps_();
    return Promise.resolve({ source: 'legacy',
        plans: (window.KM.DB.getShippingPlans && window.KM.DB.getShippingPlans()) || [],
        lines: (window.KM.DB.getShippingPlanLines && window.KM.DB.getShippingPlanLines()) || [],
        shipmentMap: maps.shipmentMap, live: maps.live });
}
// F1-7N-FB-2 §I — a transport failure must be visibly DIFFERENT from a proven-empty result, must expose the
// diagnostic facts that make a 404-HTML answer explainable, must offer Retry, and must NOT destroy the last
// confirmed data. Previously it blanked every other group's region, which turned a transport fault into an
// apparent "everything is gone".
function _spReadErrorDetailHtml_(err) {
    var d = (err && err.details) || {};
    var bits = [];
    if (d.httpStatus != null) bits.push('HTTP ' + _spEsc(String(d.httpStatus)));
    if (d.contentType) bits.push(_spEsc(String(d.contentType)));
    if (!bits.length) return '';
    return ' <span style="color:#7F1D1D;">(' + bits.join(' · ') + ')</span>';
}
function _spRenderReadError_(err) {
    var code = _spEsc((err && err.code) || 'READ_FAILED');
    var msg = _spEsc((err && err.message) || 'Failed to load shipping plans.');
    var reqId = err && err.requestId ? (' <span style="color:#94A3B8;">[' + _spEsc(err.requestId) + ']</span>') : '';
    var nonJson = String((err && err.code) || '') === 'TRANSPORT_NON_JSON_RESPONSE';
    var guidance = nonJson
        ? 'The API endpoint answered with a web page instead of data. This is a transport/deployment problem, not an empty plan list — your existing plans are unaffected.'
        : 'This is a read failure, not a proven-empty plan list.';
    var banner = '<div class="sp-read-error" role="alert" style="color:#B91C1C; background:#FEF2F2; border-left:3px solid #EF4444; padding:10px; margin-bottom:8px;">' +
        '<div style="font-weight:600;">Could not load shipping plans</div>' +
        '<div style="margin-top:3px;">' + msg + ' <code>' + code + '</code>' + _spReadErrorDetailHtml_(err) + reqId + '</div>' +
        '<div style="margin-top:4px;font-size:12px;">' + _spEsc(guidance) + '</div>' +
        '<button type="button" class="sp-read-retry" onclick="renderShippingPlanFromDb()" ' +
            'style="margin-top:8px;padding:5px 12px;border:1px solid #EF4444;background:#fff;color:#B91C1C;border-radius:4px;cursor:pointer;font-size:12px;">Retry</button>' +
    '</div>';
    // Preserve whatever was last CONFIRMED: only the primary region gains the banner, and the other groups are
    // left exactly as they were rather than being overwritten with an empty string.
    var el = document.getElementById('shippingPlanCards');
    if (!el) return;
    var existing = el.querySelector('.sp-read-error');
    if (existing) existing.parentNode.removeChild(existing);
    if (el.querySelector('.sp-card')) { el.insertAdjacentHTML('afterbegin', banner); }
    else { el.innerHTML = banner; }
}

// F1-7B-R1: bounded loading state for the primary cards region (shared KM.loadState contract). INITIAL_LOADING
// on first load (no content), REFRESHING on a reload/post-write refresh (content stays visible). A failure here
// is region-scoped (ERROR) and never blanks unrelated app regions. No-op if the helper/DOM is unavailable.
var _spLoadRegion = null;
function _spEnsureLoadRegion_() {
    if (_spLoadRegion) return _spLoadRegion;
    if (typeof document === 'undefined' || !(window.KM && window.KM.loadState)) return null;
    var el = document.getElementById('shippingPlanCards');
    if (!el) return null;
    _spLoadRegion = window.KM.loadState.bindElement(el, 'Loading shipping plans…');
    return _spLoadRegion;
}
function _spRegionHasContent_() {
    if (typeof document === 'undefined') return false;
    var el = document.getElementById('shippingPlanCards');
    return !!(el && el.querySelector('.sp-card'));   // real card content already visible
}

function renderShippingPlanFromDb() {
    var mySeq = ++_spReadSeq;
    var region = _spEnsureLoadRegion_();
    if (region) region.beginLoad(_spRegionHasContent_());   // INITIAL_LOADING or REFRESHING
    // F1-7N-FC-1A §J.2 — the deployment verdict is refreshed alongside the read, not instead of it. It is
    // deliberately NOT awaited before rendering: a slow probe must never delay the plans, and an unanswered
    // probe leaves the buttons enabled rather than disabling a working page on no evidence.
    //
    // S3-R4 §5 — THIS CALLBACK USED TO CALL renderShippingPlan(), AND THAT IS AN UNBOUNDED READ LOOP.
    //
    // renderShippingPlan() is not a renderer. It is the page ENTRY POINT, and its first act in DB/Workspace
    // mode is to call renderShippingPlanFromDb() — this function. So the verdict callback re-entered the read
    // that had just dispatched it, which dispatched a fresh verdict probe, which re-entered the read again.
    //
    // The `mySeq === _spReadSeq` guard cannot stop it, and that is worth being precise about, because the
    // guard LOOKS like the stop condition. Nothing bumps the sequence between the dispatch and this callback,
    // so the comparison is always true; the re-entry then bumps it, which makes the ORIGINAL read's own `.then`
    // see a stale sequence and discard the plans it just fetched. Every cycle threw away the data it read and
    // started another one, so the page could never reach a first render at all.
    //
    // Measured in headless Chrome (S3-R4 §5): 12 705 000+ requests — one deployment health probe and one
    // weeklyShipping workspace read per cycle — with the macrotask heartbeat frozen at the beat the navigation
    // happened on, because each cycle completes in microtasks. That is the ">=900 s with no mount" S3-R3
    // reproduced and could not explain.
    //
    // What the verdict is actually FOR is narrow: _spGateAttrs_() returns markup only when the verdict is a
    // refusal. A verdict of ok, or no verdict at all, changes nothing on screen and needs no repaint. So the
    // callback repaints the model already in hand, only when there is a refusal to show, and never reads again.
    _spRefreshContract_().then(function (v) {
        if (mySeq !== _spReadSeq) return;        // a newer load owns the page
        if (!v || v.ok !== false) return;        // nothing about the view depends on a passing verdict
        if (_spLastModel) _spRenderReadModel_(_spLastModel);
    });
    return Promise.resolve(loadWeeklyShippingReadModel_()).then(function(model) {
        if (mySeq !== _spReadSeq) return false;
        _spRenderReadModel_(model);
        _spReadbackBlocked_ = !model || model.source === 'error' || !!model.error;
        return !_spReadbackBlocked_;
    }).catch(function(err) {
        if (mySeq !== _spReadSeq) return false;
        _spRenderReadModel_({ source: 'error', error: { code: 'PAGE_READ_FAILED', message: String(err && err.message || err) } });
        _spReadbackBlocked_ = true;
        return false;
    });
}

function _spRenderReadModel_(model) {
    _spLastModel = model;     // so a late deployment verdict can repaint this without re-reading
    _spSkuLogiCache = null;   // rebuild the sku logistics lookup from the freshest cache each render
    // F1-7J-A2: in Workspace mode the SKU logistics facts come from the scoped read-model projection (NOT the broad
    // cache). null in Legacy mode → _spSkuDetail falls back to getSkuDetails() unchanged.
    _spWsSkuDetails = (model && model.source === 'workspace') ? (model.skuDetails || []) : null;
    var _region = _spLoadRegion;   // may be null (no DOM/helper)
    if (model.error) { if (_region) _region.set(window.KM.loadState.STATES.ERROR); _spRenderReadError_(model.error); return; }
    if (_region) _region.set(((model.plans || []).length) ? window.KM.loadState.STATES.READY : window.KM.loadState.STATES.EMPTY);
    var plans = model.plans || [];
    var lines = model.lines || [];
    // Map which plans already have a shipment (robust Done-button detection). Legacy populates this;
    // Workspace mode leaves it empty and relies on the plan's persisted transferred_* fields.
    _spPlanHasShipment = model.shipmentMap || {};
    var linesByPlan = {};
    lines.forEach(function(l) {
        (linesByPlan[l.shippingPlanId] = linesByPlan[l.shippingPlanId] || []).push(l);
    });

    // live = enrichment maps (Legacy) or null (Workspace snapshot-primary — no cross-domain live fallback).
    var live = model.live || null;

    var countryFilter = (document.getElementById('spCountryFilter') || {}).value || '';
    var inScope = plans.filter(function(p) {
        if (_spCompleted(p)) return false;
        if (countryFilter && p.country !== countryFilter) return false;
        return true;
    });

    // Decision Layer Completion: a plan is "Completed" once Done is pressed (completed_at set).
    // Completed plans leave this workspace entirely (preserved in DB and Shipment views).
    // An Approved plan that has been transferred to a Shipment Draft STAYS in Approved with
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

    var _keep15c = _spCaptureCardState_();   // R15C-UI: expand / typed qty / note / focus / place on screen, by internal plan id
    _spRenderDbSection('shippingPlanCards', draft, 'draft', linesByPlan, 'No shipping plans available.', live);
    _spRenderDbSection('pendingApprovalCards', pending, 'pending_approval', linesByPlan, 'No pending approvals.', live);
    _spRenderDbSection('approvedCards', approved, 'approved', linesByPlan, 'No approved plans.', live);
    _spRenderDbSection('completedCards', completed, 'completed', linesByPlan, 'No completed plans.', live);
    _spRenderDbSection('cancelledCards', cancelled, 'cancelled', linesByPlan, 'No cancelled plans.', live);

    // Apply the current Status filter so cancelled stays hidden under "All Active".
    if (typeof filterByStatus === 'function') filterByStatus();
    _spRestoreCardState_(_keep15c);
}

// R15C-UI (Owner R15 P1 "Expand collapses by itself"): every Weekly re-render rebuilds the cards with container.innerHTML (a readback after any
// plan's command, the deployment-verdict repaint, a remount), and the new cards were all collapsed - and a qty typed but not saved was
// replaced by the server value without a word. The state is now captured by the internal plan id before the sections are rebuilt and put
// back after: expanded cards (their options panel is refreshed through the options cache), the open factory summary (_spFgOpen_), the
// note being written, the focused input and the card's place on screen. A typed qty is kept only while the server still holds the value it
// was typed over; if the server value moved, or the line / card is gone, it is NOT applied silently - the operator is told which ones.
var SP_CARD_CONTAINERS_ = ['shippingPlanCards', 'pendingApprovalCards', 'approvedCards', 'completedCards', 'cancelledCards'];
function _spCaptureCardState_() {
    var st = { expanded: {}, qty: {}, notes: {}, focus: null, anchor: null };
    if (typeof document === 'undefined') return st;
    var act = document.activeElement, anchorCard = null;
    SP_CARD_CONTAINERS_.forEach(function (cid) {
        var c = document.getElementById(cid); if (!c || !c.querySelectorAll) return;
        Array.prototype.forEach.call(c.querySelectorAll('.sp-card[data-plan-id]'), function (card) {
            var pid = card.getAttribute('data-plan-id'); if (!pid) return;
            if (card.classList.contains('is-expanded')) { st.expanded[pid] = true; if (!anchorCard) anchorCard = card; }
            Array.prototype.forEach.call(card.querySelectorAll('input[data-line-id]'), function (inp) {
                if (inp.value !== inp.defaultValue) (st.qty[pid] = st.qty[pid] || {})[inp.getAttribute('data-line-id')] = { value: inp.value, base: inp.defaultValue, sku: inp.getAttribute('data-sku') || '' };
            });
            var ni = document.getElementById('sp-note-input-' + pid), nt = document.getElementById('sp-note-text-' + pid);
            if (ni && (ni.style.display !== 'none' || (nt && nt.value))) st.notes[pid] = { open: ni.style.display !== 'none', text: nt ? nt.value : '' };
            if (act && card.contains(act)) {
                anchorCard = card;
                st.focus = { id: act.id || '', line: (act.getAttribute && act.getAttribute('data-line-id')) || '', plan: pid, s: (typeof act.selectionStart === 'number' ? act.selectionStart : null), e: (typeof act.selectionEnd === 'number' ? act.selectionEnd : null) };
            }
        });
    });
    if (anchorCard && anchorCard.getBoundingClientRect) st.anchor = { id: anchorCard.id, top: anchorCard.getBoundingClientRect().top };
    return st;
}
function _spLineInput_(card, lineId) { var list = card ? card.querySelectorAll('input[data-line-id]') : []; for (var i = 0; i < list.length; i++) if (list[i].getAttribute('data-line-id') === lineId) return list[i]; return null; }
function _spRestoreCardState_(st) {
    if (!st || typeof document === 'undefined') return;
    var lost = [];
    Object.keys(st.expanded).forEach(function (pid) {
        var card = document.getElementById('sp-card-' + pid); if (!card) return;   // the plan left this page (e.g. Done) - nothing typed is lost by that
        card.classList.add('is-expanded'); var b = card.querySelector('.sp-btn-expand'); if (b) b.textContent = 'Collapse';
        if (document.getElementById('sp-rc-' + pid)) { try { spRcRefresh(pid); } catch (eRc) {} }   // through the options cache
    });
    Object.keys(st.qty).forEach(function (pid) {
        var card = document.getElementById('sp-card-' + pid), touched = null;
        Object.keys(st.qty[pid]).forEach(function (lid) {
            var q = st.qty[pid][lid], inp = _spLineInput_(card, lid);
            if (!inp) { lost.push(q.sku + ': typed ' + q.value + ' (this plan can no longer be edited here)'); return; }
            if (inp.defaultValue === q.value) return;   // the server now holds what was typed (e.g. this very Save)
            if (inp.defaultValue !== q.base) { lost.push(q.sku + ': typed ' + q.value + ', the server now has ' + inp.defaultValue); return; }
            inp.value = q.value; touched = inp;
        });
        if (touched) spDbOnQtyInput(touched, pid);
    });
    Object.keys(st.notes).forEach(function (pid) {
        var n = st.notes[pid], ni = document.getElementById('sp-note-input-' + pid), nt = document.getElementById('sp-note-text-' + pid);
        if (!ni || !nt) { if (n.text) lost.push('the unsent note on a plan that is no longer on this page'); return; }
        if (n.open) ni.style.display = 'block'; nt.value = n.text;
    });
    if (st.focus) {
        var card = document.getElementById('sp-card-' + st.focus.plan), el = st.focus.id ? document.getElementById(st.focus.id) : (st.focus.line ? _spLineInput_(card, st.focus.line) : null);
        if (el && el.focus) { try { el.focus({ preventScroll: true }); if (st.focus.s != null && el.setSelectionRange) el.setSelectionRange(st.focus.s, st.focus.e); } catch (eF) {} }
    }
    if (st.anchor) { var a = document.getElementById(st.anchor.id); if (a && a.getBoundingClientRect && typeof window.scrollBy === 'function') { var d = a.getBoundingClientRect().top - st.anchor.top; if (d) window.scrollBy(0, d); } }
    try { _spReholdBusy_(); } catch (eRh) {}   // R15C-UI batch 2
    if (lost.length) _spNotify_('Some unsaved values were not put back because the plan changed on the server: ' + lost.join('; ') + '. Nothing was sent - check the plan and type them again if they are still wanted.');
}

// Resolve the three SKU-detail display values per spec §7 priority (snapshot → live → 0 / --).
// R71-FE-15 (N8 = 16_ gate-1j): the Legacy fallback uses the Owner-confirmed source scope + the marketplaces master, as 16_ does
function _spLineDisplay(line, plan, live) {
    // Current Stock: snapshot → available_qty + fc_transfer_qty + fc_processing_qty → 0
    // R71-FE-13 (N8, fail closed): the server stored no site value because it cannot be attributed to this company - say so, never fall back
    var _w13 = String((line && line.raw && line.raw.snapshot_avg_sales_warning) || '');
    if (/^SITE_SOURCE_(COMPANY_UNKNOWN|COMPANY_NOT_LISTED|NO_MARKETPLACE_SKU|NO_MARKETPLACE_ROW|NOT_CONFIRMED|MARKETPLACE_BLANK|SCOPE_UNDECIDED)/.test(_w13)) {   // R71-FE-15 / R71-FE-16: + the gate-1j / 1k reasons
        var _why13 = /^SITE_SOURCE_COMPANY_UNKNOWN/.test(_w13) ? 'source unknown (report row cannot be attributed to this company)'
            : /^SITE_SOURCE_NOT_CONFIRMED/.test(_w13) ? 'source not confirmed for this account'
            : /^SITE_SOURCE_SCOPE_UNDECIDED/.test(_w13) ? 'source not confirmed (no source scope decided for this environment)'
            : /^SITE_SOURCE_MARKETPLACE_BLANK/.test(_w13) ? 'source unknown (the snapshot rows have a blank marketplace)'
            : /^SITE_SOURCE_NO_MARKETPLACE_ROW/.test(_w13) ? 'source unknown (no marketplaces row for this site)'
            : /^SITE_SOURCE_COMPANY_NOT_LISTED/.test(_w13) ? 'source unknown (the marketplaces master gives this site to another company)' : 'source unknown (no marketplace listing for this site + SKU)';
        var _u13 = '<span class="sp-src-unknown" title="' + _spEsc(_why13 + ' - ' + _w13) + '">\u2014 <small style="color:#94A3B8;">' + _spEsc(_why13) + '</small></span>';
        return { currentStock: _u13, avgSales: _u13, daysOfSupply: '\u2014' };
    }
    var currentStock, _amb10 = false;   // R71-FE-10
    var _site10 = (live && live.mpCompanies) ? (live.mpCompanies[String(plan.country || '').trim().toLowerCase() + '||' + String(plan.marketplace || '').trim().toLowerCase()] || []) : [];
    // R71-FE-15 (N8 = 16_ gate-1j): the Legacy live fallback uses the same rule - "Amazon" is the only Owner-confirmed source scope, and the
    // marketplaces master must hold exactly ONE row for this country + marketplace, the plan's company. Inline, so a reader that lifts this function alone keeps the rule
    _site10 = (function () { var lo = function (v) { return String(v == null ? '' : v).trim().toLowerCase(); }, me = lo(plan && plan.company), c0 = lo(plan && plan.country), mk = lo(plan && plan.marketplace); if (c0 === 'gb') c0 = 'uk'; var SCOPE16 = { marketplace: 'amazon' }; if (mk !== 'amazon') return ['(not confirmed)', '(not confirmed 2)'];   /* R71-FE-16 (A-3): the Sandbox acceptance scope */ var list = ((live && live.mpRows15) || {})[c0 + '||' + mk] || []; return (list.length === 1 && lo(list[0]) === me) ? list : ['(unknown)', '(unknown 2)']; })();
    if (_spHasRaw(line, 'snapshot_current_stock')) {
        currentStock = _spNum(line.snapshotCurrentStock);
    } else {
        var inv = live && _spLookup(live.inv, plan.country, plan.marketplace, line.sku, plan.company, _site10);
        if (inv && inv.__ambiguousCompany) { _amb10 = true; inv = null; }
        currentStock = inv ? (_spNum(inv.availableQty) + _spNum(inv.fcTransferQty) + _spNum(inv.fcProcessingQty)) : null;   // R71-FE-9 (W5): unknown, not 0
    }
    // Avg Sales: snapshot → sales_units_7d / 7 → 0
    var avgSales;
    if (_spHasRaw(line, 'snapshot_avg_sales_per_day')) {
        avgSales = _spNum(line.snapshotAvgSalesPerDay);
    } else {
        var wk = live && _spLookup(live.weekly, plan.country, plan.marketplace, line.sku, plan.company, _site10);
        if (wk && wk.__ambiguousCompany) { _amb10 = true; wk = null; }
        avgSales = wk ? (_spNum(wk.salesUnits7d) / 7) : null;   // R71-FE-9 (W5): unknown, not 0
    }
    // Days of Supply: snapshot → currentStock / avgSales → --
    var dos;
    if (_spHasRaw(line, 'snapshot_days_of_supply')) {
        dos = line.snapshotDaysOfSupply;
    } else if (avgSales != null && avgSales > 0 && currentStock != null) {
        dos = (currentStock / avgSales).toFixed(1);
    } else {
        dos = '--';
    }
    var UNK = _amb10
        ? '<span title="Ambiguous company: the site reading names no company and this country + marketplace belongs to more than one company - not picked">\u2014</span>'   // R71-FE-10
        : '<span title="Not measured for this site when the plan was made (no snapshot, no site reading) - unknown, not 0">\u2014</span>';   // R71-FE-9 (W5)
    var avgDisp = (avgSales == null) ? UNK : ((avgSales > 0) ? avgSales.toFixed(1) : (_spHasRaw(line, 'snapshot_avg_sales_per_day') ? _spNum(line.snapshotAvgSalesPerDay).toFixed(1) : '0.0'));
    // R71-FE-15 (F1): a stored SITE_STOCK_ROW_NOT_FOUND is named; (m-b) a shown site number carries the source-scope note (rendered under the table)
    var NOROW15 = '<span class="sp-src-unknown" title="SITE_STOCK_ROW_NOT_FOUND: no amazon_inventory_snapshot row for this site + SKU when the plan was made - unknown, not 0">\u2014 <small style="color:#94A3B8;">no snapshot row</small></span>';
    var noRow15 = currentStock == null && /SITE_STOCK_ROW_NOT_FOUND/.test(_w13);
    var note15 = (currentStock != null || avgSales != null) ? 'Original Amazon account reports; all countries confirmed by Owner 2026-11-06. KM Amazon excluded.' : '';   // R71-FE-16: the scope is named
    return { currentStock: (currentStock == null ? (noRow15 ? NOROW15 : UNK) : currentStock), avgSales: avgDisp, daysOfSupply: (dos === '' || dos == null) ? '--' : dos, sourceNote: note15 };
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
        var _cur11 = String(plan.currency || (plan.raw && plan.raw.currency) || '').trim();   // R71-FE-11: the server's currency
        var totalCostDisp = (totalCostNum == null) ? '--' : ((_cur11 ? _spEsc(_cur11) + ' ' : '') + totalCostNum.toFixed(2));
        var unitCostDisp = (totalCostNum == null || totalPcs <= 0) ? '--' : ((_cur11 ? _spEsc(_cur11) + ' ' : '') + (totalCostNum / totalPcs).toFixed(4));
        var editable = (statusType === 'draft');
        var pid = plan.shippingPlanId;
        // Company: persisted snapshot first; live-join marketplaces ONLY as a legacy fallback when blank.
        var _cl10 = (live && live.mpCompanies) ? (live.mpCompanies[String(plan.country || '').trim().toLowerCase() + '||' + String(plan.marketplace || '').trim().toLowerCase()] || []) : [];
        var companyDisp = plan.company || (_cl10.length === 1 ? _cl10[0] : '');   // R71-FE-10: never the first of several
        // Match the spStatusFilter dropdown tokens (draft / pendingApproval / approved) so filterByStatus works.
        var dsAttr = (statusType === 'pending_approval') ? 'pendingApproval' : statusType;

        // F1-7N-FC-1A §J.2/§J.3 — the gate on the two transitions that commit a decision. Submit and
        // Approve are disabled by a deployment mismatch, and Retry additionally by an in-flight retry, so a
        // double click cannot become a second create attempt.
        var gate = _spGateAttrs_();
        var recovery = spShipmentRecoveryState_(statusType, _spTransferred(plan), _spContractOk_(), !!_spInFlight[pid + ':retryshipment']);

        var actions = '<button class="sp-btn sp-btn-expand" onclick="toggleSpDbCard(\'' + pid + '\')">Expand</button>';
        if (statusType === 'draft') {
            actions += '<button class="sp-btn sp-btn-submit" onclick="spDbSaveQty(\'' + pid + '\')">Save</button>'
                    + '<button class="sp-btn sp-btn-submit"' + gate + ' onclick="spDbSubmit(\'' + pid + '\')">Submit</button>'
                    + '<button class="sp-btn sp-btn-cancel" onclick="spDbCancel(\'' + pid + '\')">Cancel</button>';
        } else if (statusType === 'pending_approval') {
            actions += '<button class="sp-btn sp-btn-submit"' + gate + ' onclick="spDbApprove(\'' + pid + '\')">Approve</button>'
                    + '<button class="sp-btn sp-btn-cancel" onclick="spDbReject(\'' + pid + '\')">Reject</button>'
                    + '<button class="sp-btn sp-btn-cancel" onclick="spDbCancel(\'' + pid + '\')">Cancel</button>';
        } else if (statusType === 'approved' && recovery.state === 'SHIPMENT_PRESENT') {
            // Execution Commit done → Decision Layer can be marked Completed (Done).
            actions += '<button class="sp-btn sp-btn-submit" onclick="spDbDone(\'' + pid + '\')">Done</button>';
        } else if (recovery.isRecoverable) {
            // §C.1 — THE RETRY THAT DID NOT EXIST. The approval is committed and kept; only the Execution
            // Commit is outstanding. Done is deliberately NOT offered here - marking the planning task
            // complete while its shipment is missing is precisely how this state used to disappear from view.
            actions += '<button class="sp-btn"' /* INT-CAND9 r3 F4: not primary - outcome UNKNOWN here */ + (recovery.canRetry ? '' : (' disabled title="' +
                        _spEsc(recovery.blockedBy === 'RETRY_IN_FLIGHT'
                            ? 'A retry is already running for this plan.'
                            : _spContractMsg_()) + '"')) +
                       ' onclick="spDbRetryShipment(\'' + pid + '\')">Retry Shipment Draft</button>';
            // S6-R5 §13 — THE EXIT. Retry was the only door out of this state, and a retry that keeps
            // failing is not an exit: the plan went on holding factory exposure with nothing an operator
            // could do about it. Cancel is offered HERE and only here — approved, and no Shipment — which
            // is the same condition the server evaluates. The server remains the authority: this branch
            // reads the plan's transfer marker, which can be blank on a plan that DOES have a Shipment, so
            // a button shown in error is refused with a typed code rather than acted on.
            actions += '<button class="sp-btn sp-btn-cancel" onclick="spDbCancel(\'' + pid + '\', \'approved\')">Cancel</button>';
        }

        // F1-7N-FC-1A §D — the recoverable condition, stated on the card. Silence here is what let an
        // approved plan with no shipment sit unnoticed: the card looked exactly like a healthy approved plan,
        // and the only hint had been a one-off alert pointing at a page that cannot show this state.
        var recoveryBanner = recovery.isRecoverable
            ? ('<div class="sp-recovery-banner" style="margin:6px 0; padding:8px 10px; border-left:3px solid #b45309; background:#fffbeb; color:#78350f; font-size:12px; line-height:1.5;">'
               // PHASE1 INT-CAND9 (option A; round 3 review F4): a reload reads the plan only (workspace mode reads no shipments), so this view
               // cannot know whether a draft or a reservation was written: the state is UNKNOWN here. It never claims 'nothing reserved' or
               // 'retrying is safe'; the server decides.
               + '<strong>Approved — Shipment Draft state UNKNOWN from this view.</strong> No Shipment Draft is recorded on this plan. The approval is committed and kept. '
               + 'Whether a Shipment Draft or a stock reservation was already written is NOT confirmed from this view (it reads the plan only). '
               + '<em>Retry Shipment Draft</em> is re-checked by the server before anything is written: an existing draft that names this plan is re-used or refused for review, a shipment linked to this plan only through a legacy plan column blocks it, and stock keys whose reservation books disagree are refused.'
               + (recovery.canRetry ? '' : ('<br><span style="color:#991b1b;">Retry is unavailable: '
                   + _spEsc(recovery.blockedBy === 'RETRY_IN_FLIGHT' ? 'a retry is already running.' : _spContractMsg_())
                   + '</span>'))
               + '</div>')
            : '';

        var _spNote15 = '';   // R71-FE-15 (m-b)
        var rows = planLines.map(function(l) {
            var qtyCell = editable
                ? '<input type="number" min="0" value="' + _spNum(l.approvedQty) + '" data-line-id="' + _spEsc(l.shippingPlanLineId) + '" data-upc="' + _spNum(l.unitsPerCarton) + '" data-sku="' + _spEsc(l.sku) + '" oninput="spDbOnQtyInput(this, \'' + pid + '\')" style="text-align:right; width:90px;">'
                : _spNum(l.approvedQty);
            var disp = _spLineDisplay(l, plan, live); if (disp.sourceNote) _spNote15 = disp.sourceNote;
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

        // R71-FE-11: Cost Breakdown is READ-ONLY and shows only what the server priced and stored on the plan (shippingPlan.selectRateCard)
        var costBreakdown = _spCostBreakdownHtml_(plan, totalPcs);

        html += '' +
        '<div class="sp-card" id="sp-card-' + _spEsc(pid) + '" data-plan-id="' + _spEsc(pid) + '" data-status="' + dsAttr + '">' +
            '<div class="sp-card-header">' +
                '<div class="sp-card-summary">' +
                    _spSummary('Status', '<span class="plan-status-badge plan-status-badge--' + (statusType === 'pending_approval' ? 'pendingApproval' : statusType) + '">' + statusLabel + ' (v' + _spNum(plan.planVersion) + ')</span>') +
                    _spSummary('Submitted Date', _spEsc(plan.createdAt || '')) +
                    _spSummary('Company', _spEsc(companyDisp)) +
                    _spSummary('Country', _spEsc(plan.country || '')) +
                    _spSummary('Marketplace', _spEsc(plan.marketplace || '')) +
                    _spSummary('Destination', '<span id="sp-dest-header14-' + _spEsc(pid) + '">' + _spEsc(_spWk1DestLabel_(plan)) + '</span>') +
                    _spSummary('Shipping Method', _spEsc(plan.shippingMethod || '')) +
                    _spSummary('Total Pcs', '<span id="sp-total-pcs-' + _spEsc(pid) + '">' + totalPcs + '</span>') +
                    _spSummary('Total Cartons', '<span id="sp-total-cartons-' + _spEsc(pid) + '">' + totalCartons + '</span>') +
                    // Total CBM / Gross Wt / Net Wt are HIDDEN from the Layer-1 Approval/Review summary
                    // (2026-07-28 UI). They remain computed here (totalCbm/totalGross/totalNet) + shown in the
                    // Layer-2 Details table + used by Combined-plan recompute / Shipment — data is NOT removed.
                    _spSummary('Total Cost', totalCostDisp) +

                '</div>' +
                recoveryBanner +
                '<div class="sp-card-actions">' + actions + '</div>' +
            '</div>' +
            '<div class="sp-card-details">' +
                '<div class="sp-details-grid">' +
                    '<div class="sp-section">' +
                        '<h4 class="sp-section-title sp-sku-heading">SKU Shipping Details' +
                            (editable ? '<button type="button" class="sp-btn" onclick="spDbEditSkus(\'' + _spEsc(pid) + '\')">Edit SKUs</button>' : '') + '</h4>' +
                        '<table class="sp-sku-table"><thead><tr>' +
                            '<th>SKU</th><th>Current Stock</th><th>Avg. Sales</th><th>Days of Supply</th><th>Shipping Qty</th><th>Cartons</th>' +
                        '</tr></thead><tbody>' + rows + '</tbody>' + footer + '</table>' +
                        (_spNote15 ? '<details class="sp-src-scope15" style="color:#64748B;font-size:11px;margin-top:4px;"><summary>Amazon report source</summary>' + _spEsc(_spNote15) + '</details>' : '') +
                    '</div>' +
                    '<div class="sp-section">' +
                        '<h4 class="sp-section-title" style="display:flex; justify-content:space-between; align-items:center;">' +
                            '<span>Plan Rationale</span>' + addNoteBtn +
                        '</h4>' +
                        '<div class="sp-rationale-text">' +
                            '<div class="sp-rationale-item"><strong>Target Days:</strong> ' + (planLines[0] ? _spNum(planLines[0].snapshotTargetDays) : '--') + '</div>' +
                            _spRcPanelHtml_(plan, statusType) +   // R71-FE-11: Carrier -> Method (Draft: editable, server-priced)
                            '<div class="sp-rationale-item"><strong>Plan No:</strong> ' + _spEsc(plan.shippingPlanNo || '') + '</div>' +
                            (plan.transferredShipmentId ? '<div class="sp-rationale-item"><strong>Shipment Draft:</strong> ' + _spEsc(plan.transferredShipmentId) + (plan.transferredToShipmentAt ? ' (' + _spEsc(plan.transferredToShipmentAt) + ')' : '') + '</div>' : '') +
                            (plan.completedAt ? '<div class="sp-rationale-item"><strong>Decision Completed:</strong> ' + _spEsc(plan.completedAt) + (plan.completedBy ? ' by ' + _spEsc(plan.completedBy) : '') + '</div>' : '') +
                            noteInput +
                            noteHtml +
                            // R6-R7-R5 §7 — filled asynchronously by spFactoryGuardRefresh. It is a DIV and
                            // not a number baked into this string, because the figure must come from the same
                            // server function the submit gate runs rather than from the rows already here.
                            (statusType === 'draft'
                              ? ('<div id="sp-factory-guard-' + _spEsc(pid) + '"></div>')
                              : '') +
                        '</div>' +
                    '</div>' +
                    costBreakdown +
                '</div>' +
            '</div>' +
        '</div>';
    });

    container.innerHTML = html;

    // R6-R7-R5 §7 — the indicator is fetched AFTER the DOM exists, per Draft card. It is deliberately not
    // awaited and cannot fail the render: an availability figure is useful, and a page that would not draw
    // without it would be worse than a page that draws and then says the figure is unavailable.
    try {
        Array.prototype.forEach.call(container.querySelectorAll('[id^="sp-factory-guard-"]'), function (el) {
            var pid = el.id.replace('sp-factory-guard-', '');
            if (pid) spFactoryGuardRefresh(pid);
        });
    } catch (eFGR) { /* an indicator is never allowed to break a render */ }
    try { Array.prototype.forEach.call(container.querySelectorAll('[id^="sp-rc-"][data-rc-editable="1"]'), function (el) { var p = el.getAttribute('data-plan-id'), card = document.getElementById('sp-card-' + p); if (p && card && card.classList.contains('is-expanded')) spRcRefresh(p); }); } catch (eRC) { /* optional read only */ }
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
    if (card.classList.contains('is-expanded')) spRcRefresh(planId);
}

// sku_details logistics lookup (rebuilt each render). Used for the live header CBM/weight totals
// and the post-Save local cache patch. Mirrors the Apps Script logistics formula (cm only for now).
var _spSkuLogiCache = null;
var _spWsSkuDetails = null;   // F1-7J-A2: Workspace-mode SKU logistics projection (null = Legacy → broad getter)
function _spSkuDetail(sku) {
    if (!_spSkuLogiCache) {
        _spSkuLogiCache = {};
        // F1-7J-A2: canonical (Workspace) mode reads the scoped SKU projection; Legacy reads the broad getter unchanged.
        // No silent broad fallback in Workspace mode: _spWsSkuDetails is [] (not null) whenever a workspace model rendered.
        var list = _spWsSkuDetails ? _spWsSkuDetails
            : ((window.KM.DB.getSkuDetails && window.KM.DB.getSkuDetails()) || []);
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

// R71-FE-1 (edit conflict, Owner D4 - LOCAL CANDIDATE): the row tokens are taken from the model this page is SHOWING (_spLastModel),
// and only on the Workspace read: 40_ serves each row's updated_at as read ('yyyy-MM-dd HH:mm:ss' text, or String(Date) / ISO for a Date
// cell). The legacy whole-DB cache is never a token source (CH8-1: date-only, and never refreshed by a Workspace-mode write). A value in
// none of the three second-precision forms the server parses is NOT sent: no token = the server's last-write-wins (the r7 behaviour).
function _spTok_(v) {
    var s = String(v == null ? '' : v).trim();
    return (/^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$/.test(s) ||
        /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:?[0-9]{2})$/.test(s) ||
        /[0-9]{2}:[0-9]{2}:[0-9]{2} GMT[+-][0-9]{4}/.test(s)) ? s : '';
}
function _spWsModel_() { return (_spLastModel && _spLastModel.source === 'workspace') ? _spLastModel : null; }
function _spPlanRec_(planId) { var m = _spWsModel_(); return m ? ((m.plans || []).filter(function (p) { return String(p.shippingPlanId) === String(planId); })[0] || null) : null; }
function _spLineRec_(lineId) { var m = _spWsModel_(); return m ? ((m.lines || []).filter(function (l) { return String(l.shippingPlanLineId) === String(lineId); })[0] || null) : null; }
function _spPlanTok_(planId) { var p = _spPlanRec_(planId); return p ? _spTok_(p.updatedAt || (p.raw && p.raw.updated_at)) : ''; }
function _spLineTok_(lineId) { var l = _spLineRec_(lineId); return l ? _spTok_(l.raw && l.raw.updated_at) : ''; }
// The qty-save body: each line carries its own token (_spCollectQtyLines) and the plan token rides along, so a plan someone else already
// moved on (submitted, rejected...) is refused as EDIT_CONFLICT instead of the server skipping its lines and answering success.
function _spQtyBody_(planId, lines) { var b = { lines: lines, shipping_plan_id: planId }, t = _spPlanTok_(planId); if (t) b.expected_plan_updated_at = t; return b; }
// After a successful qty save the server answers the lines' new token (11_ data.updated_at). It is adopted at once, so the same user's
// next save, before the re-read lands, is not refused as a conflict with itself.
function _spAdoptLineTok_(lines, res) {
    var t = _spTok_(res && res.data && res.data.updated_at); if (!t) return;
    (lines || []).forEach(function (x) { var l = _spLineRec_(x.shipping_plan_line_id); if (l) { l.raw = l.raw || {}; l.raw.updated_at = t; } });
}
// EDIT_CONFLICT: nothing was written. The card is NOT re-rendered (the operator's typed values stay on screen), nothing is retried with
// the new token, and the box names what differs and offers Reload (which shows the current values and drops the typed ones).
function _spShowEditConflict_(planId, err, sent) {
    var card = document.getElementById('sp-card-' + planId);
    if (!card) { _spNotify_('Not saved - ' + ((err && err.message) || 'EDIT_CONFLICT')); return; }
    var d = (err && err.details) || {}, rows = [], mine = {}, p = _spPlanRec_(planId);
    (sent || []).forEach(function (x) { mine[String(x.shipping_plan_line_id)] = x.approved_qty; });
    var list_ = Array.isArray(d.conflicts) ? d.conflicts : [d];
    list_.forEach(function (c) {
        if (!c) return;
        if (c.shipping_plan_line_id) {
            var l = _spLineRec_(c.shipping_plan_line_id), y = mine[String(c.shipping_plan_line_id)];
            rows.push('<li data-field="approved_qty" data-line="' + _spEsc(c.shipping_plan_line_id) + '">Shipping Qty' + (l && l.sku ? ' of ' + _spEsc(l.sku) : '') +
                ': yours <strong>' + _spEsc(String(y == null ? '?' : y)) + '</strong>, now saved <strong>' + _spEsc(String(c.current_approved_qty == null ? '?' : c.current_approved_qty)) +
                '</strong> (saved ' + _spEsc(String(c.current_updated_at || '?')) + ')</li>');
        } else {
            rows.push('<li data-field="status">Plan status: you saw <strong>' + _spEsc(String((p && p.status) || '?')) + '</strong>, now <strong>' + _spEsc(String(c.current_status || '?')) +
                '</strong> (saved ' + _spEsc(String(c.current_updated_at || '?')) + ')</li>');
        }
    });
    // R71-FE-2 (review m-2): every refused line already holds exactly the typed qty = most likely this user's own earlier save (an answer lost)
    var selfOnly_ = list_.length > 0 && list_.every(function (c) { var y = c && mine[String(c.shipping_plan_line_id)]; return !!(c && c.shipping_plan_line_id) && y != null && c.current_approved_qty != null && Number(y) === Number(c.current_approved_qty); });
    var head_ = (err && err.qtySaved) ? ['Shipping Qty saved, but Submit was NOT made - this plan was changed by someone else since you opened it.', 'Your quantities were written; the status was not changed and nothing was resent.'] :   // R71-FE-2 (m-6)
        selfOnly_ ? ['Not saved again - your earlier save may already be written (the saved quantity equals yours).', 'Nothing was written by this press. Reload to confirm.'] :
        ['Not saved - this plan was changed by someone else since you opened it.', 'Nothing was written. Your values are still on screen; they were not sent again.'];
    var old = card.querySelector('.sp-edit-conflict'); if (old) old.parentNode.removeChild(old);
    card.insertAdjacentHTML('afterbegin', '<div class="sp-edit-conflict" role="alert" data-code="EDIT_CONFLICT" style="color:#7F1D1D;background:#FEF2F2;border-left:3px solid #EF4444;padding:8px 10px;margin:6px 8px;font-size:12px;overflow-wrap:anywhere;">' +
        '<div style="font-weight:600;">' + _spEsc(head_[0]) + '</div>' +
        '<div>' + _spEsc(head_[1]) + '</div>' +
        (rows.length ? '<ul style="margin:4px 0 0 16px;padding:0;">' + rows.join('') + '</ul>' : '') +
        '<button type="button" class="sp-btn sp-edit-conflict-reload" onclick="renderShippingPlanFromDb()" style="margin-top:6px;">Reload</button> ' +
        '<span style="font-size:11px;">Reload shows the current values; then make your change again.</span></div>');
}

function _spCollectQtyLines(planId) {
    var card = document.getElementById('sp-card-' + planId);
    if (!card) return [];
    var out = [];
    card.querySelectorAll('input[data-line-id]').forEach(function(inp) {
        var o = { shipping_plan_line_id: inp.getAttribute('data-line-id'), approved_qty: parseInt(inp.value) || 0 }, t = _spLineTok_(o.shipping_plan_line_id);   // R71-FE-1: the line token
        if (t) o.expected_updated_at = t;
        out.push(o);
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

// ---- C1 command reliability: double-click guard · single readback · committed/readback-failed handling ----
var _spInFlight = {};
var _spReadbackBlocked_ = false;
function _spNotify_(msg) { try { alert(msg); } catch (e) { /* headless */ } }
// Exactly ONE readback via the ACTIVE read path (Workspace when enabled, else Legacy loadOperationDb). If the
// readback fails AFTER a committed write, it is flagged (readbackFailed) — the command itself already succeeded.
function _spReadbackAfterWrite_() {
    if (_spEffectiveWorkspace()) {
        try { return Promise.resolve(renderShippingPlanFromDb()).then(function (ok) { return { readbackFailed: ok !== true }; }); }
        catch (e) { return Promise.resolve({ readbackFailed: true }); }
    }
    if (window.KM && window.KM.DB && window.KM.DB.loadOperationDb) {
        return Promise.resolve(window.KM.DB.loadOperationDb({ force: true })).then(function () {
            try { renderShippingPlan(); } catch (e) { /* render only */ }
            return { readbackFailed: false };
        }, function () {
            // committed write, but the reload hiccuped → reconciliation attempt + flag (do NOT prompt a blind retry)
            try { renderShippingPlan(); } catch (e) { /* best effort */ }
            return { readbackFailed: true };
        });
    }
    try { renderShippingPlan(); } catch (e) { /* best effort */ }
    return Promise.resolve({ readbackFailed: false });
}
function _spHandleCommandResult_(res, opts) {
    opts = opts || {};
    if (res && res.success) {
        return _spReadbackAfterWrite_().then(function (rb) {
            if (rb && rb.readbackFailed) { _spNotify_(opts.commitMsg || '已提交，正在重新確認狀態…'); return; }
            var msg = (typeof opts.onSuccess === 'function') ? opts.onSuccess(res) : opts.successMsg;
            if (msg) _spNotify_(msg);
        });
    }
    var err = (res && res.error) || { code: 'UNKNOWN', message: 'Command failed' };
    if (err.code === 'ALREADY_IN_TARGET_STATE') {
        // benign idempotent replay: the transition was (probably) already applied — refresh to the truth, gentle note.
        return _spReadbackAfterWrite_().then(function () { _spNotify_('狀態已是最新（先前的操作可能已成功）。'); });
    }
    // R71-FE-1: a stale token - nothing written; the card keeps the typed values and names what differs (never resent here)
    if (err.code === 'EDIT_CONFLICT' && opts.planId) { _spShowEditConflict_(opts.planId, err, opts.sent); return Promise.resolve(); }
    // genuine failure BEFORE/without a committed mutation → retain the current cards, show structured error, allow retry.
    _spNotify_((opts.failPrefix || '操作失敗') + ': ' + err.message + ' [' + err.code + ']');
    return Promise.resolve();
}
// Run one Weekly command with a per-key in-flight guard (double-click protection) + a single active-path readback.
// R71-FE-9 (W8): one command per PLAN at a time; the plan's action buttons are held, the pressed one says what is happening
var _SP_BUSY_LABEL_ = { saveqty: 'Saving\u2026', submit: 'Submitting\u2026', approve: 'Approving\u2026', reject: 'Updating\u2026', cancel: 'Cancelling\u2026', done: 'Updating\u2026', note: 'Saving\u2026', retryshipment: 'Updating\u2026', ratecard: 'Saving\u2026' };
var _SP_BUSY_FN_ = { saveqty: 'spDbSaveQty', submit: 'spDbSubmit', approve: 'spDbApprove', reject: 'spDbReject', cancel: 'spDbCancel', done: 'spDbDone', note: 'spDbSaveNote', retryshipment: 'spDbRetryShipment', ratecard: 'spRcSave' };
function _spPlanBusy_(planId) { var p = String(planId) + ':'; return Object.keys(_spInFlight).some(function (k) { return _spInFlight[k] && k.indexOf(p) === 0; }); }
function _spHoldButtons_(planId, op) {
    var held = [];
    try {
        var q = String(planId).replace(/[^A-Za-z0-9_\-]/g, '');   // a plan id is [A-Z0-9-]; anything else is never matched
        Array.prototype.forEach.call(document.querySelectorAll('button[onclick*="' + q + '"]'), function (b) {
            var oc = String(b.getAttribute('onclick') || ''); if (oc.indexOf('spDb') < 0 && oc.indexOf('spRcSave(') !== 0) return;   // R71-FE-11: the carrier Save is held too
            if (oc.indexOf("'" + q + "'") < 0) return;   // R15C-UI b2 review MINOR: the plan id must be the quoted argument (P1 never matches P10)
            held.push({ b: b, t: b.innerHTML, d: b.disabled, w: b.style.minWidth, h: b.style.minHeight });
            var r = b.getBoundingClientRect ? b.getBoundingClientRect() : null;
            if (r && r.width) { b.style.minWidth = Math.ceil(r.width) + 'px'; b.style.minHeight = Math.ceil(r.height) + 'px'; }
            if (_SP_BUSY_FN_[op] && oc.indexOf(_SP_BUSY_FN_[op] + '(') === 0) b.textContent = _SP_BUSY_LABEL_[op] || 'Updating\u2026';
            b.disabled = true; b.setAttribute('aria-busy', 'true');
        });
    } catch (e) {}
    return function release() { held.forEach(function (x) { try { x.b.innerHTML = x.t; x.b.disabled = x.d; x.b.style.minWidth = x.w; x.b.style.minHeight = x.h; x.b.removeAttribute('aria-busy'); } catch (e2) {} }); _spUnholdPlan_(planId); };
}
// R15C-UI batch 2: A REPAINT KEEPS THE HOLD. A readback (of this or another plan) rebuilds the cards, and the new buttons of a plan whose
// command is still running came back enabled with their normal label - the command itself was still guarded by _spInFlight / _spPlanBusy_
// (nothing could be sent twice), but the page said otherwise. After every repaint each busy plan's buttons are held again (marked
// data-sp-held), and the command's release frees those too, restoring the state each button was rendered with.
function _spHeldButtonsOf_(planId) { var q = String(planId).replace(/[^A-Za-z0-9_\-]/g, ''), out = []; try { Array.prototype.forEach.call(document.querySelectorAll('button[onclick*="' + q + '"]'), function (b) { var oc = String(b.getAttribute('onclick') || ''); if (oc.indexOf('spDb') < 0 && oc.indexOf('spRcSave(') !== 0) return; if (oc.indexOf("'" + q + "'") < 0) return; out.push(b); }); } catch (e) {} return out; }   // b2 review MINOR: the plan id must be the quoted argument (P1 never matches P10)
function _spReholdBusy_(onlyPlan) {
    Object.keys(_spInFlight).forEach(function (k) {
        if (!_spInFlight[k]) return; var pid = k.split(':')[0], op = k.split(':').slice(1).join(':'); if (onlyPlan && String(onlyPlan) !== pid) return;
        _spHeldButtonsOf_(pid).forEach(function (b) {
            if (b.getAttribute('data-sp-held') === '1') return;
            b.setAttribute('data-sp-held', '1'); b.setAttribute('data-sp-held-text', b.innerHTML); b.setAttribute('data-sp-held-disabled', b.disabled ? '1' : '0');
            if (_SP_BUSY_FN_[op] && String(b.getAttribute('onclick') || '').indexOf(_SP_BUSY_FN_[op] + '(') === 0) b.textContent = _SP_BUSY_LABEL_[op] || 'Updating...';
            b.disabled = true; b.setAttribute('aria-busy', 'true');
        });
    });
}
function _spUnholdPlan_(planId) {
    if (_spPlanBusy_(planId)) return;   // another command of this plan still runs
    _spHeldButtonsOf_(planId).forEach(function (b) { if (b.getAttribute('data-sp-held') !== '1') return; b.innerHTML = b.getAttribute('data-sp-held-text') || b.innerHTML; b.disabled = b.getAttribute('data-sp-held-disabled') === '1'; ['data-sp-held', 'data-sp-held-text', 'data-sp-held-disabled', 'aria-busy'].forEach(function (a) { b.removeAttribute(a); }); });
}
var _SP_UNKNOWN_CODES_ = { HTTP_TRANSPORT_ERROR: 1, REQUEST_TIMEOUT_WRITE_INDETERMINATE: 1, NO_RESULT: 1, RATE_CARD_SELECTION_INTERRUPTED: 1, RATE_CARD_SELECTION_UNVERIFIED: 1 };   // WK1: + the two 11_ partial-write outcomes
function _spRunCommand_(key, invokeFn, opts) {
    if (_spReadbackBlocked_) { _spNotify_('Reload the plans successfully before another change. Nothing was sent.'); return Promise.resolve({ success: false, error: { code: 'READBACK_REQUIRED' } }); }
    var _pid9 = String(key).split(':')[0], _op9 = String(key).split(':').slice(1).join(':');
    if (_spInFlight[key] || (typeof _spPlanBusy_ === 'function' && _spPlanBusy_(_pid9))) return Promise.resolve({ success: false, error: { code: 'IN_FLIGHT', message: 'A command is already running for this plan.' } });   // R71-FE-9 (W8)
    _spInFlight[key] = true;
    var _release9 = (typeof _spHoldButtons_ === 'function') ? _spHoldButtons_(_pid9, _op9) : function () {};
    return Promise.resolve().then(invokeFn).then(function (res) {
        return res || { success: false, error: { code: 'NO_RESULT', message: 'No result returned' } };
    }, function (err) {
        return { success: false, error: { code: (err && err.apiCode) || 'HTTP_TRANSPORT_ERROR', message: (err && err.message) || String(err) } };
    }).then(function (res) {
        if (typeof _spRcForget_ === 'function') _spRcForget_(_pid9);   // R15C-UI: written, refused or UNKNOWN - the next options read asks the server
        var _c9 = res && res.success !== true && res.error && res.error.code;
        if (_c9 && typeof _SP_UNKNOWN_CODES_ !== 'undefined' && _SP_UNKNOWN_CODES_[_c9]) {   // R71-FE-9 (W8): an UNKNOWN outcome is read back, never offered as a retry
            _spNotify_((opts.failPrefix || 'Command') + ': the outcome is UNKNOWN (' + _c9 + '). Nothing was resent. The plan is being re-read - check its status before doing anything else.');
            return _spReadbackAfterWrite_().then(function () { _spInFlight[key] = false; _release9(); return res; }, function () { _spInFlight[key] = false; _release9(); return res; });   // (the release also frees re-held buttons)
        }
        return _spHandleCommandResult_(res, opts).then(function () { _spInFlight[key] = false; _release9(); return res; });
    }, function (e) {   // R71-FE-10 (MINOR-1): a rejection is an UNKNOWN outcome too - read back before releasing
        if (typeof _spRcForget_ === 'function') _spRcForget_(_pid9);   // R15C-UI
        _spNotify_((opts.failPrefix || 'Command') + ': the outcome is UNKNOWN (' + ((e && e.message) || e) + '). Nothing was resent. The plan is being re-read - check its status before doing anything else.');
        return Promise.resolve().then(_spReadbackAfterWrite_).then(function () { _spInFlight[key] = false; _release9(); throw e; }, function () { _spInFlight[key] = false; _release9(); throw e; });
    });
}

function spDbSaveQty(planId) {
    var lines = _spCollectQtyLines(planId);
    if (!lines.length) { renderShippingPlan(); return; }
    _spRunCommand_(planId + ':saveqty', function () {
        return window.KM.DB.updateShippingPlanLineQty(_spQtyBody_(planId, lines)).then(function (res) { if (res && res.success) { _spPatchLocalQty(lines); _spAdoptLineTok_(lines, res); } return res; });   // R71-FE-1: tokens
    }, { successMsg: 'Shipping Qty saved.', failPrefix: 'Save failed', planId: planId, sent: lines });
}

function spDbEditSkus(planId) {
    if (_spReadbackBlocked_ || _spPlanBusy_(planId)) { _spNotify_('Reload or finish the current command first.'); return Promise.resolve(); }
    var plan = _spPlanRec_(planId), model = _spWsModel_(), token = _spPlanTok_(planId);
    if (!plan || plan.status !== 'draft' || !token) { _spNotify_('Reload this Draft before editing SKUs.'); return Promise.resolve(); }
    var lines = (model.lines || []).filter(function (l) { return String(l.shippingPlanId) === String(planId); });
    var values = {}, card = document.getElementById('sp-card-' + planId);
    if (card) card.querySelectorAll('input[data-line-id]').forEach(function (i) { values[i.getAttribute('data-line-id')] = i.value; });
    return window.KM.scriptLoader.load('assets/js/utils/weekly-draft-editor.js').then(function (loaded) {
        if (!loaded || !window.KM.weeklyDraftEditor) throw Error('SKU editor could not be loaded.');
        return window.KM.weeklyDraftEditor.open({ plan: plan, token: token, lines: lines, values: values,
            save: function (body) {
                if (_spReadbackBlocked_ || _spPlanBusy_(planId)) return Promise.resolve({ success: false, error: { code: 'IN_FLIGHT', message: 'Finish the current command first.' } });
                var key = planId + ':skus'; _spInFlight[key] = true;
                var release = _spHoldButtons_(planId, 'skus');
                return Promise.resolve().then(function () { return window.KM.DB.updateShippingPlanLineQty(body); })
                    .finally(function () { _spInFlight[key] = false; release(); });
            },
            readback: _spReadbackAfterWrite_
        });
    }).catch(function (e) { _spNotify_(e.message || String(e)); });
}

// ==============================================================================================================
// F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R5 §4/§7 — THE FACTORY STOCK OVERAGE MODAL.
//
// ONLY ON SEND TO PENDING APPROVAL. Typing a large number into a Draft is not an authorisation and must not be
// treated as one, so nothing here fires while a Draft is being edited; the Draft carries a NON-BLOCKING
// indicator instead. Interrupting an edit to ask a question the operator has not finished answering is how a
// confirmation becomes a reflex, and a reflex confirms nothing.
//
// AND THE MODAL IS NOT THE GUARD. The server refuses the transition on its own and recomputes availability
// inside its write lock. This dialog exists so a person can supply the reason and accept the shortfall — which
// is why the flow is SUBMIT FIRST and the modal is opened by the server saying it is required, rather than by
// the page pre-checking and deciding whether to ask. A page that decided would be a second authority, and the
// one it did not consult is the one holding the lock.
//
// NO GENERIC CONFIRM (§7). The primary button says "Confirm Overage", never "OK": the operator is agreeing to a
// specific, named, audited thing, and a button that does not say so asks them to agree to nothing in particular.
// ==============================================================================================================
var _spOverageDom = null;

// The typed code the server uses for the challenge. Matched EXACTLY — a substring test would also match a
// message that merely mentions the code.
var SP_OVERAGE_CODE_ = 'FACTORY_STOCK_OVERAGE_CONFIRMATION_REQUIRED';

function _spOverageClose() {
    if (_spOverageDom && _spOverageDom.overlay && _spOverageDom.overlay.parentNode) {
        _spOverageDom.overlay.parentNode.removeChild(_spOverageDom.overlay);
    }
    _spOverageDom = null;
}

function _spOvNum(v) { var n = Number(v); return isFinite(n) ? n.toLocaleString() : String(v == null ? '' : v); }

function _spOvEsc(v) {
    return String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Is this response the server's overage challenge? Returns the challenge data, or null.
 *
 * A challenge carrying no pool numbers is deliberately NOT treated as one: this page can only present a
 * shortfall it can show the arithmetic for, and a bare code with no figures would put an operator in front of a
 * Confirm Overage button with nothing to read.
 */
function _spIsOverageChallenge(res) {
    if (!res || res.success !== false) return null;
    var e = res.error || {};
    var code = e.code || res.code || null;
    if (code !== SP_OVERAGE_CODE_) return null;
    var d = e.data || res.data || null;
    if (!d || !d.overage_pools || !d.overage_pools.length) return null;
    return d;
}

/**
 * Open the modal for one server-issued challenge. Resolves with:
 *   null   the operator cancelled — NOTHING is sent, so nothing mutates
 *   {...}  the confirmation payload, to travel WITH the transition it authorises
 *
 * Every number shown is read from `challenge`; none is recomputed here, because a page that recomputed could
 * show a total the server never agreed to.
 */
function _spOverageAsk(challenge) {
    return new Promise(function (resolve) {
        _spOverageClose();
        var pools = (challenge && challenge.overage_pools) || [];
        var affected = (challenge && challenge.affected) || [];
        var reasons = (challenge && challenge.reason_options) || [];

        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(17,24,39,.55);' +
            'z-index:10000;display:flex;align-items:center;justify-content:center;padding:24px;';
        var box = document.createElement('div');
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');
        box.style.cssText = 'background:#fff;border-radius:10px;max-width:780px;width:100%;max-height:88vh;' +
            'overflow:auto;box-shadow:0 20px 50px rgba(0,0,0,.3);' +
            'font:13px/1.5 system-ui,-apple-system,sans-serif;color:#111827;';

        var TD = 'padding:6px 8px;border-top:1px solid #e5e7eb';
        var TDR = TD + ';text-align:right';
        var rowsHtml = pools.map(function (p) {
            return '<tr>' +
                '<td style="' + TD + '">' + _spOvEsc(p.source_warehouse_id) + '</td>' +
                '<td style="' + TD + '">' + _spOvEsc(p.sku) + '</td>' +
                '<td style="' + TDR + '">' + _spOvNum(p.factory_available_stock) + '</td>' +
                '<td style="' + TDR + '">' + _spOvNum(p.already_allocated_qty) + '</td>' +
                '<td style="' + TDR + '">' + _spOvNum(p.current_plan_qty) + '</td>' +
                '<td style="' + TDR + '">' + _spOvNum(p.projected_total_qty) + '</td>' +
                '<td style="' + TDR + ';color:#b91c1c;font-weight:600">+' + _spOvNum(p.overage_qty) + '</td>' +
                '</tr>';
        }).join('');

        // WHO ELSE holds the units this plan is short of. §4 asks for the affected destinations by name,
        // because "review allocations to other companies and marketplaces" is not an instruction anyone can
        // follow without being told which ones.
        var affectedHtml = '';
        if (affected.length) {
            affectedHtml = '<div style="margin-top:14px">' +
                '<div style="font-weight:600;margin-bottom:4px">Allocations held elsewhere</div>' +
                '<ul style="margin:0;padding-left:18px">' +
                affected.map(function (a) {
                    var who = [a.company, a.country, a.marketplace].filter(Boolean).join(' / ') || a.stage;
                    var refs = (a.references && a.references.length) ? (': ' + a.references.join(', ')) : '';
                    return '<li>' + _spOvEsc(who) + ' &mdash; <strong>' + _spOvNum(a.quantity) +
                        '</strong> units (' + _spOvEsc(a.stage) + _spOvEsc(refs) + ')</li>';
                }).join('') +
                '</ul></div>';
        }

        var reasonOpts = '<option value="">&mdash; select a reason &mdash;</option>' +
            reasons.map(function (r) {
                return '<option value="' + _spOvEsc(r.value) + '">' + _spOvEsc(r.label) + '</option>';
            }).join('');

        box.innerHTML =
            '<div style="padding:18px 20px 14px;border-bottom:1px solid #e5e7eb">' +
            '<h3 style="margin:0;font-size:16px;color:#b91c1c">' +
            _spOvEsc(challenge.title || 'Planned Quantity Exceeds Available Factory Stock') +
            '</h3></div>' +
            '<div style="padding:16px 20px">' +
            '<p style="margin:0 0 12px">' + _spOvEsc(challenge.message || '') + '</p>' +
            '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">' +
            '<thead><tr style="text-align:left;color:#6b7280">' +
            '<th style="padding:4px 8px">Warehouse</th>' +
            '<th style="padding:4px 8px">SKU</th>' +
            '<th style="padding:4px 8px;text-align:right">Factory available</th>' +
            '<th style="padding:4px 8px;text-align:right">Already allocated</th>' +
            '<th style="padding:4px 8px;text-align:right">This plan</th>' +
            '<th style="padding:4px 8px;text-align:right">Projected total</th>' +
            '<th style="padding:4px 8px;text-align:right">Overage</th>' +
            '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div>' +
            affectedHtml +
            '<div style="margin-top:16px">' +
            '<label for="sp-overage-reason" style="display:block;font-weight:600;margin-bottom:4px">Reason *</label>' +
            '<select id="sp-overage-reason" style="width:100%;padding:7px;border:1px solid #d1d5db;border-radius:6px">' +
            reasonOpts + '</select></div>' +
            '<div style="margin-top:10px">' +
            '<label for="sp-overage-note" style="display:block;font-weight:600;margin-bottom:4px">Note</label>' +
            '<textarea id="sp-overage-note" rows="2" style="width:100%;padding:7px;border:1px solid #d1d5db;border-radius:6px"></textarea></div>' +
            '<p id="sp-overage-err" style="margin:10px 0 0;color:#b91c1c;display:none"></p>' +
            '<p style="margin:12px 0 0;font-size:11px;color:#6b7280">Inventory snapshot ' +
            _spOvEsc(challenge.inventory_snapshot_fingerprint || '') +
            '. If the factory stock or another plan changes before you confirm, this confirmation is refused and ' +
            'the current figures are shown again.</p>' +
            '</div>' +
            '<div style="padding:12px 20px 18px;display:flex;gap:10px;justify-content:flex-end;border-top:1px solid #e5e7eb">' +
            '<button type="button" id="sp-overage-cancel" style="padding:8px 16px;border:1px solid #d1d5db;background:#fff;border-radius:6px;cursor:pointer">Cancel</button>' +
            '<button type="button" id="sp-overage-ok" style="padding:8px 16px;border:1px solid #b91c1c;background:#b91c1c;color:#fff;border-radius:6px;cursor:pointer;font-weight:600">Confirm Overage</button>' +
            '</div>';

        overlay.appendChild(box);
        document.body.appendChild(overlay);
        _spOverageDom = { overlay: overlay, box: box };

        var sel = box.querySelector('#sp-overage-reason');
        var note = box.querySelector('#sp-overage-note');
        var err = box.querySelector('#sp-overage-err');
        function done(v) { _spOverageClose(); resolve(v); }

        // Cancel is a NON-EVENT: it resolves null, the caller sends nothing at all, and the plan stays a Draft.
        box.querySelector('#sp-overage-cancel').addEventListener('click', function () { done(null); });
        overlay.addEventListener('click', function (e) { if (e.target === overlay) done(null); });

        box.querySelector('#sp-overage-ok').addEventListener('click', function () {
            // A reason is REQUIRED, and the server requires it independently. Checking here saves a round trip;
            // it is not the enforcement, which is why the server never trusts it.
            if (!sel.value) {
                err.textContent = 'Select a reason before confirming this overage.';
                err.style.display = 'block';
                sel.focus();
                return;
            }
            done({
                inventory_snapshot_fingerprint: challenge.inventory_snapshot_fingerprint,
                confirmation_token: challenge.confirmation_token,
                override_reason: sel.value,
                override_note: (note.value || '').trim(),
                override_by: 'operation-system'
            });
        });
        sel.focus();
    });
}

/**
 * F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R5 §7 — THE NON-BLOCKING FACTORY AVAILABILITY INDICATOR.
 *
 * Shown on a DRAFT card only, and it BLOCKS NOTHING. Entering an over-quantity into a Draft is a legitimate
 * thing to do — the operator may be mid-edit, or planning against production that has not landed — so the Draft
 * states the position and says nothing about permission. The authorisation question is asked once, at Send to
 * Pending Approval, by the server.
 *
 * IT READS THE SAME FUNCTION THE GATE RUNS. `factoryStockGuard.get` with a `shipping_plan_id` calls
 * `fsgEvaluatePlanOverage_` — the identical availability read the submit gate uses. So the number on the card
 * and the number in the refusal cannot disagree, which is the whole reason it is not computed here from the
 * workspace rows already in the browser.
 *
 * A FAILURE SAYS SO. If the guard cannot be reached the indicator prints that it is unavailable rather than
 * rendering blank or zero: a blank reads as "nothing to worry about", and that is the one thing it does not know.
 */
// R15C-UI (Owner R15 P1): ONE factory-availability entry per Plan instead of one block per SKU. The numbers are the validated pools of
// the SAME shared snapshot (KM.factoryAvailability: one single-flight read for every card), so nothing is computed here: On hand,
// Reserved, Drafts, Plans and Free to plan are the server's, a negative Free to plan stays red and is counted as short in the summary, and
// a pool with no stock row keeps its label. Collapsed by default; the open state of each plan survives a re-render.
var _spFgOpen_ = {};
function _spFgToggle_(el) { var pid = el && el.getAttribute('data-plan-id'); if (pid) _spFgOpen_[pid] = !!el.open; }
function _spFgSkus_(planId) { var skus = ((_spLastModel && _spLastModel.lines) || []).filter(function (l) { return l.shippingPlanId === planId; }).map(function (l) { return String(l.sku); }); return skus.filter(function (v, i) { return skus.indexOf(v) === i; }); }
function _spFactoryPlanHtml_(planId, helper) {
    var skus = _spFgSkus_(planId), st = helper ? helper.status() : 'UNAVAILABLE', open = _spFgOpen_[planId] ? ' open' : '';
    var btn = '<button type="button" class="btn btn-primary sp-fg-refresh" style="min-width:84px;min-height:30px" onclick="event.preventDefault(); event.stopPropagation(); KM.factoryAvailability.ensure(true)"' + (st === 'LOADING' ? ' disabled' : '') + '>Refresh</button>';
    var head = function (extra) { return '<summary style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><span><strong>Factory availability</strong> &middot; ' + skus.length + ' SKU' + (extra || '') + '</span>' + btn + '</summary>'; };
    if (!helper) return 'Factory availability unavailable.';
    var displayAt = typeof helper.displayAt === 'function' ? helper.displayAt() : 0;
    if ((st !== 'READY' && !displayAt) || typeof helper.poolsFor !== 'function') {
        var msg = st === 'FAILED' ? 'Stock update failed. Refresh before planning.' : 'Stock updating...';
        // not a <details>: a loading / failed state has nothing to fold, and must not touch the operator's open / closed choice
        return '<div class="sp-fg" data-plan-id="' + _spEsc(planId) + '" data-fg-state="' + _spEsc(st) + '" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><span><strong>Factory availability</strong> &middot; ' + skus.length + ' SKU &middot; <span role="status">' + _spEsc(msg) + '</span></span>' + btn + '</div>';
    }
    var short = 0, none = 0, rows = '';
    var cell = function (p, n) { return '<td style="text-align:right;padding:4px 6px;white-space:nowrap;' + (n === 'available_to_allocate' && p[n] < 0 ? 'color:#b91c1c;font-weight:600;' : '') + '">' + _spEsc(p[n]) + (n === 'factory_current_stock' && p.factory_stock_row === false ? ' (no stock row)' : '') + '</td>'; };
    skus.forEach(function (sku) {
        var pools = (typeof helper.displayPoolsFor === 'function' ? helper.displayPoolsFor(sku) : helper.poolsFor(sku)) || [];
        if (!pools.length) { none++; rows += '<tr data-fg-sku="' + _spEsc(sku) + '"><td style="padding:4px 6px">' + _spEsc(sku) + '</td><td colspan="6" style="padding:4px 6px;color:#64748B">No factory stock record.</td></tr>'; return; }
        if (pools.some(function (p) { return p.available_to_allocate < 0; })) short++;
        pools.forEach(function (p, i) { rows += '<tr data-fg-sku="' + _spEsc(sku) + '"><td style="padding:4px 6px">' + (i ? '' : _spEsc(sku)) + '</td><td style="padding:4px 6px">Factory</td>' + ['factory_current_stock', 'factory_reserved_stock', 'active_allocation_draft_qty', 'active_shipping_plan_qty', 'available_to_allocate'].map(function (n) { return cell(p, n); }).join('') + '</tr>'; });
    });
    var tag = short ? ' &middot; <span class="sp-fg-short" style="color:#b91c1c;font-weight:600">' + short + ' short</span>' : ' &middot; none short';
    if (none) tag += ' &middot; ' + none + ' no record';
    var at = displayAt || (typeof helper.freshAt === 'function' ? helper.freshAt() : 0);
    if (st !== 'READY') tag += ' &middot; ' + (st === 'LOADING' ? 'Updating...' : 'Refresh before planning.');
    return '<details class="sp-fg" data-plan-id="' + _spEsc(planId) + '" data-fg-state="' + _spEsc(st) + '" data-fg-short="' + short + '" ontoggle="_spFgToggle_(this)"' + open + '>' + head(tag) +
        '<div style="overflow-x:auto;margin-top:6px"><table style="width:100%;font-size:12px;border-collapse:collapse"><thead><tr>' + ['SKU', 'Factory', 'On hand', 'Reserved', 'Drafts', 'Plans', 'Free to plan'].map(function (h) { return '<th style="padding:4px 6px;text-align:left;white-space:nowrap">' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<small>Shared pool &middot; all sites' + (at ? ' &middot; ' + _spEsc(new Date(at).toLocaleTimeString()) : '') + '</small></details>';
}
function _spFgPaintAll_(helper) { Array.prototype.forEach.call(document.querySelectorAll('[id^="sp-factory-guard-"]'), function (node) { node.innerHTML = _spFactoryPlanHtml_(node.id.slice('sp-factory-guard-'.length), helper); }); }
function spFactoryGuardRefresh(planId) {
    var el = document.getElementById('sp-factory-guard-' + planId), helper = window.KM && window.KM.factoryAvailability;
    if (!el) return;
    function paint() { var cur = document.getElementById('sp-factory-guard-' + planId); if (cur) cur.innerHTML = _spFactoryPlanHtml_(planId, helper); }
    if (!helper) { paint(); return; }
    if (!window.__spFactorySubscriber14) { window.__spFactorySubscriber14 = true; helper.subscribe(function () { _spFgPaintAll_(helper); }); }
    paint(); helper.ensure(false).then(paint);   // ensure() is single-flight: every card of the page joins the same read
}
try { if (typeof window !== 'undefined') window.spFactoryGuardRefresh = spFactoryGuardRefresh; } catch (eFG) {}

function spDbSubmit(planId) {
    // One guarded flow: persist qty (if any) then Submit; ONE readback after Submit. A genuine qty-save failure
    // is surfaced and STOPS the Submit — no more "qty error shown while the plan already became Pending".
    var lines = _spCollectQtyLines(planId);
    _spRunCommand_(planId + ':submit', function () {
        var spTok_ = _spPlanTok_(planId), pre = lines.length ? window.KM.DB.updateShippingPlanLineQty(_spQtyBody_(planId, lines)) : Promise.resolve({ success: true });   // R71-FE-1: tokens
        return Promise.resolve(pre).then(function (qtyRes) {
            if (qtyRes && qtyRes.success === false && qtyRes.error && qtyRes.error.code !== 'ALREADY_IN_TARGET_STATE') return qtyRes; // stop
            if (lines.length && qtyRes && qtyRes.success) { _spPatchLocalQty(lines); _spAdoptLineTok_(lines, qtyRes); }
            var qtySaved_ = !!(lines.length && qtyRes && qtyRes.success);   // R71-FE-2 (m-6): a refusal of the transition below must not say "nothing was written"
            // R6-R7-R5 §4 — SUBMIT, and if the server says an overage must be confirmed, ask a person and
            // send ONCE more with the confirmation attached. At most two attempts: looping here would turn a
            // stale fingerprint into a retry storm, and a stale fingerprint means the facts moved and somebody
            // has to look at them again.
            return window.KM.DB.updateShippingPlanStatus({ shipping_plan_id: planId, transition: 'submit', actor: 'operation-system', expected_updated_at: spTok_ || undefined })   /* R71-FE-1: the plan token (a qty save does not move it) */
                .then(function (res) {
                    var challenge = _spIsOverageChallenge(res);
                    if (!challenge) return res;
                    return _spOverageAsk(challenge).then(function (conf) {
                        // Cancelled: return the ORIGINAL refusal. Nothing further was sent, nothing mutated,
                        // and the plan is still a Draft the operator can edit.
                        if (!conf) return res;
                        return window.KM.DB.updateShippingPlanStatus({
                            shipping_plan_id: planId, transition: 'submit', actor: 'operation-system', expected_updated_at: spTok_ || undefined,   /* R71-FE-1: the same token (the challenge wrote nothing) */
                            overage_confirmation: conf
                        });
                    });
                }).then(function (res) { if (qtySaved_ && res && res.success === false && res.error) res.error.qtySaved = true; return res; });
        });
    }, { successMsg: 'Submitted for approval.', failPrefix: 'Submit failed', planId: planId, sent: lines });
}

function spDbApprove(planId) {
    // Approve = Execution Commit: the backend also creates the Shipment Draft (shipments + shipment_lines).
    _spRunCommand_(planId + ':approve', function () {
        return window.KM.DB.updateShippingPlanStatus({ shipping_plan_id: planId, transition: 'approve', actor: 'operation-system', expected_updated_at: _spPlanTok_(planId) || undefined });
    }, {
        failPrefix: 'Approve failed', planId: planId,
        onSuccess: function (res) {
            // F1-7N-FC-1A §D — APPROVE NO LONGER REPORTS A HALF-DONE OPERATION AS DONE.
            //
            // The old last branch said "You can retry from Shipment Overview" - an instruction nothing in the
            // frontend could carry out, on a page that renders `shipped` onward and therefore could never
            // display an approved plan with no shipment. The message now names the state, the cause, and the
            // action that actually exists on this card; the card itself carries the same banner, so the
            // recovery survives dismissing this notice and reloading the page.
            var d = (res && res.data) || {};
            var sh = d.shipment; var msg = 'Plan approved.';
            if (sh && sh.created) {
                msg += '\nShipment Draft created: ' + (sh.shipment_no || sh.shipment_id) + ' (' + (sh.line_count || 0) + ' lines).';
                var rv = sh.factory_reservations || [];
                if (rv.length) {
                    msg += '\n' + _spReservedStockLabel_(rv) + ' reserved at ' + (sh.source_warehouse_id || '') + ': ' +
                           rv.map(function (r) { return r.sku + ' x' + r.reserved_qty; }).join(', ') + '.';
                }
            // PHASE1 INT-CAND9 round 3 (review F1): a REVIEW answer is tested BEFORE 'already_exists' - the second click on an unmarked draft
            // carries both, and the review warning must reach the operator.
            } else if (d.recovery && d.recovery.review_required === true && (d.recovery.state === 'RESERVATION_BOOKS_REVIEW_REQUIRED' || d.recovery.state === 'SHIPMENT_CREATION_REFUSED_REVIEW_REQUIRED')) {   // round 4: + a refused create (legacy link / inconsistent dispatch)
                // PHASE1 INT-CAND9 round 3 (review F6): the I1 books guard refused BEFORE any write - say so (not 'UNKNOWN'), never 'safe'.
                var rb = d.recovery, rbKeys = (rb.keys_mismatched || []).concat(rb.keys_unknown || []);
                msg = (rb.state === 'RESERVATION_BOOKS_REVIEW_REQUIRED' ? 'Plan approved — BUT THE SHIPMENT DRAFT WAS REFUSED: THE RESERVATION BOOKS NEED REVIEW.' : 'Plan approved — BUT THE SHIPMENT DRAFT WAS REFUSED: REVIEW REQUIRED (' + (rb.cause || '') + ').')
                    + '\nThe approval is committed and kept. Nothing was written: no Shipment Draft and no stock reservation.'
                    + '\nCause: ' + (rb.cause || 'UNKNOWN') + (rbKeys.length ? ('\nStock keys: ' + rbKeys.slice(0, 5).join('; ')) : '')
                    + '\nDo NOT retry until the owner has reviewed; any retry is re-checked by the server and repairs nothing.' + (rb.state === 'RESERVATION_BOOKS_REVIEW_REQUIRED' ? ' A retry is refused while these books disagree.' : ' A retry is refused the same way until it is reviewed.');
            } else if (d.recovery && d.recovery.review_required === true) {
                // PHASE1 INT-CAND6 - the creation stopped after writes may have landed (a draft kept on purpose, or an unknown outcome).
                // Never "not created", never "nothing reserved", never "retrying is safe": a retry only re-checks and repairs nothing.
                var rr = d.recovery;
                msg = 'Plan approved — BUT THE SHIPMENT DRAFT NEEDS REVIEW BEFORE ANYTHING ELSE.'
                    + '\nThe approval is committed and kept.'
                    + (rr.shipment_created === true
                        ? '\nA Shipment Draft exists (' + (rr.draft_shipment_no || rr.draft_shipment_id || '') + ') but its creation did not finish cleanly: it may be incomplete.'
                        : '\nWhether a Shipment Draft or a stock reservation was written is UNKNOWN.')
                    + '\nCause: ' + (rr.cause || 'UNKNOWN')
                    + '\nDo NOT retry until the owner has reviewed; any retry is re-checked by the server and repairs nothing.'
                    + '\nAsk the system owner to review the draft, its lines and the reservation ledger.';
            } else if (sh && sh.reason === 'already_exists') {
                msg += '\nShipment Draft already exists (' + (sh.shipment_id || '') + ').';
            } else if (d.execution_commit === 'APPROVED_SHIPMENT_CREATION_PENDING' || (sh && (sh.error || sh.reason))) {
                var rec = d.recovery || {};
                msg = 'Plan approved — BUT THE SHIPMENT DRAFT WAS NOT CREATED.'
                    + '\nThe approval is committed and kept. Nothing was reserved and nothing will ship yet.'
                    + '\nCause: ' + ((rec.cause || (sh && (sh.error || sh.reason)) || 'UNKNOWN'));
                if (rec.shortfalls && rec.shortfalls.length) {
                    msg += '\nShort of stock: ' + rec.shortfalls.map(function (x) {
                        return x.sku + ' (need ' + x.need + ', available ' + x.available + ')'; }).join('; ');
                }
                msg += '\nUse "Retry Shipment Draft" on this plan card. Retrying is safe and can never create two shipments.';
            }
            return msg;
        }
    });
}

// F1-7N-FC-1A §C — THE RETRY, CONNECTED.
//
// Ten requirements, and the ones that are easy to get wrong are the last four:
//   1 it names the exact shipping_plan_id (never "the selected plan")
//   2 it calls the EXISTING routed action - no new server surface was added for this
//   3 a stable correlation key derived from the plan id, so a resend of the same intent is the same intent
//   4/5 the server answers CREATED or REUSED and creates at most one shipment per plan, so a double click, a
//     lost answer and a genuine retry all converge on ONE shipment
//   6 ONE authoritative readback follows (the shared command runner does it), so the card stops guessing
//   7 typed failures survive to the operator, because the adapter now uses the command runner (§J.4)
//   8 a transport failure stays RETRYABLE - the outcome is unknown, not failed, and the readback settles it
//   9 it does not change approval status: this path never writes status/approved_by/approved_at
//  10 it creates no documents and deducts no current stock; it reserves, which is a different fact
function spDbRetryShipment(planId) {
    // §J.2 — fail CLOSED on a known-bad deployment. Retrying cannot publish a deployment, so attempting the
    // call would only produce a second, less specific error than the one already known.
    if (_spContractOk_() === false) { _spNotify_('Retry unavailable: ' + _spContractMsg_()); return; }
    if (!(window.KM && window.KM.DB && typeof window.KM.DB.createShipmentFromPlan === 'function')) {
        _spNotify_('Retry unavailable: this build cannot reach createShipmentFromPlan.'); return;
    }
    _spRunCommand_(planId + ':retryshipment', function () {
        return window.KM.DB.createShipmentFromPlan({
            shipping_plan_id: planId,
            actor: 'operation-system',
            // Idempotency is enforced SERVER-side by one-shipment-per-approved-plan; this key is the
            // correlation id that makes a retried request recognisable in the logs as the same intent.
            idempotency_key: 'RETRY-SHIPMENT:' + planId
        });
    }, {
        failPrefix: 'Retry Shipment Draft failed',
        onSuccess: function (res) {
            var d = (res && res.data) || {};
            if (d.outcome === 'REUSED') {
                return 'A Shipment Draft already existed for this plan (' + (d.shipment_id || '') +
                       '). Nothing was created and no stock was reserved twice.';
            }
            var msg = 'Shipment Draft created: ' + (d.shipment_no || d.shipment_id || '') +
                      ' (' + (d.line_count || 0) + ' lines).';
            var rv = d.factory_reservations || [];
            if (rv.length) {
                msg += '\n' + _spReservedStockLabel_(rv) + ' reserved at ' + (d.source_warehouse_id || '') + ': ' +
                       rv.map(function (r) { return r.sku + ' x' + r.reserved_qty; }).join(', ') + '.';
            }
            return msg;
        }
    });
}

// S6-R7 §3 — WHICH STOCK WAS ACTUALLY RESERVED, read off the receipt rather than assumed.
//
// `factory_reservations` keeps its field name for compatibility with every existing reader, but since
// S6-R4B the rows it carries may describe an OVERSEAS reservation, and each one states which. Saying
// "Factory stock reserved" over a 3PL's available bucket is not a wording problem: it tells the operator
// the units came from somewhere they did not.
//
// This reads the authoritative field and never infers. An older server that does not send source_domain
// gets the neutral word, which is true of both domains, rather than a guess that is wrong half the time.
function _spReservedStockLabel_(reservations) {
    var d = '';
    (reservations || []).forEach(function (r) { if (!d && r && r.source_domain) d = String(r.source_domain); });
    if (d === 'OVERSEAS') return 'Overseas stock';
    if (d === 'FACTORY') return 'Factory stock';
    return 'Source stock';
}
function spDbReject(planId) {
    var reason = prompt('Rejection reason (required):', '');
    if (reason == null) return;            // cancelled the prompt
    reason = String(reason).trim();
    if (!reason) { alert('Rejection reason is required.'); return; }
    _spRunCommand_(planId + ':reject', function () {
        return window.KM.DB.updateShippingPlanStatus({ shipping_plan_id: planId, transition: 'reject', rejected_reason: reason, actor: 'operation-system', expected_updated_at: _spPlanTok_(planId) || undefined });
    }, { successMsg: 'Plan rejected and returned to Draft.', failPrefix: 'Reject failed', planId: planId });
}

// Decision Layer Completion (Done). Allowed only on an Approved + transferred plan. Writes
// completed_at / completed_by; the card then leaves the Active view (preserved in DB).
function spDbDone(planId) {
    if (!confirm('This shipping plan has already been transferred to Shipment Draft.\n\nMark this planning task as completed?')) return;
    return _spRunCommand_(planId + ':done', function () {
        return window.KM.DB.completeShippingPlan({ shipping_plan_id: planId, actor: 'system_user' });
    }, { successMsg: 'Completed. Continue in Shipment Overview.', failPrefix: 'Done failed', planId: planId });
}

// `statusType` is passed by the approved call site only. An approved plan is the only one whose
// cancellation releases anything, so it is the only one the operator is warned about; Draft and Pending
// Approval keep the prompt they have always had, and an omitted argument keeps that behaviour.
function spDbCancel(planId, statusType) {
    if (!confirm(String(statusType || '') === 'approved'
        ? 'Cancel this APPROVED shipping plan?\n\nIts quantity stops being held against factory stock and '
          + 'becomes available again. The plan and its lines are kept. If a Shipment has already been '
          + 'created for it, this will be refused.'
        : 'Cancel this shipping plan?')) return;
    _spRunCommand_(planId + ':cancel', function () {
        return window.KM.DB.updateShippingPlanStatus({ shipping_plan_id: planId, transition: 'cancel', actor: 'operation-system', expected_updated_at: _spPlanTok_(planId) || undefined });
    }, { failPrefix: 'Cancel failed', planId: planId });   // silent success (matches prior UX: Cancel just refreshes)
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
    _spRunCommand_(planId + ':note', function () {
        return window.KM.DB.appendShippingPlanNote({ shipping_plan_id: planId, note: note, actor: 'operation-system' });
    }, { successMsg: 'Note added.', failPrefix: 'Add note failed' });
}

// ============================================================================================================
// R71-FE-11 — WEEKLY PLAN RATIONALE: Carrier -> Method -> Save (the server validates, prices, persists; the page re-reads).
// The options are the plan's REAL lane, priced by the server (shippingPlan.rateCardOptions). Carrier first; Method lists only that
// carrier's cards by their own shipping_method_label, with the raw method token underneath (never mixed into the label). The default
// follows the route: the stored carrier, else the ONE carrier offering the route's method; the route's method is kept if this carrier
// offers it, otherwise a choice is required - never the first option. Draft only; other states show the stored choice read-only.
// ============================================================================================================
var SP_RC_ = {}, SP_RC_DISPLAY_KEY_ = {};
var SP_RC_REQUESTS_ = {};
function _spMoney_(v, cur) { if (v === '' || v == null || !isFinite(Number(v))) return '--'; return (cur ? (_spEsc(cur) + ' ') : '') + Number(v).toFixed(2); }
function _spRcPanelHtml_(plan, statusType) {
    var pid = plan.shippingPlanId, editable = (statusType === 'draft');
    var cur = '<div class="sp-rationale-item"><strong>Carrier:</strong> ' + (plan.carrierId ? _spEsc(plan.carrierName || plan.carrierId) : '--') + '</div>' +
        '<div class="sp-rationale-item"><strong>Method:</strong> ' + _spEsc(plan.shippingMethod || '--') + '</div>';
    if (!editable) return cur;
    return '<div id="sp-rc-' + _spEsc(pid) + '" data-plan-id="' + _spEsc(pid) + '" data-rc-editable="1" class="sp-rc-panel" style="margin:6px 0;padding:8px;border:1px solid #E2E8F0;border-radius:6px;">' +
        cur + '<div class="sp-rc-body" style="font-size:12px;color:#64748B;margin-top:4px;">' + _spRcLoadingHtml_('Loading rate cards...') + '</div></div>';
}
function _spRcLoadingHtml_(message) {
    return '<label style="display:block;margin-top:4px;">Carrier</label><select aria-label="Carrier" disabled style="width:100%;height:30px;"><option>Loading...</option></select>' +
        '<label style="display:block;margin-top:4px;">Shipping Method</label><select aria-label="Shipping Method" disabled style="width:100%;height:30px;"><option>Loading...</option></select>' +
        '<div role="status" style="min-height:20px;">' + _spEsc(message) + '</div>';
}
function _spCostBreakdownHtml_(plan, totalPcs) {
    var raw = plan.raw || {}, cur = String(plan.currency || raw.currency || '').trim();
    if (raw.estimated_duty_currency && raw.estimated_duty_currency !== cur && raw.estimated_freight_cost !== '' && raw.estimated_duty !== '' && raw.estimated_duty != null) return '<div class="sp-section" id="sp-cost-' + _spEsc(plan.shippingPlanId) + '"><h4>Cost Breakdown</h4><div>Freight ' + _spMoney_(raw.estimated_freight_cost, cur) + '</div><div>Customs ' + _spMoney_(raw.estimated_customs_fee, cur) + '</div><div>Duty ' + _spMoney_(raw.estimated_duty, raw.estimated_duty_currency) + '</div><div>No combined total</div></div>';
    var priced = String(plan.carrierId || '').trim() !== '' && !(raw.estimated_total_cost === '' || raw.estimated_total_cost == null);
    var duty = (raw.estimated_duty === '' || raw.estimated_duty == null) ? null : Number(raw.estimated_duty), cfee = (raw.estimated_customs_fee === '' || raw.estimated_customs_fee == null) ? null : Number(raw.estimated_customs_fee);
    var dc = (duty == null && cfee == null) ? '' : ((duty || 0) + (cfee || 0));
    var total = priced ? Number(raw.estimated_total_cost) : null;
    var unit = (priced && totalPcs > 0) ? (total / totalPcs) : null;
    function row(l, v) { return '<div class="sp-cost-row"><span class="sp-cost-label">' + l + '</span><span class="sp-cost-value">' + v + '</span></div>'; }
    // Carrier: name primary, id beside it - the S7-R2A1 pair form, kept verbatim (its test reads this expression from the source)
        var cbCarrierName = String(plan.carrierName || '').trim();
        var cbCarrierId = String(plan.carrierId || '').trim();
        var cbCarrier = !cbCarrierId
            ? '--'
            : (cbCarrierName ? (_spEsc(cbCarrierName) + '  ·  ' + _spEsc(cbCarrierId)) : _spEsc(cbCarrierId));
    return '<div class="sp-section" id="sp-cost-' + _spEsc(plan.shippingPlanId) + '">' +
        '<h4 class="sp-section-title">Cost Breakdown</h4>' +
        row('Carrier', cbCarrier) +
        row('Freight', priced ? _spMoney_(raw.estimated_freight_cost, cur) : '--') +
        row('Duty / Custom', priced ? _spMoney_(dc, cur) : '--') +
        row('Total Cost', priced ? _spMoney_(total, cur) : '--') +
        row('Currency', priced ? _spEsc(cur || '--') : '--') +
        row('Cost per pcs', unit == null ? '--' : (_spEsc(cur) + ' ' + unit.toFixed(4))) +
        '<div class="sp-cost-basis" style="font-size:11px;color:#94A3B8;margin-top:6px;">' + (priced
            ? ('Plan estimate, server-priced from the chosen rate card for this plan\'s weight / CBM / cartons. The Shipment execution estimate is priced separately.')
            : 'Not priced yet - choose a carrier and method in Plan Rationale.') + '</div>' +
    '</div>';
}
// R15C-UI (Owner R15 P1, handoff 5): THE OPTIONS CACHE. Display only - it never authorises anything: the Save re-reads the cards and re-prices
// inside the server lock and checks the plan's version token, so another user's write is still refused there, not here.
//   key   = plan id + the plan's version token (no token on screen -> never cached) + company / country / marketplace + source warehouse +
//           To + delivery warehouse + method + last mile + carrier + saved customs + the customs ASKED (preview) + the Taipei pricing day +
//           every line (id, sku, qty, cartons, cbm, gross, line version) + the reference generation (below).
//   TTL   = 60 s; an expired entry is dropped and read again (never shown as current).
//   valid hit -> no request. Same key in flight -> the one request is joined (single flight).
//   invalidation: any command on the plan (success, UNKNOWN, refusal) forgets that plan, including an answer still in flight; a write by a
//           reference writer in this tab (rate cards, lead times, sku details, marketplaces) forgets every plan.
//   latest choice: each refresh of a plan takes a ticket; only the newest ticket may paint the panel, so a slow answer for an earlier
//           Customs / an earlier render never overwrites the latest choice.
//   UNKNOWN recovery never reads it: an UNKNOWN command forgets the plan first, so the readback asks the server.
var SP_RC_CACHE_ = {}, SP_RC_CACHE_TTL_MS_ = 60000, _spRcRefGen_ = 0, _spRcPlanGen_ = {}, _spRcAsk_ = {};
var SP_RC_STATS_ = { hits: 0, misses: 0, joins: 0, dropped: 0, forgets: 0 };
var SP_RC_REF_WRITERS_ = ['importCarrierRateTemplate', 'upsertCarrierLeadTime', 'upsertSkuDetail', 'upsertMarketplace', 'upsertMarketplaceSku', 'importMarketplaceSkusBatch'];
function _spRcForgetAll_() { _spRcRefGen_++; SP_RC_CACHE_ = {}; SP_RC_DISPLAY_KEY_ = {}; SP_RC_STATS_.forgets++; }
function _spRcForget_(planId) { var p = String(planId); delete SP_RC_DISPLAY_KEY_[p]; _spRcPlanGen_[p] = (_spRcPlanGen_[p] || 0) + 1; Object.keys(SP_RC_CACHE_).forEach(function (k) { if (SP_RC_CACHE_[k].planId === p) delete SP_RC_CACHE_[k]; }); SP_RC_STATS_.forgets++; }
function _spRcObserveRefWriters_() {
    var db = window.KM && window.KM.DB; if (!db || db.__spRcRefObserved) return; db.__spRcRefObserved = true;
    SP_RC_REF_WRITERS_.forEach(function (name) {
        var fn = db[name]; if (typeof fn !== 'function' || fn.__spRcRef) return;
        var w = function () { _spRcForgetAll_(); var r; try { r = fn.apply(this, arguments); } catch (e) { _spRcForgetAll_(); throw e; }
            return Promise.resolve(r).then(function (v) { _spRcForgetAll_(); return v; }, function (e) { _spRcForgetAll_(); throw e; }); };
        Object.keys(fn).forEach(function (k) { w[k] = fn[k]; }); w.__spRcRef = true; db[name] = w;
    });
}
function _spTaipeiDay_() { try { return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10); } catch (e) { return ''; } }
function _spRcCacheKey_(planId, asked) {
    var tok = _spPlanTok_(planId); if (!tok) return null;
    var p = _spRcPlan_(planId), raw = p.raw || {};
    var lines = ((_spLastModel && _spLastModel.lines) || []).filter(function (l) { return l.shippingPlanId === planId; })
        .map(function (l) { return [l.shippingPlanLineId, l.sku, _spNum(l.approvedQty), _spNum(l.cartonQty), _spNum(l.cbm), _spNum(l.grossWeight), String((l.raw && l.raw.updated_at) || '')].join(':'); }).sort().join(',');
    return JSON.stringify([String(planId), tok, p.company || '', p.country || '', p.marketplace || '', String(raw.source_warehouse_id || ''), p.destination || '', p.destinationWarehouseId || '',
        p.shippingMethod || '', String(raw.last_mile_delivery || p.lastMileDelivery || ''), p.carrierId || '', String(raw.customs_type || p.customsType || ''), String(asked || ''), _spTaipeiDay_(), _spRcRefGen_, lines]);
}
function spRcRefresh(planId) {
    var host = document.getElementById('sp-rc-' + planId), body = host && host.querySelector('.sp-rc-body');
    if (!host || !body) return;
    var db = window.KM && window.KM.DB;
    if (!db || typeof db.getShippingPlanRateCardOptions !== 'function') { body.textContent = 'Carrier selection is not available on this build.'; return; }
    _spRcObserveRefWriters_();
    var sel0 = SP_RC_SEL_[planId], cur0 = SP_RC_[planId], saved0 = cur0 && cur0.lane ? String(cur0.lane.customs_type || '') : null;
    var asked = (sel0 && sel0.customs && sel0.customs !== saved0) ? sel0.customs : '';   // exactly what _spWk1Options_ will ask
    var readSeq = _spReadSeq, ticket = (_spRcAsk_[planId] = (_spRcAsk_[planId] || 0) + 1), pgen = _spRcPlanGen_[String(planId)] || 0;
    var key = _spRcCacheKey_(planId, asked), hit = key ? SP_RC_CACHE_[key] : null, request;
    if (hit && Date.now() - hit.at < SP_RC_CACHE_TTL_MS_) { SP_RC_STATS_.hits++; request = Promise.resolve(hit.res); }
    else {
        if (hit) delete SP_RC_CACHE_[key];
        var requestKey = (key || ('NOKEY:' + planId + ':' + readSeq + ':' + asked)) + '#' + pgen;
        request = SP_RC_REQUESTS_[requestKey];
        if (request) SP_RC_STATS_.joins++;
        else {
            SP_RC_STATS_.misses++;
            var rgen = _spRcRefGen_;
            request = Promise.resolve().then(function () { return _spWk1Options_(planId); });   // WK1: customs preview
            SP_RC_REQUESTS_[requestKey] = request;
            request.then(function (r) {
                delete SP_RC_REQUESTS_[requestKey];
                // stored only when it answers THIS key: a success, for the customs asked (not the m-6 fallback to the saved customs), and nothing
                // forgot the plan or the references while it was in flight
                if (key && r && r.success === true && rgen === _spRcRefGen_ && pgen === (_spRcPlanGen_[String(planId)] || 0) && (!asked || String(r.preview_customs_type || '') === asked))
                    SP_RC_CACHE_[key] = { at: Date.now(), res: r, planId: String(planId) };
            }, function () { delete SP_RC_REQUESTS_[requestKey]; });
        }
    }
    function paint(r) {
        if (readSeq !== _spReadSeq || document.getElementById('sp-rc-' + planId) !== host) return;
        if (ticket !== _spRcAsk_[planId]) { SP_RC_STATS_.dropped++; return; }   // R15C-UI: a newer choice / render owns this panel
        if (!r || r.success !== true) { body.innerHTML = '<span style="color:#DC2626;">Could not load the rate cards: ' + _spEsc((r && (r.code || r.error)) || 'NO_ANSWER') + '. Nothing was changed.</span>'; return; }
        SP_RC_[planId] = r; SP_RC_DISPLAY_KEY_[planId] = key; host.removeAttribute('data-sel-carrier'); host.removeAttribute('data-sel-card'); host.removeAttribute('data-sel-customs');
        var keep9 = SP_RC_SEL_[planId];   // WK1: restore the unsaved lower selections (by identity) after any re-render
        if (keep9 && keep9.base && _spWk1Base_(r) !== keep9.base) {   // WK1 r2 (m-7): the server's choice changed since the selection - never re-applied silently
            delete SP_RC_SEL_[planId]; keep9 = null;
            _spNotify_('The carrier / method / customs of this plan changed on the server since you chose. Your unsaved choice was discarded - choose again.');
        }
        if (keep9) { var oo9 = r.options || [];
            if (keep9.carrier && oo9.some(function (x) { return x.carrier_id === keep9.carrier; })) host.setAttribute('data-sel-carrier', keep9.carrier);
            if (keep9.rate_card_id) { for (var i9 = 0; i9 < oo9.length; i9++) if (oo9[i9].rate_card_id === keep9.rate_card_id && oo9[i9].carrier_id === keep9.carrier) { host.setAttribute('data-sel-card', String(i9)); break; } }
            if (keep9.service_key) { for (var j15 = 0; j15 < oo9.length; j15++) if (oo9[j15].service_only && JSON.stringify([oo9[j15].carrier_id, oo9[j15].shipping_method, oo9[j15].last_mile_delivery]) === keep9.service_key) { host.setAttribute('data-sel-card', String(j15)); break; } }
            if (keep9.customs && ((r.lane && r.lane.customs) || []).some(function (c) { return c.id === keep9.customs; })) host.setAttribute('data-sel-customs', keep9.customs); }
        _spRcRender_(planId);
        try { _spReholdBusy_(planId); } catch (eRh2) {}   // R15C-UI batch 2: the Save of a plan still saving stays held
        try { _spMarkCostState12_(planId, (r.current && r.current.state) || 'NONE'); } catch (eMk) { /* R71-FE-12 */ }
    }
    // Repaint the exact same lane immediately; expired options stay disabled until revalidated.
    if (key && SP_RC_DISPLAY_KEY_[planId] === key && SP_RC_[planId]) {
        paint(SP_RC_[planId]);
        if (!(hit && Date.now() - hit.at < SP_RC_CACHE_TTL_MS_)) {
            Array.prototype.forEach.call(body.querySelectorAll('select,button'), function (el) { el.disabled = true; });
            var pending = document.createElement('div'); pending.setAttribute('role', 'status'); pending.textContent = 'Updating rate cards...'; body.appendChild(pending);
        }
    }
    return request.then(paint)['catch'](function (e) { if (readSeq === _spReadSeq && ticket === _spRcAsk_[planId] && document.getElementById('sp-rc-' + planId) === host) body.innerHTML = '<span style="color:#DC2626;">Could not load the rate cards: ' + _spEsc((e && e.message) || e) + '. Nothing was changed.</span>'; });
}
// WK1: the first-level Destination = the To saved by Site Inventory, with its country (read-only). Blank stays an honest dash.
function _spWk1DestLabel_(plan) { var d = String((plan && plan.destination) || '').trim(), c = String((plan && plan.country) || '').trim().toUpperCase(); return d ? (c ? c + ' / ' + d : d) : '—'; }
var SP_RC_SEL_ = {};   // WK1: the unsaved lower selections per plan, by identity { carrier, rate_card_id, customs } - survive any re-render
var _SP_WK1_SAVING_ = {};   // WK1: one unified Save per plan at a time (double-click guard)
function _spWk1Options_(planId) {   // the options read, with the pending customs as a read-only preview when it differs from the saved one
    var sel = SP_RC_SEL_[planId], cur = SP_RC_[planId], saved = cur && cur.lane ? String(cur.lane.customs_type || '') : null;
    if (sel && sel.customs && sel.customs !== saved) {   // WK1 r2 (M-1): the db-api READ with a preview customs; m-6: a failed preview recovers
        var asked = sel.customs;
        return Promise.resolve(window.KM.DB.getShippingPlanRateCardOptions(planId, asked)).then(function (r) {
            if (r && r.success === true) return r;
            if (SP_RC_SEL_[planId]) delete SP_RC_SEL_[planId].customs;
            _spNotify_('The rate cards for the customs ' + asked + ' could not be loaded (' + String((r && (r.code || r.error)) || 'NO_ANSWER') + '). The saved customs is shown again; nothing was changed.');
            return window.KM.DB.getShippingPlanRateCardOptions(planId);
        });
    }
    return window.KM.DB.getShippingPlanRateCardOptions(planId);
}
function _spRcPlan_(planId) { var m = _spLastModel && _spLastModel.plans; return ((m || []).filter(function (p) { return p.shippingPlanId === planId; })[0]) || {}; }
function _spRcRender_(planId) {
    _spRcRenderBase13_(planId);   // WK1: no Delivery-warehouse / Save route panel
}
function _spRcRenderBase13_(planId) {
    var host = document.getElementById('sp-rc-' + planId), body = host && host.querySelector('.sp-rc-body'), r = SP_RC_[planId];
    if (!host || !body || !r) return;
    var plan = _spRcPlan_(planId), routeM = String((r.current && r.current.shipping_method) || plan.shippingMethod || '').trim();
    var opts = r.options || [], cars = [], seen = {};
    opts.forEach(function (o) { if (!seen[o.carrier_id]) { seen[o.carrier_id] = 1; cars.push({ id: o.carrier_id, name: o.carrier_name || o.carrier_id }); } });
    if (!opts.length) { body.innerHTML = _spRcLoadingHtml_('No active rate card matches this route. Check destination, method and validity.'); return; }
    var selC = host.getAttribute('data-sel-carrier');
    if (selC == null) {
        selC = (r.current && r.current.carrier_id && seen[r.current.carrier_id]) ? r.current.carrier_id : '';
        if (!selC) { var withM = cars.filter(function (c) { return opts.some(function (o) { return o.carrier_id === c.id && o.shipping_method === routeM; }); }); if (withM.length === 1) selC = withM[0].id; }
    }
    var mine = opts.map(function (o, i) { return { o: o, i: i }; }).filter(function (x) { return x.o.carrier_id === selC; });
    var selI = host.getAttribute('data-sel-card');
    if (selI == null || !opts[Number(selI)] || opts[Number(selI)].carrier_id !== selC) {
        var same = mine.filter(function (x) { return x.o.shipping_method === routeM && (!r.current || x.o.last_mile_delivery === String(r.current.last_mile_delivery || '')); });
        if (same.length !== 1) same = mine.filter(function (x) { return x.o.shipping_method === routeM; });
        selI = same.length === 1 ? String(same[0].i) : '';
    }
    var o = selI !== '' ? opts[Number(selI)] : null, st = (r.current && r.current.state) || 'NONE';
    var stTxt = { NONE: 'Not priced yet.', NOT_PRICED: 'Freight is not quoted yet.', PRICED: 'Priced by the server for the plan as saved.',
        PREVIEW_CUSTOMS: 'Customs changed (not saved yet) - choose a carrier and a method priced for it, then Save.',
        NEEDS_REPRICING: 'NEEDS RE-PRICING: the stored cost no longer matches the rate card or the plan - save again.', COST_SAVED_CARD_UNVERIFIED: _spWk1CardTxt_(r), NOT_APPLICABLE: 'The stored carrier / method no longer applies to this lane - choose again.', PENDING: 'The last carrier / method choice did not finish - choose again. Submit is refused until then.' }[st] || st;
    body.innerHTML =
        '<div style="color:' + (st === 'PRICED' ? '#059669' : (st === 'NONE' ? '#64748B' : '#B45309')) + ';margin-bottom:6px;">' + _spEsc(stTxt) + '</div>' + _spWk1KnownHtml_(r) +
        '<label style="display:block;font-size:11px;color:#64748B;">Carrier</label>' +
        '<select class="sp-rc-carrier" onchange="spRcPickCarrier(\'' + _spEsc(planId) + '\', this.value)" style="width:100%;max-width:100%;padding:4px 6px;border:1px solid #CBD5E1;border-radius:4px;font-size:12px;box-sizing:border-box;">' +
            '<option value=""' + (selC ? '' : ' selected') + '>-- Choose carrier --</option>' +
            cars.map(function (c) { return '<option value="' + _spEsc(c.id) + '"' + (c.id === selC ? ' selected' : '') + '>' + _spEsc(c.name) + (c.name !== c.id ? ' (' + _spEsc(c.id) + ')' : '') + '</option>'; }).join('') +
        '</select>' +
        '<label style="display:block;font-size:11px;color:#64748B;margin-top:6px;">Shipping Method</label>' +
        '<select class="sp-rc-method" onchange="spRcPickMethod(\'' + _spEsc(planId) + '\', this.value)"' + (selC ? '' : ' disabled') + ' style="width:100%;max-width:100%;padding:4px 6px;border:1px solid #CBD5E1;border-radius:4px;font-size:12px;box-sizing:border-box;">' +
            '<option value=""' + (o ? '' : ' selected') + '>' + (selC ? '-- Choose method --' : '-- Choose a carrier first --') + '</option>' +
            mine.map(function (x) { return '<option value="' + x.i + '"' + (String(x.i) === selI ? ' selected' : '') + '>' + _spEsc(x.o.shipping_method_label || '(no label)') + (x.o.quote && x.o.quote.priced ? ' \u00b7 ' + (x.o.quote.split_currency ? ('Freight ' + _spMoney_(x.o.quote.freight, x.o.quote.currency) + ' / Duty ' + _spMoney_(x.o.quote.duty, x.o.quote.duty_currency)) : _spMoney_(x.o.quote.total, x.o.quote.currency)) : ' \u00b7 quote at Shipment Draft') + _spEuLead15e_(x.o) + '</option>'; }).join('') +
        '</select>' +
        '<details class="sp-rc-token" style="font-size:11px;color:#64748B;margin-top:2px;"><summary>Details</summary>' + (o ? ('method token: ' + _spEsc(o.shipping_method) + (o.last_mile_delivery ? ' \u00b7 last mile: ' + _spEsc(o.last_mile_delivery) : '') + ' \u00b7 card ' + _spEsc(o.rate_card_id)) : '') + '</details>' +
        '<div class="sp-rc-lt" style="font-size:11px;margin-top:2px;">' + (o ? ((o.lead_time && o.lead_time.state === 'MATCHED') ? '<span style="color:#475569;">Lead time: ' + _spEsc(o.lead_time.days) + ' days \u00b7 ' + _spEsc(o.lead_time.origin_country || '?') + ' \u2192 ' + _spEsc(o.lead_time.destination_country || '?') + '</span>' : '<span style="color:#B45309;">Lead time: UNKNOWN for this carrier / method (' + _spEsc((o.lead_time && o.lead_time.reason) || 'no match') + ')</span>') : '') + '</div>' +
        (function () { var cl = (r.lane && r.lane.customs) || [], cs = host.getAttribute('data-sel-customs') || (r.preview_customs_type != null ? r.preview_customs_type : String((r.lane && r.lane.customs_type) || ''));
            return '<label style="display:block;font-size:11px;color:#64748B;margin-top:6px;">Customs</label>' +
            '<select class="sp-rc-customs" onchange="spRcPickCustoms(\'' + _spEsc(planId) + '\', this.value)" style="width:100%;max-width:100%;padding:4px 6px;border:1px solid #CBD5E1;border-radius:4px;font-size:12px;box-sizing:border-box;">' +
            '<option value=""' + (cs ? '' : ' selected') + '>-- Choose customs --</option>' +
            cl.map(function (c) { return '<option value="' + _spEsc(c.id) + '"' + (c.id === cs ? ' selected' : '') + '>' + _spEsc(c.label || c.id) + '</option>'; }).join('') + '</select>'; })() +
        '<button type="button" class="sp-btn sp-btn-submit sp-rc-save" onclick="spRcSave(\'' + _spEsc(planId) + '\')"' + ((o && ((o.quote && o.quote.priced) || o.service_only)) || _spWk1CxPicked_(host, r) ? '' : ' disabled') + ' style="margin-top:6px;font-size:12px;padding:4px 12px;min-width:150px;">Save</button>';
}
// WK1 r3 (Owner): the plan stores no rate card id - the saved COST and the saved CARD are reported separately (current.card_check, 11_ r3)
function _spWk1CardTxt_(r) { var c = (r && r.current && r.current.card_check) || {}; return 'COST SAVED, CARD NOT VERIFIED: the saved cost is still reproduced by a current rate card, but ' + (c.cards_with_saved_terms || 'several') + ' rate cards carry the same carrier / method / rate / customs and the plan does not record which one was chosen. Not verified as PRICED - choose the card again and Save to confirm it.'; }
function _spWk1KnownHtml_(r) {
    var c = (r && r.current) || {}, k = c.card_check || {};
    if (!c.carrier_id || c.state === 'PENDING' || c.state === 'PREVIEW_CUSTOMS') return '';
    var cost = c.cost_saved ? ('Saved cost: ' + _spEsc(String(c.currency || '')) + ' ' + _spEsc(String(c.total)) + ' (known)') : 'Saved cost: none (unpriced)';
    var card = { UNIQUE: 'Rate card: ' + _spEsc(String(k.rate_card_id || '')) + ' (verified: the only card with the saved terms, valid today)', AMBIGUOUS: 'Rate card: NOT verifiable (' + _spEsc(String(k.cards_with_saved_terms)) + ' cards carry the saved terms)', NO_CURRENT_CARD: 'Rate card: no current card carries the saved terms' }[k.status] || 'Rate card: not checked';
    return '<div class="sp-rc-known" data-card-check="' + _spEsc(String(k.status || 'NOT_CHECKED')) + '" style="font-size:11px;color:#475569;margin-bottom:6px;">' + cost + ' | ' + card + '</div>';
}
function _spWk1CxPicked_(host, r) { var b = String((r.lane && r.lane.customs_type) || ''), cs = host.getAttribute('data-sel-customs') || (r.preview_customs_type != null ? r.preview_customs_type : b); return (cs && cs !== b) ? cs : ''; }
function _spWk1CustomsOnlyCx_(h, r) { var s = h ? h.querySelector('.sp-rc-customs') : null, cx = s ? String(s.value || '') : ''; return (cx && r && cx !== String((r.lane && r.lane.customs_type) || '')) ? cx : ''; }
function _spSavedQuoteTextCp2d_(d) {
    d = d || {};
    function money(v, currency) {
        if (v == null || typeof v === 'boolean' || (typeof v === 'string' && !v.trim()) || !isFinite(Number(v))) return '--';
        return (currency ? String(currency) + ' ' : '') + Number(v).toFixed(2);
    }
    var currency = String(d.currency || ''), dutyCurrency = String(d.estimated_duty_currency || '');
    var total = money(d.estimated_total_cost, currency);
    if (currency && dutyCurrency && currency !== dutyCurrency) {
        return 'Freight ' + money(d.estimated_freight_cost, currency) + ' / Duty ' + money(d.estimated_duty, dutyCurrency) + ' / Total -- (currencies kept separate)';
    }
    if (total !== '--') return 'total ' + total;
    return 'Freight ' + money(d.estimated_freight_cost, currency) + ' / Duty ' + money(d.estimated_duty, dutyCurrency || currency) + ' / Total --';
}
function _spWk1SaveCustoms_(planId, h, r, cx) {   // WK1 r3 (Owner): a customs-only change saves through the registered writer; the server re-prices or marks it UNPRICED
    var exp = String((r.current && r.current.carrier_id) || '');
    if (!_spPlanTok_(planId)) { _spNotify_('This plan has no edit token on screen - it is being re-read. Nothing was sent; choose again after it reloads.'); try { _spReadbackAfterWrite_(); } catch (eT) {} return; }
    if (_SP_WK1_SAVING_[planId]) return;
    var btn = h ? h.querySelector('.sp-rc-save') : null; _SP_WK1_SAVING_[planId] = true; if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
    var tok = _spPlanTok_(planId);
    return _spRunCommand_(planId + ':ratecard', function () {
        if (!window.KM.DB || typeof window.KM.DB.saveShippingPlanCustoms !== 'function') return { success: false, error: { code: 'WEEKLY_SAVE_UNAVAILABLE', message: 'This build has no customs Save. Nothing was sent.' } };
        return Promise.resolve(window.KM.DB.saveShippingPlanCustoms(planId, cx, exp, tok)).then(function (x) {
            if (x && x.success) { if (String(x.customs_type || '') !== cx) return { success: false, error: { code: 'RATE_CARD_SELECTION_UNVERIFIED', message: 'The server did not confirm the customs ' + cx + '.' } }; return { success: true, data: x }; }
            var code = (x && (x.code || (typeof x.error === 'string' ? x.error : (x.error && x.error.code)))) || 'SELECTION_FAILED';
            return { success: false, error: { code: code, message: (x && x.message) || code } };
        });
    }, { failPrefix: 'Save customs failed', planId: planId,
        onSuccess: function (res) { var d = res.data || {}, lbl = d.customs_type_label || d.customs_type; delete SP_RC_SEL_[planId];
            return d.priced === true ? ('Saved customs ' + lbl + ' | re-priced by the server: ' + _spSavedQuoteTextCp2d_(d) + ' (read back).')
                : ('Saved customs ' + lbl + ' | NOT PRICED (' + (d.unpriced_reason || 'NO_CARD') + '): the old cost was cleared - choose a carrier and a method priced for it, then Save.'); } })
        .then(function (res) { delete _SP_WK1_SAVING_[planId]; return res; }, function (e) { delete _SP_WK1_SAVING_[planId]; throw e; });
}
function _spWk1Base_(r) { var c = (r && r.current) || {}; return JSON.stringify([String(c.carrier_id || ''), String(c.shipping_method || ''), String(c.last_mile_delivery || ''), String((r && r.lane && r.lane.customs_type) || ''), String(c.total == null ? '' : c.total)]); }
function _spWk1Remember_(planId, patch) { var c = SP_RC_SEL_[planId] || {}; if (!c.base) c.base = _spWk1Base_(SP_RC_[planId]); Object.keys(patch).forEach(function (k) { c[k] = patch[k]; }); SP_RC_SEL_[planId] = c; }   // WK1 r2 (m-7): base = the server's choice when the first unsaved pick was made
function spRcPickCustoms(planId, v) { var h = document.getElementById('sp-rc-' + planId); if (!h) return; _spWk1Remember_(planId, { customs: v || '' }); spRcRefresh(planId); }
function spRcPickCarrier(planId, v) { var h = document.getElementById('sp-rc-' + planId); if (!h) return; _spWk1Remember_(planId, { carrier: v || '', rate_card_id: '' }); h.setAttribute('data-sel-carrier', v || ''); h.removeAttribute('data-sel-card'); _spRcRender_(planId); }
function spRcPickMethod(planId, v) { var h = document.getElementById('sp-rc-' + planId); if (!h) return; var rr = SP_RC_[planId], oo = rr && rr.options && rr.options[Number(v)]; _spWk1Remember_(planId, { carrier: oo ? oo.carrier_id : ((SP_RC_SEL_[planId] || {}).carrier || ''), rate_card_id: oo ? oo.rate_card_id : '', service_key: oo && oo.service_only ? JSON.stringify([oo.carrier_id, oo.shipping_method, oo.last_mile_delivery]) : '' }); h.setAttribute('data-sel-card', v || ''); _spRcRender_(planId); }
function spRcSave(planId) {
    var h = document.getElementById('sp-rc-' + planId), r = SP_RC_[planId], i = h ? h.getAttribute('data-sel-card') : null;
    if (!r || i == null || i === '' || !r.options[Number(i)]) {
        var sel = h && h.querySelector('.sp-rc-method'); i = sel ? sel.value : '';
        if (i === '' || !r || !r.options[Number(i)]) { var cx0 = _spWk1CustomsOnlyCx_(h, r); if (cx0) return _spWk1SaveCustoms_(planId, h, r, cx0); _spNotify_('Choose a carrier and a shipping method first.'); return; }   // WK1 r3: a customs-only change saves
    }
    var o = r.options[Number(i)], exp = String((r.current && r.current.carrier_id) || '');
    if (!(o.quote && o.quote.priced) && !o.service_only) { var cx1 = _spWk1CustomsOnlyCx_(h, r); if (cx1) return _spWk1SaveCustoms_(planId, h, r, cx1); _spNotify_('This method is not priced for the plan. Nothing was sent.'); return; }   // WK1 r3
    if (!_spPlanTok_(planId)) { _spNotify_('This plan has no edit token on screen - it is being re-read. Nothing was sent; choose again after it reloads.'); try { _spReadbackAfterWrite_(); } catch (eT) {} return; }   // R71-FE-12 (review MINOR-2)
    var cSel = h ? h.querySelector('.sp-rc-customs') : null, cx = cSel ? String(cSel.value || '') : '';
    if (r.lane && (r.lane.customs || []).length && !cx) { _spNotify_('Choose a customs type first. Nothing was sent.'); return; }
    if (_SP_WK1_SAVING_[planId]) return;   // WK1: double-click guard (one unified Save per plan)
    var btn = h ? h.querySelector('.sp-rc-save') : null; _SP_WK1_SAVING_[planId] = true; if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    var tok = _spPlanTok_(planId);
    return _spRunCommand_(planId + ':ratecard', function () {
        // WK1 r2 (M-1): the registered db-api source writer (planning / exposure epochs); fail closed without it
        if (!window.KM.DB || typeof window.KM.DB.selectShippingPlanRateCardWithCustoms !== 'function') return { success: false, error: { code: 'WEEKLY_SAVE_UNAVAILABLE', message: 'This build has no unified Save. Nothing was sent.' } };
        return Promise.resolve(window.KM.DB.selectShippingPlanRateCardWithCustoms(planId, o, exp, tok, cx)).then(function (x) {
            if (x && x.success) {   // m-4: a Save that does not return the customs it was asked for is NOT saved - an UNKNOWN outcome, read back
                if (cx && String(x.customs_type || '') !== cx) return { success: false, error: { code: 'RATE_CARD_SELECTION_UNVERIFIED', message: 'The server did not confirm the customs ' + cx + '.' } };
                if (o.service_only && (x.carrier_id !== o.carrier_id || x.shipping_method !== o.shipping_method || x.last_mile_delivery !== o.last_mile_delivery)) return { success: false, error: { code: 'RATE_CARD_SELECTION_UNVERIFIED', message: 'Service readback mismatch.' } };
                return { success: true, data: x };
            }
            var code = (x && (x.code || (typeof x.error === 'string' ? x.error : (x.error && x.error.code)))) || 'SELECTION_FAILED';
            return { success: false, error: { code: code, message: (x && x.message) || code } };
        });
    }, { failPrefix: 'Save carrier failed', planId: planId,
        onSuccess: function (res) { var d = res.data || {}; delete SP_RC_SEL_[planId]; if (d.priced === false) return 'Saved. Freight is not quoted yet; finish pricing in Shipment Draft.'; return 'Saved: ' + (o.carrier_name || o.carrier_id) + ' \u00b7 ' + (d.shipping_method_label || o.shipping_method_label) + (d.customs_type_label ? ' \u00b7 ' + d.customs_type_label : '') + ' \u00b7 ' + _spSavedQuoteTextCp2d_(d) + ' (priced by the server, read back).'; } })
        .then(function (res) { delete _SP_WK1_SAVING_[planId]; return res; }, function (e) { delete _SP_WK1_SAVING_[planId]; throw e; });
}
function _spMarkCostState12_(planId, st) {   // R71-FE-12 (review MINOR-3)
    var bad = (st === 'NEEDS_REPRICING' || st === 'NOT_APPLICABLE' || st === 'PENDING'), say = { NEEDS_REPRICING: 'NEEDS RE-PRICING', NOT_APPLICABLE: 'NO LONGER APPLIES', PENDING: 'CHOICE DID NOT FINISH' }[st] || '';
    var cost = document.getElementById('sp-cost-' + planId), card = document.getElementById('sp-card-' + planId);
    var vals = [];
    if (cost) vals = vals.concat(Array.prototype.slice.call(cost.querySelectorAll('.sp-cost-value')));
    if (card) Array.prototype.forEach.call(card.querySelectorAll('.sp-summary-item'), function (it) { var l = it.querySelector('.sp-summary-label'); if (l && /^(Total Cost|Unit Cost)$/.test(l.textContent.trim())) vals.push(it.querySelector('.sp-summary-value')); });
    vals.forEach(function (v) { if (!v) return; v.style.textDecoration = bad ? 'line-through' : ''; v.style.color = bad ? '#94A3B8' : ''; v.setAttribute('data-cost-state', st); });
    if (cost) { var b = cost.querySelector('.sp-cost-invalid'); if (bad) { if (!b) { b = document.createElement('div'); b.className = 'sp-cost-invalid'; b.style.cssText = 'color:#B45309;font-weight:600;font-size:12px;margin:4px 0;'; cost.insertBefore(b, cost.children[1] || null); } b.textContent = say + ': the stored cost below is not a quote any more - choose the carrier and method again.'; } else if (b) b.parentNode.removeChild(b); }
    if (card) Array.prototype.forEach.call(card.querySelectorAll('.sp-summary-item'), function (it) { var l = it.querySelector('.sp-summary-label'); if (!l || l.textContent.trim() !== 'Total Cost') return; var t = it.querySelector('.sp-cost-invalid-tag'); if (bad && !t) { t = document.createElement('span'); t.className = 'sp-cost-invalid-tag'; t.style.cssText = 'display:block;color:#B45309;font-size:11px;'; it.appendChild(t); } if (t) t.textContent = bad ? say : ''; });
}
window.spRcRefresh = spRcRefresh; window.spRcPickCustoms = spRcPickCustoms; window.spRcPickCarrier = spRcPickCarrier; window.spRcPickMethod = spRcPickMethod; window.spRcSave = spRcSave;
window.renderShippingPlanFromDb = renderShippingPlanFromDb;
window.spDbShowNote = spDbShowNote;
window.spDbCancelNote = spDbCancelNote;
window.spDbSaveNote = spDbSaveNote;
window.toggleSpDbCard = toggleSpDbCard;
window.spDbOnQtyInput = spDbOnQtyInput;
window.spDbSaveQty = spDbSaveQty;
window.spDbSubmit = spDbSubmit;
window.spDbApprove = spDbApprove;
window.spDbRetryShipment = spDbRetryShipment;
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
                // F1-7B-R1: the canonical weeklyShipping Workspace is the PRIMARY read — it needs NO broad
                // Operation DB. Render straight from the scoped workspace (independent of app.js's global prime).
                // Only the LEGACY read path still requires the broad cache; do not force-load it in Workspace mode.
                if (_spEffectiveWorkspace()) {
                    renderShippingPlan();
                // R71-FE-3 (review X7 / run6): _spUseDb() needs a PRIMED broad cache ('google-sheet'), so on a cold session in legacy mode (the
                // weeklyShipping kill switch) this branch could never run and the page fell to the sessionStorage demo render ('No shipping
                // plans available.'). The cold-start-independent predicate (isScopedReadEligible: API configured, not mock) now admits the load.
                } else if (!window._opDbCache && window.KM.DB.loadOperationDb && (_spUseDb() || (typeof window.KM.DB.isScopedReadEligible === 'function' && window.KM.DB.isScopedReadEligible()))) {
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

// WK1: the Weekly Delivery-warehouse selector and its Save route were removed. The actual delivery warehouse is chosen only in Shipment
// Draft; the plan's To (destination / destination_type / destination_warehouse_id) is never written from Weekly.

// R15C-EU-SP (sbx-r15c-eu): patched
// R15C-EU: an option of a planning-set plan (EU) names its member countries and each one's own transit time; anything else is unchanged.
function _spEuLead15e_(o) {
    var lt = o && o.lead_time;
    if (!(lt && lt.state === 'REGION_UNDETERMINED')) return ((lt && lt.state === 'MATCHED') ? ' \u00b7 lead ' + _spEsc(lt.days) + ' d' : ' \u00b7 lead time unknown');
    var cs = (o.destination_countries || []).slice(), by = lt.by_country || {};
    return ' \u00b7 to ' + _spEsc(cs.join('/') || '?') + ' \u00b7 lead ' + (cs.map(function (c) { var x = by[c]; return _spEsc(c) + ' ' + ((x && x.state === 'MATCHED') ? _spEsc(x.days) + ' d' : 'unknown'); }).join(', ') || 'unknown') + ' (by warehouse country)';
}

// CODEX-TAX-SPLIT-1: local candidate, Owner fractional rates and separate currencies.
