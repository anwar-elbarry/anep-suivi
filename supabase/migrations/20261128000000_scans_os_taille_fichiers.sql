-- Scan joint à chaque ordre de service (PDF ou photo de l'OS notifié).
alter table public.ordres_service add column if not exists scan_path text;

-- Fichiers jusqu'à 50 Mo (CPS et bordereaux scannés) et photos HEIF.
-- La limite globale du projet (Storage > Settings > « Global file size limit ») doit être au moins égale :
-- 50 Mo est le maximum de l'offre gratuite. Pour aller au-delà, relevez les deux limites
-- et la variable NEXT_PUBLIC_TAILLE_MAX_MO de l'application.
update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array(
      select distinct unnest(allowed_mime_types || array['image/heif'])
    )
where id = 'scans';
