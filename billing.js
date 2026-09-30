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
      entry.rateLabel = '\u20B9' + rateKeys[0] + '/' + (PRODUCTS[p] ? PRODUCTS[p].unit : 'unit');
    } else if(rateKeys.length > 1) {
      entry.rateLabel = 'Varies';
    } else {
      entry.rateLabel = '\u20B9' + (PRODUCTS[p] ? PRODUCTS[p].price : 0) + '/' + (PRODUCTS[p] ? PRODUCTS[p].unit : 'unit');
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
    '<div class="stat-card amber"><div class="stat-v">' + (bills.length ? money(totalRevenue/bills.length) : '\u20B90') + '</div><div class="stat-l">Avg Bill / Customer</div></div>';

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

// ══════════════════════════════════════════════════════
//  BILL PREVIEW / DOWNLOAD / PRINT / WHATSAPP
//  All four use Invoice.create(buildCustomerBill(id)) (see invoice.js): the preview
//  you see, the PDF you download, the page you print and the PDF sent on WhatsApp
//  are drawn from the SAME layout, so they are always identical.
//  None of these functions creates, edits or deletes a delivery.
// ══════════════════════════════════════════════════════
function openBillModal(custId){
  currentBillCust = custId;
  var b = buildCustomerBill(custId);
  var inv = Invoice.create(b);

  var editRows = b.deliveries.map(function(d){
    var info = PRODUCTS[d.product] || { unit:'' };
    return '<tr><td>' + escapeHtml(fmtDate(d.date)) + '</td><td>' + escapeHtml(d.slot || '') + '</td><td>' + escapeHtml(d.product) + '</td>' +
      '<td style="text-align:right">' + d.qty.toFixed(2) + ' ' + escapeHtml(info.unit) + '</td>' +
      '<td style="text-align:right">' + money(d.amount) + '</td>' +
      '<td style="white-space:nowrap;text-align:right"><button class="btn-icon" title="Edit" onclick="openEditDelivery(\'' + d.id + '\')">✏️</button> <button class="btn-icon" title="Remove" onclick="deleteDelivery(\'' + d.id + '\')">🗑️</button></td></tr>';
  }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--gray)">No deliveries in this period</td></tr>';

  document.getElementById('billModalContent').innerHTML =
    '<h2 style="color:var(--primary);margin-bottom:12px;padding-right:36px">Invoice — ' + escapeHtml(b.customer.name) + '</h2>' +
    '<div class="inv-actions">' +
      '<button class="btn btn-primary" onclick="downloadBillPDF(\'' + custId + '\')">📄 Download PDF</button>' +
      '<button class="btn btn-blue" onclick="printBill(\'' + custId + '\')">🖨️ Print Bill</button>' +
      '<button class="btn" style="background:var(--wa);color:#fff" onclick="sendBillWhatsApp(\'' + custId + '\')">📱 WhatsApp Bill</button>' +
      '<button class="btn btn-ghost" onclick="closeModal(\'billModal\')">Close</button>' +
    '</div>' +
    '<div class="inv-preview" id="invPreview">' + Invoice.previewHTML(inv.pages) + '</div>' +
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin:18px 0 8px"><h3>Edit / Remove Deliveries</h3>' +
      '<button class="btn btn-ghost btn-sm" onclick="openBackdatedModal(\'' + custId + '\')">➕ Add Previous/Missed Deliveries</button></div>' +
    '<div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Slot</th><th>Product</th><th style="text-align:right">Qty</th><th style="text-align:right">Amount</th><th></th></tr></thead><tbody>' + editRows + '</tbody></table></div>';

  openModal('billModal');
}

function downloadBillPDF(custId){
  var c = custById(custId);
  if(!c){ toast('Customer not found', 'err'); return; }
  try{
    var inv = Invoice.create(buildCustomerBill(custId));
    Invoice.download(inv.pdf(), inv.filename);
    toast('PDF downloaded: ' + inv.filename, 'ok');
  }catch(err){
    console.error('PDF generation failed', err);
    toast('Could not create the PDF: ' + (err.message || err), 'err');
  }
}

// Print preview shows ONLY the invoice pages (A4, same layout as the PDF): no app UI at all.
function printBill(custId){
  var c = custById(custId);
  if(!c){ toast('Customer not found', 'err'); return; }
  var inv, html;
  try{
    inv = Invoice.create(buildCustomerBill(custId));
    html = Invoice.printDocument(inv.pages, inv.title);
  }catch(err){
    console.error('Print build failed', err);
    toast('Could not prepare the bill for printing: ' + (err.message || err), 'err');
    return;
  }

  // Preferred: a clean tab that contains nothing but the bill (also works on phones).
  // It is opened synchronously from the click so pop-up blockers allow it.
  var w = null;
  try{ w = window.open('', '_blank'); }catch(e){ w = null; }
  var host, cleanup;
  if(w){
    host = w;
    w.document.open(); w.document.write(html); w.document.close();
    w.onafterprint = function(){ try{ w.close(); }catch(e){} };
    cleanup = function(){};
  } else {
    // Pop-ups blocked: print from an off-screen, full-size iframe instead.
    var iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;visibility:hidden';
    document.body.appendChild(iframe);
    host = iframe.contentWindow;
    host.document.open(); host.document.write(html); host.document.close();
    host.onafterprint = function(){ setTimeout(function(){ try{ document.body.removeChild(iframe); }catch(e){} }, 300); };
    cleanup = function(){ setTimeout(function(){ try{ document.body.removeChild(iframe); }catch(e){} }, 60000); };
  }

  var fired = false;
  function go(){
    if(fired) return; fired = true;
    try{ host.focus(); host.print(); cleanup(); }
    catch(err){
      console.error('Print failed', err);
      toast('Could not open the print dialog. Use Download PDF and print the file.', 'err');
    }
  }
  // Wait for the embedded fonts so the printout never falls back to a different typeface.
  var fonts = host.document.fonts;
  if(fonts && fonts.load){
    Promise.all([fonts.load("400 10px DDInvoice"), fonts.load("700 10px DDInvoice")]).then(function(){ return fonts.ready; }).then(go, go);
    setTimeout(go, 3000);
  } else setTimeout(go, 400);
}

// ══════════════════════════════════════════════════════
//  WHATSAPP BILL — sends the actual PDF (never the bill as plain text)
//
//  A web page cannot silently attach a file to a WhatsApp chat: only the WhatsApp
//  Business Cloud API can do that. So there are two modes:
//
//  WHATSAPP_MODE = 'share' (default, needs no setup)
//    1. Phones / browsers with file-sharing: opens the system share sheet with the PDF
//       attached; choose WhatsApp, then the customer's chat (number shown in the toast).
//    2. Everything else (most desktop browsers): downloads the PDF and opens the
//       customer's WhatsApp chat (using their saved number) with a short greeting, so
//       you just attach the downloaded file.
//  WHATSAPP_MODE = 'api'
//    Sends the PDF straight to the customer's saved number through the WhatsApp Cloud
//    API. Credentials live only in Apps Script "Script properties" — see
//    whatsapp_pdf_handler.gs. Falls back to 'share' behaviour if the call fails.
// ══════════════════════════════════════════════════════
var WHATSAPP_MODE = 'share';
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

// billTotalQtyLabel() now lives in invoice.js (Invoice.billTotalQtyLabel) so the bill and
// every message share one definition.
function billTotalQtyLabel(b){ return Invoice.billTotalQtyLabel(b); }

// Short cover note that travels WITH the PDF (the bill itself is only in the PDF).
function billCaption(inv){
  var m = inv.model;
  return 'Hello ' + m.customer.name + ', your Bhati Farms bill for ' + m.period + ' is ' + Invoice.inr(m.grandTotal) +
         '. Please find the PDF invoice attached. Thank you!';
}

function openWhatsAppChat(number, text){
  var url = 'https://wa.me/' + number + '?text=' + encodeURIComponent(text);
  var w = null;
  try{ w = window.open(url, '_blank'); }catch(e){ w = null; }
  if(w){ try{ w.opener = null; }catch(e){} }
  return !!w;
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

  _waBusy[custId] = true;
  try{
    var inv = Invoice.create(b);
    var blob = inv.pdf();                            // same PDF as "Download PDF"
    var caption = billCaption(inv);
    var pretty = '+' + num.number;

    if(WHATSAPP_MODE === 'api'){
      if(!confirm('Send the PDF bill to ' + c.name + ' on WhatsApp (' + pretty + ')?')) return;
      try{
        toast('Sending PDF via WhatsApp...', '');
        var res = await sheetRequest('sendWhatsAppBillPDF', {
          custId: c.id, to: num.number, filename: inv.filename, caption: caption,
          pdfBase64: await Invoice.blobToBase64(blob),
          tpl: { name: c.name, period: inv.model.period, amount: Invoice.inr(inv.model.grandTotal) }
        });
        if(!res || !res.success) throw new Error((res && res.error) || 'WhatsApp API request failed');
        toast('PDF bill accepted by WhatsApp for ' + c.name, 'ok');
        return;
      }catch(err){
        console.error('WhatsApp API send failed', err);
        toast('Automatic sending failed: ' + (err.message || err) + '. Using manual sharing instead.', 'err');
      }
    }

    // 1) Share sheet with the PDF attached (phones, Safari, Chrome on Windows/ChromeOS)
    var file = null;
    try{ file = new File([blob], inv.filename, { type:'application/pdf' }); }catch(e){ file = null; }
    if(file && navigator.canShare && navigator.canShare({ files:[file] })){
      try{
        await navigator.share({ files:[file], title:inv.title, text:caption });
        toast('Choose WhatsApp \u2192 ' + c.name + ' (' + pretty + ') to send the PDF', 'ok');
        return;
      }catch(err){
        if(err && err.name === 'AbortError'){ toast('Sharing cancelled', ''); return; }
        console.warn('navigator.share failed, using download + chat fallback', err);
      }
    }

    // 2) Fallback: save the PDF, open the customer's chat, attach the file
    Invoice.download(blob, inv.filename);
    var opened = openWhatsAppChat(num.number, caption);
    toast(opened
      ? 'PDF downloaded. In the WhatsApp chat for ' + c.name + ' tap Attach \u2192 Document and pick ' + inv.filename
      : 'PDF downloaded. Pop-ups are blocked, so open WhatsApp for ' + pretty + ' and attach ' + inv.filename, opened ? 'ok' : 'warn');
  }finally{
    delete _waBusy[custId];
  }
}