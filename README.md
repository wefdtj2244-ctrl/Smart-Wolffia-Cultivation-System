# 🌿 ระบบเพาะเลี้ยงไข่ผำอัจฉริยะ V3.0.1 (Smart Wolffia Cultivation System)

ระบบ IoT Dashboard สำหรับติดตามและควบคุมสภาพแวดล้อมการเพาะเลี้ยงผำ (Wolffia globosa / Watermeal) แบบ Real-time ผ่านเทคโนโลยีคลาวด์ **Supabase** และโฮสต์ขึ้นอินเทอร์เน็ตด้วย **Vercel** ผ่าน **GitHub**

---

## 🚀 สถาปัตยกรรมระบบ (System Architecture)

```
[ ESP32 IoT Sensors ] 
  ├── DS18B20 (อุณหภูมิน้ำ)
  ├── Analog pH Sensor (กรด-ด่าง)
  ├── Ultrasonic Level (ระดับน้ำ)
  └── BH1750 / LDR (ความเข้มแสง)
           │
           ▼ (HTTPS REST / WebSocket)
[ Supabase Cloud (PostgreSQL + Realtime Engine) ]
           │
           ▼ (WebSocket wss:// Realtime Sync)
[ Vercel CDN (Web Dashboard V3.0.1) ] ──▶ [ จอแสดงผลผู้ใช้ / มือถือ / แท็บเล็ต ]
```

- **Frontend**: Vanilla HTML5, Modern CSS3, JavaScript ES6+, Chart.js (Zero build step, deploy ได้ทันที 100%)
- **Backend / Database**: Supabase PostgreSQL + Supabase Realtime WebSocket API
- **Deployment & Hosting**: GitHub Repository + Vercel Static Web Hosting
- **Edge Devices**: ESP32 Microcontroller with WiFi

---

## 🗄️ ขั้นตอนที่ 1: ตั้งค่าฐานข้อมูล Supabase

1. สมัครหรือเข้าสู่ระบบที่ [Supabase](https://supabase.com)
2. สร้างโปรเจกต์ใหม่ (New Project)
3. ไปที่เมนู **SQL Editor** ทางแถบซ้าย
4. เปิดไฟล์ [`supabase_schema.sql`](supabase_schema.sql) ในโปรเจกต์นี้ คัดลอกโค้ดทั้งหมดไปวางใน SQL Editor แล้วกดปุ่ม **RUN**
5. ตรวจสอบว่าตาราง `wolffia_telemetry` ถูกสร้างและเปิด Realtime เรียบร้อย
6. ไปที่ **Project Settings** > **API** เพื่อคัดลอก:
   - **Project URL** (เช่น `https://xyzcompany.supabase.co`)
   - **anon public API Key** (เช่น `eyJhbGciOi...`)

---

## 🐙 ขั้นตอนที่ 2: นำโค้ดขึ้น GitHub

1. เปิด Terminal / PowerShell ที่โฟลเดอร์นี้
2. สร้าง Git Repository และ Commit โค้ด:
   ```bash
   git init
   git add .
   git commit -m "feat: smart wolffia v3.0.1 with supabase realtime and vercel config"
   ```
3. สร้าง Repository ใหม่บน [GitHub](https://github.com/new) (เช่นชื่อ `smart-wolffia-v3`)
4. เชื่อมต่อและ Push โค้ดขึ้น GitHub:
   ```bash
   git branch -M main
   git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/smart-wolffia-v3.git
   git push -u origin main
   ```

---

## ⚡ ขั้นตอนที่ 3: Deploy ขึ้น Vercel (1-Click Hosting)

1. เข้าสู่ระบบ [Vercel](https://vercel.com) ด้วยบัญชี GitHub
2. กดปุ่ม **Add New...** > **Project**
3. เลือก Repository `smart-wolffia-v3` ที่เพิ่ง Push ขึ้นไป แล้วกด **Import**
4. ในส่วน **Build & Output Settings**:
   - ปล่อยเป็นค่าเริ่มต้น (Framework Preset: Other) เนื่องจากเป็น Static Web App พร้อมใช้งานทันที
5. กดปุ่ม **Deploy**
6. ภายใน 10-15 วินาที ระบบจะ Deploy สำเร็จและได้รับ URL สำหรับใช้งานจริง (เช่น `https://smart-wolffia-v3.vercel.app`)

---

## 🔗 ขั้นตอนที่ 4: เชื่อมต่อ Web Dashboard เข้ากับ Supabase

1. เปิดเว็บไซต์บน Vercel หรือในเบราว์เซอร์
2. ไปที่หน้า Dashboard (`/dashboard.html`)
3. เลือกเมนู **Settings (ตั้งค่าระบบ)** ทางแถบซ้าย
4. เลื่อนลงมาที่กล่อง **Supabase Cloud Connection**:
   - กรอก **Project URL**
   - กรอก **Anon Public Key**
   - ใส่ชื่อตาราง `wolffia_telemetry`
5. กดปุ่ม **บันทึกการตั้งค่า** และ **ทดสอบการเชื่อมต่อ (Test Connection)**
6. เมื่อขึ้นสถานะ **Connected (สีเขียว)** ข้อมูลจากเซนเซอร์จริงใน Supabase จะอัปเดตแบบสดๆ (Live Sync) ทันที!

---

## 📡 ขั้นตอนที่ 5: รูปแบบข้อมูลที่ ESP32 ส่งเข้า Supabase (REST API)

ESP32 สามารถส่งค่าขึ้น Supabase ได้โดยตรงผ่าน HTTP POST:

**Endpoint:**
```
POST https://dtersefrvlbyocwozdab.supabase.co/rest/v1/wolffia_telemetry
```

**Headers:**
```
apikey: sb_publishable_zzcJS9T6nHg89bSF716qnw_ZeG6rQik
Authorization: Bearer sb_publishable_zzcJS9T6nHg89bSF716qnw_ZeG6rQik
Content-Type: application/json
Prefer: return=minimal
```

**Payload (JSON):**
```json
{
  "device_id": "ESP32-WOLFFIA-01",
  "temperature": 27.5,
  "ph": 6.85,
  "water_level": 82.0,
  "light": 480.0,
  "rssi": -58,
  "device_status": "Online"
}
```

---

## 📁 โครงสร้างโปรเจกต์ (Project Structure)

```
.
├── index.html           # หน้าแรกของระบบ (Landing & Portal)
├── dashboard.html       # IoT Dashboard หลัก (รองรับ 10 มุมมองเซนเซอร์)
├── login.html           # หน้า Login ระบบหลังบ้านพนักงาน
├── app.js               # ตัวควบคุม View, Navigation, Chart.js Visualizer
├── data-engine.js       # Central Engine, Physics Simulator & Supabase Realtime Client
├── db-config.js         # การตั้งค่า Supabase Connection
├── styles.css           # สไตล์ชีตระบบ Tailwind-compatible Dark/Light Theme
├── vercel.json          # ไฟล์คอนฟิก Vercel Routing & Clean URLs
├── supabase_schema.sql  # สคริปต์ SQL สำหรับสร้างตารางและ RLS บน Supabase
├── .gitignore           # กำหนดไฟล์ที่ไม่ต้อง push ขึ้น Git
└── README.md            # คู่มือการใช้งานระบบฉบับสมบูรณ์
```
