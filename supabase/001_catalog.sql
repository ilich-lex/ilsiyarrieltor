-- Ilsiyar only. Run in the NEW ilsiyar-catalog project's SQL editor.
-- No users, credentials, example listings or client leads are seeded.
begin;
create table public.cms_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.cms_admins enable row level security;
create function public.cms_is_admin() returns boolean language sql stable security definer
set search_path = '' as $$
  select exists(select 1 from public.cms_admins where user_id = (select auth.uid()));
$$;
revoke all on function public.cms_is_admin() from public;
grant execute on function public.cms_is_admin() to authenticated;
revoke all on public.cms_admins from anon, authenticated;
grant select on public.cms_admins to authenticated;
create policy admin_self_read on public.cms_admins for select to authenticated
using (user_id = (select auth.uid()));

create table public.catalog_properties (
  id text primary key check (id ~ '^[a-z0-9-]{1,80}$'),
  title text not null check (char_length(btrim(title)) between 1 and 180),
  category text not null check (category in ('apartment','house','land','commercial','storage')),
  type text not null check (char_length(type) between 1 and 80),
  market text not null default 'secondary' check (market in ('secondary','newbuild')),
  city text not null default '' check (char_length(city)<=100),
  district text not null default '' check (char_length(district)<=180),
  address text not null default '' check (char_length(address)<=250),
  description text not null default '' check (char_length(description)<=10000),
  price numeric check (price >= 0 and price <= 1000000000000),
  area numeric check (area > 0 and area <= 100000000),
  rooms integer check (rooms >= 0 and rooms <= 1000),
  floor integer check (floor >= -10 and floor <= 300),
  land_area numeric check (land_area > 0 and land_area <= 100000000),
  status text not null default 'active' check (status in ('active','reserved','sold')),
  featured boolean not null default false,
  rights_confirmed boolean not null default false,
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  check (not is_published or (rights_confirmed and char_length(btrim(city))>=2 and char_length(btrim(title))>=5 and status<>'sold'))
);
create table public.catalog_photos (
  id uuid primary key default gen_random_uuid(),
  property_id text not null references public.catalog_properties(id) on delete cascade,
  path text not null unique check (path ~ '^properties/[a-z0-9-]{1,80}/[a-f0-9-]{36}\.webp$'),
  alt text not null default '' check (char_length(alt)<=250),
  sort_order integer not null check (sort_order between 0 and 11),
  width integer not null check (width between 1 and 5000),
  height integer not null check (height between 1 and 5000),
  bytes integer not null check (bytes between 1 and 1500000)
);
create index catalog_photos_property_idx on public.catalog_photos(property_id,sort_order);
create table public.catalog_covers (
  category text primary key check (category in ('apartment','newbuild','house','land','commercial','storage')),
  mode text not null default 'auto' check (mode in ('auto','upload','property')),
  property_id text,
  path text,
  crop_x numeric not null default 50 check (crop_x between 0 and 100),
  crop_y numeric not null default 50 check (crop_y between 0 and 100),
  zoom numeric not null default 1 check (zoom between 1 and 2),
  updated_at timestamptz not null default now(),
  check ((mode='auto' and path is null and property_id is null) or
         (mode='upload' and property_id is null and path ~ '^covers/[a-f0-9-]{36}\.webp$') or
         (mode='property' and property_id is not null and path is not null))
);
insert into public.catalog_covers(category) values ('apartment'),('newbuild'),('house'),('land'),('commercial'),('storage');
alter table public.catalog_properties enable row level security;
alter table public.catalog_photos enable row level security;
alter table public.catalog_covers enable row level security;
revoke all on public.catalog_properties, public.catalog_photos, public.catalog_covers from anon, authenticated;
grant select on public.catalog_properties, public.catalog_photos, public.catalog_covers to authenticated;
create policy properties_admin_read on public.catalog_properties for select to authenticated using ((select public.cms_is_admin()));
create policy photos_admin_read on public.catalog_photos for select to authenticated using ((select public.cms_is_admin()));
create policy covers_admin_read on public.catalog_covers for select to authenticated using ((select public.cms_is_admin()));
-- Mutations are transactional RPCs only. Clients cannot bypass publication validation.

create function public.cms_identity() returns text language sql immutable set search_path='' as $$select 'ilsiyar-catalog-v1'::text$$;
create function public.cms_category_match(p public.catalog_properties, category_key text) returns boolean
language sql immutable set search_path='' as $$
 select case when category_key='newbuild' then p.market='newbuild' and p.category='apartment' else p.category=category_key end;
$$;

