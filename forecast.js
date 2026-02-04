// Forecast Review Page Logic

const forecastReviewState = {
  view: 'daily',
  chart: null,
  sessionChart: null,
  shareChart: null,
  showComparison: false,
  unit: 'sales',
  dateRange: {
    start: new Date('2026-02-02'),
    end: new Date('2026-02-06'),
    preset: null
  },
  tempDateRange: {
    start: null,
    end: null,
    preset: null
  },
  calendarMonths: {
    start: new Date(),
    end: new Date()
  }
};

function initForecastReviewPage() {
  const root = document.querySelector('.page-forecast-review');
  if (!root) return;

  // Initialize default date range (Last 30 days)
  initDefaultDateRange();

  const dateTrigger = document.getElementById('forecastDateTrigger');
  const dateModal = document.getElementById('forecastDateModal');
  const cancelBtn = document.getElementById('forecastDateCancel');
  const applyBtn = document.getElementById('forecastDateApply');
  const comparisonBtn = document.getElementById('forecastComparisonBtn');
  const unitSwitchBtn = document.getElementById('forecastUnitSwitchBtn');
  const viewToggleButtons = root.querySelectorAll('.forecast-chart-view-toggle button');

  // Filter change listeners
  const countryFilter = root.querySelector('.forecast-filter-country');
  const marketplaceFilter = root.querySelector('.forecast-filter-marketplace');
  const categoryFilter = root.querySelector('.forecast-filter-category');
  const skuFilter = root.querySelector('.forecast-filter-sku');

  if (countryFilter) countryFilter.addEventListener('change', () => handleForecastSearch(root));
  if (marketplaceFilter) marketplaceFilter.addEventListener('change', () => handleForecastSearch(root));
  if (categoryFilter) categoryFilter.addEventListener('change', () => handleForecastSearch(root));
  if (skuFilter) skuFilter.addEventListener('input', () => handleForecastSearch(root));

  // Date trigger
  if (dateTrigger) {
    dateTrigger.addEventListener('click', () => {
      openDateModal();
    });
  }

  // Modal close
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      closeDateModal();
    });
  }

  // Modal apply
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      applyDateRange();
    });
  }

  // Click outside to close
  if (dateModal) {
    dateModal.addEventListener('click', (e) => {
      if (e.target === dateModal) {
        closeDateModal();
      }
    });
  }

  // ESC to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dateModal.classList.contains('is-open')) {
      closeDateModal();
    }
  });

  // Preset items
  const presetItems = document.querySelectorAll('.forecast-preset-item');
  presetItems.forEach(item => {
    item.addEventListener('click', () => {
      handlePresetClick(item.dataset.preset);
    });
  });

  // Calendar navigation
  const navButtons = document.querySelectorAll('.forecast-calendar-nav');
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      handleCalendarNav(btn.dataset.nav);
    });
  });

  // Comparison toggle
  if (comparisonBtn) {
    comparisonBtn.addEventListener('click', () => {
      toggleComparison(root);
    });
  }

  // Unit switch
  if (unitSwitchBtn) {
    unitSwitchBtn.addEventListener('click', () => {
      toggleUnit(root);
    });
  }

  viewToggleButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      handleChartViewToggle(btn, root);
    });
  });

  setupForecastChart();
  setupSessionChart();
  setupShareChart();
}

function initDefaultDateRange() {
  forecastReviewState.dateRange.start = new Date('2026-02-02');
  forecastReviewState.dateRange.end = new Date('2026-02-06');
  forecastReviewState.dateRange.preset = null;
  
  setTimeout(() => {
    updateDateTriggerText();
    handleForecastSearch(document.querySelector('.page-forecast-review'));
  }, 0);
}

function openDateModal() {
  const modal = document.getElementById('forecastDateModal');
  if (!modal) return;
  
  // Copy current range to temp
  forecastReviewState.tempDateRange = {
    start: forecastReviewState.dateRange.start,
    end: forecastReviewState.dateRange.end,
    preset: forecastReviewState.dateRange.preset
  };
  
  // Set calendar months
  forecastReviewState.calendarMonths.start = new Date(forecastReviewState.dateRange.start);
  forecastReviewState.calendarMonths.end = new Date(forecastReviewState.dateRange.end);
  
  modal.classList.add('is-open');
  updateDateInputs();
  updatePresetHighlight();
  renderCalendars();
}

