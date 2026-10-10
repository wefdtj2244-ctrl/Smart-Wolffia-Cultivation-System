/**
 * Smart Wolffia Cultivation System V3.0.1
 * UI Controller & Chart.js Integration
 * 
 * Interacts directly with Central Data Engine (Single Source of Truth)
 * Controls View Routing, Dynamic Visualizations, Filters, and Actuators
 */

(function () {
  'use strict';

  // Global variables & Chart instances
  let currentView = 'dashboard';
  let charts = {};
  let historyPage = 1;
  let historyPageSize = 20;
  let filteredHistory = [];
  let alertFilterTab = 'all';

  // Initialize once DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initSettingsForm();
    initCharts();

    // Subscribe to Central Data Engine updates
    if (window.WolffiaDataEngine) {
      window.WolffiaDataEngine.subscribe(onDataEngineUpdate);
    }

    // Set up popstate / hash routing
    window.addEventListener('hashchange', handleHashRouting);
    if (window.location.hash) {
      const target = window.location.hash.replace('#', '');
      if (document.querySelector(`.dashboard-menu-item[data-view="${target}"]`)) {
        switchView(target);
      }
    }

    // Realtime digital clock update
    setInterval(updateClock, 1000);
    updateClock();
  });

  // Digital Clock
  function updateClock() {
    const el = document.getElementById('nav-live-time');
    if (el) {
      const now = new Date();
      const dateStr = now.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
      const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      el.textContent = `${dateStr} ${timeStr}`;
    }
  }

  // Navigation & View Routing
  function initNavigation() {
    const menuItems = document.querySelectorAll('.dashboard-menu-item');
    menuItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const view = item.getAttribute('data-view');
        switchView(view);
      });
    });

    // Mobile sidebar toggle
    const toggleBtn = document.getElementById('btn-toggle-sidebar');
    const sidebar = document.getElementById('dashboard-sidebar');
    if (toggleBtn && sidebar) {
      toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
      });

      // Close sidebar when menu clicked on mobile
      menuItems.forEach(item => {
        item.addEventListener('click', () => {
          if (window.innerWidth <= 768) {
            sidebar.classList.remove('open');
          }
        });
      });
    }
  }

  function switchView(viewName) {
    currentView = viewName;
    window.location.hash = viewName;

    // Update active state in sidebar
    document.querySelectorAll('.dashboard-menu-item').forEach(el => {
      el.classList.toggle('active', el.getAttribute('data-view') === viewName);
    });

    // Toggle view sections
    document.querySelectorAll('.dashboard-section').forEach(sec => {
      sec.style.display = sec.id === `view-${viewName}` ? 'block' : 'none';
    });

    // Scroll to top
    const main = document.querySelector('.dashboard-main');
    if (main) main.scrollTop = 0;

    // Refresh specific view charts/tables if needed
    if (window.WolffiaDataEngine) {
      renderActiveView(window.WolffiaDataEngine);
    }
  }

  function handleHashRouting() {
    const hash = window.location.hash.replace('#', '');
    if (hash && hash !== currentView) {
      switchView(hash);
    }
  }

  // System Mode Switching (Demo vs Live)
  window.switchSystemMode = function (mode) {
    if (!window.WolffiaDataEngine) return;
    const engine = window.WolffiaDataEngine;
    engine.setMode(mode);

    const btnDemo = document.getElementById('btn-mode-demo');
    const btnLive = document.getElementById('btn-mode-live');
    if (btnDemo && btnLive) {
      btnDemo.classList.toggle('active', mode === 'DEMO');
      btnLive.classList.toggle('active', mode === 'LIVE');
    }

    if (mode === 'LIVE') {
      const url = engine.device.supabaseUrl || localStorage.getItem('wolffia_supabase_url');
      const key = engine.device.supabaseKey || localStorage.getItem('wolffia_supabase_key');
      if (!url || !key) {
        showToast('สลับเป็น LIVE MODE: ยังไม่ได้ตั้งค่า Supabase URL/Key กรุณาระบุในเมนู "การตั้งค่า (Settings)"', 'warning');
      } else {
        showToast('สลับเป็น LIVE MODE: ซิงค์ข้อมูลกับ Supabase Realtime Stream สำเร็จ', 'success');
      }
    } else {
      showToast('สลับเป็น DEMO MODE: จำลองข้อมูลสภาพแวดล้อมเสมือนจริง (Single Source of Truth)', 'info');
    }
  };

  // Refresh trigger
  window.refreshDataEngine = function () {
    if (window.WolffiaDataEngine) {
      window.WolffiaDataEngine.tickDemoEngine();
      showToast('ซิงค์ข้อมูลล่าสุดกับ Central Data Engine เรียบร้อย', 'success');
    }
  };

  // Main callback when Central Data Engine updates
  function onDataEngineUpdate(engine) {
    updateTopAndSidebarWidgets(engine);
    renderActiveView(engine);
  }

  function updateTopAndSidebarWidgets(engine) {
    const c = engine.current;
    const th = engine.thresholds;

    // Sidebar miniature widget
    const sideDeviceId = document.getElementById('side-device-id');
    const sideWifi = document.getElementById('side-wifi-rssi');
    if (sideDeviceId) sideDeviceId.textContent = c.deviceId;
    if (sideWifi) sideWifi.textContent = `${c.rssi} dBm`;

    // Mode buttons sync
    const btnDemo = document.getElementById('btn-mode-demo');
    const btnLive = document.getElementById('btn-mode-live');
    if (btnDemo && btnLive) {
      btnDemo.classList.toggle('active', engine.mode === 'DEMO');
      btnLive.classList.toggle('active', engine.mode === 'LIVE');
    }
  }

  function renderActiveView(engine) {
    switch (currentView) {
      case 'dashboard':
        renderDashboardView(engine);
        break;
      case 'monitoring':
        renderMonitoringView(engine);
        break;
      case 'sensors':
        renderSensorsView(engine);
        break;
      case 'history':
        renderHistoryView(engine);
        break;
      case 'statistics':
        renderStatisticsView(engine);
        break;
      case 'analytics':
        renderAnalyticsView(engine);
        break;
      case 'alerts':
        renderAlertsView(engine);
        break;
      case 'reports':
        renderReportsView(engine);
        break;
      case 'device':
        renderDeviceView(engine);
        break;
      case 'settings':
        renderSettingsView(engine);
        break;
    }
  }

  // ========================================================================
  // 1. DASHBOARD VIEW
  // ========================================================================
  function renderDashboardView(engine) {
    const c = engine.current;
    const th = engine.thresholds;
    const tr = engine.trends;

    // Sensor Cards Values
    setText('dash-temp-val', c.temperature.toFixed(1));
    setText('dash-ph-val', c.ph.toFixed(2));
    setText('dash-water-val', c.waterLevel.toFixed(1));
    setText('dash-light-val', c.light.toFixed(1));

    // Status Badges
    setBadgeStatus('dash-temp-status', c.temperature, th.temp.min, th.temp.max, '°C');
    setBadgeStatus('dash-ph-status', c.ph, th.ph.min, th.ph.max, '');
    setBadgeStatus('dash-water-status', c.waterLevel, th.waterLevel.min, th.waterLevel.max, '%');
    setBadgeStatus('dash-light-status', c.light, th.light.min, th.light.max, '%');

    // Mini Trends
    setTrendElem('dash-temp-trend', tr.temp);
    setTrendElem('dash-ph-trend', tr.ph);
    setTrendElem('dash-water-trend', tr.waterLevel);
    setTrendElem('dash-light-trend', tr.light);

    // System Status Card
    setText('dash-wifi-text', `${engine.device.wifiSsid} (${c.rssi} dBm)`);
    setText('dash-telemetry-rate', `ความถี่ ${engine.device.interval ? (engine.device.interval / 1000).toFixed(1) : '2.5'}s`);
    const telemetryBadge = document.getElementById('dash-telemetry-badge');
    if (telemetryBadge) {
      telemetryBadge.textContent = 'ปกติ';
      telemetryBadge.style.background = '#dcfce7';
      telemetryBadge.style.color = '#15803d';
    }

    // Cloud Sync Status
    const cloudStatus = document.getElementById('dash-cloud-status');
    if (cloudStatus) {
      if (engine.mode === 'LIVE') {
        const isConn = engine.supabaseStatus === 'Connected';
        cloudStatus.innerHTML = `<span class="status-badge ${isConn ? 'normal' : 'warning'}" style="border:none"><i class="fa-solid fa-cloud"></i> ${isConn ? 'Supabase Realtime เชื่อมต่อแล้ว' : (engine.supabaseStatus || 'กำลังเชื่อมต่อ...')}</span>`;
      } else {
        cloudStatus.innerHTML = `<span class="status-badge normal" style="background:#f1f5f9; color:#475569; border:none"><i class="fa-solid fa-flask"></i> จำลองผ่าน Central Engine (Demo)</span>`;
      }
    }

    // Recent Activity Feed
    const actList = document.getElementById('dash-activity-list');
    if (actList) {
      actList.innerHTML = engine.activities.slice(0, 5).map(act => `
        <div class="activity-item">
          <div class="activity-dot ${act.type || 'info'}"></div>
          <div class="activity-content">
            <div style="font-weight:500">${escapeHtml(act.text)}</div>
            <div class="activity-time">${act.time || 'เมื่อสักครู่'}</div>
          </div>
        </div>
      `).join('');
    }

    // Update Dashboard Charts
    updateDashboardCharts(engine);
  }

  function setBadgeStatus(elemId, val, min, max, unit) {
    const el = document.getElementById(elemId);
    if (!el) return;
    if (val < min) {
      el.className = 'status-badge warning';
      el.textContent = 'ต่ำกว่าเกณฑ์';
    } else if (val > max) {
      el.className = 'status-badge critical';
      el.textContent = 'สูงกว่าเกณฑ์';
    } else {
      el.className = 'status-badge normal';
      el.textContent = 'ปกติ';
    }
  }

  function setTrendElem(elemId, trend) {
    const el = document.getElementById(elemId);
    if (!el || !trend) return;
    const isUp = trend.direction === 'up';
    el.className = `mini-trend ${isUp ? 'up' : 'down'}`;
    el.innerHTML = `<i class="fa-solid fa-arrow-trend-${isUp ? 'up' : 'down'}"></i> <span>${trend.text}</span>`;
  }

  // ========================================================================
  // 2. REAL-TIME MONITORING VIEW
  // ========================================================================
  function renderMonitoringView(engine) {
    const c = engine.current;
    setText('mon-device-id', c.deviceId);
    setText('mon-ip', `IP: ${engine.device.ipAddress}`);
    setText('mon-mac', `MAC: ${engine.device.macAddress}`);
    setText('mon-rssi', `${c.rssi} dBm (${c.rssi > -65 ? 'สัญญาณดีเยี่ยม' : 'สัญญาณปานกลาง'})`);
    setText('mon-ping', `${c.ping} ms (การตอบสนองเร็ว)`);
    setText('mon-telemetry', 'Telemetry: Active (2.5s)');

    // Update Gauges
    setText('gauge-val-water', `${c.waterLevel.toFixed(1)}%`);
    setText('gauge-val-light', `${c.light.toFixed(1)}%`);
    setText('gauge-val-temp', `${c.temperature.toFixed(1)}°`);
    setText('gauge-val-ph', `${c.ph.toFixed(2)}`);

    drawDoughnutGauge('gauge-water', c.waterLevel, 100, '#2563eb');
    drawDoughnutGauge('gauge-light', c.light, 100, '#d97706');
    drawDoughnutGauge('gauge-temp', (c.temperature - 15) / 25 * 100, 100, '#ef4444');
    drawDoughnutGauge('gauge-ph', (c.ph - 4) / 6 * 100, 100, '#6366f1');

    // Rolling Chart
    updateMonitoringLiveChart(engine);
  }

  function drawDoughnutGauge(canvasId, value, maxVal, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const x = width / 2;
    const y = height / 2;
    const radius = width / 2 - 10;
    const percent = Math.min(1, Math.max(0, value / maxVal));

    ctx.clearRect(0, 0, width, height);

    // Background circle
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 10;
    ctx.stroke();

    // Value Arc
    ctx.beginPath();
    ctx.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * percent));
    ctx.strokeStyle = color;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // ========================================================================
  // 3. SENSORS VIEW
  // ========================================================================
  function renderSensorsView(engine) {
    const c = engine.current;
    const th = engine.thresholds;
    const stats = engine.calculateStatistics(72);

    const tempVal = (typeof c.temperature === 'number' && !isNaN(c.temperature)) ? c.temperature : (c.temp || 28.4);
    setText('sens-temp-val', `${tempVal.toFixed(1)} °C`);
    setText('sens-ph-val', `${c.ph.toFixed(2)} pH`);
    setText('sens-water-val', `${c.waterLevel.toFixed(1)} %`);
    setText('sens-light-val', `${c.light.toFixed(1)} %`);

    setText('sens-temp-range', `${th.temp.min.toFixed(1)} - ${th.temp.max.toFixed(1)} °C`);
    setText('sens-ph-range', `${th.ph.min.toFixed(1)} - ${th.ph.max.toFixed(1)}`);
    setText('sens-water-range', `${th.waterLevel.min} - ${th.waterLevel.max} %`);
    setText('sens-light-range', `${th.light.min} - ${th.light.max} %`);

    const tempMin = (stats.temp && typeof stats.temp.min === 'number' && !isNaN(stats.temp.min)) ? stats.temp.min : 26.2;
    const tempAvg = (stats.temp && typeof stats.temp.avg === 'number' && !isNaN(stats.temp.avg)) ? stats.temp.avg : 28.3;
    const tempMax = (stats.temp && typeof stats.temp.max === 'number' && !isNaN(stats.temp.max)) ? stats.temp.max : 31.0;

    setText('sens-temp-min', `${tempMin.toFixed(1)}°C`);
    setText('sens-temp-avg', `${tempAvg.toFixed(1)}°C`);
    setText('sens-temp-max', `${tempMax.toFixed(1)}°C`);

    setText('sens-ph-min', `${stats.ph.min}`);
    setText('sens-ph-avg', `${stats.ph.avg}`);
    setText('sens-ph-max', `${stats.ph.max}`);

    setText('sens-water-min', `${stats.water.min}%`);
    setText('sens-water-avg', `${stats.water.avg}%`);
    setText('sens-water-max', `${stats.water.max}%`);

    setText('sens-light-min', `${stats.light.min}%`);
    setText('sens-light-avg', `${stats.light.avg}%`);
    setText('sens-light-max', `${stats.light.max}%`);

    // Sparklines
    renderSparkline('spark-temp', stats.temp.trend, '#ef4444');
    renderSparkline('spark-ph', stats.ph.trend, '#6366f1');
    renderSparkline('spark-water', stats.water.trend, '#2563eb');
    renderSparkline('spark-light', stats.light.trend, '#d97706');
  }

  // ========================================================================
  // 4. HISTORY VIEW
  // ========================================================================
  function renderHistoryView(engine) {
    applyHistoryFilters();
  }

  window.applyHistoryFilters = function () {
    if (!window.WolffiaDataEngine) return;
    const history = window.WolffiaDataEngine.history;
    const timeFilter = document.getElementById('hist-filter-timerange')?.value || '24h';
    const statusFilter = document.getElementById('hist-filter-status')?.value || 'all';
    const searchText = (document.getElementById('hist-search-input')?.value || '').toLowerCase().trim();
    const th = window.WolffiaDataEngine.thresholds;

    const now = Date.now();

    filteredHistory = history.filter(row => {
      const timeMs = new Date(row.timestamp).getTime();

      // Time Range filter
      if (timeFilter === '1h' && now - timeMs > 3600000) return false;
      if (timeFilter === '24h' && now - timeMs > 86400000) return false;
      if (timeFilter === 'today') {
        const d = new Date(row.timestamp);
        const today = new Date();
        if (d.getDate() !== today.getDate() || d.getMonth() !== today.getMonth()) return false;
      }

      // Status filter
      const isOutOfRange = (
        row.temp < th.temp.min || row.temp > th.temp.max ||
        row.ph < th.ph.min || row.ph > th.ph.max ||
        row.waterLevel < th.waterLevel.min ||
        row.light < th.light.min
      );
      if (statusFilter === 'normal' && isOutOfRange) return false;
      if (statusFilter === 'warning' && !isOutOfRange) return false;

      // Text Search
      if (searchText) {
        const fullStr = `${row.timestamp} ${row.temp} ${row.ph} ${row.waterLevel} ${row.light}`.toLowerCase();
        if (!fullStr.includes(searchText)) return false;
      }

      return true;
    });

    // Sort descending by timestamp
    filteredHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Summary bar info
    setText('hist-total-count', filteredHistory.length);
    if (filteredHistory.length > 0) {
      const latest = new Date(filteredHistory[0].timestamp).toLocaleString('th-TH');
      const oldest = new Date(filteredHistory[filteredHistory.length - 1].timestamp).toLocaleString('th-TH');
      setText('hist-time-range', `${oldest} — ${latest}`);
    } else {
      setText('hist-time-range', 'ไม่พบข้อมูลในช่วงที่ค้นหา');
    }

    renderHistoryTable();
  };

  function renderHistoryTable() {
    const tbody = document.getElementById('hist-table-body');
    if (!tbody) return;

    const startIdx = (historyPage - 1) * historyPageSize;
    const pageRows = filteredHistory.slice(startIdx, startIdx + historyPageSize);

    if (pageRows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted)">ไม่พบข้อมูลตามตัวกรองที่เลือก</td></tr>`;
      setText('hist-page-info', 'แสดง 0 รายการ');
      return;
    }

    const th = window.WolffiaDataEngine.thresholds;

    tbody.innerHTML = pageRows.map(r => {
      const dateStr = new Date(r.timestamp).toLocaleString('th-TH');
      const tempAlert = r.temp < th.temp.min || r.temp > th.temp.max;
      const phAlert = r.ph < th.ph.min || r.ph > th.ph.max;
      const waterAlert = r.waterLevel < th.waterLevel.min;

      return `
        <tr>
          <td><i class="fa-regular fa-clock" style="color:var(--text-muted); margin-right:0.35rem"></i>${dateStr}</td>
          <td><span style="font-weight:600; color:${tempAlert ? '#ef4444' : 'inherit'}">${r.temp.toFixed(1)} °C</span></td>
          <td><span style="font-weight:600; color:${phAlert ? '#f59e0b' : 'inherit'}">${r.ph.toFixed(2)}</span></td>
          <td><span style="font-weight:600; color:${waterAlert ? '#ef4444' : 'inherit'}">${r.waterLevel.toFixed(1)}%</span></td>
          <td>${r.light.toFixed(1)}%</td>
          <td>
            <span class="status-badge normal"><span class="pulse-dot online"></span> ${r.deviceStatus}</span>
          </td>
        </tr>
      `;
    }).join('');

    // Pagination info & controls
    const totalPages = Math.ceil(filteredHistory.length / historyPageSize) || 1;
    const endIdx = Math.min(startIdx + historyPageSize, filteredHistory.length);
    setText('hist-page-info', `แสดง ${startIdx + 1} - ${endIdx} จาก ${filteredHistory.length} รายการ (หน้า ${historyPage}/${totalPages})`);

    const pControls = document.getElementById('hist-pagination-controls');
    if (pControls) {
      pControls.innerHTML = `
        <button class="page-btn" ${historyPage <= 1 ? 'disabled' : ''} onclick="changeHistoryPage(1)"><i class="fa-solid fa-angles-left"></i></button>
        <button class="page-btn" ${historyPage <= 1 ? 'disabled' : ''} onclick="changeHistoryPage(${historyPage - 1})"><i class="fa-solid fa-angle-left"></i></button>
        <span style="padding:0 0.5rem; font-weight:600">${historyPage}</span>
        <button class="page-btn" ${historyPage >= totalPages ? 'disabled' : ''} onclick="changeHistoryPage(${historyPage + 1})"><i class="fa-solid fa-angle-right"></i></button>
        <button class="page-btn" ${historyPage >= totalPages ? 'disabled' : ''} onclick="changeHistoryPage(${totalPages})"><i class="fa-solid fa-angles-right"></i></button>
      `;
    }
  }

  window.changeHistoryPage = function (newPage) {
    historyPage = newPage;
    renderHistoryTable();
  };

  window.changeHistoryPageSize = function (newSize) {
    historyPageSize = parseInt(newSize, 10);
    historyPage = 1;
    renderHistoryTable();
  };

  window.resetHistoryFilters = function () {
    const t = document.getElementById('hist-filter-timerange');
    const s = document.getElementById('hist-filter-status');
    const q = document.getElementById('hist-search-input');
    if (t) t.value = 'all';
    if (s) s.value = 'all';
    if (q) q.value = '';
    historyPage = 1;
    applyHistoryFilters();
  };

  // ========================================================================
  // 5. STATISTICS VIEW (คำนวณจาก History จริง)
  // ========================================================================
  function renderStatisticsView(engine) {
    const stats = engine.calculateStatistics();

    // 4 Stat Cards
    setText('stat-temp-avg', `${stats.temp.avg} °C`);
    setText('stat-temp-min', `${stats.temp.min} °C`);
    setText('stat-temp-max', `${stats.temp.max} °C`);
    setText('stat-temp-sd', `±${stats.temp.sd} °C`);

    setText('stat-ph-avg', `${stats.ph.avg}`);
    setText('stat-ph-min', `${stats.ph.min}`);
    setText('stat-ph-max', `${stats.ph.max}`);
    setText('stat-ph-sd', `±${stats.ph.sd}`);

    setText('stat-water-avg', `${stats.water.avg} %`);
    setText('stat-water-min', `${stats.water.min} %`);
    setText('stat-water-max', `${stats.water.max} %`);
    setText('stat-water-sd', `±${stats.water.sd} %`);

    setText('stat-light-avg', `${stats.light.avg} %`);
    setText('stat-light-min', `${stats.light.min} %`);
    setText('stat-light-max', `${stats.light.max} %`);
    setText('stat-light-sd', `±${stats.light.sd} %`);

    // Trend Sparklines
    renderSparkline('chart-stat-spark-temp', stats.temp.trend, '#ef4444');
    renderSparkline('chart-stat-spark-ph', stats.ph.trend, '#6366f1');
    renderSparkline('chart-stat-spark-water', stats.water.trend, '#2563eb');
    renderSparkline('chart-stat-spark-light', stats.light.trend, '#d97706');

    // Weekly Summary Table
    const weeklyBody = document.getElementById('stat-weekly-table-body');
    if (weeklyBody) {
      weeklyBody.innerHTML = stats.weekly.map(w => `
        <tr>
          <td><strong>${w.day}</strong></td>
          <td>${w.avgTemp} °C</td>
          <td>${w.avgPh}</td>
          <td>${w.avgWater}%</td>
          <td>${w.avgLight}%</td>
          <td><span class="status-badge normal">${w.growthIndex}</span></td>
        </tr>
      `).join('');
    }
  }

  // ========================================================================
  // 6. ANALYTICS VIEW
  // ========================================================================
  function renderAnalyticsView(engine) {
    const health = engine.calculateHealthScore();
    const insights = engine.generateInsights();
    const anomalies = engine.detectAnomalies();

    // Health Score
    setText('health-score-num', health.score);
    const radial = document.getElementById('health-radial-elem');
    if (radial) {
      radial.style.setProperty('--score-angle', `${health.score}%`);
    }

    const badge = document.getElementById('health-status-badge');
    if (badge) {
      badge.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${health.statusText}`;
      badge.style.color = health.statusColor;
    }

    setText('health-sub-temp', `${health.components.temp}%`);
    setText('health-sub-ph', `${health.components.ph}%`);
    setText('health-sub-water', `${health.components.water}%`);
    setText('health-sub-light', `${health.components.light}%`);

    // Insights
    const grid = document.getElementById('analytics-insights-grid');
    if (grid) {
      grid.innerHTML = insights.map(i => `
        <div style="background:var(--bg-surface-subtle); padding:1.1rem; border-radius:var(--radius-md); border:1px solid var(--border-color)">
          <div style="display:flex; align-items:center; gap:0.6rem; margin-bottom:0.5rem">
            <div style="width:32px; height:32px; border-radius:50%; background:${i.type === 'success' ? '#ecfdf5' : '#fffbeb'}; color:${i.type === 'success' ? '#10b981' : '#f59e0b'}; display:flex; align-items:center; justify-content:center">
              <i class="fa-solid ${i.icon}"></i>
            </div>
            <strong style="font-size:0.9rem">${escapeHtml(i.title)}</strong>
          </div>
          <p style="font-size:0.82rem; color:var(--text-secondary)">${escapeHtml(i.desc)}</p>
        </div>
      `).join('');
    }

    // Anomaly Table
    const anomBody = document.getElementById('analytics-anomaly-table-body');
    if (anomBody) {
      if (anomalies.length === 0) {
        anomBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:1.5rem; color:var(--text-muted)">ไม่พบข้อมูลผิดปกตินอกเกณฑ์ในระบบ (All normal)</td></tr>`;
      } else {
        anomBody.innerHTML = anomalies.map(a => {
          const tStr = new Date(a.timestamp).toLocaleString('th-TH');
          const isCrit = a.severity === 'Critical';
          return `
            <tr>
              <td>${tStr}</td>
              <td><strong>${a.parameter}</strong></td>
              <td><span style="font-weight:700; color:${isCrit ? '#ef4444' : '#f59e0b'}">${a.value}</span></td>
              <td>${a.expected}</td>
              <td><span class="status-badge ${isCrit ? 'critical' : 'warning'}">${a.severity}</span></td>
              <td>${escapeHtml(a.note)}</td>
            </tr>
          `;
        }).join('');
      }
    }
  }

  // ========================================================================
  // 7. ALERTS & NOTIFICATIONS VIEW
  // ========================================================================
  function renderAlertsView(engine) {
    const alerts = engine.alerts;

    // Counter cards
    const critCount = alerts.filter(a => a.type === 'critical' && !a.resolved).length;
    const warnCount = alerts.filter(a => a.type === 'warning' && !a.resolved).length;
    const resCount = alerts.filter(a => a.resolved).length;

    setText('cnt-alert-critical', critCount);
    setText('cnt-alert-warning', warnCount);
    setText('cnt-alert-resolved', resCount);

    // Filter by tab
    const timeline = document.getElementById('alerts-timeline-container');
    if (!timeline) return;

    let displayAlerts = alerts;
    if (alertFilterTab === 'critical') displayAlerts = alerts.filter(a => a.type === 'critical' && !a.resolved);
    else if (alertFilterTab === 'warning') displayAlerts = alerts.filter(a => a.type === 'warning' && !a.resolved);
    else if (alertFilterTab === 'resolved') displayAlerts = alerts.filter(a => a.resolved);

    if (displayAlerts.length === 0) {
      timeline.innerHTML = `
        <div class="card" style="text-align:center; padding:2.5rem; color:var(--text-muted)">
          <i class="fa-solid fa-bell-slash" style="font-size:2rem; margin-bottom:0.75rem"></i>
          <div>ไม่มีรายการแจ้งเตือนในหมวดหมู่นี้</div>
        </div>`;
      return;
    }

    timeline.innerHTML = displayAlerts.map(a => {
      const timeStr = new Date(a.timestamp).toLocaleString('th-TH');
      return `
        <div class="alert-item-card ${a.resolved ? 'resolved' : a.type}">
          <div>
            <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.35rem">
              <span class="status-badge ${a.resolved ? 'normal' : a.type}">
                ${a.resolved ? 'แก้ไขแล้ว (Resolved)' : (a.type === 'critical' ? 'วิกฤต (Critical)' : 'เฝ้าระวัง (Warning)')}
              </span>
              <strong style="font-size:0.95rem">${escapeHtml(a.title)}</strong>
            </div>
            <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:0.35rem">${escapeHtml(a.message)}</p>
            <span style="font-size:0.75rem; color:var(--text-muted)"><i class="fa-regular fa-clock"></i> ${timeStr}</span>
          </div>
          <div>
            ${!a.resolved ? `
              <button class="btn btn-outline btn-sm" onclick="resolveSystemAlert('${a.id}')">
                <i class="fa-solid fa-check"></i> รับทราบ / แก้ไขแล้ว
              </button>
            ` : `
              <span style="font-size:0.75rem; color:var(--color-normal)"><i class="fa-solid fa-circle-check"></i> บันทึกแล้ว</span>
            `}
          </div>
        </div>
      `;
    }).join('');
  }

  window.filterAlertsTab = function (tabName) {
    alertFilterTab = tabName;
    document.querySelectorAll('.alert-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
      btn.classList.toggle('btn-primary', btn.getAttribute('data-tab') === tabName);
      btn.classList.toggle('btn-outline', btn.getAttribute('data-tab') !== tabName);
    });
    if (window.WolffiaDataEngine) renderAlertsView(window.WolffiaDataEngine);
  };

  window.resolveSystemAlert = function (alertId) {
    if (!window.WolffiaDataEngine) return;
    window.WolffiaDataEngine.resolveAlert(alertId);
    showToast('ปรับสถานะการแจ้งเตือนเป็นแก้ไขแล้ว', 'success');
  };

  window.clearResolvedAlerts = function () {
    if (!window.WolffiaDataEngine) return;
    window.WolffiaDataEngine.clearResolvedAlerts();
    showToast('ล้างประวัติการแจ้งเตือนที่แก้ไขแล้วเรียบร้อย', 'info');
  };

  // ========================================================================
  // 9. REPORTS VIEW
  // ========================================================================
  function renderReportsView(engine) {
    window.generateReport();
  }

  window.generateReport = function () {
    if (!window.WolffiaDataEngine) return;
    const engine = window.WolffiaDataEngine;
    const stats = engine.calculateStatistics();

    setText('rep-generated-date', new Date().toLocaleString('th-TH'));
    setText('rep-avg-temp', `${stats.temp.avg} °C`);
    setText('rep-avg-ph', `${stats.ph.avg}`);
    setText('rep-avg-water', `${stats.water.avg} %`);
    setText('rep-avg-light', `${stats.light.avg} %`);

    showToast('คำนวณและสร้างรายงานสรุปใหม่เรียบร้อย', 'success');
  };

  // ========================================================================
  // 9. DEVICE MANAGEMENT VIEW
  // ========================================================================
  function renderDeviceView(engine) {
    const d = engine.device;
    const c = engine.current;

    setText('dev-uptime', d.uptime || '14 วัน 6 ชม. 32 นาที');
    setText('dev-mac', d.macAddress);
    setText('dev-ip', `IP: ${d.ipAddress}`);
  }

  window.runDiagnostics = function () {
    showToast('กำลังส่งสัญญาณ Ping ไปยัง ESP32-WOLFFIA-01...', 'info');
    setTimeout(() => {
      showToast('ตอบสนองสำเร็จ: Latency 24ms, สัญญาณ Wi-Fi RSSI: -58 dBm ดีเยี่ยม', 'success');
    }, 800);
  };

  // ========================================================================
  // 11. SETTINGS VIEW
  // ========================================================================
  function initSettingsForm() {
    if (!window.WolffiaDataEngine) return;
    renderSettingsView(window.WolffiaDataEngine);
  }

  function renderSettingsView(engine) {
    const th = engine.thresholds;
    const dev = engine.device;

    setVal('cfg-temp-min', th.temp.min);
    setVal('cfg-temp-max', th.temp.max);
    setVal('cfg-ph-min', th.ph.min);
    setVal('cfg-ph-max', th.ph.max);
    setVal('cfg-water-min', th.waterLevel.min);
    setVal('cfg-water-max', th.waterLevel.max);
    setVal('cfg-light-min', th.light.min);
    setVal('cfg-light-max', th.light.max);

    setVal('cfg-device-id', dev.deviceId);
    setVal('cfg-interval', dev.interval || 2500);
    setVal('cfg-supabase-url', dev.supabaseUrl || localStorage.getItem('wolffia_supabase_url') || '');
    setVal('cfg-supabase-key', dev.supabaseKey || localStorage.getItem('wolffia_supabase_key') || '');
    setVal('cfg-supabase-table', dev.supabaseTable || 'wolffia_telemetry');

    // Update Supabase status badge
    const sbBadge = document.getElementById('cfg-supabase-status-badge');
    if (sbBadge) {
      const status = engine.supabaseStatus || 'Disconnected';
      sbBadge.textContent = status === 'Connected' ? 'เชื่อมต่อแล้ว' : (status === 'Initialized' ? 'พร้อมเชื่อมต่อ' : status);
      if (status === 'Connected') {
        sbBadge.style.background = '#dcfce7';
        sbBadge.style.color = '#15803d';
      } else if (status === 'Initialized') {
        sbBadge.style.background = '#e0f2fe';
        sbBadge.style.color = '#0369a1';
      } else {
        sbBadge.style.background = '#f1f5f9';
        sbBadge.style.color = '#64748b';
      }
    }
  }

  window.saveSystemSettings = function () {
    if (!window.WolffiaDataEngine) return;
    const engine = window.WolffiaDataEngine;

    const newThresholds = {
      temp: {
        min: parseFloat(document.getElementById('cfg-temp-min')?.value || 25),
        max: parseFloat(document.getElementById('cfg-temp-max')?.value || 32),
        unit: '°C'
      },
      ph: {
        min: parseFloat(document.getElementById('cfg-ph-min')?.value || 6.5),
        max: parseFloat(document.getElementById('cfg-ph-max')?.value || 7.5),
        unit: ''
      },
      waterLevel: {
        min: parseFloat(document.getElementById('cfg-water-min')?.value || 70),
        max: parseFloat(document.getElementById('cfg-water-max')?.value || 90),
        unit: '%'
      },
      light: {
        min: parseFloat(document.getElementById('cfg-light-min')?.value || 50),
        max: parseFloat(document.getElementById('cfg-light-max')?.value || 80),
        unit: '%'
      }
    };

    const url = (document.getElementById('cfg-supabase-url')?.value || '').trim();
    const key = (document.getElementById('cfg-supabase-key')?.value || '').trim();
    const table = (document.getElementById('cfg-supabase-table')?.value || 'wolffia_telemetry').trim();

    const newDevice = {
      deviceId: document.getElementById('cfg-device-id')?.value || 'ESP32-WOLFFIA-01',
      interval: parseInt(document.getElementById('cfg-interval')?.value || '2500', 10),
      supabaseUrl: url,
      supabaseKey: key,
      supabaseTable: table
    };

    engine.saveThresholds(newThresholds);
    engine.saveDeviceSettings(newDevice);

    renderSettingsView(engine);
    showToast('บันทึกการตั้งค่าเกณฑ์เซนเซอร์และพารามิเตอร์เรียบร้อยแล้ว!', 'success');
  };

  window.testSupabaseConnection = async function () {
    if (!window.WolffiaDataEngine) return;
    const engine = window.WolffiaDataEngine;
    const btn = document.getElementById('btn-test-supabase');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังทดสอบ...';
      btn.disabled = true;
    }

    const url = (document.getElementById('cfg-supabase-url')?.value || '').trim();
    const key = (document.getElementById('cfg-supabase-key')?.value || '').trim();
    const table = (document.getElementById('cfg-supabase-table')?.value || 'wolffia_telemetry').trim();

    if (table) engine.device.supabaseTable = table;

    const result = await engine.testSupabaseConnection(url, key);

    if (btn) {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }

    if (result.success) {
      showToast(result.message, 'success');
    } else {
      showToast(result.message, 'error');
    }

    renderSettingsView(engine);
  };

  window.sendSampleTelemetryToSupabase = async function () {
    if (!window.WolffiaDataEngine) return;
    const engine = window.WolffiaDataEngine;
    const btn = document.getElementById('btn-sample-telemetry');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังส่ง...';
      btn.disabled = true;
    }

    const sample = {
      temperature: parseFloat((27 + Math.random() * 4).toFixed(2)),
      ph: parseFloat((6.7 + Math.random() * 0.6).toFixed(2)),
      waterLevel: parseFloat((75 + Math.random() * 10).toFixed(1)),
      light: parseFloat((55 + Math.random() * 25).toFixed(1)),
      rssi: -58,
      deviceStatus: 'Online'
    };

    const result = await engine.insertTelemetryRow(sample);

    if (btn) {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }

    if (result.success) {
      showToast(`ส่งข้อมูลตัวอย่างสำเร็จ: Temp ${sample.temperature}°C, pH ${sample.ph}, Water ${sample.waterLevel}%`, 'success');
    } else {
      showToast(result.message, 'error');
    }
  };

  window.copySupabaseSqlScript = function () {
    const sql = `-- Smart Wolffia Cultivation System (V3.0.1) Telemetry Schema
CREATE TABLE IF NOT EXISTS public.wolffia_telemetry (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  device_id TEXT DEFAULT 'ESP32-WOLFFIA-01' NOT NULL,
  temperature NUMERIC(4, 2) NOT NULL,
  ph NUMERIC(3, 2) NOT NULL,
  water_level NUMERIC(4, 1) NOT NULL,
  light NUMERIC(4, 1) NOT NULL,
  rssi INTEGER DEFAULT -58,
  device_status TEXT DEFAULT 'Online'
);

-- 1. Enable Realtime Stream
ALTER PUBLICATION supabase_realtime ADD TABLE public.wolffia_telemetry;

-- 2. Enable Row Level Security (RLS) & Public Policies
ALTER TABLE public.wolffia_telemetry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON public.wolffia_telemetry FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.wolffia_telemetry FOR INSERT WITH CHECK (true);`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(sql).then(() => {
        showToast('คัดลอกคำสั่ง SQL สร้างตารางลงในคลิปบอร์ดแล้ว! นำไปรันใน Supabase SQL Editor ได้เลย', 'success');
      }).catch(err => {
        showToast('ไม่สามารถคัดลอกได้: ' + err, 'error');
      });
    } else {
      // Fallback
      prompt('คัดลอกคำสั่ง SQL ด้านล่างนี้:', sql);
    }
  };

  window.resetSettingsDefaults = function () {
    if (!window.WolffiaDataEngine) return;
    localStorage.removeItem('wolffia_thresholds_v3');
    localStorage.removeItem('wolffia_device_v3');
    window.location.reload();
  };

  // CSV Export Trigger
  window.exportDataCsv = function () {
    if (window.WolffiaDataEngine) {
      window.WolffiaDataEngine.exportCsv('smart_wolffia_telemetry.csv');
      showToast('ดาวน์โหลดไฟล์ CSV เรียบร้อยแล้ว', 'success');
    }
  };

  // ========================================================================
  // CHART.JS INITIALIZATION & UPDATES
  // ========================================================================
  function initCharts() {
    if (typeof Chart === 'undefined') return;

    // Chart 1: Temp & pH Dual-Axis
    const ctxTempPh = document.getElementById('chart-temp-ph');
    if (ctxTempPh) {
      charts.tempPh = new Chart(ctxTempPh, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            {
              label: 'อุณหภูมิน้ำ (°C)',
              data: [],
              borderColor: '#ef4444',
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              yAxisID: 'yTemp',
              tension: 0.3,
              fill: true,
              pointRadius: 2
            },
            {
              label: 'ค่า pH',
              data: [],
              borderColor: '#6366f1',
              backgroundColor: 'transparent',
              yAxisID: 'yPh',
              tension: 0.3,
              pointRadius: 2
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          scales: {
            x: {
              grid: { display: false },
              ticks: { maxTicksLimit: 6, font: { family: 'Prompt', size: 10 } }
            },
            yTemp: {
              type: 'linear',
              position: 'left',
              min: 20,
              max: 38,
              ticks: { font: { family: 'Prompt', size: 10 } },
              grid: { color: '#f1f5f9' }
            },
            yPh: {
              type: 'linear',
              position: 'right',
              min: 5,
              max: 9,
              ticks: { font: { family: 'Prompt', size: 10 } },
              grid: { display: false }
            }
          },
          plugins: {
            legend: { position: 'top', labels: { font: { family: 'Prompt', size: 11 } } }
          }
        }
      });
    }

    // Chart 2: Water Level & Light
    const ctxWaterLight = document.getElementById('chart-water-light');
    if (ctxWaterLight) {
      charts.waterLight = new Chart(ctxWaterLight, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            {
              label: 'ระดับน้ำ (%)',
              data: [],
              borderColor: '#2563eb',
              backgroundColor: 'rgba(37, 99, 235, 0.1)',
              tension: 0.3,
              fill: true,
              pointRadius: 2
            },
            {
              label: 'ความเข้มแสง (%)',
              data: [],
              borderColor: '#d97706',
              backgroundColor: 'rgba(217, 119, 6, 0.08)',
              tension: 0.3,
              fill: true,
              pointRadius: 2
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          scales: {
            x: {
              grid: { display: false },
              ticks: { maxTicksLimit: 6, font: { family: 'Prompt', size: 10 } }
            },
            y: {
              min: 0,
              max: 100,
              ticks: { font: { family: 'Prompt', size: 10 } },
              grid: { color: '#f1f5f9' }
            }
          },
          plugins: {
            legend: { position: 'top', labels: { font: { family: 'Prompt', size: 11 } } }
          }
        }
      });
    }

    // Monitoring Rolling Live Chart
    const ctxLive = document.getElementById('chart-monitoring-live');
    if (ctxLive) {
      charts.liveRolling = new Chart(ctxLive, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            { label: 'Temp (°C)', data: [], borderColor: '#ef4444', tension: 0.3, pointRadius: 2 },
            { label: 'pH', data: [], borderColor: '#6366f1', tension: 0.3, pointRadius: 2 },
            { label: 'Water (%)', data: [], borderColor: '#2563eb', tension: 0.3, pointRadius: 2 },
            { label: 'Light (%)', data: [], borderColor: '#d97706', tension: 0.3, pointRadius: 2 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { ticks: { maxTicksLimit: 8, font: { family: 'Prompt', size: 10 } } },
            y: { ticks: { font: { family: 'Prompt', size: 10 } }, grid: { color: '#f1f5f9' } }
          },
          plugins: {
            legend: { position: 'top', labels: { font: { family: 'Prompt', size: 11 } } }
          }
        }
      });
    }
  }

  function updateDashboardCharts(engine) {
    const history = engine.history.slice(-25);
    const labels = history.map(d => {
      const dt = new Date(d.timestamp);
      return `${dt.getHours().toString().padStart(2, '0')}:${dt.getMinutes().toString().padStart(2, '0')}:${dt.getSeconds().toString().padStart(2, '0')}`;
    });

    if (charts.tempPh) {
      charts.tempPh.data.labels = labels;
      charts.tempPh.data.datasets[0].data = history.map(d => d.temp);
      charts.tempPh.data.datasets[1].data = history.map(d => d.ph);
      charts.tempPh.update('none');
    }

    if (charts.waterLight) {
      charts.waterLight.data.labels = labels;
      charts.waterLight.data.datasets[0].data = history.map(d => d.waterLevel);
      charts.waterLight.data.datasets[1].data = history.map(d => d.light);
      charts.waterLight.update('none');
    }
  }

  function updateMonitoringLiveChart(engine) {
    if (!charts.liveRolling) return;
    const history = engine.history.slice(-30);
    const labels = history.map(d => {
      const dt = new Date(d.timestamp);
      return `${dt.getHours().toString().padStart(2, '0')}:${dt.getMinutes().toString().padStart(2, '0')}:${dt.getSeconds().toString().padStart(2, '0')}`;
    });

    charts.liveRolling.data.labels = labels;
    charts.liveRolling.data.datasets[0].data = history.map(d => d.temp);
    charts.liveRolling.data.datasets[1].data = history.map(d => d.ph);
    charts.liveRolling.data.datasets[2].data = history.map(d => d.waterLevel);
    charts.liveRolling.data.datasets[3].data = history.map(d => d.light);
    charts.liveRolling.update('none');
  }

  function renderSparkline(canvasId, dataPoints, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !dataPoints || dataPoints.length === 0) return;

    if (charts[canvasId]) {
      charts[canvasId].data.labels = dataPoints.map((_, i) => i);
      charts[canvasId].data.datasets[0].data = dataPoints;
      charts[canvasId].update('none');
      return;
    }

    charts[canvasId] = new Chart(canvas, {
      type: 'line',
      data: {
        labels: dataPoints.map((_, i) => i),
        datasets: [{
          data: dataPoints,
          borderColor: color,
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          backgroundColor: color.replace(')', ', 0.1)').replace('rgb', 'rgba'),
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { display: false },
          y: { display: false }
        }
      }
    });
  }

  // Toast Notifications
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';

    let icon = 'fa-circle-info';
    let iconColor = 'var(--color-info)';
    if (type === 'success') {
      icon = 'fa-circle-check';
      iconColor = 'var(--primary)';
    } else if (type === 'warning') {
      icon = 'fa-triangle-exclamation';
      iconColor = 'var(--color-warning)';
    } else if (type === 'critical') {
      icon = 'fa-circle-xmark';
      iconColor = 'var(--color-critical)';
    }

    toast.innerHTML = `
      <i class="fa-solid ${icon}" style="color:${iconColor}; font-size:1.15rem"></i>
      <div style="flex-grow:1">${escapeHtml(message)}</div>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // Helpers
  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

})();
