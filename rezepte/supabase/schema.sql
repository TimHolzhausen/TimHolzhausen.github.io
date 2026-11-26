-- =====================================================================================
-- Rezepte-App: Datenbank-Einrichtung
-- Im Supabase-Dashboard unter "SQL Editor" komplett einfügen und ausführen.
-- Mehrfaches Ausführen schadet nicht.
--
-- Prinzip: Jede Familie sieht nur ihre eigenen Daten. Mitglied wird man, indem man eine
-- Familie anlegt oder mit dem Einladungscode beitritt (beides über Funktionen unten).
-- =====================================================================================

create extension if not exists pgcrypto;

-- ---------- Familien und Mitglieder ----------
create table if not exists public.families (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(name) between 1 and 80),
  join_code  text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  -- Einstellungen: persons, vegetarians, pantry[], substitutions[], favorites[], dislikes[] …
  settings   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  family_id    uuid not null references public.families(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null default '' check (length(display_name) <= 40),
  joined_at    timestamptz not null default now(),
  primary key (family_id, user_id)
);
create index if not exists members_user_idx on public.members(user_id);

-- Ist der angemeldete Nutzer Mitglied dieser Familie? (security definer: umgeht die RLS von members)
create or replace function public.is_member(f uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where family_id = f and user_id = auth.uid());
$$;

