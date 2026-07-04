// Code.gs — Google Apps Script Web App for DairyDesk
// Set the spreadsheet ID to the Google Sheet you shared
var SPREADSHEET_ID = '1RCQ6S38hhsMKUm1C3k8hgj_juLdnONljMsAlKzlPadk';
var SHEET_CUSTOMERS = 'Customers';
var SHEET_DELIVERIES = 'Deliveries';
var SHEET_ACTIVITY = 'Activity';
var SHEET_PRICING = 'Pricing';

// Optional simple API key protection. If empty, no key is required.
var API_KEY = ''; // set to a secret string before deployment for write protection

var CUSTOMER_HEADERS = ['id','name','mobile','address','pref','status','regDate','notes'];
var DELIVERY_HEADERS = ['id','date','custId','custName','slot','product','qty','amount'];
var ACTIVITY_HEADERS = ['type','msg','time'];
var PRICING_HEADERS = ['product','unit','price','step','note'];

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
  try{
    // Protect write actions with API key if configured
    if(API_KEY && ['appendCustomer','updateCustomer','deleteCustomer','appendDelivery','updateDelivery','deleteDelivery','save'].indexOf(action) !== -1){
      if(!payload || payload.key !== API_KEY) return jsonResponse({ success:false, error:'Invalid API key' });
    }

    switch(action){
      case 'appendCustomer': return appendCustomer(payload);
      case 'updateCustomer': return updateCustomer(payload);
      case 'deleteCustomer': return deleteCustomer(payload && payload.id);
      case 'appendDelivery': return appendDelivery(payload);
      case 'updateDelivery': return updateDelivery(payload);
      case 'deleteDelivery': return deleteDelivery(payload && payload.id);
      case 'save': return saveFullState(payload);
      default: return jsonResponse({ success:false, error:'Unknown POST action' });
    }
  }catch(err){
    return jsonResponse({ success:false, error: String(err) });
  }
}

// ---------- helpers ----------
function jsonResponse(obj){
  var output = ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
  output.setHeader('Access-Control-Allow-Origin', '*');
  output.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  output.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return output;
}

function openSheet(){ return SpreadsheetApp.openById(SPREADSHEET_ID); }

