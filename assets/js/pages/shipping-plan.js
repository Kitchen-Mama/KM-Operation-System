// ========================================
// Shipping Plan Page Logic
// 從 app.js 搬移，不改行為
// ========================================

function renderShippingPlan() {
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
    const statusFilter = document.getElementById('spStatusFilter').value;
    const allCards = document.querySelectorAll('.sp-card');
    const draftTitle = document.getElementById('draftSectionTitle');
    const pendingTitle = document.getElementById('pendingSectionTitle');
    const approvedTitle = document.getElementById('approvedSectionTitle');
    const draftCards = document.getElementById('shippingPlanCards');
    const pendingCards = document.getElementById('pendingApprovalCards');
    const approvedCards = document.getElementById('approvedCards');
    if (statusFilter === 'all') {
        draftTitle.style.display = '';
        pendingTitle.style.display = '';
        approvedTitle.style.display = '';
        draftCards.style.display = '';
        pendingCards.style.display = '';
        approvedCards.style.display = '';
        allCards.forEach(card => card.style.display = '');
    } else {
        draftTitle.style.display = 'none';
        pendingTitle.style.display = 'none';
        approvedTitle.style.display = 'none';
        draftCards.style.display = 'none';
        pendingCards.style.display = 'none';
        approvedCards.style.display = 'none';
        if (statusFilter === 'draft') {
            draftTitle.style.display = '';
            draftCards.style.display = '';
        } else if (statusFilter === 'pendingApproval') {
            pendingTitle.style.display = '';
            pendingCards.style.display = '';
        } else if (statusFilter === 'approved') {
            approvedTitle.style.display = '';
            approvedCards.style.display = '';
        }
        allCards.forEach(card => {
            const cardStatus = card.getAttribute('data-status');
            card.style.display = cardStatus === statusFilter ? '' : 'none';
        });
    }
}

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
if (window.KM && window.KM.lifecycle) {
    KM.lifecycle.register('shippingplan-section', {
        mount() {
            console.log('[ShippingPlan] mount');
            renderShippingPlan();
        },
        unmount() {
            console.log('[ShippingPlan] unmount');
            // 此頁無 chart / interval / scroll listener 需清理
            // 未來若新增，在此處理
        }
    });
}
