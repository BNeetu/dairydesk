// ══════════════════════════════════════════════════════
//  SETTINGS MODULE
// ══════════════════════════════════════════════════════
function renderSettings(){
  var el = document.getElementById('pricingSettings');
  el.innerHTML = Object.keys(PRODUCTS).map(function(p){
    var info = PRODUCTS[p];
    return '<div class="fg" style="display:flex;align-items:center;gap:10px;margin-bottom:10px">' +
      '<span style="font-size:1.3rem;width:30px">' + info.icon + '</span>' +
      '<div style="flex:1"><label style="margin-bottom:2px">' + p + ' (₹ per ' + info.unit + ')</label>' +
      '<input type="number" value="' + info.price + '" onchange="updatePrice(\'' + p + '\', this.value)"></div>' +
    '</div>';
  }).join('') +
  '<button class="btn btn-primary btn-sm" style="margin-top:6px" onclick="toast(\'Pricing saved ✓\',\'ok\')">💾 Save Pricing</button>' +
  '<p style="font-size:.74rem;color:var(--gray);margin-top:10px">Note: Curd is priced per 500g unit, Milk &amp; Buttermilk per litre, Ghee per kg.</p>';

  document.getElementById('settingsTheme').value = currentTheme;
}

function updatePrice(product, val){
  var p = parseFloat(val);
  if(isNaN(p) || p <= 0) return;
  PRODUCTS[product].price = p;
  persist();
}

function exportFullBackup(){
  var wb = XLSX.utils.book_new();

  var custData = customers.length ? customers.map(function(c){
    return { ID: c.id, Name: c.name, Mobile: c.mobile, Address: c.address, Preference: c.pref, Status: c.status, RegDate: c.regDate, Notes: c.notes };
  }) : [{Note:'No customers'}];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(custData), 'Customers');

  var delData = deliveries.length ? deliveries.map(function(d){
    return { ID: d.id, Date: d.date, CustID: d.custId, Customer: d.custName, Slot: d.slot, Product: d.product, Qty: d.qty, Amount: d.amount };
  }) : [{Note:'No deliveries'}];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(delData), 'Deliveries');

  var pricingData = Object.keys(PRODUCTS).map(function(p){
    var info = PRODUCTS[p];
    return { Product: p, Unit: info.unit, Price: info.price, Step: info.step, Note: info.note || '' };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pricingData), 'Pricing');

  XLSX.writeFile(wb, 'DairyDesk_FullBackup_' + todayStr() + '.xlsx');
  toast('Excel Backup downloaded!', 'ok');
}
