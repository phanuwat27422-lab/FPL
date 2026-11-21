// api/halloffame.js
// GET /api/halloffame
// สถิติเด่นของกลุ่มตลอดทั้งฤดูกาล คำนวณสดจากตารางที่มีอยู่แล้ว (weekly_results, gw_leader_snapshots)
// ไม่มีตารางแยกเก็บสถิติ เพราะข้อมูลน้อยพอที่จะคำนวณสดได้เร็วอยู่แล้ว

import { getSupabase } from '../lib/supabase.js';

// GW1-3 อัปเดตเป็นคะแนนจริงแล้ว นับรวมได้ทั้งหมดตั้งแต่ GW1
const RELIABLE_POINTS_FROM_GAMEWEEK = 1;

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

    // 1) แชมป์บ่อยสุดตลอดกาล (เช็คว่าชนะเดี่ยวหรือเสมอจากจำนวนผู้ชนะร่วมในสัปดาห์นั้น ไม่ใช่จำนวนเงิน)
    const winnerCountByGw = {};
    for (const w of weekly) {
      if (w.bonus_awarded > 0) winnerCountByGw[w.gameweek] = (winnerCountByGw[w.gameweek] || 0) + 1;
    }
    const winsByEntry = {};
    for (const w of weekly) {
      if (w.bonus_awarded <= 0) continue;
      if (!winsByEntry[w.entry_id]) winsByEntry[w.entry_id] = { solo: 0, draw: 0 };
      if (winnerCountByGw[w.gameweek] === 1) winsByEntry[w.entry_id].solo += 1;
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
        label: 'สตรีคชนะยาวสุด',
        value: `${nameOf[bestStreak.entryId]} — ชนะติดกัน ${bestStreak.streak} สัปดาห์`,
      });
    }

    // 3) & 5) คะแนน GW สูงสุด / ต่ำสุด (เฉพาะสัปดาห์ที่มีคะแนนจริง)
    const reliableRows = weekly.filter((w) => w.gameweek >= RELIABLE_POINTS_FROM_GAMEWEEK);
    if (reliableRows.length > 0) {
      const maxPoints = Math.max(...reliableRows.map((r) => r.gw_points));
      const maxRows = reliableRows.filter((r) => r.gw_points === maxPoints);
      const maxParts = maxRows.map((r) => `${nameOf[r.entry_id] || `#${r.entry_id}`} (GW${r.gameweek})`);
      cards.push({
        icon: '💯',
        label: 'คะแนนสูงสุดตลอดกาล',
        value: `${joinNames(maxParts)} — ${maxPoints} แต้ม`,
      });

      const minPoints = Math.min(...reliableRows.map((r) => r.gw_points));
      const minRows = reliableRows.filter((r) => r.gw_points === minPoints);
      const minParts = minRows.map((r) => `${nameOf[r.entry_id] || `#${r.entry_id}`} (GW${r.gameweek})`);
      cards.push({
        icon: '📉',
        label: 'คะแนนต่ำสุดตลอดกาล',
        value: `${joinNames(minParts)} — ${minPoints} แต้ม`,
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


    // ===== ห้องถ้วยรางวัล (awards) =====
    const people = {};
    for (const w of weekly) {
      const p = (people[w.entry_id] ||= { entryId: w.entry_id, name: nameOf[w.entry_id] || `#${w.entry_id}`, points: 0, weeks: 0, best: 0, bestGw: null, bonus: 0 });
      p.points += w.gw_points;
      p.weeks += 1;
      p.bonus += w.bonus_awarded;
      if (w.gw_points > p.best) { p.best = w.gw_points; p.bestGw = w.gameweek; }
    }
    const list = Object.values(people).map((p) => ({
      ...p,
      avg: p.weeks ? p.points / p.weeks : 0,
      solo: (winsByEntry[p.entryId] || {}).solo || 0,
      draw: (winsByEntry[p.entryId] || {}).draw || 0,
    }));
    const byBonus = [...list].sort((a, b) => b.bonus - a.bonus || b.points - a.points);
    const rankOfBonus = {};
    byBonus.forEach((p, i) => { rankOfBonus[p.entryId] = i + 1; });
    const fmt = (n) => Math.round(n).toLocaleString('en-US');
    const make = (key, icon, title, sub, p, desc, extra) =>
      p && {
        key, icon, title, sub, desc, name: p.name,
        rank: rankOfBonus[p.entryId],
        stats: [
          { label: 'รายได้สะสม', value: fmt(p.bonus) },
          { label: 'คะแนนรวม', value: fmt(p.points) },
          { label: 'GW สูงสุด', value: `${p.best}${p.bestGw ? ` (GW${p.bestGw})` : ''}` },
          { label: 'เฉลี่ย/สัปดาห์', value: p.avg.toFixed(1) },
        ],
        extra: extra || `ชนะเดี่ยว ${p.solo} ครั้ง · เสมอ ${p.draw} ครั้ง`,
      };
    const awards = [];
    if (list.length > 0) {
      const golden = [...list].sort((a, b) => b.points - a.points)[0];
      const champion = byBonus[0];
      const runner = byBonus[1];
      const spoon = [...list].sort((a, b) => a.avg - b.avg)[0];
      const mots = [...list].sort((a, b) => b.best - a.best || b.points - a.points)[0];
      awards.push(
        make('golden', '🏆', 'GOLDEN MANAGER', 'TOP POINTS', golden, 'ผู้จัดการที่ทำคะแนน FPL รวมสูงที่สุดในลีกตอนนี้'),
        make('runner', '🥈', 'RUNNER-UP', '2ND PLACE', runner, 'อันดับ 2 ของรายได้สะสม ตามหลังแชมป์อยู่ไม่ไกล'),
        make('champion', '🏆', 'LEAGUE CHAMPION', 'MOST EARNINGS', champion, 'ผู้นำรายได้สะสมสูงสุดของลีกตอนนี้ ใครจะแซงได้ต้องมาลุ้นกันต่อ'),
        make('spoon', '🥄', 'WOODEN SPOON', 'LOWEST AVERAGE', spoon, 'คะแนนเฉลี่ยต่อสัปดาห์ต่ำที่สุดในลีก (สู้ต่อไปนะ)'),
        make('mots', '🛡️', 'BEST WEEK', 'HIGHEST SINGLE GW', mots, 'ทำคะแนนในหนึ่งสัปดาห์สูงที่สุดในลีก')
      );
    }

    const gwWinners = Object.entries(byGameweek)
      .map(([gw, rows]) => ({
        gameweek: Number(gw),
        names: rows.filter((r) => r.bonus_awarded > 0).map((r) => nameOf[r.entry_id] || `#${r.entry_id}`),
        points: Math.max(...rows.map((r) => r.gw_points)),
      }))
      .filter((g) => g.names.length > 0)
      .sort((a, b) => b.gameweek - a.gameweek);

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
    return res.status(200).json({ updatedAt: new Date().toISOString(), awards: awards.filter(Boolean), gwWinners, cards });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load hall of fame', detail: err.message });
  }
}