function closeDateModal() {
  const modal = document.getElementById('forecastDateModal');
  if (!modal) return;
  modal.classList.remove('is-open');
}

function applyDateRange() {
  forecastReviewState.dateRange = {
    start: forecastReviewState.tempDateRange.start,
    end: forecastReviewState.tempDateRange.end,
    preset: forecastReviewState.tempDateRange.preset
  };
  
  updateDateTriggerText();
  closeDateModal();
  handleForecastSearch(document.querySelector('.page-forecast-review'));
}

function updateDateTriggerText() {
  const trigger = document.getElementById('forecastDateTrigger');
  if (!trigger) {
    console.warn('Date trigger button not found');
    return;
  }
  
  const textSpan = trigger.querySelector('.forecast-date-trigger-text');
  if (!textSpan) {
    console.warn('Date trigger text span not found');
    return;
  }
  
  const preset = forecastReviewState.dateRange.preset;
  
  if (preset) {
    const presetLabels = {
      'today': 'Today',
      'yesterday': 'Yesterday',
      'last-7-days': 'Last 7 days',
      'last-30-days': 'Last 30 days',
      'last-60-days': 'Last 60 days',
      'last-90-days': 'Last 90 days',
      'last-month': 'Last month',
      'last-2-months': 'Last 2 months',
      'last-3-months': 'Last 3 months',
      'last-year': 'Last year'
    };
    textSpan.textContent = presetLabels[preset] || 'Custom range';
  } else {
    // Custom range - show dates
    if (forecastReviewState.dateRange.start && forecastReviewState.dateRange.end) {
      const start = formatDateForDisplay(forecastReviewState.dateRange.start);
      const end = formatDateForDisplay(forecastReviewState.dateRange.end);
      textSpan.textContent = `${start} ~ ${end}`;
    } else {
      textSpan.textContent = 'Select date range';
    }
  }
}

function handlePresetClick(preset) {
  const today = new Date();
  let start = new Date();
  let end = new Date(today);
  
  switch (preset) {
    case 'today':
      start = new Date(today);
      break;
    case 'yesterday':
      start.setDate(today.getDate() - 1);
      end.setDate(today.getDate() - 1);
      break;
    case 'last-7-days':
      start.setDate(today.getDate() - 7);
      break;
    case 'last-30-days':
      start.setDate(today.getDate() - 30);
      break;
    case 'last-60-days':
      start.setDate(today.getDate() - 60);
      break;
    case 'last-90-days':
      start.setDate(today.getDate() - 90);
      break;
    case 'last-month':
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      end = new Date(today.getFullYear(), today.getMonth(), 0);
      break;
    case 'last-2-months':
      start = new Date(today.getFullYear(), today.getMonth() - 2, 1);
      end = new Date(today.getFullYear(), today.getMonth(), 0);
      break;
    case 'last-3-months':
      start = new Date(today.getFullYear(), today.getMonth() - 3, 1);
      end = new Date(today.getFullYear(), today.getMonth(), 0);
      break;
    case 'last-year':
      start = new Date(today.getFullYear() - 1, 0, 1);
      end = new Date(today.getFullYear() - 1, 11, 31);
      break;
  }
  
  forecastReviewState.tempDateRange.start = start;
  forecastReviewState.tempDateRange.end = end;
  forecastReviewState.tempDateRange.preset = preset;
  
  forecastReviewState.calendarMonths.start = new Date(start);
  forecastReviewState.calendarMonths.end = new Date(end);
  
  updateDateInputs();
  updatePresetHighlight();
  renderCalendars();
}

function updatePresetHighlight() {
  const items = document.querySelectorAll('.forecast-preset-item');
  items.forEach(item => {
    if (item.dataset.preset === forecastReviewState.tempDateRange.preset) {
      item.classList.add('is-active');
    } else {
      item.classList.remove('is-active');
    }
  });
}

