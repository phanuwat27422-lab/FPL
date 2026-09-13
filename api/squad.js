// api/squad.js
// GET /api/squad?entry={entryId}&event={gameweekId}
// ดึงรายชื่อผู้เล่นที่ทีมนั้นจัดไว้ในสัปดาห์ที่ระบุ (ตัวจริง/ตัวสำรอง/กัปตัน)

import { getBootstrap } from '../lib/fpl.js';

const POSITIONS = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://fantasy.premierleague.com/',
};

export default async function handler(req, res) {
  const entryId = req.query.entry;
  const eventId = req.query.event;

  if (!entryId || !eventId) {
    return res.status(400).json({ error: 'ต้องระบุ entry และ event' });
  }

  try {
    const [picksRes, bootstrap] = await Promise.all([
      fetch(`https://fantasy.premierleague.com/api/entry/${entryId}/event/${eventId}/picks/`, { headers: HEADERS }),
      getBootstrap(),
    ]);

    if (!picksRes.ok) throw new Error(`picks failed: ${picksRes.status}`);
    const picksData = await picksRes.json();

    const elementById = {};
    for (const el of bootstrap.elements) elementById[el.id] = el;
    const teamById = {};
    for (const t of bootstrap.teams) teamById[t.id] = t.short_name;

    const squad = picksData.picks.map((p) => {
      const el = elementById[p.element];
      const points = el ? el.event_points : 0;
      return {
        name: el ? el.web_name : `#${p.element}`,
        team: el ? teamById[el.team] : '',
        position: el ? POSITIONS[el.element_type] : '',
        isCaptain: p.is_captain,
        isViceCaptain: p.is_vice_captain,
        starting: p.position <= 11,
        points,
        multiplier: p.multiplier,
        total: points * p.multiplier,
      };
    });

    const starting = squad.filter((s) => s.starting);
    const bench = squad.filter((s) => !s.starting);

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
    return res.status(200).json({
      activeChip: picksData.active_chip || null,
      starting,
      bench,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load squad', detail: err.message });
  }
}
