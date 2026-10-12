/* Global Fire Company – sheet samensteller
 * Statische webapp: geen server nodig. Alle data staat in js/data.js.
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
  var adj = function (id) { return SIZE[id].adj || SIZE[id].label.toLowerCase(); };

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
    toast('Vol is vol: alle ' + adj(sizeId) + ' vakken (' + mm(SIZE[sizeId]) + ') op deze sheet zijn bezet.', true);
    var c = document.querySelector('.cap[data-size="' + sizeId + '"]');
    if (c) { c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); }
  }

  function addToken(tokenId, slotIndex) {
    var t = TOKEN[tokenId], s = sheet();
    if (s.sizes.indexOf(t.size) < 0) { toast(t.name + ' past niet op ' + s.name + '.', true); return false; }
    var i = slotIndex != null ? slotIndex : firstFree(t.size);
    if (i < 0) { fullMessage(t.size); return false; }
    if (s.slots[i].size !== t.size) { wrongSize(t); return false; }
    fill()[i] = tokenId;
    commit();
    return true;
  }

  function fillRest(tokenId) {
    var t = TOKEN[tokenId], n = 0, i;
    while ((i = firstFree(t.size)) >= 0) { fill()[i] = tokenId; n++; }
    if (!n) { fullMessage(t.size); return; }
    commit();
    toast(n + '× ' + t.name + ' toegevoegd. De ' + adj(t.size) + ' vakken zijn nu vol.');
  }

  function removeAt(i) { fill()[i] = null; commit(); }

  function wrongSize(t) {
    toast(t.name + ' is ' + SIZE[t.size].label.toLowerCase() + ' (' + mm(SIZE[t.size]) + ') en past alleen in vakken van die maat.', true);
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
      b.innerHTML = '<span class="t-name">' + esc(s.name) + '</span>' +
        '<span class="t-meta">' + s.sizes.map(function (z) { return esc(SIZE[z].label); }).join(' + ') + '</span>' +
        '<span class="t-meta t-fill' + (used === total ? ' full' : '') + '">' + used + ' / ' + total + ' gevuld</span>';
      b.onclick = function () { state.current = s.id; persist(); render(); };
      tabs.appendChild(b);
    });
  }

  function renderLibrary() {
    var s = sheet(), f = fill(), lib = $('library'); lib.innerHTML = '';
    var cap = capacity(s.id);
    $('lib-hint').textContent = 'Op ' + s.name + ' passen: ' + s.sizes.map(function (z) { return SIZE[z].label.toLowerCase() + ' (' + mm(SIZE[z]) + ')'; }).join(' en ') + '.';
    s.sizes.forEach(function (z) {
      var g = el('div', 'size-group');
      g.innerHTML = '<h3>' + esc(SIZE[z].label) + ' <small>' + mm(SIZE[z]) + '</small></h3>';
      var wide = SIZE[z].w > 60;
      var grid = el('div', 'cards' + (wide ? ' wide' : ''));
      var full = cap[z].used >= cap[z].total;
      DATA.tokens.filter(function (t) { return t.size === z; }).forEach(function (t) {
        var count = f.filter(function (x) { return x === t.id; }).length;
        var c = el('div', 'card');
        c.innerHTML = '<div class="thumb" title="Sleep naar de sheet"><img src="' + esc(t.file) + '" alt="' + esc(t.name) + '" draggable="false"></div>' +
          '<div class="meta"><span class="name" title="' + esc(t.name) + '">' + esc(t.name) + '</span>' + (count ? '<span class="badge">' + count + '×</span>' : '') + '</div>' +
          '<div class="btns"><button type="button" class="add" title="Eén toevoegen" aria-label="' + esc(t.name) + ' toevoegen">+</button>' +
          '<button type="button" class="rest" title="Alle lege ' + esc(adj(z)) + ' vakken hiermee vullen" aria-label="Lege vakken vullen met ' + esc(t.name) + '">⇉</button></div>';
        var add = c.querySelector('.add'), rest = c.querySelector('.rest');
        add.onclick = function () { addToken(t.id); };
        rest.onclick = function () { fillRest(t.id); };
        if (full) { add.title = rest.title = 'Vol is vol'; }
        c.querySelector('.thumb').addEventListener('pointerdown', function (e) { startDrag(e, { from: 'lib', token: t.id }); });
        grid.appendChild(c);
      });
      g.appendChild(grid);
      lib.appendChild(g);
    });
  }

  function renderSheet() {
    var s = sheet(), f = fill(), box = $('sheet');
    $('sheet-title').textContent = s.name + (state.back ? ' · achterkant' : '');
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
        var img = el('img'); img.src = t.file; img.alt = t.name; img.draggable = false;
        if (state.back && !t.mirrorBack) img.className = 'flip';
        d.appendChild(img);
        d.title = t.name;
        if (!state.back) {
          var rm = el('button', 'rm', '×'); rm.type = 'button'; rm.setAttribute('aria-label', t.name + ' verwijderen');
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
    if (state.back) box.appendChild(el('div', 'back-label', 'Achterkant (gespiegeld, zoals hij gedrukt wordt)'));
  }

  function renderSummary() {
    var s = sheet(), f = fill(), cap = capacity(s.id);
    var c = $('capacity'); c.innerHTML = '';
    s.sizes.forEach(function (z) {
      var u = cap[z].used, t = cap[z].total;
      var d = el('div', 'cap' + (u >= t ? ' full' : ''));
      d.dataset.size = z;
      d.innerHTML = '<div class="row"><span>' + esc(SIZE[z].label) + ' <small>(' + mm(SIZE[z]) + ')</small></span><b>' + u + ' / ' + t + '</b></div><div class="bar"><i style="width:' + pct(u, t) + '"></i></div>';
      c.appendChild(d);
    });
    var counts = $('counts'); counts.innerHTML = '';
    var tally = {};
    f.forEach(function (id) { if (id) tally[id] = (tally[id] || 0) + 1; });
    var ids = Object.keys(tally);
    if (!ids.length) counts.innerHTML = '<li class="empty">Nog leeg. Sleep elementen naar de sheet.</li>';
    ids.sort(function (a, b) { return tally[b] - tally[a]; }).forEach(function (id) {
      counts.appendChild(el('li', '', '<span>' + esc(TOKEN[id].name) + '</span><b>' + tally[id] + '×</b>'));
    });
    var order = $('order'); order.innerHTML = '';
    DATA.sheets.forEach(function (sh) {
      var used = state.fill[sh.id].filter(Boolean).length;
      var li = el('li', '', '<span>' + esc(sh.name) + '</span><b>' + used + ' / ' + sh.slots.length + '</b>');
      order.appendChild(li);
    });
  }

  function render() { renderTabs(); renderLibrary(); renderSheet(); renderSummary(); }

  /* ---------- drag & drop (pointer events: muis én touch) ---------- */
  var drag = null;

  function startDrag(e, src) {
    if (e.button != null && e.button !== 0) return;
    if (state.back) return;
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
      if (f[tgt.slot]) { var old = TOKEN[f[tgt.slot]].name; f[tgt.slot] = t.id; commit(); toast(old + ' vervangen door ' + t.name + '.'); return; }
      addToken(t.id, tgt.slot);
      return;
    }
    // vanaf de sheet
    if (!tgt) { removeAt(d.src.index); toast(t.name + ' verwijderd.'); return; }
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
    download('gfc-bestelling-' + stamp + '.json', JSON.stringify(out, null, 2), 'application/json');
  }

  function open(file) {
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
        toast('Bestelling geopend.');
      } catch (e) { toast('Dit bestand kan niet worden geopend.', true); }
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
        page.appendChild(el('div', 'label', esc(s.name + ' · ' + (back ? 'achterkant' : 'voorkant') + ' · Global Fire Company')));
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
    $('print-size').textContent = s0.w + ' × ' + s0.h + ' mm';
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
    if (!ids.length) { toast('Er staan nog geen elementen op een sheet.', true); return; }
    buildPrint(ids, withBack, withCut).then(function () { setTimeout(function () { window.print(); }, 50); });
  }

  /* ---------- init ---------- */
  load();
  $('opt-back').onchange = function (e) { state.back = e.target.checked; renderSheet(); };
  var clearArmed = null;
  $('btn-clear').onclick = function () {
    var b = $('btn-clear');
    if (!fill().some(Boolean)) { toast('Deze sheet is al leeg.'); return; }
    if (clearArmed !== state.current) {
      clearArmed = state.current; b.textContent = 'Klik nogmaals om te legen'; b.classList.add('armed');
      setTimeout(function () { clearArmed = null; b.textContent = 'Sheet leegmaken'; b.classList.remove('armed'); }, 3000);
      return;
    }
    clearArmed = null; b.textContent = 'Sheet leegmaken'; b.classList.remove('armed');
    state.fill[state.current] = emptyFill(sheet()); commit(); toast(sheet().name + ' is leeggemaakt.');
  };
  $('btn-save').onclick = save;
  $('btn-load').onclick = function () { $('file-load').click(); };
  $('file-load').onchange = function (e) { if (e.target.files[0]) open(e.target.files[0]); e.target.value = ''; };
  setupPrint();
  render();
})();
