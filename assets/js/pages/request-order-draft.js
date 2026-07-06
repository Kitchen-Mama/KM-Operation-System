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
        var companies = model.companies;

        // Company summary from the real per-line company column (KM / ResUS / ResTW …).
        var companyList = companies.filter(function (c) { return c !== '—'; });
        var companyDisp = companyList.length ? esc(companyList.join(' / ')) : dash(o.company);
        var seriesDisp = roDistinct(active.map(function (l) { return l.series; }));
        var seriesHtml = seriesDisp.length ? esc(seriesDisp.join(', ')) : '--';
        var totalQty = active.reduce(function (s, l) { return s + num(l.approvedQty); }, 0);
        var totalCartons = active.reduce(function (s, l) { return s + num(l.cartonQty); }, 0);

        var summary =
            roSummary('Status', '<span class="plan-status-badge plan-status-badge--' + esc(o.status) + '">' + esc(statusLabel) + (num(o.requestOrderVersion) > 1 ? ' (v' + num(o.requestOrderVersion) + ')' : '') + '</span>') +
            roSummary('Request No', '<strong>' + esc(o.requestOrderNo || id) + '</strong>') +
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
                    renderTotalBlock(id, companies) +
                    renderTierBlock(o, 'T1', 'T1 Request', t1Rows, companies, isDraft, active) +
                    renderTierBlock(o, 'T2T3', 'T2 + T3 Request', t23Rows, companies, isDraft, active) +
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
            // Row total from the per-company approved values; lock the split when it still equals Requested.
            var rowApproved = companies.reduce(function (s, co) { return s + (r.cells[co] ? num(r.cells[co].approved) : 0); }, 0);
            var locked = !isDraft || (rowApproved === rowReq);
            var coCells = companies.map(function (co) {
                var cell = r.cells[co];
                if (!cell) return '<td class="pc-num">--</td>';
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
    // Edit Approved: lock company split when Approved == Requested (reset to requested split); unlock otherwise.
    function onApprovedInput(input) {
        var card = document.getElementById('ro-card-' + input.getAttribute('data-card'));
        if (!card) return;
        var rk = input.getAttribute('data-rk');
        var req = num(input.getAttribute('data-req'));
        var approved = parseInt(input.value, 10) || 0;
        var coInputs = rowCompanyInputs(card, rk);
        if (approved === req) {
            coInputs.forEach(function (ci) { ci.value = num(ci.getAttribute('data-req')); ci.readOnly = true; ci.classList.remove('ro-co-editable'); });
        } else {
            coInputs.forEach(function (ci) { ci.readOnly = false; ci.classList.add('ro-co-editable'); });
        }
        recomputeCard(input.getAttribute('data-card'));
    }
    // Edit a company cell → recompute (Approved input stays the target; validated on Save/Submit).
    function onCompanyInput(input) { recomputeCard(input.getAttribute('data-card')); }

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
    function collectDraftLineEdits(id) {
        var card = document.getElementById('ro-card-' + id);
        if (!card) return [];
        var byLine = {};
        card.querySelectorAll('.ro-co-input').forEach(function (ci) {
            var lid = ci.getAttribute('data-line-id'); if (!lid) return;
            byLine[lid] = byLine[lid] || { request_order_line_id: lid };
            byLine[lid].approved_qty = parseInt(ci.value, 10) || 0;
        });
        // Schedule per tier → map onto that tier's line ids.
        card.querySelectorAll('.ro-tier').forEach(function (tierEl) {
            var sched = {};
            tierEl.querySelectorAll('.ro-sched').forEach(function (s) { sched[s.getAttribute('data-field')] = String(s.value || '').trim(); });
            if (!Object.keys(sched).length) return;
            tierEl.querySelectorAll('.ro-co-input').forEach(function (ci) {
                var lid = ci.getAttribute('data-line-id'); if (!lid) return;
                byLine[lid] = byLine[lid] || { request_order_line_id: lid };
                if (sched.inspection_date !== undefined) byLine[lid].inspection_date = sched.inspection_date;
                if (sched.expected_ready_date !== undefined) byLine[lid].expected_ready_date = sched.expected_ready_date;
                if (sched.expected_ship_date !== undefined) byLine[lid].expected_ship_date = sched.expected_ship_date;
            });
        });
        return Object.keys(byLine).map(function (k) { return byLine[k]; });
    }

    function saveDraft(id) {
        var bad = validateCard(id);
        if (bad.length) { alert('Cannot save — fix these first:\n\n' + bad.join('\n')); return; }
        var lines = collectDraftLineEdits(id);
        if (!lines.length) { alert('Nothing to save.'); return; }
        window.KM.DB.updateRequestOrderLineQty({ lines: lines }).then(function () {
            alert('Draft saved.'); loadAndRender();
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
        if (!confirm('Convert this approved request into a Purchase Order (Draft PO)?')) return;
        window.KM.DB.createPurchaseOrderFromRequest({ request_order_id: id, actor: 'operation-system' })
            .then(function (data) {
                alert('Purchase Order created: ' + ((data && data.purchase_order_no) || 'OK') + '\n\nOpen Purchase Order Overview to continue.');
                loadAndRender();
            })
            .catch(function (e) { alert('Convert failed: ' + (e && e.message ? e.message : e)); });
    }

    function done(id) {
        if (!confirm('Mark this request as Done? It will be hidden from the default view (kept in the database).')) return;
        transition(id, 'done').catch(function (e) { alert('Done failed: ' + (e && e.message ? e.message : e)); });
    }

    // ---- manual create modal ----
    function createFromShortage() {
        alert('From Shipment / Inventory shortage is a Phase 1 placeholder.\n\nAuto-population from upstream demand will be wired to the future procurement engine (spec: REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md §4). For now, use + New Manual Draft.');
    }

    function createManualDraft() {
        if (!useDb()) { alert('Connect the Operation DB (Google Sheet) to create Request Orders.'); return; }
        openCreateModal();
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
                        '<label>Company<input id="ro-c-company" class="pc-input" placeholder="e.g. ResTW"></label>' +
                        '<label>Supplier Name<input id="ro-c-supplier" class="pc-input" placeholder="e.g. Dongguan Youxin"></label>' +
                        '<label>Factory ID<input id="ro-c-factory" class="pc-input" placeholder="e.g. CN_YOUXIN"></label>' +
                        '<label>Warehouse ID<input id="ro-c-warehouse" class="pc-input"></label>' +
                        '<label>Currency<input id="ro-c-currency" class="pc-input" placeholder="e.g. USD"></label>' +
                    '</div>' +
                    '<h4 class="pc-modal__subtitle">SKU Lines</h4>' +
                    '<div class="procurement-table-wrap"><table class="procurement-table" id="ro-c-lines">' +
                        '<thead><tr><th>SKU</th><th>Requested Qty</th><th>Units/Ctn</th><th>Supplier SKU</th><th>Unit Cost</th><th>Need Reason</th><th></th></tr></thead>' +
                        '<tbody></tbody>' +
                    '</table></div>' +
                    '<button class="pc-btn pc-btn--ghost" onclick="roAddCreateLine()">+ Add SKU Line</button>' +
                '</div>' +
                '<div class="pc-modal__foot">' +
                    '<button class="pc-btn pc-btn--default" onclick="roCloseCreateModal()">Cancel</button>' +
                    '<button class="pc-btn pc-btn--primary" onclick="roSubmitCreateModal()">Create Draft</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlay);
        addCreateLine();
    }

    function addCreateLine() {
        var tbody = document.querySelector('#ro-c-lines tbody');
        if (!tbody) return;
        var tr = document.createElement('tr');
        tr.innerHTML =
            '<td><input class="pc-input" data-f="sku"></td>' +
            '<td><input class="pc-input pc-input--qty" type="number" min="0" step="1" data-f="requested_qty"></td>' +
            '<td><input class="pc-input pc-input--qty" type="number" min="0" step="1" data-f="units_per_carton"></td>' +
            '<td><input class="pc-input" data-f="supplier_sku"></td>' +
            '<td><input class="pc-input pc-input--qty" type="number" min="0" step="0.01" data-f="unit_cost"></td>' +
            '<td><input class="pc-input" data-f="need_reason"></td>' +
            '<td><button class="pc-btn pc-btn--rm" onclick="this.closest(\'tr\').remove()">×</button></td>';
        tbody.appendChild(tr);
    }

    function closeCreateModal() {
        var m = document.getElementById('ro-create-modal');
        if (m) m.remove();
    }

    function submitCreateModal() {
        var lines = [];
        document.querySelectorAll('#ro-c-lines tbody tr').forEach(function (tr) {
            function g(f) { var el = tr.querySelector('[data-f="' + f + '"]'); return el ? el.value.trim() : ''; }
            var sku = g('sku');
            if (!sku) return;
            var line = { sku: sku, requested_qty: num(g('requested_qty')) };
            if (g('units_per_carton')) line.units_per_carton = num(g('units_per_carton'));
            if (g('supplier_sku')) line.supplier_sku = g('supplier_sku');
            if (g('unit_cost')) line.unit_cost = num(g('unit_cost'));
            if (g('need_reason')) line.need_reason = g('need_reason');
            lines.push(line);
        });
        if (!lines.length) { alert('Add at least one SKU line (with a SKU).'); return; }
        function gv(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
        var payload = {
            company: gv('ro-c-company'),
            supplier_name: gv('ro-c-supplier'),
            factory_id: gv('ro-c-factory'),
            warehouse_id: gv('ro-c-warehouse'),
            currency: gv('ro-c-currency'),
            source: 'manual',
            created_by: 'operation-system',
            lines: lines
        };
        window.KM.DB.createRequestOrderDraft(payload).then(function (data) {
            closeCreateModal();
            alert('Request Order Draft created: ' + ((data && data.request_order_no) || 'OK'));
            loadAndRender();
        }).catch(function (e) { alert('Create failed: ' + (e && e.message ? e.message : e)); });
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
    window.roCreateFromShortage = createFromShortage;
    window.roAddCreateLine = addCreateLine;
    window.roCloseCreateModal = closeCreateModal;
    window.roSubmitCreateModal = submitCreateModal;
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
