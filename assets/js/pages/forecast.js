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
  const backdrop = document.getElementById('frDateBackdrop');
  const modal = document.getElementById('frDateModal');
  const cancelBtn = document.getElementById('frDateCancel');
  const applyBtn = document.getElementById('frDateApply');
  const comparisonBtn = document.getElementById('forecastComparisonBtn');
  const unitSwitchBtn = document.getElementById('forecastUnitSwitchBtn');
  const viewToggleButtons = root.querySelectorAll('.forecast-chart-view-toggle button');

  // Initialize dropdown filters
  initForecastDropdowns(root);

  // SKU filter
  const skuFilter = root.querySelector('.forecast-filter-sku');
  if (skuFilter) skuFilter.addEventListener('input', () => handleForecastSearch(root));

  // Date trigger
  if (dateTrigger) {
    dateTrigger.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
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

  // Click backdrop to close
  if (backdrop) {
    backdrop.addEventListener('click', () => {
      closeDateModal();
    });
  }

  // ESC to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.classList.contains('is-open')) {
      closeDateModal();
    }
  });

  // Preset items
  const presetItems = document.querySelectorAll('.fr-preset-item');
  presetItems.forEach(item => {
    item.addEventListener('click', () => {
      handlePresetClick(item.dataset.preset);
    });
  });

  // Calendar navigation
  const navButtons = document.querySelectorAll('.fr-calendar-nav');
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

function initForecastDropdowns(root) {
  if (!root) return;
  
  // Remove existing listeners to prevent duplicates
  const existingTriggers = root.querySelectorAll('.forecast-dropdown-trigger');
  existingTriggers.forEach(trigger => {
    const clone = trigger.cloneNode(true);
    trigger.parentNode.replaceChild(clone, trigger);
  });
  
  const triggers = root.querySelectorAll('.forecast-dropdown-trigger');
  
  triggers.forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const filterType = trigger.dataset.filter;
      const panel = root.querySelector(`.forecast-dropdown-panel[data-filter="${filterType}"]`);
      
      // Close other panels
      root.querySelectorAll('.forecast-dropdown-panel').forEach(p => {
        if (p !== panel) p.classList.remove('is-open');
      });
      
      // Toggle current panel
      if (panel) {
        panel.classList.toggle('is-open');
      }
    });
  });
  
  // Prevent panel from closing when clicking inside
  root.querySelectorAll('.forecast-dropdown-panel').forEach(panel => {
    panel.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  });
  
  // Close dropdowns when clicking outside
  const handleOutsideClick = (e) => {
    const isInsideRoot = root.contains(e.target);
    if (!isInsideRoot) return;
    
    const isClickOnTrigger = e.target.closest('.forecast-dropdown-trigger');
    const isClickInPanel = e.target.closest('.forecast-dropdown-panel');
    
    if (!isClickOnTrigger && !isClickInPanel) {
      root.querySelectorAll('.forecast-dropdown-panel').forEach(p => {
        p.classList.remove('is-open');
      });
    }
  };
  
  // Store handler reference for cleanup
  if (root._forecastDropdownHandler) {
    document.removeEventListener('click', root._forecastDropdownHandler, true);
  }
  root._forecastDropdownHandler = handleOutsideClick;
  document.addEventListener('click', handleOutsideClick, true);
}

function toggleForecastAll(checkbox, filterType) {
  const root = document.querySelector('.page-forecast-review');
  const panel = root.querySelector(`.forecast-dropdown-panel[data-filter="${filterType}"]`);
  const checkboxes = panel.querySelectorAll('input[type="checkbox"]:not([value=""])');
  
  checkboxes.forEach(cb => {
    cb.checked = checkbox.checked;
  });
  
  updateForecastFilter(filterType);
}