-- ---------- Rezepte ----------
create table if not exists public.recipes (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families(id) on delete cascade,
  title        text not null check (length(title) between 1 and 160),
  servings     int  not null default 4 check (servings between 1 and 50),
  -- Zutaten: [{ "qty": 500, "unit": "g", "name": "Rinderhackfleisch", "cat": "Fleisch & Fisch" }, …]
  ingredients  jsonb not null default '[]'::jsonb,
  -- Schritte: ["Zwiebeln würfeln …", …]
  steps        jsonb not null default '[]'::jsonb,
  tags         text[] not null default '{}',
  for_plan     boolean not null default false,       -- für Wochenplan-Vorschläge nutzen
  vegetarian   boolean not null default false,
  prep_minutes int check (prep_minutes is null or prep_minutes between 0 and 1440),
  image_path   text,                                  -- Pfad im Speicher "rezeptbilder"
  source       text,                                  -- z. B. Buch, Webseite, Instagram
  notes        text,
  created_by   uuid default auth.uid() references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists recipes_family_idx on public.recipes(family_id);

-- ---------- Wochenpläne ----------
create table if not exists public.meal_plans (
  family_id  uuid not null references public.families(id) on delete cascade,
  week_start date not null,                           -- Montag der Woche
  -- Tage: [{ "date": "2026-11-30", "recipe_id": "…", "servings": 4, "locked": false, "note": "" }, …]
  days       jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (family_id, week_start)
);

-- ---------- Einkaufslisten (Grundlage für den Bring-Import) ----------
create table if not exists public.shopping_lists (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.families(id) on delete cascade,
  title      text not null default 'Einkaufsliste',
  -- Einträge: ["500 g Rinderhackfleisch", "2 Zwiebeln", …] (so, wie Bring sie lesen soll)
  items      jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists shopping_lists_family_idx on public.shopping_lists(family_id);

-- ---------- updated_at automatisch setzen ----------
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists recipes_touch on public.recipes;
create trigger recipes_touch before update on public.recipes for each row execute function public.touch_updated_at();
drop trigger if exists meal_plans_touch on public.meal_plans;
create trigger meal_plans_touch before update on public.meal_plans for each row execute function public.touch_updated_at();

-- ---------- Zugriffsregeln (Row Level Security) ----------
alter table public.families       enable row level security;
alter table public.members        enable row level security;
alter table public.recipes        enable row level security;
alter table public.meal_plans     enable row level security;
alter table public.shopping_lists enable row level security;

drop policy if exists fam_select on public.families;
drop policy if exists fam_update on public.families;
create policy fam_select on public.families for select to authenticated using (public.is_member(id));
create policy fam_update on public.families for update to authenticated using (public.is_member(id)) with check (public.is_member(id));

drop policy if exists mem_select on public.members;
drop policy if exists mem_update on public.members;
drop policy if exists mem_delete on public.members;
create policy mem_select on public.members for select to authenticated using (public.is_member(family_id));
create policy mem_update on public.members for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy mem_delete on public.members for delete to authenticated using (user_id = auth.uid());   -- Familie verlassen

drop policy if exists rec_all on public.recipes;
create policy rec_all on public.recipes for all to authenticated using (public.is_member(family_id)) with check (public.is_member(family_id));
drop policy if exists plan_all on public.meal_plans;
create policy plan_all on public.meal_plans for all to authenticated using (public.is_member(family_id)) with check (public.is_member(family_id));
drop policy if exists list_all on public.shopping_lists;
create policy list_all on public.shopping_lists for all to authenticated using (public.is_member(family_id)) with check (public.is_member(family_id));

-- Rechte: angemeldete Nutzer arbeiten über die Regeln oben, anonyme Besucher sehen nichts
revoke all on public.families, public.members, public.recipes, public.meal_plans, public.shopping_lists from anon;
grant select, update on public.families to authenticated;
grant select, update, delete on public.members to authenticated;
grant select, insert, update, delete on public.recipes, public.meal_plans, public.shopping_lists to authenticated;

-- ---------- Familie anlegen / beitreten ----------
create or replace function public.create_family(p_name text, p_display text)
returns public.families language plpgsql security definer set search_path = public as $$
declare f public.families;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  insert into public.families(name, settings)
    values (trim(p_name), jsonb_build_object('persons', 4, 'vegetarians', 0))
    returning * into f;
  insert into public.members(family_id, user_id, display_name) values (f.id, auth.uid(), coalesce(trim(p_display), ''));
  return f;
end $$;

create or replace function public.join_family(p_code text, p_display text)
returns public.families language plpgsql security definer set search_path = public as $$
declare f public.families;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  select * into f from public.families where join_code = upper(trim(p_code));
  if f.id is null then raise exception 'Einladungscode unbekannt'; end if;
  insert into public.members(family_id, user_id, display_name) values (f.id, auth.uid(), coalesce(trim(p_display), ''))
    on conflict (family_id, user_id) do update set display_name = excluded.display_name;
  return f;
end $$;

-- Neuen Einladungscode erzeugen (z. B. wenn der alte in falsche Hände geraten ist)
create or replace function public.new_join_code(p_family uuid)
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_member(p_family) then raise exception 'Kein Mitglied'; end if;
  c := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
  update public.families set join_code = c where id = p_family;
  return c;
end $$;

revoke all on function public.create_family(text, text), public.join_family(text, text), public.new_join_code(uuid), public.is_member(uuid) from public, anon;
grant execute on function public.create_family(text, text), public.join_family(text, text), public.new_join_code(uuid), public.is_member(uuid) to authenticated;

-- ---------- Speicher für Rezeptfotos (privat, Ordner = Familien-ID) ----------
insert into storage.buckets (id, name, public) values ('rezeptbilder', 'rezeptbilder', false)
  on conflict (id) do nothing;

drop policy if exists "rezeptbilder lesen" on storage.objects;
drop policy if exists "rezeptbilder schreiben" on storage.objects;
drop policy if exists "rezeptbilder aendern" on storage.objects;
drop policy if exists "rezeptbilder loeschen" on storage.objects;
create policy "rezeptbilder lesen" on storage.objects for select to authenticated
  using (bucket_id = 'rezeptbilder' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "rezeptbilder schreiben" on storage.objects for insert to authenticated
  with check (bucket_id = 'rezeptbilder' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "rezeptbilder aendern" on storage.objects for update to authenticated
  using (bucket_id = 'rezeptbilder' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "rezeptbilder loeschen" on storage.objects for delete to authenticated
  using (bucket_id = 'rezeptbilder' and public.is_member(((storage.foldername(name))[1])::uuid));
