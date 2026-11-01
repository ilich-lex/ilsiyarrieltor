begin;
alter table public.catalog_covers add column has_managed_photo boolean not null default false;
create function public.cms_mark_real_category() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.is_published then
  update public.catalog_covers set has_managed_photo=true where public.cms_category_match(new,category);
 end if;
 return new;
end; $$;
revoke all on function public.cms_mark_real_category() from public;
create trigger cms_mark_real_category after insert or update of is_published,category,market on public.catalog_properties for each row execute function public.cms_mark_real_category();
create function public.cms_mark_manual_cover() returns trigger language plpgsql set search_path='' as $$
begin
 if new.mode in ('upload','property') then new.has_managed_photo=true; end if;
 return new;
end; $$;
revoke all on function public.cms_mark_manual_cover() from public;
create trigger cms_mark_manual_cover before insert or update of mode,path on public.catalog_covers for each row execute function public.cms_mark_manual_cover();
create or replace function public.public_catalog() returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('schemaVersion',1,'siteId','ilsiyar-catalog-v1','reviews','[]'::jsonb,
    'properties',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'published',true,'title',p.title,'category',p.category,'type',p.type,'market',p.market,
      'city',p.city,'district',p.district,'address',p.address,'description',p.description,
      'price',p.price,'area',p.area,'rooms',p.rooms,'floor',p.floor,'landArea',p.land_area,
      'status',p.status,'featured',p.featured,'photos',coalesce((select jsonb_agg(jsonb_build_object('path',f.path,'alt',f.alt) order by f.sort_order,f.id)
      from public.catalog_photos f where f.property_id=p.id),'[]'::jsonb)) order by p.published_at desc,p.id)
      from public.catalog_properties p where p.is_published and p.rights_confirmed),'[]'::jsonb),
    'categories',coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object('useIllustration',not s.has_managed_photo and c.path is null)) from public.cms_resolved_covers() c join public.catalog_covers s on s.category=c.category),'[]'::jsonb));
$$;

commit;
