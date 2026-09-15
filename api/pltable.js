// api/pltable.js
// GET /api/pltable
// ตารางคะแนนพรีเมียร์ลีกจริง ดึงจาก field "teams" ใน bootstrap-static ของ FPL เอง
// ไม่ต้องเรียก API แยก ใช้ bootstrap ตัวเดียวกับที่ endpoint อื่นใช้อยู่แล้ว

import { getBootstrap } from '../lib/fpl.js';

export default async function handler(req, res) {
  try {
    const bootstrap = await getBootstrap();

    const table = (bootstrap.teams || [])
      .map((t) => ({
        position: t.position,
        name: t.name,
        shortName: t.short_name,
        played: t.played,
        win: t.win,
        draw: t.draw,
        loss: t.loss,
        points: t.points,
      }))
      .sort((a, b) => (a.position || 99) - (b.position || 99));

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    return res.status(200).json({ updatedAt: new Date().toISOString(), table });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load PL table', detail: err.message });
  }
}
