/**
 * ==================================================================================================
 * S8-B3-R3-CP2M-R2 — THE VIEWPORT ACCEPTANCE RUNNER, CORRECTED
 * ==================================================================================================
 *
 * WHY THE CP2M-R1 RUNNER HAD TO BE REPLACED, AND WHAT IT HID.
 *
 *   That runner built its own page around the shipped partial and then wrote this into it:
 *
 *       .app-layout { display:block; }
 *       nav.sidebar { display:none; }            /- "collapsed on phones and irrelevant" -/
 *       .main-content { margin-left:0; }
 *       @media (min-width:1024px){ nav.sidebar{...width:240px} .main-content{margin-left:240px} }
 *
 *   Every one of those four lines is a LAYOUT the application does not have. layout.css gives
 *   `.sidebar` a fixed width of 240px and `.main-content` a margin-left of 240px with NO media query
 *   anywhere in the build that changes either — the only responsive rules on the shell are two
 *   padding tweaks in responsive-foundation.css. The runner's comment asserted a phone behaviour that
 *   does not exist, and then supplied it.
 *
 *   So at a 360px viewport the real content column is 360 - 240 = 120px wide before padding, inside a
 *   `.main-content` whose `overflow-x: hidden` means anything past it cannot be scrolled to. The old
 *   runner measured a 360px-wide content column with no sidebar and reported no overflow. It was not
 *   measuring the page.
 *
 * SO THIS ONE SUBSTITUTES NOTHING ABOUT THE LAYOUT. It serves the REAL index.html, with the real
 * header, the real sidebar, the real `.main-content`, the real stylesheet order, and reaches Site
 * Priority by CLICKING ITS MENU ITEM. Only two things are replaced, and both are permitted:
 *   - the DATA (a fixture, in memory), and
 *   - the DESTINATION of business requests (loopback, so nothing leaves the machine).
 *
 * WHAT IT MEASURES THAT THE OLD ONE COULD NOT
 *
 *   1. CLIPPING BY AN OVERFLOW ANCESTOR, not just by the viewport. An element can sit inside the
 *      window and still be invisible because an ancestor with `overflow:hidden` cuts it off. The old
 *      runner compared rects against the viewport only, so a control amputated by `.main-content`
 *      counted as fine. Each offending ancestor is reported BY NAME, and a CLIPPED element is
 *      separated from a SCROLLABLE one: an ancestor that can scroll merely hides something, an
 *      ancestor that cannot has removed it.
 *
 *   2. WHETHER THE LAST ROW CAN BE REACHED AND OPERATED. Seven rows in the DOM is not seven rows an
 *      operator can use. The runner scrolls to the bottom, finds the last row's Edit control, and
 *      asks `elementFromPoint` whether that control is what is actually at those coordinates. A
 *      control that is covered, clipped or off-scroll fails this and passes every DOM count.
 *
 *   3. THE COUNTRY CONTROL'S RIGHT EDGE, by name, because that is the one the Owner asked about.
 *
 * THE EVIDENCE HASH COVERS INDEX, THE CASCADE, THE RENDERER AND THIS RUNNER. The CP2M-R1 evidence
 * hashed three files, so a change to index.html or to layout.css could not make it stale -- which is
 * precisely the change that would invalidate it.
 *
 * USAGE: node assets/tests/_cp2m-r2-viewport-runner.js [outDir]
 * A helper, not a suite: the leading underscore keeps the sweep from executing it.
 * ==================================================================================================
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const os = require('os');
const http = require('http');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** How long a page may hold its own load event before the server gives up on it. */

/**
 * Stamp a stub answer with the correlation a real deployment owes the client.
 * Without this the transport reports RESPONSE_CORRELATION_UNPROVEN and the page refuses the answer.
 */
function withCorrelation(payload, action, rid) {
  if (!payload || typeof payload !== 'object') return payload;
  const out = Object.assign({}, payload);
  out.meta = Object.assign({}, out.meta || {}, { action: action, requestId: rid || undefined });
  if (rid) out.request_id = rid;
  return out;
}

const MAX_HOLD_MS = 25000;

const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
];
function findBrowser() { for (const b of BROWSERS) { if (fs.existsSync(b)) return b; } return null; }

const VIEWPORTS = [
  { id: '360', w: 360, h: 780, touch: true },
  { id: '390', w: 390, h: 844, touch: true },
  { id: '768', w: 768, h: 1024, touch: true },
  { id: '1280', w: 1280, h: 800, touch: false },
  { id: '1920', w: 1920, h: 1080, touch: false }
];

/* Deliberately awkward: two companies so the grouping shows, a long marketplace name so truncation
   shows, a MISSING weight, an explicit 0 and a duplicate. Fixture rows only -- no real site. */
const FIXTURE = [
  { marketplace_id: 'M1', company: 'KitchenMama', country: 'US', marketplace: 'Amazon', allocation_priority: 100, currency: 'USD', status: 'active', updated_by: 'fixture', updated_at: '2026-10-13T00:00:00Z' },
  { marketplace_id: 'M2', company: 'KitchenMama', country: 'GB', marketplace: 'Amazon Marketplace Europe', allocation_priority: 80, currency: 'GBP', status: 'active', updated_by: 'fixture', updated_at: '2026-10-13T00:00:00Z' },
  { marketplace_id: 'M3', company: 'KitchenMama', country: 'DE', marketplace: 'Amazon', allocation_priority: 80, currency: 'EUR', status: 'active', updated_by: 'fixture', updated_at: '2026-10-13T00:00:00Z' },
  { marketplace_id: 'M4', company: 'KitchenMama', country: 'JP', marketplace: 'Rakuten', allocation_priority: 0, currency: 'JPY', status: 'active', updated_by: 'fixture', updated_at: '2026-10-13T00:00:00Z' },
  { marketplace_id: 'M5', company: 'KitchenMama', country: 'CA', marketplace: 'Walmart', allocation_priority: '', currency: 'CAD', status: 'active', updated_by: 'fixture', updated_at: '2026-10-13T00:00:00Z' },
  { marketplace_id: 'M6', company: 'ResourceUS', country: 'US', marketplace: 'Amazon', allocation_priority: 50, currency: 'USD', status: 'active', updated_by: 'fixture', updated_at: '2026-10-13T00:00:00Z' },
  /* INVALID IS A NEGATIVE, NOT '7abc', AND THE DIFFERENCE IS NOT COSMETIC. This fixture goes through the
     SHIPPED normalizer, which collapses an unparseable cell to null -- so '7abc' reached the page as
     MISSING and was drawn with a drag handle, as a row waiting for its first value. The normalizer
     PRESERVES a negative on purpose (its own comment says so: the §40 refusal is the one that should be
     seen), so a negative is the only INVALID the real read path can deliver. */
  { marketplace_id: 'M7', company: 'ResourceUS', country: 'US', marketplace: 'eBay', allocation_priority: -5, currency: 'USD', status: 'active', updated_by: 'fixture', updated_at: '2026-10-13T00:00:00Z' }
];

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

