// ========================================
// Request Order Draft (Procurement Planning Draft) — Procurement Layer Phase 1
// Reads request_orders / request_order_lines via KM.DB. Card + expand UI with the
// Draft / Pending Approval / Approved workflow. API-ready: all writes go through
// KM.DB.* and reload the DB; sessionStorage is used only as a working-draft recovery
// for the manual-create modal (never as the final source of truth).
// See docs/planning/REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md.
// ========================================

(function () {
    'use strict';

    // ---- helpers ----
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
    function money(v, cur) {
        if (v === '' || v == null || isNaN(parseFloat(v))) return '--';
        return (cur ? esc(cur) + ' ' : '') + Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
    }
    function dash(v) { var s = String(v == null ? '' : v).trim(); return s ? esc(s) : '--'; }

    function useDb() {
        return !!(window.KM && window.KM.DB && window.KM.DB.isCloudWriteEnabled &&
            window.KM.DB.isCloudWriteEnabled() && window.KM.DB.getRequestOrders);
    }

    var RO_STATUS_LABEL = {
        draft: 'Draft', pending_approval: 'Pending Approval', approved: 'Approved',
        converted_to_po: 'Converted to PO', cancelled: 'Cancelled'
    };

    // Canonical company list. In Manual Allocation Mode a Draft row ALWAYS renders these three editable
    // inputs (missing company = 0), independent of which request_order_lines / _sources already exist.
    var RO_CANON_COMPANIES = ['KM', 'ResUS', 'ResTW'];

    // Per-card request_order_lines cache (id -> lines), used as the Company Allocation popup fallback
    // when request_order_line_sources has no rows for a SKU/company.
    var roLinesCache = {};

    // ---- load + render ----
    function loadAndRender() {
        var groups = document.getElementById('ro-groups');
        var note = document.getElementById('ro-mode-note');
        if (!groups) return;

        if (!useDb()) {
            if (note) note.innerHTML = '<span class="procurement-page__note--demo">Demo mode — connect the Operation DB (Google Sheet) to create and manage Request Orders. No live data is shown.</span>';
            groups.innerHTML = '<div class="procurement-empty">Request Orders are stored in the Operation DB. Enable the cloud DB to use this page.</div>';
            return;
        }
        if (note) note.innerHTML = '';

        if (!window._opDbCache && window.KM.DB.loadOperationDb) {
            window.KM.DB.loadOperationDb({ force: true }).then(renderFromDb).catch(renderFromDb);
        } else {
            renderFromDb();
        }
    }

    function renderFromDb() {
        var groupsEl = document.getElementById('ro-groups');
        if (!groupsEl) return;

        var orders = window.KM.DB.getRequestOrders() || [];
        var lines = window.KM.DB.getRequestOrderLines() || [];
        var linesByRo = {};
        lines.forEach(function (l) { (linesByRo[l.requestOrderId] = linesByRo[l.requestOrderId] || []).push(l); });

        // Default view: Draft / Pending Approval / Approved. Cancelled hidden; Approved rows
        // with completed_at (Done) hidden. Converted-to-PO shown under Approved (informational).
        function visible(o) {
            if (o.status === 'cancelled') return false;
            if ((o.status === 'approved' || o.status === 'converted_to_po') && String(o.completedAt || '').trim()) return false;
            return true;
        }
        var pool = orders.filter(visible);

        var sections = [
            ['draft', 'Draft'],
            ['pending_approval', 'Pending Approval'],
            ['approved', 'Approved']
        ];
        var html = sections.map(function (s) {
            var items = pool.filter(function (o) {
                if (s[0] === 'approved') return o.status === 'approved' || o.status === 'converted_to_po';
                return o.status === s[0];
            });
            var body = items.length
                ? items.map(function (o) { return renderCard(o, linesByRo[o.requestOrderId] || []); }).join('')
                : '<p class="procurement-group__empty">No ' + esc(s[1]) + ' requests.</p>';
            return '<div class="procurement-group">' +
                '<h3 class="procurement-group__title">' + esc(s[1]) + ' <span class="procurement-group__count">' + items.length + '</span></h3>' +
                body + '</div>';
        }).join('');

        if (!pool.length) {
            html = '<div class="procurement-empty">No request orders yet. Click <strong>+ New Manual Draft</strong> to create one.</div>' + html;
        }
        groupsEl.innerHTML = html;
    }

    // Default Tier 1 factory/warehouse (used when the request carries no warehouse/factory id).
    var DEFAULT_TIER1_WH = 'WH-TW-CN-FACTORY-YOUXIN';

    // warehouse_id (upper) -> warehouse_name, for the Factory/WH display (spec: show warehouse_name).
    function roWhNameMap() {
        var m = {};
        ((window.KM.DB.getWarehouses && window.KM.DB.getWarehouses()) || []).forEach(function (w) {
            if (w.warehouseId) m[String(w.warehouseId).trim().toUpperCase()] = w.warehouseName || '';
        });
        return m;
    }
    function roFactoryDisplay(o, whMap) {
        var wid = String(o.warehouseId || '').trim();
        var fid = String(o.factoryId || '').trim();
        if (wid) return whMap[wid.toUpperCase()] || wid;
        if (fid) return fid;
        return DEFAULT_TIER1_WH;   // default Tier 1 factory/warehouse
    }
    // Distinct non-empty values helper (Company summary / Series summary from lines).
    function roDistinct(arr) {
        var seen = {}, out = [];
        (arr || []).forEach(function (v) { v = String(v == null ? '' : v).trim(); if (v && !seen[v]) { seen[v] = 1; out.push(v); } });
        return out;
    }
    function roSummary(label, valueHtml) {
        return '<div class="sp-summary-item"><span class="sp-summary-label">' + label + '</span>' +
            '<span class="sp-summary-value">' + valueHtml + '</span></div>';
    }
    // Read an unmapped column straight off the raw record (Schedule / Payment fields have no source yet).
    function roRaw(o, key) { var r = o && o.raw; var v = r ? r[key] : ''; return (v == null ? '' : String(v).trim()); }

    // Safe DOM-id fragment from arbitrary strings (SKU / RO id may contain non-id chars).
    function safeKey(s) { return String(s == null ? '' : s).replace(/[^A-Za-z0-9_]/g, '-'); }
    // Tier bucket → block: T2/T3 → 'T2T3'; everything else (T1 / blank / legacy) → 'T1'.
    function tierOf(bucket) { var b = String(bucket || '').trim().toUpperCase(); return (b === 'T2' || b === 'T3') ? 'T2T3' : 'T1'; }
    function companyOf(l) { return String(l.company || '').trim() || '—'; }

    // Group active lines into rows keyed by (bucket, sku); each row aggregates its per-company lines.
    // Returns { rows: [{ bucket, sku, upc, series, requested, cells: { company: {lineId, approved, requested} } }],
    //           companies: [distinct company set for the card] }.
    function buildRowModel(activeLines) {
        var byKey = {}, order = [], coSet = {};
        activeLines.forEach(function (l) {
            var bucket = String(l.requestBucket || '').trim() || 'T1';
            var sku = l.sku || '';
            var co = companyOf(l);
            coSet[co] = 1;
            var k = bucket + '||' + sku;
            if (!byKey[k]) { byKey[k] = { bucket: bucket, sku: sku, upc: num(l.unitsPerCarton), series: l.series || '', requested: 0, cells: {} }; order.push(k); }
            var row = byKey[k];
            if (!row.upc) row.upc = num(l.unitsPerCarton);
            row.requested += num(l.requestedQty);
            var cell = row.cells[co] || { lineId: l.requestOrderLineId, approved: 0, requested: 0 };
            cell.approved += num(l.approvedQty);
            cell.requested += num(l.requestedQty);
            if (!cell.lineId) cell.lineId = l.requestOrderLineId;
            row.cells[co] = cell;
        });
        // Prefer a stable KM / ResUS / ResTW-style ordering: known first, then the rest alphabetically.
        var known = ['KM', 'ResUS', 'ResTW'];
        var companies = known.filter(function (c) { return coSet[c]; })
            .concat(Object.keys(coSet).filter(function (c) { return known.indexOf(c) === -1; }).sort());
        return { rows: order.map(function (k) { return byKey[k]; }), companies: companies };
    }

    function renderCard(o, roLines) {
        var id = o.requestOrderId;
        roLinesCache[id] = roLines || [];   // cache for the Company Allocation popup fallback
        var statusLabel = RO_STATUS_LABEL[o.status] || o.status || '—';
        var isDraft = o.status === 'draft';
        var whMap = roWhNameMap();

        // Cancelled lines are hidden (X = soft cancel). If the whole request is cancelled it is filtered upstream.
        var active = roLines.filter(function (l) { return l.lineStatus !== 'cancelled'; });
        var model = buildRowModel(active);
        var companies = model.companies;   // companies actually present on lines (drives the header summary)

        // A2 — Manual Allocation Mode: DRAFT cards always expose KM / ResUS / ResTW so any company can be
        // (re)allocated even if it had no original line. Companies without a line render as editable 0-cells
        // and, when given a qty, create a new request_order_line on Save (line-per-company model).
        var tableCompanies = companies;
        if (isDraft) {
            tableCompanies = RO_CANON_COMPANIES.slice();
            companies.forEach(function (c) { if (tableCompanies.indexOf(c) === -1) tableCompanies.push(c); });
        }

        // Company summary from the real per-line company column (KM / ResUS / ResTW …).
        var companyList = companies.filter(function (c) { return c !== '—'; });
        var companyDisp = companyList.length ? esc(companyList.join(' / ')) : dash(o.company);
        var seriesDisp = roDistinct(active.map(function (l) { return l.series; }));
        var seriesHtml = seriesDisp.length ? esc(seriesDisp.join(', ')) : '--';
        var totalQty = active.reduce(function (s, l) { return s + num(l.approvedQty); }, 0);
        var totalCartons = active.reduce(function (s, l) { return s + num(l.cartonQty); }, 0);

        var summary =
            roSummary('Status', '<span class="plan-status-badge plan-status-badge--' + esc(o.status) + '">' + esc(statusLabel) + (num(o.requestOrderVersion) > 1 ? ' (v' + num(o.requestOrderVersion) + ')' : '') + '</span>') +
            roSummary('Request No', esc(o.requestOrderNo || id)) +   // no bold — same value typography as its siblings (2026-07-28)
            roSummary('Company', companyDisp) +
            roSummary('Factory', esc(roFactoryDisplay(o, whMap))) +      // renamed Factory/WH → Factory (warehouse_name)
            roSummary('Series', seriesHtml) +
            roSummary('Total Qty', '<span id="ro-total-qty-' + esc(id) + '">' + totalQty.toLocaleString() + '</span>') +
            roSummary('Total Ctn', '<span id="ro-total-ctn-' + esc(id) + '">' + totalCartons.toLocaleString() + '</span>') +
            roSummary('Est. Amount', money(o.estimatedAmount, o.currency)) +
            roSummary('Created', dash(o.createdAt));

        var actions = '<button class="sp-btn sp-btn-expand" onclick="roToggleCard(\'' + esc(id) + '\')">Expand</button>' + renderActions(o);
        var rejectedBanner = (String(o.rejectedReason || '').trim())
            ? '<div class="procurement-card__banner">Last rejection: ' + esc(o.rejectedReason) + '</div>'
            : '';

        var t1Rows = model.rows.filter(function (r) { return tierOf(r.bucket) === 'T1'; });
        var t23Rows = model.rows.filter(function (r) { return tierOf(r.bucket) === 'T2T3'; });

        return '' +
        '<div class="sp-card ro-decision-card" id="ro-card-' + esc(id) + '" data-status="' + esc(o.status) + '">' +
            '<div class="sp-card-header">' +
                '<div class="sp-card-summary">' + summary + '</div>' +
                '<div class="sp-card-actions">' + actions + '</div>' +
            '</div>' +
            '<div class="sp-card-details">' +
                rejectedBanner +
                '<div class="ro-decision-grid">' +
                    renderTotalBlock(id, tableCompanies) +
                    renderTierBlock(o, 'T1', 'T1 Request', t1Rows, tableCompanies, isDraft, active) +
                    renderTierBlock(o, 'T2T3', 'T2 + T3 Request', t23Rows, tableCompanies, isDraft, active) +
                '</div>' +
            '</div>' +
        '</div>';
    }

    // Company column headers (KM / ResUS / ResTW …). '—' shown as "Unassigned".
    function companyHeaders(companies) {
        return companies.map(function (c) { return '<th class="pc-num">' + esc(c === '—' ? 'Unassigned' : c) + '</th>'; }).join('');
    }

    // Block 1 — SKU In Total (READ-ONLY). Rebuilt live from the tier blocks by recomputeCard().
    function renderTotalBlock(id, companies) {
        return '<div class="sp-section ro-total-section">' +
            '<h4 class="sp-section-title">SKU In Total</h4>' +
            '<div class="procurement-table-wrap"><table class="sp-sku-table procurement-table">' +
                '<thead><tr><th>SKU</th>' + companyHeaders(companies) +
                    '<th class="pc-num">Requested</th><th class="pc-num">Approved</th><th class="pc-num">Carton</th></tr></thead>' +
                '<tbody id="ro-total-body-' + esc(id) + '"></tbody>' +
                '<tfoot><tr class="sp-sku-footer" style="font-weight:600;border-top:2px solid #CBD5E1;">' +
                    '<td>Total SKUs: <span id="ro-total-skus-' + esc(id) + '">0</span></td>' +
                    companies.map(function () { return '<td>—</td>'; }).join('') +
                    '<td>—</td>' +
                    '<td class="pc-num">Approved: <span id="ro-total-appr-' + esc(id) + '">0</span></td>' +
                    '<td class="pc-num">Ctn: <span id="ro-total-ctn2-' + esc(id) + '">0</span></td>' +
                '</tr></tfoot>' +
            '</table></div>' +
            '<div class="ro-total-hint">Read-only — sum of T1 + (T2 + T3). Edit quantities in the tier blocks below.</div>' +
        '</div>';
    }

    // Blocks 2 & 3 — tier decision tables (editable Approved + company split; schedule; X / Add Note).
    function renderTierBlock(o, tier, title, rows, companies, isDraft, activeLines) {
        var id = o.requestOrderId;
        if (!rows.length) {
            return '<div class="sp-section ro-tier" data-tier="' + tier + '" data-card="' + esc(id) + '">' +
                '<h4 class="sp-section-title">' + esc(title) + '</h4>' +
                '<p class="procurement-group__empty">No ' + esc(title) + ' lines.</p></div>';
        }
        var body = rows.map(function (r, i) {
            var rk = safeKey(id) + '_' + tier + '_' + i;
            var rowReq = r.requested;
            var upc = r.upc || 0;
            // Row total from the per-company approved values.
            var rowApproved = companies.reduce(function (s, co) { return s + (r.cells[co] ? num(r.cells[co].approved) : 0); }, 0);
            // Company allocation total across the canonical KM / ResUS / ResTW (Allocation Persistence basis).
            var companyTotal = RO_CANON_COMPANIES.reduce(function (s, co) { return s + (r.cells[co] ? num(r.cells[co].approved) : 0); }, 0);
            // A2 — Manual Allocation Mode determined at ROW RENDER TIME: active when the row's Approved qty
            // (rowApproved) does NOT equal the KM+ResUS+ResTW company allocation total. When active, ALL three
            // canonical company inputs are editable and any missing company defaults to 0 — independent of which
            // request_order_lines / _sources already exist. It also turns on live the moment the user makes
            // Approved diverge from the company sum (roOnApprovedInput, sticky via data-manual).
            var manualAllocationMode = isDraft && (rowApproved !== companyTotal);
            var locked = !isDraft || !manualAllocationMode;   // company inputs are editable only in Manual Allocation Mode
            var coCells = companies.map(function (co) {
                var cell = r.cells[co];
                if (!cell) {
                    // Non-draft: no line for this company → static placeholder.
                    if (!isDraft) return '<td class="pc-num">--</td>';
                    // A2 — Manual Allocation phantom cell: no line yet. Editable when the row is unlocked;
                    // on Save (qty > 0) a NEW request_order_line is created for this company (data-new-line).
                    return '<td class="pc-num"><input type="number" min="0" step="1" class="ro-co-input pc-input pc-input--qty' + (locked ? '' : ' ro-co-editable') + '" ' +
                        'data-card="' + esc(id) + '" data-rk="' + rk + '" data-company="' + esc(co) + '" data-req="0" ' +
                        'data-new-line="1" data-sku="' + esc(r.sku) + '" data-bucket="' + esc(r.bucket) + '" data-upc="' + upc + '" ' +
                        (locked ? 'readonly ' : '') + 'value="0" ' +
                        'oninput="roOnCompanyInput(this)" style="text-align:right;width:80px;"></td>';
                }
                var val = num(cell.approved);
                return '<td class="pc-num"><input type="number" min="0" step="1" class="ro-co-input pc-input pc-input--qty' + (locked ? '' : ' ro-co-editable') + '" ' +
                    'data-line-id="' + esc(cell.lineId) + '" data-card="' + esc(id) + '" data-rk="' + rk + '" ' +
                    'data-company="' + esc(co) + '" data-req="' + num(cell.requested) + '" ' +
                    (locked ? 'readonly ' : '') + 'value="' + val + '" ' +
                    'oninput="roOnCompanyInput(this)" style="text-align:right;width:80px;"></td>';
            }).join('');
            var ctn = upc > 0 ? Math.ceil(rowApproved / upc) : 0;
            var apprInput = isDraft
                ? '<input type="number" min="0" step="1" class="ro-appr-input pc-input pc-input--qty" ' +
                    'data-card="' + esc(id) + '" data-rk="' + rk + '" data-tier="' + tier + '" data-req="' + rowReq + '" data-upc="' + upc + '" ' +
                    'data-manual="' + (manualAllocationMode ? '1' : '') + '" ' +
                    'value="' + rowApproved + '" oninput="roOnApprovedInput(this)" style="text-align:right;width:90px;">'
                : rowApproved.toLocaleString();
            var bucketTag = ' <span class="ro-bucket-tag">' + esc(r.bucket) + '</span>';
            // Inline validation message (draft only) — appended under the Approved input; no column added.
            var apprCell = isDraft
                ? apprInput + '<div class="ro-row-msg" id="ro-msg-' + rk + '" style="display:none;color:#DC2626;font-size:11px;line-height:1.3;margin-top:2px;text-align:right;"></div>'
                : apprInput;
            return '<tr data-rk="' + rk + '" data-sku="' + esc(r.sku) + '">' +
                '<td>' + dash(r.sku) + bucketTag + '</td>' + coCells +
                '<td class="pc-num">' + rowReq.toLocaleString() + '</td>' +
                '<td class="pc-num">' + apprCell + '</td>' +
                '<td class="pc-num" id="ro-ctn-' + rk + '">' + ctn.toLocaleString() + '</td>' +
            '</tr>';
        }).join('');

        // Schedule prefill from the first line of the tier (fields are written to all tier lines on Save).
        var tierLines = activeLines.filter(function (l) { return tierOf(l.requestBucket) === tier; });
        var s0 = tierLines[0] || {};
        function sched(field, label, val) {
            return '<label class="ro-sched-field"><span>' + label + '</span>' +
                '<input type="date" class="ro-sched" data-card="' + esc(id) + '" data-tier="' + tier + '" data-field="' + field + '" value="' + esc(val || '') + '"' + (isDraft ? '' : ' readonly') + '></label>';
        }
        var actionBtns = isDraft
            ? '<button class="ro-tier-x" title="Cancel this request tier (soft — kept in DB)" onclick="roCancelTier(\'' + esc(id) + '\',\'' + tier + '\')">✕</button>' +
              '<button class="sp-btn ro-tier-note-btn" onclick="roAddNote(\'' + esc(id) + '\',\'' + tier + '\')">+ Add Note</button>'
            : '';

        return '<div class="sp-section ro-tier" data-tier="' + tier + '" data-card="' + esc(id) + '">' +
            '<h4 class="sp-section-title" style="display:flex;justify-content:space-between;align-items:center;">' +
                '<span>' + esc(title) + '</span><span class="ro-tier-actions">' + actionBtns + '</span></h4>' +
            '<div class="procurement-table-wrap"><table class="sp-sku-table procurement-table">' +
                '<thead><tr><th>SKU</th>' + companyHeaders(companies) +
                    '<th class="pc-num">Requested</th><th class="pc-num">Approved</th><th class="pc-num">Carton</th></tr></thead>' +
                '<tbody>' + body + '</tbody></table></div>' +
            '<div class="ro-sched-row">' +
                sched('inspection_date', 'Inspection Date', s0.inspectionDate) +
                sched('expected_ready_date', 'Expected Ready Date', s0.expectedReadyDate) +
                sched('expected_ship_date', 'Expected Ship Date', s0.expectedShipDate) +
            '</div>' +
            '<div class="ro-note-box" id="ro-note-box-' + esc(id) + '-' + tier + '" style="display:none;">' +
                '<textarea class="ro-note-text" placeholder="Add a note for this tier…"></textarea>' +
                '<button class="sp-btn sp-btn-submit" onclick="roSaveTierNote(\'' + esc(id) + '\',\'' + tier + '\')">Save Note</button>' +
            '</div>' +
        '</div>';
    }

    // Map action kinds onto the Weekly Shipping Plan button styles so the cards look identical.
    function btn(onclick, label, kind) {
        var cls = (kind === 'danger') ? 'sp-btn sp-btn-cancel' : (kind === 'ghost' ? 'sp-btn' : 'sp-btn sp-btn-submit');
        return '<button class="' + cls + '" onclick="' + onclick + '">' + label + '</button>';
    }

    function renderActions(o) {
        var id = "'" + o.requestOrderId + "'";
        if (o.status === 'draft') {
            // Save / Submit carry marker classes so live validation can disable them while invalid.
            return '<button class="sp-btn sp-btn-submit ro-save-btn" onclick="roSaveDraft(' + id + ')">Save</button>' +
                   '<button class="sp-btn sp-btn-submit ro-submit-btn" onclick="roSubmit(' + id + ')">Submit</button>' +
                   btn('roCancel(' + id + ')', 'Cancel', 'danger');
        }
        if (o.status === 'pending_approval') {
            return btn('roApprove(' + id + ')', 'Approve', 'primary') +
                   btn('roReject(' + id + ')', 'Reject', 'danger');
        }
        if (o.status === 'approved') {
            return btn('roConvertToPo(' + id + ')', 'Convert to PO', 'primary') +
                   btn('roDone(' + id + ')', 'Done', 'ghost');
        }
        if (o.status === 'converted_to_po') {
            return '<span class="procurement-card__hint">Converted to Purchase Order.</span>' +
                   btn('roDone(' + id + ')', 'Done', 'ghost');
        }
        return '';
    }

    // ---- card toggle (matches Weekly Shipping Plan: .is-expanded drives .sp-card-details) ----
    function toggleCard(id) {
        var card = document.getElementById('ro-card-' + id);
        if (!card) return;
        var b = card.querySelector('.sp-btn-expand');
        card.classList.toggle('is-expanded');
        if (b) b.textContent = card.classList.contains('is-expanded') ? 'Collapse' : 'Expand';
        if (card.classList.contains('is-expanded')) recomputeCard(id);   // build the read-only SKU In Total
    }

    // ---- Approved / company-split editing (decision layer) ----
    // Company inputs for a given row (same card + rk).
    function rowCompanyInputs(card, rk) {
        return Array.prototype.slice.call(card.querySelectorAll('.ro-co-input[data-rk="' + rk + '"]'));
    }
    // Toggle editability of all company inputs of a row (KM / ResUS / ResTW, including phantom cells).
    function setRowCompaniesEditable_(card, rk, editable) {
        rowCompanyInputs(card, rk).forEach(function (ci) {
            ci.readOnly = !editable;
            ci.classList.toggle('ro-co-editable', editable);
        });
    }
    // Edit Approved: enter Manual Allocation Mode the moment Approved != the company allocation total
    // (KM + ResUS + ResTW). Manual mode is STICKY (data-manual on the Approved input) so once entered the
    // user can freely redistribute across all three companies — including a company that had no line (its
    // phantom input becomes editable, default 0, and creates a new request_order_line on Save). No auto-reset.
    function onApprovedInput(input) {
        var card = document.getElementById('ro-card-' + input.getAttribute('data-card'));
        if (!card) return;
        var rk = input.getAttribute('data-rk');
        var approved = parseInt(input.value, 10) || 0;
        var coSum = rowCompanyInputs(card, rk).reduce(function (s, ci) { return s + (parseInt(ci.value, 10) || 0); }, 0);
        if (approved !== coSum) input.setAttribute('data-manual', '1');   // sticky: stays manual once diverged
        setRowCompaniesEditable_(card, rk, input.getAttribute('data-manual') === '1');
        recomputeCard(input.getAttribute('data-card'));
    }
    // Edit a company cell → keep Manual Allocation Mode active (sticky) and recompute + validate live.
    function onCompanyInput(input) {
        var card = document.getElementById('ro-card-' + input.getAttribute('data-card'));
        if (card) {
            var appr = card.querySelector('.ro-appr-input[data-rk="' + input.getAttribute('data-rk') + '"]');
            if (appr) appr.setAttribute('data-manual', '1');
        }
        recomputeCard(input.getAttribute('data-card'));
    }

    // Rebuild the read-only SKU In Total block + header totals from the tier inputs (company sums).
    function recomputeCard(id) {
        var card = document.getElementById('ro-card-' + id);
        if (!card) return;
        var companies = [];
        card.querySelectorAll('.ro-total-section thead th.pc-num').forEach(function (th) {
            var t = th.textContent.trim();
            if (t !== 'Requested' && t !== 'Approved' && t !== 'Carton') companies.push(t === 'Unassigned' ? '—' : t);
        });
        // Per-row carton (from company sums) + per-sku aggregation across tiers.
        var bySku = {};   // sku -> { co:{}, requested, approved, carton }
        card.querySelectorAll('.ro-tier tr[data-rk]').forEach(function (tr) {
            var rk = tr.getAttribute('data-rk'), sku = tr.getAttribute('data-sku');
            var appr = card.querySelector('.ro-appr-input[data-rk="' + rk + '"]');
            var upc = appr ? (parseFloat(appr.getAttribute('data-upc')) || 0) : 0;
            var req = appr ? num(appr.getAttribute('data-req')) : 0;
            var coInputs = rowCompanyInputs(card, rk);
            var coSum = 0, coMap = {};
            coInputs.forEach(function (ci) { var v = parseInt(ci.value, 10) || 0; coSum += v; coMap[ci.getAttribute('data-company')] = v; });
            var carton = upc > 0 ? Math.ceil(coSum / upc) : 0;
            var ctnCell = document.getElementById('ro-ctn-' + rk);
            if (ctnCell) ctnCell.textContent = carton.toLocaleString();
            var agg = bySku[sku] || (bySku[sku] = { co: {}, requested: 0, approved: 0, carton: 0 });
            companies.forEach(function (c) { agg.co[c] = (agg.co[c] || 0) + (coMap[c] || 0); });
            agg.requested += req; agg.approved += coSum; agg.carton += carton;
        });
        // Render SKU In Total tbody + footers.
        var skus = Object.keys(bySku);
        var totAppr = 0, totCtn = 0;
        var rowsHtml = skus.map(function (sku) {
            var a = bySku[sku]; totAppr += a.approved; totCtn += a.carton;
            var coCells = companies.map(function (c) {
                var v = a.co[c] || 0;
                // Clickable only when qty > 0 → opens the read-only Company Allocation popup.
                if (v > 0) {
                    return '<td class="pc-num ro-alloc-clickable" title="View allocation detail" ' +
                        'onclick="roShowAllocation(\'' + esc(id) + '\',\'' + esc(sku).replace(/'/g, "\\'") + '\',\'' + esc(c).replace(/'/g, "\\'") + '\')">' +
                        v.toLocaleString() + '</td>';
                }
                return '<td class="pc-num">' + v.toLocaleString() + '</td>';
            }).join('');
            return '<tr><td>' + dash(sku) + '</td>' + coCells +
                '<td class="pc-num">' + a.requested.toLocaleString() + '</td>' +
                '<td class="pc-num">' + a.approved.toLocaleString() + '</td>' +
                '<td class="pc-num">' + a.carton.toLocaleString() + '</td></tr>';
        }).join('');
        var body = document.getElementById('ro-total-body-' + id);
        if (body) body.innerHTML = rowsHtml || ('<tr><td colspan="' + (companies.length + 4) + '" class="ro-total-hint">No active lines.</td></tr>');
        var set = function (pfx, v) { var el = document.getElementById(pfx + id); if (el) el.textContent = v; };
        set('ro-total-skus-', skus.length);
        set('ro-total-appr-', totAppr.toLocaleString());
        set('ro-total-ctn2-', totCtn.toLocaleString());
        set('ro-total-qty-', totAppr.toLocaleString());     // header Total Qty / Ctn
        set('ro-total-ctn-', totCtn.toLocaleString());
        // Re-run live validation after every recompute (expand + every Approved / company input change).
        validateCard(id);
    }

    // ---- real-time validation (runs on every input + on expand; blocks Save/Submit while invalid) ----
    // Two rules per editable tier row:
    //   (1) Approved qty must equal the company allocation total (KM + ResUS + ResTW …).
    //   (2) Approved qty must be a full-carton multiple of units_per_carton.
    // NOTE (Part C.3): the current design validates the FULL-CARTON rule on the ROW's TOTAL Approved qty
    // only — each individual company allocation is NOT required to be a full-carton multiple. If per-company
    // full cartons are ever required, add a per-company check in validateRowLive_ below.
    function setInvalid_(el, bad) {
        if (!el) return;
        if (bad) { el.style.borderColor = '#DC2626'; el.style.background = '#FEF2F2'; el.classList.add('ro-invalid'); }
        else { el.style.borderColor = ''; el.style.background = ''; el.classList.remove('ro-invalid'); }
    }
    // Validate ONE tier row live; toggles red borders + inline message. Returns detailed messages ([] = ok).
    function validateRowLive_(card, tr) {
        var rk = tr.getAttribute('data-rk'), sku = tr.getAttribute('data-sku');
        var appr = card.querySelector('.ro-appr-input[data-rk="' + rk + '"]');
        if (!appr) return [];   // read-only (non-draft) row — nothing to validate
        var approved = parseInt(appr.value, 10) || 0;
        var upc = parseFloat(appr.getAttribute('data-upc')) || 0;
        var coInputs = rowCompanyInputs(card, rk);
        var coSum = coInputs.reduce(function (s, ci) { return s + (parseInt(ci.value, 10) || 0); }, 0);
        var splitBad = (coSum !== approved);
        var cartonBad = (upc > 0 && (approved % upc !== 0));
        var inlineMsgs = [], detailMsgs = [];
        if (splitBad) { inlineMsgs.push('Approved qty must equal company allocation total.'); detailMsgs.push(sku + ': company split (' + coSum + ') ≠ Approved (' + approved + ')'); }
        if (cartonBad) { inlineMsgs.push('Approved qty must be a full-carton multiple.'); detailMsgs.push(sku + ': Approved ' + approved + ' not a multiple of ' + upc + '/ctn'); }
        setInvalid_(appr, splitBad || cartonBad);
        coInputs.forEach(function (ci) { setInvalid_(ci, splitBad); });
        var msgEl = document.getElementById('ro-msg-' + rk);
        if (msgEl) { msgEl.innerHTML = inlineMsgs.join('<br>'); msgEl.style.display = inlineMsgs.length ? 'block' : 'none'; }
        return detailMsgs;
    }
    // Toggle the Save / Submit buttons of a card.
    function setSaveBlocked_(card, blocked) {
        card.querySelectorAll('.ro-save-btn, .ro-submit-btn').forEach(function (b) {
            b.disabled = blocked;
            b.classList.toggle('is-disabled', blocked);
            b.style.opacity = blocked ? '0.5' : '';
            b.style.cursor = blocked ? 'not-allowed' : '';
            b.title = blocked ? 'Fix the highlighted validation errors first.' : '';
        });
    }
    // Validate the whole card live (all tiers: SKU In Total is read-only; T1 + T2/T3 are editable),
    // apply per-row UI state, block/unblock Save+Submit, and return detailed messages ([] = valid).
    function validateCard(id) {
        var card = document.getElementById('ro-card-' + id);
        if (!card) return [];
        var bad = [];
        card.querySelectorAll('.ro-tier tr[data-rk]').forEach(function (tr) {
            bad = bad.concat(validateRowLive_(card, tr));
        });
        setSaveBlocked_(card, bad.length > 0);
        return bad;
    }

    // ---- actions (all API-ready via KM.DB.*) ----
    // Collect per-line edits: each company cell = one request_order_line's approved_qty; schedule fields
    // (per tier) are applied to every line in that tier; optional tier note likewise.
    // Stable payload key per company cell: existing line → its line id; A2 phantom cell (no line, qty > 0)
    // → a NEW:: key that the backend turns into a new request_order_line (line-per-company). Phantom cells
    // with qty 0 are ignored (no empty line created). Returns null when the cell should be skipped.
    function cellPayloadKey(ci) {
        var lid = ci.getAttribute('data-line-id');
        if (lid) return { key: lid, isNew: false };
        if (ci.getAttribute('data-new-line') === '1') {
            var qty = parseInt(ci.value, 10) || 0;
            if (qty <= 0) return null;   // nothing to allocate → no new line
            return { key: 'NEW::' + ci.getAttribute('data-rk') + '::' + ci.getAttribute('data-company'), isNew: true };
        }
        return null;
    }

    function collectDraftLineEdits(id) {
        var card = document.getElementById('ro-card-' + id);
        if (!card) return [];
        var byLine = {};
        card.querySelectorAll('.ro-co-input').forEach(function (ci) {
            var k = cellPayloadKey(ci); if (!k) return;
            if (k.isNew) {
                byLine[k.key] = byLine[k.key] || {
                    new_line: true,
                    request_order_id: id,
                    sku: ci.getAttribute('data-sku') || '',
                    company: ci.getAttribute('data-company') || '',
                    request_bucket: ci.getAttribute('data-bucket') || '',
                    units_per_carton: parseFloat(ci.getAttribute('data-upc')) || 0
                };
            } else {
                byLine[k.key] = byLine[k.key] || { request_order_line_id: k.key };
            }
            byLine[k.key].approved_qty = parseInt(ci.value, 10) || 0;
        });
        // Schedule per tier → map onto that tier's line ids AND any new lines being created in that tier.
        card.querySelectorAll('.ro-tier').forEach(function (tierEl) {
            var sched = {};
            tierEl.querySelectorAll('.ro-sched').forEach(function (s) { sched[s.getAttribute('data-field')] = String(s.value || '').trim(); });
            if (!Object.keys(sched).length) return;
            tierEl.querySelectorAll('.ro-co-input').forEach(function (ci) {
                var k = cellPayloadKey(ci); if (!k || !byLine[k.key]) return;   // only attach to rows we are sending
                if (sched.inspection_date !== undefined) byLine[k.key].inspection_date = sched.inspection_date;
                if (sched.expected_ready_date !== undefined) byLine[k.key].expected_ready_date = sched.expected_ready_date;
                if (sched.expected_ship_date !== undefined) byLine[k.key].expected_ship_date = sched.expected_ship_date;
            });
        });
        return Object.keys(byLine).map(function (k) { return byLine[k]; });
    }

    function saveDraft(id) {
        var bad = validateCard(id);
        if (bad.length) { alert('Cannot save — fix these first:\n\n' + bad.join('\n')); return; }
        var lines = collectDraftLineEdits(id);
        if (!lines.length) { alert('Nothing to save.'); return; }
        window.KM.DB.updateRequestOrderLineQty({ lines: lines }).then(function (data) {
            // Surface any source-sync warnings (e.g. missing request_order_line_sources row) — non-blocking.
            var warns = (data && data.warnings) || [];
            alert(warns.length ? ('Draft saved with warnings:\n\n' + warns.join('\n')) : 'Draft saved.');
            loadAndRender();
        }).catch(function (e) { alert('Save failed: ' + (e && e.message ? e.message : e)); });
    }

    function transition(id, t, extra) {
        var payload = Object.assign({ request_order_id: id, transition: t, actor: 'operation-system' }, extra || {});
        return window.KM.DB.updateRequestOrderStatus(payload).then(function () { loadAndRender(); });
    }

    function submit(id) {
        var bad = validateCard(id);
        if (bad.length) { alert('Full-carton + company-split required before Submit:\n\n' + bad.join('\n')); return; }
        var lines = collectDraftLineEdits(id);
        var chain = lines.length ? window.KM.DB.updateRequestOrderLineQty({ lines: lines }) : Promise.resolve();
        chain.then(function () { return transition(id, 'submit'); })
            .catch(function (e) { alert('Submit failed: ' + (e && e.message ? e.message : e)); });
    }

    // ---- X (cancel tier) + Add Note ----
    function cancelTier(id, tier) {
        var card = document.getElementById('ro-card-' + id);
        if (!card) return;
        var tierEl = card.querySelector('.ro-tier[data-tier="' + tier + '"]');
        if (!tierEl) return;
        var ids = [];
        tierEl.querySelectorAll('.ro-co-input').forEach(function (ci) { var lid = ci.getAttribute('data-line-id'); if (lid && ids.indexOf(lid) === -1) ids.push(lid); });
        if (!ids.length) { alert('Nothing to cancel in this tier.'); return; }
        if (!confirm('Cancel ' + (tier === 'T2T3' ? 'T2 + T3' : tier) + ' request tier? Lines are marked cancelled (kept in the DB), not deleted.')) return;
        window.KM.DB.cancelRequestOrderTier({ request_order_line_ids: ids, actor: 'operation-system' }).then(function (data) {
            if (data && data.cancelled_requests && data.cancelled_requests.length) alert('Tier cancelled. The whole request had no active lines left and was cancelled.');
            loadAndRender();
        }).catch(function (e) { alert('Cancel tier failed: ' + (e && e.message ? e.message : e)); });
    }
    function addNote(id, tier) {
        var box = document.getElementById('ro-note-box-' + id + '-' + tier);
        if (box) box.style.display = (box.style.display === 'none' ? 'block' : 'none');
    }
    function saveTierNote(id, tier) {
        var box = document.getElementById('ro-note-box-' + id + '-' + tier);
        var card = document.getElementById('ro-card-' + id);
        if (!box || !card) return;
        var ta = box.querySelector('.ro-note-text');
        var note = ta ? String(ta.value || '').trim() : '';
        if (!note) { alert('Enter a note first.'); return; }
        var tierEl = card.querySelector('.ro-tier[data-tier="' + tier + '"]');
        var ids = [];
        tierEl.querySelectorAll('.ro-co-input').forEach(function (ci) { var lid = ci.getAttribute('data-line-id'); if (lid && ids.indexOf(lid) === -1) ids.push(lid); });
        if (!ids.length) { alert('No lines to attach the note to.'); return; }
        var lines = ids.map(function (lid) { return { request_order_line_id: lid, note: note }; });
        window.KM.DB.updateRequestOrderLineQty({ lines: lines }).then(function () {
            alert('Note saved to the tier lines (request_order_lines.note).'); loadAndRender();
        }).catch(function (e) { alert('Save note failed: ' + (e && e.message ? e.message : e)); });
    }

    // ---- Company Allocation popup (read-only) ----
    var COMPANY_LABEL = function (c) { return (c === '—' || !c) ? 'Unassigned' : c; };

    function closeAllocation() {
        var m = document.getElementById('ro-alloc-modal'); if (m) m.remove();
        var o = document.getElementById('ro-alloc-overlay'); if (o) o.remove();
        document.removeEventListener('keydown', allocEscHandler, true);
    }
    function allocEscHandler(e) { if (e.key === 'Escape') closeAllocation(); }

    // Build allocation rows for (card, sku, company): prefer request_order_line_sources, else fall back
    // to this card's request_order_lines grouped by bucket (site-level source pending).
    function allocationRows(id, sku, company) {
        var cardLines = (roLinesCache[id] || []).filter(function (l) {
            return l.lineStatus !== 'cancelled' && l.sku === sku && (String(l.company || '').trim() || '—') === company;
        });
        var lineIds = {};
        cardLines.forEach(function (l) { if (l.requestOrderLineId) lineIds[l.requestOrderLineId] = 1; });

        var sources = (window.KM.DB.getRequestOrderLineSources && window.KM.DB.getRequestOrderLineSources()) || [];
        var matched = sources.filter(function (s) {
            if (s.requestOrderLineId && lineIds[s.requestOrderLineId]) return true;
            return (s.requestOrderId === id && s.sku === sku && (String(s.company || '').trim() || '—') === company);
        });

        if (matched.length) {
            return { pending: false, rows: matched.map(function (s) {
                return { company: s.company || company, sku: s.sku || sku, tier: s.tierType, month: s.sourceMonth,
                    country: s.country, marketplace: s.marketplace, requested: s.requestedQty, approved: s.approvedQty,
                    shortage: s.shortageQty, note: s.note };
            }) };
        }
        // Fallback — request_order_lines grouped by bucket (no site detail available).
        return { pending: true, rows: cardLines.map(function (l) {
            return { company: l.company || company, sku: l.sku, tier: l.requestBucket, month: l.requestMonth,
                country: '', marketplace: '', requested: l.requestedQty, approved: l.approvedQty,
                shortage: (l.shortageQty === '' || l.shortageQty == null) ? '' : l.shortageQty, note: l.note };
        }) };
    }

    function showAllocation(id, sku, company) {
        closeAllocation();   // never stack popups
        var data = allocationRows(id, sku, company);
        if (!data.rows.length) {
            data = { pending: true, rows: [], empty: true };
        }
        function cell(v) { return (v === '' || v == null) ? '--' : esc(String(v)); }
        function numCell(v) { return (v === '' || v == null) ? '--' : num(v).toLocaleString(); }
        var bodyRows = data.rows.map(function (r) {
            return '<tr>' +
                '<td>' + esc(COMPANY_LABEL(r.company)) + '</td>' +
                '<td>' + cell(r.sku) + '</td>' +
                '<td>' + cell(r.tier) + '</td>' +
                '<td>' + cell(r.month) + '</td>' +
                '<td>' + cell(r.country) + '</td>' +
                '<td>' + cell(r.marketplace) + '</td>' +
                '<td class="pc-num">' + numCell(r.requested) + '</td>' +
                '<td class="pc-num">' + numCell(r.approved) + '</td>' +
                '<td class="pc-num">' + numCell(r.shortage) + '</td>' +
                '<td>' + cell(r.note) + '</td>' +
            '</tr>';
        }).join('');
        var pendingBanner = data.empty
            ? '<div class="ro-alloc-pending">No allocation detail.</div>'
            : (data.pending ? '<div class="ro-alloc-pending">Site-level source pending — showing request line summary (request_order_line_sources not populated).</div>' : '');
        var table = data.rows.length
            ? '<div class="procurement-table-wrap"><table class="sp-sku-table procurement-table">' +
                '<thead><tr><th>Company</th><th>SKU</th><th>Tier</th><th>Month</th><th>Country</th><th>Marketplace</th>' +
                '<th class="pc-num">Requested</th><th class="pc-num">Approved</th><th class="pc-num">Shortage</th><th>Note</th></tr></thead>' +
                '<tbody>' + bodyRows + '</tbody></table></div>'
            : '';

        var overlay = document.createElement('div');
        overlay.id = 'ro-alloc-overlay';
        overlay.className = 'pc-modal-overlay';
        overlay.onclick = closeAllocation;
        document.body.appendChild(overlay);

        var modal = document.createElement('div');
        modal.id = 'ro-alloc-modal';
        modal.className = 'pc-modal ro-alloc-modal';
        modal.innerHTML =
            '<div class="pc-modal__head"><h3>Company Allocation Detail</h3>' +
                '<button class="pc-modal__close" onclick="roCloseAllocation()">×</button></div>' +
            '<div class="pc-modal__body">' +
                '<div class="ro-alloc-sub">' + esc(COMPANY_LABEL(company)) + ' · ' + esc(sku) + '</div>' +
                pendingBanner + table +
                '<div class="ro-alloc-foot">Read-only — source of truth: <code>request_order_line_sources</code>.</div>' +
            '</div>';
        document.body.appendChild(modal);
        document.addEventListener('keydown', allocEscHandler, true);
    }

    function cancel(id) {
        if (!confirm('Cancel this request order? It will be hidden but kept in the database.')) return;
        transition(id, 'cancel').catch(function (e) { alert('Cancel failed: ' + (e && e.message ? e.message : e)); });
    }

    function approve(id) {
        if (!confirm('Approve this request order?')) return;
        transition(id, 'approve').catch(function (e) { alert('Approve failed: ' + (e && e.message ? e.message : e)); });
    }

    function reject(id) {
        var reason = prompt('Reject this request order.\n\nEnter a reason (required):');
        if (reason == null) return;
        reason = String(reason).trim();
        if (!reason) { alert('A reason is required to reject.'); return; }
        transition(id, 'reject', { rejected_reason: reason })
            .catch(function (e) { alert('Reject failed: ' + (e && e.message ? e.message : e)); });
    }

    function convertToPo(id) {
        if (!confirm('Convert this approved request into Purchase Order(s)?\n\nActive T1 → one PO; active T2+T3 → one combined PO. Cancelled lines are excluded.')) return;
        window.KM.DB.createPurchaseOrderFromRequest({ request_order_id: id, actor: 'operation-system' })
            .then(function (data) {
                // PO v2 may create up to two POs (T1 and T2_T3). Support the array; fall back to the single-PO shape.
                var pos = (data && data.purchase_orders) || [];
                var msg;
                if (pos.length) {
                    msg = pos.length + ' Purchase Order' + (pos.length > 1 ? 's' : '') + ' created:\n\n' +
                        pos.map(function (p) { return '• ' + (p.request_bucket || '') + ': ' + (p.po_no || p.purchase_order_no || p.purchase_order_id); }).join('\n');
                } else {
                    msg = 'Purchase Order created: ' + ((data && data.purchase_order_no) || 'OK');
                }
                alert(msg + '\n\nOpen Purchase Order Workspace to continue.');
                loadAndRender();
            })
            .catch(function (e) { alert('Convert failed: ' + (e && e.message ? e.message : e)); });
    }

    function done(id) {
        if (!confirm('Mark this request as Done? It will be hidden from the default view (kept in the database).')) return;
        transition(id, 'done').catch(function (e) { alert('Done failed: ' + (e && e.message ? e.message : e)); });
    }

    // ---- manual create modal ----
    // (The "From Shortage (soon)" placeholder button + its createFromShortage handler were removed
    //  2026-07-28 — UI entry only; the future Shortage runtime / DB fields / calculations are untouched.)

    function createManualDraft() {
        if (!useDb()) { alert('Connect the Operation DB (Google Sheet) to create Request Orders.'); return; }
        openCreateModal();
    }

    // ==== New Manual Draft — front-end data-source contracts (no new DB tables, no mock data) ========
    // Company / Supplier / Factory / SKU are all Dropdowns sourced from EXISTING providers; the locked
    // commercial fields are resolved (never fabricated). See the Completion Report for the Spec Gaps.
    function _roActiveWarehouses() { return (window.KM && window.KM.DB && window.KM.DB.getWarehouses) ? (window.KM.DB.getWarehouses() || []) : []; }
    function _roSkuMaster() { return (window.KM && window.KM.DB && window.KM.DB.getSkuDetails) ? (window.KM.DB.getSkuDetails() || []) : []; }
    function _roSupplierPriceList() { return (window.KM && window.KM.DB && window.KM.DB.getSupplierPriceList) ? (window.KM.DB.getSupplierPriceList() || []) : []; }
    function _roEq(a, b) { return String(a == null ? '' : a).trim().toLowerCase() === String(b == null ? '' : b).trim().toLowerCase(); }
    function _roActiveFlag(v) { return v !== false; }   // tri-state: only an explicit false is inactive

    // Company options = the system's existing canonical company list (no free text, no hardcoded sample-only).
    function getCompanyOptions() { return RO_CANON_COMPANIES.slice(); }

    // Supplier options — the ONLY trustworthy supplier provider today is the supplier_price_list master
    // (getSupplierPriceList: a maintained table with supplier identity + is_active, NOT PO-history dedup,
    // NOT hardcoded). It has no company column, so `company` cannot narrow it — all ACTIVE suppliers are
    // returned. Empty master → [] (Phase-1: Supplier is optional; an empty master never blocks Factory/SKU/Create).
    function getSupplierOptions(company) {
        var seen = {}, out = [];
        _roSupplierPriceList().forEach(function (r) {
            if (!_roActiveFlag(r.isActive)) return;
            var name = String(r.supplierName == null ? '' : r.supplierName).trim();
            if (!name) return;
            var key = name.toLowerCase();
            if (seen[key]) return; seen[key] = 1;
            out.push({ id: String(r.supplierId == null ? '' : r.supplierId).trim(), name: name });
        });
        out.sort(function (a, b) { return a.name.localeCompare(b.name); });
        return out;
    }

    // Factory options — canonical source is `warehouses` (is_factory_warehouse=true, is_active). Option
    // VALUE = real warehouse_id; label shows factory code / warehouse name. Filtered by the selected company
    // (a factory may sit in CN/TW but belongs to a company). No supplier→factory link exists in the data, so
    // supplier cannot narrow factories (Spec Gap — reported).
    function getFactoryOptions(company) {
        var out = [];
        _roActiveWarehouses().forEach(function (w) {
            if (!w || !w.warehouseId) return;
            if (w.isFactoryWarehouse !== true) return;
            if (!_roActiveFlag(w.isActive)) return;
            if (company && w.company && !_roEq(w.company, company)) return;
            out.push({ id: String(w.warehouseId), code: w.warehouseCode || '', name: w.warehouseName || '' });
        });
        out.sort(function (a, b) { return String(a.code || a.name || a.id).localeCompare(String(b.code || b.name || b.id)); });
        return out;
    }

    // D-RO-P1-4: no frozen Request-Order SKU lifecycle restriction exists in the spec → treat all sku_details
    // records as eligible EXCEPT clearly terminal/inactive ones. 'Running in the Market' / 'Upcoming SKU' are eligible.
    var RO_TERMINAL_LIFECYCLE = { 'closure': 1, 'discontinued': 1, 'inactive': 1, 'invalid': 1, 'deleted': 1 };
    function _roSkuTerminal(skuRec) {
        var lc = String(skuRec && skuRec.lifecycle != null ? skuRec.lifecycle : '').trim().toLowerCase();
        return RO_TERMINAL_LIFECYCLE[lc] === 1;
    }

    // Resolve one SKU line for Phase-1 Manual Request Order (D-RO-P1-1/3). SKU authority = canonical sku_details;
    // units_per_carton = sku_details. Supplier is OPTIONAL — supplier_sku / unit_cost / currency are enriched from
    // supplier_price_list ONLY when a supplier + active mapping exist, and stay BLANK/null (NEVER a fabricated 0)
    // otherwise. A line is 'ok' when the SKU is an active canonical record with a usable units_per_carton — supplier
    // absence never blocks. status: 'no-sku' | 'sku-not-found' | 'sku-inactive' | 'no-upc' | 'ok'.
    function _roResolveCommercial(company, supplierName, factoryId, sku) {
        if (!sku) return { status: 'no-sku' };
        var skuRec = _roSkuMaster().filter(function (s) { return _roEq(s.sku, sku); })[0];
        if (!skuRec) return { status: 'sku-not-found' };            // SKU not in canonical sku_details
        if (_roSkuTerminal(skuRec)) return { status: 'sku-inactive' };
        var upc = parseInt(skuRec.unitsPerCarton, 10);
        if (!(upc > 0)) return { status: 'no-upc', unitsPerCarton: null, supplierSku: null, unitCost: null, currency: null };
        // Optional supplier enrichment — never required, never fabricated when absent.
        var supplierSku = null, unitCost = null, currency = null;
        if (supplierName) {
            var priceRows = _roSupplierPriceList().filter(function (r) {
                return _roActiveFlag(r.isActive) && _roEq(r.supplierName, supplierName) && _roEq(r.sku, sku);
            });
            priceRows.sort(function (a, b) { return String(b.effectiveFrom || '').localeCompare(String(a.effectiveFrom || '')); });
            var price = priceRows[0];
            if (price) {
                supplierSku = (price.supplierSku != null && String(price.supplierSku).trim() !== '') ? String(price.supplierSku).trim() : null;
                unitCost = (price.unitCost != null && price.unitCost !== '' && !isNaN(parseFloat(price.unitCost))) ? parseFloat(price.unitCost) : null;
                currency = (price.currency) ? String(price.currency).trim() : null;
            }
        }
        return { status: 'ok', unitsPerCarton: upc, supplierSku: supplierSku, unitCost: unitCost, currency: currency };
    }
    function _roLineStatusText(status) {
        if (status === 'no-sku') return 'Select a SKU';
        if (status === 'sku-not-found') return 'SKU not found in SKU Details';
        if (status === 'sku-inactive') return 'SKU is not active (terminal lifecycle)';
        if (status === 'no-upc') return 'Units/Carton not configured for this SKU';
        return 'Not available';
    }
    function _roCreateVal(id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }

    // ---- select population ----
    function _roFillCompanySelect() {
        var sel = document.getElementById('ro-c-company');
        if (!sel) return;
        sel.innerHTML = '<option value="">Select company</option>' +
            getCompanyOptions().map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('');
    }
    // Supplier is OPTIONAL in Phase 1 (D-RO-P1-2) — it never gates anything. supplier_price_list has no company
    // column, so options are company-independent. Empty master → disabled placeholder, but Factory/SKU/Create stay usable.
    function _roFillSupplierSelect() {
        var sel = document.getElementById('ro-c-supplier');
        if (!sel) return;
        var opts = getSupplierOptions('');
        if (!opts.length) { sel.innerHTML = '<option value="">Not configured — optional in Phase 1</option>'; sel.disabled = true; return; }
        sel.innerHTML = '<option value="">— None (optional) —</option>' + opts.map(function (o) {
            return '<option value="' + esc(o.name) + '" data-id="' + esc(o.id) + '">' + esc(o.name) + '</option>';
        }).join('');
        sel.disabled = false;
    }
    // Factory ID (D-RO-P1-1) — the required production authority. Enabled as soon as a Company is chosen; NEVER
    // gated by Supplier. Options come from the canonical factory-warehouse authority; option value = warehouse_id.
    function _roFillFactorySelect(company) {
        var sel = document.getElementById('ro-c-factory');
        if (!sel) return;
        if (!company) { sel.innerHTML = '<option value="">Select company first</option>'; sel.disabled = true; return; }
        var opts = getFactoryOptions(company);
        if (!opts.length) { sel.innerHTML = '<option value="">No factory warehouse for this company</option>'; sel.disabled = true; return; }
        sel.innerHTML = '<option value="">Select factory</option>' + opts.map(function (o) {
            var label = o.code ? (o.code + (o.name ? ' — ' + o.name : '')) : (o.name || o.id);
            return '<option value="' + esc(o.id) + '" data-code="' + esc(o.code) + '">' + esc(label) + '</option>';
        }).join('');
        sel.disabled = false;
    }
    function _roBuildSkuDatalistHtml() {
        var seen = {}, opts = '';
        _roSkuMaster().forEach(function (s) {
            var sku = String(s.sku == null ? '' : s.sku).trim();
            if (!sku || seen[sku]) return;
            if (_roSkuTerminal(s)) return;               // D-RO-P1-4: hide only terminal/inactive SKUs
            seen[sku] = 1;
            opts += '<option value="' + esc(sku) + '">' + esc(sku + (s.productName ? ' — ' + s.productName : '')) + '</option>';
        });
        return opts;
    }

    // ---- cascading + per-line resolution ----
    function onCreateCompanyChange() {
        var company = _roCreateVal('ro-c-company');
        _roFillFactorySelect(company);            // Company → Factory options (NO supplier dependency)
        _roResolveAllLines();
        _roUpdateCreateGate();
    }
    function onCreateSupplierChange() {
        // Supplier is optional: choosing/clearing it only re-enriches supplier_sku / unit_cost — never gates Factory/SKU.
        _roResolveAllLines();
        _roUpdateCreateGate();
    }
    function onCreateFactoryChange() {
        _roResolveAllLines();                     // Factory → re-resolve every SKU line
        _roUpdateCreateGate();
    }
    function _roResolveLineRow(tr) {
        if (!tr) return;
        var company = _roCreateVal('ro-c-company');
        var supplier = _roCreateVal('ro-c-supplier');
        var factory = _roCreateVal('ro-c-factory');
        var skuEl = tr.querySelector('[data-f="sku"]');
        var sku = skuEl ? String(skuEl.value || '').trim() : '';
        var res = _roResolveCommercial(company, supplier, factory, sku);
        function set(f, v) { var el = tr.querySelector('[data-f="' + f + '"]'); if (el) el.value = (v == null ? '' : v); }
        set('units_per_carton', res.unitsPerCarton != null ? res.unitsPerCarton : '');
        set('supplier_sku', res.supplierSku != null ? res.supplierSku : '');
        set('unit_cost', res.unitCost != null ? res.unitCost : '');
        set('currency', res.currency != null ? res.currency : '');
        // F1-S3-UI: inline helper text ONLY for a real actionable error. A valid (or empty) row shows NO text —
        // optional Phase-1 values (supplier / supplier_sku / unit_cost / currency) are intentionally blank and
        // must NEVER surface as info (this removes the old "Currency null" line that inflated the SKU column and
        // misaligned the row). The empty .ro-c-line-msg collapses to zero height (CSS :empty), so the five inputs
        // stay on one baseline; an error grows the row DOWNWARD (cells are vertical-align:top).
        var msg = tr.querySelector('.ro-c-line-msg');
        var isError = !!sku && res.status !== 'ok';
        if (msg) {
            if (isError) { msg.textContent = _roLineStatusText(res.status); msg.className = 'ro-c-line-msg ro-c-line-msg--error'; }
            else { msg.textContent = ''; msg.className = 'ro-c-line-msg'; }
        }
        tr.classList.toggle('is-error', isError);
        if (skuEl) { if (isError) skuEl.setAttribute('aria-invalid', 'true'); else skuEl.removeAttribute('aria-invalid'); }
    }
    function _roResolveAllLines() {
        document.querySelectorAll('#ro-c-lines tbody tr').forEach(function (tr) { _roResolveLineRow(tr); });
    }
    function onCreateLineSku(input) {
        var tr = input && input.closest ? input.closest('tr') : null;
        _roResolveLineRow(tr);
        _roUpdateCreateGate();
    }
    // Enable Create Draft when Company + Factory (the required production authority) are chosen and every SKU line
    // resolves cleanly (canonical active sku_details + qty>0). Supplier is NOT required (D-RO-P1-2). Full validation
    // (incl. single-currency across lines that carry a currency) still runs on submit.
    function _roUpdateCreateGate() {
        var btn = document.getElementById('ro-c-create-btn');
        if (!btn) return;
        var company = _roCreateVal('ro-c-company');
        var supplier = _roCreateVal('ro-c-supplier');   // optional
        var factory = _roCreateVal('ro-c-factory');
        var ok = !!(company && factory);
        if (ok) {
            var anyValid = false, anyError = false;
            document.querySelectorAll('#ro-c-lines tbody tr').forEach(function (tr) {
                var skuEl = tr.querySelector('[data-f="sku"]');
                var sku = skuEl ? String(skuEl.value || '').trim() : '';
                if (!sku) return;
                var res = _roResolveCommercial(company, supplier, factory, sku);
                var qtyEl = tr.querySelector('[data-f="requested_qty"]');
                var qty = qtyEl ? parseInt(qtyEl.value, 10) : 0;
                if (res.status === 'ok' && qty > 0) anyValid = true; else anyError = true;
            });
            ok = anyValid && !anyError;
        }
        btn.disabled = !ok;
    }

    function openCreateModal() {
        var existing = document.getElementById('ro-create-modal');
        if (existing) existing.remove();
        var overlay = document.createElement('div');
        overlay.id = 'ro-create-modal';
        overlay.className = 'pc-modal-overlay';
        overlay.innerHTML =
            '<div class="pc-modal">' +
                '<div class="pc-modal__head"><h3>New Request Order Draft</h3>' +
                    '<button class="pc-modal__close" onclick="roCloseCreateModal()">×</button></div>' +
                '<div class="pc-modal__body">' +
                    '<div class="pc-modal__grid">' +
                        '<label>Company<select id="ro-c-company" class="pc-input" onchange="roOnCreateCompanyChange()"></select></label>' +
                        '<label>Factory ID<select id="ro-c-factory" class="pc-input" onchange="roOnCreateFactoryChange()" disabled></select></label>' +
                        '<label>Supplier (Optional — Phase 2)<select id="ro-c-supplier" class="pc-input" onchange="roOnCreateSupplierChange()"></select></label>' +
                    '</div>' +
                    '<div class="pc-modal__msg" id="ro-c-msg"></div>' +
                    '<h4 class="pc-modal__subtitle">SKU Lines</h4>' +
                    '<div class="procurement-table-wrap"><table class="procurement-table" id="ro-c-lines">' +
                        '<thead><tr><th>SKU</th><th>Requested Qty</th><th>Units/Ctn</th><th>Supplier SKU</th><th>Unit Cost</th><th>Need Reason</th><th></th></tr></thead>' +
                        '<tbody></tbody>' +
                    '</table></div>' +
                    '<datalist id="ro-c-sku-list">' + _roBuildSkuDatalistHtml() + '</datalist>' +
                    '<button class="pc-btn pc-btn--ghost" onclick="roAddCreateLine()">+ Add SKU Line</button>' +
                '</div>' +
                '<div class="pc-modal__foot">' +
                    '<button class="pc-btn pc-btn--default" onclick="roCloseCreateModal()">Cancel</button>' +
                    '<button class="pc-btn pc-btn--primary" id="ro-c-create-btn" onclick="roSubmitCreateModal()" disabled>Create Draft</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlay);
        _roFillCompanySelect();
        _roFillSupplierSelect();                  // optional; company-independent
        _roFillFactorySelect('');                 // enabled once a Company is chosen (no supplier gate)
        addCreateLine();
        _roUpdateCreateGate();
    }

    function addCreateLine() {
        var tbody = document.querySelector('#ro-c-lines tbody');
        if (!tbody) return;
        var tr = document.createElement('tr');
        // SKU = searchable (datalist, sourced from sku_details, validated on resolve). Units/Ctn / Supplier
        // SKU / Unit Cost are LOCKED (readonly + tabindex -1; auto-resolved, never user-typed). Currency is
        // a hidden per-line canonical value (no input box). Requested Qty + Need Reason stay editable.
        tr.innerHTML =
            '<td><input class="pc-input" list="ro-c-sku-list" data-f="sku" placeholder="Search SKU…" autocomplete="off" oninput="roOnCreateLineSku(this)" onchange="roOnCreateLineSku(this)">' +
                '<input type="hidden" data-f="currency"><div class="ro-c-line-msg"></div></td>' +
            '<td><input class="pc-input pc-input--qty" type="number" min="1" step="1" data-f="requested_qty" oninput="roUpdateCreateGate()"></td>' +
            '<td><input class="pc-input pc-input--locked" type="number" data-f="units_per_carton" readonly tabindex="-1" placeholder="—"></td>' +
            '<td><input class="pc-input pc-input--locked" data-f="supplier_sku" readonly tabindex="-1" placeholder="—"></td>' +
            '<td><input class="pc-input pc-input--locked" type="number" data-f="unit_cost" readonly tabindex="-1" placeholder="—"></td>' +
            '<td><input class="pc-input" data-f="need_reason"></td>' +
            '<td><button class="pc-btn pc-btn--rm" onclick="roRemoveCreateLine(this)">×</button></td>';
        tbody.appendChild(tr);
        // F1-S3-UI a11y: give the per-line error slot a stable id and link the SKU input to it (aria-describedby).
        // aria-describedby to an empty (collapsed) slot announces nothing — only a real error is read out.
        var _m = tr.querySelector('.ro-c-line-msg'), _s = tr.querySelector('[data-f="sku"]');
        if (_m && _s) { tbody._roMsgSeq = (tbody._roMsgSeq || 0) + 1; _m.id = 'ro-c-line-msg-' + tbody._roMsgSeq; _s.setAttribute('aria-describedby', _m.id); }
        _roResolveLineRow(tr);
        _roUpdateCreateGate();
    }
    function removeCreateLine(btn) {
        var tr = btn && btn.closest ? btn.closest('tr') : null;
        if (tr) tr.remove();
        _roUpdateCreateGate();
    }

    function closeCreateModal() {
        var m = document.getElementById('ro-create-modal');
        if (m) m.remove();
    }

    function submitCreateModal() {
        var msgEl = document.getElementById('ro-c-msg');
        function fail(m) {
            if (msgEl) { msgEl.textContent = m; msgEl.className = 'pc-modal__msg pc-modal__msg--error'; }
            else alert(m);
        }
        var company = _roCreateVal('ro-c-company');
        var supplierSel = document.getElementById('ro-c-supplier');
        var supplierName = _roCreateVal('ro-c-supplier');   // the option value IS the supplier name
        var supplierId = (supplierSel && supplierSel.selectedIndex >= 0 && supplierSel.options[supplierSel.selectedIndex]) ? (supplierSel.options[supplierSel.selectedIndex].getAttribute('data-id') || '') : '';
        var factorySel = document.getElementById('ro-c-factory');
        var warehouseId = _roCreateVal('ro-c-factory');     // Factory option value = canonical warehouse_id
        var factoryCode = (factorySel && factorySel.selectedIndex >= 0 && factorySel.options[factorySel.selectedIndex]) ? (factorySel.options[factorySel.selectedIndex].getAttribute('data-code') || '') : '';

        if (!company) return fail('Select a Company.');
        if (!warehouseId) return fail('Select a Factory.');   // Supplier is optional (D-RO-P1-2) — not required.

        var rows = Array.prototype.slice.call(document.querySelectorAll('#ro-c-lines tbody tr'));
        var lines = [], currencies = {}, sawSku = false;
        for (var i = 0; i < rows.length; i++) {
            var tr = rows[i];
            var skuEl = tr.querySelector('[data-f="sku"]');
            var sku = skuEl ? String(skuEl.value || '').trim() : '';
            if (!sku) continue;
            sawSku = true;
            var res = _roResolveCommercial(company, supplierName, warehouseId, sku);
            if (res.status !== 'ok') return fail('Line "' + sku + '": ' + _roLineStatusText(res.status) + ' — cannot create draft.');
            var qtyEl = tr.querySelector('[data-f="requested_qty"]');
            var qty = qtyEl ? parseInt(qtyEl.value, 10) : 0;
            if (!(qty > 0)) return fail('Line "' + sku + '": Requested Qty must be greater than 0.');
            var reasonEl = tr.querySelector('[data-f="need_reason"]');
            if (res.currency) currencies[res.currency] = 1;   // only lines with a (supplier-sourced) currency count
            lines.push({
                sku: sku,
                requested_qty: qty,
                units_per_carton: res.unitsPerCarton,
                supplier_sku: res.supplierSku,    // null when no supplier mapping — never a fabricated value
                unit_cost: res.unitCost,          // null when no supplier mapping — never a fake 0
                currency: res.currency,           // null when no supplier mapping
                need_reason: reasonEl ? String(reasonEl.value || '').trim() : ''
            });
        }
        if (!sawSku || !lines.length) return fail('Add at least one SKU line (with a SKU).');
        var curKeys = Object.keys(currencies);
        if (curKeys.length > 1) return fail('Lines resolve to conflicting currencies (' + curKeys.join(', ') + '). All lines in a draft must share one currency.');
        var currency = curKeys[0] || '';   // may be blank in Phase 1 (no supplier → no unit cost/currency)

        // Warehouse Name is display-only; warehouse_id (canonical) is auto-carried from the Factory choice.
        // factory_id keeps the factory's own readable code (not merged with warehouse_id). supplier_name is
        // transported for compatibility while supplier_id (when known) carries the canonical identity.
        var payload = {
            company: company,
            supplier_id: supplierId || '',
            supplier_name: supplierName,
            factory_id: factoryCode || warehouseId,
            warehouse_id: warehouseId,
            currency: currency,
            source: 'manual',
            created_by: 'operation-system',
            lines: lines
        };
        var btn = document.getElementById('ro-c-create-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }
        window.KM.DB.createRequestOrderDraft(payload).then(function (data) {
            closeCreateModal();
            alert('Request Order Draft created: ' + ((data && data.request_order_no) || 'OK'));
            loadAndRender();
        }).catch(function (e) {
            if (btn) { btn.disabled = false; btn.textContent = 'Create Draft'; }
            fail('Create failed: ' + (e && e.message ? e.message : e));
        });
    }

    // ---- markup ensure + lifecycle ----
    function ensureMarkup() {
        if (document.getElementById('request-order-draft-section')) return Promise.resolve(true);
        if (window.KM && window.KM.partialLoader && window.KM.partialLoader.loadPartial) {
            return window.KM.partialLoader
                .loadPartial('request-order-draft', 'assets/html/pages/request-order-draft.html', '#request-order-draft-mount')
                .then(function () { return true; })
                .catch(function (err) { console.warn('[RequestOrderDraft] partial load failed:', err); return false; });
        }
        return Promise.resolve(false);
    }

    // Expose the action handlers globally (inline onclick).
    window.roToggleCard = toggleCard;
    window.roOnApprovedInput = onApprovedInput;
    window.roOnCompanyInput = onCompanyInput;
    window.roCancelTier = cancelTier;
    window.roAddNote = addNote;
    window.roSaveTierNote = saveTierNote;
    window.roShowAllocation = showAllocation;
    window.roCloseAllocation = closeAllocation;
    window.roSaveDraft = saveDraft;
    window.roSubmit = submit;
    window.roCancel = cancel;
    window.roApprove = approve;
    window.roReject = reject;
    window.roConvertToPo = convertToPo;
    window.roDone = done;
    window.roCreateManualDraft = createManualDraft;
    window.roAddCreateLine = addCreateLine;
    window.roRemoveCreateLine = removeCreateLine;
    window.roCloseCreateModal = closeCreateModal;
    window.roSubmitCreateModal = submitCreateModal;
    window.roOnCreateCompanyChange = onCreateCompanyChange;
    window.roOnCreateSupplierChange = onCreateSupplierChange;
    window.roOnCreateFactoryChange = onCreateFactoryChange;
    window.roOnCreateLineSku = onCreateLineSku;
    window.roUpdateCreateGate = _roUpdateCreateGate;
    window.initRequestOrderDraftPage = loadAndRender;

    if (window.KM && window.KM.lifecycle) {
        KM.lifecycle.register('request-order-draft-section', {
            mount: function () {
                ensureMarkup().then(function () {
                    var sec = document.getElementById('request-order-draft-section');
                    if (sec) sec.classList.add('active');
                    loadAndRender();
                });
            },
            unmount: function () { closeCreateModal(); }
        });
    }
})();
