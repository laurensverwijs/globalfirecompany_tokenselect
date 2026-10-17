/* Global Fire Company – overzicht van bestellingen (admin.html).
 * Praat met api/orders.php. Inloggen per gebruiker geeft een sessietoken; rol 'admin' ziet alles, rol 'user' alleen orders.
 */
(function () {
  'use strict';

  var DATA = window.GFC_DATA, I18N = window.GFC_I18N, LANGS = Object.keys(I18N);
  var API = 'api/orders.php', SESSION_KEY = 'gfc-admin-session', LANG_KEY = 'gfc-sheet-samensteller-lang';
  var TOKEN = {}; DATA.tokens.forEach(function (t) { TOKEN[t.id] = t; });
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  var lang = (function () {
    try { var s = localStorage.getItem(LANG_KEY); if (I18N[s]) return s; } catch (e) { }
    return 'nl';
  })();
  function T(key, p) {
    var s = I18N[lang][key]; if (s == null) s = I18N.nl[key]; if (s == null) return key;
    return String(s).replace(/\{(\w+)\}/g, function (_, k) { return p && p[k] != null ? p[k] : ''; });
  }
  function tokenName(id) {
    var t = TOKEN[id]; if (!t) return id;
    if (t['name_' + lang]) return t['name_' + lang];
    var L = I18N[lang], m = /^(.*?)(?: type (\d+))?$/.exec(t.name), base = (L.names && L.names[m[1]]) || m[1];
    return m[2] ? base + ' ' + (L.typeWord || 'type') + ' ' + m[2] : base;
  }
  function sheetName(id) {
    for (var i = 0; i < DATA.sheets.length; i++) if (DATA.sheets[i].id === id) return T('sheet', { n: i + 1 });
    return id;
  }
  function fmtDate(iso) {
    try { return new Date(iso).toLocaleString(I18N[lang]._htmlLang, { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return iso; }
  }
  function appUrl(code, l) {
    var base = location.href.replace(/[?#].*$/, '').replace(/admin\.html$/, '');
    return base + '?order=' + code + (l ? '&lang=' + l : '');
  }

  var toastTimer;
  function toast(msg, warn) {
    var t = $('toast'); t.textContent = msg; t.className = 'toast show' + (warn ? ' warn' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.className = 'toast'; }, 3200);
  }
  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast(T('toastLinkCopied')); }, function () { prompt(T('copyLink'), text); });
    else prompt(T('copyLink'), text);
  }

  var token = '', me = null;
  try { var saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); if (saved && saved.token) { token = saved.token; me = saved.user; } } catch (e) { }
  function setSession(t, u) {
    token = t; me = u;
    try { if (t) sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: t, user: u })); else sessionStorage.removeItem(SESSION_KEY); } catch (e) { }
  }
  function isAdmin() { return !!(me && me.role === 'admin'); }
  var orders = [], open = {};
  // link uit de e-mail: admin.html?order=CODE toont die order meteen, met de PDF-knop
  var focus = (function () { var m = /[?&]order=([A-Z0-9-]{14})/i.exec(location.search); return m ? m[1].toUpperCase() : ''; })();

  function call(body) {
    if (token) body.token = token;
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.text(); })
      .then(function (txt) {
        var d; try { d = JSON.parse(txt); } catch (e) { throw { error: 'offline' }; }
        if (!d.ok) throw d;
        return d;
      });
  }

  function show(view) {
    $('login').hidden = view !== 'login';
    $('board').hidden = view !== 'board';
    $('disabled').hidden = view !== 'disabled' && view !== 'offline';
    $('btn-logout').hidden = view !== 'board';
    $('btn-mypw').hidden = view !== 'board' || !me || me.master;
    $('who').hidden = view !== 'board';
    if (me) $('who').textContent = T('adminWho', { name: me.name, role: T('role_' + me.role) });
    ['btn-testmail', 'btn-hash', 'users-panel'].forEach(function (id) { $(id).hidden = view !== 'board' || !isAdmin(); });
    if (view !== 'board') { $('mypw-form').hidden = true; $('hash-form').hidden = true; }
    if (view === 'disabled' || view === 'offline') {
      $('disabled-text').textContent = T(view === 'disabled' ? 'adminDisabled' : 'adminOffline');
    }
  }

  function handleError(e) {
    if (e && e.error === 'bad_password') { setSession('', null); show('login'); $('login-error').textContent = T('adminBadPassword'); return; }
    if (e && e.error === 'rate_limited') { setSession('', null); show('login'); $('login-error').textContent = T('adminLocked'); return; }
    if (e && e.error && T('err_' + e.error) !== 'err_' + e.error) { toast(T('err_' + e.error), true); return; }
    if (e && e.error === 'admin_disabled') { show('disabled'); return; }
    if (e && e.error === 'offline') { show('offline'); return; }
    toast(T('errOffline'), true);
  }

  function refresh() {
    return call({ action: 'list' }).then(function (d) {
      orders = d.orders; show('board');
      if (isAdmin()) loadUsers();
      if (focus) {
        var hit = orders.some(function (o) { return o.code === focus; });
        if (hit) { $('q').value = focus; $('filter').value = ''; open[focus] = true; }
        else toast(T('errNotFound'), true);
      }
      renderRows();
      if (focus) {
        var row = document.querySelector('tr.focus');
        if (row) row.scrollIntoView({ block: 'center' });
        focus = '';
      }
    }, handleError);
  }

  function matches(o) {
    var f = $('filter').value, q = $('q').value.trim().toLowerCase();
    if (f && o.status !== f) return false;
    if (!q) return true;
    var c = o.customer || {};
    return [o.code, c.name, c.company, c.email, c.reference].join(' ').toLowerCase().indexOf(q) >= 0;
  }

  function renderRows() {
    var tb = $('rows'); tb.innerHTML = '';
    var list = orders.filter(matches);
    $('empty').hidden = list.length > 0;
    list.forEach(function (o) {
      var c = o.customer || {};
      var tr = document.createElement('tr');
      tr.className = 'st-' + o.status + (o.code === focus ? ' focus' : '');
      var who = (c.company || c.name) ? esc([c.company, c.name].filter(Boolean).join(' · ')) : '<span class="muted">' + esc(T('adminNoName')) + '</span>';
      var opts = ['draft', 'submitted', 'done'].map(function (s) { return '<option value="' + s + '"' + (s === o.status ? ' selected' : '') + '>' + esc(T('status_' + s)) + '</option>'; }).join('');
      tr.innerHTML = '<td><a class="code" href="' + esc(appUrl(o.code)) + '" target="_blank" rel="noopener">' + esc(o.code) + '</a></td>' +
        '<td>' + who + (c.email ? '<br><a class="muted" href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : '') + '</td>' +
        '<td><select class="status" aria-label="' + esc(T('adminStatus')) + '">' + opts + '</select></td>' +
        '<td class="num">' + o.filled + '</td>' +
        '<td>' + esc(fmtDate(o.updatedAt)) + (o.submittedAt ? '<br><span class="muted">' + esc(T('adminSubmittedAt', { date: fmtDate(o.submittedAt) })) + '</span>' : '') + '</td>' +
        '<td class="row-actions">' + (o.status !== 'draft' && o.filled ? '<button class="btn primary small" data-act="pdf">' + esc(T('pdfDownload')) + '</button>' : '') +
        '<button class="btn ghost small" data-act="details">' + esc(T(open[o.code] ? 'adminHide' : 'adminDetails')) + '</button>' +
        '<button class="btn ghost small" data-act="copy">' + esc(T('copyLink')) + '</button>' +
        (isAdmin() ? '<button class="btn ghost small" data-act="delete">' + esc(T('adminDelete')) + '</button>' : '') + '</td>';
      tr.querySelector('.status').onchange = function (e) {
        call({ action: 'status', code: o.code, status: e.target.value }).then(function (d) {
          o.status = d.order.status; o.updatedAt = d.order.updatedAt; renderRows(); toast(T('adminStatusSaved'));
        }, handleError);
      };
      var pdf = tr.querySelector('[data-act="pdf"]');
      if (pdf) pdf.onclick = function () { makePdf(o.code, pdf); };
      tr.querySelector('[data-act="details"]').onclick = function () { open[o.code] = !open[o.code]; renderRows(); };
      tr.querySelector('[data-act="copy"]').onclick = function () { copy(appUrl(o.code, o.lang)); };
      var del = tr.querySelector('[data-act="delete"]');
      if (del) del.onclick = function () {
        if (!del.classList.contains('armed')) {
          del.classList.add('armed'); del.textContent = T('adminDeleteConfirm');
          setTimeout(function () { del.classList.remove('armed'); del.textContent = T('adminDelete'); }, 3000);
          return;
        }
        call({ action: 'delete', code: o.code }).then(function () {
          orders = orders.filter(function (x) { return x.code !== o.code; }); renderRows(); toast(T('adminDeleted', { code: o.code }));
        }, handleError);
      };
      tb.appendChild(tr);
      if (open[o.code]) tb.appendChild(detailsRow(o));
    });
  }

  function makePdf(code, btn) {
    btn.disabled = true; btn.textContent = T('pdfBusy');
    fetch(API + '?action=get&code=' + encodeURIComponent(code), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d.ok) throw d;
      return window.GFC_PDF.download(d.order, { T: T, tokenName: tokenName, sheetName: sheetName, date: fmtDate });
    }).then(function () {
      btn.disabled = false; btn.textContent = T('pdfDownload');
    }, function (e) {
      btn.disabled = false; btn.textContent = T('pdfDownload');
      if (window.console) console.error(e);
      toast(T('pdfError'), true);
    });
  }

  function detailsRow(o) {
    var tr = document.createElement('tr'), c = o.customer || {};
    tr.className = 'details';
    var html = '<td colspan="6"><div class="details-grid">';
    var ids = Object.keys(o.totals || {});
    if (!ids.length) html += '<p class="muted">' + esc(T('toastNothing')) + '</p>';
    ids.forEach(function (sid) {
      var tally = o.totals[sid], keys = Object.keys(tally).sort(function (a, b) { return tally[b] - tally[a]; });
      html += '<div><h3>' + esc(sheetName(sid)) + '</h3><ul class="counts">' +
        keys.map(function (k) { return '<li><span>' + esc(tokenName(k)) + '</span><b>' + tally[k] + '×</b></li>'; }).join('') + '</ul></div>';
    });
    if (o.createdBy && o.createdBy !== 'customer') html += '<div><h3>' + esc(T('adminHistory')) + '</h3><ul class="counts">' +
      [{ at: o.createdAt, by: o.createdBy, what: 'created' }].concat((o.log || []).filter(function (l) { return l.what !== 'created'; })).map(function (l) {
        var what = l.what.indexOf('status:') === 0 ? T('status_' + l.what.slice(7)) : T('log_' + l.what);
        return '<li><span>' + esc(fmtDate(l.at)) + ' · ' + esc(what) + '</span><b>' + esc(l.by === 'customer' ? T('logCustomer') : l.by) + '</b></li>';
      }).join('') + '</ul></div>';
    var info = [['fPhone', c.phone], ['fReference', c.reference], ['adminLang', o.lang ? o.lang.toUpperCase() : ''], ['fNotes', c.notes]].filter(function (x) { return x[1]; });
    if (info.length) html += '<div><h3>' + esc(T('adminCustomer')) + '</h3><dl>' + info.map(function (x) { return '<dt>' + esc(T(x[0])) + '</dt><dd>' + esc(x[1]) + '</dd>'; }).join('') + '</dl></div>';
    html += '</div><p><a class="btn small" href="' + esc(appUrl(o.code)) + '" target="_blank" rel="noopener">' + esc(T('adminOpenPrint')) + '</a></p></td>';
    tr.innerHTML = html;
    return tr;
  }

  function csv() {
    var rows = [['code', 'status', 'name', 'company', 'email', 'phone', 'reference', 'notes', 'created', 'submitted', 'sheet', 'element', 'count']];
    orders.filter(matches).forEach(function (o) {
      var c = o.customer || {}, base = [o.code, o.status, c.name, c.company, c.email, c.phone, c.reference, c.notes, o.createdAt, o.submittedAt || ''];
      var any = false;
      Object.keys(o.totals || {}).forEach(function (sid) {
        Object.keys(o.totals[sid]).forEach(function (k) { any = true; rows.push(base.concat([sheetName(sid), tokenName(k), o.totals[sid][k]])); });
      });
      if (!any) rows.push(base.concat(['', '', 0]));
    });
    var text = '﻿' + rows.map(function (r) { return r.map(function (v) { v = String(v == null ? '' : v); return /[";\n,]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(';'); }).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.download = 'gfc-orders-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }

  function applyLang() {
    document.documentElement.lang = I18N[lang]._htmlLang;
    document.title = T('adminTitle') + ' · Global Fire Company';
    document.querySelectorAll('[data-i18n]').forEach(function (n) { n.textContent = T(n.getAttribute('data-i18n')); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (n) { n.placeholder = T(n.getAttribute('data-i18n-placeholder')); });
    var bt = document.querySelector('.brand-title'); if (bt) bt.setAttribute('data-text', T('adminTitle'));
    var sel = $('new-lang'), cur = sel.value || lang; sel.innerHTML = '';
    LANGS.forEach(function (code) { var o = document.createElement('option'); o.value = code; o.textContent = I18N[code]._name; if (code === cur) o.selected = true; sel.appendChild(o); });
    var sw = $('lang-switch'); sw.innerHTML = ''; sw.setAttribute('aria-label', T('language'));
    LANGS.forEach(function (code) {
      var b = document.createElement('button');
      b.className = 'lang' + (code === lang ? ' on' : ''); b.type = 'button'; b.textContent = I18N[code]._label; b.title = I18N[code]._name;
      b.onclick = function () { lang = code; try { localStorage.setItem(LANG_KEY, code); } catch (e) { } applyLang(); renderRows(); };
      sw.appendChild(b);
    });
  }

  $('login-form').onsubmit = function (e) {
    e.preventDefault(); $('login-error').textContent = '';
    call({ action: 'login', username: $('user').value.trim(), password: $('pw').value }).then(function (d) {
      $('pw').value = ''; setSession(d.token, d.user); refresh();
    }, handleError);
  };
  $('btn-logout').onclick = function () {
    if (token) call({ action: 'logout' }).catch(function () { });
    setSession('', null); orders = []; users = []; show('login');
  };

  /* ---------- gebruikers (alleen rol admin) ---------- */
  var users = [];
  function loadUsers() { return call({ action: 'users' }).then(function (d) { users = d.users; renderUsers(); }, handleError); }
  function roleOptions(cur) { return ['user', 'admin'].map(function (r) { return '<option value="' + r + '"' + (r === cur ? ' selected' : '') + '>' + esc(T('role_' + r)) + '</option>'; }).join(''); }
  function renderUsers() {
    var tb = $('user-rows'); tb.innerHTML = '';
    $('users-empty').hidden = users.length > 0;
    users.forEach(function (u) {
      var tr = document.createElement('tr');
      tr.className = u.active ? '' : 'inactive';
      tr.innerHTML = '<td><b>' + esc(u.name) + '</b></td>' +
        '<td><select class="role" aria-label="' + esc(T('userRole')) + '">' + roleOptions(u.role) + '</select></td>' +
        '<td>' + esc(u.active ? T('userActive') : T('userBlocked')) + '</td>' +
        '<td>' + (u.lastLogin ? esc(fmtDate(u.lastLogin)) : '<span class="muted">–</span>') + '</td>' +
        '<td class="row-actions"><button class="btn ghost small" data-act="reset">' + esc(T('userReset')) + '</button>' +
        '<button class="btn ghost small" data-act="block">' + esc(T(u.active ? 'userBlock' : 'userUnblock')) + '</button>' +
        '<button class="btn ghost small" data-act="delete">' + esc(T('adminDelete')) + '</button></td>';
      var save = function (extra) {
        return call(Object.assign({ action: 'user_save', name: u.name, role: tr.querySelector('.role').value }, extra || {})).then(function (d) { users = d.users; renderUsers(); toast(T('userSaved')); }, handleError);
      };
      tr.querySelector('.role').onchange = function () { save(); };
      tr.querySelector('[data-act="block"]').onclick = function () { save({ active: !u.active }); };
      tr.querySelector('[data-act="reset"]').onclick = function () {
        var p = prompt(T('userResetPrompt', { name: u.name }));
        if (p == null) return;
        if (p.length < 12) { toast(T('hashTooShort'), true); return; }
        save({ password: p });
      };
      var del = tr.querySelector('[data-act="delete"]');
      del.onclick = function () {
        if (!del.classList.contains('armed')) {
          del.classList.add('armed'); del.textContent = T('adminDeleteConfirm');
          setTimeout(function () { del.classList.remove('armed'); del.textContent = T('adminDelete'); }, 3000);
          return;
        }
        call({ action: 'user_delete', name: u.name }).then(function (d) { users = d.users; renderUsers(); }, handleError);
      };
      tb.appendChild(tr);
    });
  }
  $('user-form').onsubmit = function (e) {
    e.preventDefault();
    var f = e.target, name = f.elements.name.value.trim().toLowerCase(), p = f.elements.password.value;
    $('user-error').textContent = '';
    if (!/^[a-z0-9._@-]{2,60}$/.test(name) || name === 'admin') { $('user-error').textContent = T('err_bad_username'); return; }
    if (p.length < 12) { $('user-error').textContent = T('hashTooShort'); return; }
    if (users.some(function (u) { return u.name === name; })) { $('user-error').textContent = T('userExists'); return; }
    call({ action: 'user_save', name: name, role: f.elements.role.value, password: p }).then(function (d) {
      users = d.users; renderUsers(); f.reset(); toast(T('userCreated', { name: name }));
    }, handleError);
  };

  /* ---------- eigen wachtwoord wijzigen ---------- */
  $('btn-mypw').onclick = function () { var f = $('mypw-form'); f.hidden = !f.hidden; if (!f.hidden) f.elements.old.focus(); };
  $('mypw-form').onsubmit = function (e) {
    e.preventDefault();
    var f = e.target, n = f.elements.pw1.value;
    $('mypw-error').textContent = '';
    if (n.length < 12) { $('mypw-error').textContent = T('hashTooShort'); return; }
    if (n !== f.elements.pw2.value) { $('mypw-error').textContent = T('hashMismatch'); return; }
    call({ action: 'password', old: f.elements.old.value, new: n }).then(function () {
      f.reset(); f.hidden = true; toast(T('mypwSaved'));
    }, function (err) {
      if (err && err.error === 'bad_old_password') { $('mypw-error').textContent = T('err_bad_old_password'); return; }
      handleError(err);
    });
  };
  $('btn-refresh').onclick = refresh;
  $('btn-csv').onclick = csv;
  $('btn-testmail').onclick = function () {
    var b = $('btn-testmail'), box = $('mail-result'); b.disabled = true;
    call({ action: 'test_mail' }).then(function (d) {
      b.disabled = false; box.hidden = false;
      var html = '';
      if (!d.mailFunction) html += '<p>' + esc(T('mailNoFunction')) + '</p>';
      else if (!d.recipients) html += '<p>' + esc(T('mailNoRecipients')) + '</p>';
      else {
        html += '<ul class="counts">' + d.results.map(function (r) {
          return '<li><span>' + esc(r.to) + ' (' + esc(r.lang.toUpperCase()) + ')</span><b>' + esc(T(r.sent ? 'mailSent' : 'mailFailed')) + '</b></li>';
        }).join('') + '</ul>';
        html += '<p class="hint">' + esc(T(d.results.every(function (r) { return r.sent; }) ? 'mailSentHint' : 'mailFailedHint')) + '</p>';
      }
      if (d.from && !d.fromMatchesHost) html += '<p class="hint">' + esc(T('mailFromWarn', { from: d.from })) + '</p>';
      box.innerHTML = html;
    }, function (e) { b.disabled = false; handleError(e); });
  };
  $('btn-hash').onclick = function () { var f = $('hash-form'); f.hidden = !f.hidden; if (!f.hidden) f.elements.pw1.focus(); };
  $('hash-form').onsubmit = function (e) {
    e.preventDefault();
    var f = e.target, a = f.elements.pw1.value, b = f.elements.pw2.value;
    $('hash-error').textContent = ''; $('hash-out').hidden = true;
    if (a.length < 12) { $('hash-error').textContent = T('hashTooShort'); return; }
    if (a !== b) { $('hash-error').textContent = T('hashMismatch'); return; }
    if (a.indexOf("'") >= 0 || a.indexOf('\\') >= 0) { $('hash-error').textContent = T('hashBadChar'); return; }
    call({ action: 'make_hash', newPassword: a }).then(function (d) {
      f.elements.pw1.value = ''; f.elements.pw2.value = '';
      $('hash-line').value = "'admin_password' => '" + d.hash + "',";
      $('hash-out').hidden = false;
    }, handleError);
  };
  $('hash-copy').onclick = function () { copy($('hash-line').value); };
  $('hash-line').onfocus = function (ev) { ev.target.select(); };
  $('q').oninput = renderRows;
  $('filter').onchange = renderRows;
  $('new-form').onsubmit = function (e) {
    e.preventDefault();
    var f = e.target, customer = {};
    ['name', 'company', 'email', 'reference'].forEach(function (k) { customer[k] = f.elements[k].value.trim(); });
    var l = f.elements.lang.value;
    call({ action: 'admin_create', customer: customer, lang: l }).then(function (d) {
      var url = appUrl(d.order.code, l), box = $('new-result');
      box.hidden = false;
      box.innerHTML = '<p>' + esc(T('adminCreated', { code: d.order.code })) + '</p><div class="row"><input readonly value="' + esc(url) + '"><button type="button" class="btn primary small">' + esc(T('copyLink')) + '</button></div>';
      box.querySelector('button').onclick = function () { copy(url); };
      box.querySelector('input').onfocus = function (ev) { ev.target.select(); };
      ['name', 'company', 'email', 'reference'].forEach(function (k) { f.elements[k].value = ''; });
      refresh();
    }, handleError);
  };

  applyLang();
  fetch(API + '?action=ping', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
    if (!d.admin) { show('disabled'); return; }
    if (token) refresh(); else show('login');
  }).catch(function () { show('offline'); });
})();
