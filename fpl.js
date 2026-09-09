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

// gameweek ล่าสุดที่ "จบสมบูรณ์" แล้ว (คะแนน bonus ถูก confirm แล้ว) และยังไม่เคยล็อกโบนัส
export function getLastFinishedEvent(bootstrap) {
  const finished = bootstrap.events.filter((e) => e.finished && e.data_checked);
  if (finished.length === 0) return null;
  return finished.sort((a, b) => b.id - a.id)[0];
}
