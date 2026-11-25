-- Supabase-Einrichtung für den Partner-Fragebogen.
-- Im Supabase-Dashboard unter "SQL Editor" ausführen. Mehrfaches Ausführen schadet nicht.
-- Auf dem Server liegen nur verschlüsselte Antwortcodes (PF1.…).

create table if not exists public.antworten (
  id bigint generated always as identity primary key,
  code text not null check (code like 'PF1.%' and length(code) < 20000),
  created_at timestamptz not null default now()
);

-- Löschmerkmal: nur der SHA-256-Hash liegt hier, das Merkmal selbst steckt im verschlüsselten Code
alter table public.antworten add column if not exists del_hash text check (del_hash is null or length(del_hash) = 64);

alter table public.antworten enable row level security;

drop policy if exists "anlegen" on public.antworten;
drop policy if exists "lesen" on public.antworten;
create policy "anlegen" on public.antworten for insert to anon with check (true);
create policy "lesen"   on public.antworten for select to anon using (true);

-- Rechte: nur lesen und anlegen. Ändern und Löschen direkt ist nicht erlaubt.
revoke all on public.antworten from anon;
grant select, insert on public.antworten to anon;

-- Löschen nur mit dem passenden Löschmerkmal (kennt nur, wer den Code entschlüsseln kann)
create or replace function public.antwort_loeschen(p_id bigint, p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  delete from public.antworten
   where id = p_id
     and del_hash is not null
     and del_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  get diagnostics n = row_count;
  return n > 0;
end
$$;
revoke all on function public.antwort_loeschen(bigint, text) from public;
grant execute on function public.antwort_loeschen(bigint, text) to anon;
