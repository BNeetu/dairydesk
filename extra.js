// ══════════════════════════════════════════════════════
//  EXTRAS: payments & balance, expenses & profit, pause, customer rates,
//  "mark today's deliveries", route list, low-delivery alert, top customers.
//  Stored on this device AND (when EXTRAS_API_URL is set) in Google Drive via
//  extras_backend.gs, so payments are not lost if the browser data is cleared.
// ══════════════════════════════════════════════════════
var EXTRAS_API_URL = '';   // paste the Web App URL of extras_backend.gs here
var EXTRAS_TOKEN = '';     // same secret you set inside extras_backend.gs
var EX = Object.assign({ payments: [], pauses: [], rates: {}, expenses: [], upi: '', lowDays: 3 }, lsGet('dd_extras', null) || {});
var _xSaving = false, _xAgain = false;

function saveX(){
  try{ localStorage.setItem('dd_extras', JSON.stringify(EX)); localStorage.setItem('dd_extras_dirty', '1'); }catch(e){}
  if(!EXTRAS_API_URL) return;
  if(_xSaving){ _xAgain = true; return; }
  _xSaving = true;
  var p = new URLSearchParams(); p.append('action', 'saveExtras'); p.append('token', EXTRAS_TOKEN); p.append('payload', JSON.stringify(EX));
  fetch(EXTRAS_API_URL, { method: 'POST', body: p }).then(function(r){ return r.json(); }).then(function(r){
    if(!r || !r.success) throw new Error((r && r.error) || 'save failed');
    try{ localStorage.removeItem('dd_extras_dirty'); }catch(e){}
  }).catch(function(e){ toast('Payments/extras could not sync: ' + e.message, 'err'); })
    .then(function(){ _xSaving = false; if(_xAgain){ _xAgain = false; saveX(); } });
}
function loadX(){
  if(!EXTRAS_API_URL) return;
  if(localStorage.getItem('dd_extras_dirty')){ saveX(); return; }   // unsynced local changes win
  fetch(EXTRAS_API_URL + '?action=loadExtras&token=' + encodeURIComponent(EXTRAS_TOKEN) + '&_=' + Date.now()).then(function(r){ return r.json(); }).then(function(r){
    if(r && r.success && r.data && Object.keys(r.data).length){
      EX = Object.assign(EX, r.data);
      try{ localStorage.setItem('dd_extras', JSON.stringify(EX)); }catch(e){}
      refreshExtrasViews();
    }
  }).catch(function(){});
}
window.addEventListener('load', loadX);
function refreshExtrasViews(){ if(typeof refreshAllViews === 'function') refreshAllViews(); }

// ── helpers ───────────────────────────────────────────
function $v(id){ return document.getElementById(id).value; }
function sortedByName(list){ return list.slice().sort(function(a, b){ return a.name.localeCompare(b.name); }); }
function paidBy(custId){ return round2(EX.payments.filter(function(p){ return p.custId === custId; }).reduce(function(s, p){ return s + (+p.amount || 0); }, 0)); }
function balanceOf(custId){ return round2(customerSummary(custId).amount - paidBy(custId)); }
function rateFor(custId, product){
  var r = EX.rates[custId] && +EX.rates[custId][product];
  return r > 0 ? r : (PRODUCTS[product] ? PRODUCTS[product].price : 0);
}
function isPaused(custId, date){ return EX.pauses.some(function(p){ return p.custId === custId && date >= p.from && date <= p.to; }); }
function daysBetween(a, b){ return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5); }
function custOptions(){ return sortedByName(customers).map(function(c){ return '<option value="' + c.id + '">' + escapeHtml(c.name) + ' (' + c.id + ')</option>'; }).join(''); }

// ── PAYMENTS PAGE ─────────────────────────────────────
function payRows(){
  return customers.map(function(c){
    var billed = customerSummary(c.id).amount, paid = paidBy(c.id);
    return { c: c, billed: billed, paid: paid, bal: round2(billed - paid) };
  }).filter(function(r){ return r.billed > 0 || r.paid > 0; }).sort(function(a, b){ return b.bal - a.bal; });
}

