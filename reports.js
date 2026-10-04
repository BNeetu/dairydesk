// ══════════════════════════════════════════════════════
//  REPORTS MODULE
// ══════════════════════════════════════════════════════
// Normalize any date-ish input (date-only, month-only, or full ISO datetime)
// into a plain YYYY-MM-DD string. Falls back to today on anything unparsable.
function toIsoDate(d){
  try{
    var s = d || '';
    s = String(s).trim();
    if(!s) return todayStr();
    if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if(/^\d{4}-\d{2}$/.test(s)) return s + '-01';
    var dt = new Date(s);
    if(!isNaN(dt.getTime())) return localISO(dt);
    dt = new Date(s + 'T00:00:00');
    if(!isNaN(dt.getTime())) return localISO(dt);
    return todayStr();
  }catch(e){ return todayStr(); }
}

function renderReportContent(){
  var type = document.getElementById('reportType').value;
  var dateVal = toIsoDate(document.getElementById('reportDate').value || todayStr());
  var el = document.getElementById('reportContent');

  if(type === 'period')  el.innerHTML = buildPeriodReport();
  if(type === 'top')     el.innerHTML = buildTopReport();
  if(type === 'daily')   el.innerHTML = buildDailyReport(dateVal);
  if(type === 'weekly')  el.innerHTML = buildWeeklyReport(dateVal);
  if(type === 'monthly') el.innerHTML = buildMonthlyReport(dateVal);
  if(type === 'revenue') el.innerHTML = buildRevenueReport(dateVal);
  if(type === 'product') el.innerHTML = buildProductReport();
  if(type === 'buyers')  el.innerHTML = buildBuyersReport(dateVal);
}

function reportTableRows(list){
  return list.map(function(d){
    var info = PRODUCTS[d.product] || { icon:"", unit:"", price:0 };
    return '<tr><td>' + fmtDate(d.date) + '</td><td>' + escapeHtml(d.custName) + '</td><td>' + d.slot + '</td><td>' + info.icon + ' ' + d.product + '</td><td>' + d.qty + ' ' + info.unit + '</td><td style="font-weight:700">' + money(d.amount) + '</td></tr>';
  }).join('') || '<tr><td colspan="6"><div class="empty"><span class="icon">📭</span><p>No records</p></div></td></tr>';
}

function buildPeriodReport(){
  var r = periodRange(), list = periodDeliveries();
  var custRows = customers.map(function(c){ return customerSummary(c.id, r.from, r.to); }).map(function(s, i){ return { c: customers[i], s: s }; })
    .filter(function(x){ return x.s.count > 0; })
    .map(function(x){ return '<tr><td>' + escapeHtml(x.c.name) + '</td><td>' + x.s.count + '</td><td style="font-weight:700">' + money(x.s.amount) + '</td></tr>'; }).join('');
  var prodRows = Object.keys(PRODUCTS).map(function(p){
    var l = list.filter(function(d){ return d.product === p; });
    return l.length ? '<tr><td>' + PRODUCTS[p].icon + ' ' + p + '</td><td>' + sumQty(list, p).toFixed(2) + ' ' + PRODUCTS[p].unit + '</td><td style="font-weight:700">' + money(sumAmount(l)) + '</td></tr>' : '';
  }).join('');
  return '<h3 style="margin-bottom:10px">Deliveries Range Summary — ' + fmtDateLong(r.from) + ' to ' + fmtDateLong(r.to) + '</h3>' +
    '<div class="stats-row-sm"><div class="stat-card"><div class="stat-v">' + list.length + '</div><div class="stat-l">Records</div></div>' +
    '<div class="stat-card green"><div class="stat-v">' + money(sumAmount(list)) + '</div><div class="stat-l">Total Amount</div></div></div>' +
    '<h4 style="margin:12px 0 6px;font-size:.86rem">By Customer</h4><table class="data-table"><thead><tr><th>Customer</th><th>Records</th><th>Amount</th></tr></thead><tbody>' + (custRows || '<tr><td colspan="3">No data</td></tr>') + '</tbody></table>' +
    '<h4 style="margin:14px 0 6px;font-size:.86rem">By Product</h4><table class="data-table"><thead><tr><th>Product</th><th>Total Qty</th><th>Amount</th></tr></thead><tbody>' + (prodRows || '<tr><td colspan="3">No data</td></tr>') + '</tbody></table>';
}

