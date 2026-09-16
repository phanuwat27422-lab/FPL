// api/badges.js
// GET /api/badges
// เหรียญตราสะสมของแต่ละทีม นับจำนวนครั้งจริง แสดงซ้ำตามจำนวน (ชนะ 3 ครั้ง = 🏆🏆🏆)
// คำนวณสดจาก weekly_results + gw_leader_snapshots ไม่มีตารางแยกเก็บ

import { getSupabase } from '../lib/supabase.js';

export default async function handler(req, res) {
  try {
    const supabase = getSupabase();

    const { data: weekly, error: wErr } = await supabase
      .from('weekly_results')
      .select('gameweek, entry_id, bonus_awarded');
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
      byGameweek[w.gameweek].push(w);
    }

    const counts = {}; // entryId -> { win, draw, steal }
    const ensure = (id) => {
      if (!counts[id]) counts[id] = { win: 0, draw: 0, steal: 0 };
      return counts[id];
    };

    for (const w of weekly) {
      if (w.bonus_awarded <= 0) continue;
      const c = ensure(w.entry_id);
      if (w.bonus_awarded === 150) c.win += 1;
      else c.draw += 1;
    }

    for (const [gwStr, rows] of Object.entries(byGameweek)) {
      const gameweek = Number(gwStr);
      const winners = rows.filter((r) => r.bonus_awarded > 0);
      if (winners.length !== 1) continue; // เสมอไม่นับเป็นปาดชนะ
      const winnerId = winners[0].entry_id;
      const snapshotIds = snapshotByGw[gameweek];
      if (!snapshotIds) continue;
      const wasSteal = snapshotIds.length !== 1 || snapshotIds[0] !== winnerId;
      if (wasSteal) ensure(winnerId).steal += 1;
    }

    const badgesByEntry = {};
    for (const [entryId, c] of Object.entries(counts)) {
      const list = [];
      if (c.win > 0) list.push({ emoji: '🏆', label: `ชนะ ${c.win} ครั้ง`, count: c.win });
      if (c.draw > 0) list.push({ emoji: '🤝', label: `เสมอ ${c.draw} ครั้ง`, count: c.draw });
      if (c.steal > 0) list.push({ emoji: '🔪', label: `ปาดชนะคนอื่นช่วงท้ายเกม ${c.steal} ครั้ง`, count: c.steal });
      badgesByEntry[entryId] = list;
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
    return res.status(200).json({ updatedAt: new Date().toISOString(), badgesByEntry });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load badges', detail: err.message });
  }
}
