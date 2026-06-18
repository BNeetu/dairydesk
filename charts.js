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
  if(document.getElementById('page-analytics').classList.contains('active')) renderAnalytics();
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

  // Revenue trend - last 14 days
  var labels = [], revData = [];
  for(var i = 13; i >= 0; i--){
    var d = new Date(); d.setDate(d.getDate() - i);
    var ds = d.toISOString().split('T')[0];
    labels.push(d.toLocaleDateString('en-IN', {day:'numeric', month:'short'}));
    revData.push(sumAmount(deliveriesOn(ds)));
  }
  makeChart('chartRevTrend', {
    type:'line',
    data:{ labels:labels, datasets:[{ label:'Revenue (₹)', data:revData, borderColor:c.palette[0], backgroundColor:c.palette[0]+'22', tension:.35, fill:true }] },
    options: baseLineOptions(c)
  });

  // Today morning vs evening
  var today = todayStr();
  var todayDels = deliveriesOn(today);
  var mAmt = sumAmount(todayDels.filter(function(d){ return d.slot === 'Morning'; }));
  var eAmt = sumAmount(todayDels.filter(function(d){ return d.slot === 'Evening'; }));
  makeChart('chartTodaySlot', {
    type:'doughnut',
    data:{ labels:['Morning','Evening'], datasets:[{ data:[mAmt, eAmt], backgroundColor:[c.palette[2], c.palette[4]] }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ color:c.text } } } }
  });
}