// ---- the measuring script, injected after the shipped ones ---------------------------------------

const MEASURE = `
(function(){
  function boxOf(e){ var r=e.getBoundingClientRect(); return {w:Math.round(r.width),h:Math.round(r.height),
    left:Math.round(r.left),right:Math.round(r.right),top:Math.round(r.top),bottom:Math.round(r.bottom)}; }
  function name(e){ return e.tagName.toLowerCase()
    + (e.id?('#'+e.id):'') + (e.className?('.'+String(e.className).trim().split(/\\s+/).slice(0,2).join('.')):''); }

  /* THE NEAREST CLIPPER DECIDES, PER AXIS — and the first version of this did not know that.
     An element scrolled below the fold inside .main-content also extends past BODY's box, and body has
     overflow:hidden, so walking every ancestor reported each off-screen Edit button as "hard clipped by
     body" when scrolling reaches it perfectly. That inflated the 360px count to 18. For each axis the
     walk therefore stops at the FIRST ancestor that clips it: if that one can scroll, the element is
     reachable and no outer box can change that, because the outer box contains the scroller. */
  function visuallyHidden(el){
    // The visually-hidden <thead> pattern (absolute + clip:rect(0 0 0 0)) takes cells OUT of flow while
    // leaving them their natural width, so their rects extend past everything. They are invisible and
    // unreachable BY DESIGN; counting them as clipped reports a defect that does not exist.
    for (var p=el; p && p!==document.body; p=p.parentElement){
      var cs=getComputedStyle(p);
      if (cs.position==='absolute' && String(cs.clip||'').indexOf('rect(0')===0) return true;
      if (cs.visibility==='hidden' || cs.display==='none') return true;
    }
    return false;
  }

  /* CLAMP AND CONTINUE — the only version of this that is actually right.
     --------------------------------------------------------------------------------------------------
     Two earlier attempts were each wrong in an instructive way.

     ATTEMPT 1 compared every ancestor against the element and reported all of them. An Edit button
     scrolled below the fold inside .main-content also extends past BODY, and body is overflow:hidden,
     so each off-screen row was reported as "hard clipped by body" when scrolling reaches it perfectly.
     That inflated the 360px count to 18.

     ATTEMPT 2 stopped at the NEAREST clipping ancestor per axis, reasoning that it owns the question.
     It does not. If that ancestor is ITSELF cut off by something further up, stopping there reports
     "not clipped" for an element nobody can see. At 768px the Edit buttons sit at left:767 in a table
     wider than its container, and attempt 2 returned an EMPTY clip list for a control that is entirely
     off screen.

     What is actually being asked is: how much of this element survives to the viewport? So the rect is
     CLAMPED by every clipping ancestor in turn and the walk continues to the top. An ancestor that can
     scroll on an axis does not clamp it -- the content is reachable -- but the walk still continues,
     because the scroller itself may be clipped by something above it. */
  function clipAnalysis(el){
    var vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    if (visuallyHidden(el)) return { hidden:true, cutBy:[], visibleFraction:0 };
    var er = el.getBoundingClientRect();
    var vis = { l:er.left, t:er.top, r:er.right, b:er.bottom };
    var cutBy = [];
    for (var p = el.parentElement; p; p = p.parentElement){
      var cs = getComputedStyle(p), pr = p.getBoundingClientRect();
      var ox = cs.overflowX, oy = cs.overflowY;
      var scrollableX = (ox==='auto'||ox==='scroll') && p.scrollWidth > p.clientWidth + 1;
      var scrollableY = (oy==='auto'||oy==='scroll') && p.scrollHeight > p.clientHeight + 1;
      /* A SCROLLABLE ANCESTOR DOES NOT CUT — IT RELOCATES. Clamping the element's CURRENT rect past a
         scroller was the third mistake this function made: an Edit button below the fold inside
         .main-content is reported at a y that lies outside BODY, and body is overflow:hidden, so every
         off-screen row came back "fully invisible" when one scroll reaches it. Scrolling moves the
         element INTO the scroller's box, so from here up it is the SCROLLER'S box that outer ancestors
         must contain. Rewriting the working rect to sit inside it is what makes the rest of the walk
         describe where the element can be, instead of where it happens to be parked. */
      if (scrollableX){
        var ew0 = Math.min(vis.r - vis.l, pr.right - pr.left);
        vis.l = Math.max(pr.left, Math.min(vis.l, pr.right - ew0));
        vis.r = vis.l + ew0;
      } else if (ox !== 'visible'){
        if (vis.r > pr.right + 1){ cutBy.push({by:name(p), axis:'x', side:'right', overBy:Math.round(vis.r - pr.right), overflow:ox}); vis.r = Math.min(vis.r, pr.right); }
        if (vis.l < pr.left - 1){ cutBy.push({by:name(p), axis:'x', side:'left', overBy:Math.round(pr.left - vis.l), overflow:ox}); vis.l = Math.max(vis.l, pr.left); }
      }
      if (scrollableY){
        var eh0 = Math.min(vis.b - vis.t, pr.bottom - pr.top);
        vis.t = Math.max(pr.top, Math.min(vis.t, pr.bottom - eh0));
        vis.b = vis.t + eh0;
      } else if (oy !== 'visible'){
        if (vis.b > pr.bottom + 1){ cutBy.push({by:name(p), axis:'y', side:'bottom', overBy:Math.round(vis.b - pr.bottom), overflow:oy}); vis.b = Math.min(vis.b, pr.bottom); }
        if (vis.t < pr.top - 1){ cutBy.push({by:name(p), axis:'y', side:'top', overBy:Math.round(pr.top - vis.t), overflow:oy}); vis.t = Math.max(vis.t, pr.top); }
      }
      if (p === document.body) break;
    }
    // And finally the viewport, which only clips when the document itself cannot scroll that way.
    var de = document.documentElement;
    if (de.scrollWidth <= de.clientWidth + 1 && vis.r > vw + 1 && vis.l < vw){
      cutBy.push({by:'viewport', axis:'x', side:'right', overBy:Math.round(vis.r - vw), overflow:'viewport'});
      vis.r = Math.min(vis.r, vw);
    }
    var ew = Math.max(0, er.right - er.left), eh = Math.max(0, er.bottom - er.top);
    var vwid = Math.max(0, vis.r - vis.l), vhei = Math.max(0, vis.b - vis.t);
    return {
      hidden:false, cutBy:cutBy,
      visibleBox:{ l:Math.round(vis.l), t:Math.round(vis.t), r:Math.round(vis.r), b:Math.round(vis.b) },
      visibleFraction: (ew*eh > 0) ? +(((vwid*vhei)/(ew*eh))).toFixed(3) : 0
    };
  }

  /** Backwards-compatible shape for the callers that only want the hard cuts. */
  function clipAncestors(el){
    var a = clipAnalysis(el);
    return a.cutBy.map(function(c){ return { by:c.by, axis:c.axis, overBy:c.overBy, overflow:c.overflow, scrollable:false }; });
  }

  function scroller(el){
    for (var p=el.parentElement; p; p=p.parentElement){
      var cs=getComputedStyle(p);
      if ((cs.overflowY==='auto'||cs.overflowY==='scroll') && p.scrollHeight > p.clientHeight+1) return p;
      if (p===document.body) break;
    }
    return null;
  }

  /* REACHING A CONTROL CAN TAKE TWO SCROLLS, and the first version of this only performed one. After the
     table wrapper was given overflow-x:auto the Edit column became reachable -- by scrolling sideways --
     and a check that only scrolled DOWN still reported it unreachable. That would have recorded a fixed
     defect as unfixed, which is the same kind of error as the reverse. */
  function hScroller(el){
    for (var p=el.parentElement; p; p=p.parentElement){
      var cs=getComputedStyle(p);
      if ((cs.overflowX==='auto'||cs.overflowX==='scroll') && p.scrollWidth > p.clientWidth+1) return p;
      if (p===document.body) break;
    }
    return null;
  }


  /* ---- S8-B3-R3-CP2M-R4: THE GESTURE, DRIVEN FOR REAL --------------------------------------------
     The node suite drives lift / move / drop by calling the same functions the handlers call, which
     proves the RULE and proves nothing about the GESTURE: a headless DOM has no layout, so
     getBoundingClientRect returns zeros and a pointer path cannot be driven there at all. This runs in
     a real browser, against the real stylesheet, and dispatches real PointerEvents and KeyboardEvents.

     THREE INPUTS, ONE EXPECTED RESULT. Mouse, touch and keyboard must each put the same row in the same
     place with the same proposed weight. Touch is the one that silently does not work if
     "touch-action: none" is missing, so the COMPUTED value is read here rather than the stylesheet
     text -- a declaration that is present but overridden would pass a source grep and fail a finger.

     NOTHING IS SAVED. The write wrapper is replaced with a counter, so a gesture that dispatched a
     write would be visible as a number rather than as a changed fixture. */
  function dragProbe(sec){
    var out={};
    /* THE PROBE MUST LEAVE THE PAGE AS IT FOUND IT, because the screenshot is taken after it. Calling
       focus() on a handle SCROLLS IT INTO VIEW, so the first capture of this round showed the table
       half-way down with a focus ring on row four -- a picture of the measurement rather than of the
       page. The scroll offsets and the focused element are both restored at the end. */
    var _sc=document.querySelector('.main-content');
    var _st=_sc?_sc.scrollTop:0, _wy=window.scrollY||0;
    try{
      var grips=sec.querySelectorAll('[data-sp-grip]');
      out.gripCount=grips.length;
      out.gripKeys=Array.prototype.map.call(grips,function(g){
        return String(g.getAttribute('data-sp-grip')||'').replace(//g,'/'); });
      out.offGripKeys=Array.prototype.map.call(sec.querySelectorAll('.sp-grip--off'),function(g){
        var tr=g.closest?g.closest('tr'):null;
        return tr?String(tr.getAttribute('data-sp-row')||'').replace(//g,'/'):'?'; });
      if(!grips.length){ out.reason='NO_GRIPS'; return out; }
      /* THE MOVE BAR AT REST. Measured BEFORE any gesture, because the hidden attribute is set by the
         page and must actually hide: a bordered box with no content reads as a control that failed. */
      var _bar=document.getElementById('sp-draft');
      out.barAtRest=_bar?{ hiddenAttr:!!_bar.hidden, display:String(getComputedStyle(_bar).display),
        h:Math.round(_bar.getBoundingClientRect().height) }:null;
      var gb=grips[0].getBoundingClientRect();
      out.gripBox={w:Math.round(gb.width),h:Math.round(gb.height)};
      out.touchAction=String(getComputedStyle(grips[0]).touchAction||'');
      out.gripIsButton=(grips[0].tagName.toLowerCase()==='button');
      out.gripTabbable=(grips[0].tabIndex>=0);

      // THE WRITE PATH IS REPLACED BY A COUNTER for the duration of the probe.
      var writes=0, realWriter=null;
      try{ realWriter=window.KM.DB.setMarketplaceAllocationPriority;
           window.KM.DB.setMarketplaceAllocationPriority=function(){ writes++;
             return Promise.resolve({outcome:'CONFIRMED_NOT_STARTED',code:'PROBE',message:'probe'}); };
      }catch(e){ out.writerSwapError=String(e.message); }

      function ordered(){ return Array.prototype.slice.call(sec.querySelectorAll('tr[data-sp-ordered="1"]')); }
      function others(key){ return ordered().filter(function(t){ return t.getAttribute('data-sp-row')!==key; }); }
      function barText(){ var b=document.getElementById('sp-draft');
        return (b && !b.hidden) ? String(b.textContent||'').replace(/\s+/g,' ').trim().slice(0,200) : ''; }
      function previewKey(){ var t=sec.querySelector('tr[data-sp-preview="1"]');
        return t?String(t.getAttribute('data-sp-row')):null; }
      function previewWeight(){ var e=sec.querySelector('tr[data-sp-preview="1"] .sp-pri--preview');
        return e?String(e.textContent||'').trim():null; }
      function slotOfPreview(){ var o=ordered(); for(var i=0;i<o.length;i++){
        if(o[i].getAttribute('data-sp-preview')==='1') return i; } return -1; }
      function clearMove(){ var c=document.querySelector('[data-sp-move-cancel]');
        if(c){ c.click(); return; }
        try{ sec.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})); }catch(e){} }

      // The row to move: Rakuten is the lowest weighted KitchenMama site (0), so it starts LAST in its
      // band and has somewhere to go. Found by its identity rather than by an index, which would move.
      var targetKey=null;
      ordered().forEach(function(t){ var k=t.getAttribute('data-sp-row')||'';
        if(k.indexOf('Rakuten')>=0) targetKey=k; });
      out.targetKey=targetKey;
      if(!targetKey){ out.reason='NO_TARGET'; return out; }
      function gripOf(k){ var t=sec.querySelector('tr[data-sp-row="'+k.replace(/"/g,'')+'"]');
        return t?t.querySelector('[data-sp-grip]'):null; }

      function snapshot(){ return { bar:barText(), key:previewKey(), weight:previewWeight(),
        slot:slotOfPreview(), order:ordered().map(function(t){return t.getAttribute('data-sp-row');}) }; }

      // ---- KEYBOARD: Space to lift, ArrowUp twice, Space to drop -------------------------------
      try{
        var g=gripOf(targetKey); g.focus();
        out.keyboard={focused:(document.activeElement===g)};
        function k(key){ g=gripOf(targetKey);
          if(!g) return false;
          var ev=new KeyboardEvent('keydown',{key:key,bubbles:true,cancelable:true});
          g.dispatchEvent(ev); return ev.defaultPrevented; }
        out.keyboard.liftPrevented=k(' ');
        out.keyboard.afterLift=snapshot();
        k('ArrowUp');
        out.keyboard.afterOneUp=snapshot();
        k('ArrowUp');
        out.keyboard.afterTwoUp=snapshot();
        out.keyboard.dropPrevented=k(' ');
        out.keyboard.afterDrop=snapshot();
        out.keyboard.focusKept=!!(gripOf(targetKey)&&document.activeElement===gripOf(targetKey));
        clearMove();
        out.keyboard.afterCancel=snapshot();
      }catch(e){ out.keyboard={error:String(e.message)}; }

      // ---- POINTER: the same move, with mouse and then with touch ------------------------------
      function pointerDrag(kind){
        var r={kind:kind};
        try{
          var g=gripOf(targetKey);
          var gr=g.getBoundingClientRect();
          var x=gr.left+gr.width/2, y0=gr.top+gr.height/2;
          function pe(type,cy,opts){
            var init={bubbles:true,cancelable:true,composed:true,pointerId:7,pointerType:kind,
              isPrimary:true,clientX:x,clientY:cy,buttons:(type==='pointerup'?0:1)};
            if(opts) for(var kk in opts) init[kk]=opts[kk];
            var ev;
            try{ ev=new PointerEvent(type,init); }
            catch(e){ ev=new MouseEvent(type,init); ev.pointerId=7; ev.pointerType=kind; }
            return ev;
          }
          g.dispatchEvent(pe('pointerdown',y0));
          // THE FIRST MOVE CROSSES THE 4px THRESHOLD AND LIFTS. The target Y is computed AFTER it, and
          // that ordering is the whole correctness of this probe: lifting makes the move bar appear,
          // which pushes every row of the table DOWN by its height. A Y measured before the lift points
          // at a row that is no longer there -- which is exactly what the first version of this did, and
          // it landed one slot high at 768 and 1920 while looking correct at the other three widths.
          document.dispatchEvent(pe('pointermove',y0+12));
          r.afterThreshold=snapshot();
          var o=others(targetKey);
          r.otherRows=o.length;
          if(o.length<2){ r.reason='TOO_FEW_ROWS'; return r; }
          // Slot 1 needs exactly ONE row of this company above the pointer, so aim strictly between the
          // midpoints of the first and second rows as they sit NOW.
          var b0=o[0].getBoundingClientRect(), b1=o[1].getBoundingClientRect();
          var mid0=b0.top+b0.height/2, mid1=b1.top+b1.height/2;
          var ty=(mid0+mid1)/2;
          r.aim={mid0:Math.round(mid0),mid1:Math.round(mid1),ty:Math.round(ty)};
          document.dispatchEvent(pe('pointermove',ty));
          r.afterMove=snapshot();
          document.dispatchEvent(pe('pointerup',ty));
          r.afterUp=snapshot();
          clearMove();
          r.afterCancel=snapshot();
        }catch(e){ r.error=String(e.message); }
        return r;
      }
      out.mouse=pointerDrag('mouse');
      out.touch=pointerDrag('touch');

      // ---- A REFUSED SLOT IS VISIBLE BEFORE THE DROP -------------------------------------------
      // Slot 2 lands between the two sites that share a weight of 80. The row is drawn where it was
      // dropped with NO weight, and Save is never offered.
      try{
        var g2=gripOf(targetKey); g2.focus();
        function k2(key){ var gg=gripOf(targetKey); if(!gg) return;
          gg.dispatchEvent(new KeyboardEvent('keydown',{key:key,bubbles:true,cancelable:true})); }
        k2(' '); k2('ArrowUp');
        out.tiedPair=snapshot();
        out.tiedPairOffersSave=!!document.querySelector('[data-sp-move-save]');
        clearMove();
      }catch(e){ out.tiedPair={error:String(e.message)}; }

      out.writesDispatched=writes;
      try{ if(realWriter) window.KM.DB.setMarketplaceAllocationPriority=realWriter; }catch(e){}
    }catch(e){ out.error=String(e.message); }
    try{
      if(document.activeElement && document.activeElement.blur) document.activeElement.blur();
      if(_sc) _sc.scrollTop=_st;
      window.scrollTo(0,_wy);
      out.restored={scrollTop:_sc?_sc.scrollTop:null, scrollY:window.scrollY||0};
    }catch(e){ out.restoreError=String(e.message); }
    return out;
  }

  function measure(){
    var vw=document.documentElement.clientWidth;
    var sec=document.getElementById('site-priority-section');
    var out={ viewport: vw, requestedViewport: window.__REQ_W, sectionPresent: !!sec };
    if(!sec){ out.error='SECTION_ABSENT'; return out; }

    var rows=sec.querySelectorAll('tr[data-sp-row]');
    var groups=sec.querySelectorAll('.sp-group__cell');
    var buttons=sec.querySelectorAll('.sp-btn');
    var selects=sec.querySelectorAll('.sp-select');
    var cells=sec.querySelectorAll('tr[data-sp-row] td');

    out.rowCount=rows.length; out.groupCount=groups.length;
    /* S8-B3-R3-CP2M-R4 - TWO KINDS OF BAND, COUNTED APART. The company band and the "No priority set"
       band are both .sp-group__cell, so one total silently merged them the moment the second kind
       existed - and an assertion pinned to that total would have read a new structure as a regression
       in the old one. */
    out.companyGroupCount=sec.querySelectorAll('tr[data-sp-group]').length;
    out.unsetGroupCount=sec.querySelectorAll('tr[data-sp-unset]').length;
    out.groupTexts=Array.prototype.map.call(groups,function(g){return String(g.textContent||'').replace(/\\s+/g,' ').trim().slice(0,40);});
    out.buttonCount=buttons.length; out.selectCount=selects.length;
    out.minButtonH=buttons.length?Math.min.apply(null,Array.prototype.map.call(buttons,function(b){return Math.round(b.getBoundingClientRect().height);})):null;
    out.minSelectH=selects.length?Math.min.apply(null,Array.prototype.map.call(selects,function(b){return Math.round(b.getBoundingClientRect().height);})):null;
    out.minFontSize=cells.length?Math.min.apply(null,Array.prototype.map.call(cells,function(c){return parseFloat(getComputedStyle(c).fontSize)||0;})):null;

    // ---- the shell, measured rather than assumed ------------------------------------------------
    var sidebar=document.getElementById('appSidebar');
    var main=document.querySelector('.main-content');
    var area=document.querySelector('.content-area');
    out.shell={
      sidebar: sidebar?{box:boxOf(sidebar),display:getComputedStyle(sidebar).display,position:getComputedStyle(sidebar).position,width:getComputedStyle(sidebar).width}:null,
      mainContent: main?{box:boxOf(main),marginLeft:getComputedStyle(main).marginLeft,overflowX:getComputedStyle(main).overflowX}:null,
      contentArea: area?{box:boxOf(area),padding:getComputedStyle(area).padding}:null,
      usableContentWidth: area?Math.round(area.getBoundingClientRect().width):null
    };

    // ---- page-level overflow --------------------------------------------------------------------
    var de=document.documentElement;
    out.horizontalOverflow = de.scrollWidth > de.clientWidth+1;
    out.docScrollWidth=de.scrollWidth; out.docClientWidth=de.clientWidth;

    // ---- clipping, by ancestor, for every control and cell that matters -------------------------
    var watched=[];
    function watch(sel,label){
      Array.prototype.forEach.call(sec.querySelectorAll(sel),function(e,i){
        var an=clipAnalysis(e);
        var hard=an.cutBy;
        watched.push({ label: label+'['+i+']', name: name(e), box: boxOf(e),
          text: String(e.textContent||e.value||'').replace(/\\s+/g,' ').trim().slice(0,30),
          visibleFraction: an.visibleFraction, visuallyHidden: !!an.hidden,
          pastViewportBy: Math.round(e.getBoundingClientRect().right - vw),
          /* scrollWidth > clientWidth on an overflow:visible box means the content is WIDER, not that it
             is CUT: it paints outside the box and the reader sees all of it. Only a box that clips its
             own overflow has hidden anything. */
          selfClipped: (function(){
            var cs=getComputedStyle(e);
            return e.scrollWidth > e.clientWidth+1 && cs.overflowX!=='visible';
          }()),
          clippedBy: hard });
      });
    }
    watch('#sp-filter-country','country');
    watch('#sp-filter-company','company');
    watch('#sp-refresh','refresh');
    watch('.sp-col-act .sp-btn','edit');
    watch('.sp-col-pri','priority');
    out.watched=watched;
    out.hardClippedCount=watched.filter(function(w){return w.clippedBy.length>0;}).length;
    // The headline number: a control less than 95% visible is one an operator cannot fully use.
    out.partlyInvisibleCount=watched.filter(function(w){return !w.visuallyHidden && w.visibleFraction < 0.95;}).length;
    out.fullyInvisibleCount=watched.filter(function(w){return !w.visuallyHidden && w.visibleFraction <= 0.01;}).length;
    out.pastViewportCount=watched.filter(function(w){return w.pastViewportBy>1;}).length;
    out.selfClippedCount=watched.filter(function(w){return w.selfClipped;}).length;

    // ---- CAN THE LAST ROW BE REACHED AND OPERATED? -----------------------------------------------
    var last=rows.length?rows[rows.length-1]:null;
    if(last){
      var ctrl=last.querySelector('.sp-col-act .sp-btn')||last.querySelector('.sp-btn')||last;
      var sc=scroller(last)||document.querySelector('.main-content');
      var before=sc?sc.scrollTop:0;
      if(sc){ sc.scrollTop=sc.scrollHeight; }
      var hs=hScroller(ctrl);
      if(hs){ hs.scrollLeft=hs.scrollWidth; }
      var r=ctrl.getBoundingClientRect();
      var cx=Math.round(r.left+r.width/2), cy=Math.round(r.top+r.height/2);
      var at=(r.width>0&&r.height>0&&cx>=0&&cy>=0&&cx<vw&&cy<document.documentElement.clientHeight)
        ? document.elementFromPoint(cx,cy) : null;
      var reached = !!(at && (at===ctrl || ctrl.contains(at) || at.contains(ctrl)));
      out.lastRow={
        scrollerName: sc?name(sc):null, scrolledFrom:before, scrolledTo:sc?sc.scrollTop:null,
        hScrollerName: hs?name(hs):null, hScrolledTo: hs?hs.scrollLeft:null,
        neededHorizontalScroll: !!hs,
        scrollHeight: sc?sc.scrollHeight:null, clientHeight: sc?sc.clientHeight:null,
        controlName: name(ctrl), controlBox: boxOf(ctrl),
        point:[cx,cy], elementAtPoint: at?name(at):null,
        reachableAndOperable: reached,
        visibleFraction: clipAnalysis(ctrl).visibleFraction,
        clippedBy: clipAnalysis(ctrl).cutBy
      };
    } else { out.lastRow={ reachableAndOperable:false, reason:'NO_ROWS' }; }

    /* PUT THE PAGE BACK BEFORE IT IS PHOTOGRAPHED. The reachability probe scrolls the containers to the
       end, and the screenshot is taken afterwards -- so the first capture after the table became
       scrollable showed the view scrolled fully right, with the Company column off screen and the group
       heading reading "a  5 sites". The measurement was correct and the picture was of a state no
       operator starts in. Restoring the offsets costs nothing and keeps the two describing the same
       page. */
    if (out.lastRow && out.lastRow.scrollerName){
      var vsc = scroller(rows[rows.length-1]) || document.querySelector('.main-content');
      if (vsc) vsc.scrollTop = out.lastRow.scrolledFrom || 0;
    }
    if (out.lastRow && out.lastRow.hScrollerName){
      var hsc = hScroller(last.querySelector('.sp-col-act .sp-btn') || last);
      if (hsc) hsc.scrollLeft = 0;
    }

    /* The drag probe runs LAST and cancels itself, so every layout number above was taken from the
       page in its resting state. A probe that ran first would measure a table with a preview row in it. */
    out.drag = dragProbe(sec);

    return out;
  }

  function go(){
    var el=document.querySelector('[onclick*="showSection(\\'site-priority\\')"]');
    if(el) el.click(); else if(window.showSection) window.showSection('site-priority');
    setTimeout(function(){
      var out;
      try { out=measure(); } catch(e){ out={error:String(e.message), stack:String(e.stack||'').split('\\n')[1]||''}; }
      try {
        var xhr=new XMLHttpRequest();
        xhr.open('POST','/__measure?id='+encodeURIComponent(window.__CAP_ID),true);
        xhr.send(JSON.stringify(out));
      } catch(e){}
    }, 1800);
  }
  // The holding image is requested FIRST so it is already pending when everything else settles; the
  // load event cannot fire while it is outstanding, and measure() is what releases it.
  var hold=document.createElement('img');
  hold.style.cssText='position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px';
  hold.src='/__hold?id='+encodeURIComponent(window.__CAP_ID);
  document.body.appendChild(hold);
  setTimeout(go, 500);
}());
`;