function sheetToObjects(sheetName, headers){
  var ss = openSheet();
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

  return rows.map(function(r){
    var o = {};
    for(var i=0;i<headers.length;i++){
      var value = r[i];
      if(value === ''){
        o[headers[i]] = '';
      } else if(value instanceof Date){
        o[headers[i]] = Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
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
  sh.appendRow(row);
  return jsonResponse({ success:true, id: newId });
}

function updateCustomer(data){
  if(!data || !data.id) return jsonResponse({ success:false, error:'Missing id' });
  var ss = openSheet();
  var sh = ss.getSheetByName(SHEET_CUSTOMERS);
  if(!sh) return jsonResponse({ success:false, error:'Customers sheet missing' });
  var vals = sh.getDataRange().getValues();
  for(var i=1;i<vals.length;i++){
    if(String(vals[i][0]) === String(data.id)){
      var newRow = [
        data.id,
        data.name || vals[i][1] || '',
        data.mobile || vals[i][2] || '',
        data.address || vals[i][3] || '',
        data.pref || vals[i][4] || '',
        data.status || vals[i][5] || '',
        data.regDate || vals[i][6] || '',
        data.notes || vals[i][7] || ''
      ];
      sh.getRange(i+1,1,1,newRow.length).setValues([newRow]);
      return jsonResponse({ success:true, id: data.id });
    }
  }
  return jsonResponse({ success:false, error:'Customer id not found' });
}

function deleteCustomer(id){
  if(!id) return jsonResponse({ success:false, error:'Missing id' });
  var ss = openSheet();
  var sh = ss.getSheetByName(SHEET_CUSTOMERS);
  if(!sh) return jsonResponse({ success:false, error:'Customers sheet missing' });
  var vals = sh.getDataRange().getValues();
  for(var i=vals.length-1;i>=1;i--){
    if(String(vals[i][0]) === String(id)){
      sh.deleteRow(i+1);
    }
  }
  var ds = ss.getSheetByName(SHEET_DELIVERIES);
  if(ds){
    var dvals = ds.getDataRange().getValues();
    for(var j=dvals.length-1;j>=1;j--){
      if(String(dvals[j][2]) === String(id)){
        ds.deleteRow(j+1);
      }
    }
  }
  return jsonResponse({ success:true, id: id });
}

// ---------- Delivery ops (basic) ----------
function appendDelivery(data){
  var ss = openSheet();
  var sh = ss.getSheetByName(SHEET_DELIVERIES) || ss.insertSheet(SHEET_DELIVERIES);
  ensureHeaders(sh, DELIVERY_HEADERS);
  var ids = sheetToObjects(SHEET_DELIVERIES, DELIVERY_HEADERS).map(function(r){ return r.id; });
  var maxNum = ids.reduce(function(m,id){ try{ return Math.max(m, parseInt((id||'').split('-')[1]||0)); }catch(e){return m;} }, 0);
  var newId = data.id || ('DEL-' + String(maxNum+1));
  var row = [
    newId,
    data.date || '',
    data.custId || '',
    data.custName || '',
    data.slot || '',
    data.product || '',
    data.qty || '',
    data.amount || ''
  ];
  sh.appendRow(row);
  return jsonResponse({ success:true, id: newId });
}

function updateDelivery(data){
  if(!data || !data.id) return jsonResponse({ success:false, error:'Missing id' });
  var ss = openSheet();
  var sh = ss.getSheetByName(SHEET_DELIVERIES);
  if(!sh) return jsonResponse({ success:false, error:'Deliveries sheet missing' });
  var vals = sh.getDataRange().getValues();
  for(var i=1;i<vals.length;i++){
    if(String(vals[i][0]) === String(data.id)){
      var newRow = [
        data.id,
        data.date || vals[i][1] || '',
        data.custId || vals[i][2] || '',
        data.custName || vals[i][3] || '',
        data.slot || vals[i][4] || '',
        data.product || vals[i][5] || '',
        data.qty || vals[i][6] || '',
        data.amount || vals[i][7] || ''
      ];
      sh.getRange(i+1,1,1,newRow.length).setValues([newRow]);
      return jsonResponse({ success:true, id: data.id });
    }
  }
  return jsonResponse({ success:false, error:'Delivery id not found' });
}

function deleteDelivery(id){
  if(!id) return jsonResponse({ success:false, error:'Missing id' });
  var ss = openSheet();
  var sh = ss.getSheetByName(SHEET_DELIVERIES);
  if(!sh) return jsonResponse({ success:false, error:'Deliveries sheet missing' });
  var vals = sh.getDataRange().getValues();
  for(var i=vals.length-1;i>=1;i--){
    if(String(vals[i][0]) === String(id)){
      sh.deleteRow(i+1);
    }
  }
  return jsonResponse({ success:true, id: id });
}

// ---------- Save / backup full state (optional) ----------
function saveFullState(payload){
  var ss = openSheet();
  if(payload.customers && Array.isArray(payload.customers)){
    var sh = ss.getSheetByName(SHEET_CUSTOMERS) || ss.insertSheet(SHEET_CUSTOMERS);
    sh.clearContents();
    sh.appendRow(CUSTOMER_HEADERS);
    var rows = payload.customers.map(function(c){
      return [
        c.id || '',
        c.name || '',
        c.mobile || '',
        c.address || '',
        c.pref || '',
        c.status || '',
        c.regDate || '',
        c.notes || ''
      ];
    });
    if(rows.length) sh.getRange(2,1,rows.length,rows[0].length).setValues(rows);
  }
  if(payload.deliveries && Array.isArray(payload.deliveries)){
    var sh2 = ss.getSheetByName(SHEET_DELIVERIES) || ss.insertSheet(SHEET_DELIVERIES);
    sh2.clearContents();
    sh2.appendRow(DELIVERY_HEADERS);
    var drows = payload.deliveries.map(function(d){
      return [
        d.id || '',
        d.date || '',
        d.custId || '',
        d.custName || '',
        d.slot || '',
        d.product || '',
        d.qty || '',
        d.amount || ''
      ];
    });
    if(drows.length) sh2.getRange(2,1,drows.length,drows[0].length).setValues(drows);
  }
  return jsonResponse({ success:true });
}

// ---------- util ----------
function ensureHeaders(sheet, headers){
  var firstRow = sheet.getRange(1,1,1,headers.length).getValues()[0];
  var hasHeaders = headers.every(function(h,i){ return String(firstRow[i]||'').trim() === h; });
  if(hasHeaders) return;

  if(isDataRow(firstRow, headers)){
    sheet.insertRowBefore(1);
    sheet.getRange(1,1,headers.length).setValues([headers]);
    return;
  }

  sheet.clearContents();
  sheet.appendRow(headers);
}
