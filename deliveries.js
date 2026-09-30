// ══════════════════════════════════════════════════════
//  DELIVERIES MODULE
// ══════════════════════════════════════════════════════
var delPage = 1;
var DEL_PAGE_SIZE = 10;
var deliveryRowCount = 0;

function populateCustomerDropdown(){
  var sel = document.getElementById('d-customer');
  if(!sel) return;
  var cur = sel.value;
  sel.innerHTML = activeCustomers().map(function(c){
    return '<option value="' + c.id + '">' + c.name + ' (' + c.id + ')</option>';
  }).join('');
  if(cur) sel.value = cur;
}

function openDeliveryModal(){
  document.getElementById('d-date').value = todayStr();
  document.getElementById('d-slot').value = 'Morning';
  populateCustomerDropdown();
  document.getElementById('d-productRows').innerHTML = '';
  deliveryRowCount = 0;
  addDeliveryProductRow();
  openModal('deliveryModal');
}

function addDeliveryProductRow(){
  var rid = 'prow_' + (++deliveryRowCount);
  var div = document.createElement('div');
  div.className = 'prod-row';
  div.id = rid;
  var prodOptions = Object.keys(PRODUCTS).map(function(p){
    return '<option value="' + p + '">' + PRODUCTS[p].icon + ' ' + p + ' (₹' + PRODUCTS[p].price + '/' + PRODUCTS[p].unit + ')</option>';
  }).join('');
  var firstProduct = Object.keys(PRODUCTS)[0];
  var firstPrice = firstProduct ? PRODUCTS[firstProduct].price : 0;
  div.innerHTML =
    '<select class="prow-product" onchange="onDeliveryProductChange(this)">' + prodOptions + '</select>' +
    '<input type="number" class="prow-qty" value="1" step="0.5" min="0.5" oninput="updateDeliveryTotal()" placeholder="Qty">' +
    '<input type="number" class="prow-rate" value="' + firstPrice + '" step="0.5" min="0" oninput="updateDeliveryTotal()" placeholder="Unit Price" title="Change the unit price for this delivery">' +
    '<span class="row-amt" id="' + rid + '_amt">₹0</span>' +
    '<button class="row-del" onclick="document.getElementById(\'' + rid + '\').remove();updateDeliveryTotal()">×</button>';
  document.getElementById('d-productRows').appendChild(div);
  updateDeliveryTotal();
}

function onDeliveryProductChange(select){
  var product = select.value;
  var row = select.closest('.prod-row');
  if(!row) return;
  var rateInput = row.querySelector('.prow-rate');
  if(rateInput && PRODUCTS[product]){
    rateInput.value = PRODUCTS[product].price;
  }
  updateDeliveryTotal();
}

function updateDeliveryTotal(){
  var rows = document.querySelectorAll('#d-productRows .prod-row');
  var total = 0;
  rows.forEach(function(row){
    var productEl = row.querySelector('.prow-product');
    var product = productEl ? productEl.value : Object.keys(PRODUCTS)[0];
    var qty = parseFloat(row.querySelector('.prow-qty').value) || 0;
    var rate = parseFloat(row.querySelector('.prow-rate').value) || 0;
    var amt = Math.round(qty * rate * 100) / 100;
    total += amt;
    var amtEl = row.querySelector('.row-amt');
    if(amtEl) amtEl.textContent = money(amt);
  });
  document.getElementById('d-totalDisplay').textContent = money(total);
}