function buildPage(port, reqW, capId) {
  let html = read('index.html');
  html = html.replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/[^"']+/g, 'http://127.0.0.1:' + port + '/__stub.js');

  const preamble = `
<script>
(function(){
  var LOCAL='http://127.0.0.1:${port}';
  var _f=window.fetch;
  window.fetch=function(input,init){
    var url=(typeof input==='string')?input:(input&&input.url)||'';
    if(/^https?:\\/\\//i.test(url)&&url.indexOf(LOCAL)!==0){
      var qs=url.indexOf('?')>=0?url.slice(url.indexOf('?')):'';
      return _f.call(this,LOCAL+'/__api'+qs,init);
    }
    return _f.apply(this,arguments);
  };
  window.__REQ_W=${reqW};
  window.__CAP_ID='${capId}';
}());
</script>`;
  const first = html.indexOf('<script');
  html = html.slice(0, first) + preamble + '\n' + html.slice(first);
  html = html.replace('</body>', '<script>' + MEASURE + '</script>\n</body>');
  return html;
}

function startServer(pages, held, results) {
  return http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    const p = decodeURIComponent(u.pathname);

    /* ============================================================================================
       HOLDING THE LOAD EVENT OPEN, AND WHY THERE IS NO SIMPLER WAY.
       --------------------------------------------------------------------------------------------
       Chrome's --screenshot fires at the load event. This application is not finished at load: the
       route is entered afterwards, its partial and scripts arrive afterwards, and the table renders
       afterwards. So a plain screenshot photographs an empty shell -- measured, at 2.9 KB for 360px.

       The usual answer, --virtual-time-budget, CANNOT BE USED AGAINST THE REAL APPLICATION. It was
       tried at 8000 and at 15000 and BOTH hung for the full 90-second cap with no measurement at all,
       because a page that always has a timer due never lets virtual time drain. (That is also why the
       CP2M-R1 runner could only drive a synthetic page -- and why it never saw the real shell.)
       --timeout does not hold --headless=new open either; it produced near-blank screenshots.

       So the page holds its OWN load event. It requests this image last; the server does not answer
       until the page says it has measured. The load event therefore fires AFTER the render, the
       screenshot is of the finished page, and the measurements come back over the same channel.
       A page that never reports is released by MAX_HOLD_MS so a failure is a timeout, not a hang.
       ============================================================================================ */
    if (p === '/__measure') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        const id = u.searchParams.get('id') || '';
        try { results[id] = JSON.parse(body); } catch (e) { results[id] = { parseError: String(e.message) }; }
        res.writeHead(204); res.end();
        const h = held[id];
        if (h) { delete held[id]; clearTimeout(h.timer); h.release('measured'); }
      });
      return;
    }
    if (p === '/__hold') {
      const id = u.searchParams.get('id') || '';
      const release = (why) => {
        try {
          res.writeHead(200, { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store', 'X-Release': why });
          res.end(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
        } catch (e) {}
      };
      const timer = setTimeout(() => { if (held[id]) { delete held[id]; release('timeout'); } }, MAX_HOLD_MS);
      held[id] = { release, timer };
      return;
    }
    if (p === '/__stub.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('window.Chart=window.Chart||function(){return{destroy:function(){},update:function(){},resize:function(){},data:{},options:{}};};'
        + 'window.Chart.register=window.Chart.register||function(){};window.ExcelJS=window.ExcelJS||{Workbook:function(){}};');
      return;
    }
    if (p === '/__api') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        let action = u.searchParams.get('action') || '';
        let table = u.searchParams.get('table') || '';
        let rid = u.searchParams.get('km_rid') || '';
        if (!action && body) {
          try { const j = JSON.parse(body); action = j.action || ''; table = table || j.table || ''; rid = rid || j.requestId || ''; }
          catch (e) {}
        }
        if (!table) { try { const b = JSON.parse(u.searchParams.get('km_body') || '{}'); table = b.table || ''; } catch (e) {} }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        const send = (o) => res.end(JSON.stringify(withCorrelation(o, action, rid)));
        if (action === 'getTable' && table === 'marketplaces') { send({ success: true, data: { rows: FIXTURE } }); return; }
        if (action === 'getTable') { send({ success: true, data: { rows: [] } }); return; }
        if (action === 'getClientCapabilities') { send({ success: true, data: { product_strategy_enabled: true } }); return; }
        send({ success: true, data: { rows: [], marketplaces: [], countries: [] } });
      });
      return;
    }
    if (pages[p]) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(pages[p]);
      return;
    }
    const abs = path.join(ROOT, p.replace(/^\/+/, ''));
    if (!abs.startsWith(ROOT)) { res.writeHead(403); res.end('no'); return; }
    fs.readFile(abs, (err, buf) => {
      if (err) { res.writeHead(404); res.end('404'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store' });
      res.end(buf);
    });
  });
}


