// api/feed.js
// GET /api/feed
// สร้างข้อความไฮไลท์กวนๆ ของแต่ละสัปดาห์ (เสมอกัน / ปาดชนะ / ชนะเรียบๆ)

import { getSupabase } from '../lib/supabase.js';

const STEAL_MESSAGES = [
  '😱 {loser} นำมาทั้งสัปดาห์ดันพลาดท้ายเกม โดน {winner} ปาดหน้าเอาแต้มไปซะงั้น เจ็บจี๊ดเลย',
  '🔪 {winner} แทงข้างหลัง {loser} ตอนใกล้จบเกม! อุตส่าห์นำมาทั้งอาทิตย์ สุดท้ายมือเปล่ากลับบ้าน',
  '💀 ดราม่าประจำสัปดาห์: {loser} นำอยู่ดีๆ โดน {winner} แซงหน้าตัดเส้นชัย ร้องไห้มุมห้องได้เลย',
  '⚡ หักมุมจบสัปดาห์! {loser} ชะล่าใจ {winner} ฉกแต้มไปต่อหน้าต่อตา',
];

const TIE_MESSAGES = [
  '🤝 {teams} เสมอกันเป๊ะ ไม่มีใครยอมใคร เลยต้องแบ่งกันคนละครึ่งไปแบบสันติภาพ',
  '😐 คะแนนเท่ากันจนไม่รู้จะเถียงกันไปทำไม {teams} แบ่งแต้มกันไปนะจ๊ะ',
  '🫱 {teams} จับมือกันเสมอ ไม่มีใครได้เปรียบ แบ่งกันคนละครึ่ง',
];

const NORMAL_MESSAGES = [
  '🏆 {winner} กวาดแต้มพิเศษไปเต็มๆ ไม่มีใครแตะต้องได้',
  '👑 {winner} ครองบัลลังก์สัปดาห์นี้ไปแบบไม่มีคู่แข่ง',
  '🔥 {winner} ฟอร์มร้อนแรง เก็บแต้มพิเศษไปแบบสบายๆ',
];

function pick(list, seed) {
  return list[((seed % list.length) + list.length) % list.length];
}

function fillTemplate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] || '');
}

export default async function handler(req, res) {
  try {
    const supabase = getSupabase();

    const { data: managers, error: mErr } = await supabase.from('managers').select('entry_id, team_name');
    if (mErr) throw mErr;
    const nameOf = {};
    for (const m of managers) nameOf[m.entry_id] = m.team_name;

    const { data: weekly, error: wErr } = await supabase
      .from('weekly_results')
      .select('gameweek, entry_id, bonus_awarded')
      .gt('bonus_awarded', 0);
    if (wErr) throw wErr;

    const { data: snapshots, error: sErr } = await supabase
      .from('gw_leader_snapshots')
      .select('gameweek, leader_entry_ids');
    if (sErr) throw sErr;

    const snapshotByGw = {};
    for (const s of snapshots) snapshotByGw[s.gameweek] = s.leader_entry_ids.split(',').map(Number);

    const byGameweek = {};
    for (const w of weekly) {
      if (!byGameweek[w.gameweek]) byGameweek[w.gameweek] = [];
      byGameweek[w.gameweek].push(w.entry_id);
    }

    const feed = Object.entries(byGameweek)
      .map(([gwStr, winnerIds]) => {
        const gameweek = Number(gwStr);
        const winnerNames = winnerIds.map((id) => nameOf[id] || `#${id}`);

        if (winnerIds.length > 1) {
          const message = fillTemplate(pick(TIE_MESSAGES, gameweek), { teams: winnerNames.join(' และ ') });
          return { gameweek, type: 'tie', winners: winnerNames, message };
        }

        const snapshotIds = snapshotByGw[gameweek];
        const winnerId = winnerIds[0];
        const isSteal = snapshotIds && (snapshotIds.length !== 1 || snapshotIds[0] !== winnerId);

        if (isSteal) {
          const loserNames = snapshotIds.map((id) => nameOf[id] || `#${id}`).join(' และ ');
          const message = fillTemplate(pick(STEAL_MESSAGES, gameweek), {
            winner: winnerNames[0],
            loser: loserNames,
          });
          return { gameweek, type: 'steal', winners: winnerNames, formerLeaders: loserNames, message };
        }

        const message = fillTemplate(pick(NORMAL_MESSAGES, gameweek), { winner: winnerNames[0] });
        return { gameweek, type: 'normal', winners: winnerNames, message };
      })
      .sort((a, b) => b.gameweek - a.gameweek);

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
    return res.status(200).json({ updatedAt: new Date().toISOString(), feed });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load feed', detail: err.message });
  }
}