function saveDelivery(){
  var date = document.getElementById('d-date').value;
  var slot = document.getElementById('d-slot').value;
  var custId = document.getElementById('d-customer').value;
  if(!date || !custId){ toast('Please select date and customer', 'err'); return; }

  var c = custById(custId);
  var rows = document.querySelectorAll('#d-productRows .prod-row');
  if(!rows.length){ toast('Add at least one product', 'err'); return; }

  var added = [];
  rows.forEach(function(row){
    var product = row.querySelector('.prow-product').value;
    var qty = parseFloat(row.querySelector('.prow-qty').value) || 0;
    var rate = parseFloat(row.querySelector('.prow-rate').value) || 0;
    if(qty <= 0 || rate <= 0) return;
    var amount = Math.round(qty * rate * 100) / 100;
    var del = {
      id: uid('DEL'),
      date: date, custId: custId, custName: c.name,
      slot: slot, product: product, qty: qty, rate: rate, amount: amount
    };
    del = normalizeDelivery(del);
    deliveries.push(del);
    added.push(del);
  });

  if(!added.length){ toast('Enter a valid quantity and rate for at least one product', 'err'); return; }

  // The date-range filter is only auto-set ONCE (see initDeliveryFilters) and
  // never grows on its own. Without this, a delivery dated later than the
  // filter's current "to" (or earlier than its "from") would save correctly
  // but be silently excluded from the visible list until the page reloads
  // and the filter gets recomputed from scratch.
  var toEl = document.getElementById('delFilterTo');
  var fromEl = document.getElementById('delFilterFrom');
  added.forEach(function(d){
    if(toEl && (!toEl.value || d.date > toEl.value)) toEl.value = d.date;
    if(fromEl && (!fromEl.value || d.date < fromEl.value)) fromEl.value = d.date;
  });

  persistLocalOnly();
  appendDeliveriesRemote(added).catch(function(){ toast('Delivery saved on this device but could not sync to Google Sheets', 'err'); });
  closeModal('deliveryModal');
  var totalAmt = sumAmount(added);
  toast('✅ Delivery recorded for ' + c.name + ' — ' + money(totalAmt), 'ok');
  logActivity('delivery', 'Delivery recorded: ' + c.name + ' (' + slot + ') — ' + money(totalAmt));
  refreshAllViews();
}

var _busyDelIds = {};
// Server first, local second. The row only disappears from the UI once the sheet
// confirms it is gone, so a refresh can never bring back something the UI said was deleted.
async function deleteDelivery(id){
  if(_busyDelIds[id]) return;
  var d = deliveries.find(function(x){ return x.id === id; });
  if(!d) return;
  if(!confirm('Delete this delivery record?')) return;
  _busyDelIds[id] = true;
  try{
    toast('Deleting...', '');
    await deleteDeliveryRemote(id);
    deliveries = deliveries.filter(function(x){ return x.id !== id; });
    persistLocalOnly();
    toast('Delivery deleted', 'err');
    refreshAllViews();
  }catch(err){
    console.error('deleteDelivery failed', err);
    toast('Delete failed - nothing was removed: ' + (err.message || err), 'err');
  }finally{
    delete _busyDelIds[id];
  }
}

function initDeliveryFilters(){
  if(!document.getElementById('delFilterFrom').value){
    document.getElementById('delFilterFrom').value = earliestDataDate();
    document.getElementById('delFilterTo').value = latestDataDate();
  }
}

function clearDeliveryFilters(){
  document.getElementById('delFilterFrom').value = '';
  document.getElementById('delFilterTo').value = '';
  document.getElementById('delFilterSlot').value = '';
  document.getElementById('delFilterProduct').value = '';
  document.getElementById('delFilterCust').value = '';
  renderDeliveriesTable();
}

function filteredDeliveries(){
  var from = document.getElementById('delFilterFrom').value;
  var to = document.getElementById('delFilterTo').value;
  var slot = document.getElementById('delFilterSlot').value;
  var product = document.getElementById('delFilterProduct').value;
  var custQ = (document.getElementById('delFilterCust').value || '').toLowerCase();

  return deliveries.filter(function(d){
    if(from && d.date < from) return false;
    if(to && d.date > to) return false;
    if(slot && d.slot !== slot) return false;
    if(product && d.product !== product) return false;
    if(custQ && !d.custName.toLowerCase().includes(custQ)) return false;
    return true;
  }).sort(function(a,b){ return b.date.localeCompare(a.date); });
}

