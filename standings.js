// api/standings.js
// GET /api/standings?league=477187
// คะแนนสดจาก FPL แสดงตลอด แต่ยังไม่ใช่ตัวตัดสินโบนัสจริง (ดู api/cron/lock-gameweek.js)

import { getLeagueStandings } from '../lib/fpl.js';

export default async function handler(req, res) {
  const leagueId = req.query.league || process.env.FPL_LEAGUE_ID || '477187';

  try {
    const data = await getLeagueStandings(leagueId);
    const results = (data.standings?.results || []).map((entry) => ({
      rank: entry.rank,
      teamName: entry.entry_name,
      managerName: entry.player_name,
      gwPoints: entry.event_total,
      totalPoints: entry.total,
      entryId: entry.entry,
    }));

    const maxGw = results.length ? Math.max(...results.map((r) => r.gwPoints)) : 0;
    const currentLeaders =
      maxGw > 0 ? results.filter((r) => r.gwPoints === maxGw).map((r) => ({ teamName: r.teamName, managerName: r.managerName, gwPoints: r.gwPoints })) : [];

    // cache 30 นาทีที่ edge ตามที่ต้องการ "อัปเดตทุก 30 นาที"
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');

    return res.status(200).json({
      leagueName: data.league?.name || null,
      updatedAt: new Date().toISOString(),
      results,
      currentLeaders,
      note: 'currentLeaders คือคนนำอยู่ตอนนี้แบบสด ยังไม่ใช่ผลล็อกโบนัสจริง',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch standings', detail: err.message });
  }
}
