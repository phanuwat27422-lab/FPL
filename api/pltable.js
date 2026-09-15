// api/pltable.js
// GET /api/pltable
// คำนวณตารางคะแนนพรีเมียร์ลีกเองจากผลแมตช์จริงทุกนัด (bootstrap-static ไม่อัปเดตสถิติทีมให้ใช้ไม่ได้)

import { getBootstrap, getFixtures } from '../lib/fpl.js';

export default async function handler(req, res) {
  try {
    const [bootstrap, fixtures] = await Promise.all([getBootstrap(), getFixtures()]);

    const teamById = {};
    for (const t of bootstrap.teams || []) {
      teamById[t.id] = {
        teamId: t.id,
        name: t.name,
        played: 0,
        win: 0,
        draw: 0,
        loss: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        points: 0,
      };
    }

    for (const f of fixtures) {
      if (!f.finished) continue;
      const home = teamById[f.team_h];
      const away = teamById[f.team_a];
      if (!home || !away) continue;

      const hs = f.team_h_score;
      const as = f.team_a_score;

      home.played += 1;
      away.played += 1;
      home.goalsFor += hs;
      home.goalsAgainst += as;
      away.goalsFor += as;
      away.goalsAgainst += hs;

      if (hs > as) {
        home.win += 1;
        home.points += 3;
        away.loss += 1;
      } else if (hs < as) {
        away.win += 1;
        away.points += 3;
        home.loss += 1;
      } else {
        home.draw += 1;
        away.draw += 1;
        home.points += 1;
        away.points += 1;
      }
    }

    const table = Object.values(teamById)
      .map((t) => ({ ...t, goalDiff: t.goalsFor - t.goalsAgainst }))
      .sort((a, b) => b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor)
      .map((t, i) => ({ ...t, position: i + 1 }));

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    return res.status(200).json({ updatedAt: new Date().toISOString(), table });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load PL table', detail: err.message });
  }
}