function renderPaymentsPage(){
  var mEl = document.getElementById('payMonth');
  if(!mEl.value) mEl.value = todayStr().slice(0, 7);
  var month = mEl.value, rows = payRows();
  var billed = round2(rows.reduce(function(s, r){ return s + r.billed; }, 0));
  var paid = round2(EX.payments.reduce(function(s, p){ return s + (+p.amount || 0); }, 0));   // all money received, even from customers deleted later
  var owed = round2(rows.reduce(function(s, r){ return s + Math.max(r.bal, 0); }, 0));
  var mDels = deliveriesInMonth(month), mRev = sumAmount(mDels);
  var mExp = EX.expenses.filter(function(e){ return e.date.slice(0, 7) === month; });
  var mExpAmt = round2(mExp.reduce(function(s, e){ return s + (+e.amount || 0); }, 0));
  var bought = mExp.reduce(function(s, e){ return s + (+e.litres || 0); }, 0), sold = sumQty(mDels, 'Milk');
  var mColl = round2(EX.payments.filter(function(p){ return p.date.slice(0, 7) === month; }).reduce(function(s, p){ return s + (+p.amount || 0); }, 0));
  var profit = round2(mRev - mExpAmt);

  document.getElementById('payNotice').innerHTML = EXTRAS_API_URL ? '' :
    '<div class="alert-card" style="font-size:.82rem">⚠️ Payments, expenses, pauses and special rates are saved on <strong>this device only</strong>. Set <code>EXTRAS_API_URL</code> in extras.js (see extras_backend.gs) to back them up to Google Drive.</div>';
  var cards = [
    ['🧾', money(billed), 'Total Billed', ''], ['✅', money(paid), 'Collected', 'green'], ['⏳', money(owed), 'Outstanding (baaki)', 'red'],
    ['📆', money(mRev), 'Revenue ' + month, ''], ['➖', money(mExpAmt), 'Expenses ' + month, 'amber'],
    ['📈', money(profit), 'Profit ' + month, profit >= 0 ? 'green' : 'red'], ['💵', money(mColl), 'Collected ' + month, 'green'],
    ['🥛', bought.toFixed(1) + ' / ' + sold.toFixed(1) + ' L', 'Milk bought / sold ' + month, 'blue']
  ];
  document.getElementById('payStats').innerHTML = cards.map(function(s){
    return '<div class="stat-card ' + s[3] + '"><div class="stat-icon">' + s[0] + '</div><div class="stat-v" style="font-size:1.25rem">' + s[1] + '</div><div class="stat-l">' + s[2] + '</div></div>';
  }).join('');

  document.getElementById('payBody').innerHTML = rows.map(function(r){
    var st = r.bal <= 0 ? '<span class="badge badge-green">' + (r.bal < 0 ? 'Advance ' + money(-r.bal) : 'Paid') + '</span>' : (r.paid > 0 ? '<span class="badge badge-amber">Partial</span>' : '<span class="badge badge-red">Unpaid</span>');
    return '<tr><td><strong>' + escapeHtml(r.c.name) + '</strong></td><td>' + money(r.billed) + '</td><td>' + money(r.paid) + '</td>' +
      '<td style="font-weight:800;color:' + (r.bal > 0 ? 'var(--red)' : 'var(--secondary)') + '">' + money(Math.max(r.bal, 0)) + '</td><td>' + st + '</td><td style="white-space:nowrap">' +
      '<button class="btn-icon" title="Record payment" onclick="openPayModal(\'' + r.c.id + '\')">💰</button> ' +
      '<button class="btn-icon" title="WhatsApp reminder" onclick="remindPayment(\'' + r.c.id + '\')">📱</button> ' +
      '<button class="btn-icon" title="View bill" onclick="openBillModal(\'' + r.c.id + '\')">📄</button></td></tr>';
  }).join('') || '<tr><td colspan="6"><div class="empty"><span class="icon">💳</span><p>No billing yet</p></div></td></tr>';

  var cname = function(id){ var c = custById(id); return c ? escapeHtml(c.name) : 'Deleted customer'; };
  document.getElementById('payRecent').innerHTML = EX.payments.slice().sort(function(a, b){ return b.date.localeCompare(a.date); }).slice(0, 15).map(function(p){
    return '<div class="alert-row" style="color:var(--dark)"><span><strong>' + money(p.amount) + '</strong> · ' + cname(p.custId) + '<br><span style="font-size:.74rem;color:var(--gray)">' + fmtDate(p.date) + ' · ' + escapeHtml(p.mode || '') + (p.note ? ' · ' + escapeHtml(p.note) : '') + '</span></span>' +
      '<button class="btn-icon" title="Delete" onclick="deletePayment(\'' + p.id + '\')">🗑️</button></div>';
  }).join('') || '<p style="color:var(--gray);font-size:.85rem">No payments recorded yet</p>';
  document.getElementById('expRecent').innerHTML = mExp.slice().sort(function(a, b){ return b.date.localeCompare(a.date); }).map(function(e){
    return '<div class="alert-row" style="color:var(--dark)"><span><strong>' + money(e.amount) + '</strong> · ' + escapeHtml(e.cat) + (e.litres ? ' · ' + e.litres + ' L' : '') + '<br><span style="font-size:.74rem;color:var(--gray)">' + fmtDate(e.date) + (e.note ? ' · ' + escapeHtml(e.note) : '') + '</span></span>' +
      '<button class="btn-icon" title="Delete" onclick="deleteExpense(\'' + e.id + '\')">🗑️</button></div>';
  }).join('') || '<p style="color:var(--gray);font-size:.85rem">No expenses this month</p>';
}