function renderDeliveriesTable(){
  var list = filteredDeliveries();

  document.getElementById('delQuickStats').innerHTML =
    '<div class="stat-card"><div class="stat-v">' + list.length + '</div><div class="stat-l">Records Found</div></div>' +
    '<div class="stat-card green"><div class="stat-v">' + money(sumAmount(list)) + '</div><div class="stat-l">Total Amount</div></div>' +
    '<div class="stat-card amber"><div class="stat-v">' + new Set(list.map(function(d){return d.custId;})).size + '</div><div class="stat-l">Unique Customers</div></div>';

  var totalPages = Math.max(1, Math.ceil(list.length / DEL_PAGE_SIZE));
  if(delPage > totalPages) delPage = totalPages;
  var pageList = list.slice((delPage-1)*DEL_PAGE_SIZE, delPage*DEL_PAGE_SIZE);

  var body = document.getElementById('delTableBody');
  if(!pageList.length){
    body.innerHTML = '<tr><td colspan="7"><div class="empty"><span class="icon">🛵</span><p>No deliveries found for these filters</p></div></td></tr>';
  } else {
    body.innerHTML = pageList.map(function(d){
      var info = PRODUCTS[d.product] || { icon:'', unit:'' };
      var rate = typeof d.rate === 'number' ? d.rate : ((info.price || 0));
      var slotBadge = d.slot === 'Morning' ? '<span class="badge badge-amber">☀️ Morning</span>' : '<span class="badge badge-purple">🌙 Evening</span>';
      return '<tr>' +
        '<td>' + fmtDate(d.date) + '</td>' +
        '<td><strong>' + escapeHtml(d.custName) + '</strong></td>' +
        '<td>' + slotBadge + '</td>' +
        '<td>' + info.icon + ' ' + d.product + ' @ ₹' + rate + '/' + info.unit + '</td>' +
        '<td>' + d.qty + ' ' + info.unit + '</td>' +
        '<td style="font-weight:800;color:var(--primary)">' + money(d.amount) + '</td>' +
        '<td style="white-space:nowrap"><button class="btn-icon" onclick="openEditDelivery(\'' + d.id + '\')" title="Edit">✏️</button> <button class="btn-icon" onclick="deleteDelivery(\'' + d.id + '\')" title="Delete">🗑️</button></td>' +
      '</tr>';
    }).join('');
  }

  var pag = document.getElementById('delPagination');
  var pagHtml = '';
  for(var i = 1; i <= totalPages; i++){
    pagHtml += '<button class="page-btn ' + (i===delPage?'active':'') + '" onclick="delPage=' + i + ';renderDeliveriesTable()">' + i + '</button>';
  }
  pag.innerHTML = totalPages > 1 ? pagHtml : '';
}

// ══════════════════════════════════════════════════════
//  MISSED / BACKDATED DELIVERIES
// ══════════════════════════════════════════════════════
var BD_MAX_DAYS = 93;
var bdRows = [];       // one row per (date, slot, product line)
var bdFixedCust = null; // customer whose modal (bill/view) we were opened from

function bdAddDays(iso, n){
  var d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
}
function bdAmt(r){ return Math.round((r.qty || 0) * (r.rate || 0) * 100) / 100; }
function bdCustDeliveries(custId){ return deliveries.filter(function(d){ return d.custId === custId; }); }

// Default product/qty/rate for a slot = the customer's most recent delivery in that slot
function bdSlotDefault(mine, slot){
  var pool = mine.filter(function(d){ return d.slot === slot; });
  if(!pool.length) pool = mine;
  var last = null;
  pool.forEach(function(d){ if(!last || d.date >= last.date) last = d; });
  var product = last && PRODUCTS[last.product] ? last.product : (PRODUCTS.Milk ? 'Milk' : Object.keys(PRODUCTS)[0]);
  return {
    product: product,
    qty: last && last.qty > 0 ? last.qty : 1,
    rate: last && last.product === product && typeof last.rate === 'number' ? last.rate : PRODUCTS[product].price
  };
}

