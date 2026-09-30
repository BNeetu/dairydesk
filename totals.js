// ══════════════════════════════════════════════════════
//  DELIVERY TOTALS — single source of truth
//  Every page reads amounts through these helpers. A delivery's amount is
//  ALWAYS qty × rate (rounded to paise); it is recomputed whenever data is
//  loaded, created, edited or backdated, so a stale stored amount can never
//  leak into a page again.
// ══════════════════════════════════════════════════════
function round2(n){ return Math.round((Number(n) || 0) * 100) / 100; }

// Sum in whole paise so float drift (0.1+0.2) can never make two pages differ
function sumAmount(list){
  var paise = list.reduce(function(s, d){ return s + Math.round((Number(d.amount) || 0) * 100); }, 0);
  return paise / 100;
}

function addDaysISO(iso, n){
  var d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
}

var deliveryAudit = { fixed: [], orphans: [], duplicates: [] };

function normalizeDelivery(d){
  var qty = parseFloat(d.qty); if(!isFinite(qty) || qty < 0) qty = 0;
  var rate = parseFloat(d.rate), stored = parseFloat(d.amount), legacy = false;
  if(!(rate > 0)){
    if(stored > 0 && qty > 0){ rate = stored / qty; legacy = true; }   // old row without a rate: keep its historic amount
    else rate = PRODUCTS[d.product] ? PRODUCTS[d.product].price : 0;
  }
  var c = Array.isArray(customers) ? customers.find(function(x){ return x.id === d.custId; }) : null;
  return Object.assign({}, d, {
    qty: qty, rate: rate,
    amount: legacy ? round2(stored) : round2(qty * rate),
    custName: c ? c.name : d.custName        // never show a stale/renamed customer name
  });
}

function normalizeDeliveries(list){
  var audit = { fixed: [], orphans: [], duplicates: [] }, seen = {};
  var out = (Array.isArray(list) ? list : []).map(function(d){
    var n = normalizeDelivery(d), stored = parseFloat(d.amount);
    var row = { id: n.id, customer: n.custName, date: n.date, slot: n.slot };
    if(isFinite(stored) && Math.abs(stored - n.amount) > 0.005) audit.fixed.push(Object.assign({ stored: stored, corrected: n.amount }, row));
    if(customers.length && !customers.some(function(c){ return c.id === n.custId; })) audit.orphans.push(Object.assign({ custId: n.custId }, row));
    var key = [n.custId, n.date, n.slot, n.product, n.qty, n.rate].join('|');
    if(seen[key]) audit.duplicates.push(row);
    seen[key] = true;
    return n;
  });
  deliveryAudit = audit;
  return out;
}
deliveries = normalizeDeliveries(deliveries);

// One query for "this customer's deliveries" (by ID, never by name), oldest first
function deliveriesFor(custId, from, to){
  return deliveries.filter(function(d){
    return d.custId === custId && (!from || d.date >= from) && (!to || d.date <= to);
  }).sort(function(a, b){
    return a.date.localeCompare(b.date) || (a.slot === b.slot ? 0 : (a.slot === 'Morning' ? -1 : 1));
  });
}
function customerSummary(custId, from, to){
  var list = deliveriesFor(custId, from, to);
  return { list: list, count: list.length, amount: sumAmount(list) };
}

function reportDataHealth(){
  var a = deliveryAudit, n = a.fixed.length + a.orphans.length + a.duplicates.length;
  if(!n) return;
  console.warn('Delivery data check', a);
  toast('⚠️ Data check found ' + n + ' issue(s) in delivery records — see Settings → Data Check', 'warn');
}

function renderDataCheck(){
  var el = document.getElementById('dataCheck');
  if(!el) return;
  var a = deliveryAudit;
  function block(title, arr, fmt){
    if(!arr.length) return '';
    return '<div style="margin-bottom:10px"><strong>' + title + ' (' + arr.length + ')</strong>' +
      '<div style="font-size:.78rem;color:var(--gray);margin-top:3px">' + arr.slice(0, 12).map(fmt).join('<br>') + (arr.length > 12 ? '<br>…' : '') + '</div></div>';
  }
  var html =
    block('Amount did not match qty × rate — auto-corrected', a.fixed, function(r){ return escapeHtml(r.customer) + ' · ' + fmtDate(r.date) + ' ' + r.slot + ': ' + money(r.stored) + ' → ' + money(r.corrected); }) +
    block('Delivery belongs to a customer that no longer exists', a.orphans, function(r){ return escapeHtml(r.customer) + ' (' + escapeHtml(r.custId) + ') · ' + fmtDate(r.date) + ' ' + r.slot; }) +
    block('Possible duplicate records', a.duplicates, function(r){ return escapeHtml(r.customer) + ' · ' + fmtDate(r.date) + ' ' + r.slot; });
  el.innerHTML = html || '<p style="font-size:.85rem">✅ Every delivery amount matches qty × rate, and there are no orphaned or duplicate records.</p>';
}


// ══════════════════════════════════════════════════════
//  SHARED PERIOD = the Deliveries page's date range (source of truth)
// ══════════════════════════════════════════════════════
function periodRange(){
  var f = document.getElementById('delFilterFrom'), t = document.getElementById('delFilterTo');
  return { from: (f && f.value) || earliestDataDate(), to: (t && t.value) || latestDataDate() };
}
function periodDeliveries(){ var r = periodRange(); return deliveriesInRange(r.from, r.to); }
function periodLabel(){ var r = periodRange(); return fmtDate(r.from) + ' – ' + fmtDate(r.to); }