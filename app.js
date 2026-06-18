// ══════════════════════════════════════════════════════
//  REPORTS MODULE
// ══════════════════════════════════════════════════════
function renderReportContent(){
  var type = document.getElementById('reportType').value;
  var dateVal = document.getElementById('reportDate').value || todayStr();
  var el = document.getElementById('reportContent');

  if(type === 'daily')   el.innerHTML = buildDailyReport(dateVal);
  if(type === 'weekly')  el.innerHTML = buildWeeklyReport(dateVal);
  if(type === 'monthly') el.innerHTML = buildMonthlyReport(dateVal);
  if(type === 'revenue') el.innerHTML = buildRevenueReport(dateVal);
  if(type === 'product') el.innerHTML = buildProductReport();
  if(type === 'buyers')  el.innerHTML = buildBuyersReport(dateVal);
}

function reportTableRows(list){
  return list.map(function(d){
    var info = PRODUCTS[d.product];
    return '<tr><td>' + fmtDate(d.date) + '</td><td>' + d.custName + '</td><td>' + d.slot + '</td><td>' + info.icon + ' ' + d.product + '</td><td>' + d.qty + ' ' + info.unit + '</td><td style="font-weight:700">' + money(d.amount) + '</td></tr>';
  }).join('') || '<tr><td colspan="6"><div class="empty"><span class="icon">📭</span><p>No records</p></div></td></tr>';
}

function buildDailyReport(date){
  var list = deliveriesOn(date);
  return '<h3 style="margin-bottom:10px">Daily Delivery Report — ' + fmtDateLong(date) + '</h3>' +
    '<div class="stats-row-sm"><div class="stat-card"><div class="stat-v">' + list.length + '</div><div class="stat-l">Deliveries</div></div>' +
    '<div class="stat-card green"><div class="stat-v">' + money(sumAmount(list)) + '</div><div class="stat-l">Revenue</div></div></div>' +
    '<table class="data-table"><thead><tr><th>Date</th><th>Customer</th><th>Slot</th><th>Product</th><th>Qty</th><th>Amount</th></tr></thead><tbody>' + reportTableRows(list) + '</tbody></table>';
}

function buildWeeklyReport(date){
  var end = new Date(date + 'T00:00:00');
  var start = new Date(date + 'T00:00:00'); start.setDate(start.getDate()-6);
  var dataLatest = latestDataDate();
  var dataEarliest = earliestDataDate();
  if(date > dataLatest){ end = new Date(dataLatest + 'T00:00:00'); start = new Date(dataEarliest + 'T00:00:00'); }
  var sStr = start.toISOString().split('T')[0], eStr = end.toISOString().split('T')[0];
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
    var info = PRODUCTS[p];
    return '<tr><td>' + info.icon + ' ' + p + '</td><td>' + prodMap[p].qty.toFixed(2) + ' ' + info.unit + '</td><td style="font-weight:700">' + money(prodMap[p].amount) + '</td></tr>';
  }).join('');
  return '<h3 style="margin-bottom:10px">Monthly Report — ' + MONTHS[parseInt(month.split('-')[1])-1] + ' ' + month.split('-')[0] + '</h3>' +
    '<div class="stats-row-sm"><div class="stat-card"><div class="stat-v">' + list.length + '</div><div class="stat-l">Deliveries</div></div>' +
    '<div class="stat-card green"><div class="stat-v">' + money(sumAmount(list)) + '</div><div class="stat-l">Revenue</div></div></div>' +
    '<table class="data-table"><thead><tr><th>Product</th><th>Total Qty</th><th>Total Amount</th></tr></thead><tbody>' + (prodRows||'<tr><td colspan="3">No data</td></tr>') + '</tbody></table>';
}

