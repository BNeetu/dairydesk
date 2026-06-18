// ══════════════════════════════════════════════════════
//  BILLING MODULE
// ══════════════════════════════════════════════════════
function initBillMonths(){
  var sel = document.getElementById('billMonth');
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
  sel.onchange = renderBillingPage;
}

function buildCustomerBill(custId, month){
  var c = custById(custId);
  var dels = deliveries.filter(function(d){ return d.custId === custId && d.date.startsWith(month); });
  var prodMap = {};
  var grandTotal = 0;
  dels.forEach(function(d){
    if(!prodMap[d.product]) prodMap[d.product] = { qty:0, amount:0 };
    prodMap[d.product].qty += d.qty;
    prodMap[d.product].amount += d.amount;
    grandTotal += d.amount;
  });
  return { customer:c, month:month, deliveries:dels, products:prodMap, grandTotal: Math.round(grandTotal*100)/100 };
}

function renderBillingPage(){
  var month = document.getElementById('billMonth').value;
  if(!month) return;

  var bills = activeCustomers().map(function(c){ return buildCustomerBill(c.id, month); })
    .filter(function(b){ return b.deliveries.length > 0; });

  var totalRevenue = bills.reduce(function(s,b){ return s + b.grandTotal; }, 0);
  document.getElementById('billStats').innerHTML =
    '<div class="stat-card"><div class="stat-v">' + bills.length + '</div><div class="stat-l">Customers Billed</div></div>' +
    '<div class="stat-card green"><div class="stat-v">' + money(totalRevenue) + '</div><div class="stat-l">Total Revenue</div></div>' +
    '<div class="stat-card amber"><div class="stat-v">' + (bills.length ? money(totalRevenue/bills.length) : '₹0') + '</div><div class="stat-l">Avg Bill / Customer</div></div>';

  var grid = document.getElementById('billGrid');
  if(!bills.length){
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><span class="icon">💰</span><p>No deliveries found for ' + MONTHS[parseInt(month.split('-')[1])-1] + ' ' + month.split('-')[0] + '</p></div>';
    return;
  }

  grid.innerHTML = bills.map(function(b){
    var rows = Object.keys(b.products).map(function(p){
      var info = PRODUCTS[p];
      var pr = b.products[p];
      return '<div class="bill-row"><span>' + info.icon + ' ' + p + ' — ' + pr.qty.toFixed(2) + ' ' + info.unit + ' × ₹' + info.price + '</span><strong>' + money(pr.amount) + '</strong></div>';
    }).join('');
    return '<div class="bill-card">' +
      '<div class="bill-card-top">' +
        '<div><div class="bill-cust-name">' + b.customer.name + '</div><div class="bill-cust-meta">' + b.customer.id + ' · ' + b.deliveries.length + ' deliveries</div></div>' +
        '<div class="bill-total">' + money(b.grandTotal) + '</div>' +
      '</div>' +
      '<div class="bill-rows">' + rows + '</div>' +
      '<button class="btn btn-ghost btn-sm" style="width:100%;justify-content:center" onclick="openBillModal(\'' + b.customer.id + '\',\'' + month + '\')">📄 View Full Bill</button>' +
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

function openBillModal(custId, month){
  var b = buildCustomerBill(custId, month);
  var mn = MONTHS[parseInt(month.split('-')[1])-1] + ' ' + month.split('-')[0];
  var rows = Object.keys(b.products).map(function(p){
    var info = PRODUCTS[p];
    var pr = b.products[p];
    return '<tr><td>' + info.icon + ' ' + p + '</td><td style="text-align:center">' + pr.qty.toFixed(2) + ' ' + info.unit + '</td>' +
      '<td style="text-align:center">₹' + info.price + '/' + info.unit + '</td><td style="text-align:right;font-weight:800">' + money(pr.amount) + '</td></tr>';
  }).join('');

  document.getElementById('billModalContent').innerHTML =
    '<h2 style="color:var(--primary);margin-bottom:4px">Monthly Bill</h2>' +
    '<p style="color:var(--gray);font-size:.85rem;margin-bottom:16px">' + b.customer.name + ' (' + b.customer.id + ') · ' + mn + '</p>' +
    '<table class="data-table" style="margin-bottom:14px">' +
      '<thead><tr><th>Product</th><th style="text-align:center">Qty</th><th style="text-align:center">Rate</th><th style="text-align:right">Amount</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>' +
    '<div class="delivery-total-bar"><span>Grand Total</span><strong>' + money(b.grandTotal) + '</strong></div>' +
    '<div style="display:flex;gap:8px;margin-top:14px">' +
      '<button class="btn btn-ghost" style="flex:1" onclick="closeModal(\'billModal\')">Close</button>' +
      '<button class="btn btn-primary" style="flex:1" onclick="downloadBillPDF(\'' + custId + '\',\'' + month + '\')">📄 Download PDF</button>' +
    '</div>';

  openModal('billModal');
}

function downloadBillPDF(custId, month){
  var b = buildCustomerBill(custId, month);
  var mn = MONTHS[parseInt(month.split('-')[1])-1] + ' ' + month.split('-')[0];
  var doc = new jspdf.jsPDF();
  doc.setFontSize(18); doc.setTextColor(79,70,229);
  doc.text('DairyDesk - Monthly Bill', 14, 18);
  doc.setFontSize(11); doc.setTextColor(60,60,60);
  doc.text(b.customer.name + ' (' + b.customer.id + ')', 14, 28);
  doc.text('Period: ' + mn, 14, 35);
  doc.text('Mobile: ' + b.customer.mobile, 14, 42);

  var y = 54;
  doc.setFontSize(10); doc.setTextColor(255,255,255);
  doc.setFillColor(79,70,229);
  doc.rect(14, y-6, 182, 8, 'F');
  doc.text('Product', 18, y);
  doc.text('Qty', 100, y);
  doc.text('Rate', 130, y);
  doc.text('Amount', 165, y);

  doc.setTextColor(40,40,40);
  Object.keys(b.products).forEach(function(p){
    y += 9;
    var info = PRODUCTS[p];
    var pr = b.products[p];
    doc.text(p, 18, y);
    doc.text(pr.qty.toFixed(2) + ' ' + info.unit, 100, y);
    doc.text('Rs.' + info.price, 130, y);
    doc.text('Rs.' + pr.amount.toFixed(2), 165, y);
  });

  y += 14;
  doc.setFontSize(13); doc.setTextColor(79,70,229);
  doc.text('Grand Total: Rs.' + b.grandTotal.toFixed(2), 14, y);

  doc.save('Bill_' + b.customer.name.replace(/ /g,'_') + '_' + month + '.pdf');
  toast('PDF downloaded!', 'ok');
}
