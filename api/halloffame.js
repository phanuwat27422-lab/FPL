// api/halloffame.js
// GET /api/halloffame
// สถิติเด่นของกลุ่มตลอดทั้งฤดูกาล คำนวณสดจากตารางที่มีอยู่แล้ว (weekly_results, gw_leader_snapshots)
// ไม่มีตารางแยกเก็บสถิติ เพราะข้อมูลน้อยพอที่จะคำนวณสดได้เร็วอยู่แล้ว

import { getSupabase } from '../lib/supabase.js';

// นับจากสัปดาห์ที่ยังไม่ backfill ด้วยมือ (GW1-3 ไม่มีคะแนนจริง)
const RELIABLE_POINTS_FROM_GAMEWEEK = 4;

function longestStreak(sortedRows) {
  let best = 0;
  let current = 0;
  let prevGw = null;
  for (const r of sortedRows) {
    if (r.won) {
      current = prevGw !== null && r.gameweek === prevGw + 1 ? current + 1 : 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
    prevGw = r.gameweek;
  }
  return best;
}

function joinNames(names) {
  return names.join(' และ ');
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
      .select('gameweek, entry_id, gw_points, bonus_awarded')
      .order('gameweek', { ascending: true });
    if (wErr) throw wErr;

    const { data: snapshots, error: sErr } = await supabase
      .from('gw_leader_snapshots')
      .select('gameweek, leader_entry_ids');
    if (sErr) throw sErr;
    const snapshotByGw = {};
    for (const s of snapshots) snapshotByGw[s.gameweek] = s.leader_entry_ids.split(',').map(Number);

    const cards = [];

    // 1) แชมป์บ่อยสุดตลอดกาล (แยกนับชนะเดี่ยว/เสมอให้ชัดเจน ไม่ปนกันเป็นเลขทศนิยม)
    const winsByEntry = {};
    for (const w of weekly) {
      if (w.bonus_awarded <= 0) continue;
      if (!winsByEntry[w.entry_id]) winsByEntry[w.entry_id] = { solo: 0, draw: 0 };
      if (w.bonus_awarded === 150) winsByEntry[w.entry_id].solo += 1;
      else winsByEntry[w.entry_id].draw += 1;
    }
    const topWins = Object.entries(winsByEntry).sort(
      (a, b) => b[1].solo + b[1].draw * 0.5 - (a[1].solo + a[1].draw * 0.5)
    )[0];
    if (topWins) {
      const [entryId, w] = topWins;
      const total = w.solo + w.draw * 0.5;
      if (total > 1) {
        const parts = [];
        if (w.solo > 0) parts.push(`ชนะเดี่ยว ${w.solo} ครั้ง`);
        if (w.draw > 0) parts.push(`เสมอ ${w.draw} ครั้ง`);
        cards.push({
          icon: '🏆',
          label: 'แชมป์บ่อยสุดตลอดกาล',
          value: `${nameOf[entryId] || `#${entryId}`} — ${parts.join(' และ ')}`,
        });
      }
    }

    // 2) สตรีคชนะยาวสุด
    const byEntryRows = {};
    for (const w of weekly) {
      if (!byEntryRows[w.entry_id]) byEntryRows[w.entry_id] = [];
      byEntryRows[w.entry_id].push({ gameweek: w.gameweek, won: w.bonus_awarded > 0 });
    }
    let bestStreak = { entryId: null, streak: 0 };
    for (const [entryId, rows] of Object.entries(byEntryRows)) {
      const streak = longestStreak(rows);
      if (streak > bestStreak.streak) bestStreak = { entryId, streak };
    }
    if (bestStreak.entryId && bestStreak.streak > 1) {
      cards.push({
        icon: '🔥',
        label: 'ชนะติดต่อกันบ่อยสุดตลอดกาล',
        value: `${nameOf[bestStreak.entryId]} — ชนะติดกัน ${bestStreak.streak} สัปดาห์`,
      });
    }

    // 3) & 5) คะแนน GW สูงสุด / ต่ำสุด (เฉพาะสัปดาห์ที่มีคะแนนจริง)
    const reliableRows = weekly.filter((w) => w.gameweek >= RELIABLE_POINTS_FROM_GAMEWEEK);
    if (reliableRows.length > 0) {
      const maxPoints = Math.max(...reliableRows.map((r) => r.gw_points));
      const maxRows = reliableRows.filter((r) => r.gw_points === maxPoints);
      const maxNames = [...new Set(maxRows.map((r) => nameOf[r.entry_id] || `#${r.entry_id}`))];
      cards.push({
        icon: '💯',
        label: 'คะแนน GW สูงสุด',
        value: `${joinNames(maxNames)} — ${maxPoints} แต้ม (GW${maxRows[0].gameweek})`,
      });

      const minPoints = Math.min(...reliableRows.map((r) => r.gw_points));
      const minRows = reliableRows.filter((r) => r.gw_points === minPoints);
      const minNames = [...new Set(minRows.map((r) => nameOf[r.entry_id] || `#${r.entry_id}`))];
      cards.push({
        icon: '📉',
        label: 'คะแนน GW ต่ำสุด',
        value: `${joinNames(minNames)} — ${minPoints} แต้ม (GW${minRows[0].gameweek})`,
      });
    }

    // 4) ปาดชนะบ่อยสุด
    const byGameweek = {};
    for (const w of weekly) {
      if (!byGameweek[w.gameweek]) byGameweek[w.gameweek] = [];
      byGameweek[w.gameweek].push(w);
    }
    const stealCounts = {};
    for (const [gwStr, rows] of Object.entries(byGameweek)) {
      const gameweek = Number(gwStr);
      const winners = rows.filter((r) => r.bonus_awarded > 0);
      if (winners.length !== 1) continue;
      const winner = winners[0];
      const snapshotIds = snapshotByGw[gameweek];
      if (!snapshotIds) continue;
      const isSteal = snapshotIds.length !== 1 || snapshotIds[0] !== winner.entry_id;
      if (isSteal) stealCounts[winner.entry_id] = (stealCounts[winner.entry_id] || 0) + 1;
    }
    const topSteal = Object.entries(stealCounts).sort((a, b) => b[1] - a[1])[0];
    if (topSteal) {
      const [entryId, count] = topSteal;
      cards.push({
        icon: '🔪',
        label: 'ปาดชนะบ่อยสุด',
        value: `${nameOf[entryId]} — พลิกล็อกช่วงท้ายเกม ${count} ครั้ง`,
      });
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
    return res.status(200).json({ updatedAt: new Date().toISOString(), cards });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load hall of fame', detail: err.message });
  }
}
