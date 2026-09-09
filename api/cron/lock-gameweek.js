// api/cron/lock-gameweek.js
// เรียกโดย GitHub Actions (scheduled) เท่านั้น ไม่ใช่ endpoint สาธารณะ
// ป้องกันด้วย CRON_SECRET ผ่าน Authorization header
// รันครั้งเดียวจะไล่ล็อกทุก gameweek ที่จบแล้วแต่ยังไม่เคยล็อก (รองรับ backfill ย้อนหลัง)

import { getSupabase } from '../../lib/supabase.js';
import { getBootstrap, getLeagueStandings, getEntryHistory, getFinishedEvents } from '../../lib/fpl.js';

const BONUS_POOL = 150;

export default async function handler(req, res) {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const leagueId = process.env.FPL_LEAGUE_ID || '477187';
  const supabase = getSupabase();

  try {
    const bootstrap = await getBootstrap();
    const finishedEvents = getFinishedEvents(bootstrap);

    if (finishedEvents.length === 0) {
      return res.status(200).json({ message: 'ยังไม่มี gameweek ไหนจบสมบูรณ์เลย' });
    }

    const { data: processedRows } = await supabase.from('processed_gameweeks').select('gameweek');
    const processedSet = new Set((processedRows || []).map((r) => r.gameweek));
    const pending = finishedEvents.filter((e) => !processedSet.has(e.id));

    if (pending.length === 0) {
      return res.status(200).json({ message: 'ล็อกครบทุก gameweek ที่จบแล้วอยู่แล้ว', skipped: true });
    }

    const standings = await getLeagueStandings(leagueId);
    const entries = standings.standings?.results || [];

    if (entries.length === 0) {
      return res.status(200).json({ message: 'ไม่พบข้อมูลลีก ข้ามรอบนี้' });
    }

    // เพิ่มสมาชิกใหม่อัตโนมัติ + sync ชื่อทีมล่าสุด
    for (const entry of entries) {
      const { data: existing } = await supabase
        .from('managers')
        .select('entry_id')
        .eq('entry_id', entry.entry)
        .maybeSingle();

      if (!existing) {
        await supabase.from('managers').insert({
          entry_id: entry.entry,
          team_name: entry.entry_name,
          manager_name: entry.player_name,
          joined_gameweek: pending[0].id,
          active: true,
        });
      } else {
        await supabase
          .from('managers')
          .update({ team_name: entry.entry_name, manager_name: entry.player_name })
          .eq('entry_id', entry.entry);
      }
    }

    // ดึงประวัติคะแนนรายสัปดาห์ของทุกทีมครั้งเดียว ใช้ได้ทั้งล็อกปกติและ backfill ย้อนหลัง
    const historyByEntry = {};
    for (const entry of entries) {
      const history = await getEntryHistory(entry.entry);
      historyByEntry[entry.entry] = history.current || [];
    }

    const summary = [];

    // ล็อกเรียงจาก gameweek เก่าไปใหม่ ทีละสัปดาห์
    for (const event of pending) {
      const rows = entries.map((entry) => {
        const gwData = historyByEntry[entry.entry].find((h) => h.event === event.id);
        return { entry: entry.entry, entryName: entry.entry_name, points: gwData ? gwData.points : 0 };
      });

      const maxPoints = Math.max(...rows.map((r) => r.points));
      const winners = rows.filter((r) => r.points === maxPoints);
      const bonusEach = Math.floor(BONUS_POOL / winners.length);
      const winnerIds = new Set(winners.map((w) => w.entry));

      const dbRows = rows.map((r) => ({
        gameweek: event.id,
        entry_id: r.entry,
        gw_points: r.points,
        is_winner: winnerIds.has(r.entry),
        bonus_awarded: winnerIds.has(r.entry) ? bonusEach : 0,
      }));

      const { error: insertErr } = await supabase.from('weekly_results').insert(dbRows);
      if (insertErr) throw insertErr;

      const { error: lockErr } = await supabase.from('processed_gameweeks').insert({ gameweek: event.id });
      if (lockErr) throw lockErr;

      summary.push({
        gameweek: event.id,
        winners: winners.map((w) => ({ teamName: w.entryName, points: w.points, bonus: bonusEach })),
      });
    }

    return res.status(200).json({ message: `ล็อกสำเร็จ ${summary.length} gameweek`, results: summary });
  } catch (err) {
    return res.status(500).json({ error: 'Lock gameweek failed', detail: err.message });
  }
}
