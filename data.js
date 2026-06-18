// ══════════════════════════════════════════════════════
//  PRODUCTS & PRICING (single source of truth)
// ══════════════════════════════════════════════════════
// Milk: per litre | Curd: per 500g unit | Buttermilk: per litre | Ghee: per kg
var PRODUCTS = {
  Milk:       { unit: 'L',    price: 50,   step: 0.5, icon: '🥛' },
  Curd:       { unit: 'unit', price: 60,   step: 1,   icon: '🍶', note:'500g per unit' },
  Buttermilk: { unit: 'L',    price: 30,   step: 0.5, icon: '🥤' },
  Ghee:       { unit: 'kg',   price: 1800, step: 0.25,icon: '✨' },
};
var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function calcAmount(product, qty){
  return Math.round(PRODUCTS[product].price * qty * 100) / 100;
}

// ══════════════════════════════════════════════════════
//  PERSISTENCE
// ══════════════════════════════════════════════════════
function lsGet(k, def){ try{ var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; }catch(e){ return def; } }
function persist(){
  localStorage.setItem('dd_customers', JSON.stringify(customers));
  localStorage.setItem('dd_deliveries', JSON.stringify(deliveries));
  localStorage.setItem('dd_activity', JSON.stringify(activityLog));
  localStorage.setItem('dd_pricing', JSON.stringify(PRODUCTS));
  localStorage.setItem('dd_theme', currentTheme);
}
function uid(prefix){ return (prefix||'id') + '_' + Date.now().toString(36) + Math.random().toString(36).substr(2,5); }
function todayStr(){ return new Date().toISOString().split('T')[0]; }
function fmtDate(d){ if(!d) return ''; var p = d.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; }
function fmtDateLong(d){ var dt = new Date(d+'T00:00:00'); return dt.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}); }
function money(n){ return '₹' + (Math.round((n||0)*100)/100).toLocaleString('en-IN'); }

var customers   = lsGet('dd_customers', null);
var deliveries  = lsGet('dd_deliveries', null);
var activityLog = lsGet('dd_activity', []);
var currentTheme = lsGet('dd_theme', 'light');

// ══════════════════════════════════════════════════════
//  SEED DATA — using provided real dataset
// ══════════════════════════════════════════════════════
function buildSeedData(){
  var rawData = [
    { n:'Vansh',       d:'2026-06-01', q:2,   t:'Morning' },
    { n:'Kunal',       d:'2026-06-01', q:2.5, t:'Evening' },
    { n:'Vansh',       d:'2026-06-02', q:2,   t:'Morning' },
    { n:'Sumit Yash',  d:'2026-06-02', q:2,   t:'Morning' },
    { n:'Arpan',       d:'2026-06-02', q:1,   t:'Morning' },
    { n:'Kunal',       d:'2026-06-02', q:2,   t:'Evening' },
    { n:'Vansh',       d:'2026-06-03', q:2,   t:'Morning' },
    { n:'Arpan',       d:'2026-06-03', q:1,   t:'Morning' },
    { n:'Rahul',       d:'2026-06-03', q:1,   t:'Morning' },
    { n:'Vishal',      d:'2026-06-03', q:1,   t:'Morning' },
    { n:'Vikku',       d:'2026-06-03', q:1,   t:'Morning' },
    { n:'Kanu',        d:'2026-06-03', q:1,   t:'Morning' },
    { n:'Rahul Vishal',d:'2026-06-03', q:1,   t:'Morning' },
    { n:'Kunal',       d:'2026-06-03', q:2,   t:'Evening' },
    { n:'Vansh',       d:'2026-06-04', q:2,   t:'Morning' },
    { n:'Arpan',       d:'2026-06-04', q:1,   t:'Morning' },
    { n:'Rahul RC',    d:'2026-06-04', q:1,   t:'Morning' },
    { n:'Vansh',       d:'2026-06-04', q:0.5, t:'Evening' },
    { n:'Kunal',       d:'2026-06-04', q:2,   t:'Evening' },
    { n:'Vishal',      d:'2026-06-04', q:1,   t:'Evening' },
    { n:'Rahul Bhai',  d:'2026-06-04', q:1,   t:'Evening' },
    { n:'Kanu',        d:'2026-06-04', q:1,   t:'Evening' },
    { n:'Vikku',       d:'2026-06-04', q:1,   t:'Evening' },
    { n:'Vansh',       d:'2026-06-05', q:2,   t:'Morning' },
    { n:'Arpan',       d:'2026-06-05', q:1,   t:'Evening' },
    { n:'Vikku',       d:'2026-06-05', q:1,   t:'Evening' },
    { n:'Vishal',      d:'2026-06-05', q:1,   t:'Evening' },
    { n:'Kanu',        d:'2026-06-05', q:1,   t:'Evening' },
    { n:'Rahul',       d:'2026-06-05', q:1,   t:'Evening' },
    { n:'Kunal',       d:'2026-06-05', q:2,   t:'Evening' }
  ];

  var uniqueNames = Array.from(new Set(rawData.map(function(r){ return r.n; })));
  var custs = uniqueNames.map(function(name, i){
    return {
      id: 'CUST-' + String(i+1).padStart(3,'0'),
      name: name,
      mobile: '9' + (800000000 + Math.floor(Math.random()*99999999)),
      address: 'Local Area',
      pref: 'Both',
      status: 'active',
      regDate: '2026-06-01',
      notes: ''
    };
  });

  var dels = rawData.map(function(r, i){
    var c = custs.find(function(cu){ return cu.name === r.n; });
    return {
      id: 'DEL-' + (i+1),
      date: r.d,
      custId: c.id,
      custName: c.name,
      slot: r.t,
      product: 'Milk',
      qty: r.q,
      amount: calcAmount('Milk', r.q)
    };
  });

  return { custs: custs, dels: dels };
}

// Force reseed v2 — clears old cached data and loads corrected dataset
var SEED_VERSION = 'v2';
if(!customers || !deliveries || lsGet('dd_seed_ver','') !== SEED_VERSION){
  localStorage.removeItem('dd_customers');
  localStorage.removeItem('dd_deliveries');
  localStorage.removeItem('dd_activity');
  var seed = buildSeedData();
  customers  = seed.custs;
  deliveries = seed.dels;
  activityLog = [{ type:'system', msg:'Actual June 2026 data loaded', time: Date.now() }];
  localStorage.setItem('dd_seed_ver', JSON.stringify(SEED_VERSION));
  persist();
}

function logActivity(type, msg){
  activityLog.unshift({ type: type, msg: msg, time: Date.now() });
  if(activityLog.length > 30) activityLog = activityLog.slice(0,30);
  persist();
}