-- Prefer reverting only the frontend: the additive JPEG schema is backward compatible.
-- Full schema rollback is SAFE ONLY BEFORE JPEG is used. This script fails closed
-- rather than deleting, hiding or converting anyone's images. Never remove this guard.
begin;
set local lock_timeout = '5s';
lock table public.catalog_photos, public.catalog_covers in access exclusive mode;
do $$ begin
  if exists(select 1 from public.catalog_photos where path ~ '\.jpe?g$') or
     exists(select 1 from public.catalog_covers where path ~ '\.jpe?g$') or
     exists(select 1 from storage.objects where bucket_id='catalog-private' and name ~ '\.jpe?g$') then
    raise exception 'JPEG files exist: keep the additive schema and roll back only frontend. No data changed.';
  end if;
end $$;
alter table public.catalog_photos drop constraint catalog_photos_path_check;
alter table public.catalog_photos add constraint catalog_photos_path_check
  check (path ~ '^properties/[a-z0-9-]{1,80}/[a-f0-9-]{36}\.webp$');
alter table public.catalog_covers drop constraint catalog_covers_check;
alter table public.catalog_covers add constraint catalog_covers_check
  check ((mode='auto' and path is null and property_id is null) or
    (mode='upload' and property_id is null and path ~ '^covers/[a-f0-9-]{36}\.webp$') or
    (mode='property' and property_id is not null and path is not null));
alter policy catalog_admin_upload on storage.objects
with check (bucket_id='catalog-private' and (select public.cms_is_admin()) and
  (name ~ '^covers/[a-f0-9-]{36}\.webp$' or
   (name ~ '^properties/[a-z0-9-]{1,80}/[a-f0-9-]{36}\.webp$'
    and exists(select 1 from public.catalog_properties p where p.id=split_part(name,'/',2)))));
update storage.buckets set allowed_mime_types=array['image/webp']::text[] where id='catalog-private';
commit;