create function public.cms_resolved_covers() returns table(category text,path text,crop_x numeric,crop_y numeric,zoom numeric,source text)
language sql stable security definer set search_path='' as $$
  select c.category,
    coalesce(manual.path, automatic.path),
    case when manual.path is null then 50 else c.crop_x end,
    case when manual.path is null then 50 else c.crop_y end,
    case when manual.path is null then 1 else c.zoom end,
    case when manual.path is not null then c.mode else 'auto' end
  from public.catalog_covers c
  left join lateral (
    select c.path where
      (c.mode='upload' and exists(select 1 from storage.objects s where s.bucket_id='catalog-private' and s.name=c.path)) or
      (c.mode='property' and exists(select 1 from public.catalog_properties p join public.catalog_photos f on f.property_id=p.id
        where p.id=c.property_id and p.is_published and p.rights_confirmed and f.path=c.path and public.cms_category_match(p,c.category)))
  ) manual on true
  left join lateral (
    select f.path from public.catalog_properties p join public.catalog_photos f on f.property_id=p.id
    where p.is_published and p.rights_confirmed and public.cms_category_match(p,c.category)
    order by p.published_at asc,p.id asc,f.sort_order asc,f.id asc limit 1
  ) automatic on true;
$$;
revoke all on function public.cms_resolved_covers() from public;

create function public.public_catalog() returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('schemaVersion',1,'siteId','ilsiyar-catalog-v1','reviews','[]'::jsonb,
    'properties',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'published',true,'title',p.title,'category',p.category,'type',p.type,'market',p.market,
      'city',p.city,'district',p.district,'address',p.address,'description',p.description,
      'price',p.price,'area',p.area,'rooms',p.rooms,'floor',p.floor,'landArea',p.land_area,
      'status',p.status,'featured',p.featured,'photos',coalesce((select jsonb_agg(jsonb_build_object('path',f.path,'alt',f.alt) order by f.sort_order,f.id)
      from public.catalog_photos f where f.property_id=p.id),'[]'::jsonb)) order by p.published_at desc,p.id)
      from public.catalog_properties p where p.is_published and p.rights_confirmed),'[]'::jsonb),
    'categories',coalesce((select jsonb_agg(to_jsonb(c)) from public.cms_resolved_covers() c),'[]'::jsonb));
$$;
create function public.public_media_allowed(media_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.catalog_photos f join public.catalog_properties p on p.id=f.property_id
  where f.path=media_path and p.is_published and p.rights_confirmed)
 or exists(select 1 from public.cms_resolved_covers() c where c.path=media_path);
$$;
revoke all on function public.public_catalog(),public.public_media_allowed(text),public.cms_identity(),public.cms_category_match(public.catalog_properties,text) from public;
grant execute on function public.public_catalog(),public.public_media_allowed(text),public.cms_identity() to anon,authenticated;