function updateDateInputs() {
  const startInput = document.getElementById('forecastStartDisplay');
  const endInput = document.getElementById('forecastEndDisplay');
  
  if (startInput) {
    startInput.value = formatDateForDisplay(forecastReviewState.tempDateRange.start);
  }
  if (endInput) {
    endInput.value = formatDateForDisplay(forecastReviewState.tempDateRange.end);
  }
}

function handleCalendarNav(nav) {
  switch (nav) {
    case 'prev-start':
      forecastReviewState.calendarMonths.start.setMonth(forecastReviewState.calendarMonths.start.getMonth() - 1);
      break;
    case 'next-start':
      forecastReviewState.calendarMonths.start.setMonth(forecastReviewState.calendarMonths.start.getMonth() + 1);
      break;
    case 'prev-end':
      forecastReviewState.calendarMonths.end.setMonth(forecastReviewState.calendarMonths.end.getMonth() - 1);
      break;
    case 'next-end':
      forecastReviewState.calendarMonths.end.setMonth(forecastReviewState.calendarMonths.end.getMonth() + 1);
      break;
  }
  renderCalendars();
}

function renderCalendars() {
  renderCalendar('start');
  renderCalendar('end');
}

function renderCalendar(type) {
  const month = forecastReviewState.calendarMonths[type];
  const titleEl = document.getElementById(`forecastCalendar${type.charAt(0).toUpperCase() + type.slice(1)}Title`);
  const bodyEl = document.getElementById(`forecastCalendar${type.charAt(0).toUpperCase() + type.slice(1)}Body`);
  
  if (!titleEl || !bodyEl) return;
  
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  titleEl.textContent = `${monthNames[month.getMonth()]} ${month.getFullYear()}`;
  
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const startDayOfWeek = firstDay.getDay();
  
  let html = '';
  
  // Weekday headers
  const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  weekdays.forEach(day => {
    html += `<div class="forecast-calendar-weekday">${day}</div>`;
  });
  
  // Empty cells before first day
  for (let i = 0; i < startDayOfWeek; i++) {
    html += '<div class="forecast-calendar-day is-disabled"></div>';
  }
  
  // Days
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const date = new Date(month.getFullYear(), month.getMonth(), day);
    const classes = ['forecast-calendar-day'];
    
    const start = forecastReviewState.tempDateRange.start;
    const end = forecastReviewState.tempDateRange.end;
    
    if (start && isSameDay(date, start)) classes.push('is-start');
    if (end && isSameDay(date, end)) classes.push('is-end');
    if (start && end && date > start && date < end) classes.push('is-in-range');
    if (isSameDay(date, new Date())) classes.push('is-today');
    
    html += `<div class="${classes.join(' ')}" data-date="${date.toISOString()}" data-type="${type}">${day}</div>`;
  }
  
  bodyEl.innerHTML = html;
  
  // Add click handlers
  bodyEl.querySelectorAll('.forecast-calendar-day:not(.is-disabled)').forEach(dayEl => {
    dayEl.addEventListener('click', () => {
      handleDayClick(new Date(dayEl.dataset.date), dayEl.dataset.type);
    });
  });
}

function handleDayClick(date, calendarType) {
  const start = forecastReviewState.tempDateRange.start;
  const end = forecastReviewState.tempDateRange.end;
  
  if (calendarType === 'start') {
    if (end && date > end) {
      forecastReviewState.tempDateRange.start = end;
      forecastReviewState.tempDateRange.end = date;
    } else {
      forecastReviewState.tempDateRange.start = date;
    }
  } else {
    if (start && date < start) {
      forecastReviewState.tempDateRange.end = start;
      forecastReviewState.tempDateRange.start = date;
    } else {
      forecastReviewState.tempDateRange.end = date;
    }
  }
  
  forecastReviewState.tempDateRange.preset = null;
  
  updateDateInputs();
  updatePresetHighlight();
  renderCalendars();
}

function isSameDay(date1, date2) {
  return date1.getFullYear() === date2.getFullYear() &&
         date1.getMonth() === date2.getMonth() &&
         date1.getDate() === date2.getDate();
}

