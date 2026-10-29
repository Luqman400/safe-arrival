-- Paste into Supabase > SQL Editor > Run
create table classes (name text primary key);

create table students (
  id uuid primary key default gen_random_uuid(),
  admission_no text unique not null,
  full_name text not null,
  class text not null,
  parent_name text not null,
  phone text not null,                       -- e.g. +2547XXXXXXXX
  qr_id uuid unique not null default gen_random_uuid()
);

create table arrival_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students on delete cascade,
  arrival_date date not null,
  arrived_at timestamptz not null default now(),
  recorded_by uuid default auth.uid(),
  unique (student_id, arrival_date)          -- blocks duplicate scans
);

create table notification_logs (
  id uuid primary key default gen_random_uuid(),
  arrival_id uuid references arrival_records on delete cascade,
  to_phone text, body text,
  status text default 'mock',                -- becomes 'sent' / 'failed' when SMS is connected
  created_at timestamptz default now()
);

alter table classes enable row level security;
alter table students enable row level security;
alter table arrival_records enable row level security;
alter table notification_logs enable row level security;

-- Only signed-in staff can touch data. Anonymous visitors get nothing.
-- (Turn OFF public sign-ups in Authentication settings and create staff users yourself.)
-- We will tighten this into admin/staff roles later.
create policy "staff all" on classes for all to authenticated using (true) with check (true);
create policy "staff all" on students for all to authenticated using (true) with check (true);
create policy "staff all" on arrival_records for all to authenticated using (true) with check (true);
create policy "staff all" on notification_logs for all to authenticated using (true) with check (true);
