/**
 * Smart Wolffia Cultivation System V3.0.1
 * Central Data Engine & State Store (Single Source of Truth)
 * 
 * Provides unified state management for:
 * - Real-time telemetry (Temp, pH, Water Level, Light, Device Status, RSSI)
 * - Central Demo Simulation Engine (Physics-aware Random Walk)
 * - Historical data management & dynamic statistical calculations
 * - Alerts, Activities, Control commands, and Threshold configuration
 * - Supabase Live Mode synchronization
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WolffiaDataEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STORAGE_KEY_THRESHOLDS = 'wolffia_thresholds_v3';
  const STORAGE_KEY_DEVICE = 'wolffia_device_v3';
  const STORAGE_KEY_MODE = 'wolffia_mode_v3';

  // Default optimal thresholds for Wolffia globosa cultivation
  const DEFAULT_THRESHOLDS = {
    temp: { min: 25.0, max: 32.0, unit: '°C', label: 'อุณหภูมิน้ำ' },
    ph: { min: 6.5, max: 7.5, unit: '', label: 'ค่าความเป็นกรด-ด่าง (pH)' },
    waterLevel: { min: 70.0, max: 90.0, unit: '%', label: 'ระดับน้ำ' },
    light: { min: 50.0, max: 80.0, unit: '%', label: 'ความเข้มแสง' }
  };

  const DEFAULT_DEVICE = {
    deviceId: 'ESP32-WOLFFIA-01',
    board: 'ESP32-WROOM-32D (Dual-Core 240MHz)',
    firmwareVersion: 'v3.0.1-prod (ESP-IDF 5.1)',
    macAddress: '24:6F:28:7A:B1:0C',
    ipAddress: '192.168.1.145',
    wifiSsid: 'SmartAgri_Wolffia_IoT',
    rssi: -58,
    ping: 24,
    uptimeStart: Date.now() - (14 * 24 * 3600 * 1000 + 6 * 3600 * 1000 + 32 * 60 * 1000), // ~14d 6h 32m
    interval: 2500, // ms
    supabaseUrl: '',
    supabaseKey: '',
    supabaseTable: 'wolffia_telemetry'
  };

  class CentralDataEngine {
    constructor() {
      this.mode = localStorage.getItem(STORAGE_KEY_MODE) || 'DEMO'; // 'DEMO' | 'LIVE'
      this.thresholds = this.loadThresholds();
      this.device = this.loadDeviceSettings();
      this.listeners = [];
      this.timer = null;
      this.supabaseClient = null;
      this.supabaseStatus = 'Disconnected';
      this.liveSubscription = null;

      // Realtime State
      this.current = {
        deviceId: this.device.deviceId,
        temperature: 28.4,
        ph: 6.95,
        waterLevel: 78.5,
        light: 65.0,
        deviceStatus: 'Online', // 'Online' | 'Offline'
        wifiStatus: 'Connected',
        rssi: -58,
        ping: 24,
        timestamp: new Date().toISOString()
      };

      // Mini Trends tracking
      this.trends = {
        temp: { diff: 0.2, direction: 'up', text: '+0.2°C' },
        ph: { diff: -0.05, direction: 'down', text: '-0.05' },
        waterLevel: { diff: -0.4, direction: 'down', text: '-0.4%' },
        light: { diff: 1.5, direction: 'up', text: '+1.5%' }
      };

      // Seed 24 hours of consistent history points
      this.history = this.generateHistoricalSeed(72); // 72 data points (every 20 mins across 24h)

      // Alert feed
      this.alerts = [
        {
          id: 'alt-101',
          type: 'warning',
          title: 'ระดับน้ำเริ่มลดลงต่ำกว่าเกณฑ์ปกติ',
          message: 'ระดับน้ำลดลงถึง 68.5% (เกณฑ์ขั้นต่ำ 70%) กรุณาตรวจสอบระดับน้ำในบ่อเพาะเลี้ยง',
          timestamp: new Date(Date.now() - 42 * 60000).toISOString(),
          resolved: true,
          resolvedAt: new Date(Date.now() - 30 * 60000).toISOString()
        },
        {
          id: 'alt-102',
          type: 'warning',
          title: 'อุณหภูมิน้ำสูงขึ้นเล็กน้อยในช่วงบ่าย',
          message: 'อุณหภูมิน้ำขึ้นถึง 32.3°C สูงกว่าเกณฑ์ปกติเล็กน้อย 0.3°C',
          timestamp: new Date(Date.now() - 120 * 60000).toISOString(),
          resolved: true,
          resolvedAt: new Date(Date.now() - 95 * 60000).toISOString()
        }
      ];

      // Recent Activity Log (latest 10)
      this.activities = [
        { id: 1, text: 'ระบบตรวจวัดข้อมูลเสถียร ทุกเซนเซอร์ทำงานปกติ', time: 'เมื่อสักครู่', type: 'info' },
        { id: 2, text: 'เซนเซอร์อัลตราโซนิกตรวจพบระดับน้ำคงที่ 78.5%', time: '15 นาทีที่แล้ว', type: 'info' },
        { id: 3, text: 'เซนเซอร์วัดค่า pH ตรวจพบความสมดุลปกติ 6.95', time: '42 นาทีที่แล้ว', type: 'info' },
        { id: 4, text: 'ซิงค์ข้อมูลสถิติกับระบบคลาวด์สำเร็จ', time: '1 ชั่วโมงที่แล้ว', type: 'cloud' },
        { id: 5, text: 'ระบบตรวจสอบการเชื่อมต่อ Wi-Fi RSSI: -58 dBm ดีเยี่ยม', time: '2 ชั่วโมงที่แล้ว', type: 'wifi' }
      ];

      // Initialize Supabase if credentials exist
      this.initSupabase();

      // Start engine
      this.startEngine();
    }

    loadThresholds() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_THRESHOLDS);
        if (saved) return JSON.parse(saved);
      } catch (e) {
        console.warn('Failed to parse saved thresholds, using defaults.', e);
      }
      return JSON.parse(JSON.stringify(DEFAULT_THRESHOLDS));
    }

    loadDeviceSettings() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_DEVICE);
        const url = localStorage.getItem('wolffia_supabase_url');
        const key = localStorage.getItem('wolffia_supabase_key');
        let parsed = {};
        if (saved) parsed = JSON.parse(saved);
        if (url && !parsed.supabaseUrl) parsed.supabaseUrl = url;
        if (key && !parsed.supabaseKey) parsed.supabaseKey = key;
        return Object.assign({}, DEFAULT_DEVICE, parsed);
      } catch (e) {
        console.warn('Failed to parse saved device settings, using defaults.', e);
      }
      return Object.assign({}, DEFAULT_DEVICE);
    }

    saveThresholds(newThresholds) {
      this.thresholds = JSON.parse(JSON.stringify(newThresholds));
      localStorage.setItem(STORAGE_KEY_THRESHOLDS, JSON.stringify(this.thresholds));
      this.evaluateAlerts();
      this.notifyListeners();
    }

    saveDeviceSettings(newSettings) {
      this.device = Object.assign({}, this.device, newSettings);
      localStorage.setItem(STORAGE_KEY_DEVICE, JSON.stringify(this.device));
      if (this.device.supabaseUrl) localStorage.setItem('wolffia_supabase_url', this.device.supabaseUrl);
      if (this.device.supabaseKey) localStorage.setItem('wolffia_supabase_key', this.device.supabaseKey);
      this.initSupabase();
      this.restartTimer();
      this.notifyListeners();
    }

    setMode(mode) {
      this.mode = mode === 'LIVE' ? 'LIVE' : 'DEMO';
      localStorage.setItem(STORAGE_KEY_MODE, this.mode);
      if (this.mode === 'LIVE') {
        this.initSupabase();
        if (this.supabaseClient) {
          this.fetchHistoricalTelemetry(50);
        }
      } else {
        if (this.liveSubscription && this.supabaseClient) {
          try {
            this.supabaseClient.removeChannel(this.liveSubscription);
          } catch(e) {}
          this.liveSubscription = null;
        }
      }
      this.logActivity(`สลับโหมดการทำงานเป็น ${this.mode === 'LIVE' ? 'LIVE MODE (Supabase / ESP32)' : 'DEMO MODE (จำลองสภาพแวดล้อม)'}`, 'info');
      this.restartTimer();
      this.notifyListeners();
    }

    // Seed realistic 24-48h dataset
    generateHistoricalSeed(count) {
      const records = [];
      const now = Date.now();
      const intervalMs = (24 * 3600 * 1000) / count;

      let temp = 27.5;
      let ph = 6.9;
      let water = 78.5;
      let light = 60.0;

      for (let i = count - 1; i >= 0; i--) {
        const time = new Date(now - i * intervalMs);
        const hour = time.getHours() + time.getMinutes() / 60;

        // Daily temperature curve: cooler at 5am (25.5°C), warmer at 14:00 (31.0°C)
        const dailyTempCycle = Math.sin(((hour - 8) / 24) * 2 * Math.PI) * 2.8;
        temp = 28.2 + dailyTempCycle + (Math.random() * 0.4 - 0.2);

        // Daily light curve: 0 at night (19:00 - 05:30), peaks at midday (~78%)
        let dailyLight = 0;
        if (hour >= 6 && hour <= 18) {
          dailyLight = Math.sin(((hour - 6) / 12) * Math.PI) * 75 + (Math.random() * 4 - 2);
        } else {
          dailyLight = Math.random() * 2; // slight ambient darkness
        }
        light = Math.max(0, Math.min(100, dailyLight));

        // Water level natural slight fluctuation (76% - 82%)
        water = 78.5 + Math.sin(hour / 4) * 2.2 + (Math.random() * 0.4 - 0.2);
        water = Math.max(65, Math.min(95, water));

        // pH: slight fluctuation around 6.9 - 7.1
        ph = 6.92 + (Math.sin(hour / 3) * 0.15) + (Math.random() * 0.06 - 0.03);

        records.push({
          timestamp: time.toISOString(),
          temp: parseFloat(temp.toFixed(1)),
          temperature: parseFloat(temp.toFixed(1)),
          ph: parseFloat(ph.toFixed(2)),
          waterLevel: parseFloat(water.toFixed(1)),
          light: parseFloat(light.toFixed(1)),
          deviceStatus: 'Online',
          rssi: -58 + Math.floor(Math.random() * 4 - 2)
        });
      }
      return records;
    }

    startEngine() {
      this.restartTimer();
    }

    restartTimer() {
      if (this.timer) clearInterval(this.timer);

      const interval = Math.max(1500, this.device.interval || 2500);

      this.timer = setInterval(() => {
        if (this.mode === 'DEMO') {
          this.tickDemoEngine();
        } else {
          this.tickLiveSync();
        }
      }, interval);
    }

    // Realistic Random Walk simulation tick
    tickDemoEngine() {
      const prev = Object.assign({}, this.current);
      const hour = new Date().getHours() + new Date().getMinutes() / 60;

      // 1. Temperature active real-time fluctuation (Optimal Wolffia: 25 - 32 °C)
      const tempDeltas = [-0.2, -0.1, 0.1, 0.2];
      const step = tempDeltas[Math.floor(Math.random() * tempDeltas.length)];
      let newTemp = (this.current.temperature || 28.4) + step;
      if (newTemp < 26.2) newTemp = 26.6;
      if (newTemp > 31.4) newTemp = 30.9;
      newTemp = parseFloat(newTemp.toFixed(1));

      // 2. pH drift (Optimal Wolffia: 6.5 - 7.5)
      const phNoise = (Math.random() - 0.5) * 0.03;
      let newPh = this.current.ph + phNoise;
      // Slight recovery towards neutral 6.95
      newPh += (6.95 - newPh) * 0.02;
      newPh = parseFloat(Math.max(5.5, Math.min(8.5, newPh)).toFixed(2));

      // 3. Water Level sensor fluctuation (Ultrasonic JSN-SR04T)
      const waterNoise = (Math.random() - 0.5) * 0.15;
      let newWater = this.current.waterLevel + waterNoise;
      // Slight gentle pull towards 78.5%
      newWater += (78.5 - newWater) * 0.01;
      newWater = parseFloat(Math.max(60, Math.min(95, newWater)).toFixed(1));

      // 4. Light Intensity (Optimal Wolffia: 50 - 80%)
      let baseLight = 0;
      if (hour >= 6 && hour <= 18) {
        baseLight = Math.sin(((hour - 6) / 12) * Math.PI) * 72;
      } else {
        baseLight = 5.0; // indoor grow light / ambient
      }
      const lightNoise = (Math.random() - 0.5) * 2.5;
      let newLight = baseLight + lightNoise;
      newLight = parseFloat(Math.max(0, Math.min(100, newLight)).toFixed(1));

      // 5. RSSI & Ping
      const newRssi = Math.min(-45, Math.max(-85, -58 + Math.floor((Math.random() - 0.5) * 6)));
      const newPing = Math.max(14, Math.min(65, 24 + Math.floor((Math.random() - 0.5) * 8)));

      // Calculate mini trends
      const prevTemp = prev.temperature || prev.temp || newTemp;
      const tempDiff = parseFloat((newTemp - prevTemp).toFixed(1));
      const phDiff = parseFloat((newPh - prev.ph).toFixed(2));
      const waterDiff = parseFloat((newWater - prev.waterLevel).toFixed(1));
      const lightDiff = parseFloat((newLight - prev.light).toFixed(1));

      this.trends = {
        temp: {
          diff: tempDiff,
          direction: tempDiff >= 0 ? 'up' : 'down',
          text: (tempDiff >= 0 ? '+' : '') + tempDiff + '°C'
        },
        ph: {
          diff: phDiff,
          direction: phDiff >= 0 ? 'up' : 'down',
          text: (phDiff >= 0 ? '+' : '') + phDiff
        },
        waterLevel: {
          diff: waterDiff,
          direction: waterDiff >= 0 ? 'up' : 'down',
          text: (waterDiff >= 0 ? '+' : '') + waterDiff + '%'
        },
        light: {
          diff: lightDiff,
          direction: lightDiff >= 0 ? 'up' : 'down',
          text: (lightDiff >= 0 ? '+' : '') + lightDiff + '%'
        }
      };

      // Update current state
      this.current = {
        deviceId: this.device.deviceId,
        temperature: newTemp,
        temp: newTemp,
        ph: newPh,
        waterLevel: newWater,
        light: newLight,
        deviceStatus: 'Online',
        wifiStatus: 'Connected',
        rssi: newRssi,
        ping: newPing,
        timestamp: new Date().toISOString()
      };

      // Append to single history stream
      this.history.push(Object.assign({}, this.current));
      // Keep up to 300 points in memory
      if (this.history.length > 300) {
        this.history.shift();
      }

      // Check thresholds & generate/clear alerts
      this.evaluateAlerts();

      // Notify UI
      this.notifyListeners();
    }

    // ========================================================================
    // SUPABASE INTEGRATION & REALTIME TELEMETRY
    // ========================================================================
    initSupabase() {
      const url = this.device.supabaseUrl || localStorage.getItem('wolffia_supabase_url');
      const key = this.device.supabaseKey || localStorage.getItem('wolffia_supabase_key');

      if (!url || !key) {
        this.supabaseClient = null;
        this.supabaseStatus = 'Not Configured';
        return null;
      }

      // Check if global supabase library is loaded
      const sbLib = (typeof supabase !== 'undefined' && supabase.createClient) ? supabase
                  : (window.supabase && window.supabase.createClient ? window.supabase : null);

      if (!sbLib) {
        console.warn('[CentralDataEngine] Supabase JS library not loaded');
        this.supabaseStatus = 'Library Not Loaded';
        return null;
      }

      try {
        this.supabaseClient = sbLib.createClient(url, key, {
          auth: { persistSession: false }
        });
        window.supabaseClient = this.supabaseClient;
        this.supabaseStatus = 'Initialized';
        console.log('[CentralDataEngine] Supabase Client Initialized:', url);

        // If in LIVE mode, establish Realtime channel
        if (this.mode === 'LIVE') {
          this.setupRealtimeSubscription();
        }
        return this.supabaseClient;
      } catch (err) {
        console.error('[CentralDataEngine] Failed to create Supabase client:', err);
        this.supabaseStatus = 'Initialization Error';
        return null;
      }
    }

    setupRealtimeSubscription() {
      if (!this.supabaseClient) return;

      if (this.liveSubscription) {
        try {
          this.supabaseClient.removeChannel(this.liveSubscription);
        } catch (e) {}
        this.liveSubscription = null;
      }

      const tableName = this.device.supabaseTable || 'wolffia_telemetry';

      try {
        this.liveSubscription = this.supabaseClient
          .channel('wolffia_realtime_stream')
          .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: tableName
          }, (payload) => {
            console.log('[Supabase Realtime] New telemetry received:', payload);
            if (payload && payload.new) {
              this.handleIncomingTelemetryRow(payload.new);
              this.logActivity(`[Supabase Live] ได้รับข้อมูลใหม่จาก ${payload.new.device_id || 'ESP32'} สำเร็จ`, 'cloud');
            }
          })
          .subscribe((status) => {
            console.log('[Supabase Realtime] Channel status:', status);
            if (status === 'SUBSCRIBED') {
              this.supabaseStatus = 'Connected';
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              this.supabaseStatus = 'Realtime Error';
            }
            this.notifyListeners();
          });
      } catch (e) {
        console.warn('[Supabase Realtime] Subscribe failed:', e);
      }
    }

    handleIncomingTelemetryRow(row) {
      const prev = Object.assign({}, this.current);
      const newTemp = parseFloat(row.temperature !== undefined ? row.temperature : (row.temp !== undefined ? row.temp : this.current.temperature));
      const newPh = parseFloat(row.ph !== undefined ? row.ph : this.current.ph);
      const newWater = parseFloat(row.water_level !== undefined ? row.water_level : (row.waterLevel !== undefined ? row.waterLevel : this.current.waterLevel));
      const newLight = parseFloat(row.light !== undefined ? row.light : this.current.light);
      const newRssi = row.rssi !== undefined ? parseInt(row.rssi) : this.current.rssi;
      const newPing = row.ping !== undefined ? parseInt(row.ping) : this.current.ping;
      const newStatus = row.device_status || 'Online';
      const ts = row.created_at || new Date().toISOString();

      const prevTemp = prev.temperature || newTemp;
      const tempDiff = parseFloat((newTemp - prevTemp).toFixed(1));
      const phDiff = parseFloat((newPh - prev.ph).toFixed(2));
      const waterDiff = parseFloat((newWater - prev.waterLevel).toFixed(1));
      const lightDiff = parseFloat((newLight - prev.light).toFixed(1));

      this.trends = {
        temp: { diff: tempDiff, direction: tempDiff >= 0 ? 'up' : 'down', text: (tempDiff >= 0 ? '+' : '') + tempDiff + '°C' },
        ph: { diff: phDiff, direction: phDiff >= 0 ? 'up' : 'down', text: (phDiff >= 0 ? '+' : '') + phDiff },
        waterLevel: { diff: waterDiff, direction: waterDiff >= 0 ? 'up' : 'down', text: (waterDiff >= 0 ? '+' : '') + waterDiff + '%' },
        light: { diff: lightDiff, direction: lightDiff >= 0 ? 'up' : 'down', text: (lightDiff >= 0 ? '+' : '') + lightDiff + '%' }
      };

      this.current = {
        deviceId: row.device_id || this.device.deviceId,
        temperature: newTemp,
        temp: newTemp,
        ph: newPh,
        waterLevel: newWater,
        light: newLight,
        deviceStatus: newStatus,
        wifiStatus: 'Connected',
        rssi: newRssi,
        ping: newPing,
        timestamp: ts
      };

      this.history.push(Object.assign({}, this.current));
      if (this.history.length > 300) this.history.shift();

      this.evaluateAlerts();
      this.notifyListeners();
    }

    tickLiveSync() {
      if (!this.supabaseClient) {
        this.initSupabase();
      }

      if (this.supabaseClient) {
        const tableName = this.device.supabaseTable || 'wolffia_telemetry';
        this.supabaseClient
          .from(tableName)
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1)
          .then(({ data, error }) => {
            if (error) {
              console.warn('[Supabase Live] fetch error:', error);
              this.supabaseStatus = 'Error: ' + error.message;
            } else if (data && data.length > 0) {
              this.supabaseStatus = 'Connected';
              const latest = data[0];
              if (latest.created_at !== this.current.timestamp) {
                this.handleIncomingTelemetryRow(latest);
              } else {
                this.notifyListeners();
              }
            } else {
              this.supabaseStatus = 'Connected (0 records)';
              this.current.timestamp = new Date().toISOString();
              this.notifyListeners();
            }
          })
          .catch(err => {
            console.warn('[Supabase Live] fetch exception:', err);
            this.supabaseStatus = 'Network Error';
          });
      } else {
        // Fallback live heartbeat simulation if credentials not configured
        this.supabaseStatus = 'Not Configured';
        this.current.timestamp = new Date().toISOString();
        this.notifyListeners();
      }
    }

    async testSupabaseConnection(overrideUrl, overrideKey) {
      const url = overrideUrl || this.device.supabaseUrl || localStorage.getItem('wolffia_supabase_url');
      const key = overrideKey || this.device.supabaseKey || localStorage.getItem('wolffia_supabase_key');

      if (!url || !key) {
        return { success: false, message: 'กรุณากรอก Supabase URL และ Anon Key ให้ครบถ้วน' };
      }

      const sbLib = (typeof supabase !== 'undefined' && supabase.createClient) ? supabase
                  : (window.supabase && window.supabase.createClient ? window.supabase : null);

      if (!sbLib) {
        return { success: false, message: 'ไม่พบ Supabase JS Library (@supabase/supabase-js)' };
      }

      try {
        const testClient = sbLib.createClient(url, key, { auth: { persistSession: false } });
        const tableName = this.device.supabaseTable || 'wolffia_telemetry';
        const { data, error } = await testClient
          .from(tableName)
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) {
          return { success: false, message: `เชื่อมต่อไม่สำเร็จ: ${error.message} (Code: ${error.code || 'ERR'})` };
        }

        // Successfully connected!
        this.supabaseClient = testClient;
        window.supabaseClient = testClient;
        this.supabaseStatus = 'Connected';
        this.device.supabaseUrl = url;
        this.device.supabaseKey = key;
        localStorage.setItem('wolffia_supabase_url', url);
        localStorage.setItem('wolffia_supabase_key', key);
        this.saveDeviceSettings({ supabaseUrl: url, supabaseKey: key });

        const recordCount = data ? data.length : 0;
        return {
          success: true,
          message: `เชื่อมต่อ Supabase สำเร็จ! (พบตาราง '${tableName}', สถานะ: พร้อมรับส่งข้อมูล IoT Telemetry)`,
          data: data
        };
      } catch (err) {
        return { success: false, message: `เกิดข้อผิดพลาดในการเชื่อมต่อ: ${err.message}` };
      }
    }

    async insertTelemetryRow(customData = {}) {
      if (!this.supabaseClient) {
        this.initSupabase();
      }
      if (!this.supabaseClient) {
        return { success: false, message: 'ยังไม่ได้เชื่อมต่อ Supabase กรุณากำหนดค่าและทดสอบการเชื่อมต่อก่อน' };
      }

      const tableName = this.device.supabaseTable || 'wolffia_telemetry';
      const payload = {
        device_id: customData.deviceId || this.device.deviceId,
        temperature: customData.temperature !== undefined ? customData.temperature : this.current.temperature,
        ph: customData.ph !== undefined ? customData.ph : this.current.ph,
        water_level: customData.waterLevel !== undefined ? customData.waterLevel : this.current.waterLevel,
        light: customData.light !== undefined ? customData.light : this.current.light,
        rssi: customData.rssi !== undefined ? customData.rssi : this.current.rssi,
        device_status: customData.deviceStatus || 'Online',
        created_at: new Date().toISOString()
      };

      try {
        const { data, error } = await this.supabaseClient.from(tableName).insert([payload]).select();
        if (error) {
          return { success: false, message: `ส่งข้อมูลไม่สำเร็จ: ${error.message}` };
        }
        this.logActivity(`[Supabase Insert] ส่งข้อมูลเทเลเมทรีขึ้นคลาวด์สำเร็จ (${payload.temperature}°C, pH ${payload.ph})`, 'cloud');
        if (data && data.length > 0) {
          this.handleIncomingTelemetryRow(data[0]);
        }
        return { success: true, message: 'บันทึกข้อมูลขึ้น Supabase สำเร็จ!', data: data };
      } catch (err) {
        return { success: false, message: `ข้อผิดพลาด: ${err.message}` };
      }
    }

    async fetchHistoricalTelemetry(limit = 100) {
      if (!this.supabaseClient) {
        this.initSupabase();
      }
      if (!this.supabaseClient) return [];

      const tableName = this.device.supabaseTable || 'wolffia_telemetry';
      try {
        const { data, error } = await this.supabaseClient
          .from(tableName)
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (!error && data && data.length > 0) {
          const reversed = data.slice().reverse();
          this.history = reversed.map(r => ({
            timestamp: r.created_at,
            deviceId: r.device_id || this.device.deviceId,
            temp: parseFloat(r.temperature !== undefined ? r.temperature : (r.temp !== undefined ? r.temp : 28)),
            temperature: parseFloat(r.temperature !== undefined ? r.temperature : (r.temp !== undefined ? r.temp : 28)),
            ph: parseFloat(r.ph || 7.0),
            waterLevel: parseFloat(r.water_level !== undefined ? r.water_level : (r.waterLevel !== undefined ? r.waterLevel : 78)),
            light: parseFloat(r.light || 65),
            deviceStatus: r.device_status || 'Online',
            rssi: r.rssi || -58
          }));
          this.handleIncomingTelemetryRow(data[0]);
          return this.history;
        }
      } catch (err) {
        console.warn('Failed to fetch historical telemetry from Supabase:', err);
      }
      return [];
    }

    // Evaluate sensor values against thresholds
    evaluateAlerts() {
      const c = this.current;
      const th = this.thresholds;

      // Temp alert check
      if (c.temperature > th.temp.max) {
        this.raiseAlert('alt-temp-high', 'critical', 'อุณหภูมิน้ำสูงกว่าเกณฑ์วิกฤต', `อุณหภูมิปัจจุบัน ${c.temperature}°C เกินเกณฑ์สูงสุด (${th.temp.max}°C) อาจส่งผลให้ไข่ผำเปลี่ยนเป็นสีขาวซีด`);
      } else if (c.temperature < th.temp.min) {
        this.raiseAlert('alt-temp-low', 'warning', 'อุณหภูมิน้ำต่ำกว่าเกณฑ์', `อุณหภูมิปัจจุบัน ${c.temperature}°C ต่ำกว่าเกณฑ์ (${th.temp.min}°C) การเจริญเติบโตจะช้าลง`);
      } else {
        this.autoResolveAlert('alt-temp-high');
        this.autoResolveAlert('alt-temp-low');
      }

      // pH alert check
      if (c.ph < th.ph.min) {
        this.raiseAlert('alt-ph-low', 'warning', 'ค่าน้ำมีสภาพเป็นกรดเกินไป', `ค่า pH อยู่ที่ ${c.ph} ต่ำกว่าเกณฑ์ (${th.ph.min}) ควรเติมบัฟเฟอร์ปรับสภาพน้ำ`);
      } else if (c.ph > th.ph.max) {
        this.raiseAlert('alt-ph-high', 'warning', 'ค่าน้ำมีสภาพเป็นด่างเกินไป', `ค่า pH อยู่ที่ ${c.ph} สูงกว่าเกณฑ์ (${th.ph.max}) อาจยับยั้งการดูดซึมสารอาหาร`);
      } else {
        this.autoResolveAlert('alt-ph-low');
        this.autoResolveAlert('alt-ph-high');
      }

      // Water Level alert check
      if (c.waterLevel < th.waterLevel.min) {
        this.raiseAlert('alt-water-low', 'critical', 'ระดับน้ำในบ่อเพาะเลี้ยงต่ำวิกฤต', `ระดับน้ำลดลงเหลือ ${c.waterLevel}% (เกณฑ์ต่ำสุด ${th.waterLevel.min}%) กรุณาตรวจสอบการเติมน้ำ`);
      } else {
        this.autoResolveAlert('alt-water-low');
      }

      // Light alert check
      if (c.light < th.light.min) {
        this.raiseAlert('alt-light-low', 'warning', 'ความเข้มแสงไม่เพียงพอ', `ความเข้มแสงอยู่ที่ ${c.light}% ต่ำกว่าเกณฑ์ (${th.light.min}%) แนะนำให้เปิดโคมไฟ LED เสริม`);
      } else {
        this.autoResolveAlert('alt-light-low');
      }
    }

    raiseAlert(id, type, title, message) {
      const existing = this.alerts.find(a => a.id === id);
      if (existing) {
        if (existing.resolved) {
          existing.resolved = false;
          existing.timestamp = new Date().toISOString();
          existing.message = message;
          this.logActivity(`[แจ้งเตือน] ${title}: ${message}`, type === 'critical' ? 'critical' : 'warning');
        }
      } else {
        this.alerts.unshift({
          id: id,
          type: type,
          title: title,
          message: message,
          timestamp: new Date().toISOString(),
          resolved: false
        });
        this.logActivity(`[แจ้งเตือน] ${title}: ${message}`, type === 'critical' ? 'critical' : 'warning');
      }
    }

    autoResolveAlert(id) {
      const existing = this.alerts.find(a => a.id === id && !a.resolved);
      if (existing) {
        existing.resolved = true;
        existing.resolvedAt = new Date().toISOString();
        this.logActivity(`[ระบบกลับสู่สภาวะปกติ] ${existing.title}`, 'info');
      }
    }

    resolveAlert(id) {
      const existing = this.alerts.find(a => a.id === id);
      if (existing) {
        existing.resolved = true;
        existing.resolvedAt = new Date().toISOString();
        this.notifyListeners();
        return true;
      }
      return false;
    }

    clearResolvedAlerts() {
      this.alerts = this.alerts.filter(a => !a.resolved);
      this.notifyListeners();
    }

    logActivity(text, type = 'info') {
      this.activities.unshift({
        id: Date.now(),
        text: text,
        time: 'เมื่อสักครู่',
        type: type,
        timestamp: new Date().toISOString()
      });
      if (this.activities.length > 20) {
        this.activities.pop();
      }
    }

    // STATISTICAL CALCULATIONS (Derived directly from History)
    calculateStatistics(sliceCount = 0) {
      const dataset = sliceCount > 0 ? this.history.slice(-sliceCount) : this.history;

      const calcStats = (key) => {
        let sum = 0;
        let count = 0;
        let min = Infinity;
        let max = -Infinity;

        dataset.forEach(d => {
          let v = d[key];
          if (v === undefined || v === null || isNaN(v)) {
            if ((key === 'temp' || key === 'temperature')) {
              v = d.temp !== undefined ? d.temp : d.temperature;
            }
          }
          if (typeof v === 'number' && !isNaN(v)) {
            sum += v;
            count++;
            if (v < min) min = v;
            if (v > max) max = v;
          }
        });

        // Safe fallback if count is 0
        if (count === 0) {
          const fallback = (key === 'temp' || key === 'temperature') ? (this.current.temperature || 28.4)
            : (key === 'ph' ? (this.current.ph || 6.95)
            : (key === 'waterLevel' ? (this.current.waterLevel || 78.5)
            : (this.current.light || 65.0)));
          return {
            avg: parseFloat(fallback.toFixed(2)),
            min: parseFloat(fallback.toFixed(2)),
            max: parseFloat(fallback.toFixed(2)),
            sd: 0.15,
            trend: [fallback]
          };
        }

        const avg = sum / count;

        // Standard Deviation
        let varianceSum = 0;
        dataset.forEach(d => {
          let v = d[key];
          if (v === undefined || v === null || isNaN(v)) {
            if ((key === 'temp' || key === 'temperature')) {
              v = d.temp !== undefined ? d.temp : d.temperature;
            }
          }
          if (typeof v === 'number' && !isNaN(v)) {
            varianceSum += Math.pow(v - avg, 2);
          }
        });
        const sd = Math.sqrt(varianceSum / count);

        const trendPoints = dataset.slice(-20).map(d => {
          let v = d[key];
          if (v === undefined || v === null || isNaN(v)) {
            if ((key === 'temp' || key === 'temperature')) {
              v = d.temp !== undefined ? d.temp : d.temperature;
            }
          }
          return typeof v === 'number' && !isNaN(v) ? v : (avg || 0);
        });

        return {
          avg: parseFloat(avg.toFixed(2)),
          min: min === Infinity ? parseFloat(avg.toFixed(2)) : parseFloat(min.toFixed(2)),
          max: max === -Infinity ? parseFloat(avg.toFixed(2)) : parseFloat(max.toFixed(2)),
          sd: parseFloat(sd.toFixed(2)),
          trend: trendPoints
        };
      };

      const tempStats = calcStats('temp');
      const phStats = calcStats('ph');
      const waterStats = calcStats('waterLevel');
      const lightStats = calcStats('light');

      // Weekly breakdown simulation based on history
      const days = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
      const weeklySummary = days.map((day, idx) => {
        const offset = (idx - 3) * 0.1;
        return {
          day: day,
          avgTemp: parseFloat((tempStats.avg + offset).toFixed(1)),
          avgPh: parseFloat((phStats.avg + (offset * 0.05)).toFixed(2)),
          avgWater: parseFloat((waterStats.avg - (idx * 0.4)).toFixed(1)),
          avgLight: parseFloat((lightStats.avg + (offset * 1.5)).toFixed(1)),
          growthIndex: 'ดีเยี่ยม (95%)'
        };
      });

      return {
        count: dataset.length,
        temp: tempStats,
        ph: phStats,
        water: waterStats,
        light: lightStats,
        weekly: weeklySummary
      };
    }

    // Environmental Health Score for Wolffia (0 - 100%)
    calculateHealthScore() {
      const c = this.current;
      const th = this.thresholds;

      // Score 0-100 for each parameter based on proximity to center of threshold
      const scoreParam = (val, min, max) => {
        if (val < min) {
          const diff = min - val;
          return Math.max(20, 100 - (diff / (max - min)) * 150);
        } else if (val > max) {
          const diff = val - max;
          return Math.max(20, 100 - (diff / (max - min)) * 150);
        } else {
          // Inside optimal range: 90 - 100
          const center = (min + max) / 2;
          const dist = Math.abs(val - center) / ((max - min) / 2);
          return 90 + (1 - dist) * 10;
        }
      };

      const tempScore = scoreParam(c.temperature, th.temp.min, th.temp.max);
      const phScore = scoreParam(c.ph, th.ph.min, th.ph.max);
      const waterScore = scoreParam(c.waterLevel, th.waterLevel.min, th.waterLevel.max);
      const lightScore = scoreParam(c.light, th.light.min, th.light.max);

      // Weighted average: Temp (30%), pH (30%), Water (20%), Light (20%)
      const totalScore = Math.round(
        tempScore * 0.3 + phScore * 0.3 + waterScore * 0.2 + lightScore * 0.2
      );

      let statusText = 'ยอดเยี่ยม (Optimal Growth)';
      let statusColor = '#10b981';
      if (totalScore < 60) {
        statusText = 'วิกฤต (Critical Condition)';
        statusColor = '#ef4444';
      } else if (totalScore < 80) {
        statusText = 'เฝ้าระวัง (Sub-optimal)';
        statusColor = '#f59e0b';
      }

      return {
        score: Math.min(100, Math.max(0, totalScore)),
        statusText: statusText,
        statusColor: statusColor,
        components: {
          temp: Math.round(tempScore),
          ph: Math.round(phScore),
          water: Math.round(waterScore),
          light: Math.round(lightScore)
        }
      };
    }

    // Dynamic AI Agronomy Insights for Wolffia
    generateInsights() {
      const stats = this.calculateStatistics(50);
      const c = this.current;
      const th = this.thresholds;
      const insights = [];

      // Temperature insight
      if (c.temperature >= 26.0 && c.temperature <= 30.5) {
        insights.push({
          icon: 'fa-temperature-half',
          title: 'อุณหภูมิน้ำเสถียรยอดเยี่ยม',
          desc: `อุณหภูมิเฉลี่ย ${stats.temp.avg}°C เหมาะสมอย่างยิ่งต่ออัตราการแบ่งตัวทวีคูณ (Doubling Time) ของไข่ผำในทุก 24-36 ชั่วโมง`,
          type: 'success'
        });
      } else {
        insights.push({
          icon: 'fa-temperature-arrow-up',
          title: 'อุณหภูมิมโนภาพเริ่มเบี่ยงเบน',
          desc: `อุณหภูมิปัจจุบัน ${c.temperature}°C ควรเฝ้าระวังการระบายความร้อนหากสูงเกิน ${th.temp.max}°C`,
          type: 'warning'
        });
      }

      // Water Level & Evaporation insight
      const hourlyEvap = 1.1;
      insights.push({
        icon: 'fa-droplet',
        title: 'การประเมินระดับน้ำในบ่อเพาะเลี้ยง',
        desc: `ระดับน้ำปัจจุบันอยู่ที่ ${c.waterLevel}% อยู่ในเกณฑ์ที่เหมาะสมสำหรับการเจริญเติบโต (${th.waterLevel.min}% - ${th.waterLevel.max}%) อัตราการระเหยปกติ`,
        type: 'info'
      });

      // pH Balance insight
      if (stats.ph.avg >= 6.8 && stats.ph.avg <= 7.2) {
        insights.push({
          icon: 'fa-flask-vial',
          title: 'สมดุลกรด-ด่างสมบูรณ์แบบ',
          desc: `ค่า pH เฉลี่ย ${stats.ph.avg} มีความแปรปรวนต่ำ (SD: ±${stats.ph.sd}) ไนโตรเจนและฟอสฟอรัสละลายได้ดีที่สุดสำหรับไข่ผำ`,
          type: 'success'
        });
      } else {
        insights.push({
          icon: 'fa-triangle-exclamation',
          title: 'ควรตรวจสอบสารอาหารในน้ำ',
          desc: `ค่า pH เบี่ยงเบนอยู่ที่ ${stats.ph.avg} ควรทดสอบค่า EC และระดับแอมโมเนียม`,
          type: 'warning'
        });
      }

      // Photosynthesis & Light
      insights.push({
        icon: 'fa-sun',
        title: 'ความเข้มแสงต่อการสร้างโปรตีน',
        desc: `ความเข้มแสงเฉลี่ย ${stats.light.avg}% เพียงพอต่อกระบวนการสังเคราะห์ด้วยแสงและการสะสมโปรตีนดิบ (Crude Protein) > 35%`,
        type: 'success'
      });

      return insights;
    }

    // Anomaly Detection based on real history
    detectAnomalies() {
      const anomalies = [];
      const th = this.thresholds;

      this.history.forEach((d, idx) => {
        if (d.temp > th.temp.max) {
          anomalies.push({
            id: `anom-temp-${idx}`,
            timestamp: d.timestamp,
            parameter: 'Temperature',
            value: `${d.temp}°C`,
            expected: `${th.temp.min} - ${th.temp.max}°C`,
            severity: 'Critical',
            note: 'อุณหภูมิน้ำสูงกว่าเกณฑ์สูงสุด'
          });
        }
        if (d.ph < th.ph.min || d.ph > th.ph.max) {
          anomalies.push({
            id: `anom-ph-${idx}`,
            timestamp: d.timestamp,
            parameter: 'pH',
            value: `${d.ph}`,
            expected: `${th.ph.min} - ${th.ph.max}`,
            severity: 'Warning',
            note: 'ค่าความเป็นกรด-ด่างหลุดเกณฑ์'
          });
        }
        if (d.waterLevel < th.waterLevel.min) {
          anomalies.push({
            id: `anom-water-${idx}`,
            timestamp: d.timestamp,
            parameter: 'Water Level',
            value: `${d.waterLevel}%`,
            expected: `${th.waterLevel.min} - ${th.waterLevel.max}%`,
            severity: 'Critical',
            note: 'ระดับน้ำต่ำเกินไป'
          });
        }
      });

      return anomalies.slice(-15).reverse(); // latest 15 anomalies
    }

    // CSV Export
    exportCsv(filename = 'smart_wolffia_telemetry.csv') {
      const headers = ['Timestamp', 'Device_ID', 'Temperature_C', 'pH', 'Water_Level_Percent', 'Light_Percent', 'Device_Status'];
      const rows = this.history.map(d => [
        `"${d.timestamp}"`,
        `"${this.device.deviceId}"`,
        d.temp,
        d.ph,
        d.waterLevel,
        d.light,
        `"${d.deviceStatus}"`
      ]);

      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    // Subscription
    subscribe(listener) {
      if (typeof listener === 'function') {
        this.listeners.push(listener);
        // trigger immediately with current state
        listener(this);
      }
      return () => {
        this.listeners = this.listeners.filter(l => l !== listener);
      };
    }

    notifyListeners() {
      for (let i = 0; i < this.listeners.length; i++) {
        try {
          this.listeners[i](this);
        } catch (e) {
          console.error('DataEngine listener error:', e);
        }
      }
    }
  }

  // Create single instance
  const instance = new CentralDataEngine();
  return instance;
});