function buildRevenueReport(date){
  var latestDate = latestDataDate();
  var useDate = date > latestDate ? latestDate : date;
  var month = useDate.slice(0,7);
  var todayRev = sumAmount(deliveriesOn(useDate));
  var monthRev = sumAmount(deliveriesInMonth(month));
  var yearRev = deliveries.filter(function(d){ return d.date.slice(0,4) === useDate.slice(0,4); }).reduce(function(s,d){return s+d.amount;},0);
  var allTimeRev = sumAmount(deliveries);
  var displayDate = useDate;
  return '<h3 style="margin-bottom:10px">Revenue Report</h3>' +
    '<div class="stats-row-sm">' +
      '<div class="stat-card green"><div class="stat-v">' + money(todayRev) + '</div><div class="stat-l">Latest Day (' + fmtDate(displayDate) + ')</div></div>' +
      '<div class="stat-card green"><div class="stat-v">' + money(monthRev) + '</div><div class="stat-l">This Month</div></div>' +
      '<div class="stat-card green"><div class="stat-v">' + money(yearRev) + '</div><div class="stat-l">This Year</div></div>' +
      '<div class="stat-card green"><div class="stat-v">' + money(allTimeRev) + '</div><div class="stat-l">All-Time</div></div>' +
    '</div>';
}