function buildDailyReport(date){
  var list = deliveriesOn(date);
  return '<h3 style="margin-bottom:10px">Daily Delivery Report — ' + fmtDateLong(date) + '</h3>' +
    '<div class="stats-row-sm"><div class="stat-card"><div class="stat-v">' + list.length + '</div><div class="stat-l">Deliveries</div></div>' +
    '<div class="stat-card green"><div class="stat-v">' + money(sumAmount(list)) + '</div><div class="stat-l">Revenue</div></div></div>' +
    '<table class="data-table"><thead><tr><th>Date</th><th>Customer</th><th>Slot</th><th>Product</th><th>Qty</th><th>Amount</th></tr></thead><tbody>' + reportTableRows(list) + '</tbody></table>';
}

// One definition of "the week" shared by the on-screen report and the exports.
// (The old code built local-time Dates and called toISOString(), which shifts the
// window back a day in timezones ahead of UTC, e.g. India.)
function weeklyRange(date){
  var latest = toIsoDate(latestDataDate()), earliest = toIsoDate(earliestDataDate());
  var to = date > latest ? latest : date;                      // never go past the data we have
  return { from: addDaysISO(to, -6), to: to };
}

function buildWeeklyReport(date){
  var w = weeklyRange(date), sStr = w.from, eStr = w.to;
  var list = deliveriesInRange(sStr, eStr);
  return '<h3 style="margin-bottom:10px">Weekly Report — ' + fmtDateLong(sStr) + ' to ' + fmtDateLong(eStr) + '</h3>' +
    '<div class="stats-row-sm"><div class="stat-card"><div class="stat-v">' + list.length + '</div><div class="stat-l">Deliveries</div></div>' +
    '<div class="stat-card green"><div class="stat-v">' + money(sumAmount(list)) + '</div><div class="stat-l">Revenue</div></div>' +
    '<div class="stat-card amber"><div class="stat-v">' + new Set(list.map(function(d){return d.custId;})).size + '</div><div class="stat-l">Unique Buyers</div></div></div>' +
    '<table class="data-table"><thead><tr><th>Date</th><th>Customer</th><th>Slot</th><th>Product</th><th>Qty</th><th>Amount</th></tr></thead><tbody>' + reportTableRows(list) + '</tbody></table>';
}

function buildMonthlyReport(date){
  var month = date.slice(0,7);
  var list = deliveriesInMonth(month);
  var prodMap = {};
  list.forEach(function(d){
    if(!prodMap[d.product]) prodMap[d.product] = {qty:0, amount:0};
    prodMap[d.product].qty += d.qty; prodMap[d.product].amount += d.amount;
  });
  var prodRows = Object.keys(prodMap).map(function(p){
    var info = PRODUCTS[p] || { icon:"", unit:"", price:0 };
    return '<tr><td>' + info.icon + ' ' + p + '</td><td>' + prodMap[p].qty.toFixed(2) + ' ' + info.unit + '</td><td style="font-weight:700">' + money(prodMap[p].amount) + '</td></tr>';
  }).join('');
  return '<h3 style="margin-bottom:10px">Monthly Report — ' + MONTHS[parseInt(month.split('-')[1])-1] + ' ' + month.split('-')[0] + '</h3>' +
    '<div class="stats-row-sm"><div class="stat-card"><div class="stat-v">' + list.length + '</div><div class="stat-l">Deliveries</div></div>' +
    '<div class="stat-card green"><div class="stat-v">' + money(sumAmount(list)) + '</div><div class="stat-l">Revenue</div></div></div>' +
    '<table class="data-table"><thead><tr><th>Product</th><th>Total Qty</th><th>Total Amount</th></tr></thead><tbody>' + (prodRows||'<tr><td colspan="3">No data</td></tr>') + '</tbody></table>';
}

function buildRevenueReport(date){
  var latestDate = toIsoDate(latestDataDate());
  var useDate = date > latestDate ? latestDate : date;
  var month = useDate.slice(0,7);
  var todayRev = sumAmount(deliveriesOn(useDate));
  var monthRev = sumAmount(deliveriesInMonth(month));
  var yearRev = sumAmount(deliveries.filter(function(d){ return d.date.slice(0,4) === useDate.slice(0,4); }));
  var allTimeRev = sumAmount(deliveries);
  return '<h3 style="margin-bottom:10px">Revenue Report</h3>' +
    '<div class="stats-row-sm">' +
      '<div class="stat-card green"><div class="stat-v">' + money(todayRev) + '</div><div class="stat-l">Latest Day (' + fmtDate(useDate) + ')</div></div>' +
      '<div class="stat-card green"><div class="stat-v">' + money(monthRev) + '</div><div class="stat-l">This Month</div></div>' +
      '<div class="stat-card green"><div class="stat-v">' + money(yearRev) + '</div><div class="stat-l">This Year</div></div>' +
      '<div class="stat-card green"><div class="stat-v">' + money(allTimeRev) + '</div><div class="stat-l">All-Time</div></div>' +
    '</div>';
}

