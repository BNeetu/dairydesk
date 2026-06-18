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
  div.innerHTML =
    '<select class="prow-product" onchange="updateDeliveryTotal()">' + prodOptions + '</select>' +
    '<input type="number" class="prow-qty" value="1" step="0.5" min="0.5" oninput="updateDeliveryTotal()" placeholder="Qty">' +
    '<span class="row-amt" id="' + rid + '_amt">₹0</span>' +
    '<button class="row-del" onclick="document.getElementById(\'' + rid + '\').remove();updateDeliveryTotal()">×</button>';
  document.getElementById('d-productRows').appendChild(div);
  updateDeliveryTotal();
}

function updateDeliveryTotal(){
  var rows = document.querySelectorAll('#d-productRows .prod-row');
  var total = 0;
  rows.forEach(function(row){
    var product = row.querySelector('.prow-product').value;
    var qty = parseFloat(row.querySelector('.prow-qty').value) || 0;
    var amt = calcAmount(product, qty);
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
    if(qty <= 0) return;
    var amount = calcAmount(product, qty);
    var del = {
      id: uid('DEL'),
      date: date, custId: custId, custName: c.name,
      slot: slot, product: product, qty: qty, amount: amount
    };
    deliveries.push(del);
    added.push(del);
  });

  if(!added.length){ toast('Enter a valid quantity for at least one product', 'err'); return; }

  persist();
  closeModal('deliveryModal');
  var totalAmt = sumAmount(added);
  toast('✅ Delivery recorded for ' + c.name + ' — ' + money(totalAmt), 'ok');
  logActivity('delivery', 'Delivery recorded: ' + c.name + ' (' + slot + ') — ' + money(totalAmt));
  renderDeliveriesTable();
  if(document.getElementById('page-dashboard').classList.contains('active')) renderDashboard();
}

function deleteDelivery(id){
  if(!confirm('Delete this delivery record?')) return;
  deliveries = deliveries.filter(function(d){ return d.id !== id; });
  persist();
  toast('Delivery deleted', 'err');
  renderDeliveriesTable();
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
      var info = PRODUCTS[d.product];
      var slotBadge = d.slot === 'Morning' ? '<span class="badge badge-amber">☀️ Morning</span>' : '<span class="badge badge-purple">🌙 Evening</span>';
      return '<tr>' +
        '<td>' + fmtDate(d.date) + '</td>' +
        '<td><strong>' + d.custName + '</strong></td>' +
        '<td>' + slotBadge + '</td>' +
        '<td>' + info.icon + ' ' + d.product + '</td>' +
        '<td>' + d.qty + ' ' + info.unit + '</td>' +
        '<td style="font-weight:800;color:var(--primary)">' + money(d.amount) + '</td>' +
        '<td><button class="btn-icon" onclick="deleteDelivery(\'' + d.id + '\')" title="Delete">🗑️</button></td>' +
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
