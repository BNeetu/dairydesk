// ══════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════
function doLogin(){
  var u = document.getElementById('loginU').value.trim().toLowerCase();
  var p = document.getElementById('loginP').value.trim();
  if((u === 'admin' || u === 'dairy' || u === 'owner') && p === 'dairy123'){
    document.getElementById('loginWrap').style.display = 'none';
    document.getElementById('appShell').style.display = 'block';
    var displayName = document.getElementById('loginU').value.trim();
    document.getElementById('navUser').textContent = '👤 ' + displayName;
    // Persist login state so refresh doesn't redirect to login
    try{ localStorage.setItem('dd_loggedIn', '1'); localStorage.setItem('dd_user', displayName); }catch(e){}
    initApp();
  } else {
    document.getElementById('loginErr').style.display = 'block';
  }
}
function doLogout(){
  document.getElementById('appShell').style.display = 'none';
  document.getElementById('loginWrap').style.display = 'flex';
  try{ localStorage.removeItem('dd_loggedIn'); localStorage.removeItem('dd_user'); }catch(e){}
  appInitPromise = null; // allow the next login to re-initialize from scratch
}

// Preserve session across refresh: if logged-in flag present, show app immediately
window.addEventListener('load', function(){
  try{
    if(localStorage.getItem('dd_loggedIn')){
      var name = localStorage.getItem('dd_user') || 'Admin';
      document.getElementById('loginWrap').style.display = 'none';
      document.getElementById('appShell').style.display = 'block';
      document.getElementById('navUser').textContent = '👤 ' + name;
      initApp();
    }
  }catch(e){}
});

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

  if(page === 'settings')   renderSettings();
}

// ══════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════
var appInitPromise = null; // guards against initApp() running twice concurrently
function initApp(){
  if(appInitPromise) return appInitPromise; // already loading/loaded — reuse in-flight/last result
  // Load remote data (must be enabled) then initialize UI and dropdowns
  appInitPromise = loadAppData().then(function(){
    applyTheme();
    // populate dropdowns and tables after remote data load
    populateCustomerDropdown();
    renderDashboard();
    if(document.getElementById('page-customers').classList.contains('active')) renderCustomersTable();
  }).catch(function(err){
    applyTheme();
    console.error('Failed to load remote data:', err);
    toast('Failed to load data from Google Sheets. Configure SHEETS_API_URL.', 'err');
    // still render dashboard so app doesn't break, but customer lists will be empty
    renderDashboard();
  });
  return appInitPromise;
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

var modalStack = []; // tracks open modals in order, so nested modals (e.g. Customer Detail -> Billing) restore correctly

function openModal(id){
  document.getElementById(id).classList.add('open');
  modalStack.push(id);
  applyModalInertness();
}
function closeModal(id){
  document.getElementById(id).classList.remove('open');
  modalStack = modalStack.filter(function(m){ return m !== id; });
  applyModalInertness();
}

// Disable every interactive element outside the topmost open modal. This is
// the reliable fix for background fields (like the customer search box,
// which is still fully live underneath the modal overlay) getting written
// into by browser/OS-level autofill (Android Gboard, Samsung Keyboard,
// password-manager overlays, etc.) — those only ever target ENABLED fields,
// and HTML's autocomplete="off" alone doesn't reliably stop OS-level autofill.
// It also just prevents accidentally interacting with the background at all
// while a dialog is open, which is correct modal behavior regardless.
function applyModalInertness(){
  // First, undo any inertness we previously applied.
  document.querySelectorAll('[data-modal-disabled="1"]').forEach(function(el){
    el.disabled = false;
    el.removeAttribute('data-modal-disabled');
  });
  if(!modalStack.length) return; // no modal open — leave everything as-is
  var topModal = document.getElementById(modalStack[modalStack.length - 1]);
  if(!topModal) return;
  document.querySelectorAll('input, textarea, select, button').forEach(function(el){
    if(topModal.contains(el)) return;      // leave the active modal's own controls alone
    if(el.disabled) return;                // already disabled for its own legitimate reason — don't touch/track it
    el.setAttribute('data-modal-disabled', '1');
    el.disabled = true;
  });
}

document.addEventListener('DOMContentLoaded', function(){
  document.querySelectorAll('.modal-bg').forEach(function(bg){
    bg.addEventListener('click', function(e){ if(e.target === bg) closeModal(bg.id); });
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