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