function openPayModal(custId){
  if(!customers.length){ toast('Add a customer first', 'err'); return; }
  document.getElementById('pay-cust').innerHTML = custOptions();
  if(custId) document.getElementById('pay-cust').value = custId;
  document.getElementById('pay-date').value = todayStr();
  document.getElementById('pay-mode').value = 'Cash'; document.getElementById('pay-note').value = '';
  payFillAmount();
  openModal('payModal');
}
function payFillAmount(){ var b = balanceOf($v('pay-cust')); document.getElementById('pay-amt').value = b > 0 ? b : ''; }
function savePayment(){
  var amt = parseFloat($v('pay-amt')), date = $v('pay-date');
  if(!(amt > 0) || !date){ toast('Enter amount and date', 'err'); return; }
  EX.payments.push({ id: uid('PAY'), custId: $v('pay-cust'), date: date, amount: round2(amt), mode: $v('pay-mode'), note: $v('pay-note').trim() });
  saveX(); closeModal('payModal');
  var c = custById($v('pay-cust'));
  toast('✅ ' + money(amt) + ' received' + (c ? ' from ' + c.name : ''), 'ok');
  logActivity('customer', 'Payment received: ' + (c ? c.name : '') + ' — ' + money(amt));
  refreshAllViews();
}
function deletePayment(id){ if(!confirm('Delete this payment record?')) return; EX.payments = EX.payments.filter(function(p){ return p.id !== id; }); saveX(); refreshAllViews(); }

function openExpModal(){
  document.getElementById('exp-date').value = todayStr(); document.getElementById('exp-cat').value = 'Doodh khareed';
  ['exp-amt', 'exp-litres', 'exp-note'].forEach(function(i){ document.getElementById(i).value = ''; });
  openModal('expModal');
}
function saveExpense(){
  var amt = parseFloat($v('exp-amt')), date = $v('exp-date');
  if(!(amt > 0) || !date){ toast('Enter amount and date', 'err'); return; }
  EX.expenses.push({ id: uid('EXP'), date: date, cat: $v('exp-cat'), amount: round2(amt), litres: parseFloat($v('exp-litres')) || 0, note: $v('exp-note').trim() });
  saveX(); closeModal('expModal'); toast('Expense added', 'ok'); refreshAllViews();
}
function deleteExpense(id){ if(!confirm('Delete this expense?')) return; EX.expenses = EX.expenses.filter(function(e){ return e.id !== id; }); saveX(); refreshAllViews(); }

