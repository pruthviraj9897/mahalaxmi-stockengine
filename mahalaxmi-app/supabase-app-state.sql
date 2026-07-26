-- Run this in Supabase SQL Editor.
-- Creates one shared record that holds your entire app's data (parties, items,
-- challans, invoices, company settings) as a single JSON document.
-- Only people you've created a login for (Authentication -> Users) can read or write it.

create table if not exists app_state (
  id text primary key default 'default',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table app_state enable row level security;

create policy "authenticated can read app_state"
  on app_state for select
  to authenticated
  using (true);

create policy "authenticated can update app_state"
  on app_state for update
  to authenticated
  using (true);

create policy "authenticated can insert app_state"
  on app_state for insert
  to authenticated
  with check (true);

insert into app_state (id, data) values ('default', '{}'::jsonb)
on conflict (id) do nothing;
