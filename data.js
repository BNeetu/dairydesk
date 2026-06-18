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
//  SEED DATA — Comprehensive Real Dataset
// ══════════════════════════════════════════════════════
function buildSeedData(){
  var rawData = [];

  function add(n, d, q, t){ rawData.push({ n:n, d:'2026-06-'+String(d).padStart(2,'0'), q:q, t:t }); }
  function range(n, s, e, q, t){ for(var i=s; i<=e; i++) add(n, i, q, t); }

  // Vansh
  range('Vansh', 1, 3, 2, 'Morning');
  add('Vansh', 4, 2, 'Morning'); add('Vansh', 4, 0.5, 'Evening');
  range('Vansh', 5, 6, 2, 'Morning');

  // Kunal
  range('Kunal', 1, 5, 2, 'Evening');
  add('Kunal', 1, 2.5, 'Evening'); // Previous record had 2.5 on 1st, kept for accuracy

  // Vishal
  range('Vishal', 2, 5, 1, 'Morning');
  range('Vishal', 6, 17, 1, 'Evening');

  // Vivek
  range('Vivek', 3, 5, 1, 'Morning');
  range('Vivek', 6, 16, 1, 'Evening');

  // Rahul
  add('Rahul', 3, 1, 'Morning');
  range('Rahul', 4, 17, 1, 'Evening');

  // Rahul Chouhan
  [3,4,6,7,8,9,10,13,14,15,16,17,18].forEach(function(d){ add('Rahul Chouhan', d, 1, 'Morning'); });

  // Abhishek
  add('Abhishek', 3, 1, 'Morning');
  range('Abhishek', 4, 8, 1, 'Evening');
  range('Abhishek', 10, 17, 1, 'Morning'); range('Abhishek', 10, 17, 1, 'Evening'); // Split 2L Morning+Evening

  // Arjun
  range('Arjun', 1, 18, 1, 'Morning');

  // Banvedya
  range('Banvedya', 14, 16, 2, 'Evening');

  // Lokesh
  add('Lokesh', 7, 2, 'Evening');
  range('Lokesh', 8, 16, 1, 'Morning'); range('Lokesh', 8, 16, 1, 'Evening'); // Split 2L Morning & Evening
  add('Lokesh', 17, 4, 'Morning');
  add('Lokesh', 18, 1, 'Morning');

  // Ghanshyam
  add('Ghanshyam', 17, 1, 'Evening');
  add('Ghanshyam', 18, 1, 'Morning');

  // Pradeep Choudhary
  add('Pradeep Choudhary', 17, 1, 'Morning');

  // Previous Demo Data (kept if not overlapping)
  add('Sumit Yash', 2, 2, 'Morning');
  add('Arpan', 2, 1, 'Morning'); add('Arpan', 3, 1, 'Morning'); add('Arpan', 4, 1, 'Morning'); add('Arpan', 5, 1, 'Evening');
  add('Vikku', 3, 1, 'Morning'); add('Vikku', 4, 1, 'Evening'); add('Vikku', 5, 1, 'Evening');
  add('Kanu', 3, 1, 'Morning'); add('Kanu', 4, 1, 'Evening'); add('Kanu', 5, 1, 'Evening');
  add('Rahul Vishal', 3, 1, 'Morning');
  add('Rahul RC', 4, 1, 'Morning');
  add('Rahul Bhai', 4, 1, 'Evening');

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

// Force reseed v3 — includes expanded real dataset
var SEED_VERSION = 'v3';
if(!customers || !deliveries || lsGet('dd_seed_ver','') !== SEED_VERSION){
  localStorage.removeItem('dd_customers');
  localStorage.removeItem('dd_deliveries');
  localStorage.removeItem('dd_activity');
  var seed = buildSeedData();
  customers  = seed.custs;
  deliveries = seed.dels;
  activityLog = [{ type:'system', msg:'Full June 2026 dataset loaded', time: Date.now() }];
  localStorage.setItem('dd_seed_ver', JSON.stringify(SEED_VERSION));
  persist();
}

function logActivity(type, msg){
  activityLog.unshift({ type: type, msg: msg, time: Date.now() });
  if(activityLog.length > 30) activityLog = activityLog.slice(0,30);
  persist();
}
