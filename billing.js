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
  var dels = deliveries.filter(function(d){
    return d.custId === custId && d.date >= range.from && d.date <= range.to;
  });
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
    var rateKeys = Object.keys(entry.rates).map(function(r){ return parseFloat(r); }).sort(function(a,b){ return a-b; });
    if(rateKeys.length === 1){
      entry.rateLabel = '₹' + rateKeys[0] + '/' + (PRODUCTS[p] ? PRODUCTS[p].unit : 'unit');
    } else if(rateKeys.length > 1) {
      entry.rateLabel = 'Varies';
    } else {
      entry.rateLabel = '₹' + (PRODUCTS[p] ? PRODUCTS[p].price : 0) + '/' + (PRODUCTS[p] ? PRODUCTS[p].unit : 'unit');
    }
  });
  return { customer:c, range: range, deliveries:dels, products:prodMap, grandTotal: Math.round(grandTotal*100)/100 };
}

function renderBillingPage(){
  var month = document.getElementById('billMonth').value;
  if(!month) return;

  var range = getBillingRange();
  var bills = activeCustomers().map(function(c){ return buildCustomerBill(c.id); })
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
      '<div style="display:flex;gap:8px;margin-top:10px">' +
        '<button class="btn btn-ghost btn-sm" style="flex:1" onclick="openBillModal(\'' + b.customer.id + '\')">📄 View Full Bill</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function generateAllBills(){
  var month = document.getElementById('billMonth').value;
  var bills = activeCustomers().map(function(c){ return buildCustomerBill(c.id, month); }).filter(function(b){ return b.deliveries.length > 0; });
  toast('⚡ Generated ' + bills.length + ' bills for ' + MONTHS[parseInt(month.split('-')[1])-1] + ' ' + month.split('-')[0], 'ok');
  logActivity('bill', 'Generated ' + bills.length + ' monthly bills for ' + month);
  renderBillingPage();
}

function openBillModal(custId){
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
      '<td style="text-align:right">' + money(d.amount) + '</td></tr>';
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
    '<h3 style="margin-bottom:8px">Delivery Details</h3>' +
    '<table class="data-table" style="margin-bottom:14px">' +
      '<thead><tr><th>Date</th><th>Product</th><th style="text-align:center">Qty</th><th style="text-align:right">Amount</th></tr></thead>' +
      '<tbody>' + deliveryRows + '</tbody>' +
    '</table>' +
    '<div style="display:flex;gap:8px;margin-top:14px">' +
      '<button class="btn btn-ghost" style="flex:1" onclick="closeModal(\'billModal\')">Close</button>' +
      '<button class="btn btn-primary" style="flex:1" onclick="downloadBillPDF(\'' + custId + '\')">📄 Download PDF</button>' +
      '<button class="btn btn-blue" style="flex:1" onclick="printBill(\'' + custId + '\')">🖨️ Print Bill</button>' +
    '</div>';

  openModal('billModal');
}

function downloadBillPDF(custId){
  if(window._pdfGenerating) return toast('PDF generation in progress', 'warn');
  window._pdfGenerating = true;
  var b = buildCustomerBill(custId);
  var filename = 'billa_' + b.customer.name.replace(/ /g,'_') + '_' + b.range.from + '_to_' + b.range.to + '.pdf';
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
  // Create a standalone HTML page in a Blob that triggers print on load.
  var docHtml = renderInvoiceHTML(b);
  // Append a small script to call print after load and then optionally close the tab.
  var autoPrint = '<script>window.addEventListener("load", function(){ setTimeout(function(){ try{ window.print(); }catch(e){} }, 200); });</' + 'script>';
  var full = docHtml.replace(/<\/body>/i, autoPrint + '\n</body>');
  try{
    var blob = new Blob([full], { type: 'text/html' });
    var url = URL.createObjectURL(blob);
    // Open in a new tab detached from opener to avoid blocking the main app.
    var w = window.open(url, '_blank', 'noopener');
    // Revoke URL after a short delay
    setTimeout(function(){ try{ URL.revokeObjectURL(url); }catch(e){} }, 5000);
  }catch(err){
    console.error('Print fallback', err);
    // Fallback to original approach
    var printWindow = window.open('', '_blank');
    printWindow.document.write(docHtml);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(function(){ try{ printWindow.print(); }catch(e){} }, 300);
  }
}

function renderInvoiceHTML(b){
  var logo = 'logo.png';
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