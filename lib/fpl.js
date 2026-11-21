// lib/fpl.js
// ฟังก์ชันช่วยเรียก FPL public API

import { getSupabase } from './supabase.js';

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
let lastDbSave = 0;
const BOOTSTRAP_CACHE_MS = 3 * 60 * 1000;
const DB_SAVE_EVERY_MS = 10 * 60 * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// FPL บางครั้งตอบ 403 ให้ IP ของ cloud ชั่วคราว จึงลองซ้ำก่อน แล้วค่อยใช้ข้อมูลสำรอง
async function fetchBootstrapLive() {
  let lastStatus = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${BASE}/bootstrap-static/`, { headers: HEADERS });
    if (res.ok) return res.json();
    lastStatus = res.status;
    await sleep(400 * (attempt + 1));
  }
  throw new Error(`bootstrap-static failed: ${lastStatus}`);
}

// เก็บเฉพาะส่วนที่เว็บใช้จริง (วันปิดรับ/สถานะ GW, ชื่อนักเตะ, ชื่อทีม) เพื่อให้เล็กพอเก็บสำรองใน Supabase
function trimBootstrap(data) {
  return {
    events: data.events,
    teams: (data.teams || []).map((t) => ({ id: t.id, short_name: t.short_name })),
    elements: (data.elements || []).map((e) => ({ id: e.id, web_name: e.web_name, element_type: e.element_type, team: e.team })),
  };
}

async function saveBootstrapBackup(data) {
  if (Date.now() - lastDbSave < DB_SAVE_EVERY_MS) return;
  try {
    const { error } = await getSupabase()
      .from('fpl_cache')
      .upsert({ key: 'bootstrap', data: trimBootstrap(data), updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (!error) lastDbSave = Date.now();
  } catch {
    // ตารางสำรองยังไม่ได้สร้าง หรือเขียนไม่ได้ ก็ข้ามไป ไม่กระทบการทำงานหลัก
  }
}

async function loadBootstrapBackup() {
  try {
    const { data, error } = await getSupabase().from('fpl_cache').select('data').eq('key', 'bootstrap').maybeSingle();
    if (error || !data) return null;
    return data.data;
  } catch {
    return null;
  }
}

export async function getBootstrap() {
  const now = Date.now();
  if (bootstrapCache && now - bootstrapCacheTime < BOOTSTRAP_CACHE_MS) {
    return bootstrapCache;
  }
  try {
    const data = await fetchBootstrapLive();
    bootstrapCache = data;
    bootstrapCacheTime = now;
    await saveBootstrapBackup(data);
    return data;
  } catch (err) {
    // ดึงสดไม่ได้: ใช้ข้อมูลเก่าในหน่วยความจำก่อน แล้วค่อยใช้ชุดสำรองใน Supabase
    if (bootstrapCache) return bootstrapCache;
    const backup = await loadBootstrapBackup();
    if (backup) {
      bootstrapCache = backup;
      bootstrapCacheTime = now - BOOTSTRAP_CACHE_MS + 30 * 1000; // ลองดึงสดใหม่ใน 30 วินาที
      return backup;
    }
    throw err;
  }
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
