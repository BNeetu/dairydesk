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
  if(page === 'billing')    { initBillMonths(); syncBillingToDeliveryRange(); }
  if(page === 'reports')    { document.getElementById('reportDate').value = latestDataDate(); renderReportContent(); }

  if(page === 'payments')   renderPaymentsPage();
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
    reportDataHealth();
    if(document.getElementById('page-customers').classList.contains('active')) renderCustomersTable();
  }).catch(function(err){
    applyTheme();
    console.error('Failed to load remote data:', err);
    toast('Startup error: ' + (err && err.message ? err.message : err), 'err');
    // still render dashboard so app doesn't break, but customer lists will be empty
    try{ renderDashboard(); }catch(e2){ console.error(e2); }
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
  if(modalStack.indexOf(id) === -1) modalStack.push(id);
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

// sumAmount() lives in totals.js (single source of truth)
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
    {icon:'📈', v: money(sumAmount(periodDeliveries())), l: 'Total Revenue ' + periodLabel(), cls:'green'},
  ];
  document.getElementById('dashStats').innerHTML = stats.map(function(s){
    return '<div class="stat-card ' + s.cls + '"><div class="stat-icon">' + s.icon + '</div>' +
      '<div class="stat-v">' + s.v + '</div><div class="stat-l">' + s.l + '</div></div>';
  }).join('');

  renderDashCharts();
  renderActivityFeed();
  renderPendingAlerts();
  if(typeof renderLowDelivery === 'function') renderLowDelivery();
}

function renderActivityFeed(){
  var el = document.getElementById('activityFeed');
  if(!activityLog.length){ el.innerHTML = '<div class="empty">No recent activity</div>'; return; }
  el.innerHTML = activityLog.slice(0,8).map(function(a){
    var icon = a.type === 'customer' ? '👤' : a.type === 'delivery' ? '🛵' : '🔔';
    var when = new Date(a.time).toLocaleString('en-IN', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});
    return '<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);align-items:flex-start">' +
      '<span style="font-size:1rem">' + icon + '</span>' +
      '<div style="flex:1"><div style="font-size:.84rem">' + escapeHtml(a.msg) + '</div>' +
      '<div style="font-size:.7rem;color:var(--gray)">' + when + '</div></div></div>';
  }).join('');
}

document.addEventListener('DOMContentLoaded', function(){
  if(typeof populateCustomerDropdown === 'function') populateCustomerDropdown();
});

