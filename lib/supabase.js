// lib/supabase.js
// สร้าง Supabase client ฝั่ง server เท่านั้น ใช้ service role key
// (ห้ามเอาไฟล์นี้หรือ key นี้ไปยุ่งกับฝั่ง frontend เด็ดขาด)

import { createClient } from '@supabase/supabase-js';

let client;

export function getSupabase() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
    }
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}
