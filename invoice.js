// ══════════════════════════════════════════════════════
//  INVOICE ENGINE — ONE layout, three outputs
//
//  buildModel(b)  ->  layout(model)  ->  pages (list of drawing primitives in mm)
//                                          |-> toPDF(pages)   real vector PDF (Download + WhatsApp)
//                                          |-> pageSVG(page)  on-screen preview + Print
//
//  Because the PDF, the preview and the print view are all drawn from the very same
//  primitives (same coordinates, same embedded font), they cannot drift apart.
//  Everything is self-contained: no CDN library is needed to make the bill, and the
//  rupee sign comes from an embedded font (see invoice-assets.js), so it can never
//  turn into a "�". Non-ASCII characters below are written as \u escapes on purpose,
//  so a wrongly-declared file encoding on a web host cannot corrupt them either.
// ══════════════════════════════════════════════════════
var Invoice = (function(){
  var PT = 25.4 / 72;                       // 1 pt in mm
  var W = 210, H = 297, M = 14, CW = W - 2 * M;
  var C = { green:'#1F4D2E', gold:'#B98A22', ink:'#232323', muted:'#6B6B6B', line:'#DDD5C2',
            band:'#F7F3E8', cream:'#FBF8EF', white:'#FFFFFF' };
  var RUPEE = '\u20B9';

  // ── formatting ──────────────────────────────────────
  function inr(n){
    var v = Math.round((Number(n) || 0) * 100) / 100, neg = v < 0;
    var parts = Math.abs(v).toFixed(2).split('.'), i = parts[0];
    var last3 = i.slice(-3), rest = i.slice(0, -3);
    if(rest) rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',';
    return (neg ? '-' : '') + RUPEE + rest + last3 + '.' + parts[1];
  }
  function qtyStr(q, unit){ return (Number(q) || 0).toFixed(2) + ' ' + (unit || ''); }

  var ONES = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  var TENS = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function below100(n){ return n < 20 ? ONES[n] : TENS[Math.floor(n/10)] + (n % 10 ? ' ' + ONES[n%10] : ''); }
  function below1000(n){ return (n >= 100 ? ONES[Math.floor(n/100)] + ' Hundred' + (n % 100 ? ' ' : '') : '') + (n % 100 ? below100(n % 100) : ''); }
  function words(n){                                   // Indian numbering: thousand / lakh / crore
    if(n === 0) return 'Zero';
    var out = [], cr = Math.floor(n / 1e7); n %= 1e7;
    var lk = Math.floor(n / 1e5); n %= 1e5;
    var th = Math.floor(n / 1e3); n %= 1e3;
    if(cr) out.push(below1000(cr) + ' Crore');
    if(lk) out.push(below100(lk) + ' Lakh');
    if(th) out.push(below100(th) + ' Thousand');
    if(n)  out.push(below1000(n));
    return out.join(' ');
  }
  function amountInWords(v){
    var paise = Math.round((Number(v) || 0) * 100), r = Math.floor(paise / 100), p = paise % 100;
    return 'Rupees ' + words(r) + (p ? ' and ' + words(p) + ' Paise' : '') + ' Only';
  }

  // "42.00 L" or "42.00 L + 3.00 unit" — summed per unit
  function billTotalQtyLabel(b){
    var units = {};
    Object.keys(b.products).forEach(function(p){
      var u = (PRODUCTS[p] && PRODUCTS[p].unit) || 'unit';
      units[u] = (units[u] || 0) + b.products[p].qty;
    });
    var keys = Object.keys(units);
    return keys.length ? keys.map(function(u){ return units[u].toFixed(2) + ' ' + u; }).join(' + ') : '0.00';
  }

  // ── font metrics (same numbers drive PDF alignment, wrapping, and the SVG font) ──
  function fm(bold){ return DD_FONT_METRICS[bold ? 'bold' : 'regular']; }
  function clean(s){                                   // single line; glyphs we can't draw become '?'
    var m = DD_FONT_METRICS.regular, out = '';
    s = String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').replace(/ +/g, ' ');
    for(var ch of s){ out += (m.gid[ch.codePointAt(0)] !== undefined) ? ch : '?'; }
    return out;
  }
  function tw(s, size, bold){                          // text width in mm
    var m = fm(bold), t = 0;
    for(var ch of s){ var a = m.adv[ch.codePointAt(0)]; t += (a === undefined ? m.notdef_adv : a); }
    return t / m.upm * size * PT;
  }
  function wrap(s, size, bold, maxW, maxLines){
    s = clean(s);
    var words_ = s.split(' '), lines = [], cur = '';
    words_.forEach(function(w){
      var trial = cur ? cur + ' ' + w : w;
      if(tw(trial, size, bold) <= maxW){ cur = trial; return; }
      if(cur) lines.push(cur);
      while(tw(w, size, bold) > maxW && w.length > 1){        // very long single word: hard-break
        var k = w.length; while(k > 1 && tw(w.slice(0, k), size, bold) > maxW) k--;
        lines.push(w.slice(0, k)); w = w.slice(k);
      }
      cur = w;
    });
    if(cur) lines.push(cur);
    if(maxLines && lines.length > maxLines){
      lines = lines.slice(0, maxLines);
      var last = lines[maxLines - 1];
      while(last.length > 1 && tw(last + '...', size, bold) > maxW) last = last.slice(0, -1);
      lines[maxLines - 1] = last + '...';
    }
    return lines.length ? lines : [''];
  }

  // ── model: everything the bill shows, taken from buildCustomerBill()'s output ──
  function buildModel(b){
    var c = b.customer || {};
    var from = b.range && b.range.from, to = b.range && b.range.to;
    var products = Object.keys(b.products).map(function(p){
      var pr = b.products[p], info = PRODUCTS[p] || { unit:'unit', price:0 };
      var rates = Object.keys(pr.rates || {}).map(parseFloat);
      var rateLabel = rates.length === 1 ? inr(rates[0]) + ' / ' + info.unit
                    : rates.length > 1   ? 'Varies'
                    : inr(info.price) + ' / ' + info.unit;
      return { name: p, qty: pr.qty, unit: info.unit, rateLabel: rateLabel, amount: pr.amount };
    });
    var rows = b.deliveries.map(function(d){
      var info = PRODUCTS[d.product] || { unit:'unit' };
      return { date: fmtDate(d.date), slot: d.slot || '', product: d.product, qty: d.qty, unit: info.unit,
               rate: d.rate, amount: d.amount };
    });
    var tail = (to || '').slice(0, 7).replace('-', '') || 'ALL';
    return {
      customer: { id: c.id || '', name: c.name || '', mobile: c.mobile == null ? '' : String(c.mobile), address: c.address || '' },
      invoiceNo: 'INV-' + (c.id || 'NA') + '-' + tail,
      invoiceDate: fmtDate(todayStr()),
      period: (from && to) ? fmtDateLong(from) + ' to ' + fmtDateLong(to) : 'All dates',
      products: products, rows: rows,
      count: b.deliveries.length,
      totalQty: billTotalQtyLabel(b),
      grandTotal: b.grandTotal
    };
  }

  // ── page builder ────────────────────────────────────
  function Page(){ this.items = []; }
  Page.prototype.text = function(x, y, s, o){
    o = o || {};
    this.items.push({ t:'text', x:x, y:y, s:clean(s), size:o.size || 9, bold:!!o.bold, color:o.color || C.ink, align:o.align || 'l' });
  };
  Page.prototype.rect = function(x, y, w, h, o){ o = o || {}; this.items.push({ t:'rect', x:x, y:y, w:w, h:h, fill:o.fill || null, stroke:o.stroke || null, lw:o.lw || 0.25, r:o.r || 0 }); };
  Page.prototype.line = function(x1, y1, x2, y2, color, lw){ this.items.push({ t:'line', x1:x1, y1:y1, x2:x2, y2:y2, color:color || C.line, lw:lw || 0.25 }); };
  Page.prototype.img  = function(x, y, w, h){ this.items.push({ t:'img', x:x, y:y, w:w, h:h }); };

  var DEL_COLS = [ { k:'date', l:'Date', x:0, w:26, a:'l' }, { k:'slot', l:'Slot', x:26, w:24, a:'l' },
                   { k:'product', l:'Product', x:50, w:44, a:'l' }, { k:'qty', l:'Qty', x:94, w:26, a:'r' },
                   { k:'rate', l:'Rate', x:120, w:28, a:'r' }, { k:'amount', l:'Amount', x:148, w:34, a:'r' } ];
  var SUM_COLS = [ { k:'product', l:'Product', x:0, w:70, a:'l' }, { k:'qty', l:'Quantity', x:70, w:34, a:'r' },
                   { k:'rate', l:'Rate', x:104, w:38, a:'r' }, { k:'amount', l:'Amount', x:142, w:40, a:'r' } ];

  function layout(m){
    var pages = [], pg, y, FOOT = H - 20;

    function cellText(page, col, str, baseY, o){
      var x = col.a === 'r' ? M + col.x + col.w - 3 : M + col.x + 3;
      page.text(x, baseY, str, Object.assign({ align: col.a }, o));
    }
    function tableHeader(cols){
      pg.rect(M, y, CW, 8, { fill: C.green });
      cols.forEach(function(col){ cellText(pg, col, col.l.toUpperCase(), y + 5.3, { size:7.8, bold:true, color:C.white }); });
      y += 8;
    }
    function sectionTitle(txt){
      pg.text(M, y + 4, txt, { size:11, bold:true, color:C.green });
      pg.rect(M, y + 6, 16, 0.7, { fill: C.gold });
      y += 10;
    }
    function firstPage(){
      pg = new Page(); pages.push(pg);
      pg.img(M, 11, 21, 28);
      pg.text(M + 26, 22, 'Bhati Farms', { size:20, bold:true, color:C.green });
      pg.text(M + 26, 28.5, 'Quality. Tradition. Sustainability.', { size:8.5, color:C.muted });
      pg.text(M + 26, 34, 'Delivery & Billing Ledger', { size:8.5, color:C.muted });
      pg.text(W - M, 21, 'INVOICE', { size:24, bold:true, color:C.green, align:'r' });
      pg.text(W - M, 28.5, 'Invoice No: ' + m.invoiceNo, { size:9, bold:true, align:'r' });
      pg.text(W - M, 34, 'Invoice Date: ' + m.invoiceDate, { size:9, color:C.muted, align:'r' });
      pg.rect(M, 42, CW, 1.2, { fill: C.green });
      pg.rect(M, 43.6, CW, 0.4, { fill: C.gold });
      y = 50;
    }
    function contPage(){
      pg = new Page(); pages.push(pg);
      pg.text(M, 15, 'Bhati Farms', { size:12, bold:true, color:C.green });
      pg.text(W - M, 15, m.invoiceNo + '  |  ' + m.customer.name, { size:8.5, color:C.muted, align:'r' });
      pg.rect(M, 18.5, CW, 0.7, { fill: C.green });
      y = 26;
    }

    firstPage();

    // customer + period cards
    var leftW = 90, rightX = M + 94, rightW = 88, pad = 5;
    var nameLines = wrap(m.customer.name || '-', 12.5, true, leftW - 2 * pad, 3);
    var left = [{ s:'BILLED TO', size:7.5, bold:true, color:C.gold, gap:5 }];
    nameLines.forEach(function(l){ left.push({ s:l, size:12.5, bold:true, gap:5.6 }); });
    left.push({ s:'Customer ID: ' + m.customer.id, size:9, gap:5 });
    left.push({ s:'Mobile: ' + (m.customer.mobile || '-'), size:9, gap:5 });
    if(m.customer.address) wrap('Address: ' + m.customer.address, 9, false, leftW - 2 * pad, 3).forEach(function(l){ left.push({ s:l, size:9, gap:4.6 }); });
    var right = [{ s:'BILLING PERIOD', size:7.5, bold:true, color:C.gold, gap:5 }];
    wrap(m.period, 11, true, rightW - 2 * pad, 2).forEach(function(l){ right.push({ s:l, size:11, bold:true, gap:5.6 }); });
    right.push({ s:'Total Deliveries: ' + m.count, size:9, gap:5 });
    right.push({ s:'Total Quantity: ' + m.totalQty, size:9, gap:5 });
    function stack(list){ var t = pad + 1; list.forEach(function(r){ t += r.gap; }); return t + pad - 1; }
    var cardH = Math.max(stack(left), stack(right), 32);
    [[M, leftW, left], [rightX, rightW, right]].forEach(function(cd){
      pg.rect(cd[0], y, cd[1], cardH, { fill: C.cream, stroke: C.line, lw: 0.3, r: 2.2 });
      var ty = y + pad;
      cd[2].forEach(function(r){ ty += r.gap; pg.text(cd[0] + pad, ty, r.s, { size:r.size, bold:r.bold, color:r.color }); });
    });
    y += cardH + 9;

    // summary table
    sectionTitle('Summary');
    tableHeader(SUM_COLS);
    if(!m.products.length){
      pg.rect(M, y, CW, 9, { fill: C.band });
      pg.text(M + CW / 2, y + 6, 'No deliveries in the selected period', { size:9, color:C.muted, align:'c' });
      y += 9;
    }
    m.products.forEach(function(p, i){
      var rh = 8;
      if(i % 2) pg.rect(M, y, CW, rh, { fill: C.band });
      cellText(pg, SUM_COLS[0], p.name, y + 5.4, { size:9.5, bold:true });
      cellText(pg, SUM_COLS[1], qtyStr(p.qty, p.unit), y + 5.4, { size:9.5 });
      cellText(pg, SUM_COLS[2], p.rateLabel, y + 5.4, { size:9.5 });
      cellText(pg, SUM_COLS[3], inr(p.amount), y + 5.4, { size:9.5, bold:true });
      pg.line(M, y + rh, M + CW, y + rh);
      y += rh;
    });
    pg.rect(M, y, CW, 9, { fill: C.cream });
    pg.line(M, y, M + CW, y, C.green, 0.5);
    cellText(pg, SUM_COLS[0], 'Total', y + 6, { size:9.5, bold:true, color:C.green });
    cellText(pg, SUM_COLS[1], m.totalQty, y + 6, { size:9.5, bold:true, color:C.green });
    cellText(pg, SUM_COLS[3], inr(m.grandTotal), y + 6, { size:9.5, bold:true, color:C.green });
    y += 9 + 8;

    // grand total block, directly under the summary (never split across pages)
    var wordLines = wrap(amountInWords(m.grandTotal), 9, false, 78, 3);
    var blockH = 32;
    pg.text(M, y + 4, 'AMOUNT IN WORDS', { size:7.5, bold:true, color:C.gold });
    wordLines.forEach(function(l, i){ pg.text(M, y + 10 + i * 4.8, l, { size:9 }); });
    var bx = M + 86, bw = CW - 86;
    pg.text(bx, y + 4.5, 'Total Deliveries', { size:9, color:C.muted });
    pg.text(bx + bw, y + 4.5, String(m.count), { size:9, bold:true, align:'r' });
    pg.text(bx, y + 10.5, 'Total Quantity', { size:9, color:C.muted });
    pg.text(bx + bw, y + 10.5, m.totalQty, { size:9, bold:true, align:'r' });
    pg.line(bx, y + 14, bx + bw, y + 14);
    pg.rect(bx, y + 17, bw, 13, { fill: C.green, r: 2 });
    pg.text(bx + 4, y + 25.2, 'GRAND TOTAL', { size:9, bold:true, color:C.white });
    pg.text(bx + bw - 4, y + 25.7, inr(m.grandTotal), { size:14, bold:true, color:C.white, align:'r' });
    y += blockH + 8;

    // delivery details (paginated, header row repeats, closing total row never orphaned)
    var RH = 6.6, TOTRH = 8;
    if(y + 10 + 8 + RH * 3 > FOOT){ contPage(); }
    sectionTitle('Delivery Details');
    tableHeader(DEL_COLS);
    if(!m.rows.length){
      pg.text(M + CW / 2, y + 6, 'No delivery records', { size:9, color:C.muted, align:'c' });
      y += 9;
    }
    m.rows.forEach(function(r, i){
      var need = RH + (i === m.rows.length - 1 ? TOTRH : 0);   // last row travels together with the total row
      if(y + need > FOOT){
        contPage();
        pg.text(M, y + 4, 'Delivery Details (continued)', { size:10, bold:true, color:C.green });
        y += 8;
        tableHeader(DEL_COLS);
      }
      if(i % 2) pg.rect(M, y, CW, RH, { fill: C.band });
      var by = y + 4.5, o = { size:8.6 };
      cellText(pg, DEL_COLS[0], r.date, by, o);
      cellText(pg, DEL_COLS[1], r.slot, by, o);
      cellText(pg, DEL_COLS[2], r.product, by, o);
      cellText(pg, DEL_COLS[3], qtyStr(r.qty, r.unit), by, o);
      cellText(pg, DEL_COLS[4], inr(r.rate), by, o);
      cellText(pg, DEL_COLS[5], inr(r.amount), by, { size:8.6, bold:true });
      pg.line(M, y + RH, M + CW, y + RH, '#ECE6D6', 0.2);
      y += RH;
    });
    if(m.rows.length){
      pg.rect(M, y, CW, TOTRH, { fill: C.cream });
      pg.line(M, y, M + CW, y, C.green, 0.5);
      cellText(pg, DEL_COLS[0], 'Total', y + 5.5, { size:9, bold:true, color:C.green });
      cellText(pg, DEL_COLS[3], m.totalQty, y + 5.5, { size:9, bold:true, color:C.green });
      cellText(pg, DEL_COLS[5], inr(m.grandTotal), y + 5.5, { size:9, bold:true, color:C.green });
      y += TOTRH;
    }

    // footer on every page
    pages.forEach(function(p, i){
      p.line(M, H - 15, W - M, H - 15, C.line, 0.3);
      p.text(M, H - 10, 'Thank you for your business.', { size:8.5, color:C.muted });
      p.text(W / 2, H - 10, 'Computer-generated invoice \u2014 no signature required.', { size:7.5, color:C.muted, align:'c' });
      p.text(W - M, H - 10, 'Page ' + (i + 1) + ' of ' + pages.length, { size:8.5, color:C.muted, align:'r' });
    });
    return pages;
  }

  // ── renderer 1: SVG (preview + print). Baseline-exact, so no font-metric guessing ──
  function fontFaceCSS(){
    return "@font-face{font-family:'DDInvoice';font-weight:400;font-style:normal;src:url(data:font/ttf;base64," + DD_ASSETS.fontRegular + ") format('truetype')}" +
           "@font-face{font-family:'DDInvoice';font-weight:700;font-style:normal;src:url(data:font/ttf;base64," + DD_ASSETS.fontBold + ") format('truetype')}";
  }
  function ensureFonts(){
    if(document.getElementById('ddInvoiceFonts')) return;
    var st = document.createElement('style'); st.id = 'ddInvoiceFonts'; st.textContent = fontFaceCSS();
    document.head.appendChild(st);
  }
  function n(v){ return Math.round(v * 1000) / 1000; }
  function pageSVG(page){
    var out = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" style="font-kerning:none;text-rendering:geometricPrecision">' +
              '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#fff"/>';
    page.items.forEach(function(it){
      if(it.t === 'rect'){
        out += '<rect x="' + n(it.x) + '" y="' + n(it.y) + '" width="' + n(it.w) + '" height="' + n(it.h) + '"' +
          (it.r ? ' rx="' + it.r + '"' : '') + ' fill="' + (it.fill || 'none') + '"' +
          (it.stroke ? ' stroke="' + it.stroke + '" stroke-width="' + it.lw + '"' : '') + '/>';
      } else if(it.t === 'line'){
        out += '<line x1="' + n(it.x1) + '" y1="' + n(it.y1) + '" x2="' + n(it.x2) + '" y2="' + n(it.y2) + '" stroke="' + it.color + '" stroke-width="' + it.lw + '"/>';
      } else if(it.t === 'img'){
        out += '<image href="data:image/jpeg;base64,' + DD_ASSETS.logoJpeg + '" x="' + n(it.x) + '" y="' + n(it.y) + '" width="' + n(it.w) + '" height="' + n(it.h) + '" preserveAspectRatio="none"/>';
      } else if(it.t === 'text'){
        out += '<text x="' + n(it.x) + '" y="' + n(it.y) + '" font-family="DDInvoice, \'DejaVu Sans\', Arial, sans-serif" font-size="' + n(it.size * PT) + '"' +
          ' font-weight="' + (it.bold ? 700 : 400) + '" fill="' + it.color + '"' +
          (it.align === 'r' ? ' text-anchor="end"' : it.align === 'c' ? ' text-anchor="middle"' : '') + '>' + escapeHtml(it.s) + '</text>';
      }
    });
    return out + '</svg>';
  }
  function previewHTML(pages){
    ensureFonts();
    return pages.map(function(p){ return '<div class="inv-page">' + pageSVG(p) + '</div>'; }).join('');
  }
  function printDocument(pages, title){
    return '<!doctype html><html><head><meta charset="utf-8"><title>' + escapeHtml(title) + '</title><style>' + fontFaceCSS() +
      '@page{size:A4;margin:0}html,body{margin:0;padding:0;background:#e9e6df;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      '.pg{width:210mm;height:297mm;margin:0 auto 6mm;background:#fff;overflow:hidden;box-shadow:0 1px 8px rgba(0,0,0,.25);page-break-after:always;break-after:page}' +
      '.pg:last-child{page-break-after:auto;break-after:auto;margin-bottom:0}.pg svg{display:block;width:210mm;height:297mm}' +
      '@media print{html,body{background:#fff}.pg{margin:0;box-shadow:none}}' +
      '</style></head><body>' + pages.map(function(p){ return '<div class="pg">' + pageSVG(p) + '</div>'; }).join('') + '</body></html>';
  }

  // ── renderer 2: real PDF (vector text, embedded font, no external library) ──
  function b64bytes(b64){ var s = atob(b64), u = new Uint8Array(s.length); for(var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  function ascii(s){ var u = new Uint8Array(s.length); for(var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; }
  function f(v){ return (Math.round(v * 1000) / 1000).toString(); }
  function rgb(hex){ var v = parseInt(hex.slice(1), 16); return f((v >> 16 & 255) / 255) + ' ' + f((v >> 8 & 255) / 255) + ' ' + f((v & 255) / 255); }
  function hex4(v){ return ('0000' + v.toString(16)).slice(-4).toUpperCase(); }
  function pdfStr(s){ return '(' + String(s).replace(/[^\x20-\x7E]/g, '?').replace(/([\\()])/g, '\\$1') + ')'; }
  var MM = 72 / 25.4;

  function toUnicodeCMap(m){
    var seen = {}, pairs = [];
    Object.keys(m.gid).map(Number).sort(function(a, b){ return a - b; }).forEach(function(cp){
      var g = m.gid[cp]; if(g === 0 || seen[g] || cp > 0xFFFF) return; seen[g] = 1; pairs.push([g, cp]);
    });
    var body = '';
    for(var i = 0; i < pairs.length; i += 100){
      var chunk = pairs.slice(i, i + 100);
      body += chunk.length + ' beginbfchar\n' + chunk.map(function(p){ return '<' + hex4(p[0]) + '> <' + hex4(p[1]) + '>'; }).join('\n') + '\nendbfchar\n';
    }
    return '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n' +
           '/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n' + body + 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend';
  }
  function widthsArray(m){
    var seen = {}, list = [];
    Object.keys(m.gid).forEach(function(cp){ var g = m.gid[cp]; if(!seen[g]){ seen[g] = 1; list.push([g, Math.round(m.adv[cp] * 1000 / m.upm)]); } });
    list.sort(function(a, b){ return a[0] - b[0]; });
    return '[' + list.map(function(p){ return p[0] + ' [' + p[1] + ']'; }).join(' ') + ']';
  }
  function hexGlyphs(s, m){
    var out = '';
    for(var ch of s){ var g = m.gid[ch.codePointAt(0)]; out += hex4(g === undefined ? 0 : g); }
    return '<' + out + '>';
  }

  function pageContent(page){
    var reg = fm(false), bold = fm(true), ops = [];
    page.items.forEach(function(it){
      if(it.t === 'rect'){
        var x = it.x * MM, w = it.w * MM, h = it.h * MM, yb = (H - it.y - it.h) * MM;
        if(it.fill) ops.push(rgb(it.fill) + ' rg');
        if(it.stroke) ops.push(rgb(it.stroke) + ' RG ' + f(it.lw * MM) + ' w');
        if(it.r){
          var r = Math.min(it.r * MM, w / 2, h / 2), k = 0.5523 * r;
          ops.push(f(x + r) + ' ' + f(yb) + ' m ' + f(x + w - r) + ' ' + f(yb) + ' l ' +
                   f(x + w - r + k) + ' ' + f(yb) + ' ' + f(x + w) + ' ' + f(yb + r - k) + ' ' + f(x + w) + ' ' + f(yb + r) + ' c ' +
                   f(x + w) + ' ' + f(yb + h - r) + ' l ' +
                   f(x + w) + ' ' + f(yb + h - r + k) + ' ' + f(x + w - r + k) + ' ' + f(yb + h) + ' ' + f(x + w - r) + ' ' + f(yb + h) + ' c ' +
                   f(x + r) + ' ' + f(yb + h) + ' l ' +
                   f(x + r - k) + ' ' + f(yb + h) + ' ' + f(x) + ' ' + f(yb + h - r + k) + ' ' + f(x) + ' ' + f(yb + h - r) + ' c ' +
                   f(x) + ' ' + f(yb + r) + ' l ' +
                   f(x) + ' ' + f(yb + r - k) + ' ' + f(x + r - k) + ' ' + f(yb) + ' ' + f(x + r) + ' ' + f(yb) + ' c h ' +
                   (it.fill && it.stroke ? 'B' : it.fill ? 'f' : 'S'));
        } else {
          ops.push(f(x) + ' ' + f(yb) + ' ' + f(w) + ' ' + f(h) + ' re ' + (it.fill && it.stroke ? 'B' : it.fill ? 'f' : 'S'));
        }
      } else if(it.t === 'line'){
        ops.push(rgb(it.color) + ' RG ' + f(it.lw * MM) + ' w ' + f(it.x1 * MM) + ' ' + f((H - it.y1) * MM) + ' m ' + f(it.x2 * MM) + ' ' + f((H - it.y2) * MM) + ' l S');
      } else if(it.t === 'img'){
        ops.push('q ' + f(it.w * MM) + ' 0 0 ' + f(it.h * MM) + ' ' + f(it.x * MM) + ' ' + f((H - it.y - it.h) * MM) + ' cm /Im1 Do Q');
      } else if(it.t === 'text'){
        var m = it.bold ? bold : reg, width = tw(it.s, it.size, it.bold);
        var x0 = it.align === 'r' ? it.x - width : it.align === 'c' ? it.x - width / 2 : it.x;
        ops.push(rgb(it.color) + ' rg BT /' + (it.bold ? 'F2' : 'F1') + ' ' + f(it.size) + ' Tf 1 0 0 1 ' + f(x0 * MM) + ' ' + f((H - it.y) * MM) + ' Tm ' + hexGlyphs(it.s, m) + ' Tj ET');
      }
    });
    return ops.join('\n');
  }

  function toPDF(pages, meta){
    meta = meta || {};
    var objs = [];                       // objs[id] = array of Uint8Array/strings
    function set(id, parts){ objs[id] = parts; }
    function stream(dict, bytes){ return [ascii('<< ' + dict + ' /Length ' + bytes.length + ' >>\nstream\n'), bytes, ascii('\nendstream')]; }

    var logo = b64bytes(DD_ASSETS.logoJpeg);
    var fonts = [ { key:'regular', name:'DejaVuSans', file:DD_ASSETS.fontRegular, base:3 },
                  { key:'bold',    name:'DejaVuSans-Bold', file:DD_ASSETS.fontBold, base:8 } ];
    var pageBase = 14, kids = [];

    fonts.forEach(function(ft){
      var m = DD_FONT_METRICS[ft.key], b = ft.base, s = 1000 / m.upm, ttf = b64bytes(ft.file);
      set(b,     [ascii('<< /Type /Font /Subtype /Type0 /BaseFont /AAAAAA+' + ft.name + ' /Encoding /Identity-H /DescendantFonts [' + (b + 1) + ' 0 R] /ToUnicode ' + (b + 4) + ' 0 R >>')]);
      set(b + 1, [ascii('<< /Type /Font /Subtype /CIDFontType2 /BaseFont /AAAAAA+' + ft.name + ' /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ' + (b + 2) + ' 0 R /CIDToGIDMap /Identity /DW 600 /W ' + widthsArray(m) + ' >>')]);
      set(b + 2, [ascii('<< /Type /FontDescriptor /FontName /AAAAAA+' + ft.name + ' /Flags 4 /FontBBox [' + m.bbox.map(function(v){ return Math.round(v * s); }).join(' ') + '] /ItalicAngle 0 /Ascent ' + Math.round(m.asc * s) + ' /Descent ' + Math.round(m.desc * s) + ' /CapHeight ' + Math.round(m.cap * s) + ' /StemV 90 /FontFile2 ' + (b + 3) + ' 0 R >>')]);
      set(b + 3, stream('/Length1 ' + ttf.length, ttf));
      set(b + 4, stream('', ascii(toUnicodeCMap(m))));
    });
    set(13, stream('/Type /XObject /Subtype /Image /Width ' + DD_ASSETS.logoW + ' /Height ' + DD_ASSETS.logoH + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode', logo));

    pages.forEach(function(p, i){
      var pid = pageBase + i * 2, cid = pid + 1;
      kids.push(pid + ' 0 R');
      set(pid, [ascii('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + f(W * MM) + ' ' + f(H * MM) + '] /Resources << /Font << /F1 3 0 R /F2 8 0 R >> /XObject << /Im1 13 0 R >> >> /Contents ' + cid + ' 0 R >>')]);
      set(cid, stream('', ascii(pageContent(p))));
    });
    var infoId = pageBase + pages.length * 2;
    var d = new Date(), pad = function(x){ return ('0' + x).slice(-2); };
    var stamp = 'D:' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
    set(infoId, [ascii('<< /Title ' + pdfStr(meta.title || 'Invoice') + ' /Author (Bhati Farms) /Producer (Bhati Farms Ledger) /CreationDate (' + stamp + ') >>')]);
    set(1, [ascii('<< /Type /Catalog /Pages 2 0 R >>')]);
    set(2, [ascii('<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + pages.length + ' >>')]);

    var chunks = [ascii('%PDF-1.4\n%\u00E2\u00E3\u00CF\u00D3\n')], offset = chunks[0].length, offsets = [];
    for(var id = 1; id <= infoId; id++){
      var parts = objs[id]; if(!parts) throw new Error('PDF object ' + id + ' missing');
      offsets[id] = offset;
      var head = ascii(id + ' 0 obj\n'), tail = ascii('\nendobj\n');
      chunks.push(head); offset += head.length;
      parts.forEach(function(pt){ var u = typeof pt === 'string' ? ascii(pt) : pt; chunks.push(u); offset += u.length; });
      chunks.push(tail); offset += tail.length;
    }
    var xref = 'xref\n0 ' + (infoId + 1) + '\n0000000000 65535 f \n';
    for(var k = 1; k <= infoId; k++) xref += ('0000000000' + offsets[k]).slice(-10) + ' 00000 n \n';
    xref += 'trailer\n<< /Size ' + (infoId + 1) + ' /Root 1 0 R /Info ' + infoId + ' 0 R >>\nstartxref\n' + offset + '\n%%EOF';
    chunks.push(ascii(xref));
    return new Blob(chunks, { type: 'application/pdf' });
  }

  // ── public API ──────────────────────────────────────
  function safeName(s){ return String(s || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Customer'; }

  // One call gives every output for one bill. `b` is buildCustomerBill()'s result.
  function create(b){
    var model = buildModel(b), pages = layout(model);
    var title = 'Invoice ' + model.invoiceNo + ' - ' + model.customer.name;
    var filename = 'Invoice_' + safeName(model.customer.name) + '_' + (b.range.from || 'all') + '_to_' + (b.range.to || 'all') + '.pdf';
    return { model: model, pages: pages, title: title, filename: filename,
             pdf: function(){ return toPDF(pages, { title: title }); } };
  }
  function download(blob, filename){
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(function(){ try{ document.body.removeChild(a); }catch(e){} URL.revokeObjectURL(url); }, 4000);
  }
  function blobToBase64(blob){
    return new Promise(function(res, rej){
      var r = new FileReader();
      r.onload = function(){ res(String(r.result).split(',')[1] || ''); };
      r.onerror = function(){ rej(new Error('Could not read PDF')); };
      r.readAsDataURL(blob);
    });
  }

  return { create: create, previewHTML: previewHTML, printDocument: printDocument, download: download, blobToBase64: blobToBase64,
           inr: inr, amountInWords: amountInWords, billTotalQtyLabel: billTotalQtyLabel, ensureFonts: ensureFonts, fontFaceCSS: fontFaceCSS };
})();