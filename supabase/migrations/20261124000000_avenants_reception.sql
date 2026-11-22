-- Avenants, prix nouveaux, réception et réserves, base de calcul des pénalités.

alter table public.marches
  -- Base des pénalités : montant initial ou modifié par avenants, TTC ou HT
  add column penalite_base text not null default 'initial_ttc'
    check (penalite_base in ('initial_ttc', 'actuel_ttc', 'initial_ht', 'actuel_ht')),
  -- Seuil d'alerte sur le cumul des avenants (% du montant initial), à reprendre du CPS / CCAG
  add column seuil_avenants numeric(5, 2),
  -- Réception
  add column delai_garantie_mois numeric(5, 2),
  add column date_reception_definitive date;

-- ---------------------------------------------------------------------------
-- Avenants
-- ---------------------------------------------------------------------------
create table public.avenants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  marche_id uuid not null references public.marches (id) on delete cascade,
  numero text not null default '',
  date date,
  objet text not null default '',
  montant_ttc numeric(16, 2) not null default 0,       -- variation (+ ou −) du montant du marché
  jours_supplementaires integer not null default 0,     -- variation du délai
  observations text not null default '',
  scan_path text,
  created_at timestamptz not null default now()
);
create index avenants_marche_idx on public.avenants (marche_id);

-- Prix nouveaux : ligne de BPDE introduite par un avenant
alter table public.bpde_lignes
  add column avenant_id uuid references public.avenants (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Réserves
-- ---------------------------------------------------------------------------
create table public.reserves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  marche_id uuid not null references public.marches (id) on delete cascade,
  numero text not null default '',
  designation text not null,
  localisation text not null default '',
  responsable text not null default 'Entreprise',
  date_constat date,
  echeance date,
  statut text not null default 'Ouverte' check (statut in ('Ouverte', 'Levée')),
  date_levee date,
  observations text not null default '',
  scan_path text,
  created_at timestamptz not null default now()
);
create index reserves_marche_idx on public.reserves (marche_id);

do $$
declare t text;
begin
  foreach t in array array['avenants', 'reserves'] loop
    execute format('create trigger %I_proprietaire before insert or update on public.%I
                    for each row execute function public.verifier_proprietaire_marche()', t, t);
    execute format('create trigger %I_activite after insert or update or delete on public.%I
                    for each row execute function public.journaliser_activite()', t, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s_select_proprietaire" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t, t);
    execute format('create policy "%s_insert_proprietaire" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t, t);
    execute format('create policy "%s_update_proprietaire" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t, t);
    execute format('create policy "%s_delete_proprietaire" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t, t);
  end loop;
end $$;

-- Un prix nouveau doit être rattaché à un avenant du même marché
create or replace function public.verifier_avenant_bpde()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.avenant_id is not null and not exists (
    select 1 from public.avenants a where a.id = new.avenant_id and a.marche_id = new.marche_id and a.user_id = new.user_id
  ) then
    raise exception 'Avenant introuvable pour ce marché';
  end if;
  return new;
end $$;
create trigger bpde_lignes_avenant before insert or update on public.bpde_lignes
  for each row execute function public.verifier_avenant_bpde();

-- Journal d'activité : libellés des nouvelles tables
create or replace function public.journaliser_activite()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  libelle text;
  quoi text;
  action text;
  ligne record;
begin
  if tg_op = 'DELETE' then ligne := old; else ligne := new; end if;

  if not exists (select 1 from public.marches where id = ligne.marche_id) then
    return null;
  end if;

  libelle := case tg_table_name
    when 'intervenants' then 'Intervenant'
    when 'ordres_service' then 'Ordre de service'
    when 'pv_reunions' then 'PV de réunion'
    when 'attachements' then 'Attachement'
    when 'documents' then 'Document'
    when 'decomptes' then 'Décompte'
    when 'garanties' then 'Garantie'
    when 'avenants' then 'Avenant'
    when 'reserves' then 'Réserve'
    else tg_table_name end;

  quoi := case tg_table_name
    when 'intervenants' then coalesce(nullif(to_jsonb(ligne) ->> 'nom', ''), to_jsonb(ligne) ->> 'role')
    when 'documents' then to_jsonb(ligne) ->> 'nom'
    when 'garanties' then to_jsonb(ligne) ->> 'type'
    when 'reserves' then coalesce(nullif(to_jsonb(ligne) ->> 'numero', ''), to_jsonb(ligne) ->> 'designation')
    else to_jsonb(ligne) ->> 'numero'
  end;

  action := case
    when tg_table_name = 'reserves' and tg_op = 'UPDATE' and (to_jsonb(old) ->> 'statut') <> (to_jsonb(new) ->> 'statut')
      then lower(to_jsonb(new) ->> 'statut')
    when tg_op = 'INSERT' then 'ajouté'
    when tg_op = 'UPDATE' then 'modifié'
    else 'supprimé' end;

  insert into public.activites (user_id, marche_id, message)
  values (ligne.user_id, ligne.marche_id, concat_ws(' ', libelle, nullif(quoi, ''), action));
  return null;
end $$;
