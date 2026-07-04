// ══════════════════════════════════════════════════════
//  CHARTS — shared instances so we can destroy/recreate on theme change
// ══════════════════════════════════════════════════════
var chartInstances = {};

function chartColors(){
  var dark = currentTheme === 'dark';
  return {
    text: dark ? '#FFDBBB' : '#5C4B3E',
    grid: dark ? '#4F4339' : '#B09278',
    palette: ['#997E67','#D4A373','#866E5A','#B09278','#5C4B3E','#A98467']
  };
}

function makeChart(canvasId, config){
  var ctx = document.getElementById(canvasId);
  if(!ctx) return;
  if(chartInstances[canvasId]) chartInstances[canvasId].destroy();
  chartInstances[canvasId] = new Chart(ctx, config);
}

function refreshChartsForTheme(){
  // Re-render whichever page is active so charts redraw with new colors
  if(document.getElementById('page-dashboard').classList.contains('active')) renderDashCharts();

}

function baseLineOptions(c){
  return {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{ labels:{ color:c.text } } },
    scales:{
      x:{ ticks:{ color:c.text }, grid:{ color:c.grid } },
      y:{ ticks:{ color:c.text }, grid:{ color:c.grid }, beginAtZero:true }
    }
  };
}

// ── DASHBOARD CHARTS ──────────────────────────────────
function renderDashCharts(){
  var c = chartColors();
  var actualToday = todayStr();
  var latest = latestDataDate();
  var chartDate = actualToday;
  var todayDels = deliveriesOn(actualToday);
  if(!todayDels.length && latest !== actualToday){
    chartDate = latest;
  }

  // Revenue trend - last 14 days
  var labels = [], revData = [];
  for(var i = 13; i >= 0; i--){
    var d = new Date(); d.setDate(d.getDate() - i);
    var ds = d.toISOString().split('T')[0];
    labels.push(d.toLocaleDateString('en-IN', {day:'numeric', month:'short'}));
    revData.push(sumAmount(deliveriesOn(ds)));
  }
  var hasRevenue = revData.some(function(v){ return v > 0; });
  var lineOptions = baseLineOptions(c);
  lineOptions.plugins.title = {
    display: !hasRevenue,
    text: 'No revenue recorded for the last 14 days',
    color: c.text,
    font: { size: 14 }
  };
  lineOptions.plugins.tooltip = { enabled: hasRevenue };
  makeChart('chartRevTrend', {
    type:'line',
    data:{ labels:labels, datasets:[{ label:'Revenue (₹)', data:revData, borderColor:c.palette[0], backgroundColor:c.palette[0]+'22', tension:.35, fill:true, pointRadius: hasRevenue ? 3 : 0 }] },
    options: lineOptions
  });

  // Today / latest day morning vs evening
  var dayDels = deliveriesOn(chartDate);
  var mAmt = sumAmount(dayDels.filter(function(d){ return d.slot === 'Morning'; }));
  var eAmt = sumAmount(dayDels.filter(function(d){ return d.slot === 'Evening'; }));
  var hasShiftData = (mAmt + eAmt) > 0;
  makeChart('chartTodaySlot', {
    type:'doughnut',
    data:{ labels:['Morning','Evening'], datasets:[{ data:[mAmt, eAmt], backgroundColor:[c.palette[2], c.palette[4]] }] },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{
        title:{ display: !hasShiftData, text: 'No morning/evening deliveries for ' + (chartDate === actualToday ? 'today' : fmtDate(chartDate)), color: c.text, font: { size: 14 } },
        legend:{ position:'bottom', labels:{ color:c.text } },
        tooltip:{ enabled: hasShiftData }
      }
    }
  });
}


