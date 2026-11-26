-- =====================================================================================
-- Rezepte-App, Zusatz 2: Einkaufsliste für den Bring-Import herausgeben
-- Im SQL-Editor einfügen und ausführen (nach schema.sql). Mehrfaches Ausführen schadet nicht.
--
-- Bring ruft die Listenseite ohne Anmeldung ab. Diese Funktion gibt deshalb genau eine Liste
-- heraus – nur wer ihre zufällige ID (UUID) kennt, bekommt sie, und nur Titel und Einträge.
-- =====================================================================================
create or replace function public.bring_list(p_id uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('title', title, 'items', items)
    from public.shopping_lists where id = p_id;
$$;
revoke all on function public.bring_list(uuid) from public;
grant execute on function public.bring_list(uuid) to anon, authenticated;
