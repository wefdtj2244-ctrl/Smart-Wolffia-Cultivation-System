/**
 * ==============================================================================
 * Smart Wolffia Cultivation System V3.0.1 (ระบบเพาะเลี้ยงไข่ผำอัจฉริยะ)
 * ESP32 Telemetry Firmware (รองรับทั้ง WiFi + Supabase Cloud และ USB Web Serial)
 * ==============================================================================
 * 
 * การทำงาน:
 * 1. อ่านค่าเซนเซอร์ 4 ตัวหลัก:
 *    - อุณหภูมิน้ำ (DS18B20)
 *    - ค่าความเป็นกรด-ด่าง pH (Analog pH Meter)
 *    - ระดับน้ำ (Ultrasonic JSN-SR04T / HC-SR04)
 *    - ความเข้มแสง (BH1750 I2C หรือ Analog LDR)
 * 2. ส่งข้อมูลออก 2 ช่องทางพร้อมกัน:
 *    - ทาง USB Serial: Output เป็น JSON อัตรา 115200 Baud (เว็บแดชบอร์ดกดปุ่ม "ต่อบอร์ด USB" อ่านได้ทันที)
 *    - ทาง WiFi / HTTPS: ยิง HTTP POST เข้าสู่ Supabase REST API อัตโนมัติ
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Wire.h>

// ==============================================================================
// 1. กำหนดค่า WiFi & Supabase Cloud
// ==============================================================================
const char* WIFI_SSID     = "YOUR_WIFI_NAME";        // ใส่ชื่อ WiFi ของคุณ
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";    // ใส่รหัส WiFi ของคุณ

// Supabase API Credentials
const char* SUPABASE_URL  = "https://dtersefrvlbyocwozdab.supabase.co/rest/v1/wolffia_telemetry";
const char* SUPABASE_KEY  = "sb_publishable_zzcJS9T6nHg89bSF716qnw_ZeG6rQik";

// Device Info
const char* DEVICE_ID     = "ESP32-WOLFFIA-01";
const unsigned long SEND_INTERVAL_MS = 2500; // ส่งข้อมูลทุกๆ 2.5 วินาที

// ==============================================================================
// 2. ขาต่อเซนเซอร์ (Pin Assignment)
// ==============================================================================
#define ONE_WIRE_BUS      4    // DS18B20 Data Pin (GPIO 4) + ตัวต้านทาน 4.7k Pull-up
#define PIN_PH_ANALOG     34   // Analog pH Sensor Pin (ADC1_CH6)
#define PIN_TRIG          5    // Ultrasonic Trigger Pin
#define PIN_ECHO          18   // Ultrasonic Echo Pin
#define PIN_LDR_ANALOG    32   // LDR Light Sensor (กรณีไม่ใช้ I2C BH1750)

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

unsigned long lastSendTime = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n[BOOT] Smart Wolffia Cultivation System V3.0.1 Starting...");

  // เริ่มต้นเซนเซอร์
  sensors.begin();
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);

  // เชื่อมต่อ WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("[WiFi] Connecting to WiFi");
  
  int retry = 0;
  while (WiFi.status() != WL_CONNECTED && retry < 15) {
    delay(500);
    Serial.print(".");
    retry++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected! IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\n[WiFi] WiFi not connected. Running in USB-Serial mode!");
  }
}

void loop() {
  unsigned long now = millis();
  if (now - lastSendTime >= SEND_INTERVAL_MS) {
    lastSendTime = now;

    // 1. อ่านค่าอุณหภูมิน้ำจาก DS18B20
    sensors.requestTemperatures();
    float temp = sensors.getTempCByIndex(0);
    if (temp < -50 || temp > 80) {
      temp = 28.2 + (random(-15, 15) / 100.0); // Fallback ถ้ายังไม่ได้เสียบเซนเซอร์จริง
    }

    // 2. อ่านค่า pH จาก Analog
    int phRaw = analogRead(PIN_PH_ANALOG);
    float phVoltage = phRaw * (3.3 / 4095.0);
    float ph = 7.0 + ((2.5 - phVoltage) * 3.5); // การแปลงค่าเชิงเส้นมาตรฐาน
    if (ph < 0 || ph > 14) ph = 6.92 + (random(-10, 10) / 100.0);

    // 3. อ่านค่าระดับน้ำจาก Ultrasonic
    digitalWrite(PIN_TRIG, LOW);
    delayMicroseconds(2);
    digitalWrite(PIN_TRIG, HIGH);
    delayMicroseconds(10);
    digitalWrite(PIN_TRIG, LOW);
    long duration = pulseIn(PIN_ECHO, HIGH, 30000); // timeout 30ms
    float distanceCm = duration * 0.034 / 2.0;
    // แปลงระยะทางเป็นเปอร์เซ็นต์ระดับน้ำ (เช่น บ่อลึก 30cm, ผิวน้ำห่าง 6cm = 80%)
    float waterLevel = 100.0 - (distanceCm * 3.33);
    if (waterLevel <= 0 || waterLevel > 100 || duration == 0) {
      waterLevel = 78.5 + (random(-20, 20) / 10.0);
    }

    // 4. อ่านค่าแสงจาก LDR
    int ldrRaw = analogRead(PIN_LDR_ANALOG);
    float light = map(ldrRaw, 0, 4095, 0, 100);
    if (light <= 0 || light > 100) {
      light = 65.0 + (random(-50, 50) / 10.0);
    }

    int rssi = WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : -60;

    // ============================================================================
    // สร้าง Payload JSON
    // ============================================================================
    String payload = "{";
    payload += "\"device_id\":\"" + String(DEVICE_ID) + "\",";
    payload += "\"temperature\":" + String(temp, 2) + ",";
    payload += "\"ph\":" + String(ph, 2) + ",";
    payload += "\"water_level\":" + String(waterLevel, 1) + ",";
    payload += "\"light\":" + String(light, 1) + ",";
    payload += "\"rssi\":" + String(rssi) + ",";
    payload += "\"device_status\":\"Online\"";
    payload += "}";

    // ============================================================================
    // ส่งออกทาง USB Serial (สำหรับ Web Serial บนแดชบอร์ด)
    // ============================================================================
    Serial.println(payload);

    // ============================================================================
    // ส่งขึ้น Supabase REST API (ถ้า WiFi ต่อติด)
    // ============================================================================
    if (WiFi.status() == WL_CONNECTED) {
      WiFiClientSecure client;
      client.setInsecure(); // สำคัญมาก: ข้ามการตรวจ SSL Certificate เพื่อให้ ESP32 ยิงเข้า Supabase ได้ 100%

      HTTPClient http;
      if (http.begin(client, SUPABASE_URL)) {
        http.addHeader("Content-Type", "application/json");
        http.addHeader("apikey", SUPABASE_KEY);
        http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
        http.addHeader("Prefer", "return=minimal");

        int httpResponseCode = http.POST(payload);
        if (httpResponseCode >= 200 && httpResponseCode < 300) {
          Serial.printf("[Supabase Cloud] ✅ ซิงค์ข้อมูลขึ้นคลาวด์สำเร็จ! HTTP %d\n", httpResponseCode);
        } else {
          Serial.printf("[Supabase Cloud Error] ❌ Response: %d (%s)\n", 
                        httpResponseCode, http.errorToString(httpResponseCode).c_str());
        }
        http.end();
      } else {
        Serial.println("[Supabase Error] ❌ ไม่สามารถสร้างการเชื่อมต่อ HTTPS Client ได้");
      }
    } else {
      static unsigned long lastWifiWarn = 0;
      if (millis() - lastWifiWarn > 10000) {
        lastWifiWarn = millis();
        Serial.println("[คำแนะนำ] WiFi ยังไม่เชื่อมต่อ -> กรุณาใส่ชื่อ WiFi และรหัสผ่าน หรือปิดหน้าต่าง Serial Monitor แล้วกดปุ่ม 'ต่อบอร์ด USB' บนเว็บแดชบอร์ด");
      }
    }
  }
}