function formatDateForDisplay(date) {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toggleUnit(root) {
  forecastReviewState.unit = forecastReviewState.unit === 'sales' ? 'units' : 'sales';
  
  const btn = document.getElementById('forecastUnitSwitchBtn');
  const titleEl = document.getElementById('forecastChartTitle');
  
  if (btn) {
    const textSpan = btn.querySelector('.forecast-unit-text');
    if (textSpan) {
      textSpan.textContent = forecastReviewState.unit === 'sales' ? 'By Sales' : 'By Units';
    }
  }
  
  if (titleEl) {
    titleEl.textContent = forecastReviewState.unit === 'sales' 
      ? 'Actual vs Forecast Sales' 
      : 'Actual vs Forecast Units';
  }
  
  handleForecastSearch(root);
}

function toggleComparison(root) {
  forecastReviewState.showComparison = !forecastReviewState.showComparison;
  
  const btn = document.getElementById('forecastComparisonBtn');
  if (btn) {
    if (forecastReviewState.showComparison) {
      btn.classList.add('is-active');
    } else {
      btn.classList.remove('is-active');
    }
  }
  
  handleForecastSearch(root);
}

function handleForecastSearch(root) {
  const params = collectForecastFilterParams(root);
  
  fetchForecastSeries(params, forecastReviewState.view).then((series) => {
    updateForecastChart(series);
  });
}

function collectForecastFilterParams(root) {
  const country = root.querySelector('.forecast-filter-country')?.value || '';
  const marketplace = root.querySelector('.forecast-filter-marketplace')?.value || '';
  
  return {
    startDate: formatDateForDisplay(forecastReviewState.dateRange.start),
    endDate: formatDateForDisplay(forecastReviewState.dateRange.end),
    marketplace: country || marketplace,
    channel: marketplace ? marketplace.charAt(0).toUpperCase() + marketplace.slice(1) : '',
    category: root.querySelector('.forecast-filter-category')?.value || '',
    sku: root.querySelector('.forecast-filter-sku')?.value.trim() || '',
  };
}

function fetchForecastSeries(params, view) {
  return new Promise((resolve) => {
    const data = DataRepo.getForecastReviewData(params);
    const lastYearData = forecastReviewState.showComparison ? DataRepo.getForecastReviewDataLastYear(params) : [];
    const chartData = aggregateForecastData(data, lastYearData, view);
    setTimeout(() => resolve(chartData), 100);
  });
}

function aggregateForecastData(data, lastYearData, view) {
  const grouped = {};
  const groupedLastYear = {};
  const marketplaceBreakdown = {};
  
  data.forEach(item => {
    const parts = item.date.split('/');
    const date = new Date(parts[2], parts[0] - 1, parts[1]);
    let key;
    
    if (view === 'daily') {
      key = `${date.getMonth() + 1}/${date.getDate()}`;
    } else if (view === 'weekly') {
      const weekNum = Math.ceil(date.getDate() / 7);
      key = `Week ${weekNum}`;
    } else {
      key = `${date.getMonth() + 1}/${date.getFullYear()}`;
    }
    
    if (!grouped[key]) {
      grouped[key] = { salesUnits: 0, salesAmount: 0, salesAmountUSD: 0, forecastUnits: 0, forecastAmount: 0, forecastAmountUSD: 0, session: 0, pageView: 0, count: 0 };
    }
    
    // Marketplace breakdown
    if (!marketplaceBreakdown[item.marketplace]) {
      marketplaceBreakdown[item.marketplace] = { salesUnits: 0, salesAmountUSD: 0 };
    }
    
    // Generate forecast with 20% variance (80% to 120%)
    const variance = 0.8 + Math.random() * 0.4;
    const rate = exchangeRates[item.currency] || 1;
    
    grouped[key].salesUnits += item.salesUnits;
    grouped[key].salesAmount += item.salesAmount;
    grouped[key].salesAmountUSD += item.salesAmount * rate;
    grouped[key].forecastUnits += item.forecastUnits || Math.round(item.salesUnits * variance);
    grouped[key].forecastAmount += item.forecastAmount || Math.round(item.salesAmount * variance);
    grouped[key].forecastAmountUSD += (item.forecastAmount || Math.round(item.salesAmount * variance)) * rate;
    grouped[key].session += item.session;
    grouped[key].pageView += item.pageView;
    grouped[key].count++;
    
    marketplaceBreakdown[item.marketplace].salesUnits += item.salesUnits;
    marketplaceBreakdown[item.marketplace].salesAmountUSD += item.salesAmount * rate;
  });
  
  // Aggregate last year data
  lastYearData.forEach(item => {
    const parts = item.date.split('/');
    const date = new Date(parts[2], parts[0] - 1, parts[1]);
    let key;
    
    if (view === 'daily') {
      key = `${date.getMonth() + 1}/${date.getDate()}`;
    } else if (view === 'weekly') {
      const weekNum = Math.ceil(date.getDate() / 7);
      key = `Week ${weekNum}`;
    } else {
      key = `${date.getMonth() + 1}/${date.getFullYear()}`;
    }
    
    if (!groupedLastYear[key]) {
      groupedLastYear[key] = { salesUnits: 0, salesAmount: 0, salesAmountUSD: 0, count: 0 };
    }
    
    const rate = exchangeRates[item.currency] || 1;
    groupedLastYear[key].salesUnits += item.salesUnits;
    groupedLastYear[key].salesAmount += item.salesAmount;
    groupedLastYear[key].salesAmountUSD += item.salesAmount * rate;
    groupedLastYear[key].count++;
  });
  
  const labels = Object.keys(grouped);
  const salesUnits = labels.map(k => grouped[k].salesUnits);
  const salesAmount = labels.map(k => Math.round(grouped[k].salesAmountUSD));
  const forecastUnits = labels.map(k => grouped[k].forecastUnits);
  const forecastAmount = labels.map(k => Math.round(grouped[k].forecastAmountUSD));
  const sessions = labels.map(k => grouped[k].session);
  const pageViews = labels.map(k => grouped[k].pageView);
  const lastYearSalesUnits = labels.map(k => groupedLastYear[k]?.salesUnits || 0);
  const lastYearSalesAmount = labels.map(k => Math.round(groupedLastYear[k]?.salesAmountUSD || 0));
  
  return { labels, salesUnits, salesAmount, forecastUnits, forecastAmount, sessions, pageViews, lastYearSalesUnits, lastYearSalesAmount, marketplaceBreakdown };
}

function setupForecastChart() {
  const ctx = document.getElementById('forecastChart');
  if (!ctx) return;

  forecastReviewState.chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Actual (2026)',
          data: [],
          borderColor: '#3182ce',
          backgroundColor: 'rgba(49, 130, 206, 0.2)',
          borderWidth: 3,
          tension: 0.3,
          fill: true,
        },
        {
          label: 'Forecast (2026)',
          data: [],
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          borderWidth: 3,
          borderDash: [8, 4],
          tension: 0.3,
          fill: false,
        },
        {
          label: 'Last Year (2025)',
          data: [],
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139, 92, 246, 0.1)',
          borderWidth: 2,
          tension: 0.3,
          fill: false,
          hidden: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: {
            display: true,
            text: 'Date',
          },
          grid: {
            display: false,
          },
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: forecastReviewState.unit === 'sales' ? 'Amount' : 'Units',
          },
        },
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            usePointStyle: true,
            padding: 15,
          },
        },
        tooltip: {
          mode: 'index',
          intersect: false,
        },
      },
    },
  });
}