// Slots pre-ticked from the customer's delivery preference (and history when preference is "Both")
function bdDefaultSlots(c, mine){
  var slots = (c.pref === 'Morning' || c.pref === 'Evening') ? [c.pref] : ['Morning', 'Evening'];
  if(slots.length === 2){
    var used = slots.filter(function(s){ return mine.some(function(d){ return d.slot === s; }); });
    if(used.length === 1) slots = used;
  }
  return slots;
}

function openBackdatedModal(custId){
  var list = activeCustomers();
  if(custId && !list.some(function(c){ return c.id === custId; })){
    var extra = custById(custId);
    if(extra) list = list.concat([extra]);
  }
  if(!list.length){ toast('Add a customer first', 'err'); return; }
  bdFixedCust = custId || null;
  var sel = document.getElementById('bd-customer');
  sel.innerHTML = list.map(function(c){
    return '<option value="' + c.id + '">' + escapeHtml(c.name) + ' (' + c.id + ')</option>';
  }).join('');
  if(custId) sel.value = custId;
  bdOnCustomerChange();
  openModal('backdatedModal');
}

// Customer changed: reset date range + slots to sensible defaults, rebuild rows
function bdOnCustomerChange(){
  var c = custById(document.getElementById('bd-customer').value);
  if(!c) return;
  var mine = bdCustDeliveries(c.id);
  var today = todayStr();
  var last = mine.reduce(function(m, d){ return d.date > m ? d.date : m; }, '');
  var start = last ? bdAddDays(last, 1) : '';
  if(!start || start > today || start < bdAddDays(today, -31)) start = today.slice(0, 8) + '01';
  var from = document.getElementById('bd-from'), to = document.getElementById('bd-to');
  from.max = to.max = today;
  from.value = start; to.value = today;
  var slots = bdDefaultSlots(c, mine);
  document.getElementById('bd-slot-m').checked = slots.indexOf('Morning') > -1;
  document.getElementById('bd-slot-e').checked = slots.indexOf('Evening') > -1;
  bdBuildRows();
}

function bdBuildRows(){
  var custId = document.getElementById('bd-customer').value;
  var from = document.getElementById('bd-from').value;
  var to = document.getElementById('bd-to').value;
  var slots = [];
  if(document.getElementById('bd-slot-m').checked) slots.push('Morning');
  if(document.getElementById('bd-slot-e').checked) slots.push('Evening');
  var c = custById(custId);
  var err = '';
  bdRows = [];
  if(!c) err = 'Select a customer';
  else if(from && to && from > to) err = 'Start date must be on or before the end date';
  else if(to && to > todayStr()) err = 'End date cannot be in the future';
  else if(from && to && bdAddDays(from, BD_MAX_DAYS) < to) err = 'Please choose a range of at most ' + BD_MAX_DAYS + ' days';
  else if(!slots.length) err = 'Select at least one slot (Morning / Evening)';
  document.getElementById('bd-msg').textContent = err;
  if(err || !from || !to){ bdRender(); return; }

  var mine = bdCustDeliveries(custId);
  var existing = {};
  mine.forEach(function(d){ (existing[d.date + '|' + d.slot] = existing[d.date + '|' + d.slot] || []).push(d); });
  var defs = {};
  slots.forEach(function(s){ defs[s] = bdSlotDefault(mine, s); });

  for(var dt = from; dt <= to; dt = bdAddDays(dt, 1)){
    slots.forEach(function(slot){
      var ex = existing[dt + '|' + slot];
      var df = defs[slot];
      bdRows.push({
        date: dt, slot: slot, product: df.product, qty: df.qty, rate: df.rate,
        include: !ex,
        locked: ex ? ex.map(function(d){ return d.product + ' ' + d.qty; }).join(', ') : ''
      });
    });
  }
  bdRender();
}

function bdProdOptions(sel){
  return Object.keys(PRODUCTS).map(function(p){
    return '<option value="' + p + '"' + (p === sel ? ' selected' : '') + '>' + PRODUCTS[p].icon + ' ' + p + ' (' + PRODUCTS[p].unit + ')</option>';
  }).join('');
}

