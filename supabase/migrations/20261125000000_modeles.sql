-- Bibliothèque de modèles de documents (Word / Excel) remplis avec les données des marchés.

create table public.modeles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nom text not null,
  categorie text not null default 'Autre',
  description text not null default '',
  format text not null check (format in ('docx', 'xlsx')),
  chemin text not null,              -- fichier dans le bucket « scans » : <user_id>/modeles/...
  nom_fichier text not null default '',
  champs jsonb not null default '{}'::jsonb,  -- résultat de l'analyse : connus, libres, avertissements
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index modeles_user_idx on public.modeles (user_id, categorie);

create trigger modeles_updated_at before update on public.modeles
  for each row execute function public.maj_updated_at();

alter table public.modeles enable row level security;
create policy "modeles_select_proprietaire" on public.modeles for select to authenticated using (user_id = (select auth.uid()));
create policy "modeles_insert_proprietaire" on public.modeles for insert to authenticated
  with check (user_id = (select auth.uid()) and chemin like (select auth.uid())::text || '/modeles/%');
create policy "modeles_update_proprietaire" on public.modeles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and chemin like (select auth.uid())::text || '/modeles/%');
create policy "modeles_delete_proprietaire" on public.modeles for delete to authenticated using (user_id = (select auth.uid()));

-- Le bucket accepte désormais les classeurs Excel (modèles .xlsx).
update storage.buckets
set allowed_mime_types = array(
  select distinct unnest(allowed_mime_types || array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
)
where id = 'scans';
