// ══════════════════════════════════════════════════════
//  CUSTOMERS MODULE
// ══════════════════════════════════════════════════════
var custPage = 1;
var CUST_PAGE_SIZE = 8;
var editingCustId = null;

function openCustModal(id){
  editingCustId = id || null;
  document.getElementById('custModalTitle').textContent = id ? 'Edit Customer' : 'Add New Customer';
  if(id){
    var c = custById(id);
    document.getElementById('c-name').value = c.name;
    document.getElementById('c-mobile').value = c.mobile;
    document.getElementById('c-addr').value = c.address;
    document.getElementById('c-pref').value = c.pref;
    document.getElementById('c-status').value = c.status;
    document.getElementById('c-regdate').value = c.regDate;
    document.getElementById('c-notes').value = c.notes || '';
  } else {
    ['c-name','c-mobile','c-addr','c-notes'].forEach(function(id){ document.getElementById(id).value = ''; });
    document.getElementById('c-pref').value = 'Morning';
    document.getElementById('c-status').value = 'active';
    document.getElementById('c-regdate').value = todayStr();
  }
  openModal('custModal');
}

async function saveCustomer(){
  var name = document.getElementById('c-name').value.trim();
  var mobile = document.getElementById('c-mobile').value.trim();
  if(!name || !mobile){ toast('Name and mobile number are required!', 'err'); return; }
  if(mobile.replace(/\D/g,'').length < 10){ toast('Enter a valid 10-digit mobile number', 'err'); return; }

  var data = {
    name: name, mobile: mobile,
    address: document.getElementById('c-addr').value.trim(),
    pref: document.getElementById('c-pref').value,
    status: document.getElementById('c-status').value,
    regDate: document.getElementById('c-regdate').value,
    notes: document.getElementById('c-notes').value.trim()
  };
  try{
    var result;
    var isNewCustomer = !editingCustId;
    if(editingCustId){
      var payload = Object.assign({ id: editingCustId }, data);
      toast('Saving changes...', '');
      await updateCustomerRemote(payload);
      toast('Customer updated ✓', 'ok');
      logActivity('customer', 'Updated customer: ' + name);
    } else {
      toast('Adding customer...', '');
      result = await appendCustomerRemote(data);
      toast('✅ New customer added: ' + name, 'ok');
      logActivity('customer', 'New customer added: ' + name);
    }

    // Refresh authoritative data from Google Sheets before closing the modal
    await loadRemoteState();
    if(isNewCustomer){
      custPage = Math.max(1, Math.ceil(customers.length / CUST_PAGE_SIZE));
    }
    renderCustomersTable();
    populateCustomerDropdown();
    closeModal('custModal');
  }catch(err){
    console.error(err);
    toast('Save failed: ' + (err.message || err), 'err');
  }
}

async function toggleCustomerStatus(id){
  var c = custById(id);
  if(!c) return;
  var newStatus = c.status === 'active' ? 'inactive' : 'active';
  try{
    toast('Updating status...', '');
    await updateCustomerRemote(Object.assign({ id: id }, { status: newStatus }));
    // Refresh authoritative data from Google Sheets
    await loadRemoteState();
    toast(c.name + ' marked ' + newStatus, newStatus === 'active' ? 'ok' : '');
    renderCustomersTable();
  }catch(err){
    console.error(err);
    toast('Status update failed: ' + (err.message || err), 'err');
  }
}

async function deleteCustomer(id){
  var c = custById(id);
  if(!c) return;
  if(!confirm('Delete customer "' + c.name + '" and all associated deliveries?')) return;
  try{
    toast('Deleting customer...', '');
    await deleteCustomerRemote(id);
    // Refresh authoritative data from Google Sheets
    await loadRemoteState();
    toast('Customer deleted: ' + c.name, 'err');
    logActivity('customer', 'Deleted customer: ' + c.name);
    renderCustomersTable();
    if(typeof renderDeliveriesTable === 'function') renderDeliveriesTable();
    populateCustomerDropdown();
  }catch(err){
    console.error(err);
    toast('Delete failed: ' + (err.message || err), 'err');
  }
}

function filteredCustomers(){
  var q = (document.getElementById('custSearch').value || '').toLowerCase();
  var statusF = document.getElementById('custStatusFilter').value;
  var prefF = document.getElementById('custPrefFilter').value;
  return customers.filter(function(c){
    var mobile = c.mobile == null ? '' : String(c.mobile);
    var matchQ = !q || c.name.toLowerCase().includes(q) || mobile.includes(q);
    var matchStatus = !statusF || c.status === statusF;
    var matchPref = !prefF || c.pref === prefF;
    return matchQ && matchStatus && matchPref;
  });
}