function setupSessionChart() {
  const ctx = document.getElementById('sessionChart');
  if (!ctx) return;

  forecastReviewState.sessionChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Sessions',
          data: [],
          backgroundColor: 'rgba(16, 185, 129, 0.6)',
          borderColor: '#10b981',
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: {
            display: true,
            text: 'Date',
          },
          grid: {
            display: false,
          },
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Sessions',
          },
        },
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            usePointStyle: true,
            padding: 15,
          },
        },
        tooltip: {
          mode: 'index',
          intersect: false,
        },
      },
    },
  });
}

function setupShareChart() {
  const ctx = document.getElementById('shareChart');
  if (!ctx) return;

  forecastReviewState.shareChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: [],
      datasets: [
        {
          data: [],
          backgroundColor: [
            '#3b82f6', // US - Blue
            '#10b981', // JP - Green
            '#f59e0b', // UK - Orange
            '#8b5cf6', // DE - Purple
            '#ef4444', // CA - Red
            '#ec4899', // FR - Pink
            '#14b8a6', // IT - Teal
            '#f97316', // ES - Orange-Red
          ],
          borderWidth: 2,
          borderColor: '#ffffff',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '60%',
      plugins: {
        legend: {
          display: true,
          position: 'right',
          labels: {
            usePointStyle: true,
            padding: 10,
            font: {
              size: 11
            }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.parsed || 0;
              return label + ': ' + value.toFixed(1) + '%';
            }
          }
        },
      },
    },
  });
}