function buildProductReport(){
  var rows = Object.keys(PRODUCTS).map(function(p){
    var list = deliveries.filter(function(d){ return d.product === p; });
    var info = PRODUCTS[p] || { icon:"", unit:"", price:0 };
    var qty = sumQty(deliveries, p);
    var amt = sumAmount(list);
    return '<tr><td>' + info.icon + ' ' + p + '</td><td>' + qty.toFixed(2) + ' ' + info.unit + '</td><td>₹' + info.price + '/' + info.unit + '</td><td style="font-weight:700">' + money(amt) + '</td></tr>';
  }).join('');
  return '<h3 style="margin-bottom:10px">Product-wise Consumption (All-Time)</h3>' +
    '<table class="data-table"><thead><tr><th>Product</th><th>Total Qty Sold</th><th>Rate</th><th>Total Revenue</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

function buildBuyersReport(date){
  var month = date.slice(0,7);
  var totalBuyers = customers.length;
  var activeBuyers = activeCustomers().length;
  var newThisMonth = customers.filter(function(c){ return c.regDate.startsWith(month); }).length;
  var newRows = customers.filter(function(c){ return c.regDate.startsWith(month); })
    .map(function(c){ return '<tr><td>' + c.id + '</td><td>' + escapeHtml(c.name) + '</td><td>' + escapeHtml(c.mobile) + '</td><td>' + fmtDate(c.regDate) + '</td></tr>'; }).join('');
  return '<h3 style="margin-bottom:10px">Buyers Report — ' + MONTHS[parseInt(month.split('-')[1])-1] + ' ' + month.split('-')[0] + '</h3>' +
    '<div class="stats-row-sm">' +
      '<div class="stat-card"><div class="stat-v">' + totalBuyers + '</div><div class="stat-l">Total Buyers</div></div>' +
      '<div class="stat-card green"><div class="stat-v">' + activeBuyers + '</div><div class="stat-l">Active Buyers</div></div>' +
      '<div class="stat-card amber"><div class="stat-v">' + newThisMonth + '</div><div class="stat-l">New This Month</div></div>' +
    '</div>' +
    '<h4 style="margin:14px 0 8px;font-size:.86rem">New Buyers This Month</h4>' +
    '<table class="data-table"><thead><tr><th>ID</th><th>Name</th><th>Mobile</th><th>Registered</th></tr></thead><tbody>' + (newRows || '<tr><td colspan="4"><div class="empty"><span class="icon">👤</span><p>No new buyers this month</p></div></td></tr>') + '</tbody></table>';
}

// ── EXPORTS ──────────────────────────────────────────
function exportReportExcel(){
  var type = document.getElementById('reportType').value;
  var date = toIsoDate(document.getElementById('reportDate').value || todayStr());
  var wb = XLSX.utils.book_new();
  var data = [];

  if(type === 'daily') data = deliveriesOn(date);
  else if(type === 'weekly'){ var w = weeklyRange(date); data = deliveriesInRange(w.from, w.to); }
  else if(type === 'monthly') data = deliveriesInMonth(date.slice(0,7));
  else if(type === 'period') data = periodDeliveries();
  else data = deliveries;

  var rows = data.map(function(d){
    return { Date: fmtDate(d.date), Customer: d.custName, Slot: d.slot, Product: d.product, Qty: d.qty, Unit: (PRODUCTS[d.product] || {}).unit || "", Amount: d.amount };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{Note:'No data'}]), 'Report');
  XLSX.writeFile(wb, 'DairyDesk_' + type + '_report.xlsx');
  toast('Excel exported!', 'ok');
}

function exportReportPDF(){
  var doc = new jspdf.jsPDF();
  var type = document.getElementById('reportType').value;
  doc.setFontSize(16); doc.setTextColor(79,70,229);
  doc.text('Bhati Farms - ' + type.charAt(0).toUpperCase()+type.slice(1) + ' Report', 14, 18);
  doc.setFontSize(10); doc.setTextColor(80,80,80);
  doc.text('Generated: ' + new Date().toLocaleDateString('en-IN'), 14, 26);

  var contentEl = document.getElementById('reportContent');
  var content = (contentEl.innerText || contentEl.textContent || '').split('\n').filter(Boolean);
  var y = 38;
  content.forEach(function(line){
    doc.text(line.slice(0,100), 14, y);
    y += 6;
    if(y > 280){ doc.addPage(); y = 18; }
  });
  doc.save('DairyDesk_' + type + '_report.pdf');
  toast('PDF exported!', 'ok');
}