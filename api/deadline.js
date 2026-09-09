// api/deadline.js
// GET /api/deadline
// คืนค่า deadline ของ gameweek ถัดไปที่ยังไม่ปิดรับเปลี่ยนตัว

import { getBootstrap } from '../lib/fpl.js';

export default async function handler(req, res) {
  try {
    const bootstrap = await getBootstrap();
    const now = Date.now();

    // หา gameweek ถัดไปที่ deadline ยังไม่ผ่าน
    const upcoming = bootstrap.events
      .filter((e) => new Date(e.deadline_time).getTime() > now)
      .sort((a, b) => new Date(a.deadline_time) - new Date(b.deadline_time))[0];

    if (!upcoming) {
      return res.status(200).json({ gameweek: null, deadline: null, message: 'ฤดูกาลจบแล้ว หรือไม่มี deadline ถัดไป' });
    }

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    return res.status(200).json({ gameweek: upcoming.id, deadline: upcoming.deadline_time });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load deadline', detail: err.message });
  }
}
