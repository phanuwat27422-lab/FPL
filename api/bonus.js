// api/bonus.js
// GET /api/bonus
// ตารางโบนัสสะสม (ล็อกแล้วเท่านั้น) อ่านจาก database ไม่ยุ่งกับ FPL API โดยตรง

import { getSupabase } from '../lib/supabase.js';

const BONUS_POOL = 150; // เต็ม 1 ชนะ = ได้ครบ 150; เสมอ 2 คนได้คนละ 75 = นับเป็น 0.5 ชนะ

export default async function handler(req, res) {
  try {
    const supabase = getSupabase();

    const { data: managers, error: mErr } = await supabase
      .from('managers')
      .select('entry_id, team_name, manager_name, joined_gameweek, active');
    if (mErr) throw mErr;

    const { data: weekly, error: wErr } = await supabase
      .from('weekly_results')
      .select('gameweek, entry_id, gw_points, is_winner, bonus_awarded')
      .order('gameweek', { ascending: true });
    if (wErr) throw wErr;

    const byEntry = {};
    for (const m of managers) {
      byEntry[m.entry_id] = {
        entryId: m.entry_id,
        teamName: m.team_name,
        managerName: m.manager_name,
        totalBonus: 0,
        winsCount: 0,
        wins: [],
      };
    }

    for (const w of weekly) {
      const bucket = byEntry[w.entry_id];
      if (!bucket) continue;
      bucket.totalBonus += w.bonus_awarded;
      if (w.bonus_awarded > 0) {
        bucket.winsCount += w.bonus_awarded / BONUS_POOL;
        bucket.wins.push({ gameweek: w.gameweek, gwPoints: w.gw_points, bonus: w.bonus_awarded });
      }
    }

    for (const bucket of Object.values(byEntry)) {
      bucket.winsCount = Math.round(bucket.winsCount * 100) / 100;
    }

    const leaderboard = Object.values(byEntry).sort((a, b) => b.totalBonus - a.totalBonus);

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
    return res.status(200).json({ updatedAt: new Date().toISOString(), leaderboard });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load bonus table', detail: err.message });
  }
}
