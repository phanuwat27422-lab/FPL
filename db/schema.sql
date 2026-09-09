-- รันไฟล์นี้ใน Supabase SQL Editor ครั้งเดียวตอนตั้งโปรเจกต์

create table if not exists managers (
  entry_id bigint primary key,
  team_name text not null,
  manager_name text not null,
  joined_gameweek int not null,
  active boolean not null default true
);

create table if not exists weekly_results (
  id bigserial primary key,
  gameweek int not null,
  entry_id bigint not null references managers(entry_id),
  gw_points int not null,
  is_winner boolean not null default false,
  bonus_awarded int not null default 0,
  locked_at timestamptz not null default now(),
  unique (gameweek, entry_id)
);

create table if not exists processed_gameweeks (
  gameweek int primary key,
  locked_at timestamptz not null default now()
);

-- เปิด Row Level Security แล้วอนุญาตให้ "อ่านอย่างเดียว" แบบ public
-- การเขียน/แก้ไข ทำผ่าน service role key จาก serverless function เท่านั้น (ฝั่ง client แตะไม่ถึง)
alter table managers enable row level security;
alter table weekly_results enable row level security;
alter table processed_gameweeks enable row level security;

create policy "public read managers" on managers for select using (true);
create policy "public read weekly_results" on weekly_results for select using (true);
