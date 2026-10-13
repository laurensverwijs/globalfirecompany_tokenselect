/* Global Fire Company – PDF van een bestelling, gemaakt in de browser (vector, ware grootte).
 * Pagina 1: ordergegevens. Daarna per gevulde sheet de voorkant en de gespiegelde achterkant,
 * met snijlijnen, net als bij Afdrukken. Gebruikt js/vendor/jspdf + svg2pdf (MIT), alleen geladen als er een PDF gemaakt wordt.
 */
window.GFC_PDF = (function () {
  'use strict';

  var DATA = window.GFC_DATA, NS = 'http://www.w3.org/2000/svg';
  var TOKEN = {}; DATA.tokens.forEach(function (t) { TOKEN[t.id] = t; });
  var svgCache = {};

  function loadScript(src) {
    return new Promise(function (ok, no) {
      var s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = function () { no(new Error('load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function libs() {
    if (window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API.svg) return Promise.resolve();
    return loadScript('js/vendor/jspdf.umd.min.js').then(function () { return loadScript('js/vendor/svg2pdf.umd.min.js'); });
  }

  function svgOf(url) {
    if (!svgCache[url]) {
      svgCache[url] = fetch(url).then(function (r) { if (!r.ok) throw new Error(url); return r.text(); }).then(function (txt) {
        var el = new DOMParser().parseFromString(txt, 'image/svg+xml').documentElement;
        Array.prototype.slice.call(el.getElementsByTagName('metadata')).forEach(function (m) { m.parentNode.removeChild(m); });
        return el;
      });
    }
    return svgCache[url];
  }

  function node(name, attrs) {
    var n = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }

  // Zet een losse SVG als genest <svg> op positie (mm), eventueel horizontaal gespiegeld binnen zijn eigen vak.
  function place(parent, src, x, y, w, h, flip) {
    var n = document.importNode(src, true);
    n.setAttribute('x', x); n.setAttribute('y', y); n.setAttribute('width', w); n.setAttribute('height', h);
    n.setAttribute('preserveAspectRatio', 'none');
    if (flip) {
      var g = node('g', { transform: 'translate(' + (2 * x + w) + ',0) scale(-1,1)' });
      g.appendChild(n); parent.appendChild(g);
    } else parent.appendChild(n);
  }

  function sheetSvg(sheet, slots, back) {
    var urls = [sheet.bg, sheet.marks];
    slots.forEach(function (id) { if (id && TOKEN[id] && urls.indexOf(TOKEN[id].file) < 0) urls.push(TOKEN[id].file); });
    return Promise.all(urls.map(svgOf)).then(function (els) {
      var byUrl = {}; urls.forEach(function (u, i) { byUrl[u] = els[i]; });
      var root = node('svg', { viewBox: '0 0 ' + sheet.w + ' ' + sheet.h, width: sheet.w, height: sheet.h });
      // achterkant: hele sheet spiegelen; elementen zonder eigen achterkant nog eens, zoals in de print-weergave
      var g = node('g', back ? { transform: 'translate(' + sheet.w + ',0) scale(-1,1)' } : {});
      root.appendChild(g);
      place(g, byUrl[sheet.bg], 0, 0, sheet.w, sheet.h, false);
      sheet.slots.forEach(function (slot, i) {
        var t = TOKEN[slots[i]];
        if (t && t.size === slot.size) place(g, byUrl[t.file], slot.x, slot.y, slot.w, slot.h, back && !t.mirrorBack);
      });
      sheet.slots.forEach(function (slot) {
        g.appendChild(node('rect', { x: slot.x, y: slot.y, width: slot.w, height: slot.h, fill: 'none', stroke: '#1d7fc4', 'stroke-width': 0.25 }));
      });
      place(g, byUrl[sheet.marks], 0, 0, sheet.w, sheet.h, false);
      return root;
    });
  }

  /* order: { code, status, customer, sheets, submittedAt, updatedAt }
   * t: { T(key, params), tokenName(id), sheetName(id) } – teksten in de taal van de beheerder */
  function build(order, t) {
    return libs().then(function () {
      var jsPDF = window.jspdf.jsPDF;
      var first = DATA.sheets[0];
      var doc = new jsPDF({ unit: 'mm', format: [first.w, first.h], orientation: 'portrait', compress: true });
      doc.setProperties({ title: 'Global Fire Company · ' + order.code, subject: t.T('order') + ' ' + order.code, creator: 'GFC Sheet Organizer' });
      var host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-10000px;top:0;width:10px;height:10px;overflow:hidden';
      document.body.appendChild(host);

      var filled = DATA.sheets.filter(function (s) { return (order.sheets[s.id] || []).some(Boolean); });

      // pagina 1: ordergegevens
      var c = order.customer || {}, y = 40;
      return svgOf('assets/logo-ring.svg').then(function (logo) {
        var holder = node('svg', { viewBox: '0 0 30 30', width: 30, height: 30 });
        place(holder, logo, 0, 0, 30, 30, false);
        host.appendChild(holder);
        return doc.svg(holder, { x: 20, y: 18, width: 30, height: 30 }).catch(function () { });
      }).then(function () {
        doc.setTextColor(43, 59, 106);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(26);
        doc.text('Global Fire Company', 58, 33);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(14); doc.setTextColor(59, 61, 63);
        doc.text(t.T('appTitle'), 58, 42);
        y = 70;
        doc.setDrawColor(25, 137, 202); doc.setLineWidth(0.6); doc.line(20, y - 8, first.w - 20, y - 8);
        var rows = [
          [t.T('orderCode'), order.code],
          [t.T('adminStatus'), t.T('status_' + order.status)],
          [t.T('pdfApproved'), order.submittedAt ? t.date(order.submittedAt) : '–'],
          [t.T('fName'), c.name], [t.T('fCompany'), c.company], [t.T('fEmail'), c.email], [t.T('fPhone'), c.phone],
          [t.T('fReference'), c.reference]
        ].filter(function (r) { return r[1]; });
        doc.setFontSize(13);
        rows.forEach(function (r) {
          doc.setFont('helvetica', 'normal'); doc.setTextColor(110, 116, 128); doc.text(String(r[0]), 20, y);
          doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 34, 44); doc.text(String(r[1]), 90, y);
          y += 9;
        });
        if (c.notes) {
          y += 2;
          doc.setFont('helvetica', 'normal'); doc.setTextColor(110, 116, 128); doc.text(t.T('fNotes'), 20, y);
          doc.setTextColor(30, 34, 44);
          var lines = doc.splitTextToSize(c.notes, first.w - 110);
          doc.text(lines.slice(0, 8), 90, y);
          y += Math.min(lines.length, 8) * 5.4 + 4;
        }
        y += 8;
        doc.line(20, y - 8, first.w - 20, y - 8);
        var col = 0, colW = (first.w - 40) / 2, top = y, maxY = y;
        filled.forEach(function (s) {
          var slots = order.sheets[s.id], tally = {};
          slots.forEach(function (id) { if (id) tally[id] = (tally[id] || 0) + 1; });
          var x = 20 + col * colW, yy = top;
          if (col === 0 && maxY > top) { top = maxY + 4; yy = top; x = 20; }
          doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(25, 137, 202);
          doc.text(t.sheetName(s.id) + '   ' + slots.filter(Boolean).length + ' / ' + s.slots.length, x, yy);
          yy += 8;
          doc.setFont('helvetica', 'normal'); doc.setFontSize(11.5); doc.setTextColor(30, 34, 44);
          Object.keys(tally).sort(function (a, b) { return tally[b] - tally[a]; }).forEach(function (id) {
            doc.text(tally[id] + ' ×  ' + t.tokenName(id), x, yy); yy += 6.2;
          });
          maxY = Math.max(maxY, yy);
          col = (col + 1) % 2;
        });
        doc.setFontSize(9); doc.setTextColor(140, 146, 158);
        doc.text(t.T('pdfFooter', { n: filled.length * 2 }), 20, first.h - 12);

        // daarna: per sheet voorkant en achterkant
        var chain = Promise.resolve();
        filled.forEach(function (s) {
          [false, true].forEach(function (back) {
            chain = chain.then(function () { return sheetSvg(s, order.sheets[s.id], back); }).then(function (svg) {
              host.innerHTML = ''; host.appendChild(svg);
              doc.addPage([s.w, s.h], 'portrait');
              return doc.svg(svg, { x: 0, y: 0, width: s.w, height: s.h });
            }).then(function () {
              doc.setFontSize(7); doc.setTextColor(85, 85, 85);
              doc.text(t.sheetName(s.id) + ' · ' + t.T(back ? 'back' : 'front') + ' · ' + order.code + ' · Global Fire Company', 4, s.h - 3);
            });
          });
        });
        return chain;
      }).then(function () {
        host.remove();
        return doc;
      }, function (e) { host.remove(); throw e; });
    });
  }

  function download(order, t) {
    return build(order, t).then(function (doc) {
      var who = ((order.customer && (order.customer.company || order.customer.name)) || '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-');
      doc.save('GFC-' + order.code + (who ? '-' + who : '') + '.pdf');
    });
  }

  return { build: build, download: download };
})();