function remindPayment(custId){
  var c = custById(custId); if(!c) return;
  var bal = balanceOf(custId);
  if(bal <= 0){ toast(c.name + ' has no balance due', 'ok'); return; }
  var num = normalizeWhatsAppNumber(c.mobile);
  if(!num.ok){ toast('Customer mobile number is invalid', 'err'); return; }
  var l = deliveriesFor(custId);
  var msg = 'Namaste ' + c.name + ' ji \uD83D\uDE4F\nBhati Farms ki taraf se: aapka *' + money(bal) + '* baaki hai' + (l.length ? ' (' + fmtDate(l[0].date) + ' \u2013 ' + fmtDate(l[l.length - 1].date) + ')' : '') + '.' +
    (EX.upi ? '\nUPI ID: ' + EX.upi + '\nupi://pay?pa=' + encodeURIComponent(EX.upi) + '&pn=Bhati%20Farms&am=' + bal + '&cu=INR' : '') + '\nDhanyavaad!';
  if(!openWhatsAppChat(num.number, msg)) toast('Pop-ups are blocked. Allow pop-ups and try again.', 'warn');
}

// ── CUSTOMER: PAUSE + SPECIAL RATES ───────────────────
function openCustExtra(custId){
  var c = custById(custId); if(!c) return;
  var pauses = EX.pauses.filter(function(p){ return p.custId === custId; }).sort(function(a, b){ return b.from.localeCompare(a.from); });
  var rates = EX.rates[custId] || {};
  document.getElementById('extraContent').innerHTML =
    '<h2>' + escapeHtml(c.name) + ' — Pause &amp; Rates</h2>' +
    '<h3 style="font-size:.9rem;margin:6px 0">⏸️ Pause deliveries (no alerts / entries / route)</h3>' +
    '<div class="frow"><div class="fg"><label>From</label><input type="date" id="px-from" value="' + todayStr() + '"></div><div class="fg"><label>To</label><input type="date" id="px-to" value="' + todayStr() + '"></div></div>' +
    '<div class="fg"><label>Note</label><input id="px-note" placeholder="e.g. out of town"></div>' +
    '<button class="btn btn-primary btn-sm" onclick="addPause(\'' + custId + '\')">Add pause</button>' +
    '<div style="margin:10px 0 18px">' + (pauses.map(function(p){ return '<div class="alert-row" style="color:var(--dark)"><span>' + fmtDate(p.from) + ' \u2192 ' + fmtDate(p.to) + (p.note ? ' · ' + escapeHtml(p.note) : '') + '</span><button class="btn-icon" onclick="deletePause(\'' + p.id + '\',\'' + custId + '\')">✕</button></div>'; }).join('') || '<p style="color:var(--gray);font-size:.82rem">No pauses</p>') + '</div>' +
    '<h3 style="font-size:.9rem;margin:6px 0">💲 Special rate (leave blank = normal price)</h3>' +
    Object.keys(PRODUCTS).map(function(p, i){
      return '<div class="fg" style="display:flex;gap:10px;align-items:center"><span style="width:130px">' + PRODUCTS[p].icon + ' ' + escapeHtml(p) + '</span><input type="number" id="rt-' + i + '" step="0.5" min="0" placeholder="' + PRODUCTS[p].price + '" value="' + (rates[p] || '') + '"></div>';
    }).join('') +
    '<button class="btn btn-primary btn-lg" style="width:100%;margin-top:6px" onclick="saveRates(\'' + custId + '\')">💾 Save rates</button>';
  openModal('extraModal');
}
function addPause(custId){
  var f = $v('px-from'), t = $v('px-to');
  if(!f || !t || f > t){ toast('Choose a valid date range', 'err'); return; }
  EX.pauses.push({ id: uid('PZ'), custId: custId, from: f, to: t, note: $v('px-note').trim() });
  saveX(); toast('Paused', 'ok'); openCustExtra(custId); refreshAllViews();
}
function deletePause(id, custId){ EX.pauses = EX.pauses.filter(function(p){ return p.id !== id; }); saveX(); openCustExtra(custId); refreshAllViews(); }
function saveRates(custId){
  var r = {};
  Object.keys(PRODUCTS).forEach(function(p, i){ var v = parseFloat($v('rt-' + i)); if(v > 0) r[p] = v; });
  if(Object.keys(r).length) EX.rates[custId] = r; else delete EX.rates[custId];
  saveX(); toast('Rates saved \u2713 (used for new deliveries; old bills unchanged)', 'ok'); closeModal('extraModal');
}
function onDeliveryCustomerChange(){
  var cid = $v('d-customer');
  document.querySelectorAll('#d-productRows .prod-row').forEach(function(row){
    row.querySelector('.prow-rate').value = rateFor(cid, row.querySelector('.prow-product').value);
  });
  updateDeliveryTotal();
}