function updateForecastFilter(filterType) {
  const root = document.querySelector('.page-forecast-review');
  const panel = root.querySelector(`.forecast-dropdown-panel[data-filter="${filterType}"]`);
  const trigger = root.querySelector(`.forecast-dropdown-trigger[data-filter="${filterType}"]`);
  const allCheckbox = panel.querySelector('input[type="checkbox"][value=""]');
  const checkboxes = Array.from(panel.querySelectorAll('input[type="checkbox"]:not([value=""])'));
  
  const checkedCount = checkboxes.filter(cb => cb.checked).length;
  const totalCount = checkboxes.length;
  
  // Update "All" checkbox
  if (allCheckbox) {
    allCheckbox.checked = checkedCount === totalCount;
  }
  
  // Update trigger text
  const triggerText = trigger.querySelector('.forecast-dropdown-text');
  if (checkedCount === 0) {
    triggerText.textContent = 'None';
  } else if (checkedCount === totalCount) {
    triggerText.textContent = 'All';
  } else {
    triggerText.textContent = `${checkedCount} selected`;
  }
  
  handleForecastSearch(root);
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
  const backdrop = document.getElementById('frDateBackdrop');
  const modal = document.getElementById('frDateModal');
  if (!modal || !backdrop) return;
  
  // Copy current range to temp
  forecastReviewState.tempDateRange = {
    start: forecastReviewState.dateRange.start,
    end: forecastReviewState.dateRange.end,
    preset: forecastReviewState.dateRange.preset
  };
  
  // Set calendar months
  forecastReviewState.calendarMonths.start = new Date(forecastReviewState.dateRange.start);
  forecastReviewState.calendarMonths.end = new Date(forecastReviewState.dateRange.end);
  
  backdrop.classList.add('is-open');
  modal.classList.add('is-open');
  updateDateInputs();
  updatePresetHighlight();
  renderCalendars();
}

function closeDateModal() {
  const backdrop = document.getElementById('frDateBackdrop');
  const modal = document.getElementById('frDateModal');
  if (!modal || !backdrop) return;
  backdrop.classList.remove('is-open');
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
  const items = document.querySelectorAll('.fr-preset-item');
  items.forEach(item => {
    if (item.dataset.preset === forecastReviewState.tempDateRange.preset) {
      item.classList.add('is-active');
    } else {
      item.classList.remove('is-active');
    }
  });
}

function updateDateInputs() {
  const startInput = document.getElementById('frStartDisplay');
  const endInput = document.getElementById('frEndDisplay');
  
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
  const titleEl = document.getElementById(`frCalendar${type.charAt(0).toUpperCase() + type.slice(1)}Title`);
  const bodyEl = document.getElementById(`frCalendar${type.charAt(0).toUpperCase() + type.slice(1)}Body`);
  
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
    html += `<div class="fr-calendar-weekday">${day}</div>`;
  });
  
  // Empty cells before first day
  for (let i = 0; i < startDayOfWeek; i++) {
    html += '<div class="fr-calendar-day is-disabled"></div>';
  }
  
  // Days
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const date = new Date(month.getFullYear(), month.getMonth(), day);
    const classes = ['fr-calendar-day'];
    
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
  bodyEl.querySelectorAll('.fr-calendar-day:not(.is-disabled)').forEach(dayEl => {
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
    updateAchievementSummary();
  });
}