/**
 * THE INJECTED SCRIPTS ARE SYNTAX-CHECKED BEFORE A BROWSER IS LAUNCHED.
 *
 * Both injected blocks are built inside TEMPLATE LITERALS, and a template literal silently eats one
 * level of backslash. A regex written as /\s+/ arrives in the page as /s+/ and quietly deletes every
 * letter s from the text it was supposed to normalise; a string written as '
' arrives as a real
 * newline and makes the whole block a syntax error. Both happened in this round. The second cost six
 * 60-second TIMEOUTs that said nothing about the cause, because a page whose driver never parsed
 * looks exactly like a browser that hung.
 *
 * So the block is compiled here, in Node, before Chrome is started. A failure names the file and the
 * message instead of producing a timeout with no evidence in it.
 */
function assertInjectedScriptsParse(html, label) {
  var out = [];
  var re = /<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g;
  var m, i = 0;
  while ((m = re.exec(html))) {
    i++;
    var body = m[1];
    // Only the blocks this harness injected are its responsibility; the application's own inline
    // scripts are the application's, and one of them legitimately contains an HTML comment that this
    // deliberately simple scanner would mis-slice.
    if (body.indexOf('__kmHarness') < 0 && body.indexOf('__REQ_W') < 0
        && body.indexOf('var ROUTES =') < 0 && body.indexOf('function boxOf') < 0) continue;
    try { new Function(body); }
    catch (e) { out.push('inline#' + i + ': ' + e.message); }
  }
  if (out.length) {
    throw new Error('INJECTED_SCRIPT_SYNTAX_ERROR (' + label + '): ' + out.join(' | '));
  }
  return true;
}