function buildProductReport(){
  var rows = Object.keys(PRODUCTS).map(function(p){
    var list = deliveries.filter(function(d){ return d.product === p; });
    var info = PRODUCTS[p];
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
    .map(function(c){ return '<tr><td>' + c.id + '</td><td>' + c.name + '</td><td>' + c.mobile + '</td><td>' + fmtDate(c.regDate) + '</td></tr>'; }).join('');
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
  var date = document.getElementById('reportDate').value || todayStr();
  var wb = XLSX.utils.book_new();
  var data = [];

  if(type === 'daily') data = deliveriesOn(date);
  else if(type === 'weekly'){ var end=new Date(date), start=new Date(date); start.setDate(start.getDate()-6); data = deliveriesInRange(start.toISOString().split('T')[0], end.toISOString().split('T')[0]); }
  else if(type === 'monthly') data = deliveriesInMonth(date.slice(0,7));
  else data = deliveries;

  var rows = data.map(function(d){
    return { Date: fmtDate(d.date), Customer: d.custName, Slot: d.slot, Product: d.product, Qty: d.qty, Unit: PRODUCTS[d.product].unit, Amount: d.amount };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{Note:'No data'}]), 'Report');
  XLSX.writeFile(wb, 'DairyDesk_' + type + '_report.xlsx');
  toast('Excel exported!', 'ok');
}

function exportReportPDF(){
  var doc = new jspdf.jsPDF();
  var type = document.getElementById('reportType').value;
  doc.setFontSize(16); doc.setTextColor(79,70,229);
  doc.text('DairyDesk - ' + type.charAt(0).toUpperCase()+type.slice(1) + ' Report', 14, 18);
  doc.setFontSize(10); doc.setTextColor(80,80,80);
  doc.text('Generated: ' + new Date().toLocaleDateString('en-IN'), 14, 26);

  var content = document.getElementById('reportContent').innerText.split('\n').filter(Boolean);
  var y = 38;
  content.slice(0, 45).forEach(function(line){
    doc.text(line.slice(0,100), 14, y);
    y += 6;
    if(y > 280){ doc.addPage(); y = 18; }
  });
  doc.save('DairyDesk_' + type + '_report.pdf');
  toast('PDF exported!', 'ok');
}


// ══════════════════════════════════════════════════════
//  SETTINGS MODULE
// ══════════════════════════════════════════════════════
function renderSettings(){
  var el = document.getElementById('pricingSettings');
  el.innerHTML = Object.keys(PRODUCTS).map(function(p){
    var info = PRODUCTS[p];
    return '<div class="fg" style="display:flex;align-items:center;gap:10px;margin-bottom:10px">' +
      '<span style="font-size:1.3rem;width:30px">' + info.icon + '</span>' +
      '<div style="flex:1"><label style="margin-bottom:2px">' + p + ' (₹ per ' + info.unit + (info.note ? ' · ' + info.note : '') + ')</label>' +
      '<input type="number" value="' + info.price + '" onchange="updatePrice(\'' + p + '\', this.value)"></div>' +
    '</div>';
  }).join('') +
  '<button class="btn btn-primary btn-sm" style="margin-top:6px" onclick="toast(\'Pricing saved ✓\',\'ok\')">💾 Save Pricing</button>';

  renderProductsTable();
  document.getElementById('settingsTheme').value = currentTheme;
}

function renderProductsTable(){
  var tbody = document.getElementById('productsTableBody');
  if(!tbody) return;
  var builtIn = ['Milk','Curd','Buttermilk','Ghee'];
  tbody.innerHTML = Object.keys(PRODUCTS).map(function(p){
    var info = PRODUCTS[p];
    var isBuiltIn = builtIn.indexOf(p) !== -1;
    return '<tr>' +
      '<td style="font-size:1.3rem">' + info.icon + '</td>' +
      '<td><strong>' + p + '</strong>' + (isBuiltIn ? ' <span class="badge badge-blue" style="font-size:.6rem">Built-in</span>' : '') + '</td>' +
      '<td>' + info.unit + '</td>' +
      '<td style="font-weight:800;color:var(--primary)">₹' + info.price + '</td>' +
      '<td style="color:var(--gray)">' + info.step + '</td>' +
      '<td style="color:var(--gray);font-size:.8rem">' + (info.note || '—') + '</td>' +
      '<td>' +
        '<button class="btn-icon" onclick="openEditProductModal(\'' + p + '\')" title="Edit">✏️</button> ' +
        (!isBuiltIn ? '<button class="btn-icon" style="background:#FEE2E2;border-color:#FCA5A5" onclick="deleteProduct(\'' + p + '\')" title="Delete">🗑️</button>' : '<button class="btn-icon" disabled style="opacity:.35;cursor:not-allowed" title="Built-in products cannot be deleted">🗑️</button>') +
      '</td>' +
    '</tr>';
  }).join('');
}

var editingProductName = null;

function openAddProductModal(){
  editingProductName = null;
  document.getElementById('productModalTitle').textContent = 'Add New Product';
  document.getElementById('pm-name').value = '';
  document.getElementById('pm-icon').value = '';
  document.getElementById('pm-unit').value = 'L';
  document.getElementById('pm-price').value = '';
  document.getElementById('pm-step').value = '0.5';
  document.getElementById('pm-note').value = '';
  document.getElementById('pm-name').disabled = false;
  openModal('productModal');
}

function openEditProductModal(name){
  editingProductName = name;
  var info = PRODUCTS[name];
  document.getElementById('productModalTitle').textContent = 'Edit Product — ' + name;
  document.getElementById('pm-name').value = name;
  document.getElementById('pm-name').disabled = true;
  document.getElementById('pm-icon').value = info.icon;
  document.getElementById('pm-unit').value = info.unit;
  document.getElementById('pm-price').value = info.price;
  document.getElementById('pm-step').value = info.step;
  document.getElementById('pm-note').value = info.note || '';
  openModal('productModal');
}

function saveProduct(){
  var name  = document.getElementById('pm-name').value.trim();
  var icon  = document.getElementById('pm-icon').value.trim() || '📦';
  var unit  = document.getElementById('pm-unit').value;
  var price = parseFloat(document.getElementById('pm-price').value);
  var step  = parseFloat(document.getElementById('pm-step').value) || 0.5;
  var note  = document.getElementById('pm-note').value.trim();

  if(!name){ toast('Product name is required', 'err'); return; }
  if(isNaN(price) || price <= 0){ toast('Enter a valid price', 'err'); return; }

  if(!editingProductName && PRODUCTS[name]){
    toast('A product with this name already exists', 'err'); return;
  }

  var key = editingProductName || name;
  PRODUCTS[key] = { unit: unit, price: price, step: step, icon: icon };
  if(note) PRODUCTS[key].note = note;

  persist();
  closeModal('productModal');
  toast((editingProductName ? 'Product updated' : '✅ Product "' + name + '" added'), 'ok');
  logActivity('settings', (editingProductName ? 'Updated' : 'Added') + ' product: ' + key);
  renderSettings();
  populateCustomerDropdown && populateCustomerDropdown();
}

function deleteProduct(name){
  if(!confirm('Delete product "' + name + '"?')) return;
  delete PRODUCTS[name];
  persist();
  toast('Product "' + name + '" removed', 'err');
  logActivity('settings', 'Deleted product: ' + name);
  renderSettings();
}

function updatePrice(product, val){
  var p = parseFloat(val);
  if(isNaN(p) || p <= 0) return;
  PRODUCTS[product].price = p;
  persist();
}

function exportFullBackup(){
  var backup = { customers: customers, deliveries: deliveries, activityLog: activityLog, pricing: PRODUCTS, exportedAt: new Date().toISOString() };
  var blob = new Blob([JSON.stringify(backup, null, 2)], { type:'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'dairydesk_backup_' + todayStr() + '.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Backup downloaded!', 'ok');
}

function resetAllData(){
  if(!confirm('This will delete ALL data and reload demo data. Continue?')) return;
  localStorage.removeItem('dd_customers');
  localStorage.removeItem('dd_deliveries');
  localStorage.removeItem('dd_activity');
  location.reload();
}


// ══════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════
function doLogin(){
  var u = document.getElementById('loginU').value.trim().toLowerCase();
  var p = document.getElementById('loginP').value.trim();
  if((u === 'admin' || u === 'dairy' || u === 'owner') && p === 'dairy123'){
    document.getElementById('loginWrap').style.display = 'none';
    document.getElementById('appShell').style.display = 'block';
    document.getElementById('navUser').textContent = '👤 ' + document.getElementById('loginU').value.trim();
    initApp();
  } else {
    document.getElementById('loginErr').style.display = 'block';
  }
}
function doLogout(){
  document.getElementById('appShell').style.display = 'none';
  document.getElementById('loginWrap').style.display = 'flex';
}

// ══════════════════════════════════════════════════════
//  THEME
// ══════════════════════════════════════════════════════
function applyTheme(){
  document.documentElement.classList.toggle('dark', currentTheme === 'dark');
  document.getElementById('themeBtn').textContent = currentTheme === 'dark' ? '☀️' : '🌙';
  var sel = document.getElementById('settingsTheme');
  if(sel) sel.value = currentTheme;
}
function toggleDarkMode(){
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  persist(); applyTheme();
  refreshChartsForTheme();
}
function setTheme(t){ currentTheme = t; persist(); applyTheme(); refreshChartsForTheme(); }

// ══════════════════════════════════════════════════════
//  SIDEBAR / NAV
// ══════════════════════════════════════════════════════
function toggleSidebar(){ document.getElementById('sidebar').classList.toggle('open'); }

function goPage(page){
  document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
  document.querySelectorAll('.side-link').forEach(function(l){ l.classList.remove('active'); });
  document.getElementById('page-' + page).classList.add('active');
  var link = document.querySelector('.side-link[data-page="' + page + '"]');
  if(link) link.classList.add('active');
  document.getElementById('sidebar').classList.remove('open');

  if(page === 'dashboard')  renderDashboard();
  if(page === 'customers')  { custPage = 1; renderCustomersTable(); }
  if(page === 'deliveries') { delPage = 1; initDeliveryFilters(); renderDeliveriesTable(); }
  if(page === 'billing')    { initBillMonths(); renderBillingPage(); }
  if(page === 'reports')    { document.getElementById('reportDate').value = latestDataDate(); renderReportContent(); }
  if(page === 'analytics')  renderAnalytics();
  if(page === 'settings')   renderSettings();
}

// ══════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════
function initApp(){
  applyTheme();
  renderDashboard();
}

// ══════════════════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════════════════
function toast(msg, type){
  var wrap = document.getElementById('toastWrap');
  var el = document.createElement('div');
  el.className = 'toast ' + (type || '');
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(function(){
    el.style.opacity = '0'; el.style.transform = 'translateX(110px)'; el.style.transition = 'all .3s';
    setTimeout(function(){ el.remove(); }, 300);
  }, 2800);
}

function openModal(id){ document.getElementById(id).classList.add('open'); }
function closeModal(id){ document.getElementById(id).classList.remove('open'); }
document.addEventListener('DOMContentLoaded', function(){
  document.querySelectorAll('.modal-bg').forEach(function(bg){
    bg.addEventListener('click', function(e){ if(e.target === bg) bg.classList.remove('open'); });
  });
});

// ══════════════════════════════════════════════════════
//  COMMON HELPERS
// ══════════════════════════════════════════════════════
function activeCustomers(){ return customers.filter(function(c){ return c.status === 'active'; }); }
function custById(id){ return customers.find(function(c){ return c.id === id; }); }

function deliveriesOn(dateStr){ return deliveries.filter(function(d){ return d.date === dateStr; }); }
function deliveriesInRange(from, to){
  return deliveries.filter(function(d){ return d.date >= from && d.date <= to; });
}
function deliveriesInMonth(monthStr){
  return deliveries.filter(function(d){ return d.date.startsWith(monthStr); });
}

function sumAmount(list){ return list.reduce(function(s,d){ return s + d.amount; }, 0); }
function sumQty(list, product){
  return list.filter(function(d){ return d.product === product; })
             .reduce(function(s,d){ return s + d.qty; }, 0);
}

function latestDataDate(){
  if(!deliveries || !deliveries.length) return todayStr();
  return deliveries.reduce(function(max, d){ return d.date > max ? d.date : max; }, deliveries[0].date);
}
function earliestDataDate(){
  if(!deliveries || !deliveries.length) return todayStr();
  return deliveries.reduce(function(min, d){ return d.date < min ? d.date : min; }, deliveries[0].date);
}

// ══════════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════════
function renderDashboard(){
  var today = latestDataDate();
  document.getElementById('dashDateLabel').textContent =
    new Date(today + 'T00:00:00').toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' }) +
    (today !== todayStr() ? ' (latest data)' : '');

  var todayDels = deliveriesOn(today);
  var monthStart = today.slice(0,7);
  var monthDels = deliveriesInMonth(monthStart);

  var totalCust = customers.length;
  var activeCust = activeCustomers().length;
  var morningCount = new Set(todayDels.filter(function(d){ return d.slot === 'Morning'; }).map(function(d){ return d.custId; })).size;
  var eveningCount = new Set(todayDels.filter(function(d){ return d.slot === 'Evening'; }).map(function(d){ return d.custId; })).size;
  var milkToday = sumQty(todayDels, 'Milk');
  var todayRev  = sumAmount(todayDels);
  var monthRev  = sumAmount(monthDels);

  var stats = [
    {icon:'👥', v: totalCust, l: 'Total Customers', cls:''},
    {icon:'✅', v: activeCust, l: 'Active Customers', cls:'green'},
    {icon:'☀️', v: morningCount, l: 'Morning Deliveries Today', cls:'amber'},
    {icon:'🌙', v: eveningCount, l: 'Evening Deliveries Today', cls:'purple'},
    {icon:'🥛', v: milkToday.toFixed(1)+'L', l: 'Milk Today', cls:'blue'},
    {icon:'💰', v: money(todayRev), l: "Today's Revenue", cls:'green'},
    {icon:'📈', v: money(monthRev), l: 'Monthly Revenue', cls:'green'},
  ];
  document.getElementById('dashStats').innerHTML = stats.map(function(s){
    return '<div class="stat-card ' + s.cls + '"><div class="stat-icon">' + s.icon + '</div>' +
      '<div class="stat-v">' + s.v + '</div><div class="stat-l">' + s.l + '</div></div>';
  }).join('');

  renderDashCharts();
  renderActivityFeed();
}

function renderActivityFeed(){
  var el = document.getElementById('activityFeed');
  if(!activityLog.length){ el.innerHTML = '<div class="empty">No recent activity</div>'; return; }
  el.innerHTML = activityLog.slice(0,8).map(function(a){
    var icon = a.type === 'customer' ? '👤' : a.type === 'delivery' ? '🛵' : '🔔';
    var when = new Date(a.time).toLocaleString('en-IN', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});
    return '<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);align-items:flex-start">' +
      '<span style="font-size:1rem">' + icon + '</span>' +
      '<div style="flex:1"><div style="font-size:.84rem">' + a.msg + '</div>' +
      '<div style="font-size:.7rem;color:var(--gray)">' + when + '</div></div></div>';
  }).join('');
}

document.addEventListener('DOMContentLoaded', function(){
  if(typeof populateCustomerDropdown === 'function') populateCustomerDropdown();
});