function collectForecastFilterParams(root) {
  const countryPanel = root.querySelector('.forecast-dropdown-panel[data-filter="country"]');
  const marketplacePanel = root.querySelector('.forecast-dropdown-panel[data-filter="marketplace"]');
  const categoryPanel = root.querySelector('.forecast-dropdown-panel[data-filter="category"]');
  const seriesPanel = root.querySelector('.forecast-dropdown-panel[data-filter="series"]');
  
  const getSelectedValues = (panel) => {
    if (!panel) return [];
    const checkboxes = panel.querySelectorAll('input[type="checkbox"]:not([value=""]):checked');
    return Array.from(checkboxes).map(cb => cb.value);
  };
  
  return {
    startDate: formatDateForDisplay(forecastReviewState.dateRange.start),
    endDate: formatDateForDisplay(forecastReviewState.dateRange.end),
    countries: getSelectedValues(countryPanel),
    marketplaces: getSelectedValues(marketplacePanel),
    categories: getSelectedValues(categoryPanel),
    series: getSelectedValues(seriesPanel),
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
      groupedLastYear[key] = { salesUnits: 0, salesAmount: 0, salesAmountUSD: 0, session: 0, count: 0 };
    }
    
    const rate = exchangeRates[item.currency] || 1;
    groupedLastYear[key].salesUnits += item.salesUnits;
    groupedLastYear[key].salesAmount += item.salesAmount;
    groupedLastYear[key].salesAmountUSD += item.salesAmount * rate;
    groupedLastYear[key].session += item.session;
    groupedLastYear[key].count++;
  });
  
  const labels = Object.keys(grouped);
  const salesUnits = labels.map(k => grouped[k].salesUnits);
  const salesAmount = labels.map(k => Math.round(grouped[k].salesAmountUSD));
  const forecastUnits = labels.map(k => grouped[k].forecastUnits);
  const forecastAmount = labels.map(k => Math.round(grouped[k].forecastAmountUSD));
  const sessions = labels.map(k => grouped[k].session);
  const pageViews = labels.map(k => grouped[k].pageView);
  const usp = labels.map(k => grouped[k].session > 0 ? (grouped[k].salesUnits / grouped[k].session * 100) : 0);
  const lastYearSalesUnits = labels.map(k => groupedLastYear[k]?.salesUnits || 0);
  const lastYearSalesAmount = labels.map(k => Math.round(groupedLastYear[k]?.salesAmountUSD || 0));
  const lastYearSessions = labels.map(k => groupedLastYear[k]?.session || 0);
  const lastYearUSP = labels.map(k => {
    const lySession = groupedLastYear[k]?.session || 0;
    const lyUnits = groupedLastYear[k]?.salesUnits || 0;
    return lySession > 0 ? (lyUnits / lySession * 100) : 0;
  });
  
  return { labels, salesUnits, salesAmount, forecastUnits, forecastAmount, sessions, pageViews, usp, lastYearSalesUnits, lastYearSalesAmount, lastYearSessions, lastYearUSP, marketplaceBreakdown };
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
          label: 'Sessions (2026)',
          data: [],
          backgroundColor: 'rgba(16, 185, 129, 0.6)',
          borderColor: '#10b981',
          borderWidth: 1,
          yAxisID: 'y',
        },
        {
          label: 'USP (2026) (%)',
          data: [],
          type: 'line',
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          yAxisID: 'y1',
          tension: 0.3,
        },
        {
          label: 'Last Year Sessions (2025)',
          data: [],
          backgroundColor: 'rgba(139, 92, 246, 0.4)',
          borderColor: '#8b5cf6',
          borderWidth: 1,
          yAxisID: 'y',
          hidden: true,
        },
        {
          label: 'Last Year USP (2025) (%)',
          data: [],
          type: 'line',
          borderColor: '#ec4899',
          backgroundColor: 'rgba(236, 72, 153, 0.1)',
          borderWidth: 2,
          borderDash: [5, 3],
          pointRadius: 4,
          pointHoverRadius: 6,
          yAxisID: 'y1',
          tension: 0.3,
          hidden: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
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
          type: 'linear',
          display: true,
          position: 'left',
          beginAtZero: true,
          title: {
            display: true,
            text: 'Sessions',
          },
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          beginAtZero: true,
          title: {
            display: true,
            text: 'USP (%)',
          },
          grid: {
            drawOnChartArea: false,
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
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              if (context.parsed.y !== null) {
                if (context.datasetIndex === 1 || context.datasetIndex === 3) {
                  label += context.parsed.y.toFixed(2) + '%';
                } else {
                  label += context.parsed.y.toLocaleString();
                }
              }
              return label;
            }
          },
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
    sessionChart.data.datasets[1].data = series.usp || [];
    sessionChart.data.datasets[2].data = series.lastYearSessions || [];
    sessionChart.data.datasets[3].data = series.lastYearUSP || [];
    sessionChart.data.datasets[2].hidden = !forecastReviewState.showComparison;
    sessionChart.data.datasets[3].hidden = !forecastReviewState.showComparison;
    sessionChart.update();
  }
}

