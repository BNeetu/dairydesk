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
        '<div><div class="bill-cust-name">' + b.customer.name + '</div><div class="bill-cust-meta">' + b.customer.id + ' · ' + b.deliveries.length + ' deliveries</div></div>' +
        '<div class="bill-total">' + money(b.grandTotal) + '</div>' +
      '</div>' +
      '<div class="bill-rows">' + rows + '</div>' +
      '<div style="display:flex;gap:8px;margin-top:10px">' +
        '<button class="btn btn-ghost btn-sm" style="flex:1" onclick="openBillModal(\'' + b.customer.id + '\')">📄 View Full Bill</button>' +
        '<button class="btn btn-primary btn-sm" style="flex:1" onclick="downloadBillPDF(\'' + b.customer.id + '\')">📥 PDF</button>' +
        '<button class="btn btn-blue btn-sm" style="flex:1" onclick="printBill(\'' + b.customer.id + '\')">🖨️ Print</button>' +
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
    '<p style="color:var(--gray);font-size:.85rem;margin-bottom:16px">' + b.customer.name + ' (' + b.customer.id + ') · Period: ' + range + '</p>' +
    '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px">' +
      '<div><strong>Customer</strong><div>' + b.customer.name + '</div></div>' +
      '<div><strong>Customer ID</strong><div>' + b.customer.id + '</div></div>' +
      '<div><strong>Mobile</strong><div>' + (b.customer.mobile || '—') + '</div></div>' +
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
  var b = buildCustomerBill(custId);
  var filename = 'Invoice_' + b.customer.name.replace(/ /g,'_') + '_' + b.range.from + '_to_' + b.range.to + '.pdf';
  var container = document.createElement('div');
  container.style.position = 'fixed'; container.style.left = '-9999px'; container.style.top = '0';
  container.innerHTML = renderInvoiceHTML(b);
  document.body.appendChild(container);
  var doc = new jspdf.jsPDF('p', 'mm', 'a4');
  doc.html(container, {
    callback: function(doc){
      doc.save(filename);
      container.remove();
      toast('PDF downloaded!', 'ok');
    },
    x: 10,
    y: 10,
    html2canvas: { scale: 1 }
  });
}

function printBill(custId){
  var b = buildCustomerBill(custId);
  var printWindow = window.open('', '_blank');
  printWindow.document.write(renderInvoiceHTML(b));
  printWindow.document.close();
  printWindow.focus();
  setTimeout(function(){ printWindow.print(); }, 300);
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
      '<td>' + info.icon + ' ' + p + '</td>' +
      '<td style="text-align:center">' + pr.qty.toFixed(2) + ' ' + info.unit + '</td>' +
      '<td style="text-align:center">' + rate + '</td>' +
      '<td style="text-align:right">' + money(pr.amount) + '</td>' +
    '</tr>';
  }).join('');

  var deliveryRows = b.deliveries.map(function(d){
    return '<tr><td>' + fmtDate(d.date) + '</td><td>' + d.product + '</td><td style="text-align:center">' + d.qty.toFixed(2) + '</td><td style="text-align:right">' + money(d.amount) + '</td></tr>';
  }).join('');

  var html = '<!doctype html><html><head><meta charset="utf-8"><title>Invoice - ' + b.customer.name + '</title>' +
    '<style>body{font-family:Inter,Arial,sans-serif;color:#111;padding:24px;max-width:800px;margin:0 auto}header{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}header img{height:56px}h1{margin:0;color:#111;font-size:20px}h2{margin:0;font-size:14px;color:#555}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{padding:8px;border:1px solid #eee}th{background:#f4f4f8;color:#111;text-align:left}tfoot td{border:none;padding-top:12px;font-weight:800}@media print{body{padding:12mm} .no-print{display:none}}</style>' +
    '</head><body>' +
    '<header>' +
      '<div style="display:flex;align-items:center;gap:12px">' + (logo? '<img src="'+logo+'" alt="logo">' : '') + '<div><h1>Bhati Farms Ledger</h1><div style="font-size:12px;color:#666">Monthly Bill</div></div></div>' +
      '<div style="text-align:right">' +
        '<div style="font-size:12px;color:#666">Invoice Date</div><div>' + today + '</div>' +
        '<div style="font-size:12px;color:#666;margin-top:8px">Period</div><div>' + range + '</div>' +
      '</div>' +
    '</header>' +
    '<section>' +
      '<div style="display:flex;justify-content:space-between;gap:12px">' +
        '<div><strong>Customer</strong><div>' + b.customer.name + '</div><div style="color:#666">' + b.customer.id + '</div></div>' +
        '<div style="text-align:right"><strong>Mobile</strong><div>' + (b.customer.mobile || '—') + '</div><div style="color:#666">Payment: —</div></div>' +
      '</div>' +
    '</section>' +
    '<table aria-label="Products"><thead><tr><th>Product</th><th style="text-align:center">Qty</th><th style="text-align:center">Rate</th><th style="text-align:right">Amount</th></tr></thead><tbody>' + products + '</tbody><tfoot><tr><td colspan="3" style="text-align:right">Grand Total</td><td style="text-align:right">' + money(b.grandTotal) + '</td></tr></tfoot></table>' +
    '<h3 style="margin-top:18px">Delivery Details</h3>' +
    '<table aria-label="Deliveries"><thead><tr><th>Date</th><th>Product</th><th style="text-align:center">Qty</th><th style="text-align:right">Amount</th></tr></thead><tbody>' + deliveryRows + '</tbody></table>' +
    '<footer style="margin-top:18px;text-align:center;color:#666">Thank you for your business.</footer>' +
    '</body></html>';
  return html;
}