// ── MARK TODAY'S (OR ANY DAY'S) DELIVERIES IN ONE GO ──
var tmRows = [];
function openTodayModal(){
  if(!activeCustomers().length){ toast('Add a customer first', 'err'); return; }
  var d = document.getElementById('tm-date'); d.value = todayStr(); d.max = todayStr();
  tmBuild(); openModal('todayModal');
}
function tmBuild(){
  var date = $v('tm-date'); tmRows = [];
  document.getElementById('tm-msg').textContent = (!date || date > todayStr()) ? 'Choose today or an earlier date' : '';
  if(date && date <= todayStr()){
    sortedByName(activeCustomers()).forEach(function(c){
      if((c.regDate && c.regDate > date) || isPaused(c.id, date)) return;
      var mine = bdCustDeliveries(c.id);
      bdDefaultSlots(c, mine).forEach(function(slot){
        if(mine.some(function(d){ return d.date === date && d.slot === slot; })) return;   // already recorded
        var df = bdSlotDefault(mine, slot), sp = EX.rates[c.id] && +EX.rates[c.id][df.product];
        tmRows.push({ custId: c.id, name: c.name, slot: slot, product: df.product, qty: df.qty, rate: sp > 0 ? sp : df.rate, include: true });
      });
    });
  }
  tmRender();
}
function tmRender(){
  document.getElementById('tm-body').innerHTML = tmRows.map(function(r, i){
    return '<tr id="tm-r-' + i + '"><td><input type="checkbox"' + (r.include ? ' checked' : '') + ' onchange="tmEdit(' + i + ',\'include\',this.checked)"></td>' +
      '<td><strong>' + escapeHtml(r.name) + '</strong></td><td>' + (r.slot === 'Morning' ? '☀️ Morning' : '🌙 Evening') + '</td>' +
      '<td><select onchange="tmEdit(' + i + ',\'product\',this.value)">' + bdProdOptions(r.product) + '</select></td>' +
      '<td><input type="number" class="bd-qty" value="' + r.qty + '" step="0.5" min="0" oninput="tmEdit(' + i + ',\'qty\',this.value)"></td>' +
      '<td><input type="number" class="bd-rate" value="' + r.rate + '" step="0.5" min="0" oninput="tmEdit(' + i + ',\'rate\',this.value)"></td>' +
      '<td class="bd-amt" id="tm-amt-' + i + '">' + money(round2(r.qty * r.rate)) + '</td></tr>';
  }).join('') || '<tr><td colspan="7"><div class="empty"><span class="icon">✅</span><p>Nothing pending for this date</p></div></td></tr>';
  tmSummary();
}
function tmEdit(i, f, v){
  var r = tmRows[i]; if(!r) return;
  if(f === 'include') r.include = !!v;
  else if(f === 'product'){ r.product = v; r.rate = rateFor(r.custId, v); var row = document.getElementById('tm-r-' + i); if(row) row.querySelector('.bd-rate').value = r.rate; }
  else r[f] = parseFloat(v) || 0;
  var a = document.getElementById('tm-amt-' + i); if(a) a.textContent = money(round2(r.qty * r.rate));
  tmSummary();
}
function tmToggleAll(on){ tmRows.forEach(function(r){ r.include = on; }); tmRender(); }
function tmSummary(){
  var p = tmRows.filter(function(r){ return r.include; });
  document.getElementById('tm-total').textContent = money(round2(p.reduce(function(s, r){ return s + round2(r.qty * r.rate); }, 0)));
  var b = document.getElementById('tm-save'); b.disabled = !p.length;
  b.textContent = p.length ? '✅ Save ' + p.length + ' deliver' + (p.length === 1 ? 'y' : 'ies') : '✅ Save deliveries';
}
function tmSave(){
  var date = $v('tm-date'), picked = tmRows.filter(function(r){ return r.include; });
  if(!picked.length){ toast('Select at least one delivery', 'err'); return; }
  if(!date || date > todayStr()){ toast('Choose today or an earlier date', 'err'); return; }
  var taken = {};
  deliveries.forEach(function(d){ taken[d.custId + '|' + d.date + '|' + d.slot] = true; });
  for(var i = 0; i < picked.length; i++){
    var r = picked[i];
    if(!(r.qty > 0) || !(r.rate > 0)){ toast('Enter valid qty and rate for ' + r.name, 'err'); return; }
    if(taken[r.custId + '|' + date + '|' + r.slot]){ toast(r.name + ' already has a ' + r.slot + ' delivery on this date \u2014 reopen the list', 'err'); return; }
  }
  var added = picked.map(function(r){
    return normalizeDelivery({ id: uid('DEL'), date: date, custId: r.custId, custName: r.name, slot: r.slot, product: r.product, qty: r.qty, rate: r.rate, amount: round2(r.qty * r.rate) });
  });
  added.forEach(function(d){ deliveries.push(d); });
  var fromEl = document.getElementById('delFilterFrom'), toEl = document.getElementById('delFilterTo');
  if(fromEl && fromEl.value && date < fromEl.value) fromEl.value = date;
  if(toEl && toEl.value && date > toEl.value) toEl.value = date;
  persistLocalOnly();
  appendDeliveriesRemote(added).catch(function(){ toast('Saved on this device but could not sync to Google Sheets', 'err'); });
  closeModal('todayModal');
  toast('✅ ' + added.length + ' deliveries recorded for ' + fmtDate(date) + ' \u2014 ' + money(sumAmount(added)), 'ok');
  logActivity('delivery', 'Bulk deliveries recorded: ' + added.length + ' for ' + fmtDate(date) + ' \u2014 ' + money(sumAmount(added)));
  refreshAllViews();
}

