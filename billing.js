// ══════════════════════════════════════════════════════
//  BILLING MODULE
// ══════════════════════════════════════════════════════
function initBillMonths(){
  var sel = document.getElementById('billMonth');
  var from = document.getElementById('billFrom');
  var to = document.getElementById('billTo');
  if(sel.options.length > 1) return;
  sel.innerHTML = '';
  var now = new Date();
  for(var i = 0; i < 12; i++){
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    var val = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
    var opt = document.createElement('option');
    opt.value = val;
    opt.textContent = MONTHS[d.getMonth()] + ' ' + d.getFullYear();
    if(i === 0) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.onchange = function(){
    var month = sel.value;
    from.value = month + '-01';
    to.value = month + '-' + String(new Date(month.split('-')[0], parseInt(month.split('-')[1]), 0).getDate()).padStart(2,'0');
    renderBillingPage();
  };
  var today = new Date();
  var month = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0');
  sel.value = month;
  from.value = month + '-01';
  to.value = month + '-' + String(new Date(today.getFullYear(), today.getMonth()+1, 0).getDate()).padStart(2,'0');
  renderBillingPage();
}

// Billing opens on the same date range as the Deliveries page, so totals match.
// (Pick a month from the dropdown for a month-only invoice.)
function syncBillingToDeliveryRange(){
  var r = periodRange();
  document.getElementById('billFrom').value = r.from;
  document.getElementById('billTo').value = r.to;
  renderBillingPage();
}

function getBillingRange(){
  var from = document.getElementById('billFrom').value;
  var to = document.getElementById('billTo').value;
  return { from: from, to: to };
}

// Ensure html2canvas is available (used by jspdf.html). Loads from CDN if missing.
function ensureHtml2Canvas(){
  if(window.html2canvas) return Promise.resolve();
  if(window._html2canvasLoading) return window._html2canvasLoading;
  window._html2canvasLoading = new Promise(function(resolve, reject){
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    s.onload = function(){
      // html2canvas exposes global `html2canvas` function
      if(window.html2canvas) return resolve();
      // some CDNs set window.html2canvas differently; check common aliases
      if(window.html2canvas || window.html2Canvas) return resolve();
      // still not present — resolve anyway and let jspdf try, but warn
      resolve();
    };
    s.onerror = function(){ reject(new Error('Failed to load html2canvas')); };
    document.head.appendChild(s);
  });
  return window._html2canvasLoading;
}

// escapeHtml is defined once, in data.js, and shared across all modules.

function buildCustomerBill(custId){
  var c = custById(custId);
  var range = getBillingRange();
  var dels = deliveriesFor(custId, range.from, range.to);
  var prodMap = {};
  var grandTotal = 0;
  dels.forEach(function(d){
    if(!prodMap[d.product]) prodMap[d.product] = { qty:0, amount:0, deliveries: [], rates: {} };
    prodMap[d.product].qty += d.qty;
    prodMap[d.product].amount += d.amount;
    if(typeof d.rate === 'number') prodMap[d.product].rates[d.rate] = true;
    prodMap[d.product].deliveries.push(d);
    grandTotal += d.amount;
  });
  Object.keys(prodMap).forEach(function(p){
    var entry = prodMap[p];
    entry.amount = round2(entry.amount);
    var rateKeys = Object.keys(entry.rates).map(function(r){ return parseFloat(r); }).sort(function(a,b){ return a-b; });
    if(rateKeys.length === 1){
      entry.rateLabel = '₹' + rateKeys[0] + '/' + (PRODUCTS[p] ? PRODUCTS[p].unit : 'unit');
    } else if(rateKeys.length > 1) {
      entry.rateLabel = 'Varies';
    } else {
      entry.rateLabel = '₹' + (PRODUCTS[p] ? PRODUCTS[p].price : 0) + '/' + (PRODUCTS[p] ? PRODUCTS[p].unit : 'unit');
    }
  });
  return { customer:c, range: range, deliveries:dels, products:prodMap, grandTotal: sumAmount(dels) };
}

function renderBillingPage(){
  var month = document.getElementById('billMonth').value;
  if(!month) return;

  var range = getBillingRange();
  var bills = customers.map(function(c){ return buildCustomerBill(c.id); })
    .filter(function(b){ return b.deliveries.length > 0; });

  var totalRevenue = bills.reduce(function(s,b){ return s + b.grandTotal; }, 0);
  document.getElementById('billStats').innerHTML =
    '<div class="stat-card"><div class="stat-v">' + bills.length + '</div><div class="stat-l">Customers Billed</div></div>' +
    '<div class="stat-card green"><div class="stat-v">' + money(totalRevenue) + '</div><div class="stat-l">Total Revenue</div></div>' +
    '<div class="stat-card amber"><div class="stat-v">' + (bills.length ? money(totalRevenue/bills.length) : '₹0') + '</div><div class="stat-l">Avg Bill / Customer</div></div>';

  var grid = document.getElementById('billGrid');
  if(!bills.length){
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><span class="icon">💰</span><p>No deliveries found for ' + range.from + ' to ' + range.to + '</p></div>';
    return;
  }

  grid.innerHTML = bills.map(function(b){
    var rows = Object.keys(b.products).map(function(p){
      var info = PRODUCTS[p] || { icon:'', unit:'' };
      var pr = b.products[p];
      return '<div class="bill-row"><span>' + info.icon + ' ' + p + ' — ' + pr.qty.toFixed(2) + ' ' + info.unit + ' × ' + pr.rateLabel + '</span><strong>' + money(pr.amount) + '</strong></div>';
    }).join('');
    return '<div class="bill-card">' +
      '<div class="bill-card-top">' +
        '<div><div class="bill-cust-name">' + escapeHtml(b.customer.name) + '</div><div class="bill-cust-meta">' + b.customer.id + ' · ' + b.deliveries.length + ' deliveries</div></div>' +
        '<div class="bill-total">' + money(b.grandTotal) + '</div>' +
      '</div>' +
      '<div class="bill-rows">' + rows + '</div>' +
      '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">' +
        '<button class="btn btn-ghost btn-sm" style="flex:1" onclick="openBillModal(\'' + b.customer.id + '\')">📄 View Full Bill</button>' +
        '<button class="btn btn-ghost btn-sm" style="flex:1" title="Add Previous/Missed Deliveries" onclick="openBackdatedModal(\'' + b.customer.id + '\')">➕ Missed Deliveries</button>' +
        '<button class="btn btn-sm" style="flex:1 1 100%;background:var(--wa);color:#fff" title="Send this bill to the customer on WhatsApp" onclick="sendBillWhatsApp(\'' + b.customer.id + '\')">📱 WhatsApp Bill</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function generateAllBills(){
  var month = document.getElementById('billMonth').value;
  var bills = customers.map(function(c){ return buildCustomerBill(c.id, month); }).filter(function(b){ return b.deliveries.length > 0; });
  toast('⚡ Generated ' + bills.length + ' bills for ' + MONTHS[parseInt(month.split('-')[1])-1] + ' ' + month.split('-')[0], 'ok');
  logActivity('bill', 'Generated ' + bills.length + ' monthly bills for ' + month);
  renderBillingPage();
}

function openBillModal(custId){
  currentBillCust = custId;
  var b = buildCustomerBill(custId);
  var range = b.range.from + ' to ' + b.range.to;
  var rows = Object.keys(b.products).map(function(p){
    var info = PRODUCTS[p] || { icon:'', unit:'' };
    var pr = b.products[p];
    return '<tr><td>' + info.icon + ' ' + p + '</td><td style="text-align:center">' + pr.qty.toFixed(2) + ' ' + info.unit + '</td>' +
      '<td style="text-align:center">' + pr.rateLabel + '</td><td style="text-align:right;font-weight:800">' + money(pr.amount) + '</td></tr>';
  }).join('');

  var deliveryRows = b.deliveries.map(function(d){
    return '<tr><td>' + d.date + '</td><td>' + d.product + '</td><td style="text-align:center">' + d.qty.toFixed(2) + '</td>' +
      '<td style="text-align:right">' + money(d.amount) + '</td>' +
      '<td style="white-space:nowrap;text-align:right"><button class="btn-icon" title="Edit" onclick="openEditDelivery(\'' + d.id + '\')">✏️</button> <button class="btn-icon" title="Remove" onclick="deleteDelivery(\'' + d.id + '\')">🗑️</button></td></tr>';
  }).join('');

  document.getElementById('billModalContent').innerHTML =
    '<h2 style="color:var(--primary);margin-bottom:4px">Customer Invoice</h2>' +
    '<p style="color:var(--gray);font-size:.85rem;margin-bottom:16px">' + escapeHtml(b.customer.name) + ' (' + b.customer.id + ') · Period: ' + range + '</p>' +
    '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px">' +
      '<div><strong>Customer</strong><div>' + escapeHtml(b.customer.name) + '</div></div>' +
      '<div><strong>Customer ID</strong><div>' + b.customer.id + '</div></div>' +
      '<div><strong>Mobile</strong><div>' + escapeHtml(b.customer.mobile || '—') + '</div></div>' +
    '</div>' +
    '<table class="data-table" style="margin-bottom:14px">' +
      '<thead><tr><th>Product</th><th style="text-align:center">Qty</th><th style="text-align:center">Rate</th><th style="text-align:right">Amount</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>' +
    '<div class="delivery-total-bar" style="margin-bottom:18px"><span>Grand Total</span><strong>' + money(b.grandTotal) + '</strong></div>' +
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px"><h3>Delivery Details</h3>' +
      '<button class="btn btn-ghost btn-sm" onclick="openBackdatedModal(\'' + custId + '\')">➕ Add Previous/Missed Deliveries</button></div>' +
    '<table class="data-table" style="margin-bottom:14px">' +
      '<thead><tr><th>Date</th><th>Product</th><th style="text-align:center">Qty</th><th style="text-align:right">Amount</th><th></th></tr></thead>' +
      '<tbody>' + deliveryRows + '</tbody>' +
    '</table>' +
    '<div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">' +
      '<button class="btn btn-ghost" style="flex:1" onclick="closeModal(\'billModal\')">Close</button>' +
      '<button class="btn btn-primary" style="flex:1" onclick="downloadBillPDF(\'' + custId + '\')">📄 Download PDF</button>' +
      '<button class="btn btn-blue" style="flex:1" onclick="printBill(\'' + custId + '\')">🖨️ Print Bill</button>' +
      '<button class="btn" style="flex:1;background:var(--wa);color:#fff" onclick="sendBillWhatsApp(\'' + custId + '\')">📱 WhatsApp Bill</button>' +
    '</div>';

  openModal('billModal');
}

function downloadBillPDF(custId){
  if(window._pdfGenerating) return toast('PDF generation in progress', 'warn');
  window._pdfGenerating = true;
  var b = buildCustomerBill(custId);
  var filename = 'bill_' + b.customer.name.replace(/ /g,'_') + '_' + b.range.from + '_to_' + b.range.to + '.pdf';
  toast('Generating PDF…', 'info');

  // Render full HTML into an offscreen iframe and wait for images to load
  var iframe = document.createElement('iframe');
  iframe.style.position = 'fixed'; iframe.style.left = '-9999px'; iframe.style.top = '0'; iframe.style.width = '800px'; iframe.style.height = '1120px';
  document.body.appendChild(iframe);
  var idoc = iframe.contentWindow.document;
  idoc.open();
  idoc.write(renderInvoiceHTML(b));
  idoc.close();

  // Helper: wait for images in iframe to load or timeout
  function waitForImages(timeoutMs){
    return new Promise(function(resolve){
      var imgs = Array.from(idoc.images || []);
      if(!imgs.length) return resolve();
      var remaining = imgs.length;
      var timer = setTimeout(function(){ resolve(); }, timeoutMs || 3000);
      imgs.forEach(function(im){
        if(im.complete){ if(--remaining === 0){ clearTimeout(timer); resolve(); } }
        else im.addEventListener('load', function(){ if(--remaining === 0){ clearTimeout(timer); resolve(); } });
        im.addEventListener('error', function(){ if(--remaining === 0){ clearTimeout(timer); resolve(); } });
      });
    });
  }

  // Yield to UI and then generate PDF
  setTimeout(function(){
    waitForImages(4000).then(function(){
      ensureHtml2Canvas().then(function(){
        try{
          // Use html2canvas to capture the rendered invoice in the iframe and build a multi-page PDF
          var node = idoc.querySelector('main') || idoc.body;
          html2canvas(node, { scale: 2, useCORS: true, backgroundColor: '#ffffff' }).then(function(canvas){
            try{
              var pdf = new jspdf.jsPDF('p', 'mm', 'a4');
              var pdfWidth = 210, pdfHeight = 297; // A4 in mm
              var margin = 10; // mm
              var pdfInnerWidth = pdfWidth - margin*2;
              var pxPerMm = canvas.width / pdfInnerWidth;
              var sliceHeightPxPerPage = Math.floor((pdfHeight - margin*2) * pxPerMm);
              var totalHeightPx = canvas.height;
              var pageCount = Math.ceil(totalHeightPx / sliceHeightPxPerPage) || 1;

              for(var i=0;i<pageCount;i++){
                var srcY = i * sliceHeightPxPerPage;
                var sliceH = Math.min(sliceHeightPxPerPage, totalHeightPx - srcY);
                var tmpCanvas = document.createElement('canvas');
                tmpCanvas.width = canvas.width;
                tmpCanvas.height = sliceH;
                var ctx = tmpCanvas.getContext('2d');
                ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,tmpCanvas.width,tmpCanvas.height);
                ctx.drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
                var imgData = tmpCanvas.toDataURL('image/jpeg', 0.95);
                var imgHeightMm = sliceH / pxPerMm;
                pdf.addImage(imgData, 'JPEG', margin, margin, pdfInnerWidth, imgHeightMm);
                if(i < pageCount - 1) pdf.addPage();
              }

              pdf.save(filename);
              toast('PDF downloaded!', 'ok');
            }catch(e){ console.error('Error saving PDF', e); toast('Could not save PDF', 'err'); }
            finally{ window._pdfGenerating = false; setTimeout(function(){ try{ document.body.removeChild(iframe); }catch(e){} }, 50); }
          }).catch(function(err){
            console.error('html2canvas capture failed', err);
            toast('PDF generation failed (capture)', 'err');
            window._pdfGenerating = false; try{ document.body.removeChild(iframe); }catch(e){}
          });
        }catch(err){
          console.error('PDF generation failed', err);
          toast('PDF generation failed', 'err');
          window._pdfGenerating = false;
          try{ document.body.removeChild(iframe); }catch(e){}
        }
      }).catch(function(err){
        console.error('Could not load html2canvas', err);
        toast('Could not load html2canvas required for PDF', 'err');
        window._pdfGenerating = false;
        try{ document.body.removeChild(iframe); }catch(e){}
      });
    });
  }, 80);
}

function printBill(custId){
  var b = buildCustomerBill(custId);
  var docHtml = renderInvoiceHTML(b);

  // Use a same-origin hidden iframe (same technique as PDF export) rather than
  // opening a blob: URL in a new tab. A blob: document has no base path of its
  // own, so relative assets like the logo image fail to resolve there — and
  // some browsers handle full-document blob navigation unreliably, which is
  // what caused the print preview to get stuck on a blank/loading state.
  var iframe = document.createElement('iframe');
  iframe.style.position = 'fixed'; iframe.style.right = '0'; iframe.style.bottom = '0';
  iframe.style.width = '0'; iframe.style.height = '0'; iframe.style.border = '0';
  document.body.appendChild(iframe);
  var idoc = iframe.contentWindow.document;
  idoc.open();
  idoc.write(docHtml);
  idoc.close();

  var cleaned = false;
  function cleanup(){
    if(cleaned) return;
    cleaned = true;
    setTimeout(function(){ try{ document.body.removeChild(iframe); }catch(e){} }, 500);
  }

  function doPrint(){
    try{
      iframe.contentWindow.focus();
      // Remove the iframe only after the print dialog closes, not immediately
      // after calling print() — some browsers abort the job if the source
      // document disappears mid-dialog.
      iframe.contentWindow.onafterprint = cleanup;
      iframe.contentWindow.print();
      setTimeout(cleanup, 60000); // fail-safe if 'afterprint' never fires
    }catch(err){
      console.error('Print failed', err);
      toast('Could not open print dialog', 'err');
      cleanup();
    }
  }

  // Wait for the logo image to finish loading (success or failure) before
  // printing, so it isn't rendered mid-load / missing from the printout.
  var imgs = Array.from(idoc.images || []);
  if(!imgs.length){
    setTimeout(doPrint, 150);
  } else {
    var remaining = imgs.length;
    var timer = setTimeout(doPrint, 3000);
    imgs.forEach(function(im){
      function done(){ if(--remaining === 0){ clearTimeout(timer); doPrint(); } }
      if(im.complete) done();
      else { im.addEventListener('load', done); im.addEventListener('error', done); }
    });
  }
}

function renderInvoiceHTML(b){
  var logo;
  try{ logo = new URL('logo.png', window.location.href).href; }catch(e){ logo = 'logo.png'; }
  var today = new Date().toLocaleDateString('en-IN');
  var range = b.range.from + ' to ' + b.range.to;
  var products = Object.keys(b.products).map(function(p){
    var info = PRODUCTS[p] || { icon:'', unit:'' };
    var pr = b.products[p];
    var rate = pr.rateLabel || ('₹' + (info.price || 0) + '/' + info.unit);
    return '<tr>' +
      '<td>' + escapeHtml(info.icon + ' ' + p) + '</td>' +
      '<td style="text-align:center">' + Number(pr.qty).toFixed(2) + ' ' + escapeHtml(info.unit) + '</td>' +
      '<td style="text-align:center">' + escapeHtml(rate) + '</td>' +
      '<td style="text-align:right">' + money(pr.amount) + '</td>' +
    '</tr>';
  }).join('');

  var deliveryRows = b.deliveries.map(function(d){
    return '<tr><td>' + escapeHtml(fmtDate(d.date)) + '</td><td>' + escapeHtml(d.product) + '</td><td style="text-align:center">' + Number(d.qty).toFixed(2) + '</td><td style="text-align:right">' + money(d.amount) + '</td></tr>';
  }).join('');
  // Use more robust CSS for pagination and consistent rendering
  var html = '<!doctype html><html><head><meta charset="utf-8"><title>Invoice - ' + escapeHtml(b.customer.name) + '</title>' +
    '<style>@page{size:A4;margin:12mm}body{font-family:Inter,Arial,sans-serif;color:#111;padding:0;margin:0}main{padding:24px;max-width:780px;margin:0 auto}header{margin-bottom:18px;text-align:center}header img{height:72px;display:block;margin:0 auto 8px}h1{margin:0;color:#111;font-size:20px}h2{margin:0;font-size:14px;color:#555}table{width:100%;border-collapse:collapse;margin-top:12px;page-break-inside:auto}thead{display:table-header-group}tbody{display:table-row-group}tr{page-break-inside:avoid;page-break-after:auto}th,td{padding:8px;border:1px solid #eee;font-size:12px}th{background:#f4f4f8;color:#111;text-align:left}tfoot td{border:none;padding-top:12px;font-weight:800;font-size:13px}@media print{body{padding:0} .no-print{display:none}}</style>' +
    '</head><body><main>' +
    '<header>' +
      (logo? '<img src="'+logo+'" alt="logo">' : '') +
      '<h1>Bhati Farms Ledger</h1>' +
      '<div style="font-size:12px;color:#666">Monthly Bill</div>' +
      '<div style="margin-top:8px;color:#666;font-size:12px">Invoice Date: ' + escapeHtml(today) + '</div>' +
      '<div style="margin-top:4px;color:#666;font-size:12px">Period: ' + escapeHtml(fmtDateLong(b.range.from)) + ' to ' + escapeHtml(fmtDateLong(b.range.to)) + '</div>' +
    '</header>' +
    '<section>' +
      '<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">' +
        '<div><strong>Customer</strong><div>' + escapeHtml(b.customer.name) + '</div><div style="color:#666">' + escapeHtml(b.customer.id) + '</div></div>' +
        '<div style="text-align:right"><strong>Mobile</strong><div>' + escapeHtml(b.customer.mobile || '—') + '</div><div style="color:#666">Payment: —</div></div>' +
      '</div>' +
    '</section>' +
    '<table aria-label="Products"><thead><tr><th>Product</th><th style="text-align:center">Qty</th><th style="text-align:center">Rate</th><th style="text-align:right">Amount</th></tr></thead><tbody>' + products + '</tbody><tfoot><tr><td colspan="3" style="text-align:right">Grand Total</td><td style="text-align:right">' + money(b.grandTotal) + '</td></tr></tfoot></table>' +
    '<h3 style="margin-top:18px">Delivery Details</h3>' +
    '<table aria-label="Deliveries"><thead><tr><th>Date</th><th>Product</th><th style="text-align:center">Qty</th><th style="text-align:right">Amount</th></tr></thead><tbody>' + deliveryRows + '</tbody></table>' +
    '<footer style="margin-top:18px;text-align:center;color:#666">Thank you for your business.</footer>' +
    '</main></body></html>';
  return html;
}


// ══════════════════════════════════════════════════════
//  WHATSAPP BILL
//  Read-only: builds a message from buildCustomerBill() (the SAME object the billing
//  page, PDF and print use) and never creates/edits/deletes a delivery.
//
//  WHATSAPP_MODE
//    'link' (default) - opens a WhatsApp chat with the bill text pre-filled. The user
//                       presses Send inside WhatsApp. Works with no setup.
//    'api'            - asks the Apps Script backend to send through the WhatsApp Cloud
//                       API. Credentials live ONLY in Apps Script "Script properties"
//                       (see Code.gs). Only enable after the backend is configured.
// ══════════════════════════════════════════════════════
var WHATSAPP_MODE = 'link';
var WA_MAX_TEXT = 3000;      // keep the message short enough for a wa.me link
var _waBusy = {};            // one send per customer at a time

// -> { ok:true, number:'919876543210' } | { ok:false, reason:'missing'|'invalid' }
function normalizeWhatsAppNumber(raw){
  if(raw === null || typeof raw === 'undefined') return { ok:false, reason:'missing' };
  var s = String(raw).trim();
  if(!s) return { ok:false, reason:'missing' };
  var hasPlus = s.charAt(0) === '+';
  var d = s.replace(/\D/g, '');
  if(!d) return { ok:false, reason:'invalid' };
  if(hasPlus || d.slice(0,2) === '00'){
    if(d.slice(0,2) === '00') d = d.slice(2);
    return (d.length >= 10 && d.length <= 15 && d.charAt(0) !== '0') ? { ok:true, number:d } : { ok:false, reason:'invalid' };
  }
  if(d.length === 10 && /^[6-9]/.test(d)) return { ok:true, number:'91' + d };                         // 9876543210
  if(d.length === 11 && d.charAt(0) === '0' && /^[6-9]/.test(d.slice(1))) return { ok:true, number:'91' + d.slice(1) }; // 09876543210
  if(d.length === 12 && d.slice(0,2) === '91' && /^[6-9]/.test(d.slice(2))) return { ok:true, number:d };  // 919876543210
  return { ok:false, reason:'invalid' };
}

// "42.00 L" or "42.00 L + 3.00 unit" - summed per unit from the bill's own product totals
function billTotalQtyLabel(b){
  var units = {};
  Object.keys(b.products).forEach(function(p){
    var u = (PRODUCTS[p] && PRODUCTS[p].unit) || 'unit';
    units[u] = (units[u] || 0) + b.products[p].qty;
  });
  return Object.keys(units).map(function(u){ return units[u].toFixed(2) + ' ' + u; }).join(' + ');
}

// Same content as the printed invoice: customer, period, product summary, delivery
// details, grand total. All numbers come straight from `b`.
function buildBillWhatsAppText(b){
  var prods = Object.keys(b.products);
  var summary = prods.map(function(p){
    var info = PRODUCTS[p] || { icon:'', unit:'' }, pr = b.products[p];
    return (info.icon ? info.icon + ' ' : '') + p + ': ' + pr.qty.toFixed(2) + ' ' + info.unit + ' x ' + pr.rateLabel + ' = ' + money(pr.amount);
  }).join('\n');

  function assemble(details){
    return '*Bhati Farms Ledger*\n' +
      'Monthly Bill\n\n' +
      'Customer: ' + b.customer.name + ' (' + b.customer.id + ')\n' +
      'Period: ' + fmtDateLong(b.range.from) + ' to ' + fmtDateLong(b.range.to) + '\n' +
      'Invoice Date: ' + new Date().toLocaleDateString('en-IN') + '\n\n' +
      '*Summary*\n' + summary + '\n\n' +
      details +
      'Total Quantity: ' + billTotalQtyLabel(b) + '\n' +
      '*Grand Total: ' + money(b.grandTotal) + '*\n\n' +
      'Thank you for your business.';
  }

  var lines = b.deliveries.map(function(d){
    return fmtDate(d.date) + ' | ' + d.product + ' | ' + Number(d.qty).toFixed(2) + ' | ' + money(d.amount);
  }).join('\n');
  var text = assemble('*Delivery Details* (Date | Product | Qty | Amount)\n' + lines + '\n\n');
  if(text.length > WA_MAX_TEXT){
    text = assemble('*Deliveries:* ' + b.deliveries.length + ' (full list omitted to keep this message short)\n\n');
  }
  return text;
}

function openWhatsAppChat(number, text, name){
  var url = 'https://wa.me/' + number + '?text=' + encodeURIComponent(text);
  var w = window.open(url, '_blank');
  if(!w){ toast('Your browser blocked the WhatsApp window. Allow pop-ups for this page and try again.', 'err'); return; }
  try{ w.opener = null; }catch(e){}
  // Honest wording: opening the chat is NOT the same as the message being sent.
  toast('WhatsApp opened for ' + name + ' - press Send there to deliver the bill', '');
}

async function sendBillWhatsApp(custId){
  if(_waBusy[custId]) return;
  var c = custById(custId);
  if(!c){ toast('Customer not found', 'err'); return; }

  var num = normalizeWhatsAppNumber(c.mobile);
  if(!num.ok){
    toast(num.reason === 'missing'
      ? 'Customer mobile number is not available.'
      : 'Customer mobile number is invalid ("' + String(c.mobile) + '"). Please correct it in the customer profile.', 'err');
    return;
  }

  var b = buildCustomerBill(custId);                 // exactly what the billing page shows
  if(!b.range.from || !b.range.to){ toast('Select a billing period first', 'err'); return; }
  if(!b.deliveries.length){ toast('No deliveries in the selected period - nothing to send', 'err'); return; }
  var text = buildBillWhatsAppText(b);

  _waBusy[custId] = true;
  try{
    if(WHATSAPP_MODE === 'api'){
      if(!confirm('Send this bill to ' + c.name + ' on WhatsApp (+' + num.number + ')?')) return;
      try{
        toast('Sending via WhatsApp...', '');
        var res = await sheetRequest('sendWhatsAppBill', {
          custId: c.id,                               // the backend looks up the number itself
          text: text,
          tpl: {
            name: c.name,
            period: fmtDateLong(b.range.from) + ' to ' + fmtDateLong(b.range.to),
            qty: billTotalQtyLabel(b),
            amount: money(b.grandTotal),
            count: String(b.deliveries.length)
          }
        });
        if(!res || !res.success) throw new Error((res && res.error) || 'WhatsApp API request failed');
        toast('Bill accepted by WhatsApp for ' + c.name, 'ok');
        return;
      }catch(err){
        console.error('WhatsApp API send failed', err);
        toast('Automatic sending failed: ' + (err.message || err) + '. Opening WhatsApp chat instead.', 'err');
        // fall through to the link fallback
      }
    }
    openWhatsAppChat(num.number, text, c.name);
  }finally{
    delete _waBusy[custId];
  }
}