function renderCustomersTable(){
  var list = filteredCustomers();
  var totalPages = Math.max(1, Math.ceil(list.length / CUST_PAGE_SIZE));
  if(custPage > totalPages) custPage = totalPages;
  var pageList = list.slice((custPage-1)*CUST_PAGE_SIZE, custPage*CUST_PAGE_SIZE);

  var body = document.getElementById('custTableBody');
  if(!pageList.length){
    body.innerHTML = '<tr><td colspan="8"><div class="empty"><span class="icon">👥</span><p>No customers found</p></div></td></tr>';
  } else {
    body.innerHTML = pageList.map(function(c){
      var statusBadge = c.status === 'active' ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-red">Inactive</span>';
      return '<tr>' +
        '<td>' + c.id + '</td>' +
        '<td><strong>' + c.name + '</strong></td>' +
        '<td>' + c.mobile + '</td>' +
        '<td style="max-width:180px;overflow:hidden;text-overflow:ellipsis">' + (c.address||'—') + '</td>' +
        '<td><span class="badge badge-blue">' + c.pref + '</span></td>' +
        '<td>' + statusBadge + '</td>' +
        '<td>' + fmtDate(c.regDate) + '</td>' +
        '<td>' +
          '<button class="btn-icon" onclick="viewCustomer(\'' + c.id + '\')" title="View">👁️</button> ' +
          '<button class="btn-icon" onclick="openCustModal(\'' + c.id + '\')" title="Edit">✏️</button> ' +
          '<button class="btn-icon" onclick="toggleCustomerStatus(\'' + c.id + '\')" title="Toggle Status">' + (c.status==='active'?'🚫':'✅') + '</button> ' +
          '<button class="btn-icon" onclick="deleteCustomer(\'' + c.id + '\')" title="Delete">🗑️</button>' +
        '</td>' +
      '</tr>';
    }).join('');
  }

  var pag = document.getElementById('custPagination');
  var pagHtml = '';
  for(var i = 1; i <= totalPages; i++){
    pagHtml += '<button class="page-btn ' + (i===custPage?'active':'') + '" onclick="custPage=' + i + ';renderCustomersTable()">' + i + '</button>';
  }
  pag.innerHTML = totalPages > 1 ? pagHtml : '';
}

function viewCustomer(id){
  var c = custById(id);
  if(!c) return;
  var custDels = deliveries.filter(function(d){ return d.custId === id; });
  var totalDeliveries = custDels.length;
  var totalAmount = sumAmount(custDels);

  var prodBreak = {};
  custDels.forEach(function(d){
    if(!prodBreak[d.product]) prodBreak[d.product] = { qty:0, amount:0 };
    prodBreak[d.product].qty += d.qty;
    prodBreak[d.product].amount += d.amount;
  });

  var rows = Object.keys(prodBreak).map(function(p){
    var info = PRODUCTS[p];
    return '<div class="bill-row"><span>' + info.icon + ' ' + p + ' (' + prodBreak[p].qty.toFixed(2) + ' ' + info.unit + ')</span><strong>' + money(prodBreak[p].amount) + '</strong></div>';
  }).join('') || '<div class="bill-row"><span style="color:var(--gray)">No deliveries yet</span></div>';

  document.getElementById('viewCustContent').innerHTML =
    '<h2 style="color:var(--primary)">' + c.name + ' <span class="badge badge-blue" style="margin-left:6px">' + c.id + '</span></h2>' +
    '<p style="color:var(--gray);font-size:.85rem;margin-bottom:16px">📍 ' + (c.address||'—') + '</p>' +
    '<div class="frow" style="margin-bottom:14px">' +
      '<div style="background:var(--lgray);border-radius:9px;padding:10px;text-align:center"><div style="font-size:.7rem;color:var(--gray);font-weight:700;text-transform:uppercase">Mobile</div><div style="font-weight:800;margin-top:3px">' + c.mobile + '</div></div>' +
      '<div style="background:var(--lgray);border-radius:9px;padding:10px;text-align:center"><div style="font-size:.7rem;color:var(--gray);font-weight:700;text-transform:uppercase">Preference</div><div style="font-weight:800;margin-top:3px;color:var(--primary)">' + c.pref + '</div></div>' +
    '</div>' +
    '<div class="frow" style="margin-bottom:14px">' +
      '<div style="background:var(--lgray);border-radius:9px;padding:10px;text-align:center"><div style="font-size:.7rem;color:var(--gray);font-weight:700;text-transform:uppercase">Total Deliveries</div><div style="font-weight:800;margin-top:3px">' + totalDeliveries + '</div></div>' +
      '<div style="background:var(--lgray);border-radius:9px;padding:10px;text-align:center"><div style="font-size:.7rem;color:var(--gray);font-weight:700;text-transform:uppercase">Total Billed (All-Time)</div><div style="font-weight:800;margin-top:3px;color:var(--primary)">' + money(totalAmount) + '</div></div>' +
    '</div>' +
    (c.notes ? '<div style="background:#FEF3C7;border-radius:9px;padding:10px 12px;font-size:.82rem;color:#92400E;margin-bottom:14px">📝 ' + c.notes + '</div>' : '') +
    '<div style="font-size:.74rem;font-weight:800;text-transform:uppercase;color:var(--gray);margin-bottom:8px">Product Summary (All-Time)</div>' +
    '<div style="display:flex;flex-direction:column;gap:5px;margin-bottom:6px">' + rows + '</div>';

  openModal('viewCustModal');
}
