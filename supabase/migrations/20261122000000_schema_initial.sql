-- Suivi des travaux : schéma initial
-- Chaque ligne appartient à un utilisateur (user_id) ; la RLS limite l'accès à son propriétaire.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Marchés
-- ---------------------------------------------------------------------------
create table public.marches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  numero text not null,
  objet text not null default '',
  entreprise text not null default '',
  montant_ttc numeric(16, 2) not null default 0,
  date_debut date,
  duree_mois numeric(6, 2) not null default 0,
  statut text not null default 'Non démarré'
    check (statut in ('Non démarré', 'En cours', 'Arrêté', 'Réception provisoire', 'Réception définitive', 'Résilié')),
  taux_tva numeric(5, 2) not null default 20,
  taux_retenue numeric(5, 2) not null default 10,
  plafond_retenue numeric(5, 2) not null default 7,
  -- Révision des prix : [{ "nom": "BAT1", "part": 0.35, "base": 100, "actuel": 104 }], jusqu'à 3 indices
  indices_revision jsonb not null default '[]'::jsonb,
  attachements_cumulatifs boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index marches_user_idx on public.marches (user_id);

-- ---------------------------------------------------------------------------
-- Intervenants
-- ---------------------------------------------------------------------------
create table public.intervenants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  marche_id uuid not null references public.marches (id) on delete cascade,
  role text not null default 'Autre',
  nom text not null default '',
  organisme text not null default '',
  telephone text not null default '',
  email text not null default '',
  created_at timestamptz not null default now()
);
create index intervenants_marche_idx on public.intervenants (marche_id);

-- ---------------------------------------------------------------------------
-- Ordres de service
-- ---------------------------------------------------------------------------
create table public.ordres_service (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  marche_id uuid not null references public.marches (id) on delete cascade,
  type text not null check (type in ('demarrage', 'arret', 'reprise', 'prolongation', 'autre')),
  numero text not null default '',
  date_emission date,
  date_notification date,
  jours_supplementaires integer not null default 0,
  objet text not null default '',
  created_at timestamptz not null default now()
);
create index ordres_service_marche_idx on public.ordres_service (marche_id);

-- ---------------------------------------------------------------------------
-- PV de réunion
-- ---------------------------------------------------------------------------
create table public.pv_reunions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  marche_id uuid not null references public.marches (id) on delete cascade,
  numero text not null default '',
  date date,
  participants text not null default '',
  decisions text not null default '',
  actions text not null default '',
  scan_path text,
  created_at timestamptz not null default now()
);
create index pv_reunions_marche_idx on public.pv_reunions (marche_id);

-- ---------------------------------------------------------------------------
-- BPDE (bordereau des prix - détail estimatif)
-- ---------------------------------------------------------------------------
create table public.bpde_lignes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  marche_id uuid not null references public.marches (id) on delete cascade,
  ordre integer not null default 0,
  numero text not null default '',
  designation text not null default '',
  unite text not null default '',
  quantite numeric(16, 3) not null default 0,
  prix_unitaire numeric(16, 2),
  montant_importe numeric(16, 2),
  created_at timestamptz not null default now()
);
create index bpde_lignes_marche_idx on public.bpde_lignes (marche_id, ordre);

-- ---------------------------------------------------------------------------
-- Attachements et leurs lignes
-- ---------------------------------------------------------------------------
create table public.attachements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  marche_id uuid not null references public.marches (id) on delete cascade,
  numero text not null default '',
  periode text not null default '',
  date date,
  montant numeric(16, 2),
  statut text not null default 'En attente'
    check (statut in ('En attente', 'Validé', 'Rejeté')),
  observations text not null default '',
  created_at timestamptz not null default now()
);
create index attachements_marche_idx on public.attachements (marche_id);

create table public.attachement_lignes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  attachement_id uuid not null references public.attachements (id) on delete cascade,
  ordre integer not null default 0,
  numero text not null default '',
  designation text not null default '',
  unite text not null default '',
  quantite numeric(16, 3) not null default 0
);
create index attachement_lignes_att_idx on public.attachement_lignes (attachement_id, ordre);

