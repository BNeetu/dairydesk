// Code.gs — Google Apps Script Web App for DairyDesk (corrected)
var SPREADSHEET_ID = '1RCQ6S38hhsMKUm1C3k8hgj_juLdnONljMsAlKzlPadk';
var SHEET_CUSTOMERS = 'Customers';
var SHEET_DELIVERIES = 'Deliveries';
var SHEET_ACTIVITY = 'Activity';
var SHEET_PRICING = 'Pricing';

// Optional simple API key protection. If empty, no key is required.
var API_KEY = '';

var CUSTOMER_HEADERS = ['id','name','mobile','address','pref','status','regDate','notes'];
var DELIVERY_HEADERS = ['id','date','custId','custName','slot','product','qty','amount'];
var ACTIVITY_HEADERS = ['type','msg','time'];
var PRICING_HEADERS = ['product','unit','price','step','note'];

var WRITE_ACTIONS = ['appendCustomer','updateCustomer','deleteCustomer','appendDelivery','updateDelivery','deleteDelivery','save'];

function doGet(e){
  var action = (e.parameter && e.parameter.action) || 'load';
  if(action === 'load'){
    try{
      var customers = sheetToObjects(SHEET_CUSTOMERS, CUSTOMER_HEADERS);
      var deliveries = sheetToObjects(SHEET_DELIVERIES, DELIVERY_HEADERS);
      var activity = sheetToObjects(SHEET_ACTIVITY, ACTIVITY_HEADERS);
      var pricing = sheetToObjects(SHEET_PRICING, PRICING_HEADERS);
      return jsonResponse({ success: true, customers: customers, deliveries: deliveries, activityLog: activity, pricing: objectFromPricing(pricing) });
    }catch(err){
      return jsonResponse({ success:false, error: String(err) });
    }
  }
  return jsonResponse({ success:false, error:'Unknown GET action' });
}

function doPost(e){
  var action = (e.parameter && e.parameter.action) || '';
  var payload = {};
  if(e.parameter && e.parameter.payload){
    try{ payload = JSON.parse(e.parameter.payload); } catch(ex){ payload = {}; }
  }
  var lock = null;
  try{
    if(API_KEY && (WRITE_ACTIONS.indexOf(action) !== -1 || action === 'sendWhatsAppBill' || action === 'uploadBillPDF')){
      if(!payload || payload.key !== API_KEY) return jsonResponse({ success:false, error:'Invalid API key' });
    }
    // One write at a time: row numbers can't shift under a concurrent request.
    if(WRITE_ACTIONS.indexOf(action) !== -1){
      lock = LockService.getScriptLock();
      lock.waitLock(25000);
    }

    switch(action){
      case 'appendCustomer': return appendCustomer(payload);
      case 'updateCustomer': return updateCustomer(payload);
      case 'deleteCustomer': return deleteCustomer(payload && payload.id);
      case 'appendDelivery': return appendDelivery(payload);
      case 'updateDelivery': return updateDelivery(payload);
      case 'deleteDelivery': return deleteDelivery(payload && payload.id);
      case 'save': return saveFullState(payload);
      case 'sendWhatsAppBill': return sendWhatsAppBill(payload);
      case 'uploadBillPDF': return jsonResponse(uploadBillPDF_(payload));
      default: return jsonResponse({ success:false, error:'Unknown POST action' });
    }
  }catch(err){
    return jsonResponse({ success:false, error: String(err && err.message ? err.message : err) });
  }finally{
    if(lock) lock.releaseLock();
  }
}