function updateForecastChart(series) {
  const chart = forecastReviewState.chart;
  const sessionChart = forecastReviewState.sessionChart;
  
  if (chart && series) {
    chart.data.labels = series.labels || [];
    const actualData = forecastReviewState.unit === 'sales' ? series.salesAmount : series.salesUnits;
    const forecastData = forecastReviewState.unit === 'sales' ? series.forecastAmount : series.forecastUnits;
    const lastYearData = forecastReviewState.unit === 'sales' ? series.lastYearSalesAmount : series.lastYearSalesUnits;
    
    chart.data.datasets[0].data = actualData || [];
    chart.data.datasets[0].label = 'Actual (2026) ' + (forecastReviewState.unit === 'sales' ? 'Sales' : 'Units');
    chart.data.datasets[1].data = forecastData || [];
    chart.data.datasets[1].label = 'Forecast (2026) ' + (forecastReviewState.unit === 'sales' ? 'Sales' : 'Units');
    chart.data.datasets[2].data = lastYearData || [];
    chart.data.datasets[2].label = 'Last Year (2025) ' + (forecastReviewState.unit === 'sales' ? 'Sales' : 'Units');
    chart.data.datasets[2].hidden = !forecastReviewState.showComparison;
    chart.options.scales.y.title.text = forecastReviewState.unit === 'sales' ? 'Amount' : 'Units';
    chart.update();
    
    // Update summary stats
    updateSummaryStats(actualData, forecastData, lastYearData, series.marketplaceBreakdown);
  }
  
  if (sessionChart && series) {
    sessionChart.data.labels = series.labels || [];
    sessionChart.data.datasets[0].data = series.sessions || [];
    sessionChart.update();
  }
}

function updateSummaryStats(actualData, forecastData, lastYearData, marketplaceBreakdown) {
  const params = collectForecastFilterParams(document.querySelector('.page-forecast-review'));
  const summary = DataRepo.getForecastReviewSummary(params);
  
  // Update Total Sales
  const totalSalesEl = document.getElementById('forecastTotalSales');
  if (totalSalesEl) {
    totalSalesEl.textContent = '$' + Math.round(summary.totalSalesAmount).toLocaleString();
  }
  
  // Update Total Units
  const totalUnitsEl = document.getElementById('forecastTotalUnits');
  if (totalUnitsEl) {
    totalUnitsEl.textContent = summary.totalSalesUnits.toLocaleString();
  }
  
  // Update Sessions
  const totalSessionsEl = document.getElementById('forecastTotalSessions');
  if (totalSessionsEl) {
    totalSessionsEl.textContent = summary.totalSessions.toLocaleString();
  }
  
  // Update Share Chart with marketplace breakdown
  const shareChart = forecastReviewState.shareChart;
  if (shareChart && marketplaceBreakdown) {
    const marketplaces = Object.keys(marketplaceBreakdown);
    
    // Calculate total sales amount
    const total = marketplaces.reduce((sum, mp) => {
      return sum + marketplaceBreakdown[mp].salesAmountUSD;
    }, 0);
    
    // Calculate percentages
    const percentages = marketplaces.map(mp => {
      const value = marketplaceBreakdown[mp].salesAmountUSD;
      return total > 0 ? (value / total * 100) : 0;
    });
    
    shareChart.data.labels = marketplaces;
    shareChart.data.datasets[0].data = percentages;
    shareChart.update();
  }
}

function handleChartViewToggle(btn, root) {
  const view = btn.dataset.view;
  if (!view) return;

  forecastReviewState.view = view;

  const allBtns = root.querySelectorAll('.forecast-chart-view-toggle button');
  allBtns.forEach((b) => b.classList.remove('is-active'));
  btn.classList.add('is-active');

  handleForecastSearch(root);
}

window.initForecastReviewPage = initForecastReviewPage;
