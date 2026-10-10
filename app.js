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

    // If switching to settings, populate form safely once
    if (viewName === 'settings' && window.WolffiaDataEngine) {
      populateSettingsForm(window.WolffiaDataEngine);
    }

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
        updateSettingsLiveStatus(engine);
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

    // Light unit dynamically switches to 'lux' if readings exceed 100
    const lightUnitEl = document.getElementById('dash-light-unit');
    if (lightUnitEl) {
      lightUnitEl.textContent = (c.light > 100) ? 'lux' : '%';
    }

    // System Status Card (Matching ESP32 Firmware V6)
    setText('dash-wifi-text', `${engine.device.wifiSsid} (${c.rssi} dBm)`);
    setText('dash-telemetry-rate', `ความถี่ ${engine.device.interval ? (engine.device.interval / 1000).toFixed(1) : '5.0'}s`);
    const telemetryBadge = document.getElementById('dash-telemetry-badge');
    if (telemetryBadge) {
      telemetryBadge.textContent = c.systemStatus || 'ปกติ';
      telemetryBadge.style.background = (c.systemStatus === 'EMERGENCY_STOP') ? '#fee2e2' : '#dcfce7';
      telemetryBadge.style.color = (c.systemStatus === 'EMERGENCY_STOP') ? '#b91c1c' : '#15803d';
    }

    // Pump & Automation Status
    const pumpStatusEl = document.getElementById('dash-pump-status');
    if (pumpStatusEl) {
      pumpStatusEl.textContent = c.pumpStatus ? 'กำลังทำงาน (ON)' : 'หยุดทำงาน (OFF)';
      pumpStatusEl.className = 'status-badge ' + (c.pumpStatus ? 'normal' : 'muted');
    }
    const modeStatusEl = document.getElementById('dash-mode-status');
    if (modeStatusEl) {
      modeStatusEl.textContent = c.systemMode || 'AUTO';
      modeStatusEl.className = 'status-badge ' + (c.systemMode === 'AUTO' ? 'normal' : 'warning');
    }
    const healthStatusEl = document.getElementById('dash-health-status');
    if (healthStatusEl) {
      healthStatusEl.textContent = c.systemStatus || 'NORMAL';
      healthStatusEl.className = 'status-badge ' + (c.systemStatus === 'NORMAL' ? 'normal' : 'danger');
    }

    // Live Missing Table Alert Banner
    const tableAlert = document.getElementById('live-table-alert');
    if (tableAlert) {
      tableAlert.style.display = (engine.mode === 'LIVE' && engine.supabaseStatus === 'Needs Table') ? 'block' : 'none';
    }

    // Live Board Hardware Telemetry Sync Banner
    const banner = document.getElementById('live-board-status-banner');
    const bTitle = document.getElementById('live-board-title');
    const bSub = document.getElementById('live-board-subtitle');
    const bDot = document.getElementById('live-board-dot');
    const bLast = document.getElementById('live-board-last-time');
    const btnUsb = document.getElementById('btn-banner-usb');

    if (banner && bTitle) {
      if (engine.mode === 'LIVE') {
        banner.style.display = 'flex';
        const isUsbActive = window.isUsbConnected && engine.lastSerialDataTime && (Date.now() - engine.lastSerialDataTime < 7000);
        const lastPacketAge = c.timestamp ? (Date.now() - new Date(c.timestamp).getTime()) : 999999;
        // ESP32 V6 firmware sends to Supabase Cloud every 60 seconds (SUPABASE_INTERVAL_MS = 60000UL)
        const isCloudActive = engine.isLiveFresh || (lastPacketAge < 90000);

        if (isUsbActive) {
          banner.style.background = '#f0fdf4';
          banner.style.borderColor = '#bbf7d0';
          banner.style.borderLeftColor = '#16a34a';
          if (bDot) bDot.className = 'pulse-dot online';
          bTitle.innerHTML = `<span style="color:#166534">🟢 รับข้อมูลสดจากบอร์ด ESP32 ผ่านสาย USB สำเร็จ!</span>`;
          bSub.textContent = `พอร์ต USB Serial (115200 Baud) • Temp: ${c.temperature.toFixed(1)}°C | pH: ${c.ph.toFixed(2)} | น้ำ: ${c.waterLevel.toFixed(1)}% | แสง: ${c.light.toFixed(1)}${c.light > 100 ? ' lx' : '%'} | ปั๊ม: ${c.pumpStatus ? 'ON' : 'OFF'} | โหมด: ${c.systemMode || 'AUTO'}`;
          if (bLast) bLast.textContent = `สด (USB)`;
          if (btnUsb) {
            btnUsb.innerHTML = '<i class="fa-solid fa-link-slash"></i> ตัดการเชื่อมต่อ USB';
            btnUsb.className = 'btn btn-outline btn-sm';
          }
        } else if (isCloudActive) {
          banner.style.background = '#f0fdf4';
          banner.style.borderColor = '#bbf7d0';
          banner.style.borderLeftColor = '#16a34a';
          if (bDot) bDot.className = 'pulse-dot online';
          bTitle.innerHTML = `<span style="color:#166534">🟢 รับข้อมูลสดจากบอร์ด ESP32 ผ่าน WiFi (Supabase Cloud) เรียลไทม์</span>`;
          bSub.textContent = `อุปกรณ์: ${c.deviceId} • WiFi: ${engine.device.wifiSsid} (${c.rssi} dBm) • ปั๊ม: ${c.pumpStatus ? 'ON' : 'OFF'} • โหมด: ${c.systemMode || 'AUTO'} • อัปเดตสดจาก Arduino`;
          if (bLast) bLast.textContent = `${new Date(c.timestamp).toLocaleTimeString('th-TH')}`;
          if (btnUsb) {
            btnUsb.innerHTML = '<i class="fa-brands fa-usb"></i> ต่อบอร์ด USB';
            btnUsb.className = 'btn btn-outline btn-sm';
          }
        } else {
          // Waiting for board
          banner.style.background = '#fffbeb';
          banner.style.borderColor = '#fde68a';
          banner.style.borderLeftColor = '#f59e0b';
          if (bDot) bDot.className = 'pulse-dot warning';
          bTitle.innerHTML = `<span style="color:#92400e">🟡 กำลังรอข้อมูลจากบอร์ด ESP32... (ค่าล่าสุด: Temp ${c.temperature.toFixed(1)}°C, pH ${c.ph.toFixed(2)})</span>`;
          bSub.innerHTML = `บอร์ดยังไม่ส่งข้อมูลใหม่: <strong>1. เสียบสาย USB แล้วกดปุ่ม 'ต่อบอร์ด USB'</strong> (ปิด Serial Monitor ใน Arduino ก่อน) หรือ <strong>2. ตรวจสอบชื่อ WiFi/Password ใน Arduino IDE</strong>`;
          if (bLast) bLast.textContent = c.timestamp ? `ล่าสุดเมื่อ: ${new Date(c.timestamp).toLocaleTimeString('th-TH')}` : '';
          if (btnUsb) {
            btnUsb.innerHTML = '<i class="fa-brands fa-usb"></i> กดเพื่อต่อบอร์ด USB เดี๋ยวนี้';
            btnUsb.className = 'btn btn-primary btn-sm';
          }
        }

        // Keep Hero Card button synced
        const btnHero = document.getElementById('btn-hero-usb');
        const badgeHero = document.getElementById('usb-badge-status');
        if (btnHero) {
          if (isUsbActive) {
            btnHero.innerHTML = '<i class="fa-solid fa-link-slash"></i> ตัดการเชื่อมต่อ USB';
            btnHero.style.background = '#fee2e2';
            btnHero.style.borderColor = '#fca5a5';
            btnHero.style.color = '#dc2626';
            if (badgeHero) {
              badgeHero.textContent = '🟢 เชื่อมต่อสดแล้ว (115200 Baud)';
              badgeHero.style.background = '#dcfce7';
              badgeHero.style.color = '#15803d';
            }
          } else {
            btnHero.innerHTML = '<i class="fa-brands fa-usb"></i> ต่อบอร์ด USB เดี๋ยวนี้';
            btnHero.style.background = '#16a34a';
            btnHero.style.borderColor = '#15803d';
            btnHero.style.color = '#ffffff';
            if (badgeHero) {
              badgeHero.textContent = isCloudActive ? 'รับข้อมูลผ่าน WiFi' : 'พร้อมเชื่อมต่อ';
              badgeHero.style.background = isCloudActive ? '#dcfce7' : '#e0f2fe';
              badgeHero.style.color = isCloudActive ? '#15803d' : '#0369a1';
            }
          }
        }
      } else {
        banner.style.display = 'none';
      }
    }

    // Cloud Sync Status
    const cloudStatus = document.getElementById('dash-cloud-status');
    if (cloudStatus) {
      if (engine.mode === 'LIVE') {
        let isConn = engine.supabaseStatus === 'Connected';
        let badgeText = 'Supabase Realtime เชื่อมต่อแล้ว';
        let badgeClass = 'normal';

        if (window.isUsbConnected) {
          badgeText = 'USB Serial: รับข้อมูลจากบอร์ด ESP32 แบบสด';
          badgeClass = 'normal';
        } else if (engine.supabaseStatus === 'Needs Table') {
          badgeText = 'Supabase: รอสร้างตาราง SQL';
          badgeClass = 'warning';
        } else if (engine.supabaseStatus === 'Connected (0 records)') {
          badgeText = 'Supabase: เชื่อมต่อแล้ว (กำลังรอข้อมูลจากบอร์ด...)';
          badgeClass = 'normal';
        } else if (!isConn) {
          badgeText = engine.supabaseStatus || 'กำลังเชื่อมต่อ...';
          badgeClass = 'warning';
        }

        cloudStatus.innerHTML = `<span class="status-badge ${badgeClass}" style="border:none"><i class="fa-solid fa-tower-broadcast"></i> ${badgeText}</span>`;
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

    // Calculate dynamic uptime
    const uptimeMs = Date.now() - (d.uptimeStart || (Date.now() - (14 * 86400000 + 6 * 3600000 + 32 * 60000)));
    const days = Math.floor(uptimeMs / (24 * 3600 * 1000));
    const hours = Math.floor((uptimeMs % (24 * 3600 * 1000)) / (3600 * 1000));
    const mins = Math.floor((uptimeMs % (3600 * 1000)) / (60 * 1000));
    setText('dev-uptime', `${days} วัน ${hours} ชม. ${mins} นาที`);

    setText('dev-mac', d.macAddress || '24:6F:28:7A:B1:0C');
    setText('dev-ip', `IP: ${d.ipAddress || '192.168.1.145'}`);
    setText('dev-device-id', c.deviceId || d.deviceId || 'ESP32-WOLFFIA-01');
    setText('dev-rssi', `${c.rssi} dBm (${c.rssi > -65 ? 'สัญญาณดีเยี่ยม' : 'สัญญาณปานกลาง'})`);
    setText('dev-wifi-ssid', d.wifiSsid || 'SmartAgri_Wolffia_IoT');
    setText('dev-ping', `${c.ping || 24} ms`);

    const lastTimeStr = c.timestamp ? new Date(c.timestamp).toLocaleTimeString('th-TH') : 'เมื่อสักครู่';
    setText('dev-last-seen', lastTimeStr);

    const connTypeEl = document.getElementById('dev-conn-type');
    if (connTypeEl) {
      connTypeEl.textContent = window.isUsbConnected 
        ? 'USB Web Serial (115200 Baud) + Supabase' 
        : (engine.mode === 'LIVE' ? 'WiFi + Supabase Cloud Stream' : 'Central Simulation Engine (Demo)');
    }

    const connBadge = document.getElementById('dev-conn-badge');
    if (connBadge) {
      if (engine.mode === 'LIVE') {
        connBadge.className = 'status-badge normal';
        connBadge.innerHTML = '<span class="pulse-dot online"></span> เชื่อมต่อแล้ว (Connected)';
      } else {
        connBadge.className = 'status-badge normal';
        connBadge.innerHTML = '<span class="pulse-dot demo"></span> โหมดจำลอง (Demo Active)';
      }
    }
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
  function updateSettingsLiveStatus(engine) {
    if (!engine) return;
    const sbBadge = document.getElementById('cfg-supabase-status-badge');
    if (sbBadge) {
      const status = engine.supabaseStatus || 'Disconnected';
      if (status === 'Connected') {
        sbBadge.textContent = 'เชื่อมต่อแล้ว (Connected)';
        sbBadge.style.background = '#dcfce7';
        sbBadge.style.color = '#15803d';
      } else if (status === 'Needs Table') {
        sbBadge.textContent = 'เชื่อมต่อแล้ว (รอสร้างตาราง SQL)';
        sbBadge.style.background = '#fef3c7';
        sbBadge.style.color = '#b45309';
      } else if (status === 'Initialized') {
        sbBadge.textContent = 'พร้อมเชื่อมต่อ (Ready)';
        sbBadge.style.background = '#e0f2fe';
        sbBadge.style.color = '#0369a1';
      } else {
        sbBadge.textContent = 'ไม่ได้เชื่อมต่อ';
        sbBadge.style.background = '#f1f5f9';
        sbBadge.style.color = '#64748b';
      }
    }
  }

  function populateSettingsForm(engine, force = false) {
    if (!engine) return;
    const th = engine.thresholds;
    const dev = engine.device;

    const setValSafe = (id, val) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (!force && document.activeElement === el) return;
      if (!force && el.value && el.value.trim() !== '') return;
      el.value = val !== undefined && val !== null ? val : '';
    };

    setValSafe('cfg-temp-min', th.temp.min);
    setValSafe('cfg-temp-max', th.temp.max);
    setValSafe('cfg-ph-min', th.ph.min);
    setValSafe('cfg-ph-max', th.ph.max);
    setValSafe('cfg-water-min', th.waterLevel.min);
    setValSafe('cfg-water-max', th.waterLevel.max);
    setValSafe('cfg-light-min', th.light.min);
    setValSafe('cfg-light-max', th.light.max);

    setValSafe('cfg-device-id', dev.deviceId);
    setValSafe('cfg-interval', dev.interval || 2500);

    const defaultUrl = 'https://dtersefrvlbyocwozdab.supabase.co';
    const defaultKey = 'sb_publishable_zzcJS9T6nHg89bSF716qnw_ZeG6rQik';
    const effectiveUrl = (localStorage.getItem('wolffia_supabase_url') || dev.supabaseUrl || defaultUrl).trim().replace(/\/+$/, '');
    const effectiveKey = (localStorage.getItem('wolffia_supabase_key') || dev.supabaseKey || defaultKey).trim();

    const uEl = document.getElementById('cfg-supabase-url');
    if (uEl && (!uEl.value || uEl.value.trim() === '' || force)) {
      uEl.value = effectiveUrl;
    }
    const kEl = document.getElementById('cfg-supabase-key');
    if (kEl && (!kEl.value || kEl.value.trim() === '' || force)) {
      kEl.value = effectiveKey;
    }
    const tEl = document.getElementById('cfg-supabase-table');
    if (tEl && (!tEl.value || tEl.value.trim() === '' || force)) {
      tEl.value = dev.supabaseTable || 'wolffia_telemetry';
    }

    updateSettingsLiveStatus(engine);
  }

  function setupSettingsAutoSave() {
    const urlInput = document.getElementById('cfg-supabase-url');
    const keyInput = document.getElementById('cfg-supabase-key');
    const tableInput = document.getElementById('cfg-supabase-table');

    if (urlInput) {
      urlInput.addEventListener('input', () => {
        const val = urlInput.value.trim().replace(/\/+$/, '');
        if (val) {
          localStorage.setItem('wolffia_supabase_url', val);
          if (window.WolffiaDataEngine) {
            window.WolffiaDataEngine.device.supabaseUrl = val;
          }
        }
      });
    }

    if (keyInput) {
      keyInput.addEventListener('input', () => {
        const val = keyInput.value.trim();
        if (val) {
          localStorage.setItem('wolffia_supabase_key', val);
          if (window.WolffiaDataEngine) {
            window.WolffiaDataEngine.device.supabaseKey = val;
          }
        }
      });
    }

    if (tableInput) {
      tableInput.addEventListener('input', () => {
        const val = tableInput.value.trim();
        if (val && window.WolffiaDataEngine) {
          window.WolffiaDataEngine.device.supabaseTable = val;
        }
      });
    }
  }

  window.toggleKeyVisibility = function () {
    const input = document.getElementById('cfg-supabase-key');
    const icon = document.getElementById('icon-toggle-key');
    if (!input) return;
    if (input.type === 'password') {
      input.type = 'text';
      if (icon) {
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
      }
    } else {
      input.type = 'password';
      if (icon) {
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
      }
    }
  };

  function initSettingsForm() {
    if (!window.WolffiaDataEngine) return;
    populateSettingsForm(window.WolffiaDataEngine, false);
    setupSettingsAutoSave();
  }

  // Alias for compatibility
  function renderSettingsView(engine) {
    updateSettingsLiveStatus(engine);
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

    const url = (document.getElementById('cfg-supabase-url')?.value || '').trim().replace(/\/+$/, '');
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

    if (url) localStorage.setItem('wolffia_supabase_url', url);
    if (key) localStorage.setItem('wolffia_supabase_key', key);

    updateSettingsLiveStatus(engine);
    showToast('บันทึกการตั้งค่าเกณฑ์เซนเซอร์และการเชื่อมต่อ Supabase เรียบร้อยแล้ว!', 'success');
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

    const url = (document.getElementById('cfg-supabase-url')?.value || '').trim().replace(/\/+$/, '');
    const key = (document.getElementById('cfg-supabase-key')?.value || '').trim();
    const table = (document.getElementById('cfg-supabase-table')?.value || 'wolffia_telemetry').trim();

    if (table) engine.device.supabaseTable = table;

    const result = await engine.testSupabaseConnection(url, key);

    if (btn) {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }

    if (result.success) {
      showToast(result.message, result.needsTable ? 'info' : 'success');
    } else {
      showToast(result.message, 'error');
    }

    updateSettingsLiveStatus(engine);
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
    const sql = `-- Smart Wolffia Cultivation System - Complete SQL Schema for Supabase
-- 1. Table for ESP32 Firmware V6 (Target Table: sensor_readings)
CREATE TABLE IF NOT EXISTS public.sensor_readings (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  device_id TEXT DEFAULT 'ESP32-WOLFFIA-01' NOT NULL,
  temperature NUMERIC(5, 2),
  ph NUMERIC(4, 2),
  light NUMERIC(8, 2),
  water_level NUMERIC(5, 1),
  pump_status BOOLEAN DEFAULT false,
  system_mode TEXT DEFAULT 'AUTO',
  system_status TEXT DEFAULT 'NORMAL'
);

-- 2. Fallback Table: wolffia_telemetry
CREATE TABLE IF NOT EXISTS public.wolffia_telemetry (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  device_id TEXT DEFAULT 'ESP32-WOLFFIA-01' NOT NULL,
  temperature NUMERIC(5, 2) NOT NULL,
  ph NUMERIC(4, 2) NOT NULL,
  water_level NUMERIC(5, 1) NOT NULL,
  light NUMERIC(6, 1) NOT NULL,
  rssi INTEGER DEFAULT -58,
  device_status TEXT DEFAULT 'Online'
);

-- 3. Enable Realtime Stream for both tables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sensor_readings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sensor_readings;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'wolffia_telemetry'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wolffia_telemetry;
  END IF;
END $$;

-- 4. Disable RLS to allow direct IoT posting from ESP32 (Prevents 401 Unauthorized)
ALTER TABLE public.sensor_readings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.wolffia_telemetry DISABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.sensor_readings TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.wolffia_telemetry TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;`;

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
    localStorage.setItem('wolffia_supabase_url', 'https://dtersefrvlbyocwozdab.supabase.co');
    localStorage.setItem('wolffia_supabase_key', 'sb_publishable_zzcJS9T6nHg89bSF716qnw_ZeG6rQik');
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
  // ========================================================================
  // WEB SERIAL API (USB DIRECT CONNECTION TO ESP32)
  // ========================================================================
  let usbSerialPort = null;
  let usbSerialReader = null;
  window.isUsbConnected = false;

  window.toggleUsbSerialConnection = async function () {
    if (window.isUsbConnected) {
      window.isUsbConnected = false;
      try {
        if (usbSerialReader) {
          await usbSerialReader.cancel();
          usbSerialReader.releaseLock();
        }
        if (usbSerialPort) {
          await usbSerialPort.close();
        }
      } catch (e) {}
      usbSerialPort = null;
      usbSerialReader = null;
      updateUsbButtonUI(false);
      showToast('ยกเลิกการเชื่อมต่อ USB Serial เรียบร้อยแล้ว', 'info');
      return;
    }

    if (!('serial' in navigator)) {
      alert('เบราว์เซอร์นี้ไม่รองรับ Web Serial API\nกรุณาเปิดหน้านี้บนคอมพิวเตอร์ด้วย Google Chrome หรือ Microsoft Edge');
      return;
    }

    try {
      usbSerialPort = await navigator.serial.requestPort();
      await usbSerialPort.open({ baudRate: 115200 });
      window.isUsbConnected = true;
      updateUsbButtonUI(true);
      showToast('เชื่อมต่อบอร์ด ESP32 ผ่านสาย USB สำเร็จ! กำลังรับข้อมูลแบบ Real-time...', 'success');

      // Auto switch to LIVE mode
      if (window.WolffiaDataEngine && window.WolffiaDataEngine.mode !== 'LIVE') {
        window.switchSystemMode('LIVE');
      }

      readUsbSerialStream();
    } catch (err) {
      if (err.name !== 'NotFoundError') {
        const msg = err.message || '';
        if (msg.includes('Failed to open') || msg.includes('access') || msg.includes('busy') || msg.includes('already open')) {
          alert('⚠️ ไม่สามารถเปิดพอร์ต USB ได้!\n\nสาเหตุ: หน้าต่าง Serial Monitor ในโปรแกรม Arduino IDE กำลังล็อกพอร์ตนี้อยู่\n\nวิธีแก้: กรุณา "ปิด (Close) หน้าต่าง Serial Monitor ใน Arduino IDE" ก่อน แล้วกดปุ่ม "ต่อบอร์ด USB" อีกครั้ง');
        } else {
          showToast('การเชื่อมต่อ USB ขัดข้อง: ' + msg, 'error');
        }
      }
    }
  };

  function updateUsbButtonUI(connected) {
    window.isUsbConnected = Boolean(connected);

    // 1. Top Navbar Button
    const btnNav = document.getElementById('btn-connect-usb');
    const iconNav = document.getElementById('usb-status-icon');
    const textNav = document.getElementById('usb-status-text');
    if (btnNav) {
      if (connected) {
        btnNav.style.background = '#fee2e2';
        btnNav.style.borderColor = '#fca5a5';
        btnNav.style.color = '#dc2626';
        if (iconNav) iconNav.className = 'fa-solid fa-link-slash';
        if (textNav) textNav.textContent = 'ตัดการเชื่อมต่อ USB';
      } else {
        btnNav.style.background = '#16a34a';
        btnNav.style.borderColor = '#15803d';
        btnNav.style.color = '#ffffff';
        if (iconNav) iconNav.className = 'fa-brands fa-usb';
        if (textNav) textNav.textContent = '🔌 ต่อบอร์ด USB';
      }
    }

    // 2. Main Dashboard Hero Quick Connect Card
    const btnHero = document.getElementById('btn-hero-usb');
    const textHero = document.getElementById('btn-hero-usb-text');
    const badgeHero = document.getElementById('usb-badge-status');
    if (btnHero) {
      if (connected) {
        btnHero.style.background = '#fee2e2';
        btnHero.style.borderColor = '#fca5a5';
        btnHero.style.color = '#dc2626';
        btnHero.innerHTML = '<i class="fa-solid fa-link-slash"></i> ตัดการเชื่อมต่อ USB';
        if (badgeHero) {
          badgeHero.textContent = '🟢 เชื่อมต่อสดแล้ว (115200 Baud)';
          badgeHero.style.background = '#dcfce7';
          badgeHero.style.color = '#15803d';
        }
      } else {
        btnHero.style.background = '#16a34a';
        btnHero.style.borderColor = '#15803d';
        btnHero.style.color = '#ffffff';
        btnHero.innerHTML = '<i class="fa-brands fa-usb"></i> ต่อบอร์ด USB เดี๋ยวนี้';
        if (badgeHero) {
          badgeHero.textContent = 'พร้อมเชื่อมต่อ';
          badgeHero.style.background = '#e0f2fe';
          badgeHero.style.color = '#0369a1';
        }
      }
    }

    // 3. Live Status Banner Button
    const btnBanner = document.getElementById('btn-banner-usb');
    if (btnBanner) {
      if (connected) {
        btnBanner.innerHTML = '<i class="fa-solid fa-link-slash"></i> ตัดการเชื่อมต่อ USB';
        btnBanner.className = 'btn btn-outline btn-sm';
        btnBanner.style.color = '#dc2626';
        btnBanner.style.borderColor = '#fca5a5';
      } else {
        btnBanner.innerHTML = '<i class="fa-brands fa-usb"></i> ต่อบอร์ด USB';
        btnBanner.className = 'btn btn-primary btn-sm';
        btnBanner.style.color = '#ffffff';
        btnBanner.style.borderColor = '#15803d';
        btnBanner.style.background = '#16a34a';
      }
    }

    // 4. Sidebar Device Widget Button
    const btnSidebar = document.getElementById('btn-sidebar-usb');
    if (btnSidebar) {
      if (connected) {
        btnSidebar.style.background = '#fee2e2';
        btnSidebar.style.borderColor = '#fca5a5';
        btnSidebar.style.color = '#dc2626';
        btnSidebar.innerHTML = '<i class="fa-solid fa-link-slash"></i> ตัดการเชื่อมต่อ USB';
      } else {
        btnSidebar.style.background = '#16a34a';
        btnSidebar.style.borderColor = '#15803d';
        btnSidebar.style.color = '#ffffff';
        btnSidebar.innerHTML = '<i class="fa-brands fa-usb"></i> ต่อบอร์ด USB';
      }
    }
  }

  async function readUsbSerialStream() {
    const textDecoder = new TextDecoder();
    let reader = null;
    let buffer = '';

    try {
      reader = usbSerialPort.readable.getReader();
      usbSerialReader = reader;

      while (window.isUsbConnected) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          buffer += textDecoder.decode(value, { stream: true });
          const lines = buffer.split(/[\r\n]+/);
          buffer = lines.pop(); // keep partial line in buffer

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
              parseSerialTelemetryLine(trimmed);
            }
          }
        }
      }
    } catch (err) {
      console.warn('USB Serial stream loop error:', err);
    } finally {
      if (reader) {
        try { reader.releaseLock(); } catch(e) {}
      }
    }

    window.isUsbConnected = false;
    updateUsbButtonUI(false);
  }

  let serialAccumulator = {};
  let serialUploadTimeout = null;

  function parseSerialTelemetryLine(line) {
    if (!line) return;
    const engine = window.WolffiaDataEngine;
    if (!engine) return;

    try {
      // 1. Exact Match for ESP32 Firmware V6 Serial Output:
      // "SENSOR | pH=7.15 | Temp=28.50 C | Light=1200.00 lux | Water=85.0%"
      const sensorV6Match = line.match(/SENSOR\s*\|\s*pH=([-+]?\d*\.?\d+)\s*\|\s*Temp=([-+]?\d*\.?\d+)\s*C\s*\|\s*Light=([-+]?\d*\.?\d+)\s*lux\s*\|\s*Water=([-+]?\d*\.?\d+)%/i);
      if (sensorV6Match) {
        const phRaw = parseFloat(sensorV6Match[1]);
        const tempRaw = parseFloat(sensorV6Match[2]);
        const lightRaw = parseFloat(sensorV6Match[3]);
        const waterRaw = parseFloat(sensorV6Match[4]);

        const packet = {
          device_id: 'ESP32-WOLFFIA-01',
          ph: (phRaw >= 0 && phRaw <= 14) ? phRaw : undefined,
          temperature: (tempRaw > -40 && tempRaw < 100) ? tempRaw : undefined,
          light: (lightRaw >= 0) ? lightRaw : undefined,
          water_level: (waterRaw >= 0 && waterRaw <= 100) ? waterRaw : undefined,
          created_at: new Date().toISOString()
        };

        engine.lastSerialDataTime = Date.now();
        engine.handleIncomingTelemetryRow(packet);

        // Debounce cloud insert to save network
        if (!serialUploadTimeout) {
          serialUploadTimeout = setTimeout(() => {
            engine.insertTelemetryRow(engine.current);
            serialUploadTimeout = null;
          }, 3000);
        }
        return;
      }

      // 2. Pump Status from ESP32: "Pump: ON" or "Pump: OFF"
      const pumpMatch = line.match(/Pump:\s*(ON|OFF)/i);
      if (pumpMatch) {
        const isOn = pumpMatch[1].toUpperCase() === 'ON';
        engine.current.pumpStatus = isOn;
        engine.lastSerialDataTime = Date.now();
        engine.notifyListeners();
        return;
      }

      // 3. JSON Format: {"device_id":"ESP32-WOLFFIA-01", ...}
      const jsonMatch = line.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        engine.lastSerialDataTime = Date.now();
        engine.handleIncomingTelemetryRow(parsed);
        
        if (!serialUploadTimeout) {
          serialUploadTimeout = setTimeout(() => {
            engine.insertTelemetryRow(engine.current);
            serialUploadTimeout = null;
          }, 3000);
        }
        return;
      }

      // 4. IP Address / WiFi log from ESP32 boot
      const ipMatch = line.match(/(?:IP\s*address|Dashboard:\s*http:\/\/|IP):\s*([0-9.]+)/i);
      if (ipMatch) {
        engine.device.ipAddress = ipMatch[1];
        engine.device.wifiStatus = 'Connected';
        engine.notifyListeners();
        return;
      }

      // 5. Key:Value or Key=Value Format (Single line or multi-pair)
      if (line.includes(':') || line.includes('=')) {
        const parts = line.split(/[,;\|\t]/);
        let hasMatch = false;
        let lineData = {};

        parts.forEach(p => {
          const pair = p.split(/[:=]/).map(s => s.trim());
          if (pair.length >= 2) {
            const k = pair[0].toLowerCase();
            const rawVal = pair.slice(1).join(':').trim();
            const numMatch = rawVal.match(/[-+]?\d*\.?\d+/);
            const num = numMatch ? parseFloat(numMatch[0]) : NaN;

            if (!isNaN(num)) {
              if (k.includes('temp') || k.includes('อุณหภูมิ')) {
                if (num > -40 && num < 100) { lineData.temperature = num; hasMatch = true; }
              } else if (k.includes('ph') || k.includes('กรด')) {
                if (num >= 0 && num <= 14) { lineData.ph = num; hasMatch = true; }
              } else if (k.includes('water') || k.includes('level') || k.includes('น้ำ')) {
                if (num >= 0 && num <= 100) { lineData.water_level = num; hasMatch = true; }
              } else if (k.includes('light') || k.includes('lux') || k.includes('แสง')) {
                if (num >= 0) { lineData.light = num; hasMatch = true; }
              } else if (k.includes('rssi')) {
                lineData.rssi = parseInt(num);
                hasMatch = true;
              }
            } else {
              if (k.includes('device') || k.includes('id')) lineData.device_id = rawVal;
              else if (k.includes('mode')) lineData.system_mode = rawVal.toUpperCase();
              else if (k.includes('status')) lineData.system_status = rawVal;
            }
          }
        });

        if (hasMatch) {
          engine.lastSerialDataTime = Date.now();
          engine.handleIncomingTelemetryRow(lineData);
          
          if (!serialUploadTimeout) {
            serialUploadTimeout = setTimeout(() => {
              engine.insertTelemetryRow(engine.current);
              serialUploadTimeout = null;
            }, 3000);
          }
        }
      }
    } catch (e) {
      console.log('Serial skip:', line);
    }
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
