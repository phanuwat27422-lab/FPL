// api/badges.js
// GET /api/badges
// เหรียญตราสะสมของแต่ละทีม คำนวณสดจาก weekly_results + gw_leader_snapshots
// ไม่มีตารางแยกเก็บ badge เพราะข้อมูลต้นทางมีพอคำนวณสดได้เร็วอยู่แล้ว

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

    const flags = {}; // entryId -> { hasWin, hasDraw, hasSteal, wasStolenFrom }
    const ensure = (id) => {
      if (!flags[id]) flags[id] = { hasWin: false, hasDraw: false, hasSteal: false, wasStolenFrom: false };
      return flags[id];
    };

    for (const w of weekly) {
      if (w.bonus_awarded <= 0) continue;
      const f = ensure(w.entry_id);
      if (w.bonus_awarded === 150) f.hasWin = true;
      else f.hasDraw = true;
    }

    for (const [gwStr, rows] of Object.entries(byGameweek)) {
      const gameweek = Number(gwStr);
      const winners = rows.filter((r) => r.bonus_awarded > 0);
      const snapshotIds = snapshotByGw[gameweek];
      if (!snapshotIds) continue;

      if (winners.length === 1) {
        const winnerId = winners[0].entry_id;
        const wasSteal = snapshotIds.length !== 1 || snapshotIds[0] !== winnerId;
        if (wasSteal) {
          ensure(winnerId).hasSteal = true;
          for (const id of snapshotIds) {
            if (id !== winnerId) ensure(id).wasStolenFrom = true;
          }
        }
      } else if (winners.length > 1) {
        const winnerIds = new Set(winners.map((w) => w.entry_id));
        for (const id of snapshotIds) {
          if (!winnerIds.has(id)) ensure(id).wasStolenFrom = true;
        }
      }
    }

    const badgesByEntry = {};
    for (const [entryId, f] of Object.entries(flags)) {
      const list = [];
      if (f.hasWin) list.push({ emoji: '🏆', label: 'เคยชนะเดี่ยวอย่างน้อย 1 ครั้ง' });
      if (f.hasDraw) list.push({ emoji: '🤝', label: 'เคยเสมอกับคนอื่นมาก่อน' });
      if (f.hasSteal) list.push({ emoji: '🔪', label: 'เคยปาดชนะคนอื่นช่วงท้ายเกม' });
      if (f.wasStolenFrom) list.push({ emoji: '😭', label: 'เคยโดนปาดชนะช่วงท้ายเกม' });
      badgesByEntry[entryId] = list;
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
    return res.status(200).json({ updatedAt: new Date().toISOString(), badgesByEntry });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load badges', detail: err.message });
  }
}
