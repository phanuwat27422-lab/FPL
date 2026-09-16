// lib/fpl.js
// ฟังก์ชันช่วยเรียก FPL public API

const BASE = 'https://fantasy.premierleague.com/api';
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://fantasy.premierleague.com/',
};

// แคชผลไว้ในหน่วยความจำของ serverless function สัก 3 นาที
// กันการยิงขอข้อมูลนักเตะทั้งหมดซ้ำๆ ถี่ๆ ตอนมีคนกดดูหลายทีมติดกัน (ฟีเจอร์แตะดูทีม)
let bootstrapCache = null;
let bootstrapCacheTime = 0;
const BOOTSTRAP_CACHE_MS = 3 * 60 * 1000;

export async function getBootstrap() {
  const now = Date.now();
  if (bootstrapCache && now - bootstrapCacheTime < BOOTSTRAP_CACHE_MS) {
    return bootstrapCache;
  }
  const res = await fetch(`${BASE}/bootstrap-static/`, { headers: HEADERS });
  if (!res.ok) throw new Error(`bootstrap-static failed: ${res.status}`);
  const data = await res.json();
  bootstrapCache = data;
  bootstrapCacheTime = now;
  return data;
}

export async function getLeagueStandings(leagueId) {
  const res = await fetch(`${BASE}/leagues-classic/${leagueId}/standings/`, { headers: HEADERS });
  if (!res.ok) throw new Error(`league standings failed: ${res.status}`);
  return res.json();
}

// ผลการแข่งขันจริงทุกนัด (ใช้คำนวณตารางพรีเมียร์ลีกเอง เพราะ bootstrap-static ไม่อัปเดตสถิติทีมให้)
export async function getFixtures() {
  const res = await fetch(`${BASE}/fixtures/`, { headers: HEADERS });
  if (!res.ok) throw new Error(`fixtures failed: ${res.status}`);
  return res.json();
}

// ประวัติคะแนนรายสัปดาห์ของทีมนั้นๆ ย้อนหลังได้ทุก gameweek (ไม่ใช่แค่สัปดาห์ปัจจุบัน)
export async function getEntryHistory(entryId) {
  const res = await fetch(`${BASE}/entry/${entryId}/history/`, { headers: HEADERS });
  if (!res.ok) throw new Error(`entry history failed for ${entryId}: ${res.status}`);
  return res.json();
}

// gameweek ทั้งหมดที่ "จบสมบูรณ์" แล้ว (bonus point confirm แล้ว) เรียงจากเก่าไปใหม่
export function getFinishedEvents(bootstrap) {
  return bootstrap.events
    .filter((e) => e.finished && e.data_checked)
    .sort((a, b) => a.id - b.id);
}
