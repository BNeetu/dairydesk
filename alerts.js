// ══════════════════════════════════════════════════════
//  PENDING-DELIVERY ALERTS (for the delivery boy)
//  After the cut-off time (default Morning 08:00, Evening 21:00) every active customer
//  who is due that slot but has NO delivery recorded today is listed on the Dashboard
//  (and in the top bar). One tap opens WhatsApp to the delivery boy with the message
//  already written. A web page cannot send WhatsApp by itself - you press Send.
// ══════════════════════════════════════════════════════
var ALERT_DEFAULTS = { enabled: true, number: '8209756996', morning: '08:00', evening: '21:00' };

function alertCfg(){ return Object.assign({}, ALERT_DEFAULTS, lsGet('dd_alert_cfg', null) || {}); }
function alertStore(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }

function alertDue(slot, cfg){
  var t = String(slot === 'Morning' ? cfg.morning : cfg.evening).split(':'), now = new Date();
  return now.getHours() * 60 + now.getMinutes() >= (parseInt(t[0], 10) || 0) * 60 + (parseInt(t[1], 10) || 0);
}

// Active customers due for this slot (preference = slot or Both) with no delivery recorded on `date`
function pendingDeliveries(slot, date){
  var skip = lsGet('dd_alert_skip_' + date, []);
  return activeCustomers().filter(function(c){
    if(bdDefaultSlots(c, bdCustDeliveries(c.id)).indexOf(slot) === -1) return false;
    if(typeof isPaused === 'function' && isPaused(c.id, date)) return false;   // on pause
    if(c.regDate && c.regDate > date) return false;                          // not a customer yet
    if(skip.indexOf(c.id + '|' + slot) > -1) return false;                   // marked "skip today"
    return !deliveries.some(function(d){ return d.custId === c.id && d.date === date && d.slot === slot; });
  });
}

function pendingMessage(slot, list, date){
  return '\u26A0\uFE0F *Delivery pending \u2014 ' + slot + '* (' + fmtDate(date) + ')\n' +
    'Ab tak in customers ko delivery nahi hui:\n' +
    list.map(function(c, i){ return (i + 1) + '. *' + c.name + '*' + (c.mobile ? ' \u2014 ' + c.mobile : '') + (c.address ? ' \u2014 ' + c.address : ''); }).join('\n') +
    '\nKripya jaldi deliver karein. \u2014 Bhati Farms';
}

function sendPendingWhatsApp(slot){
  var cfg = alertCfg(), date = todayStr(), list = pendingDeliveries(slot, date);
  var num = normalizeWhatsAppNumber(cfg.number);
  if(!num.ok){ toast('Delivery boy number is invalid - fix it in Settings', 'err'); return; }
  if(!list.length){ toast('No pending ' + slot + ' deliveries', 'ok'); renderPendingAlerts(); return; }
  if(!openWhatsAppChat(num.number, pendingMessage(slot, list, date))){ toast('Pop-ups are blocked. Allow pop-ups for this site and try again.', 'warn'); return; }
  alertStore('dd_alert_sent_' + date + '_' + slot, new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
  toast('WhatsApp opened for the delivery boy - press Send', 'ok');
  renderPendingAlerts();
}

function skipPending(custId, slot){
  var k = 'dd_alert_skip_' + todayStr(), l = lsGet(k, []);
  l.push(custId + '|' + slot); alertStore(k, l);
  renderPendingAlerts();
}

function renderPendingAlerts(){
  var box = document.getElementById('pendingAlert'), chip = document.getElementById('pendingChip');
  var cfg = alertCfg(), date = todayStr(), html = '', total = 0;
  if(cfg.enabled && customers.length){
    ['Morning', 'Evening'].forEach(function(slot){
      if(!alertDue(slot, cfg)) return;
      var list = pendingDeliveries(slot, date);
      if(!list.length) return;
      total += list.length;
      var sent = lsGet('dd_alert_sent_' + date + '_' + slot, '');
      html += '<div class="alert-card"><div class="alert-head"><strong>\u26A0\uFE0F ' + slot + ' delivery pending \u2014 ' + list.length + ' customer' + (list.length > 1 ? 's' : '') + '</strong>' +
        '<button class="btn btn-sm" style="background:var(--wa);color:#fff" onclick="sendPendingWhatsApp(\'' + slot + '\')">\uD83D\uDCF2 ' + (sent ? 'Send again' : 'WhatsApp Delivery Boy') + '</button></div>' +
        (sent ? '<div class="alert-sub">\u2705 Message opened at ' + escapeHtml(sent) + '</div>' : '') +
        list.map(function(c){
          return '<div class="alert-row"><span><strong>' + escapeHtml(c.name) + '</strong> <span style="color:var(--gray)">' + escapeHtml(c.mobile || '') + '</span></span>' +
            '<span><button class="btn-icon" title="Add this delivery now" onclick="openDeliveryModal();document.getElementById(\'d-customer\').value=\'' + c.id + '\';document.getElementById(\'d-slot\').value=\'' + slot + '\'">\u2795</button> ' +
            '<button class="btn-icon" title="Skip today (no delivery needed)" onclick="skipPending(\'' + c.id + '\',\'' + slot + '\')">\u23ED\uFE0F</button></span></div>';
        }).join('') + '</div>';
      var tk = 'dd_alert_toast_' + date + '_' + slot;
      if(!localStorage.getItem(tk)){ alertStore(tk, 1); toast('\u26A0\uFE0F ' + slot + ' delivery pending for ' + list.length + ' customer(s)', 'warn'); }
    });
  }
  if(box) box.innerHTML = html;
  if(chip){ chip.textContent = total ? '\u26A0\uFE0F ' + total + ' pending' : ''; chip.style.display = total ? 'inline-block' : 'none'; }
}

function renderAlertSettings(){
  var el = document.getElementById('alertSettings');
  if(!el) return;
  var c = alertCfg();
  el.innerHTML =
    '<div class="fg"><label style="display:flex;gap:8px;align-items:center;text-transform:none"><input type="checkbox" id="al-enabled" style="width:auto"' + (c.enabled ? ' checked' : '') + '> Alerts on</label></div>' +
    '<div class="fg"><label>Delivery boy WhatsApp</label><input type="tel" id="al-number" value="' + escapeHtml(c.number) + '"></div>' +
    '<div class="frow"><div class="fg"><label>Morning check at</label><input type="time" id="al-morning" value="' + escapeHtml(c.morning) + '"></div>' +
    '<div class="fg"><label>Evening check at</label><input type="time" id="al-evening" value="' + escapeHtml(c.evening) + '"></div></div>' +
    '<button class="btn btn-primary btn-sm" onclick="saveAlertSettings()">\uD83D\uDCBE Save Alerts</button>' +
    '<p style="font-size:.74rem;color:var(--gray);margin-top:10px">Lists customers (Morning / Evening / Both preference) with no delivery recorded today. Works while this page is open; you press Send in WhatsApp.</p>';
}
function saveAlertSettings(){
  var num = document.getElementById('al-number').value.trim();
  if(!normalizeWhatsAppNumber(num).ok){ toast('Enter a valid WhatsApp number', 'err'); return; }
  alertStore('dd_alert_cfg', { enabled: document.getElementById('al-enabled').checked, number: num,
    morning: document.getElementById('al-morning').value || '08:00', evening: document.getElementById('al-evening').value || '21:00' });
  toast('Alert settings saved \u2713', 'ok');
  renderPendingAlerts();
}

setInterval(function(){
  var shell = document.getElementById('appShell');
  if(shell && shell.style.display !== 'none') renderPendingAlerts();
}, 60000);