create function public.cms_save_property(document jsonb, expected_revision bigint, publish boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item_id text:=document->>'id'; old public.catalog_properties; photo jsonb; n integer:=0; result public.catalog_properties; do_publish boolean;
begin
 if not public.cms_is_admin() then raise exception 'Доступ запрещён' using errcode='42501'; end if;
 select * into old from public.catalog_properties where id=item_id for update;
 if found then
  if old.revision<>expected_revision then raise exception 'Объект изменён в другом окне. Обновите список.' using errcode='40001'; end if;
 elsif expected_revision<>0 then raise exception 'Объект не найден' using errcode='40001'; end if;
 if jsonb_typeof(document->'photos')<>'array' or jsonb_array_length(document->'photos')>12 then raise exception 'Не более 12 фотографий'; end if;
 do_publish:=publish and document->>'status'<>'sold';
 insert into public.catalog_properties(id,title,category,type,market,city,district,address,description,price,area,rooms,floor,land_area,status,featured,rights_confirmed,is_published,published_at,revision)
 values(item_id,document->>'title',document->>'category',document->>'type',document->>'market',coalesce(document->>'city',''),coalesce(document->>'district',''),coalesce(document->>'address',''),coalesce(document->>'description',''),
  nullif(document->>'price','')::numeric,nullif(document->>'area','')::numeric,nullif(document->>'rooms','')::int,nullif(document->>'floor','')::int,nullif(document->>'landArea','')::numeric,
  document->>'status',coalesce((document->>'featured')::boolean,false),coalesce((document->>'rightsConfirmed')::boolean,false),do_publish,
  case when do_publish then coalesce(old.published_at,now()) else old.published_at end,coalesce(old.revision,0)+1)
 on conflict(id) do update set title=excluded.title,category=excluded.category,type=excluded.type,market=excluded.market,city=excluded.city,district=excluded.district,address=excluded.address,description=excluded.description,
  price=excluded.price,area=excluded.area,rooms=excluded.rooms,floor=excluded.floor,land_area=excluded.land_area,status=excluded.status,featured=excluded.featured,rights_confirmed=excluded.rights_confirmed,
  is_published=excluded.is_published,published_at=excluded.published_at,revision=excluded.revision,updated_at=now();
 delete from public.catalog_photos where property_id=item_id;
 for photo in select * from jsonb_array_elements(document->'photos') loop
  if photo->>'path' not like 'properties/'||item_id||'/%' or not exists(select 1 from storage.objects where bucket_id='catalog-private' and name=photo->>'path') then raise exception 'Фото не загружено в хранилище этого объекта'; end if;
  insert into public.catalog_photos(property_id,path,alt,sort_order,width,height,bytes)
  values(item_id,photo->>'path',coalesce(photo->>'alt',''),n,(photo->>'width')::int,(photo->>'height')::int,(photo->>'bytes')::int);
  n:=n+1;
 end loop;
 if do_publish and n=0 then raise exception 'Для публикации нужно хотя бы одно фото'; end if;
 select * into result from public.catalog_properties where id=item_id;
 return to_jsonb(result);
end; $$;

create function public.cms_save_cover(category_key text, cover_mode text, media_path text default null, source_property text default null, x numeric default 50, y numeric default 50, scale numeric default 1)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.cms_is_admin() then raise exception 'Доступ запрещён' using errcode='42501'; end if;
 if cover_mode='upload' and not exists(select 1 from storage.objects s where s.bucket_id='catalog-private' and s.name=media_path) then raise exception 'Сначала загрузите фото'; end if;
 if cover_mode='property' and not exists(select 1 from public.catalog_properties p join public.catalog_photos f on f.property_id=p.id where p.id=source_property and p.is_published and p.rights_confirmed and public.cms_category_match(p,category_key) and f.path=media_path) then raise exception 'Выберите фото опубликованного объекта этой категории'; end if;
 update public.catalog_covers set mode=cover_mode,path=case when cover_mode='auto' then null else media_path end,
 property_id=case when cover_mode='property' then source_property else null end,crop_x=x,crop_y=y,zoom=scale,updated_at=now() where category=category_key;
 if not found then raise exception 'Неизвестная категория'; end if;
end; $$;

create function public.cms_delete_property(item_id text, expected_revision bigint) returns text[]
language plpgsql security definer set search_path='' as $$
declare paths text[]; old public.catalog_properties;
begin
 if not public.cms_is_admin() then raise exception 'Доступ запрещён' using errcode='42501'; end if;
 select * into old from public.catalog_properties where id=item_id for update;
 if not found or old.revision<>expected_revision then raise exception 'Объект уже изменён. Обновите список.' using errcode='40001'; end if;
 select coalesce(array_agg(path),'{}') into paths from public.catalog_photos where property_id=item_id;
 delete from public.catalog_properties where id=item_id;
 return paths;
end; $$;
revoke all on function public.cms_save_property(jsonb,bigint,boolean),public.cms_save_cover(text,text,text,text,numeric,numeric,numeric),public.cms_delete_property(text,bigint) from public;
grant execute on function public.cms_save_property(jsonb,bigint,boolean),public.cms_save_cover(text,text,text,text,numeric,numeric,numeric),public.cms_delete_property(text,bigint) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('catalog-private','catalog-private',false,1500000,array['image/webp'])
on conflict(id) do nothing;
create function public.cms_unused_media(media_path text) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.catalog_photos where path=media_path)
 and not exists(select 1 from public.catalog_covers where mode='upload' and path=media_path);
$$;
revoke all on function public.cms_unused_media(text) from public;
grant execute on function public.cms_unused_media(text) to authenticated;
-- Anon has NO Storage SELECT: cannot generate long-lived signed URLs for withdrawn photos.
create policy catalog_admin_read on storage.objects for select to authenticated
using (bucket_id='catalog-private' and (select public.cms_is_admin()));
create policy catalog_admin_upload on storage.objects for insert to authenticated
with check (bucket_id='catalog-private' and (select public.cms_is_admin()) and
 (name ~ '^covers/[a-f0-9-]{36}\.webp$' or
  (name ~ '^properties/[a-z0-9-]{1,80}/[a-f0-9-]{36}\.webp$' and exists(select 1 from public.catalog_properties p where p.id=split_part(name,'/',2)))));
create policy catalog_admin_delete_unused on storage.objects for delete to authenticated
using (bucket_id='catalog-private' and (select public.cms_is_admin()) and public.cms_unused_media(name));
commit;
