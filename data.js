// ══════════════════════════════════════════════════════
//  PRODUCTS & PRICING (single source of truth)
// ══════════════════════════════════════════════════════
// Milk: per litre | Curd: per 500g unit | Buttermilk: per litre | Ghee: per kg
var DEFAULT_PRODUCTS = {
  Milk:       { unit: 'L',    price: 50,   step: 0.5, icon: '🥛' },
  Curd:       { unit: 'unit', price: 60,   step: 1,   icon: '🍶', note:'500g per unit' },
  Buttermilk: { unit: 'L',    price: 30,   step: 0.5, icon: '🥤' },
  Ghee:       { unit: 'kg',   price: 1800, step: 0.25,icon: '✨' },
};
var PRODUCTS = Object.assign({}, DEFAULT_PRODUCTS);
var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function calcAmount(product, qty){
  if(!product || !PRODUCTS[product] || typeof PRODUCTS[product].price !== 'number'){
    return 0;
  }
  return Math.round(PRODUCTS[product].price * qty * 100) / 100;
}

// ══════════════════════════════════════════════════════
//  PERSISTENCE
// ══════════════════════════════════════════════════════
// ═════════════════════════════════════════════════════════════=
//  PERSISTENCE + GOOGLE SHEETS SYNC
// ═════════════════════════════════════════════════════════════=
var SHEETS_API_URL = 'https://script.google.com/macros/s/AKfycbzLqi0-Gr1GkqWpU8Aex4RavawLeALUYlZkBh4-EuMzx0ULk9w0hm3TQQX3FGyJbUPziA/exec';
var SHEETS_ENABLED = !!SHEETS_API_URL && !SHEETS_API_URL.includes('REPLACE');
var SEED_VERSION = 1;

function lsGet(k, def){ try{ var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; }catch(e){ return def; } }
function persistLocalOnly(){
  // Do NOT persist customers to localStorage. Customers are authoritative in Google Sheets.
  // Preserve local caching only for non-customer data where appropriate.
  localStorage.setItem('dd_deliveries', JSON.stringify(deliveries));
  localStorage.setItem('dd_activity', JSON.stringify(activityLog));
  localStorage.setItem('dd_pricing', JSON.stringify(PRODUCTS));
  localStorage.setItem('dd_theme', currentTheme);
}

function sheetRequest(action, payload){
  if(!SHEETS_ENABLED) return Promise.reject(new Error('Google Sheets sync disabled'));
  var params = new URLSearchParams();
  params.append('action', action);
  params.append('payload', JSON.stringify(payload || {}));
  return fetch(SHEETS_API_URL, { method: 'POST', body: params })
    .then(function(res){
      if(!res.ok) return res.text().then(function(text){ throw new Error(text || 'Google Sheets request failed'); });
      return res.json();
    });
}

function loadRemoteState(){
  if(!SHEETS_ENABLED) return Promise.reject(new Error('Google Sheets sync disabled'));
  return fetch(SHEETS_API_URL + '?action=load')
    .then(function(res){
      if(!res.ok) return res.text().then(function(text){ throw new Error(text || 'Google Sheets load failed'); });
      return res.json();
    })
    .then(function(data){
      if(!data || !data.success) throw new Error((data && data.error) || 'Invalid Google Sheets response');
      if(!Array.isArray(data.customers) || !Array.isArray(data.deliveries)){
        console.error('Google Sheets returned invalid remote app data', data);
        throw new Error('Remote app data is invalid');
      }
      customers = data.customers;
      deliveries = data.deliveries;
      activityLog = Array.isArray(data.activityLog) ? data.activityLog : activityLog;
      currentTheme = data.currentTheme || currentTheme;
      if(data.pricing && typeof data.pricing === 'object' && Object.keys(data.pricing).length){
        PRODUCTS = Object.assign({}, DEFAULT_PRODUCTS, data.pricing);
      }
      persistLocalOnly();
      return data;
    });
}

function saveRemoteState(){
  if(!SHEETS_ENABLED) return Promise.reject(new Error('Google Sheets sync disabled'));
  return sheetRequest('save', {
    customers: customers,
    deliveries: deliveries,
    activityLog: activityLog,
    pricing: PRODUCTS,
    currentTheme: currentTheme,
    seedVersion: typeof SEED_VERSION !== 'undefined' ? SEED_VERSION : 1
  }).then(function(data){
    if(!data || !data.success) throw new Error((data && data.error) || 'Google Sheets save failed');
    return data;
  });
}

function loadAppData(){
  if(!SHEETS_ENABLED) return Promise.resolve();
  return loadRemoteState().catch(function(err){
    console.warn('Google Sheets sync unavailable:', err);
    return Promise.resolve();
  });
}

function persist(){
  persistLocalOnly();
  if(SHEETS_ENABLED){
    saveRemoteState().catch(function(err){ console.warn('Google Sheets save failed:', err); });
  }
}

// ---------- Per-customer remote operations ---------
function appendCustomerRemote(cust){
  if(!SHEETS_ENABLED) return Promise.reject(new Error('Google Sheets sync disabled'));
  return sheetRequest('appendCustomer', cust).then(function(res){
    if(!res || !res.success) throw new Error((res && res.error) || 'Append failed');
    return res; // expected to contain new id and row
  });
}

function updateCustomerRemote(cust){
  if(!SHEETS_ENABLED) return Promise.reject(new Error('Google Sheets sync disabled'));
  return sheetRequest('updateCustomer', cust).then(function(res){
    if(!res || !res.success) throw new Error((res && res.error) || 'Update failed');
    return res;
  });
}

function deleteCustomerRemote(custId){
  if(!SHEETS_ENABLED) return Promise.reject(new Error('Google Sheets sync disabled'));
  return sheetRequest('deleteCustomer', { id: custId }).then(function(res){
    if(!res || !res.success) throw new Error((res && res.error) || 'Delete failed');
    return res;
  });
}
function uid(prefix){ return (prefix||'id') + '_' + Date.now().toString(36) + Math.random().toString(36).substr(2,5); }
function todayStr(){ return new Date().toISOString().split('T')[0]; }
// Escape user-entered text (customer names, addresses, notes, etc.) before
// inserting it into innerHTML, so special characters like < > & " ' render
// as plain text instead of breaking markup.
function escapeHtml(str){
  if(str === null || typeof str === 'undefined') return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function fmtDate(d){
  if(!d) return '';
  try{
    // Accept YYYY-MM-DD or full ISO datetime (YYYY-MM-DDTHH:MM:SSZ)
    var s = String(d).split('T')[0];
    var p = s.split('-');
    if(p.length < 3) return String(d);
    return p[2] + '/' + p[1] + '/' + p[0];
  }catch(e){ return String(d); }
}
function fmtDateLong(d){ var dt = new Date(String(d).split('T')[0] + 'T00:00:00'); return dt.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}); }
function money(n){ return '₹' + (Math.round((n||0)*100)/100).toLocaleString('en-IN'); }

// Customers must be loaded from Google Sheets (single source of truth).
var customers = [];
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
// Note: Seed data removed. Customers must be loaded from Google Sheets (single source of truth).

function logActivity(type, msg){
  activityLog.unshift({ type: type, msg: msg, time: Date.now() });
  if(activityLog.length > 30) activityLog = activityLog.slice(0,30);
  persist();
}