-- ---------------------------------------------------------------------------
-- Documents à fournir
-- ---------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  marche_id uuid not null references public.marches (id) on delete cascade,
  nom text not null,
  responsable text not null default 'Entreprise',
  echeance date,
  statut text not null default 'À fournir'
    check (statut in ('À fournir', 'Fourni', 'Validé', 'À reprendre')),
  source text not null default 'manuel' check (source in ('manuel', 'cps', 'attachement')),
  prestation text not null default '',
  article_cps text not null default '',
  observations text not null default '',
  scan_path text,
  created_at timestamptz not null default now()
);
create index documents_marche_idx on public.documents (marche_id);

-- ---------------------------------------------------------------------------
-- Décomptes
-- ---------------------------------------------------------------------------
create table public.decomptes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  marche_id uuid not null references public.marches (id) on delete cascade,
  numero text not null default '',
  date date,
  montant_travaux numeric(16, 2) not null default 0,   -- TTC, travaux de la période
  montant_revision numeric(16, 2) not null default 0,  -- TTC, révision de la période
  coefficient_k numeric(10, 6),
  observations text not null default '',
  created_at timestamptz not null default now()
);
create index decomptes_marche_idx on public.decomptes (marche_id);

-- ---------------------------------------------------------------------------
-- Journal d'activité (alimenté par triggers)
-- ---------------------------------------------------------------------------
create table public.activites (
  id bigserial primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  marche_id uuid not null references public.marches (id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);
create index activites_marche_idx on public.activites (marche_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Cohérence : une ligne enfant doit appartenir au même utilisateur que son parent
-- ---------------------------------------------------------------------------
create or replace function public.verifier_proprietaire_marche()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.marches m where m.id = new.marche_id and m.user_id = new.user_id) then
    raise exception 'Marché introuvable ou non autorisé';
  end if;
  return new;
end $$;

create or replace function public.verifier_proprietaire_attachement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.attachements a where a.id = new.attachement_id and a.user_id = new.user_id) then
    raise exception 'Attachement introuvable ou non autorisé';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['intervenants','ordres_service','pv_reunions','bpde_lignes','attachements','documents','decomptes','activites'] loop
    execute format('create trigger %I_proprietaire before insert or update on public.%I
                    for each row execute function public.verifier_proprietaire_marche()', t, t);
  end loop;
end $$;

create trigger attachement_lignes_proprietaire before insert or update on public.attachement_lignes
  for each row execute function public.verifier_proprietaire_attachement();

-- updated_at
create or replace function public.maj_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger marches_updated_at before update on public.marches
  for each row execute function public.maj_updated_at();

-- Journal d'activité
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
    else tg_table_name end;

  quoi := case tg_table_name
    when 'intervenants' then coalesce(nullif(to_jsonb(ligne) ->> 'nom', ''), to_jsonb(ligne) ->> 'role')
    when 'documents' then to_jsonb(ligne) ->> 'nom'
    else to_jsonb(ligne) ->> 'numero'
  end;

  action := case tg_op when 'INSERT' then 'ajouté' when 'UPDATE' then 'modifié' else 'supprimé' end;

  insert into public.activites (user_id, marche_id, message)
  values (ligne.user_id, ligne.marche_id, concat_ws(' ', libelle, nullif(quoi, ''), action));
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['intervenants','ordres_service','pv_reunions','attachements','documents','decomptes'] loop
    execute format('create trigger %I_activite after insert or update or delete on public.%I
                    for each row execute function public.journaliser_activite()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['marches','intervenants','ordres_service','pv_reunions','bpde_lignes','attachements','attachement_lignes','documents','decomptes','activites'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s_select_proprietaire" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t, t);
    execute format('create policy "%s_insert_proprietaire" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t, t);
    execute format('create policy "%s_update_proprietaire" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t, t);
    execute format('create policy "%s_delete_proprietaire" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Stockage : scans (PDF / photos) et CPS, rangés sous <user_id>/<marche_id>/...
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'scans', 'scans', false, 20971520,
  array[
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'
  ]
)
on conflict (id) do nothing;

create policy "scans_select_proprietaire" on storage.objects for select to authenticated
  using (bucket_id = 'scans' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "scans_insert_proprietaire" on storage.objects for insert to authenticated
  with check (bucket_id = 'scans' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "scans_update_proprietaire" on storage.objects for update to authenticated
  using (bucket_id = 'scans' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "scans_delete_proprietaire" on storage.objects for delete to authenticated
  using (bucket_id = 'scans' and (storage.foldername(name))[1] = (select auth.uid())::text);