// ---------- helpers ----------
function jsonResponse(obj){
  var output = ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
  if(typeof output.setHeader === 'function'){
    output.setHeader('Access-Control-Allow-Origin', '*');
    output.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    output.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  return output;
}

function openSheet(){ return SpreadsheetApp.openById(SPREADSHEET_ID); }

// The timezone the SPREADSHEET uses to interpret dates. (Session.getScriptTimeZone()
// can differ from it, which shifted dates by a day.)
function sheetTz(){ return openSheet().getSpreadsheetTimeZone(); }

function dateOut(v, tz){
  if(v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  var s = String(v == null ? '' : v).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0,10) : s;
}

function sheetToObjects(sheetName, headers){
  var ss = openSheet();
  var tz = ss.getSpreadsheetTimeZone();
  var sh = ss.getSheetByName(sheetName);
  if(!sh) return [];
  var vals = sh.getDataRange().getValues();
  if(vals.length < 1) return [];

  var headerRow = vals[0];
  var hasHeaders = headers.every(function(h,i){ return normalizeHeaderCell(headerRow[i]) === normalizeHeaderCell(h); });
  var rows;
  if(hasHeaders){
    rows = vals.slice(1);
  } else if(isDataRow(headerRow, headers)){
    rows = vals;
  } else if(vals.length > 1 && isDataRow(vals[1], headers)){
    rows = vals.slice(1);
  } else {
    return [];
  }

  // skip completely blank rows (they showed up as empty deliveries that could not be edited/deleted)
  if(sheetName === SHEET_CUSTOMERS || sheetName === SHEET_DELIVERIES){
    rows = rows.filter(function(r){ return String(r[0]).trim() !== ''; });
  }

  return rows.map(function(r){
    var o = {};
    for(var i=0;i<headers.length;i++){
      var value = r[i];
      if(value === ''){
        o[headers[i]] = '';
      } else if(value instanceof Date){
        o[headers[i]] = Utilities.formatDate(value, tz, 'yyyy-MM-dd');
      } else {
        o[headers[i]] = value;
      }
    }
    return o;
  });
}

function normalizeHeaderCell(value){
  return String(value || '').trim().toLowerCase().replace(/[\.\s\-_]/g,'');
}

function isDataRow(row, headers){
  if(!Array.isArray(row) || row.length < 1) return false;
  var first = String(row[0] || '').trim();
  if(first.toUpperCase().startsWith('CUST-') || first.toUpperCase().startsWith('DEL-')) return true;
  if(first === '') return false;
  var looksLikeHeader = headers.every(function(h,i){
    return normalizeHeaderCell(row[i]) === normalizeHeaderCell(h);
  });
  return !looksLikeHeader;
}

function objectFromPricing(rows){
  var p = {};
  rows.forEach(function(r){
    p[r.product] = { unit: r.unit, price: Number(r.price), step: Number(r.step), note: r.note || '' };
  });
  return p;
}

// Rows (1-based sheet row numbers) whose id column equals `id`
function findRowsById(sh, id){
  var last = sh.getLastRow();
  if(last < 2) return [];
  var want = String(id).trim(), hits = [];
  sh.getRange(2, 1, last - 1, 1).getValues().forEach(function(r, i){
    if(String(r[0]).trim() === want) hits.push(i + 2);
  });
  return hits;
}

// ---------- Customer operations ----------
function appendCustomer(data){
  var ss = openSheet();
  var sh = ss.getSheetByName(SHEET_CUSTOMERS) || ss.insertSheet(SHEET_CUSTOMERS);
  ensureHeaders(sh, CUSTOMER_HEADERS);
  var ids = sheetToObjects(SHEET_CUSTOMERS, CUSTOMER_HEADERS).map(function(r){ return r.id; });
  var maxNum = ids.reduce(function(m,id){ try{ return Math.max(m, parseInt((id||'').split('-')[1]||0)); }catch(e){return m;} }, 0);
  var newId = data.id || ('CUST-' + String(maxNum+1).padStart(3,'0'));
  var row = [
    newId,
    data.name || '',
    data.mobile || '',
    data.address || '',
    data.pref || '',
    data.status || 'active',
    data.regDate || '',
    data.notes || ''
  ];
  var next = sh.getLastRow() + 1;
  sh.getRange(next, 7).setNumberFormat('@');           // regDate stays plain text
  sh.getRange(next, 1, 1, row.length).setValues([row]);
  return jsonResponse({ success:true, id: newId });
}

function updateCustomer(data){
  if(!data || !data.id) return jsonResponse({ success:false, error:'Missing id' });
  var ss = openSheet();
  var sh = ss.getSheetByName(SHEET_CUSTOMERS);
  if(!sh) return jsonResponse({ success:false, error:'Customers sheet missing' });
  var tz = ss.getSpreadsheetTimeZone();
  var hits = findRowsById(sh, data.id);
  if(!hits.length) return jsonResponse({ success:false, error:'Customer id not found' });
  if(hits.length > 1) return jsonResponse({ success:false, error:'Duplicate customer id: ' + data.id });
  var r = hits[0];
  var cur = sh.getRange(r, 1, 1, CUSTOMER_HEADERS.length).getValues()[0];
  var newRow = [
    data.id,
    data.name || cur[1] || '',
    data.mobile || cur[2] || '',
    data.address || cur[3] || '',
    data.pref || cur[4] || '',
    data.status || cur[5] || '',
    data.regDate || dateOut(cur[6], tz) || '',
    data.notes || cur[7] || ''
  ];
  sh.getRange(r, 7).setNumberFormat('@');
  sh.getRange(r, 1, 1, newRow.length).setValues([newRow]);
  return jsonResponse({ success:true, id: data.id });
}

function deleteCustomer(id){
  if(!id) return jsonResponse({ success:false, error:'Missing id' });
  var ss = openSheet();
  var sh = ss.getSheetByName(SHEET_CUSTOMERS);
  if(!sh) return jsonResponse({ success:false, error:'Customers sheet missing' });
  var vals = sh.getDataRange().getValues();
  for(var i=vals.length-1;i>=1;i--){
    if(String(vals[i][0]).trim() === String(id).trim()){
      sh.deleteRow(i+1);
    }
  }
  var ds = ss.getSheetByName(SHEET_DELIVERIES);
  if(ds){
    var dvals = ds.getDataRange().getValues();
    for(var j=dvals.length-1;j>=1;j--){
      if(String(dvals[j][2]).trim() === String(id).trim()){
        ds.deleteRow(j+1);
      }
    }
  }
  return jsonResponse({ success:true, id: id });
}

// ---------- Delivery operations ----------
// Every delivery is addressed ONLY by its id. Date is stored as TEXT "YYYY-MM-DD".
function cleanDelivery(p){
  var id = String((p && p.id) || '').trim() || ('DEL_' + Utilities.getUuid().replace(/-/g,'').slice(0,10));
  var date = String((p && p.date) || '').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid date: ' + (p && p.date));
  var qty = Number(p.qty);
  if(!(qty > 0)) throw new Error('Invalid quantity: ' + p.qty);
  var amount = Number(p.amount);
  if(!isFinite(amount) || amount < 0) amount = Math.round(qty * (Number(p.rate) || 0) * 100) / 100;
  return { id:id, date:date, custId:String(p.custId||''), custName:String(p.custName||''),
           slot:String(p.slot||''), product:String(p.product||''), qty:qty, amount:amount };
}

function deliveryRowToObj(r, tz){
  return { id:String(r[0]).trim(), date:dateOut(r[1], tz), custId:String(r[2]), custName:String(r[3]),
           slot:String(r[4]), product:String(r[5]), qty:Number(r[6])||0, amount:Number(r[7])||0 };
}

function appendDelivery(data){
  var d = cleanDelivery(data);
  var ss = openSheet();
  var sh = ss.getSheetByName(SHEET_DELIVERIES) || ss.insertSheet(SHEET_DELIVERIES);
  ensureHeaders(sh, DELIVERY_HEADERS);
  if(findRowsById(sh, d.id).length) return jsonResponse({ success:true, id:d.id, duplicate:true }); // retry-safe
  var next = sh.getLastRow() + 1;
  sh.getRange(next, 2).setNumberFormat('@');
  sh.getRange(next, 1, 1, DELIVERY_HEADERS.length).setValues([[d.id,d.date,d.custId,d.custName,d.slot,d.product,d.qty,d.amount]]);
  SpreadsheetApp.flush();
  return jsonResponse({ success:true, id:d.id, row:next });
}

function updateDelivery(data){
  if(!data || !data.id) return jsonResponse({ success:false, error:'Missing id' });
  var d = cleanDelivery(data);
  var ss = openSheet();
  var sh = ss.getSheetByName(SHEET_DELIVERIES);
  if(!sh) return jsonResponse({ success:false, error:'Deliveries sheet missing' });
  var hits = findRowsById(sh, d.id);
  if(hits.length === 0) return jsonResponse({ success:false, error:'Delivery not found in sheet: ' + d.id });
  if(hits.length > 1) return jsonResponse({ success:false, error:'Duplicate delivery id (' + d.id + ') - run repairDeliveryIds()' });
  var r = hits[0];
  sh.getRange(r, 2).setNumberFormat('@');
  sh.getRange(r, 1, 1, DELIVERY_HEADERS.length).setValues([[d.id,d.date,d.custId,d.custName,d.slot,d.product,d.qty,d.amount]]);
  SpreadsheetApp.flush();
  var stored = sh.getRange(r, 1, 1, DELIVERY_HEADERS.length).getValues()[0];
  return jsonResponse({ success:true, id:d.id, row:r, delivery: deliveryRowToObj(stored, ss.getSpreadsheetTimeZone()) });
}

function deleteDelivery(id){
  if(!id) return jsonResponse({ success:false, error:'Missing id' });
  var ss = openSheet();
  var sh = ss.getSheetByName(SHEET_DELIVERIES);
  if(!sh) return jsonResponse({ success:false, error:'Deliveries sheet missing' });
  var hits = findRowsById(sh, id);
  // Old code returned success:true here even when nothing was deleted -> row reappeared on refresh.
  if(hits.length === 0) return jsonResponse({ success:false, error:'Delivery not found in sheet: ' + id });
  if(hits.length > 1) return jsonResponse({ success:false, error:'Duplicate delivery id (' + id + ') - run repairDeliveryIds()' });
  sh.deleteRow(hits[0]);
  SpreadsheetApp.flush();
  return jsonResponse({ success:true, id:id, deletedRow:hits[0] });
}

// ---------- Save / backup full state ----------
// Only customers are written here. Deliveries are NEVER touched by a full-state save.
function saveFullState(payload){
  var ss = openSheet();
  // An empty list means "the browser has nothing loaded", not "delete everyone".
  if(payload.customers && Array.isArray(payload.customers) && payload.customers.length){
    var sh = ss.getSheetByName(SHEET_CUSTOMERS) || ss.insertSheet(SHEET_CUSTOMERS);
    sh.clearContents();
    sh.appendRow(CUSTOMER_HEADERS);
    var rows = payload.customers.map(function(c){
      return [c.id || '', c.name || '', c.mobile || '', c.address || '', c.pref || '', c.status || '', c.regDate || '', c.notes || ''];
    });
    sh.getRange(2, 7, rows.length, 1).setNumberFormat('@');
    sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
  return jsonResponse({ success:true });
}

// ---------- util ----------
// Never clears the sheet. (The old version called clearContents() when the header row
// didn't match exactly, which could wipe every delivery.)
function ensureHeaders(sheet, headers){
  if(sheet.getLastRow() === 0){
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }
  var firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  var matches = headers.every(function(h,i){ return normalizeHeaderCell(firstRow[i]) === normalizeHeaderCell(h); });
  if(matches) return;
  if(/^(CUST|DEL)[-_]/i.test(String(firstRow[0] || '').trim())){   // row 1 is real data, no header row yet
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

// ---------- ONE-TIME CLEANUP: run each once from the Apps Script editor ----------
// Gives every blank or duplicated delivery id a fresh unique id.
function repairDeliveryIds(){
  var sh = openSheet().getSheetByName(SHEET_DELIVERIES);
  if(!sh || sh.getLastRow() < 2) return;
  var rng = sh.getRange(2, 1, sh.getLastRow() - 1, 1), vals = rng.getValues(), seen = {}, fixed = 0;
  vals.forEach(function(r){
    var id = String(r[0]).trim();
    if(!id || seen[id]){ id = 'DEL_' + Utilities.getUuid().replace(/-/g,'').slice(0,10); r[0] = id; fixed++; }
    seen[id] = true;
  });
  rng.setValues(vals);
  Logger.log('Repaired ' + fixed + ' delivery id(s)');
}

// Converts existing Date cells in the Deliveries date column to plain "YYYY-MM-DD" text.
function convertDateColumnToText(){
  var ss = openSheet(), sh = ss.getSheetByName(SHEET_DELIVERIES), tz = ss.getSpreadsheetTimeZone();
  if(!sh || sh.getLastRow() < 2) return;
  var rng = sh.getRange(2, 2, sh.getLastRow() - 1, 1);
  var out = rng.getValues().map(function(r){ return [dateOut(r[0], tz)]; });
  rng.setNumberFormat('@');
  rng.setValues(out);
  Logger.log('Converted ' + out.length + ' date cell(s) to text');
}


// ══════════════════════════════════════════════════════
//  WHATSAPP CLOUD API  (only used when WHATSAPP_MODE = 'api' in billing.js)
//
//  Credentials are read from Script properties, never from the browser:
//    Apps Script editor -> Project Settings (gear) -> Script properties -> Add:
//      WA_ACCESS_TOKEN      permanent System User token from Meta
//      WA_PHONE_NUMBER_ID   the sending phone number's ID
//      WA_TEMPLATE_NAME     (recommended) an APPROVED template, see below
//      WA_TEMPLATE_LANG     (optional, default 'en')
//      WA_API_VERSION       (optional, default 'v20.0')
//
//  WhatsApp rule: a business may only send FREE-FORM text to a customer who messaged
//  the business in the last 24 hours. Otherwise Meta requires an approved TEMPLATE.
//  Without WA_TEMPLATE_NAME this sends free-form text (may not be delivered outside
//  the 24h window). With it, the template BODY must have exactly 5 variables:
//     {{1}} customer name  {{2}} period  {{3}} total quantity  {{4}} total amount  {{5}} delivery count
//
//  Safety: the destination number is ALWAYS the customer's number stored in the
//  Customers sheet (a number sent by the browser is ignored), and each customer can
//  receive at most one bill per minute.
//  "success" means Meta ACCEPTED the message, not that it reached the phone.
// ══════════════════════════════════════════════════════
function waNormalizeNumber_(raw){
  var s = String(raw == null ? '' : raw).trim();
  if(!s) return '';
  var plus = s.charAt(0) === '+';
  var d = s.replace(/\D/g, '');
  if(!d) return '';
  if(plus || d.slice(0,2) === '00'){
    if(d.slice(0,2) === '00') d = d.slice(2);
    return (d.length >= 10 && d.length <= 15 && d.charAt(0) !== '0') ? d : '';
  }
  if(d.length === 10 && /^[6-9]/.test(d)) return '91' + d;
  if(d.length === 11 && d.charAt(0) === '0' && /^[6-9]/.test(d.slice(1))) return '91' + d.slice(1);
  if(d.length === 12 && d.slice(0,2) === '91' && /^[6-9]/.test(d.slice(2))) return d;
  return '';
}

function waParam_(v){   // template variables may not contain newlines/tabs
  return String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, 200) || '-';
}

function sendWhatsAppBill(data){
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('WA_ACCESS_TOKEN');
  var phoneId = props.getProperty('WA_PHONE_NUMBER_ID');
  if(!token || !phoneId) return jsonResponse({ success:false, error:'WhatsApp API is not configured on the server' });

  var custId = String((data && data.custId) || '').trim();
  var cust = sheetToObjects(SHEET_CUSTOMERS, CUSTOMER_HEADERS).filter(function(c){ return String(c.id).trim() === custId; })[0];
  if(!cust) return jsonResponse({ success:false, error:'Customer not found' });

  var to = waNormalizeNumber_(cust.mobile);
  if(!to) return jsonResponse({ success:false, error:'Customer mobile number is not available or invalid' });

  var text = String((data && data.text) || '').trim();
  if(!text) return jsonResponse({ success:false, error:'Bill text is empty' });
  text = text.slice(0, 3800);

  var cache = CacheService.getScriptCache(), key = 'wa_last_' + custId;
  if(cache.get(key)) return jsonResponse({ success:false, error:'A bill was just sent to this customer. Please wait a minute.' });

  var template = props.getProperty('WA_TEMPLATE_NAME');
  var body;
  if(template){
    var t = (data && data.tpl) || {};
    body = { messaging_product:'whatsapp', to:to, type:'template', template:{
      name: template, language:{ code: props.getProperty('WA_TEMPLATE_LANG') || 'en' },
      components:[{ type:'body', parameters:[t.name, t.period, t.qty, t.amount, t.count].map(function(v){ return { type:'text', text: waParam_(v) }; }) }]
    }};
  } else {
    body = { messaging_product:'whatsapp', to:to, type:'text', text:{ preview_url:false, body:text } };
  }

  var url = 'https://graph.facebook.com/' + (props.getProperty('WA_API_VERSION') || 'v20.0') + '/' + phoneId + '/messages';
  var res = UrlFetchApp.fetch(url, {
    method:'post', contentType:'application/json', headers:{ Authorization:'Bearer ' + token },
    payload: JSON.stringify(body), muteHttpExceptions:true
  });
  var code = res.getResponseCode(), json = {};
  try{ json = JSON.parse(res.getContentText()); }catch(e){}
  if(code >= 200 && code < 300 && json.messages && json.messages.length){
    cache.put(key, '1', 60);
    return jsonResponse({ success:true, id: json.messages[0].id });
  }
  return jsonResponse({ success:false, error: (json.error && json.error.message) || ('WhatsApp API error (HTTP ' + code + ')') });
}
/**
 * OPTIONAL — only needed if you set  WHATSAPP_MODE = 'api'  in billing.js.
 * It lets the app send the PDF bill straight to the customer's WhatsApp number,
 * with no tapping in WhatsApp. It needs a WhatsApp Business (Cloud API) account.
 *
 * NOTE: written against Meta's documented Cloud API but NOT tested against a live
 * account (that needs your credentials). Test it with your own number first.
 *
 * SETUP
 * 1. Paste this function into your Apps Script project (next to your existing Code.gs).
 * 2. In your doPost action switch add:
 *        case 'sendWhatsAppBillPDF': return json_(sendWhatsAppBillPDF_(payload));
 *    (use whatever your existing JSON-response helper is called).
 * 3. Project Settings -> Script properties, add:
 *        WA_TOKEN            permanent access token from Meta
 *        WA_PHONE_NUMBER_ID  the WhatsApp phone-number ID
 *        WA_TEMPLATE_NAME    (optional) approved template that has a DOCUMENT header and
 *                            3 body variables: {{1}} customer name, {{2}} period, {{3}} amount
 *        WA_TEMPLATE_LANG    (optional) template language code, default "en"
 * 4. Redeploy the web app (new version).
 *
 * WhatsApp rule: a plain document message is only delivered if the customer wrote to your
 * number in the last 24 hours. Otherwise WhatsApp requires an approved template — that is
 * what WA_TEMPLATE_NAME is for.
 */
function sendWhatsAppBillPDF_(p) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('WA_TOKEN'), phoneId = props.getProperty('WA_PHONE_NUMBER_ID');
  if (!token || !phoneId) return { success: false, error: 'WhatsApp API is not configured (WA_TOKEN / WA_PHONE_NUMBER_ID)' };
  if (!p || !p.pdfBase64 || !p.to) return { success: false, error: 'Missing PDF or phone number' };

  var base = 'https://graph.facebook.com/v20.0/' + phoneId;
  var pdf = Utilities.newBlob(Utilities.base64Decode(p.pdfBase64), 'application/pdf', p.filename || 'bill.pdf');

  // 1) upload the PDF
  var up = UrlFetchApp.fetch(base + '/media', {
    method: 'post', headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true,
    payload: { messaging_product: 'whatsapp', type: 'application/pdf', file: pdf }
  });
  var upJson = JSON.parse(up.getContentText() || '{}');
  if (!upJson.id) return { success: false, error: 'Media upload failed: ' + up.getContentText() };

  function send(body) {
    var r = UrlFetchApp.fetch(base + '/messages', {
      method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify(body), muteHttpExceptions: true
    });
    return { ok: r.getResponseCode() >= 200 && r.getResponseCode() < 300, text: r.getContentText() };
  }

  // 2) send as a document (works inside the 24h customer-service window)
  var res = send({ messaging_product: 'whatsapp', to: p.to, type: 'document',
                   document: { id: upJson.id, filename: p.filename || 'bill.pdf', caption: p.caption || '' } });
  if (res.ok) return { success: true };

  // 3) outside the window: approved template with a document header
  var tpl = props.getProperty('WA_TEMPLATE_NAME');
  if (!tpl) return { success: false, error: 'WhatsApp rejected the message: ' + res.text };
  var t = p.tpl || {};
  var txt = function (v) { return { type: 'text', text: String(v || '-') }; };
  res = send({ messaging_product: 'whatsapp', to: p.to, type: 'template', template: {
    name: tpl, language: { code: props.getProperty('WA_TEMPLATE_LANG') || 'en' },
    components: [
      { type: 'header', parameters: [{ type: 'document', document: { id: upJson.id, filename: p.filename || 'bill.pdf' } }] },
      { type: 'body', parameters: [txt(t.name), txt(t.period), txt(t.amount)] }
    ] } });
  return res.ok ? { success: true } : { success: false, error: 'WhatsApp template send failed: ' + res.text };
}
/**
 * Bhati Farms - "WhatsApp Bill" PDF link
 * Saves the bill PDF to Google Drive and returns a link that is put in the WhatsApp message.
 *
 * SETUP (2 minutes):
 *  1. Open your Apps Script project (the one behind SHEETS_API_URL) and paste this whole file
 *     in as a new file, e.g. "whatsapp_bill_link.gs".
 *  2. In your EXISTING doPost(e), add these lines at the very top:
 *
 *        if (e && e.parameter && e.parameter.action === 'uploadBillPDF') {
 *          return handleUploadBillPDF(e);
 *        }
 *
 *  3. Deploy > Manage deployments > pencil icon > Version: "New version" > Deploy.
 *     (Keep the same deployment so the web-app URL does not change.)
 *  4. The first time, Google asks you to authorise Drive access - accept it.
 *     If it does not ask, run uploadBillPDF_ once from the editor to trigger the prompt.
 *
 * NOTE: files are shared as "anyone with the link can view". The link is long and unguessable,
 * but anyone the customer forwards it to can open the bill.
 */
var BILL_FOLDER_NAME = 'Bhati Farms Bills';

function handleUploadBillPDF(e) {
  var out;
  try {
    var payload = JSON.parse((e.parameter && e.parameter.payload) || '{}');
    out = uploadBillPDF_(payload);
  } catch (err) {
    out = { success: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

function uploadBillPDF_(p) {
  if (!p || !p.pdfBase64) throw new Error('No PDF received');
  var name = String(p.filename || 'Invoice.pdf').replace(/[^\w.\- ]+/g, '_');
  var blob = Utilities.newBlob(Utilities.base64Decode(p.pdfBase64), 'application/pdf', name);
  var it = DriveApp.getFoldersByName(BILL_FOLDER_NAME);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(BILL_FOLDER_NAME);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { success: true, id: file.getId(), url: 'https://drive.google.com/file/d/' + file.getId() + '/view' };
}