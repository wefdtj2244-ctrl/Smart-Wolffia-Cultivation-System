#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <BH1750.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Preferences.h>
#include <math.h>
// =====================================================
// 1. WIFI & SUPABASE CONFIGURATION
// =====================================================
const char* WIFI_SSID = "Home 96_2.4G";
const char* WIFI_PASSWORD = "0844688342";
const char* SUPABASE_URL =
"https://dtersefrvlbyocwozdab.supabase.co";
// ใช้ Publishable key เท่านั้น
const char* SUPABASE_KEY = "sb_publishable_zzcJS9T6nHg89bSF716qnw_ZeG6rQik";
const char* SUPABASE_TABLE = "sensor_readings";
const char* DEVICE_ID = "ESP32-WOLFFIA-01";
// =====================================================
// 2. PIN CONFIGURATION
// =====================================================
const int PH_PIN = 34;
const int DS18B20_PIN = 4;
const int I2C_SDA_PIN = 21;
const int I2C_SCL_PIN = 22;
const int TRIG_PIN = 5;
const int ECHO_PIN = 18;
const int RELAY_PIN = 26;
const bool RELAY_ACTIVE_LOW = true;
// =====================================================
// 3. CALIBRATION & SAFETY
// =====================================================
// สูตร pH เริ่มต้นเท่านั้น ต้องสอบเทียบกับ buffer จริง
const float PH_NEUTRAL_VOLTAGE = 2.50f;
const float PH_VOLTS_PER_PH = 0.18f;
// ปรับตามระยะจริงของถัง
const float TANK_EMPTY_CM = 30.0f;
const float TANK_FULL_CM = 5.0f;
const float WATER_MIN_FOR_PUMP = 20.0f;
// AUTO: ปั๊มทำงาน 2 นาที พัก 3 นาที
const unsigned long PUMP_ON_MS = 120000UL;
const unsigned long PUMP_OFF_MS = 180000UL;
// รอบการทำงาน
const unsigned long SENSOR_INTERVAL_MS = 5000UL;
const unsigned long SUPABASE_INTERVAL_MS = 5000UL; // ซิงค์ส่งขึ้น Supabase ทุก 5 วินาที พร้อม Serial Monitor
const unsigned long WIFI_CONNECT_TIMEOUT_MS = 20000UL;
const unsigned long WIFI_RETRY_DELAY_MS = 5000UL;
// =====================================================
// 4. OBJECTS
// =====================================================
WebServer server(80);
BH1750 lightMeter;
OneWire oneWire(DS18B20_PIN);
DallasTemperature tempSensor(&oneWire);
Preferences preferences;
// =====================================================
// 5. GLOBAL VARIABLES
// =====================================================
float phValue = NAN;
float temperatureC = NAN;
float lightLux = NAN;
float waterDistanceCm = NAN;
float waterPercent = NAN;
bool tempSensorOK = false;
bool lightSensorOK = false;
bool waterSensorOK = false;
bool pumpOn = false;
bool emergencyStop = false;
bool autoMode = true;
bool wifiAttemptActive = false;
bool wifiWasConnected = false;
unsigned long wifiAttemptStarted = 0;
unsigned long wifiNextAttemptAt = 0;
unsigned long lastWiFiLog = 0;
unsigned long lastSensorRead = 0;
unsigned long lastSupabaseSend = 0;
unsigned long pumpStateChangedAt = 0;
// =====================================================
// 6. HELPER FUNCTIONS
// =====================================================
String jsonNumber(float value, int decimals = 2) {
if (!isfinite(value)) return "null";
return String(value, decimals);
}
String jsonBool(bool value) {
return value ? "true" : "false";
}
String currentSystemStatus() {
if (emergencyStop) return "EMERGENCY_STOP";
if (WiFi.status() != WL_CONNECTED) return "WIFI_DISCONNECTED";
if (!waterSensorOK) return "WATER_SENSOR_ERROR";
if (!tempSensorOK || !lightSensorOK) return "SENSOR_WARNING";
return "NORMAL";
}
bool pumpSafetyOK() {
return !emergencyStop &&
waterSensorOK &&
isfinite(waterPercent) &&
waterPercent > WATER_MIN_FOR_PUMP;
}
void setPump(bool on) {
if (on && !pumpSafetyOK()) {
on = false;
Serial.println("SAFETY: pump start rejected");
}
pumpOn = on;
if (RELAY_ACTIVE_LOW) {
digitalWrite(RELAY_PIN, on ? LOW : HIGH);
} else {
digitalWrite(RELAY_PIN, on ? HIGH : LOW);
}
pumpStateChangedAt = millis();
Serial.printf("Pump: %s\n", on ? "ON" : "OFF");
}
// =====================================================
// 7. WIFI MANAGEMENT
// =====================================================
void startWiFiAttempt() {
if (WiFi.status() == WL_CONNECTED || wifiAttemptActive) {
return;
}
if ((long)(millis() - wifiNextAttemptAt) < 0) {
return;
}
wifiAttemptActive = true;
wifiAttemptStarted = millis();
Serial.println("WiFi: connecting...");
WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}
void maintainWiFi() {
unsigned long now = millis();
if (WiFi.status() == WL_CONNECTED) {
wifiAttemptActive = false;
if (!wifiWasConnected) {
wifiWasConnected = true;
Serial.println("WiFi connected");
Serial.print("IP address: ");
Serial.println(WiFi.localIP());
Serial.print("Dashboard: http://");
Serial.println(WiFi.localIP());
}
return;
}
if (wifiWasConnected) {
wifiWasConnected = false;
Serial.println("WiFi disconnected");
}
if (now - lastWiFiLog >= 10000UL) {
lastWiFiLog = now;
Serial.printf("WiFi waiting, status=%d\n",
(int)WiFi.status());
}
if (wifiAttemptActive) {
if (now - wifiAttemptStarted < WIFI_CONNECT_TIMEOUT_MS) {
return;
}
WiFi.disconnect(false, false);
wifiAttemptActive = false;
wifiNextAttemptAt = now + WIFI_RETRY_DELAY_MS;
Serial.println("WiFi timeout; will retry");
return;
}
startWiFiAttempt();
}
// =====================================================
// 8. SENSOR READING
// =====================================================
float readPH() {
uint32_t totalMv = 0;
const int samples = 12;
for (int i = 0; i < samples; i++) {
totalMv += analogReadMilliVolts(PH_PIN);
delay(5);
}
float voltage = (totalMv / (float)samples) / 1000.0f;
// สูตรประมาณค่า ยังไม่ใช่ค่าที่สอบเทียบแล้ว
float result = 7.0f +
(PH_NEUTRAL_VOLTAGE - voltage) / PH_VOLTS_PER_PH;
if (!isfinite(result) ||
result < 0.0f ||
result > 14.0f) {
return NAN;
}
return result;
}
void readTemperature() {
tempSensor.requestTemperatures();
float t = tempSensor.getTempCByIndex(0);
if (t == DEVICE_DISCONNECTED_C ||
!isfinite(t) ||
t < -55.0f ||
t > 125.0f) {
temperatureC = NAN;
tempSensorOK = false;
} else {
temperatureC = t;
tempSensorOK = true;
}
}
void readLight() {
if (!lightSensorOK) {
lightLux = NAN;
return;
}
float lux = lightMeter.readLightLevel();
if (!isfinite(lux) || lux < 0.0f) {
lightLux = NAN;
lightSensorOK = false;
} else {
lightLux = lux;
}
}
void readWaterLevel() {
digitalWrite(TRIG_PIN, LOW);
delayMicroseconds(3);
digitalWrite(TRIG_PIN, HIGH);
delayMicroseconds(10);
digitalWrite(TRIG_PIN, LOW);
unsigned long duration = pulseIn(ECHO_PIN, HIGH, 30000UL);
if (duration == 0) {
waterDistanceCm = NAN;
waterPercent = NAN;
waterSensorOK = false;
return;
}
float distance = duration * 0.0343f / 2.0f;
if (!isfinite(distance) ||
distance < 1.0f ||
distance > TANK_EMPTY_CM + 5.0f ||
TANK_EMPTY_CM <= TANK_FULL_CM) {
waterDistanceCm = distance;
waterPercent = NAN;
waterSensorOK = false;
return;
}
waterDistanceCm = distance;
float pct =
(TANK_EMPTY_CM - distance) /
(TANK_EMPTY_CM - TANK_FULL_CM) * 100.0f;
waterPercent = constrain(pct, 0.0f, 100.0f);
waterSensorOK = true;
}
void readAllSensors() {
phValue = readPH();
readTemperature();
readLight();
readWaterLevel();
Serial.printf(
"SENSOR | pH=%.2f | Temp=%.2f C | Light=%.2f lux | Water=%.1f%%\n",
isfinite(phValue) ? phValue : -1.0f,
isfinite(temperatureC) ? temperatureC : -999.0f,
isfinite(lightLux) ? lightLux : -1.0f,
isfinite(waterPercent) ? waterPercent : -1.0f
);
if (!waterSensorOK) {
Serial.println("WARNING: water invalid; pump inhibited");
}
}
// =====================================================
// 9. PUMP AUTOMATION
// =====================================================
void updatePumpControl() {
if (!pumpSafetyOK()) {
if (pumpOn) setPump(false);
return;
}
if (!autoMode) return;
unsigned long elapsed = millis() - pumpStateChangedAt;
if (pumpOn && elapsed >= PUMP_ON_MS) {
setPump(false);
} else if (!pumpOn && elapsed >= PUMP_OFF_MS) {
setPump(true);
}
}
// =====================================================
// 10. SUPABASE REST API
// =====================================================
bool sendToSupabase() {
if (WiFi.status() != WL_CONNECTED) {
Serial.println("Supabase skipped: WiFi offline");
return false;
}
if (String(SUPABASE_KEY).length() < 10 ||
String(SUPABASE_KEY).indexOf("YOUR_") >= 0) {
Serial.println("Supabase ERROR: key not configured");
return false;
}
WiFiClientSecure client;
// สำหรับทดสอบเท่านั้น: ไม่ตรวจใบรับรอง TLS
// ก่อนใช้งานจริงควรตั้ง CA certificate
client.setInsecure();
HTTPClient http;
String endpoint = String(SUPABASE_URL) +
"/rest/v1/" + SUPABASE_TABLE;
if (!http.begin(client, endpoint)) {
Serial.println("Supabase: HTTP begin failed");
return false;
}
http.setConnectTimeout(10000);
http.setTimeout(10000);
http.addHeader("Content-Type", "application/json");
http.addHeader("apikey", SUPABASE_KEY);
http.addHeader("Authorization",
String("Bearer ") + SUPABASE_KEY);
http.addHeader("Prefer", "return=minimal");
String payload = "{";
payload += "\"device_id\":\"";
payload += DEVICE_ID;
payload += "\",";
payload += "\"ph\":";
payload += jsonNumber(phValue);
payload += ",";
payload += "\"temperature\":";
payload += jsonNumber(temperatureC);
payload += ",";
payload += "\"light\":";
payload += jsonNumber(lightLux);
payload += ",";
payload += "\"water_level\":";
payload += jsonNumber(waterPercent);
payload += ",";
payload += "\"pump_status\":";
payload += jsonBool(pumpOn);
payload += ",";
payload += "\"system_mode\":\"";
payload += autoMode ? "AUTO" : "MANUAL";
payload += "\",";
payload += "\"system_status\":\"";
payload += currentSystemStatus();
payload += "\"";
payload += "}";
int httpCode = http.POST(payload);
if (httpCode >= 200 && httpCode < 300) {
Serial.printf("Supabase INSERT OK: HTTP %d\n", httpCode);
http.end();
return true;
}
Serial.printf("Supabase INSERT ERROR: HTTP %d\n", httpCode);
if (httpCode > 0) {
Serial.println(http.getString());
}
http.end();
return false;
}
// =====================================================
// 11. DASHBOARD
// =====================================================
String dashboardHTML() {
String html = R"HTML(
<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SMART WOLFFIA FARM</title>
<style>
*{box-sizing:border-box}
body{font-family:Arial,sans-serif;background:#f1f7f2;color:#183d2a;margin:0;padding:18px}
main{max-width:900px;margin:auto}
h1{margin-bottom:5px}
.sub{color:#607567;margin-top:0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:12px}
.card{background:white;border-radius:14px;padding:16px;box-shadow:0 2px 8px #0001}
.label{font-size:14px;color:#607567}
.value{font-size:26px;font-weight:bold;margin-top:8px;overflow-wrap:anywhere}
button{border:0;border-radius:9px;padding:12px 15px;margin:4px;cursor:pointer;font-size:15px}
.green{background:#197647;color:white}
.gray{background:#dfe8e1;color:#183d2a}
.red{background:#b52c2c;color:white}
.status{padding:14px;background:white;border-radius:10px;margin:12px 0;line-height:1.8}
small{color:#607567}
</style>
</head>
<body>
<main>
<h1>SMART WOLFFIA FARM</h1>
<p class="sub">ระบบติดตามการเพาะเลี้ยงไข่ผำอัจฉริยะ</p>
<div class="status">
<div>Wi-Fi: <b id="wifi">กำลังตรวจสอบ</b></div>
<div>สถานะระบบ: <b id="status">กำลังโหลด</b></div>
<div>โหมด: <b id="mode">-</b></div>
<div>ปั๊มน้ำ: <b id="pump">-</b></div>
<div>Supabase: <b id="cloud">กำลังตรวจสอบ</b></div>
</div>
<div class="grid">
<div class="card"><div class="label">ค่า pH</div><div class="value" id="ph">-</div></div>
<div class="card"><div class="label">อุณหภูมิ</div><div class="value" id="temp">-</div></div>
<div class="card"><div class="label">ความเข้มแสง</div><div class="value" id="light">-</div></div>
<div class="card"><div class="label">ระดับน้ำ</div><div class="value" id="water">-</div></div>
</div>
<h3>ควบคุมระบบ</h3>
<button class="green" onclick="cmd('/mode/auto')">โหมด AUTO</button>
<button class="gray" onclick="cmd('/mode/manual')">โหมด MANUAL</button>
<button class="green" onclick="cmd('/pump/on')">เปิดปั๊ม</button>
<button class="gray" onclick="cmd('/pump/off')">ปิดปั๊ม</button>
<button class="red" onclick="cmd('/stop')">หยุดฉุกเฉิน</button>
<button class="gray" onclick="cmd('/reset')">ยกเลิกหยุดฉุกเฉิน</button>
<p><small>ข้อมูลเซนเซอร์อัปเดตทุก 5 วินาที ข้อมูลออนไลน์ส่งทุก 60 วินาที</small></p>
</main>
<script>
async function refresh(){
try{
const r=await fetch('/api',{cache:'no-store'});
const d=await r.json();
document.getElementById('wifi').textContent=
d.wifi?'เชื่อมต่อแล้ว ('+d.ip+')':'ยังไม่เชื่อมต่อ';
document.getElementById('status').textContent=d.status;
document.getElementById('mode').textContent=d.mode;
document.getElementById('pump').textContent=d.pump?'กำลังทำงาน':'ปิด';
document.getElementById('cloud').textContent=
d.wifi?'พร้อมส่งข้อมูลตามรอบ':'รอ Wi-Fi';
document.getElementById('ph').textContent=d.ph===null?'-':d.ph;
document.getElementById('temp').textContent=
d.temperature===null?'-':d.temperature+' °C';
document.getElementById('light').textContent=
d.light===null?'-':d.light+' lux';
document.getElementById('water').textContent=
d.water===null?'-':d.water+' %';
}catch(e){}
}
async function cmd(path){
try{
const r=await fetch(path,{method:'POST'});
const t=await r.text();
alert(t);
refresh();
}catch(e){
alert('ไม่สามารถส่งคำสั่งได้');
}
}
refresh();
setInterval(refresh,5000);
</script>
</body>
</html>
)HTML";
return html;
}
// =====================================================
// 12. WEB API
// =====================================================
void handleRoot() {
server.send(200, "text/html; charset=utf-8", dashboardHTML());
}
void handleAPI() {
String json = "{";
json += "\"wifi\":";
json += jsonBool(WiFi.status() == WL_CONNECTED);
json += ",\"ip\":\"";
json += WiFi.status() == WL_CONNECTED
? WiFi.localIP().toString() : "-";
json += "\",";
json += "\"ph\":" + jsonNumber(phValue) + ",";
json += "\"temperature\":" + jsonNumber(temperatureC) + ",";
json += "\"light\":" + jsonNumber(lightLux) + ",";
json += "\"water\":" + jsonNumber(waterPercent) + ",";
json += "\"pump\":" + jsonBool(pumpOn) + ",";
json += "\"mode\":\"";
json += autoMode ? "AUTO" : "MANUAL";
json += "\",";
json += "\"status\":\"" + currentSystemStatus() + "\"";
json += "}";
server.send(200, "application/json; charset=utf-8", json);
}
void handlePumpOn() {
if (!pumpSafetyOK()) {
server.send(409, "text/plain; charset=utf-8",
"ไม่สามารถเปิดปั๊มได้: ตรวจระดับน้ำ เซนเซอร์ และ Emergency Stop");
return;
}
autoMode = false;
setPump(true);
server.send(200, "text/plain; charset=utf-8",
"เปิดปั๊มแล้ว (MANUAL)");
}
void handlePumpOff() {
setPump(false);
server.send(200, "text/plain; charset=utf-8", "ปิดปั๊มแล้ว");
}
void handleAuto() {
autoMode = true;
server.send(200, "text/plain; charset=utf-8", "เปลี่ยนเป็น AUTO แล้ว");
}
void handleManual() {
autoMode = false;
server.send(200, "text/plain; charset=utf-8", "เปลี่ยนเป็น MANUAL แล้ว");
}
void handleEmergencyStop() {
emergencyStop = true;
preferences.putBool("estop", true);
setPump(false);
server.send(200, "text/plain; charset=utf-8",
"หยุดฉุกเฉินแล้ว ปั๊มถูกปิด");
}
void handleResetEmergency() {
emergencyStop = false;
preferences.putBool("estop", false);
server.send(200, "text/plain; charset=utf-8",
"ยกเลิกหยุดฉุกเฉินแล้ว");
}
void setupWebServer() {
server.on("/", HTTP_GET, handleRoot);
server.on("/api", HTTP_GET, handleAPI);
server.on("/pump/on", HTTP_POST, handlePumpOn);
server.on("/pump/off", HTTP_POST, handlePumpOff);
server.on("/mode/auto", HTTP_POST, handleAuto);
server.on("/mode/manual", HTTP_POST, handleManual);
server.on("/stop", HTTP_POST, handleEmergencyStop);
server.on("/reset", HTTP_POST, handleResetEmergency);
server.onNotFound([]() {
server.send(404, "text/plain; charset=utf-8", "Not found");
});
server.begin();
Serial.println("Web server started");
}
// =====================================================
// 13. SETUP
// =====================================================
void setup() {
Serial.begin(115200);
delay(500);
Serial.println();
Serial.println("================================");
Serial.println("SMART WOLFFIA FARM - V6");
Serial.println("ESP32 + LOCAL WEB + SUPABASE");
Serial.println("================================");
// ปิดรีเลย์ตั้งแต่เริ่มต้น
pinMode(RELAY_PIN, OUTPUT);
if (RELAY_ACTIVE_LOW) {
digitalWrite(RELAY_PIN, HIGH);
} else {
digitalWrite(RELAY_PIN, LOW);
}
pumpOn = false;
pumpStateChangedAt = millis();
pinMode(TRIG_PIN, OUTPUT);
digitalWrite(TRIG_PIN, LOW);
pinMode(ECHO_PIN, INPUT);
analogReadResolution(12);
analogSetPinAttenuation(PH_PIN, ADC_11db);
preferences.begin("wolffia", false);
emergencyStop = preferences.getBool("estop", false);
tempSensor.begin();
tempSensor.setWaitForConversion(true);
Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
lightSensorOK =
lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE);
Serial.printf("BH1750: %s\n",
lightSensorOK ? "ready" : "not detected");
WiFi.mode(WIFI_STA);
WiFi.setAutoReconnect(false);
WiFi.persistent(false);
wifiNextAttemptAt = 0;
startWiFiAttempt();
setupWebServer();
readAllSensors();
// รอช่วง OFF เต็มรอบก่อนเริ่ม AUTO
pumpStateChangedAt = millis();
lastSensorRead = millis();
lastSupabaseSend = millis();
Serial.println("Setup complete");
}
// =====================================================
// 14. MAIN LOOP
// =====================================================
void loop() {
maintainWiFi();
server.handleClient();
unsigned long now = millis();
if (now - lastSensorRead >= SENSOR_INTERVAL_MS) {
lastSensorRead = now;
readAllSensors();
}
// ตรวจความปลอดภัยของปั๊มตลอดรอบ
updatePumpControl();
if (now - lastSupabaseSend >= SUPABASE_INTERVAL_MS) {
lastSupabaseSend = now;
sendToSupabase();
}
delay(2);
}