function bdRender(){
  var body = document.getElementById('bd-body');
  if(!bdRows.length){
    body.innerHTML = '<tr><td colspan="8"><div class="empty"><span class="icon">📅</span><p>Choose a valid date range and at least one slot</p></div></td></tr>';
  } else {
    body.innerHTML = bdRows.map(function(r, i){
      var wd = new Date(r.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' });
      var slot = r.slot === 'Morning' ? '<span class="badge badge-amber">☀️ Morning</span>' : '<span class="badge badge-purple">🌙 Evening</span>';
      var head = '<tr id="bd-r-' + i + '" class="bd-row' + (r.locked ? ' bd-locked' : (r.include ? '' : ' bd-off')) + '">' +
        '<td><input type="checkbox"' + (r.include ? ' checked' : '') + (r.locked ? ' disabled' : '') + ' onchange="bdEdit(' + i + ',\'include\',this.checked)"></td>' +
        '<td>' + wd + ', ' + fmtDate(r.date) + '</td><td>' + slot + '</td>';
      if(r.locked) return head + '<td colspan="4"><span class="badge badge-green">Already recorded</span> ' + escapeHtml(r.locked) + '</td><td></td></tr>';
      return head +
        '<td><select onchange="bdEdit(' + i + ',\'product\',this.value)">' + bdProdOptions(r.product) + '</select></td>' +
        '<td><input type="number" class="bd-qty" value="' + r.qty + '" step="0.5" min="0" oninput="bdEdit(' + i + ',\'qty\',this.value)"></td>' +
        '<td><input type="number" class="bd-rate" value="' + r.rate + '" step="0.5" min="0" oninput="bdEdit(' + i + ',\'rate\',this.value)"></td>' +
        '<td class="bd-amt" id="bd-amt-' + i + '">' + money(bdAmt(r)) + '</td>' +
        '<td style="white-space:nowrap"><button class="btn-icon" title="Add another product for this date" onclick="bdAddLine(' + i + ')">＋</button>' +
        (r.extra ? ' <button class="btn-icon" title="Remove this line" onclick="bdRemoveLine(' + i + ')">✕</button>' : '') + '</td></tr>';
    }).join('');
  }
  bdUpdateSummary();
}

// Edit a single row in place (no re-render, so inputs keep focus)
function bdEdit(i, field, v){
  var r = bdRows[i];
  if(!r) return;
  var row = document.getElementById('bd-r-' + i);
  if(field === 'include'){
    r.include = !!v;
    if(row) row.classList.toggle('bd-off', !r.include);
  } else if(field === 'product'){
    r.product = v;
    r.rate = PRODUCTS[v] ? PRODUCTS[v].price : 0;
    var rateEl = row && row.querySelector('.bd-rate');
    if(rateEl) rateEl.value = r.rate;
  } else {
    r[field] = parseFloat(v) || 0;
  }
  var amtEl = document.getElementById('bd-amt-' + i);
  if(amtEl) amtEl.textContent = money(bdAmt(r));
  bdUpdateSummary();
}

// Add another product line for the same date + slot
function bdAddLine(i){
  var r = bdRows[i];
  var usedHere = bdRows.filter(function(x){ return x.date === r.date && x.slot === r.slot; }).map(function(x){ return x.product; });
  var product = Object.keys(PRODUCTS).find(function(p){ return usedHere.indexOf(p) === -1; }) || r.product;
  bdRows.splice(i + 1, 0, { date: r.date, slot: r.slot, product: product, qty: 1, rate: PRODUCTS[product].price, include: true, locked: '', extra: true });
  bdRender();
}
function bdRemoveLine(i){ bdRows.splice(i, 1); bdRender(); }

function bdToggleAll(on){
  bdRows.forEach(function(r){ if(!r.locked) r.include = on; });
  bdRender();
}

function bdUpdateSummary(){
  var picked = bdRows.filter(function(r){ return r.include && !r.locked; });
  var skipped = bdRows.filter(function(r){ return r.locked; }).length;
  var total = picked.reduce(function(s, r){ return s + bdAmt(r); }, 0);
  document.getElementById('bd-summary').textContent = picked.length + ' to add' + (skipped ? ' · ' + skipped + ' already recorded (skipped)' : '') + ' · Total';
  document.getElementById('bd-total').textContent = money(total);
  var btn = document.getElementById('bd-save');
  btn.disabled = !picked.length;
  btn.textContent = picked.length ? '✅ Save ' + picked.length + (picked.length === 1 ? ' Delivery' : ' Deliveries') : '✅ Save Deliveries';
}

function saveBackdated(){
  var custId = document.getElementById('bd-customer').value;
  var c = custById(custId);
  if(!c){ toast('Please select a customer', 'err'); return; }
  var picked = bdRows.filter(function(r){ return r.include && !r.locked; });
  if(!picked.length){ toast('Select at least one delivery to save', 'err'); return; }

  // Validate everything before saving anything (all-or-nothing)
  var today = todayStr();
  var taken = {}, seen = {};
  bdCustDeliveries(custId).forEach(function(d){ taken[d.date + '|' + d.slot] = true; });
  for(var i = 0; i < picked.length; i++){
    var r = picked[i], label = fmtDate(r.date) + ' (' + r.slot + ')';
    if(!(r.qty > 0) || !(r.rate > 0)){ toast('Enter a valid quantity and rate for ' + label, 'err'); return; }
    if(r.date > today){ toast(label + ' is in the future', 'err'); return; }
    if(taken[r.date + '|' + r.slot]){ toast(label + ' already has a delivery — please reselect the range', 'err'); return; }
    var k = r.date + '|' + r.slot + '|' + r.product;
    if(seen[k]){ toast('Duplicate ' + r.product + ' line for ' + label, 'err'); return; }
    seen[k] = true;
  }

  var added = picked.map(function(r){
    return normalizeDelivery({ id: uid('DEL'), date: r.date, custId: custId, custName: c.name, slot: r.slot, product: r.product, qty: r.qty, rate: r.rate, amount: bdAmt(r) });
  });
  added.forEach(function(d){ deliveries.push(d); });

  // Keep the Deliveries date filter wide enough to show the new (older) entries
  var dates = added.map(function(d){ return d.date; }).sort();
  var fromEl = document.getElementById('delFilterFrom'), toEl = document.getElementById('delFilterTo');
  if(fromEl && fromEl.value && dates[0] < fromEl.value) fromEl.value = dates[0];
  if(toEl && toEl.value && dates[dates.length-1] > toEl.value) toEl.value = dates[dates.length-1];

  persistLocalOnly();
  appendDeliveriesRemote(added).catch(function(){ toast('Backdated deliveries saved on this device but could not sync to Google Sheets', 'err'); });
  var origin = bdFixedCust;
  closeModal('backdatedModal');
  var totalAmt = sumAmount(added);
  toast('✅ ' + added.length + ' deliveries added for ' + c.name + ' — ' + money(totalAmt), 'ok');
  logActivity('delivery', 'Missed deliveries added: ' + c.name + ' — ' + added.length + ' entries (' + fmtDate(dates[0]) + ' to ' + fmtDate(dates[dates.length-1]) + ') — ' + money(totalAmt));

  refreshAllViews();
  var bf = document.getElementById('billFrom').value, bt = document.getElementById('billTo').value;
  if(bf && bt && (dates[0] < bf || dates[dates.length-1] > bt)){
    toast('Some entries fall outside the selected billing period (' + fmtDate(bf) + ' – ' + fmtDate(bt) + ')', 'warn');
  }
}


// ══════════════════════════════════════════════════════
//  EDIT DELIVERY
// ══════════════════════════════════════════════════════
var editingDelId = null;

function openEditDelivery(id){
  var d = deliveries.find(function(x){ return x.id === id; });
  if(!d) return;
  editingDelId = id;
  document.getElementById('ed-cust').textContent = d.custName + ' (' + d.custId + ')';
  document.getElementById('ed-date').value = d.date;
  document.getElementById('ed-slot').value = d.slot;
  document.getElementById('ed-product').innerHTML = bdProdOptions(d.product);
  document.getElementById('ed-qty').value = d.qty;
  document.getElementById('ed-rate').value = d.rate;
  updateEditAmount();
  openModal('editDelModal');
}
function onEditProductChange(sel){
  if(PRODUCTS[sel.value]) document.getElementById('ed-rate').value = PRODUCTS[sel.value].price;
  updateEditAmount();
}
function updateEditAmount(){
  var q = parseFloat(document.getElementById('ed-qty').value) || 0, r = parseFloat(document.getElementById('ed-rate').value) || 0;
  document.getElementById('ed-amt').textContent = money(round2(q * r));
}
var _savingEdit = false;
async function saveEditedDelivery(){
  if(_savingEdit) return;
  var id = editingDelId;                       // capture: never re-read the global after an await
  var i = deliveries.findIndex(function(x){ return x.id === id; });
  if(i < 0) return;
  var date = document.getElementById('ed-date').value, slot = document.getElementById('ed-slot').value;
  var product = document.getElementById('ed-product').value;
  var qty = parseFloat(document.getElementById('ed-qty').value), rate = parseFloat(document.getElementById('ed-rate').value);
  if(!date){ toast('Please choose a date', 'err'); return; }
  if(!(qty > 0) || !(rate > 0)){ toast('Enter a valid quantity and unit price', 'err'); return; }
  var old = deliveries[i];
  var clash = deliveries.some(function(x){ return x.id !== id && x.custId === old.custId && x.date === date && x.slot === slot && x.product === product; });
  if(clash && !confirm('This customer already has a ' + product + ' delivery on ' + fmtDate(date) + ' (' + slot + '). Save anyway?')) return;

  var updated = normalizeDelivery(Object.assign({}, old, { date: date, slot: slot, product: product, qty: qty, rate: rate, amount: round2(qty * rate) }));

  _savingEdit = true;
  try{
    toast('Saving...', '');
    var res = await updateDeliveryRemote(updated);           // wait for the sheet
    // The backend echoes the row it actually stored. If it differs from what we
    // sent (wrong date / qty), say so instead of silently showing the wrong thing.
    if(res && res.delivery){
      var sd = normDate(res.delivery.date), sq = Number(res.delivery.qty);
      if(sd !== updated.date || sq !== updated.qty){
        console.warn('Server stored different values than sent', { sent: updated, stored: res.delivery });
        toast('Server saved ' + fmtDate(sd) + ', qty ' + sq + ' (not what you entered) - check the sheet', 'warn');
        updated = normalizeDelivery(Object.assign({}, updated, { date: sd, qty: sq }));
      }
    }
    var j = deliveries.findIndex(function(x){ return x.id === id; });   // re-find: array may have changed
    if(j >= 0) deliveries[j] = updated; else deliveries.push(updated);

    var fromEl = document.getElementById('delFilterFrom'), toEl = document.getElementById('delFilterTo');
    if(fromEl && fromEl.value && updated.date < fromEl.value) fromEl.value = updated.date;
    if(toEl && toEl.value && updated.date > toEl.value) toEl.value = updated.date;
    persistLocalOnly();
    closeModal('editDelModal');
    toast('Delivery updated - ' + money(updated.amount), 'ok');
    logActivity('delivery', 'Delivery edited: ' + old.custName + ' (' + fmtDate(updated.date) + ', ' + slot + ') - ' + money(updated.amount));
    refreshAllViews();
  }catch(err){
    console.error('saveEditedDelivery failed', err);
    toast('Edit NOT saved: ' + (err.message || err), 'err');     // local row untouched, modal stays open
  }finally{
    _savingEdit = false;
  }
}