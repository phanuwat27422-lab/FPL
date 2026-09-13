// api/standings.js
// GET /api/standings?league=477187
// คะแนนสดจาก FPL แสดงตลอด แต่ยังไม่ใช่ตัวตัดสินโบนัสจริง (ดู api/cron/lock-gameweek.js)
// เช็คกับ database ด้วยว่า gameweek ปัจจุบัน (ตาม FPL) ถูกล็อกโบนัสไปแล้วหรือยัง
// กัน FPL ค้าง flag "current" ไว้ที่สัปดาห์เก่าช่วงพักบอล (international break ฯลฯ)

import { getLeagueStandings, getBootstrap } from '../lib/fpl.js';
import { getSupabase } from '../lib/supabase.js';

export default async function handler(req, res) {
  const leagueId = req.query.league || process.env.FPL_LEAGUE_ID || '477187';

  try {
    const [data, bootstrap] = await Promise.all([getLeagueStandings(leagueId), getBootstrap()]);

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

    const currentEvent = bootstrap.events.find((e) => e.is_current);
    let currentGameweekLocked = false;

    if (currentEvent) {
      try {
        const supabase = getSupabase();
        const { data: locked } = await supabase
          .from('processed_gameweeks')
          .select('gameweek')
          .eq('gameweek', currentEvent.id)
          .maybeSingle();
        currentGameweekLocked = !!locked;
      } catch (dbErr) {
        // ถ้าเช็ค database ไม่ได้ ให้ถือว่ายังไม่ล็อก (แสดงแบนเนอร์ตามปกติ) ไม่ทำให้ endpoint ทั้งตัวพัง
        currentGameweekLocked = false;
      }
    }

    // cache 2 นาทีที่ edge ให้คะแนนอัปเดตเร็วขึ้นระหว่างที่มีบอลแข่งอยู่
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');

    return res.status(200).json({
      leagueName: data.league?.name || null,
      updatedAt: new Date().toISOString(),
      results,
      currentLeaders,
      currentGameweek: currentEvent?.id || null,
      currentGameweekLocked,
      note: 'currentLeaders คือคนนำอยู่ตอนนี้แบบสด ยังไม่ใช่ผลล็อกโบนัสจริง (เว้นแต่ currentGameweekLocked เป็น true)',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch standings', detail: err.message });
  }
}
