// api/bonus.js
// GET /api/bonus
// ตารางโบนัสสะสม: ยอดจริงที่ล็อกแล้ว (permanent) + แต้มคาดการณ์สดของสัปดาห์ที่ยังไม่จบ (liveBonus)
// liveBonus ไม่เคยถูกบันทึกลง database เป็นแค่ตัวเลขคาดการณ์ให้ดูสนุกระหว่างสัปดาห์เท่านั้น

import { getSupabase } from '../lib/supabase.js';
import { getBootstrap, getLeagueStandings } from '../lib/fpl.js';

const BONUS_POOL = 150;

export default async function handler(req, res) {
  const leagueId = process.env.FPL_LEAGUE_ID || '477187';

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
        liveBonus: 0,
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

    // เพิ่มแต้มคาดการณ์สดของ gameweek ปัจจุบัน (ถ้ายังไม่ถูกล็อกจริง)
    let currentGameweekLocked = true;
    try {
      const [bootstrap, standings] = await Promise.all([getBootstrap(), getLeagueStandings(leagueId)]);
      const currentEvent = bootstrap.events.find((e) => e.is_current);

      if (currentEvent) {
        const { data: locked } = await supabase
          .from('processed_gameweeks')
          .select('gameweek')
          .eq('gameweek', currentEvent.id)
          .maybeSingle();
        currentGameweekLocked = !!locked;

        if (!currentGameweekLocked) {
          const entries = standings.standings?.results || [];
          const maxPoints = entries.length ? Math.max(...entries.map((e) => e.event_total)) : 0;

          if (maxPoints > 0) {
            const liveWinners = entries.filter((e) => e.event_total === maxPoints);
            const liveBonusEach = Math.floor(BONUS_POOL / liveWinners.length);

            for (const w of liveWinners) {
              if (byEntry[w.entry]) {
                byEntry[w.entry].liveBonus = liveBonusEach;
              }
            }
          }
        }
      }
    } catch (liveErr) {
      // ถ้าดึงคะแนนสดไม่ได้ ให้ตกลงเหลือแค่ยอดที่ล็อกแล้วจริง ไม่ทำให้ endpoint พังทั้งตัว
    }

    for (const bucket of Object.values(byEntry)) {
      bucket.winsCount = Math.round(bucket.winsCount * 100) / 100;
      bucket.displayTotal = bucket.totalBonus + bucket.liveBonus;
    }

    // ทีมที่ชนะ gameweek ล่าสุดที่ล็อกไปแล้ว (ไม่ใช่ live) ให้ติดป้าย WIN
    const lockedGameweeks = weekly.map((w) => w.gameweek);
    const latestLockedGameweek = lockedGameweeks.length ? Math.max(...lockedGameweeks) : null;

    for (const bucket of Object.values(byEntry)) {
      bucket.recentWin =
        latestLockedGameweek !== null && bucket.wins.some((w) => w.gameweek === latestLockedGameweek);
    }

    const leaderboard = Object.values(byEntry).sort((a, b) => b.displayTotal - a.displayTotal);

    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
    return res.status(200).json({
      updatedAt: new Date().toISOString(),
      currentGameweekLocked,
      leaderboard,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load bonus table', detail: err.message });
  }
}
