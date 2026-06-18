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

// ── ANALYTICS PAGE CHARTS ─────────────────────────────
function renderAnalytics(){
  var c = chartColors();

  // Customer growth (cumulative by registration date, last 60 days, weekly buckets)
  var sortedRegs = customers.slice().sort(function(a,b){ return a.regDate.localeCompare(b.regDate); });
  var growthLabels = [], growthData = [];
  var today = new Date();
  for(var w = 8; w >= 0; w--){
    var d = new Date(today); d.setDate(d.getDate() - w*7);
    var ds = d.toISOString().split('T')[0];
    growthLabels.push(d.toLocaleDateString('en-IN', {day:'numeric', month:'short'}));
    growthData.push(sortedRegs.filter(function(cu){ return cu.regDate <= ds; }).length);
  }
  makeChart('chartCustGrowth', {
    type:'line',
    data:{ labels:growthLabels, datasets:[{ label:'Total Customers', data:growthData, borderColor:c.palette[1], backgroundColor:c.palette[1]+'22', tension:.3, fill:true }] },
    options: baseLineOptions(c)
  });

  // Daily sales - 30 days
  var dsLabels = [], dsData = [];
  for(var i = 29; i >= 0; i--){
    var d2 = new Date(); d2.setDate(d2.getDate() - i);
    var ds2 = d2.toISOString().split('T')[0];
    dsLabels.push(d2.getDate());
    dsData.push(sumAmount(deliveriesOn(ds2)));
  }
  makeChart('chartDailySales', {
    type:'bar',
    data:{ labels:dsLabels, datasets:[{ label:'Sales (₹)', data:dsData, backgroundColor:c.palette[0] }] },
    options: baseLineOptions(c)
  });

  // Monthly sales - last 4 months
  var msLabels = [], msData = [];
  for(var m = 3; m >= 0; m--){
    var d3 = new Date(); d3.setMonth(d3.getMonth() - m);
    var ms = d3.getFullYear() + '-' + String(d3.getMonth()+1).padStart(2,'0');
    msLabels.push(MONTHS[d3.getMonth()].slice(0,3) + ' ' + d3.getFullYear());
    msData.push(sumAmount(deliveriesInMonth(ms)));
  }
  makeChart('chartMonthlySales', {
    type:'bar',
    data:{ labels:msLabels, datasets:[{ label:'Revenue (₹)', data:msData, backgroundColor:c.palette[2] }] },
    options: baseLineOptions(c)
  });

  // Product-wise sales (all time)
  var prodLabels = Object.keys(PRODUCTS);
  var prodData = prodLabels.map(function(p){ return sumAmount(deliveries.filter(function(d){ return d.product === p; })); });
  makeChart('chartProductSales', {
    type:'pie',
    data:{ labels:prodLabels, datasets:[{ data:prodData, backgroundColor:c.palette }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ color:c.text } } } }
  });

  // Morning vs evening - all time
  var allMorning = sumAmount(deliveries.filter(function(d){ return d.slot === 'Morning'; }));
  var allEvening = sumAmount(deliveries.filter(function(d){ return d.slot === 'Evening'; }));
  makeChart('chartSlotSplit', {
    type:'doughnut',
    data:{ labels:['Morning','Evening'], datasets:[{ data:[allMorning, allEvening], backgroundColor:[c.palette[2], c.palette[4]] }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ color:c.text } } } }
  });

  // Revenue trend - 14 days (duplicate of dashboard, kept here for analytics page)
  var rtLabels = [], rtData = [];
  for(var j = 13; j >= 0; j--){
    var d4 = new Date(); d4.setDate(d4.getDate() - j);
    var ds4 = d4.toISOString().split('T')[0];
    rtLabels.push(d4.toLocaleDateString('en-IN', {day:'numeric', month:'short'}));
    rtData.push(sumAmount(deliveriesOn(ds4)));
  }
  makeChart('chartRevTrend2', {
    type:'line',
    data:{ labels:rtLabels, datasets:[{ label:'Revenue (₹)', data:rtData, borderColor:c.palette[5], backgroundColor:c.palette[5]+'22', tension:.35, fill:true }] },
    options: baseLineOptions(c)
  });
}