/* THE FRAME IS THE VIEWPORT. Measured in CP2M-R1 and still true: headless Chrome will not shrink its
   WINDOW below a minimum, so --window-size=360 silently yields a ~500px viewport. The iframe has no
   such floor, and the page asserts its own width so a regression here cannot pass unnoticed. */
function wrapperFor(innerPath, w, h) {
  return ['<!doctype html><html><head><meta charset="utf-8"><style>',
    'html,body{margin:0;padding:0;background:#fff;}',
    'iframe{border:0;width:' + w + 'px;height:' + h + 'px;display:block;}',
    '</style></head><body>',
    '<iframe id="f" src="' + innerPath + '"></iframe>',
    /* NOTHING TO POLL ANY MORE. The inner page reports over HTTP and holds its own load event until it
       has; the parent's load event waits for the sub-frame's, so the screenshot is of the finished page
       and the numbers arrive on the same signal. */
    '</body></html>'].join('\n');
}

/**
 * RUN CHROME WITHOUT BLOCKING THE SERVER THAT IS SERVING IT.
 *
 * This replaced spawnSync, and the reason is worth keeping: spawnSync blocks Node's EVENT LOOP. The
 * page under test is served by an http.createServer IN THIS PROCESS, so while spawnSync waited, the
 * server could not answer a single request -- and Chrome sat there with nothing to load. The symptom
 * was total and silent: "requests served: 0", a zero-byte screenshot, and a browser that looked hung.
 * It survived a change of resolver rules, a change of virtual-time budget and a fresh profile, because
 * none of those was the problem.
 *
 * The CP2M-R1 runner used spawnSync safely only because it served pages from file:// and had no server
 * to starve. The moment a real shell required a real origin, spawnSync became unusable.
 */
