// api/chart.js
// GET /api/chart
// รายได้สะสมรายสัปดาห์ของแต่ละทีม สำหรับวาดกราฟ (เฉพาะสัปดาห์ที่ล็อกแล้ว)
import { getSupabase } from '../lib/supabase.js';

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
      .order('gameweek', { ascending: true });
    if (wErr) throw wErr;

    const gameweeks = [...new Set(weekly.map((w) => w.gameweek))].sort((a, b) => a - b);
    const earned = {}; // entryId -> { gw: bonus }
    for (const w of weekly) {
      (earned[w.entry_id] ||= {})[w.gameweek] = w.bonus_awarded || 0;
    }

    const players = Object.keys(earned).map((id) => {
      let sum = 0;
      const cumulative = gameweeks.map((gw) => (sum += earned[id][gw] || 0));
      return { entryId: Number(id), name: nameOf[id] || `#${id}`, cumulative, total: sum };
    });
    players.sort((a, b) => b.total - a.total);

    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
    return res.status(200).json({ updatedAt: new Date().toISOString(), gameweeks, players });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load chart', detail: err.message });
  }
}
