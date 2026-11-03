-- Additive format migration. Run before releasing the JPEG-capable frontend.
-- No records or files are changed. Existing WebP paths, RLS and size limits remain.
begin;
set local lock_timeout = '5s';
do $$ begin
  if not exists(select 1 from storage.buckets where id='catalog-private'
    and not public and file_size_limit=1500000
    and allowed_mime_types <@ array['image/webp','image/jpeg']::text[]
    and 'image/webp'=any(allowed_mime_types)) then
    raise exception 'Unexpected bucket configuration; inspect before migrating';
  end if;
end $$;

alter table public.catalog_photos drop constraint catalog_photos_path_check;
alter table public.catalog_photos add constraint catalog_photos_path_check
  check (path ~ '^properties/[a-z0-9-]{1,80}/[a-f0-9-]{36}\.(webp|jpe?g)$');
alter table public.catalog_covers drop constraint catalog_covers_check;
alter table public.catalog_covers add constraint catalog_covers_check
  check ((mode='auto' and path is null and property_id is null) or
    (mode='upload' and property_id is null and path ~ '^covers/[a-f0-9-]{36}\.(webp|jpe?g)$') or
    (mode='property' and property_id is not null and path is not null));

alter policy catalog_admin_upload on storage.objects
with check (bucket_id='catalog-private' and (select public.cms_is_admin()) and
  (name ~ '^covers/[a-f0-9-]{36}\.(webp|jpe?g)$' or
   (name ~ '^properties/[a-z0-9-]{1,80}/[a-f0-9-]{36}\.(webp|jpe?g)$'
    and exists(select 1 from public.catalog_properties p where p.id=split_part(name,'/',2)))));
update storage.buckets set allowed_mime_types=array['image/webp','image/jpeg']::text[]
where id='catalog-private';
commit;