function runChromeAsync(browser, args, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const child = cp.spawn(browser, args, { stdio: 'ignore' });
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { child.kill(); } catch (e) {}
      resolve({ timedOut: true });
    }, timeoutMs);
    child.on('exit', (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ timedOut: false, code });
    });
    child.on('error', () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ timedOut: false, error: true });
    });
  });
}

async function shoot(browser, port, outDir, vp, results) {
  const png = path.join(outDir, 'site-priority-' + vp.id + '.png');
  const profile = path.join(os.tmpdir(), 'km-cp2m-r2-vp-' + process.pid + '-' + vp.id);
  const base = ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
    '--force-device-scale-factor=1', '--allow-file-access-from-files',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
    '--user-data-dir=' + profile,
    '--window-size=' + Math.max(vp.w, 560) + ',' + Math.max(vp.h, 240)];
  const url = 'http://127.0.0.1:' + port + '/__frame-' + vp.id;

  /* VIRTUAL TIME IS RIGHT HERE, AND WRONG IN THE PERF RUNNER. It freezes the clock while a task runs, so
     any DURATION measured under it is meaningless -- which is why the perf harness forbids it. This runner
     measures LAYOUT: widths, boxes, overflow and clipping are properties of the final frame and do not
     care what the clock said while it was produced. What virtual time buys is determinism and speed: the
     page's own settle delays collapse, so the capture happens when the work is done rather than when a
     wall-clock guess expires.
     --timeout was tried instead and produced near-blank screenshots (2.9 KB at 360px) with NO measurements
     at all: it does not hold --headless=new open until the page is ready. */
  /* ONE LAUNCH, REAL TIME. The screenshot waits for the load event, and the load event waits for the
     page's own report (see /__hold). So the picture and the numbers describe the same frame -- which two
     separate launches never guaranteed. */
  process.stderr.write(vp.id + ' ');
  await runChromeAsync(browser, base.concat(['--screenshot=' + png, url]), MAX_HOLD_MS + 20000);
  const measurements = results[vp.id] || null;
  return { id: vp.id, width: vp.w, height: vp.h, touch: vp.touch,
    png: fs.existsSync(png) ? png : null, pngBytes: fs.existsSync(png) ? fs.statSync(png).size : 0,
    measurements: measurements };
}

