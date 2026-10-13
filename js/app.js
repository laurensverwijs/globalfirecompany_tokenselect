/* Global Fire Company – sheet samensteller
 * Alle elementen en sheets staan in js/data.js.
 * Staat api/orders.php (PHP) naast de app, dan werkt hij met bestellingen: elke klant krijgt een eigen
 * ordercode en link, en de keuzes worden centraal bewaard. Zonder PHP (bijv. GitHub Pages) werkt hij
 * zoals voorheen: alles blijft in de browser van de bezoeker.
 */
(function () {
  'use strict';

  var DATA = window.GFC_DATA;
  var STORE_KEY = 'gfc-sheet-samensteller-v1';
  var SIZE = {}; DATA.sizes.forEach(function (s) { SIZE[s.id] = s; });
  var TOKEN = {}; DATA.tokens.forEach(function (t) { TOKEN[t.id] = t; });
  var SHEET = {}; DATA.sheets.forEach(function (s) { SHEET[s.id] = s; });

  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var pct = function (v, total) { return (v / total * 100) + '%'; };
  var mm = function (s) { return s.w + ' × ' + s.h + ' mm'; };
  /* ---------- taal ---------- */
  var I18N = window.GFC_I18N, LANGS = Object.keys(I18N), LANG_KEY = 'gfc-sheet-samensteller-lang';
  function pickLang() {
    var m = /[?&#]lang=?([a-z]{2})/.exec(location.search + location.hash);
    if (m && I18N[m[1]]) return m[1];
    try { var saved = localStorage.getItem(LANG_KEY); if (I18N[saved]) return saved; } catch (e) { }
    var nav = (navigator.languages || [navigator.language || '']).map(function (l) { return String(l).slice(0, 2).toLowerCase(); });
    for (var i = 0; i < nav.length; i++) if (I18N[nav[i]]) return nav[i];
    return 'en';
  }
  var lang = pickLang();
  function T(key, params) {
    var str = I18N[lang][key]; if (str == null) str = I18N.nl[key]; if (str == null) return key;
    return String(str).replace(/\{(\w+)\}/g, function (_, k) { return params && params[k] != null ? params[k] : ''; });
  }
  var sizeT = function (id) { return (I18N[lang].sizes && I18N[lang].sizes[id]) || { label: SIZE[id].label, adj: SIZE[id].adj || SIZE[id].label.toLowerCase() }; };
  var label = function (id) { return sizeT(id).label; };
  var adj = function (id) { return sizeT(id).adj; };
  var sheetName = function (s) { return T('sheet', { n: DATA.sheets.indexOf(s) + 1 }); };
  var tokenName = function (t) {
    if (t['name_' + lang]) return t['name_' + lang];
    var L = I18N[lang], m = /^(.*?)(?: type (\d+))?$/.exec(t.name);
    var base = (L.names && L.names[m[1]]) || m[1];
    return m[2] ? base + ' ' + (L.typeWord || 'type') + ' ' + m[2] : base;
  };

  /* ---------- state ---------- */
  var state = { current: DATA.sheets[0].id, back: false, fill: {} };

  function emptyFill(sheet) { return sheet.slots.map(function () { return null; }); }

  function sanitize(sheetId, arr) {
    var sheet = SHEET[sheetId];
    var out = emptyFill(sheet);
    if (!Array.isArray(arr)) return out;
    sheet.slots.forEach(function (slot, i) {
      var t = TOKEN[arr[i]];
      if (t && t.size === slot.size) out[i] = t.id;
    });
    return out;
  }

  function load() {
    DATA.sheets.forEach(function (s) { state.fill[s.id] = emptyFill(s); });
    try {
      var saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (saved && saved.sheets) {
        Object.keys(saved.sheets).forEach(function (id) { if (SHEET[id]) state.fill[id] = sanitize(id, saved.sheets[id]); });
        if (SHEET[saved.current]) state.current = saved.current;
      }
    } catch (e) { /* geen opslag beschikbaar: gewoon leeg beginnen */ }
  }

  function persist() {
    if (order) { scheduleSave(); return; }
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ current: state.current, sheets: state.fill })); } catch (e) { }
  }

  function sheet() { return SHEET[state.current]; }
  function fill() { return state.fill[state.current]; }

  function capacity(sheetId) {
    var s = SHEET[sheetId], f = state.fill[sheetId], cap = {};
    s.sizes.forEach(function (z) { cap[z] = { total: 0, used: 0 }; });
    s.slots.forEach(function (slot, i) { cap[slot.size].total++; if (f[i]) cap[slot.size].used++; });
    return cap;
  }

  function firstFree(sizeId) {
    var s = sheet(), f = fill();
    for (var i = 0; i < s.slots.length; i++) if (s.slots[i].size === sizeId && !f[i]) return i;
    return -1;
  }

  /* ---------- actions ---------- */
  function fullMessage(sizeId) {
    toast(T('toastFull', { adj: adj(sizeId), mm: mm(SIZE[sizeId]) }), true);
    var c = document.querySelector('.cap[data-size="' + sizeId + '"]');
    if (c) { c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); }
  }

  function addToken(tokenId, slotIndex) {
    if (locked()) return false;
    var t = TOKEN[tokenId], s = sheet();
    if (s.sizes.indexOf(t.size) < 0) { toast(T('toastNoFit', { name: tokenName(t), sheet: sheetName(s) }), true); return false; }
    var i = slotIndex != null ? slotIndex : firstFree(t.size);
    if (i < 0) { fullMessage(t.size); return false; }
    if (s.slots[i].size !== t.size) { wrongSize(t); return false; }
    fill()[i] = tokenId;
    commit();
    return true;
  }

  function fillRest(tokenId) {
    if (locked()) return;
    var t = TOKEN[tokenId], n = 0, i;
    while ((i = firstFree(t.size)) >= 0) { fill()[i] = tokenId; n++; }
    if (!n) { fullMessage(t.size); return; }
    commit();
    toast(T('toastFilled', { n: n, name: tokenName(t), adj: adj(t.size) }));
  }

  function removeAt(i) { if (locked()) return; fill()[i] = null; commit(); }

  function wrongSize(t) {
    toast(T('toastWrongSize', { name: tokenName(t), size: label(t.size).toLowerCase(), mm: mm(SIZE[t.size]) }), true);
  }

  function commit() { persist(); render(); }

  /* ---------- rendering ---------- */
  function renderTabs() {
    var tabs = $('tabs'); tabs.innerHTML = '';
    DATA.sheets.forEach(function (s) {
      var cap = capacity(s.id), used = 0, total = 0;
      Object.keys(cap).forEach(function (k) { used += cap[k].used; total += cap[k].total; });
      var b = el('button', 'tab');
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', s.id === state.current ? 'true' : 'false');
      b.innerHTML = '<span class="t-name">' + esc(sheetName(s)) + '</span>' +
        '<span class="t-meta">' + s.sizes.map(function (z) { return esc(label(z)); }).join(' + ') + '</span>' +
        '<span class="t-fill' + (used === total ? ' full' : '') + '">' + used + '/' + total + '</span>';
      b.onclick = function () { state.current = s.id; if (!order) persist(); render(); };
      tabs.appendChild(b);
    });
  }

  function renderLibrary() {
    var s = sheet(), f = fill(), lib = $('library'); lib.innerHTML = '';
    var cap = capacity(s.id);
    $('lib-hint').textContent = T('libHint', { sheet: sheetName(s), sizes: s.sizes.map(function (z) { return label(z).toLowerCase() + ' (' + mm(SIZE[z]) + ')'; }).join(' ' + T('and') + ' ') });
    s.sizes.forEach(function (z) {
      var g = el('div', 'size-group');
      g.innerHTML = '<h3>' + esc(label(z)) + ' <small>' + mm(SIZE[z]) + '</small></h3>';
      var wide = SIZE[z].w > 60;
      var grid = el('div', 'cards' + (wide ? ' wide' : ''));
      var full = cap[z].used >= cap[z].total;
      DATA.tokens.filter(function (t) { return t.size === z; }).forEach(function (t) {
        var count = f.filter(function (x) { return x === t.id; }).length;
        var c = el('div', 'card');
        var nm = tokenName(t);
        c.innerHTML = '<div class="thumb" title="' + esc(T('dragHint')) + '"><img src="' + esc(t.file) + '" alt="' + esc(nm) + '" draggable="false"></div>' +
          '<div class="meta"><span class="name" title="' + esc(nm) + '">' + esc(nm) + '</span>' + (count ? '<span class="badge">' + count + '×</span>' : '') + '</div>' +
          '<div class="btns"><button type="button" class="add" title="' + esc(T('addOne')) + '" aria-label="' + esc(T('addAria', { name: nm })) + '">+</button>' +
          '<button type="button" class="rest" title="' + esc(T('fillRest', { adj: adj(z) })) + '" aria-label="' + esc(T('fillRestAria', { name: nm })) + '">⇉</button></div>';
        var add = c.querySelector('.add'), rest = c.querySelector('.rest');
        add.onclick = function () { addToken(t.id); };
        rest.onclick = function () { fillRest(t.id); };
        if (full) { add.title = rest.title = T('full'); }
        c.querySelector('.thumb').addEventListener('pointerdown', function (e) { startDrag(e, { from: 'lib', token: t.id }); });
        grid.appendChild(c);
      });
      g.appendChild(grid);
      lib.appendChild(g);
    });
  }

  function renderSheet() {
    var s = sheet(), f = fill(), box = $('sheet');
    $('sheet-title').textContent = sheetName(s) + (state.back ? ' · ' + T('backSuffix') : '');
    box.className = 'sheet' + (state.back ? ' back' : '');
    box.innerHTML = '';
    var bg = el('img', 'layer'); bg.src = s.bg; bg.alt = ''; box.appendChild(bg);
    var slots = el('div', 'slots');
    s.slots.forEach(function (slot, i) {
      var d = el('div', 'slot ' + (f[i] ? 'filled' : 'empty'));
      d.dataset.index = i;
      d.style.left = pct(slot.x, s.w); d.style.top = pct(slot.y, s.h);
      d.style.width = pct(slot.w, s.w); d.style.height = pct(slot.h, s.h);
      d.title = SIZE[slot.size].label + ' · ' + mm(SIZE[slot.size]);
      if (f[i]) {
        var t = TOKEN[f[i]];
        var img = el('img'); img.src = t.file; img.alt = tokenName(t); img.draggable = false;
        if (state.back && !t.mirrorBack) img.className = 'flip';
        d.appendChild(img);
        d.title = tokenName(t);
        if (!state.back && !readOnly()) {
          var rm = el('button', 'rm', '×'); rm.type = 'button'; rm.setAttribute('aria-label', T('removeAria', { name: tokenName(t) }));
          rm.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
          rm.onclick = function () { removeAt(i); };
          d.appendChild(rm);
          d.addEventListener('pointerdown', function (e) { startDrag(e, { from: 'slot', token: f[i], index: i }); });
        }
      }
      slots.appendChild(d);
    });
    box.appendChild(slots);
    var marks = el('img', 'layer'); marks.src = s.marks; marks.alt = ''; box.appendChild(marks);
    if (state.back) box.appendChild(el('div', 'back-label', esc(T('backLabel'))));
  }

  function renderSummary() {
    var s = sheet(), f = fill(), cap = capacity(s.id);
    var c = $('capacity'); c.innerHTML = '';
    s.sizes.forEach(function (z) {
      var u = cap[z].used, t = cap[z].total;
      var d = el('div', 'cap' + (u >= t ? ' full' : ''));
      d.dataset.size = z;
      var pips = '';
      for (var k = 0; k < t; k++) pips += '<i' + (k < u ? ' class="on"' : '') + '></i>';
      d.innerHTML = '<div class="row"><span>' + esc(label(z)) + ' <small>' + mm(SIZE[z]) + '</small></span><b>' + u + '/' + t + '</b></div>' +
        '<div class="pips size-' + esc(z) + '" role="img" aria-label="' + esc(T('pipsAria', { u: u, t: t })) + '">' + pips + '</div>';
      c.appendChild(d);
    });
    var counts = $('counts'); counts.innerHTML = '';
    var tally = {};
    f.forEach(function (id) { if (id) tally[id] = (tally[id] || 0) + 1; });
    var ids = Object.keys(tally);
    if (!ids.length) counts.innerHTML = '<li class="empty">' + esc(T('emptySheet')) + '</li>';
    ids.sort(function (a, b) { return tally[b] - tally[a]; }).forEach(function (id) {
      counts.appendChild(el('li', '', '<span>' + esc(tokenName(TOKEN[id])) + '</span><b>' + tally[id] + '×</b>'));
    });
    var order = $('order'); order.innerHTML = '';
    DATA.sheets.forEach(function (sh) {
      var used = state.fill[sh.id].filter(Boolean).length;
      var li = el('li', '', '<span>' + esc(sheetName(sh)) + '</span><b>' + used + ' / ' + sh.slots.length + '</b>');
      order.appendChild(li);
    });
  }

  function render() { renderTabs(); renderLibrary(); renderSheet(); renderSummary(); renderOrder(); }

  /* ---------- drag & drop (pointer events: muis én touch) ---------- */
  var drag = null;

  function startDrag(e, src) {
    if (e.button != null && e.button !== 0) return;
    if (state.back || readOnly()) return;
    e.preventDefault();
    drag = { src: src, x0: e.clientX, y0: e.clientY, started: false, target: null, pointerId: e.pointerId };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', cancelDrag);
  }

  function beginVisual() {
    var t = TOKEN[drag.src.token], s = sheet(), size = SIZE[t.size];
    var rect = $('sheet').getBoundingClientRect();
    var scale = rect.width / s.w;
    var allowed = s.sizes.indexOf(t.size) >= 0;
    var g = el('div', 'drag-ghost');
    g.style.width = Math.max(48, size.w * scale) + 'px';
    g.style.height = Math.max(38, size.h * scale) + 'px';
    g.innerHTML = '<img src="' + esc(t.file) + '" alt="">';
    document.body.appendChild(g);
    drag.ghost = g; drag.started = true; drag.allowed = allowed;
    document.body.classList.add('is-dragging');
    var box = $('sheet'); box.classList.add('dragging');
    var f = fill();
    box.querySelectorAll('.slot').forEach(function (d) {
      var i = +d.dataset.index, slot = s.slots[i];
      if (slot.size !== t.size) d.classList.add('no');
      else if (!f[i] || drag.src.from === 'slot') d.classList.add(f[i] ? 'swap' : 'ok');
      else d.classList.add('swap');
    });
    if (drag.src.from === 'slot') {
      var origin = box.querySelector('.slot[data-index="' + drag.src.index + '"] img');
      if (origin) origin.style.opacity = '.3';
    }
  }

  function onMove(e) {
    if (!drag) return;
    if (!drag.started) {
      if (Math.abs(e.clientX - drag.x0) + Math.abs(e.clientY - drag.y0) < 5) return;
      beginVisual();
    }
    drag.ghost.style.left = e.clientX + 'px';
    drag.ghost.style.top = e.clientY + 'px';
    var under = document.elementFromPoint(e.clientX, e.clientY);
    var slotEl = under && under.closest ? under.closest('.slot') : null;
    var onSheet = under && under.closest ? !!under.closest('#sheet') : false;
    document.querySelectorAll('.slot.hover').forEach(function (d) { d.classList.remove('hover'); });
    if (slotEl) slotEl.classList.add('hover');
    drag.target = slotEl ? { slot: +slotEl.dataset.index } : (onSheet ? { sheet: true } : null);
    var removing = drag.src.from === 'slot' && !drag.target;
    drag.ghost.classList.toggle('denied', removing || !drag.allowed);
  }

  function onUp() {
    var d = drag; cleanup();
    if (!d || !d.started) return;
    var t = TOKEN[d.src.token], s = sheet(), f = fill();
    var tgt = d.target;
    if (d.src.from === 'lib') {
      if (!tgt) return;
      if (tgt.sheet) { addToken(t.id); return; }
      var slot = s.slots[tgt.slot];
      if (slot.size !== t.size) { wrongSize(t); return; }
      if (f[tgt.slot]) { var old = tokenName(TOKEN[f[tgt.slot]]); f[tgt.slot] = t.id; commit(); toast(T('toastReplaced', { old: old, name: tokenName(t) })); return; }
      addToken(t.id, tgt.slot);
      return;
    }
    // vanaf de sheet
    if (!tgt) { removeAt(d.src.index); toast(T('toastRemoved', { name: tokenName(t) })); return; }
    if (tgt.sheet || tgt.slot === d.src.index) { render(); return; }
    if (s.slots[tgt.slot].size !== t.size) { wrongSize(t); render(); return; }
    var other = f[tgt.slot];
    f[tgt.slot] = t.id; f[d.src.index] = other;
    commit();
  }

  function cancelDrag() { cleanup(); render(); }

  function cleanup() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', cancelDrag);
    if (drag && drag.ghost) drag.ghost.remove();
    document.body.classList.remove('is-dragging');
    var box = $('sheet');
    box.classList.remove('dragging');
    box.querySelectorAll('.slot').forEach(function (x) { x.classList.remove('ok', 'no', 'swap', 'hover'); var im = x.querySelector('img'); if (im) im.style.opacity = ''; });
    drag = null;
  }

  /* ---------- toast ---------- */
  var toastTimer;
  function toast(msg, warn) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast show' + (warn ? ' warn' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast' + (warn ? ' warn' : ''); }, 3200);
  }

  /* ---------- opslaan / openen ---------- */
  function download(name, text, type) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function save() {
    var out = { app: 'gfc-sheet-samensteller', version: 1, savedAt: new Date().toISOString(), sheets: {} };
    DATA.sheets.forEach(function (s) {
      out.sheets[s.id] = {
        name: s.name,
        slots: state.fill[s.id],
        totals: state.fill[s.id].reduce(function (acc, id) { if (id) acc[TOKEN[id].name] = (acc[TOKEN[id].name] || 0) + 1; return acc; }, {})
      };
    });
    var d = new Date(), stamp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    download(T('fileName') + '-' + stamp + '.json', JSON.stringify(out, null, 2), 'application/json');
  }

  function open(file) {
    if (locked()) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var data = JSON.parse(r.result);
        if (!data || !data.sheets) throw new Error();
        Object.keys(data.sheets).forEach(function (id) {
          if (!SHEET[id]) return;
          var v = data.sheets[id];
          state.fill[id] = sanitize(id, Array.isArray(v) ? v : v.slots);
        });
        commit();
        toast(T('toastOpened'));
      } catch (e) { toast(T('toastOpenError'), true); }
    };
    r.readAsText(file);
  }

  /* ---------- afdrukken ---------- */
  function buildPrint(sheetIds, withBack, withCut) {
    var root = $('print-root'); root.innerHTML = '';
    var first = SHEET[sheetIds[0]];
    $('page-size').textContent = '@page { size: ' + first.w + 'mm ' + first.h + 'mm; margin: 0; }';
    sheetIds.forEach(function (id) {
      var s = SHEET[id], f = state.fill[id];
      (withBack ? [false, true] : [false]).forEach(function (back) {
        var page = el('div', 'print-page' + (back ? ' back' : ''));
        page.style.width = s.w + 'mm'; page.style.height = s.h + 'mm';
        var inner = el('div', 'inner');
        var bg = el('img'); bg.src = s.bg; bg.style.cssText = 'left:0;top:0;width:100%;height:100%';
        inner.appendChild(bg);
        s.slots.forEach(function (slot, i) {
          if (f[i]) {
            var t = TOKEN[f[i]], im = el('img');
            im.src = t.file;
            im.style.cssText = 'left:' + slot.x + 'mm;top:' + slot.y + 'mm;width:' + slot.w + 'mm;height:' + slot.h + 'mm';
            if (back && !t.mirrorBack) im.className = 'flip';
            inner.appendChild(im);
          }
          if (withCut) {
            var c = el('div', 'cut');
            c.style.cssText = 'left:' + slot.x + 'mm;top:' + slot.y + 'mm;width:' + slot.w + 'mm;height:' + slot.h + 'mm';
            inner.appendChild(c);
          }
        });
        if (withCut) { var mk = el('img'); mk.src = s.marks; mk.style.cssText = 'left:0;top:0;width:100%;height:100%'; inner.appendChild(mk); }
        page.appendChild(inner);
        page.appendChild(el('div', 'label', esc(sheetName(s) + ' · ' + T(back ? 'back' : 'front') + ' · Global Fire Company')));
        root.appendChild(page);
      });
    });
    var imgs = Array.prototype.slice.call(root.querySelectorAll('img'));
    return Promise.all(imgs.map(function (im) {
      if (im.complete) return Promise.resolve();
      return new Promise(function (done) { im.onload = im.onerror = done; setTimeout(done, 5000); });
    }));
  }

  function setupPrint() {
    var dlg = $('print-dialog');
    var s0 = DATA.sheets[0];
    $('btn-print').onclick = function () {
      if (dlg.showModal) dlg.showModal(); else doPrint('current', true, true);
    };
    dlg.addEventListener('close', function () {
      if (dlg.returnValue !== 'ok') return;
      var which = dlg.querySelector('input[name="which"]:checked').value;
      doPrint(which, $('print-back').checked, $('print-cut').checked);
    });
  }

  function doPrint(which, withBack, withCut) {
    var ids = which === 'current' ? [state.current] : DATA.sheets.map(function (s) { return s.id; }).filter(function (id) { return state.fill[id].some(Boolean); });
    if (!ids.length) { toast(T('toastNothing'), true); return; }
    buildPrint(ids, withBack, withCut).then(function () { setTimeout(function () { window.print(); }, 50); });
  }

  /* ---------- vaste teksten + taalkeuze ---------- */
  function applyLang() {
    document.documentElement.lang = I18N[lang]._htmlLang;
    document.title = T('docTitle');
    document.querySelectorAll('[data-i18n]').forEach(function (n) { n.textContent = T(n.getAttribute('data-i18n')); });
    document.querySelectorAll('[data-i18n-title]').forEach(function (n) { n.title = T(n.getAttribute('data-i18n-title')); });
    var bt = document.querySelector('.brand-title'); if (bt) bt.setAttribute('data-text', T('appTitle'));
    var ph = $('print-hint'); if (ph) ph.textContent = T('printHint', { size: DATA.sheets[0].w + ' × ' + DATA.sheets[0].h + ' mm' });
    var sw = $('lang-switch'); sw.innerHTML = '';
    sw.setAttribute('aria-label', T('language'));
    LANGS.forEach(function (code) {
      var b = el('button', 'lang' + (code === lang ? ' on' : ''), esc(I18N[code]._label));
      b.type = 'button'; b.title = I18N[code]._name; b.lang = I18N[code]._htmlLang;
      b.setAttribute('aria-pressed', code === lang ? 'true' : 'false');
      b.onclick = function () {
        lang = code;
        try { localStorage.setItem(LANG_KEY, code); } catch (e) { }
        applyLang(); render();
      };
      sw.appendChild(b);
    });
  }


  /* ---------- bestellingen (alleen als api/orders.php bereikbaar is) ---------- */
  var API = 'api/orders.php', RECENT_KEY = 'gfc-sheet-samensteller-orders';
  var order = null;          // { code, status, customer, submittedAt, … } zodra er een bestelling open is
  var server = null;         // antwoord van ping, of null zonder server
  var saveTimer = null, saving = false, dirty = false, saveFailed = false;

  function readOnly() { return !!order && order.status !== 'draft'; }
  function locked() { if (readOnly()) { toast(T('toastLocked'), true); return true; } return false; }

  function parseApi(r) {
    return r.text().then(function (txt) {
      var d; try { d = JSON.parse(txt); } catch (e) { throw { error: 'offline' }; }
      if (!d || !d.ok) throw d || { error: 'offline' };
      return d;
    });
  }
  function apiGet(query) { return fetch(API + '?' + query, { cache: 'no-store' }).then(parseApi); }
  function apiPost(body) {
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(parseApi);
  }
  function errText(e) {
    var map = { not_found: 'errNotFound', bad_code: 'errBadCode', locked: 'toastLocked', rate_limited: 'errRateLimited',
      create_disabled: 'errCreateDisabled', customer_required: 'errCustomer', empty_order: 'toastNothing' };
    return T(map[e && e.error] || 'errOffline');
  }

  function normCode(v) {
    var c = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return c.length === 12 ? c.slice(0, 4) + '-' + c.slice(4, 8) + '-' + c.slice(8) : '';
  }
  function orderUrl(code) {
    return location.origin + location.pathname + '?order=' + encodeURIComponent(code);
  }
  function recent() { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter(function (r) { return r && normCode(r.code); }); } catch (e) { return []; } }
  function remember(o) {
    try {
      var list = recent().filter(function (r) { return r.code !== o.code; });
      list.unshift({ code: o.code, name: o.customer.company || o.customer.name || '', at: new Date().toISOString() });
      localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 5)));
    } catch (e) { }
  }

  function payloadSheets() { var out = {}; DATA.sheets.forEach(function (s) { out[s.id] = state.fill[s.id]; }); return out; }

  function scheduleSave() {
    dirty = true; renderOrderState();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 700);
  }
  function saveNow(extra) {
    if (!order || readOnly()) return Promise.resolve();
    if (saving) { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 400); return Promise.resolve(); }
    clearTimeout(saveTimer);
    saving = true; dirty = false; renderOrderState();
    var body = { action: 'save', code: order.code, sheets: payloadSheets(), lang: lang };
    if (extra) Object.keys(extra).forEach(function (k) { body[k] = extra[k]; });
    return apiPost(body).then(function (d) {
      saving = false; saveFailed = false; order.status = d.order.status; order.customer = d.order.customer;
      renderOrderState();
    }, function (e) {
      saving = false; dirty = true; saveFailed = true;
      if (e && e.error === 'locked') { reloadOrder(); return; }
      renderOrderState();
      clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 5000);
    });
  }

  function applyOrder(o) {
    order = o;
    DATA.sheets.forEach(function (s) { state.fill[s.id] = sanitize(s.id, o.sheets && o.sheets[s.id]); });
    remember(o);
    if (history.replaceState && !new RegExp('[?&]order=' + o.code + '(&|$)').test(location.search)) history.replaceState(null, '', orderUrl(o.code));
    render();
  }
  function loadOrder(code) {
    return apiGet('action=get&code=' + encodeURIComponent(code)).then(function (d) { applyOrder(d.order); });
  }
  function reloadOrder() { if (order) loadOrder(order.code).then(function () { toast(T('toastLocked'), true); }, function () { }); }

  function renderOrderState() {
    var st = $('order-state'); if (!st || !order) return;
    var key = readOnly() ? (order.status === 'done' ? 'stDone' : 'stSubmitted') : saveFailed ? 'stOffline' : (saving || dirty) ? 'stSaving' : 'stSaved';
    st.textContent = T(key);
    st.className = 'oc-state ' + key;
  }

  function fmtDate(iso) {
    try { return new Date(iso).toLocaleString(I18N[lang]._htmlLang, { dateStyle: 'long', timeStyle: 'short' }); } catch (e) { return iso; }
  }

  function renderOrder() {
    var on = !!order;
    $('order-chip').hidden = !on;
    $('btn-submit').hidden = !on || readOnly();
    $('btn-print').classList.toggle('primary', !on || readOnly());
    $('btn-print').classList.toggle('ghost', on && !readOnly());
    $('btn-load').hidden = on;   // bij een bestelling slaat de server alles op
    $('btn-save').hidden = on && readOnly();
    $('btn-save').title = T(on ? 'saveOrderTitle' : 'saveTitle');
    $('btn-clear').hidden = readOnly();
    document.body.classList.toggle('readonly', readOnly());
    var banner = $('order-banner');
    if (on && readOnly()) {
      banner.hidden = false;
      banner.innerHTML = '<b>' + esc(T(order.status === 'done' ? 'bannerDoneTitle' : 'bannerTitle')) + '</b> ' +
        esc(T('bannerText', { date: fmtDate(order.submittedAt || order.updatedAt), code: order.code }));
    } else banner.hidden = true;
    if (on) { $('order-code').textContent = order.code; renderOrderState(); }
  }

  /* startscherm: nieuwe bestelling of bestaande code */
  function showStart(msg) {
    var dlg = $('start-dialog');
    $('start-new').hidden = !server.publicCreate;
    $('start-intro').textContent = T(server.publicCreate ? 'startIntro' : 'startIntroLink');
    $('start-error').textContent = msg || '';
    var list = recent(), ul = $('start-recent-list'); ul.innerHTML = '';
    $('start-recent').hidden = !list.length;
    list.forEach(function (r) {
      var li = el('li'), b = el('button', 'btn ghost small', '<span>' + esc(r.code) + '</span>' + (r.name ? ' <small>' + esc(r.name) + '</small>' : ''));
      b.type = 'button';
      b.onclick = function () { openCode(r.code); };
      li.appendChild(b); ul.appendChild(li);
    });
    if (!dlg.open) { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); }
  }
  function openCode(code) {
    var c = normCode(code);
    if (!c) { $('start-error').textContent = T('errBadCode'); return; }
    $('start-error').textContent = '';
    loadOrder(c).then(function () { $('start-dialog').close(); toast(T('toastOrderOpened', { code: c })); },
      function (e) { $('start-error').textContent = errText(e); });
  }

  function openSubmit() {
    if (locked()) return;
    var any = DATA.sheets.some(function (s) { return state.fill[s.id].some(Boolean); });
    if (!any) { toast(T('toastNothing'), true); return; }
    var f = $('submit-form'), c = order.customer || {};
    ['name', 'company', 'email', 'phone', 'reference', 'notes'].forEach(function (k) { f.elements[k].value = c[k] || ''; });
    var ul = $('submit-summary'); ul.innerHTML = '';
    DATA.sheets.forEach(function (s) {
      var used = state.fill[s.id].filter(Boolean).length;
      if (used) ul.appendChild(el('li', '', '<span>' + esc(sheetName(s)) + '</span><b>' + used + ' / ' + s.slots.length + '</b>'));
    });
    $('submit-error').textContent = '';
    $('submit-dialog').showModal();
  }
  function formCustomer() {
    var f = $('submit-form'), c = {};
    ['name', 'company', 'email', 'phone', 'reference', 'notes'].forEach(function (k) { c[k] = f.elements[k].value.trim(); });
    return c;
  }

  function setupOrders() {
    $('order-code').onclick = function () {
      var url = orderUrl(order.code);
      var done = function () { toast(T('toastLinkCopied')); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { prompt(T('copyLink'), url); });
      else prompt(T('copyLink'), url);
    };
    $('btn-submit').onclick = openSubmit;
    $('submit-cancel').onclick = function () {
      if (order && !readOnly()) { order.customer = formCustomer(); saveNow({ customer: order.customer }); }
      $('submit-dialog').close();
    };
    $('submit-form').onsubmit = function (e) {
      e.preventDefault();
      var f = e.target, c = formCustomer();
      if (!c.name || !f.elements.email.checkValidity() || !c.email) {
        $('submit-error').textContent = T('errCustomer');
        (c.name ? f.elements.email : f.elements.name).focus();
        return;
      }
      var go = $('submit-go'); go.disabled = true;
      clearTimeout(saveTimer);
      apiPost({ action: 'submit', code: order.code, sheets: payloadSheets(), customer: c, lang: lang }).then(function (d) {
        go.disabled = false; dirty = false; saveFailed = false;
        $('submit-dialog').close();
        applyOrder(d.order);
        toast(T('toastSubmitted'));
      }, function (err) {
        go.disabled = false;
        $('submit-error').textContent = errText(err);
        if (err && err.error === 'locked') { $('submit-dialog').close(); reloadOrder(); }
      });
    };
    $('start-dialog').addEventListener('cancel', function (e) { e.preventDefault(); });
    $('start-create').onclick = function () {
      var b = $('start-create'); b.disabled = true;
      apiPost({ action: 'create', lang: lang }).then(function (d) {
        b.disabled = false; $('start-dialog').close();
        applyOrder(d.order);
        toast(T('toastOrderCreated', { code: d.order.code }));
      }, function (e) { b.disabled = false; $('start-error').textContent = errText(e); });
    };
    $('start-form').onsubmit = function (e) { e.preventDefault(); openCode($('start-code').value); };
    window.addEventListener('beforeunload', function (e) {
      if (order && (dirty || saving)) { saveNow(); e.preventDefault(); e.returnValue = ''; }
    });
  }

  function startOrders() {
    var m = /[?&]order=([A-Za-z0-9-]+)/.exec(location.search), code = m ? normCode(decodeURIComponent(m[1])) : '';
    var timeout = new Promise(function (_, no) { setTimeout(function () { no({ error: 'offline' }); }, 6000); });
    Promise.race([apiGet('action=ping'), timeout]).then(function (d) {
      server = d;
      document.body.classList.add('has-orders');
      if (code) loadOrder(code).catch(function (e) { showStart(errText(e)); });
      else showStart();
    }, function () { /* geen server: lokale modus zoals voorheen */ });
  }

  /* ---------- init ---------- */
  load();
  $('opt-back').onchange = function (e) { state.back = e.target.checked; renderSheet(); };
  var clearArmed = null;
  $('btn-clear').onclick = function () {
    if (locked()) return;
    var b = $('btn-clear');
    if (!fill().some(Boolean)) { toast(T('toastAlreadyEmpty')); return; }
    if (clearArmed !== state.current) {
      clearArmed = state.current; b.textContent = T('clearConfirm'); b.classList.add('armed');
      setTimeout(function () { clearArmed = null; b.textContent = T('clear'); b.classList.remove('armed'); }, 3000);
      return;
    }
    clearArmed = null; b.textContent = T('clear'); b.classList.remove('armed');
    state.fill[state.current] = emptyFill(sheet()); commit(); toast(T('toastCleared', { sheet: sheetName(sheet()) }));
  };
  $('btn-save').onclick = function () {
    if (!order) { save(); return; }
    saveNow().then(function () { toast(saveFailed ? T('errOffline') : T('toastSavedOrder'), saveFailed); });
  };
  $('btn-load').onclick = function () { $('file-load').click(); };
  $('file-load').onchange = function (e) { if (e.target.files[0]) open(e.target.files[0]); e.target.value = ''; };
  setupPrint();
  setupOrders();
  applyLang();
  render();
  startOrders();
})();