// ── ROUTE LIST (for the delivery boy) ─────────────────
function routeText(date){
  var out = [];
  ['Morning', 'Evening'].forEach(function(slot){
    var lines = [];
    sortedByName(activeCustomers()).forEach(function(c){
      if((c.regDate && c.regDate > date) || isPaused(c.id, date)) return;
      var mine = bdCustDeliveries(c.id);
      if(bdDefaultSlots(c, mine).indexOf(slot) === -1) return;
      var done = mine.some(function(d){ return d.date === date && d.slot === slot; }), df = bdSlotDefault(mine, slot);
      lines.push((lines.length + 1) + '. ' + (done ? '\u2705 ' : '') + c.name + ' \u2014 ' + df.qty + ' ' + (PRODUCTS[df.product] || { unit: '' }).unit + ' ' + df.product + (c.address ? ' \u2014 ' + c.address : '') + (c.mobile ? ' \u2014 ' + c.mobile : ''));
    });
    if(lines.length) out.push('*' + slot + ' route \u2014 ' + fmtDate(date) + '*\n' + lines.join('\n'));
  });
  return out.join('\n\n') || 'Aaj koi delivery due nahi hai.';
}
function openRouteList(){ document.getElementById('routeText').textContent = routeText(todayStr()); openModal('routeModal'); }
function sendRouteWhatsApp(){
  var num = normalizeWhatsAppNumber(alertCfg().number);
  if(!num.ok){ toast('Delivery boy number is invalid - fix it in Settings', 'err'); return; }
  if(!openWhatsAppChat(num.number, document.getElementById('routeText').textContent)) toast('Pop-ups are blocked.', 'warn');
}
function copyRoute(){
  var t = document.getElementById('routeText').textContent;
  if(navigator.clipboard) navigator.clipboard.writeText(t).then(function(){ toast('Route list copied', 'ok'); }, function(){ toast('Copy failed', 'err'); });
}

