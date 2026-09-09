// api/cron/lock-gameweek.js
// เรียกโดย GitHub Actions (scheduled) เท่านั้น ไม่ใช่ endpoint สาธารณะ
// ป้องกันด้วย CRON_SECRET ผ่าน Authorization header

import { getSupabase } from '../../lib/supabase.js';
import { getBootstrap, getLeagueStandings, getLastFinishedEvent } from '../../lib/fpl.js';

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
    const target = getLastFinishedEvent(bootstrap);

    if (!target) {
      return res.status(200).json({ message: 'ยังไม่มี gameweek ไหนจบสมบูรณ์พร้อมล็อก' });
    }

    const { data: already } = await supabase
      .from('processed_gameweeks')
      .select('gameweek')
      .eq('gameweek', target.id)
      .maybeSingle();

    if (already) {
      return res.status(200).json({ message: `GW ${target.id} ถูกล็อกไปแล้ว`, skipped: true });
    }

    const standings = await getLeagueStandings(leagueId);
    const results = standings.standings?.results || [];

    if (results.length === 0) {
      return res.status(200).json({ message: 'ไม่พบข้อมูลลีก ข้ามรอบนี้' });
    }

    // เพิ่มสมาชิกใหม่อัตโนมัติ + sync ชื่อทีมล่าสุด
    for (const entry of results) {
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
          joined_gameweek: target.id,
          active: true,
        });
      } else {
        await supabase
          .from('managers')
          .update({ team_name: entry.entry_name, manager_name: entry.player_name })
          .eq('entry_id', entry.entry);
      }
    }

    const maxPoints = Math.max(...results.map((e) => e.event_total));
    const winners = results.filter((e) => e.event_total === maxPoints);
    const bonusEach = Math.floor(BONUS_POOL / winners.length);
    const winnerIds = new Set(winners.map((w) => w.entry));

    const rows = results.map((entry) => ({
      gameweek: target.id,
      entry_id: entry.entry,
      gw_points: entry.event_total,
      is_winner: winnerIds.has(entry.entry),
      bonus_awarded: winnerIds.has(entry.entry) ? bonusEach : 0,
    }));

    const { error: insertErr } = await supabase.from('weekly_results').insert(rows);
    if (insertErr) throw insertErr;

    const { error: lockErr } = await supabase.from('processed_gameweeks').insert({ gameweek: target.id });
    if (lockErr) throw lockErr;

    return res.status(200).json({
      message: `ล็อก GW ${target.id} สำเร็จ`,
      winners: winners.map((w) => ({ teamName: w.entry_name, points: w.event_total, bonus: bonusEach })),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Lock gameweek failed', detail: err.message });
  }
}