// ══════════════════════════════════════════════════════
//  REFRESH EVERY VISIBLE VIEW (call after ANY delivery add / edit / delete)
// ══════════════════════════════════════════════════════
var currentBillCust = null, currentViewCust = null;
function refreshAllViews(){
  function on(p){ return document.getElementById('page-' + p).classList.contains('active'); }
  renderPendingAlerts();
  if(on('dashboard'))  renderDashboard();
  if(on('customers'))  renderCustomersTable();
  if(on('deliveries')) renderDeliveriesTable();
  if(on('billing'))    renderBillingPage();
  if(on('payments'))   renderPaymentsPage();
  if(on('reports'))    renderReportContent();
  if(document.getElementById('billModal').classList.contains('open') && currentBillCust && custById(currentBillCust)) openBillModal(currentBillCust);
  if(document.getElementById('viewCustModal').classList.contains('open') && currentViewCust && custById(currentViewCust)) viewCustomer(currentViewCust);
}
// ══════════════════════════════════════════════════════
//  FEATURES (add-on module - load AFTER app.js)
//  1. Customer Statement (ledger with running balance, WhatsApp / Print)
//  2. Bulk Payment Reminders (one tap per customer, "Next" button, sent marks)
//  3. Day Close summary (collections, expenses, milk sold - share on WhatsApp)
//  4. Overdue Aging on Payments page (who owes since how many days)
//  5. Dashboard money cards (Outstanding, Collected, Expenses, Profit)
//  6. Backup reminder + Restore from JSON (payments/expenses are device-only)
//  7. Owner WhatsApp number in Settings
// ══════════════════════════════════════════════════════
(function(){
  'use strict';

  // ── small helpers ───────────────────────────────────
  function el(id){ return document.getElementById(id); }
  function fnum(n){ return round2(n); }
  function unitOf(p){ return (PRODUCTS[p] || { unit: '' }).unit; }
  function waOpen(rawNumber, text){
    if(rawNumber){
      var n = normalizeWhatsAppNumber(rawNumber);
      if(!n.ok){ toast('Invalid WhatsApp number', 'err'); return false; }
      if(!openWhatsAppChat(n.number, text)){ toast('Pop-ups are blocked. Allow pop-ups and try again.', 'warn'); return false; }
      return true;
    }
    var w = null;
    try{ w = window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank'); }catch(e){}
    if(!w){ toast('Pop-ups are blocked. Allow pop-ups and try again.', 'warn'); return false; }
    return true;
  }
  function copyText(t, okMsg){
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(t).then(function(){ toast(okMsg || 'Copied', 'ok'); }, function(){ toast('Copy failed', 'err'); });
    } else toast('Copy not supported in this browser', 'err');
  }
  function makeModal(id, wide){
    var bg = document.createElement('div');
    bg.className = 'modal-bg'; bg.id = id;
    bg.innerHTML = '<div class="modal' + (wide ? ' modal-wide' : '') + '"><button class="modal-close" onclick="closeModal(\'' + id + '\')">✕</button><div id="' + id + 'Body"></div></div>';
    bg.addEventListener('click', function(e){ if(e.target === bg) closeModal(id); });
    document.body.appendChild(bg);
  }
  makeModal('stmtModal', true);
  makeModal('dayModal', false);
  makeModal('remModal', false);

  // oldest delivery that is still (partly) unpaid, assuming payments clear the oldest bills first
  function oldestUnpaidDate(custId){
    var paid = paidBy(custId), cum = 0, l = deliveriesFor(custId);
    for(var i = 0; i < l.length; i++){
      cum += l[i].amount;
      if(round2(cum - paid) > 0.005) return l[i].date;
    }
    return null;
  }
  function ageDays(custId){
    var d = oldestUnpaidDate(custId);
    return d ? Math.max(0, daysBetween(d, todayStr())) : 0;
  }

  // ══════════════════════════════════════════════════════
  //  1. CUSTOMER STATEMENT
  // ══════════════════════════════════════════════════════
  var stmtCust = null;

  window.openStatement = function(custId){
    var c = custById(custId); if(!c) return;
    stmtCust = custId;
    var l = deliveriesFor(custId);
    var from = l.length ? l[0].date : todayStr();
    el('stmtModalBody').innerHTML =
      '<h2>📒 Statement — ' + escapeHtml(c.name) + '</h2>' +
      '<div class="frow" style="max-width:420px"><div class="fg"><label>From</label><input type="date" id="st-from" value="' + from + '" onchange="stmtRender()"></div>' +
      '<div class="fg"><label>To</label><input type="date" id="st-to" value="' + todayStr() + '" onchange="stmtRender()"></div></div>' +
      '<div class="stats-row-sm" id="st-stats"></div>' +
      '<div class="table-wrap bd-table"><table class="data-table"><thead><tr><th>Date</th><th>Details</th><th>Bill (Dr)</th><th>Paid (Cr)</th><th>Balance</th></tr></thead><tbody id="st-body"></tbody></table></div>' +
      '<div class="inv-actions" style="margin-top:12px">' +
        '<button class="btn" style="background:var(--wa);color:#fff" onclick="stmtWhatsApp()">📲 WhatsApp</button>' +
        '<button class="btn btn-ghost" onclick="stmtCopy()">📋 Copy</button>' +
        '<button class="btn btn-ghost" onclick="stmtPrint()">🖨️ Print</button>' +
      '</div>';
    stmtRender();
    openModal('stmtModal');
  };

  function stmtBuild(){
    var id = stmtCust, from = el('st-from').value, to = el('st-to').value;
    var ev = [];
    deliveriesFor(id).forEach(function(d){
      ev.push({ date: d.date, ord: 0, txt: d.slot + ' · ' + d.product + ' ' + d.qty + ' ' + unitOf(d.product) + ' @ ₹' + d.rate, dr: d.amount, cr: 0 });
    });
    EX.payments.filter(function(p){ return p.custId === id; }).forEach(function(p){
      ev.push({ date: p.date, ord: 1, txt: 'Payment received (' + (p.mode || 'Cash') + ')' + (p.note ? ' · ' + p.note : ''), dr: 0, cr: +p.amount || 0 });
    });
    ev.sort(function(a, b){ return a.date.localeCompare(b.date) || a.ord - b.ord; });
    var opening = 0, rows = [], dr = 0, cr = 0;
    ev.forEach(function(e){ if(from && e.date < from) opening += e.dr - e.cr; });
    opening = fnum(opening);
    var bal = opening;
    ev.forEach(function(e){
      if(from && e.date < from) return;
      if(to && e.date > to) return;
      bal = fnum(bal + e.dr - e.cr); dr += e.dr; cr += e.cr;
      rows.push({ date: e.date, txt: e.txt, dr: e.dr, cr: e.cr, bal: bal });
    });
    return { rows: rows, opening: opening, dr: fnum(dr), cr: fnum(cr), closing: bal, from: from, to: to };
  }

  window.stmtRender = function(){
    var s = stmtBuild();
    el('st-stats').innerHTML =
      '<div class="stat-card"><div class="stat-v" style="font-size:1.1rem">' + money(s.opening) + '</div><div class="stat-l">Opening</div></div>' +
      '<div class="stat-card"><div class="stat-v" style="font-size:1.1rem">' + money(s.dr) + '</div><div class="stat-l">Billed</div></div>' +
      '<div class="stat-card green"><div class="stat-v" style="font-size:1.1rem">' + money(s.cr) + '</div><div class="stat-l">Paid</div></div>' +
      '<div class="stat-card ' + (s.closing > 0 ? 'red' : 'green') + '"><div class="stat-v" style="font-size:1.1rem">' + money(Math.abs(s.closing)) + '</div><div class="stat-l">' + (s.closing < 0 ? 'Advance' : 'Baaki') + '</div></div>';
    el('st-body').innerHTML = s.rows.map(function(r){
      return '<tr><td>' + fmtDate(r.date) + '</td><td>' + escapeHtml(r.txt) + '</td><td>' + (r.dr ? money(r.dr) : '') + '</td><td style="color:var(--secondary);font-weight:700">' + (r.cr ? money(r.cr) : '') + '</td><td style="font-weight:700">' + money(r.bal) + '</td></tr>';
    }).join('') || '<tr><td colspan="5"><div class="empty"><span class="icon">📭</span><p>No entries in this period</p></div></td></tr>';
  };

  function stmtText(){
    var c = custById(stmtCust), s = stmtBuild();
    var last = s.rows.slice(-12).map(function(r){
      return fmtDate(r.date) + '  ' + (r.dr ? 'Bill ' + money(r.dr) : 'Paid ' + money(r.cr));
    }).join('\n');
    return '*Bhati Farms \u2014 Statement*\n' + c.name + '\n' + fmtDate(s.from) + ' \u2013 ' + fmtDate(s.to) + '\n\n' +
      (s.opening ? 'Opening: ' + money(s.opening) + '\n' : '') +
      'Billed: ' + money(s.dr) + '\nPaid: ' + money(s.cr) + '\n*' + (s.closing < 0 ? 'Advance: ' + money(-s.closing) : 'Baaki: ' + money(s.closing)) + '*\n' +
      (s.rows.length ? '\nLast entries:\n' + last + '\n' : '') +
      (s.closing > 0 && EX.upi ? '\nUPI ID: ' + EX.upi + '\n' : '') + '\nDhanyavaad \uD83D\uDE4F';
  }
  window.stmtWhatsApp = function(){ var c = custById(stmtCust); if(c) waOpen(c.mobile, stmtText()); };
  window.stmtCopy = function(){ copyText(stmtText(), 'Statement copied'); };
  window.stmtPrint = function(){
    var c = custById(stmtCust), s = stmtBuild();
    var rows = s.rows.map(function(r){
      return '<tr><td>' + fmtDate(r.date) + '</td><td>' + escapeHtml(r.txt) + '</td><td align="right">' + (r.dr ? money(r.dr) : '') + '</td><td align="right">' + (r.cr ? money(r.cr) : '') + '</td><td align="right">' + money(r.bal) + '</td></tr>';
    }).join('');
    var w = window.open('', '_blank');
    if(!w){ toast('Pop-ups are blocked. Allow pop-ups and try again.', 'warn'); return; }
    w.document.write('<html><head><title>Statement - ' + escapeHtml(c.name) + '</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#222}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #bbb;padding:6px 8px;text-align:left}th{background:#eee}h2{margin:0 0 4px}</style></head><body>' +
      '<h2>Bhati Farms \u2014 Statement</h2><div>' + escapeHtml(c.name) + (c.mobile ? ' \u00B7 ' + escapeHtml(c.mobile) : '') + '</div><div style="margin-bottom:12px">' + fmtDate(s.from) + ' \u2013 ' + fmtDate(s.to) + '</div>' +
      '<table><thead><tr><th>Date</th><th>Details</th><th>Bill</th><th>Paid</th><th>Balance</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<p><strong>Opening ' + money(s.opening) + ' \u00B7 Billed ' + money(s.dr) + ' \u00B7 Paid ' + money(s.cr) + ' \u00B7 ' + (s.closing < 0 ? 'Advance ' + money(-s.closing) : 'Baaki ' + money(s.closing)) + '</strong></p>' +
      '<script>window.onload=function(){window.print()}<\/script></body></html>');
    w.document.close();
  };

  // ══════════════════════════════════════════════════════
  //  2. BULK PAYMENT REMINDERS
  // ══════════════════════════════════════════════════════
  function remSentKey(){ return 'dd_rem_sent_' + todayStr(); }
  function remList(){
    var min = parseFloat((el('rem-min') || {}).value) || 1;
    return payRows().filter(function(r){ return r.bal >= min; });
  }

  window.openReminders = function(){
    el('remModalBody').innerHTML =
      '<h2>📱 Payment Reminders</h2>' +
      '<div class="fg" style="max-width:220px"><label>Baaki at least (₹)</label><input type="number" id="rem-min" min="1" value="1" oninput="remRender()"></div>' +
      '<div id="rem-sum" style="font-size:.84rem;color:var(--gray);margin-bottom:8px"></div>' +
      '<div id="rem-list" style="max-height:48vh;overflow:auto"></div>' +
      '<button class="btn btn-primary btn-lg" style="width:100%;margin-top:12px" onclick="remNext()">▶ Send next reminder</button>' +
      '<p style="font-size:.74rem;color:var(--gray);margin-top:8px">Each tap opens WhatsApp with the message ready \u2014 you press Send. Customers already messaged today are marked \u2705.</p>';
    remRender();
    openModal('remModal');
  };

  window.remRender = function(){
    var rows = remList(), sent = lsGet(remSentKey(), {});
    var total = fnum(rows.reduce(function(s, r){ return s + r.bal; }, 0));
    el('rem-sum').textContent = rows.length + ' customer' + (rows.length === 1 ? '' : 's') + ' \u00B7 ' + money(total) + ' baaki';
    el('rem-list').innerHTML = rows.map(function(r){
      var age = ageDays(r.c.id), ok = normalizeWhatsAppNumber(r.c.mobile).ok;
      return '<div class="alert-row" style="color:var(--dark)"><span>' + (sent[r.c.id] ? '\u2705 ' : '') + '<strong>' + escapeHtml(r.c.name) + '</strong> \u2014 ' + money(r.bal) +
        '<br><span style="font-size:.74rem;color:var(--gray)">' + (age ? age + ' days old' : 'recent') + (ok ? '' : ' \u00B7 \u26A0\uFE0F invalid mobile') + '</span></span>' +
        '<button class="btn-icon" ' + (ok ? '' : 'disabled ') + 'title="Send reminder" onclick="remSend(\'' + r.c.id + '\')">\uD83D\uDCF1</button></div>';
    }).join('') || '<div class="empty"><span class="icon">\uD83C\uDF89</span><p>No one owes this much</p></div>';
  };

  window.remSend = function(custId){
    var c = custById(custId); if(!c || !normalizeWhatsAppNumber(c.mobile).ok) return;
    remindPayment(custId);
    var k = remSentKey(), m = lsGet(k, {}); m[custId] = 1;
    try{ localStorage.setItem(k, JSON.stringify(m)); }catch(e){}
    remRender();
  };
  window.remNext = function(){
    var sent = lsGet(remSentKey(), {});
    var next = remList().filter(function(r){ return !sent[r.c.id] && normalizeWhatsAppNumber(r.c.mobile).ok; })[0];
    if(!next){ toast('All reminders for today are done \u2705', 'ok'); return; }
    remSend(next.c.id);
  };

  // ══════════════════════════════════════════════════════
  //  3. DAY CLOSE
  // ══════════════════════════════════════════════════════
  window.openDayClose = function(){
    el('dayModalBody').innerHTML =
      '<h2>🧾 Day Close</h2>' +
      '<div class="fg" style="max-width:220px"><label>Date</label><input type="date" id="dc-date" value="' + todayStr() + '" max="' + todayStr() + '" onchange="dayRender()"></div>' +
      '<div class="stats-row-sm" id="dc-stats"></div>' +
      '<pre id="dc-text" style="white-space:pre-wrap;font-family:inherit;font-size:.84rem;background:var(--lgray);border-radius:9px;padding:12px;max-height:36vh;overflow:auto"></pre>' +
      '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">' +
        '<button class="btn" style="background:var(--wa);color:#fff;flex:1" onclick="dayWhatsApp()">\uD83D\uDCF2 Send to owner</button>' +
        '<button class="btn btn-ghost" style="flex:1" onclick="dayCopy()">\uD83D\uDCCB Copy</button></div>' +
      '<p style="font-size:.74rem;color:var(--gray);margin-top:8px">Owner number: Settings \u2192 Day Close &amp; Backup. If empty, WhatsApp asks whom to send to.</p>';
    dayRender();
    openModal('dayModal');
  };

  function dayData(date){
    var dels = deliveriesOn(date);
    var pays = EX.payments.filter(function(p){ return p.date === date; });
    var exps = EX.expenses.filter(function(e){ return e.date === date; });
    var coll = fnum(pays.reduce(function(s, p){ return s + (+p.amount || 0); }, 0));
    var exp = fnum(exps.reduce(function(s, e){ return s + (+e.amount || 0); }, 0));
    var modes = {};
    pays.forEach(function(p){ var m = p.mode || 'Cash'; modes[m] = fnum((modes[m] || 0) + (+p.amount || 0)); });
    var prods = Object.keys(PRODUCTS).map(function(p){ return { p: p, q: sumQty(dels, p) }; }).filter(function(x){ return x.q > 0; });
    var owed = fnum(payRows().reduce(function(s, r){ return s + Math.max(r.bal, 0); }, 0));
    return {
      date: date, n: dels.length, cust: new Set(dels.map(function(d){ return d.custId; })).size, rev: sumAmount(dels),
      morning: sumAmount(dels.filter(function(d){ return d.slot === 'Morning'; })), evening: sumAmount(dels.filter(function(d){ return d.slot === 'Evening'; })),
      coll: coll, modes: modes, exp: exp, net: fnum(coll - exp), prods: prods, owed: owed
    };
  }
  function dayText(){
    var d = dayData(el('dc-date').value || todayStr());
    var modeTxt = Object.keys(d.modes).map(function(m){ return m + ' ' + money(d.modes[m]); }).join(', ');
    return '*Bhati Farms \u2014 Day Close (' + fmtDate(d.date) + ')*\n' +
      'Deliveries: ' + d.n + ' (' + d.cust + ' customers)\n' +
      (d.prods.length ? d.prods.map(function(x){ return x.p + ': ' + x.q + ' ' + unitOf(x.p); }).join(' | ') + '\n' : '') +
      'Sale: ' + money(d.rev) + ' (Morning ' + money(d.morning) + ' / Evening ' + money(d.evening) + ')\n' +
      'Collected: ' + money(d.coll) + (modeTxt ? ' (' + modeTxt + ')' : '') + '\n' +
      'Expenses: ' + money(d.exp) + '\n' +
      '*Net (collected \u2212 expenses): ' + money(d.net) + '*\n' +
      'Total baaki (all customers): ' + money(d.owed);
  }
  window.dayRender = function(){
    var d = dayData(el('dc-date').value || todayStr());
    el('dc-stats').innerHTML =
      '<div class="stat-card"><div class="stat-v" style="font-size:1.15rem">' + money(d.rev) + '</div><div class="stat-l">Sale</div></div>' +
      '<div class="stat-card green"><div class="stat-v" style="font-size:1.15rem">' + money(d.coll) + '</div><div class="stat-l">Collected</div></div>' +
      '<div class="stat-card amber"><div class="stat-v" style="font-size:1.15rem">' + money(d.exp) + '</div><div class="stat-l">Expenses</div></div>' +
      '<div class="stat-card ' + (d.net >= 0 ? 'green' : 'red') + '"><div class="stat-v" style="font-size:1.15rem">' + money(d.net) + '</div><div class="stat-l">Net</div></div>';
    el('dc-text').textContent = dayText();
  };
  window.dayWhatsApp = function(){ waOpen(EX.owner || '', dayText()); };
  window.dayCopy = function(){ copyText(dayText(), 'Day close copied'); };

  // ══════════════════════════════════════════════════════
  //  4. AGING CARD + 📒 BUTTONS on Payments page
  // ══════════════════════════════════════════════════════
  var _renderPayments = renderPaymentsPage;
  renderPaymentsPage = function(){
    _renderPayments();
    var rows = payRows().filter(function(r){ return r.bal > 0.005; });
    var buckets = [
      { l: '0\u20137 days', min: 0, max: 7, a: 0, n: 0, cls: 'green' },
      { l: '8\u201315 days', min: 8, max: 15, a: 0, n: 0, cls: 'amber' },
      { l: '16\u201330 days', min: 16, max: 30, a: 0, n: 0, cls: 'amber' },
      { l: '30+ days', min: 31, max: 99999, a: 0, n: 0, cls: 'red' }
    ];
    var aged = rows.map(function(r){ return { r: r, age: ageDays(r.c.id) }; });
    aged.forEach(function(x){
      buckets.forEach(function(b){ if(x.age >= b.min && x.age <= b.max){ b.a += x.r.bal; b.n++; } });
    });
    var card = el('agingCard');
    if(!card){
      card = document.createElement('div'); card.id = 'agingCard'; card.className = 'card'; card.style.marginBottom = '16px';
      el('payStats').insertAdjacentElement('afterend', card);
    }
    var worst = aged.sort(function(a, b){ return b.age - a.age; }).slice(0, 5).filter(function(x){ return x.age > 7; });
    card.innerHTML = '<div class="card-head"><h3>\u23F3 Overdue aging (oldest unpaid bill)</h3></div><div class="card-body">' +
      '<div class="stats-row-sm">' + buckets.map(function(b){
        return '<div class="stat-card ' + b.cls + '"><div class="stat-v" style="font-size:1.15rem">' + money(fnum(b.a)) + '</div><div class="stat-l">' + b.l + ' \u00B7 ' + b.n + ' cust.</div></div>';
      }).join('') + '</div>' +
      (worst.length ? '<div style="font-size:.76rem;font-weight:800;text-transform:uppercase;color:var(--gray);margin:4px 0">Longest pending</div>' + worst.map(function(x){
        return '<div class="alert-row" style="color:var(--dark)"><span><strong>' + escapeHtml(x.r.c.name) + '</strong> \u2014 ' + money(x.r.bal) + ' <span style="color:var(--gray);font-size:.78rem">(' + x.age + ' days)</span></span>' +
          '<button class="btn-icon" title="WhatsApp reminder" onclick="remindPayment(\'' + x.r.c.id + '\')">\uD83D\uDCF1</button></div>';
      }).join('') : '<p style="font-size:.84rem;color:var(--gray)">Nothing pending for more than a week \uD83D\uDC4D</p>') + '</div>';

    // 📒 statement button in each row
    document.querySelectorAll('#payBody tr').forEach(function(tr){
      var b = tr.querySelector('button[onclick^="openPayModal"]');
      if(!b || tr.querySelector('.st-btn')) return;
      var m = /openPayModal\('([^']+)'\)/.exec(b.getAttribute('onclick'));
      if(!m) return;
      var s = document.createElement('button');
      s.className = 'btn-icon st-btn'; s.title = 'Statement'; s.textContent = '\uD83D\uDCD2';
      s.setAttribute('onclick', "openStatement('" + m[1] + "')");
      b.parentNode.appendChild(document.createTextNode(' ')); b.parentNode.appendChild(s);
    });

    // header button
    var rec = document.querySelector('#page-payments button[onclick="openPayModal()"]');
    if(rec && !el('featRemBtn')){
      var rb = document.createElement('button');
      rb.id = 'featRemBtn'; rb.className = 'btn btn-ghost'; rb.textContent = '\uD83D\uDCF1 Reminders';
      rb.setAttribute('onclick', 'openReminders()');
      rec.parentNode.insertBefore(rb, rec);
    }
  };

  // ══════════════════════════════════════════════════════
  //  5. DASHBOARD: money cards, buttons, backup note
  // ══════════════════════════════════════════════════════
  var _renderDashboard = renderDashboard;
  renderDashboard = function(){
    _renderDashboard();
    var month = todayStr().slice(0, 7), rows = payRows();
    var owed = fnum(rows.reduce(function(s, r){ return s + Math.max(r.bal, 0); }, 0));
    var mColl = fnum(EX.payments.filter(function(p){ return p.date.slice(0, 7) === month; }).reduce(function(s, p){ return s + (+p.amount || 0); }, 0));
    var mExp = fnum(EX.expenses.filter(function(e){ return e.date.slice(0, 7) === month; }).reduce(function(s, e){ return s + (+e.amount || 0); }, 0));
    var profit = fnum(sumAmount(deliveriesInMonth(month)) - mExp);
    var cards = [
      ['\u23F3', money(owed), 'Total Baaki (outstanding)', 'red'],
      ['\uD83D\uDCB5', money(mColl), 'Collected this month', 'green'],
      ['\u2796', money(mExp), 'Expenses this month', 'amber'],
      ['\uD83D\uDCC8', money(profit), 'Profit this month (sale \u2212 expenses)', profit >= 0 ? 'green' : 'red']
    ];
    var host = el('dashStats');
    if(host) host.insertAdjacentHTML('beforeend', cards.map(function(s){
      return '<div class="stat-card ' + s[3] + '"><div class="stat-icon">' + s[0] + '</div><div class="stat-v">' + s[1] + '</div><div class="stat-l">' + s[2] + '</div></div>';
    }).join(''));

    var route = document.querySelector('#page-dashboard button[onclick="openRouteList()"]');
    if(route && !el('featDayBtn')){
      var b1 = document.createElement('button');
      b1.id = 'featDayBtn'; b1.className = 'btn btn-ghost'; b1.textContent = '\uD83E\uDDFE Day Close';
      b1.setAttribute('onclick', 'openDayClose()');
      var b2 = document.createElement('button');
      b2.className = 'btn btn-ghost'; b2.textContent = '\uD83D\uDCF1 Payment Reminders';
      b2.setAttribute('onclick', 'openReminders()');
      route.insertAdjacentElement('afterend', b1); b1.insertAdjacentElement('afterend', b2);
    }

    var note = el('featBackupNote');
    if(!note){
      note = document.createElement('div'); note.id = 'featBackupNote';
      var pa = el('pendingAlert'); if(pa) pa.parentNode.insertBefore(note, pa);
    }
    var last = '';
    try{ last = localStorage.getItem('dd_last_backup') || ''; }catch(e){}
    var hasData = EX.payments.length || EX.expenses.length;
    var stale = !last || daysBetween(last, todayStr()) >= 7;
    note.innerHTML = (hasData && stale) ?
      '<div class="alert-card"><div class="alert-head"><strong>\uD83D\uDCBE Backup due \u2014 ' + (last ? 'last backup ' + fmtDate(last) : 'no backup taken yet') + '</strong>' +
      '<button class="btn btn-primary btn-sm" onclick="downloadExtrasJSON()">Backup now</button></div>' +
      '<div style="font-size:.8rem">Payments &amp; expenses live only in this browser \u2014 download a backup file regularly.</div></div>' : '';
  };

  // ══════════════════════════════════════════════════════
  //  6 + 7. SETTINGS: owner number, backup & restore
  // ══════════════════════════════════════════════════════
  function markBackup(){ try{ localStorage.setItem('dd_last_backup', todayStr()); }catch(e){} }
  var _dlJSON = downloadExtrasJSON;
  downloadExtrasJSON = function(){ _dlJSON(); markBackup(); if(el('featBackupNote')) renderDashboard(); };

  var _renderSettings = renderSettings;
  renderSettings = function(){
    _renderSettings();
    var grid = document.querySelector('#page-settings .settings-grid');
    if(!grid) return;
    var card = el('featSettingsCard');
    if(!card){
      card = document.createElement('div'); card.id = 'featSettingsCard'; card.className = 'card';
      grid.appendChild(card);
    }
    var last = ''; try{ last = localStorage.getItem('dd_last_backup') || ''; }catch(e){}
    card.innerHTML = '<div class="card-head"><h3>🧾 Day Close &amp; Backup</h3></div><div class="card-body">' +
      '<div class="fg"><label>Owner WhatsApp (for Day Close)</label><input type="tel" id="ft-owner" value="' + escapeHtml(EX.owner || '') + '" placeholder="10-digit number"></div>' +
      '<button class="btn btn-primary btn-sm" onclick="saveOwnerNumber()">💾 Save</button>' +
      '<hr style="border:none;border-top:1px solid var(--border);margin:14px 0">' +
      '<div style="font-size:.82rem;margin-bottom:8px">Last backup: <strong>' + (last ? fmtDate(last) : 'never') + '</strong></div>' +
      '<button class="btn btn-ghost btn-sm" onclick="downloadExtrasJSON()">📥 Backup payments &amp; extras</button>' +
      '<div class="fg" style="margin-top:12px"><label>Restore from backup file (.json)</label>' +
      '<select id="ft-mode"><option value="merge">Merge (keep current + add missing) \u2014 safe</option><option value="replace">Replace everything with the file</option></select></div>' +
      '<input type="file" id="ft-file" accept=".json,application/json" onchange="restoreExtras(this)">' +
      '</div>';
  };
  window.saveOwnerNumber = function(){
    var v = el('ft-owner').value.trim();
    if(v && !normalizeWhatsAppNumber(v).ok){ toast('Enter a valid WhatsApp number', 'err'); return; }
    EX.owner = v; saveX(); toast('Saved \u2713', 'ok');
  };
  window.restoreExtras = function(input){
    var f = input.files && input.files[0]; if(!f) return;
    var mode = el('ft-mode').value, rd = new FileReader();
    rd.onload = function(){
      try{
        var data = JSON.parse(rd.result);
        if(!data || typeof data !== 'object' || !Array.isArray(data.payments) || !Array.isArray(data.expenses)) throw new Error('Not a valid backup file');
        var msg = mode === 'replace'
          ? 'REPLACE all payments, expenses, pauses and rates with this file?\n(' + data.payments.length + ' payments, ' + data.expenses.length + ' expenses)'
          : 'Merge this file into current data?\n(' + data.payments.length + ' payments, ' + data.expenses.length + ' expenses in file)';
        if(!confirm(msg)){ input.value = ''; return; }
        if(mode === 'replace'){
          EX = Object.assign({ payments: [], pauses: [], rates: {}, expenses: [], upi: '', lowDays: 3 }, data);
        } else {
          ['payments', 'expenses', 'pauses'].forEach(function(k){
            var have = {}; EX[k].forEach(function(x){ have[x.id] = 1; });
            (data[k] || []).forEach(function(x){ if(x && x.id && !have[x.id]) EX[k].push(x); });
          });
          EX.rates = Object.assign({}, data.rates || {}, EX.rates);
          if(!EX.upi && data.upi) EX.upi = data.upi;
          if(!EX.owner && data.owner) EX.owner = data.owner;
        }
        saveX(); input.value = '';
        toast('Backup restored \u2713', 'ok');
        refreshAllViews(); renderSettings();
      }catch(e){ toast('Restore failed: ' + e.message, 'err'); input.value = ''; }
    };
    rd.readAsText(f);
  };

  // refresh money cards if the app already rendered the dashboard before this file loaded
  try{ if(el('dashStats') && el('dashStats').innerHTML) renderDashboard(); }catch(e){}
})();