function updateSummaryStats(actualData, forecastData, lastYearData, marketplaceBreakdown) {
  const params = collectForecastFilterParams(document.querySelector('.page-forecast-review'));
  
  // Get filtered summary data
  const summary = DataRepo.getForecastReviewSummary(params);
  
  console.log('Filter params:', params);
  console.log('Summary data:', summary);
  
  // Calculate YoY changes
  const salesChange = summary.lastYearSalesAmount > 0 
    ? ((summary.totalSalesAmount - summary.lastYearSalesAmount) / summary.lastYearSalesAmount * 100).toFixed(1)
    : 0;
  const unitsChange = summary.lastYearSalesUnits > 0
    ? ((summary.totalSalesUnits - summary.lastYearSalesUnits) / summary.lastYearSalesUnits * 100).toFixed(1)
    : 0;
  const sessionsChange = summary.lastYearSessions > 0
    ? ((summary.totalSessions - summary.lastYearSessions) / summary.lastYearSessions * 100).toFixed(1)
    : 0;
  
  // Calculate USP (Unit Session Percentage)
  const usp = summary.totalSessions > 0 
    ? ((summary.totalSalesUnits / summary.totalSessions) * 100).toFixed(2)
    : 0;
  const lastYearUSP = summary.lastYearSessions > 0
    ? ((summary.lastYearSalesUnits / summary.lastYearSessions) * 100).toFixed(2)
    : 0;
  const uspChange = lastYearUSP > 0
    ? ((usp - lastYearUSP) / lastYearUSP * 100).toFixed(1)
    : 0;
  
  // Helper function to get change class
  const getChangeClass = (value) => {
    if (value > 0) return 'forecast-stat-change--up';
    if (value < 0) return 'forecast-stat-change--down';
    return 'forecast-stat-change--neutral';
  };
  
  const getChangeSymbol = (value) => {
    if (value > 0) return '↑';
    if (value < 0) return '↓';
    return '=';
  };
  
  // Update Total Sales
  const totalSalesEl = document.getElementById('forecastTotalSales');
  if (totalSalesEl) {
    totalSalesEl.innerHTML = `
      <div>$${Math.round(summary.totalSalesAmount).toLocaleString()}</div>
      <div class="forecast-stat-change ${getChangeClass(salesChange)}">${getChangeSymbol(salesChange)} ${Math.abs(salesChange)}%</div>
    `;
  }
  
  // Update Total Units
  const totalUnitsEl = document.getElementById('forecastTotalUnits');
  if (totalUnitsEl) {
    totalUnitsEl.innerHTML = `
      <div>${summary.totalSalesUnits.toLocaleString()}</div>
      <div class="forecast-stat-change ${getChangeClass(unitsChange)}">${getChangeSymbol(unitsChange)} ${Math.abs(unitsChange)}%</div>
    `;
  }
  
  // Update Sessions
  const totalSessionsEl = document.getElementById('forecastTotalSessions');
  if (totalSessionsEl) {
    totalSessionsEl.innerHTML = `
      <div>${summary.totalSessions.toLocaleString()}</div>
      <div class="forecast-stat-change ${getChangeClass(sessionsChange)}">${getChangeSymbol(sessionsChange)} ${Math.abs(sessionsChange)}%</div>
    `;
  }
  
  // Update USP
  const uspEl = document.getElementById('forecastUSP');
  if (uspEl) {
    uspEl.innerHTML = `
      <div>${usp}%</div>
      <div class="forecast-stat-change ${getChangeClass(uspChange)}">${getChangeSymbol(uspChange)} ${Math.abs(uspChange)}%</div>
    `;
  }
  
  // Update Forecast Accuracy (mock data for now)
  const today = new Date();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const month1 = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const month2 = new Date(today.getFullYear(), today.getMonth() - 2, 1);
  const month3 = new Date(today.getFullYear(), today.getMonth() - 3, 1);
  
  document.getElementById('fcMonth1').textContent = `${monthNames[month1.getMonth()]} ${month1.getFullYear()}`;
  document.getElementById('fcMonth2').textContent = `${monthNames[month2.getMonth()]} ${month2.getFullYear()}`;
  document.getElementById('fcMonth3').textContent = `${monthNames[month3.getMonth()]} ${month3.getFullYear()}`;
  
  document.getElementById('fcRate1').textContent = '95%';
  document.getElementById('fcRate2').textContent = '92%';
  document.getElementById('fcRate3').textContent = '88%';
  
  // Update Cumulative Goal
  const goalTarget = 5000000;
  const goalCurrent = summary.totalSalesAmount;
  const goalPercentage = ((goalCurrent / goalTarget) * 100).toFixed(1);
  
  document.getElementById('forecastGoalTarget').textContent = `$${goalTarget.toLocaleString()}`;
  document.getElementById('forecastGoalCurrent').textContent = `$${Math.round(goalCurrent).toLocaleString()}`;
  document.getElementById('forecastGoalFill').style.width = `${Math.min(goalPercentage, 100)}%`;
  document.getElementById('forecastGoalPercentage').textContent = `${goalPercentage}%`;
  
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

function toggleFCDetails(index) {
  const details = document.getElementById(`fcDetails${index}`);
  if (details) {
    details.classList.toggle('is-open');
  }
}


// Achievement Summary Functions
function updateAchievementSummary() {
  const params = collectForecastFilterParams(document.querySelector('.page-forecast-review'));
  const data = DataRepo.getForecastReviewData(params);
  
  // Calculate Category Achievement
  const categoryData = calculateCategoryAchievement(data);
  renderCategoryAchievement(categoryData);
  
  // Calculate Top 5 Growth SKUs
  const growthData = calculateTop5Growth(data);
  renderTop5Growth(growthData);
  
  // Calculate Top 5 Worst SKUs
  const worstData = calculateTop5Worst(data);
  renderTop5Worst(worstData);
}

function calculateCategoryAchievement(data) {
  const categories = {};
  
  data.forEach(item => {
    if (!categories[item.category]) {
      categories[item.category] = { actual: 0, forecast: 0, series: {} };
    }
    
    if (!categories[item.category].series[item.series]) {
      categories[item.category].series[item.series] = { actual: 0, forecast: 0, units: 0, forecastUnits: 0 };
    }
    
    const rate = exchangeRates[item.currency] || 1;
    const variance = 0.8 + Math.random() * 0.4;
    
    categories[item.category].actual += item.salesAmount * rate;
    categories[item.category].forecast += (item.forecastAmount || Math.round(item.salesAmount * variance)) * rate;
    categories[item.category].series[item.series].actual += item.salesAmount * rate;
    categories[item.category].series[item.series].forecast += (item.forecastAmount || Math.round(item.salesAmount * variance)) * rate;
    categories[item.category].series[item.series].units += item.salesUnits;
    categories[item.category].series[item.series].forecastUnits += item.forecastUnits || Math.round(item.salesUnits * variance);
  });
  
  return Object.keys(categories).map(category => ({
    name: category,
    actual: categories[category].actual,
    forecast: categories[category].forecast,
    achievement: categories[category].forecast > 0 
      ? (categories[category].actual / categories[category].forecast * 100) 
      : 0,
    series: Object.keys(categories[category].series).map(seriesName => ({
      name: seriesName,
      actual: categories[category].series[seriesName].actual,
      forecast: categories[category].series[seriesName].forecast,
      units: categories[category].series[seriesName].units,
      forecastUnits: categories[category].series[seriesName].forecastUnits,
      achievement: categories[category].series[seriesName].forecast > 0
        ? (categories[category].series[seriesName].actual / categories[category].series[seriesName].forecast * 100)
        : 0
    }))
  })).sort((a, b) => a.achievement - b.achievement);
}

function calculateTop5Growth(data) {
  const skus = {};
  
  data.forEach(item => {
    if (!skus[item.sku]) {
      skus[item.sku] = { actual: 0, forecast: 0 };
    }
    
    const rate = exchangeRates[item.currency] || 1;
    const variance = 0.8 + Math.random() * 0.4;
    
    skus[item.sku].actual += item.salesAmount * rate;
    skus[item.sku].forecast += (item.forecastAmount || Math.round(item.salesAmount * variance)) * rate;
  });
  
  return Object.keys(skus)
    .map(sku => ({
      name: sku,
      actual: skus[sku].actual,
      forecast: skus[sku].forecast,
      achievement: skus[sku].forecast > 0 
        ? (skus[sku].actual / skus[sku].forecast * 100) 
        : 0
    }))
    .filter(item => item.forecast > 0)
    .sort((a, b) => b.achievement - a.achievement)
    .slice(0, 5);
}

function calculateTop5Worst(data) {
  const skus = {};
  
  data.forEach(item => {
    if (!skus[item.sku]) {
      skus[item.sku] = { actual: 0, forecast: 0 };
    }
    
    const rate = exchangeRates[item.currency] || 1;
    const variance = 0.8 + Math.random() * 0.4;
    
    skus[item.sku].actual += item.salesAmount * rate;
    skus[item.sku].forecast += (item.forecastAmount || Math.round(item.salesAmount * variance)) * rate;
  });
  
  return Object.keys(skus)
    .map(sku => ({
      name: sku,
      actual: skus[sku].actual,
      forecast: skus[sku].forecast,
      achievement: skus[sku].forecast > 0 
        ? (skus[sku].actual / skus[sku].forecast * 100) 
        : 0
    }))
    .filter(item => item.forecast > 0)
    .sort((a, b) => a.achievement - b.achievement)
    .slice(0, 5);
}

function renderCategoryAchievement(data) {
  const container = document.getElementById('categoryAchievementList');
  if (!container) return;
  
  if (data.length === 0) {
    container.innerHTML = '<div class="forecast-achievement-empty">No data available</div>';
    return;
  }
  
  container.innerHTML = data.map((item, index) => {
    const achievement = item.achievement.toFixed(1);
    const fillWidth = Math.min(achievement, 100);
    const fillClass = achievement >= 100 ? 'forecast-achievement-progress-fill--over' : 'forecast-achievement-progress-fill--normal';
    
    const seriesDetails = item.series.map(series => {
      const seriesAchievement = series.achievement.toFixed(1);
      return `
        <div class="forecast-achievement-detail-row">
          <span class="forecast-detail-col-series">${series.name}</span>
          <span class="forecast-detail-col-fc">${series.forecastUnits.toLocaleString()}</span>
          <span class="forecast-detail-col-actual">${series.units.toLocaleString()}</span>
          <span class="forecast-detail-col-rate">${seriesAchievement}%</span>
        </div>
      `;
    }).join('');
    
    return `
      <div class="forecast-achievement-item">
        <div class="forecast-achievement-item-header" onclick="toggleCategoryDetails(${index})" style="cursor: pointer;">
          <span class="forecast-achievement-item-name">${item.name}</span>
          <span class="forecast-achievement-item-value">${achievement}%</span>
        </div>
        <div class="forecast-achievement-progress">
          <div class="forecast-achievement-progress-fill ${fillClass}" style="width: ${fillWidth}%"></div>
        </div>
        <div class="forecast-achievement-details" id="categoryDetails${index}">
          <div class="forecast-achievement-detail-row forecast-achievement-detail-header">
            <span class="forecast-detail-col-series">Series</span>
            <span class="forecast-detail-col-fc">FC Units</span>
            <span class="forecast-detail-col-actual">Actual Units</span>
            <span class="forecast-detail-col-rate">達成率</span>
          </div>
          ${seriesDetails}
        </div>
      </div>
    `;
  }).join('');
}

function toggleCategoryDetails(index) {
  const details = document.getElementById(`categoryDetails${index}`);
  if (details) {
    details.classList.toggle('is-open');
  }
}

function renderTop5Growth(data) {
  const container = document.getElementById('top5GrowthList');
  if (!container) return;
  
  if (data.length === 0) {
    container.innerHTML = '<div class="forecast-achievement-empty">No data available</div>';
    return;
  }
  
  container.innerHTML = data.map(item => {
    const achievement = item.achievement.toFixed(1);
    const fillWidth = Math.min(achievement, 100);
    const fillClass = achievement >= 100 ? 'forecast-achievement-progress-fill--over' : 'forecast-achievement-progress-fill--normal';
    
    return `
      <div class="forecast-achievement-item">
        <div class="forecast-achievement-item-header">
          <span class="forecast-achievement-item-name">${item.name}</span>
          <span class="forecast-achievement-item-value">${achievement}%</span>
        </div>
        <div class="forecast-achievement-progress">
          <div class="forecast-achievement-progress-fill ${fillClass}" style="width: ${fillWidth}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderTop5Worst(data) {
  const container = document.getElementById('top5WorstList');
  if (!container) return;
  
  if (data.length === 0) {
    container.innerHTML = '<div class="forecast-achievement-empty">No data available</div>';
    return;
  }
  
  container.innerHTML = data.map(item => {
    const achievement = item.achievement.toFixed(1);
    const fillWidth = Math.min(achievement, 100);
    const fillClass = achievement < 80 ? 'forecast-achievement-progress-fill--warning' : 'forecast-achievement-progress-fill--normal';
    
    return `
      <div class="forecast-achievement-item">
        <div class="forecast-achievement-item-header">
          <span class="forecast-achievement-item-name">${item.name}</span>
          <span class="forecast-achievement-item-value">${achievement}%</span>
        </div>
        <div class="forecast-achievement-progress">
          <div class="forecast-achievement-progress-fill ${fillClass}" style="width: ${fillWidth}%"></div>
        </div>
      </div>
    `;
  }).join('');
}
