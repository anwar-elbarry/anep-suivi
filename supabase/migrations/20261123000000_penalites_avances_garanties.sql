-- Pénalités de retard, avances, retenue remplacée par caution, garanties et assurances.
-- Tous les paramètres sont à reprendre du CPS : aucune valeur réglementaire n'est imposée par défaut.

alter table public.marches
  -- Pénalités : taux en millièmes du montant de base par jour calendaire de retard, plafond en % du montant de base
  add column penalite_taux_millieme numeric(8, 4),
  add column penalite_plafond numeric(5, 2),
  add column penalite_jours_exoneres integer not null default 0,
  -- Date de réception provisoire (ou d'achèvement) : arrête le décompte des jours de retard
  add column date_reception_provisoire date,
  -- Avance : montant TTC versé, remboursé linéairement entre deux seuils d'avancement (% du montant du marché)
  add column avance_montant numeric(16, 2) not null default 0,
  add column avance_date date,
  add column avance_debut_remboursement numeric(5, 2) not null default 0,
  add column avance_fin_remboursement numeric(5, 2) not null default 100,
  -- Retenue de garantie remplacée par une caution : plus de retenue sur les décomptes
  add column retenue_remplacee_par_caution boolean not null default false,
  add constraint marches_avance_seuils check (avance_fin_remboursement > avance_debut_remboursement);

alter table public.decomptes
  add column montant_penalites numeric(16, 2) not null default 0,
  add column remboursement_avance numeric(16, 2) not null default 0,
  add column retenue_garantie numeric(16, 2),
  add column net_a_payer numeric(16, 2);

-- ---------------------------------------------------------------------------
-- Garanties (cautions) et assurances
-- ---------------------------------------------------------------------------
create table public.garanties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  marche_id uuid not null references public.marches (id) on delete cascade,
  type text not null,
  organisme text not null default '',
  reference text not null default '',
  montant numeric(16, 2),
  date_emission date,
  date_expiration date,
  statut text not null default 'En vigueur' check (statut in ('En vigueur', 'Mainlevée', 'Restituée')),
  observations text not null default '',
  scan_path text,
  created_at timestamptz not null default now()
);
create index garanties_marche_idx on public.garanties (marche_id);

create trigger garanties_proprietaire before insert or update on public.garanties
  for each row execute function public.verifier_proprietaire_marche();

alter table public.garanties enable row level security;
create policy "garanties_select_proprietaire" on public.garanties for select to authenticated using (user_id = (select auth.uid()));
create policy "garanties_insert_proprietaire" on public.garanties for insert to authenticated with check (user_id = (select auth.uid()));
create policy "garanties_update_proprietaire" on public.garanties for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "garanties_delete_proprietaire" on public.garanties for delete to authenticated using (user_id = (select auth.uid()));

-- Journal d'activité : ajoute les garanties
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
    else tg_table_name end;

  quoi := case tg_table_name
    when 'intervenants' then coalesce(nullif(to_jsonb(ligne) ->> 'nom', ''), to_jsonb(ligne) ->> 'role')
    when 'documents' then to_jsonb(ligne) ->> 'nom'
    when 'garanties' then to_jsonb(ligne) ->> 'type'
    else to_jsonb(ligne) ->> 'numero'
  end;

  action := case tg_op when 'INSERT' then 'ajouté' when 'UPDATE' then 'modifié' else 'supprimé' end;

  insert into public.activites (user_id, marche_id, message)
  values (ligne.user_id, ligne.marche_id, concat_ws(' ', libelle, nullif(quoi, ''), action));
  return null;
end $$;

create trigger garanties_activite after insert or update or delete on public.garanties
  for each row execute function public.journaliser_activite();
