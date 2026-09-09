# FPL League Scoreboard + แต้มพิเศษสะสม

เว็บดูคะแนน Fantasy Premier League ของลีกเพื่อนๆ พร้อมระบบแต้มพิเศษที่เล่นกันเอง
(ใครทำแต้ม gameweek สูงสุดได้ 150 แต้ม สะสมไว้ตัดสินของขวัญปลายปี) — ฟรีทั้งหมด ทุกคนเข้าดูได้ ไม่ต้อง login

## โครงสร้างโปรเจกต์

```
fpl-scoreboard/
├── api/
│   ├── standings.js          # คะแนนสดจาก FPL (public, cache 30 นาที)
│   ├── bonus.js               # ตารางแต้มพิเศษสะสม (public, อ่านจาก database)
│   └── cron/
│       └── lock-gameweek.js  # ล็อกโบนัสจริง (protected, เรียกจาก GitHub Actions เท่านั้น)
├── lib/
│   ├── fpl.js                 # helper เรียก FPL API
│   └── supabase.js            # helper เชื่อม database
├── db/
│   └── schema.sql              # โครงสร้างตาราง รันครั้งเดียวตอนตั้งค่า
├── public/
│   └── index.html              # หน้าเว็บ
├── .github/workflows/
│   └── lock-gameweek.yml      # cron ฟรีจาก GitHub Actions เช็คทุก 3 ชม.
└── vercel.json
```

## ทำไมต้องมี database (Supabase)

ระบบต้อง "จำ" ว่าสัปดาห์ไหนใครชนะไปแล้ว และสะสมแต้มไปเรื่อยๆ ตลอดฤดูกาล ซึ่ง FPL API เองไม่มีข้อมูลนี้ให้
เลยต้องเก็บเองในฐานข้อมูล — ใช้ **Supabase** (Postgres) เพราะมี free tier เพียงพอสำหรับกลุ่มเพื่อน และตั้งค่าง่าย

## ขั้นตอนติดตั้ง

### 1. สร้าง Supabase project (ฟรี)
1. สมัคร/ล็อกอินที่ [supabase.com](https://supabase.com) → New Project
2. เข้า **SQL Editor** → วางเนื้อหาจากไฟล์ `db/schema.sql` แล้วรัน (ครั้งเดียวจบ)
3. ไปที่ **Project Settings > API** เก็บค่า 2 อัน:
   - `Project URL` → ใช้เป็น `SUPABASE_URL`
   - `service_role` key (ไม่ใช่ anon key) → ใช้เป็น `SUPABASE_SERVICE_ROLE_KEY`

### 2. Deploy ขึ้น Vercel
1. push โฟลเดอร์นี้ขึ้น GitHub repo
2. ที่ [vercel.com](https://vercel.com) กด **Add New Project** เลือก repo นี้
3. ก่อนกด Deploy ไปที่ **Environment Variables** ใส่:
   | ชื่อ | ค่า |
   |---|---|
   | `SUPABASE_URL` | จากขั้นตอนที่ 1 |
   | `SUPABASE_SERVICE_ROLE_KEY` | จากขั้นตอนที่ 1 |
   | `CRON_SECRET` | สุ่มรหัสยาวๆ เอง (เช่น `openssl rand -hex 32`) |
   | `FPL_LEAGUE_ID` | `477187` หรือเลขลีกของพี่ |
4. กด **Deploy** จะได้ URL เช่น `your-project.vercel.app`

### 3. ตั้งค่า GitHub Actions ให้ล็อกโบนัสอัตโนมัติ (ฟรี)
> หมายเหตุ: Vercel Cron บน free plan (Hobby) จำกัดให้รันได้แค่วันละครั้ง ไม่พอกับที่เราต้องการเช็คบ่อยๆ
> เลยใช้ **GitHub Actions scheduled workflow** แทน ซึ่งฟรีและตั้ง schedule ถี่กว่าได้

1. ที่ GitHub repo → **Settings > Secrets and variables > Actions** เพิ่ม secret 2 ตัว:
   - `DEPLOYMENT_URL` = `https://your-project.vercel.app` (ไม่ต้องมี `/` ปิดท้าย)
   - `CRON_SECRET` = ค่าเดียวกับที่ตั้งใน Vercel
2. Workflow ใน `.github/workflows/lock-gameweek.yml` จะรันอัตโนมัติทุก 3 ชั่วโมง เช็คว่ามี gameweek ไหนจบสมบูรณ์แล้วบ้าง ถ้ามีจะล็อกแต้มพิเศษให้ทันที
3. ทดสอบได้ทันทีโดยไม่ต้องรอ schedule: ไปที่ tab **Actions** ในโปรเจกต์ → เลือก workflow นี้ → **Run workflow**

## วิธีทำงานของระบบแต้มพิเศษ

- หน้าเว็บโชว์ **คะแนนสด** อัปเดตทุก 30 นาที (มีแบนเนอร์บอกว่าใครนำอยู่ ณ ตอนนี้)
- แต้มพิเศษ **150 แต้ม** จะมอบให้จริงก็ต่อเมื่อ gameweek นั้น "จบสมบูรณ์" แล้วเท่านั้น (FPL confirm bonus point แล้ว ปกติ 2-3 วันหลังนัดสุดท้าย) กันกรณีคะแนนสดยังไม่นิ่งแล้วมอบผิดคน
- ถ้าเสมอกัน แบ่ง 150 แต้มเท่าๆ กัน (เช่น เสมอ 2 คน ได้คนละ 75)
- สมาชิกใหม่ที่เข้าลีกกลางฤดูกาลจะถูกเพิ่มเข้าระบบอัตโนมัติตอนรอบล็อกถัดไป
- เมื่อล็อกแล้ว **ระบบไม่มีการแก้ไขย้อนหลัง** ตามที่ตกลงกันไว้ ดังนั้นควรปล่อยให้ workflow รันเองอัตโนมัติ ไม่ต้องยิง endpoint มือเอง

## เปลี่ยนลีก

แก้เลข `LEAGUE_ID` ใน `public/index.html` และตัวแปร `FPL_LEAGUE_ID` ใน Vercel ให้ตรงกัน
เอาเลขจาก URL ลีก เช่น `https://fantasy.premierleague.com/leagues/<เลขนี้>/standings/c`

## ต่อ Domain ของตัวเอง (ถ้าต้องการ)

Vercel dashboard → Settings → Domains → พิมพ์ domain ที่ซื้อมา แล้วทำตามขั้นตอนตั้งค่า DNS
ถ้าไม่ซื้อ domain ก็ใช้ `your-project.vercel.app` ได้ฟรีเลย

## ความปลอดภัย

- `api/cron/lock-gameweek.js` เช็ค `CRON_SECRET` ทุกครั้ง ใครที่ไม่รู้ secret ยิง endpoint นี้ไม่ได้ กันไม่ให้มีคนมากดล็อกมั่วๆ
- `SUPABASE_SERVICE_ROLE_KEY` เก็บเป็น environment variable บน Vercel เท่านั้น ไม่เคยส่งไปฝั่ง frontend
- หน้าเว็บและ API สำหรับอ่านข้อมูล (`/api/standings`, `/api/bonus`) เปิดสาธารณะ ให้ทุกคนเข้าดูได้ตามต้องการ ไม่มีช่องทางเขียนข้อมูลจากฝั่ง client