// ── LOW-DELIVERY ALERT (dashboard) ────────────────────
function renderLowDelivery(){
  var el = document.getElementById('lowDelAlert'); if(!el) return;
  var today = todayStr(), n = +EX.lowDays || 3, rows = [];
  activeCustomers().forEach(function(c){
    if(isPaused(c.id, today)) return;
    var l = deliveriesFor(c.id); if(!l.length) return;
    var d = daysBetween(l[l.length - 1].date, today);
    if(d >= n) rows.push({ c: c, last: l[l.length - 1].date, d: d });
  });
  rows.sort(function(a, b){ return b.d - a.d; });
  el.innerHTML = !rows.length ? '' : '<div class="alert-card"><div class="alert-head"><strong>😴 No delivery for ' + n + '+ days — ' + rows.length + ' customer' + (rows.length > 1 ? 's' : '') + '</strong></div>' +
    rows.slice(0, 8).map(function(r){
      return '<div class="alert-row"><span><strong>' + escapeHtml(r.c.name) + '</strong> <span style="color:var(--gray)">last ' + fmtDate(r.last) + ' · ' + r.d + ' days ago</span></span>' +
        '<button class="btn-icon" title="Pause / rates" onclick="openCustExtra(\'' + r.c.id + '\')">⏸️</button></div>';
    }).join('') + '</div>';
}

// ── TOP CUSTOMERS REPORT ──────────────────────────────
function buildTopReport(){
  var r = periodRange(), total = sumAmount(periodDeliveries());
  var rows = customers.map(function(c){ var s = customerSummary(c.id, r.from, r.to); return { c: c, n: s.count, amt: s.amount, milk: sumQty(s.list, 'Milk') }; })
    .filter(function(x){ return x.n > 0; }).sort(function(a, b){ return b.amt - a.amt; }).slice(0, 15);
  return '<h3 style="margin-bottom:10px">Top Customers \u2014 ' + fmtDateLong(r.from) + ' to ' + fmtDateLong(r.to) + '</h3>' +
    '<table class="data-table"><thead><tr><th>#</th><th>Customer</th><th>Records</th><th>Milk (L)</th><th>Amount</th><th>Share</th></tr></thead><tbody>' +
    (rows.map(function(x, i){ return '<tr><td>' + (i + 1) + '</td><td><strong>' + escapeHtml(x.c.name) + '</strong></td><td>' + x.n + '</td><td>' + x.milk.toFixed(1) + '</td><td style="font-weight:700">' + money(x.amt) + '</td><td>' + (total ? Math.round(x.amt * 100 / total) : 0) + '%</td></tr>'; }).join('') || '<tr><td colspan="6">No data</td></tr>') + '</tbody></table>';
}

// ── SETTINGS CARD + BACKUP ────────────────────────────
function renderExtrasSettings(){
  var el = document.getElementById('extrasSettings'); if(!el) return;
  el.innerHTML =
    '<div class="fg"><label>Your UPI ID (added to payment reminders)</label><input id="ex-upi" value="' + escapeHtml(EX.upi || '') + '" placeholder="name@bank"></div>' +
    '<div class="fg"><label>Alert if no delivery for (days)</label><input type="number" id="ex-low" min="1" value="' + (+EX.lowDays || 3) + '"></div>' +
    '<button class="btn btn-primary btn-sm" onclick="saveExtrasSettings()">💾 Save</button>' +
    '<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-ghost btn-sm" onclick="exportFullBackup()">📥 Excel backup</button><button class="btn btn-ghost btn-sm" onclick="downloadExtrasJSON()">📥 Payments &amp; extras (JSON)</button></div>' +
    '<p style="font-size:.74rem;color:var(--gray);margin-top:10px">Cloud backup of payments/expenses: ' + (EXTRAS_API_URL ? '✅ ON' : '⚠️ OFF (this device only)') + '</p>';
}
function saveExtrasSettings(){ EX.upi = $v('ex-upi').trim(); EX.lowDays = Math.max(1, parseInt($v('ex-low'), 10) || 3); saveX(); toast('Saved \u2713', 'ok'); renderLowDelivery(); }
function downloadExtrasJSON(){
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(EX, null, 2)], { type: 'application/json' }));
  a.download = 'BhatiFarms_payments_extras_' + todayStr() + '.json'; document.body.appendChild(a); a.click(); a.remove();
}