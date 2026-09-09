// lib/fpl.js
// ฟังก์ชันช่วยเรียก FPL public API

const BASE = 'https://fantasy.premierleague.com/api';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; FPL-Scoreboard/1.0)' };

export async function getBootstrap() {
  const res = await fetch(`${BASE}/bootstrap-static/`, { headers: HEADERS });
  if (!res.ok) throw new Error(`bootstrap-static failed: ${res.status}`);
  return res.json();
}

export async function getLeagueStandings(leagueId) {
  const res = await fetch(`${BASE}/leagues-classic/${leagueId}/standings/`, { headers: HEADERS });
  if (!res.ok) throw new Error(`league standings failed: ${res.status}`);
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