function main() {
  const outDir = process.argv[2] || path.join(os.tmpdir(), 'km-cp2m-r2-shots');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = findBrowser();
  if (!browser) { console.log(JSON.stringify({ ok: false, reason: 'NO_BROWSER' })); return; }

  const port = 39400 + (process.pid % 300);
  const pages = {};
  VIEWPORTS.forEach(vp => {
    pages['/__page-' + vp.id] = buildPage(port, vp.w, vp.id);
    pages['/__frame-' + vp.id] = wrapperFor('/__page-' + vp.id, vp.w, vp.h);
  });

  VIEWPORTS.forEach(vp => assertInjectedScriptsParse(pages['/__page-' + vp.id], 'viewport-' + vp.id));

  const held = Object.create(null);
  const reported = Object.create(null);
  const srv = startServer(pages, held, reported);
  srv.listen(port, '127.0.0.1', async () => {
    const results = [];
    for (const vp of VIEWPORTS) results.push(await shoot(browser, port, outDir, vp, reported));
    process.stderr.write(String.fromCharCode(10));
    srv.close();
    const sha = (rel) => crypto.createHash('sha256').update(read(rel).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
    const out = {
      ok: true, browser: path.basename(browser),
      capturedAt: new Date().toISOString().slice(0, 10),
      fixtureRows: FIXTURE.length,
      shellIsReal: true, testCssOverrides: 0,
      /* THE HASH COVERS WHAT THE MEASUREMENT DEPENDS ON. CP2M-R1 hashed three page files, so a change
         to index.html or to the shell's own stylesheet could not invalidate the evidence -- which is
         exactly the change that would. */
      sources: {
        'index.html': sha('index.html'),
        'assets/css/layout.css': sha('assets/css/layout.css'),
        'assets/css/base.css': sha('assets/css/base.css'),
        'assets/css/components.css': sha('assets/css/components.css'),
        'assets/css/responsive-foundation.css': sha('assets/css/responsive-foundation.css'),
        'assets/css/pages/site-priority.css': sha('assets/css/pages/site-priority.css'),
        'assets/js/pages/site-priority.js': sha('assets/js/pages/site-priority.js'),
        'assets/html/pages/site-priority.html': sha('assets/html/pages/site-priority.html'),
        'assets/js/app.js': sha('assets/js/app.js'),
        'assets/tests/_cp2m-r2-viewport-runner.js': sha('assets/tests/_cp2m-r2-viewport-runner.js')
      },
      shotsDir: outDir,
      results: results.map(r => ({ id: r.id, width: r.width, height: r.height, touch: r.touch,
        pngBytes: r.pngBytes, png: r.png ? path.basename(r.png) : null, measurements: r.measurements }))
    };
    fs.writeFileSync(path.join(outDir, 'measurements.json'), JSON.stringify(out, null, 1), 'utf8');
    console.log(JSON.stringify({ ok: true, outDir: outDir, widths: results.map(r => r.id) }));
  });
}

if (require.main === module) main();
module.exports = { VIEWPORTS, FIXTURE, findBrowser, buildPage };
