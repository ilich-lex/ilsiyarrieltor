-- Run in SQL Editor on Ilsiyar's isolated project. Every fixture is rolled back.
begin;
insert into auth.users(id,email) values('10000000-0000-4000-8000-000000000001','rls-fixture@example.invalid');
insert into public.cms_admins(user_id) values('10000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.cms_save_property('{"id":"rls-fixture","title":"ТЕСТ RLS — не объявление","city":"Тест","category":"apartment","type":"Квартира","market":"newbuild","status":"active","rightsConfirmed":true,"price":100,"photos":[]}',0,false);
do $$ begin
 if jsonb_array_length(public.public_catalog()->'properties')<>0 then raise exception 'Draft leaked'; end if;
 begin
  perform public.cms_save_property('{"id":"rls-fixture","title":"ТЕСТ RLS — не объявление","city":"Тест","category":"apartment","type":"Квартира","market":"newbuild","status":"active","rightsConfirmed":true,"photos":[]}',1,true);
  raise exception 'Empty publication accepted';
 exception when raise_exception then if sqlerrm not like 'Для публикации%' then raise; end if; end;
end $$;
reset role;
insert into storage.objects(bucket_id,name) values('catalog-private','properties/rls-fixture/10000000-0000-4000-8000-000000000002.webp');
set local role authenticated;
select public.cms_save_property('{"id":"rls-fixture","title":"ТЕСТ RLS — не объявление","city":"Тест","category":"apartment","type":"Квартира","market":"newbuild","status":"active","rightsConfirmed":true,"price":100,"photos":[{"path":"properties/rls-fixture/10000000-0000-4000-8000-000000000002.webp","width":10,"height":10,"bytes":100}]}',1,true);
do $$ begin
 if jsonb_array_length(public.public_catalog()->'properties')<>1 then raise exception 'Published property missing'; end if;
 if not public.public_media_allowed('properties/rls-fixture/10000000-0000-4000-8000-000000000002.webp') then raise exception 'Published media missing'; end if;
 if not exists(select 1 from jsonb_array_elements(public.public_catalog()->'categories') c where c->>'category'='newbuild' and c->>'path'='properties/rls-fixture/10000000-0000-4000-8000-000000000002.webp') then raise exception 'Category resolution failed'; end if;
 begin
  perform public.cms_delete_property('rls-fixture',1);
  raise exception 'Stale revision accepted';
 exception when serialization_failure then null; end;
end $$;
select public.cms_save_cover('apartment','property','properties/rls-fixture/10000000-0000-4000-8000-000000000002.webp','rls-fixture',20,30,1.2);
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
do $$ begin
 if exists(select 1 from public.catalog_properties) then raise exception 'Nonadmin can read draft tables'; end if;
 begin
  perform public.cms_delete_property('rls-fixture',2);
  raise exception 'Nonadmin mutation allowed';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.cms_admins(user_id) values('20000000-0000-4000-8000-000000000001');
  raise exception 'Self-promotion allowed';
 exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
 begin perform public.cms_delete_property('rls-fixture',2);raise exception 'Anon mutation allowed';exception when insufficient_privilege then null;end;
 begin perform 1 from public.catalog_properties;raise exception 'Anon table read allowed';exception when insufficient_privilege then null;end;
 if exists(select 1 from storage.objects where bucket_id='catalog-private') then raise exception 'Anon can sign private media'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.cms_save_property('{"id":"rls-fixture","title":"ТЕСТ RLS — не объявление","city":"Тест","category":"apartment","type":"Квартира","market":"newbuild","status":"active","rightsConfirmed":true,"price":200,"photos":[{"path":"properties/rls-fixture/10000000-0000-4000-8000-000000000002.webp","width":10,"height":10,"bytes":100}]}',2,false);
do $$ begin
 if jsonb_array_length(public.public_catalog()->'properties')<>0 then raise exception 'Withdrawn object visible'; end if;
 if public.public_media_allowed('properties/rls-fixture/10000000-0000-4000-8000-000000000002.webp') then raise exception 'Withdrawn media visible'; end if;
 if exists(select 1 from jsonb_array_elements(public.public_catalog()->'categories') c where c->>'path' is not null) then raise exception 'Withdrawn cover leaked'; end if;
 if exists(select 1 from jsonb_array_elements(public.public_catalog()->'categories') c where c->>'category' in ('apartment','newbuild') and (c->>'useIllustration')::boolean) then raise exception 'Legacy illustration returned after withdrawal'; end if;
end $$;
rollback;
select 'PASS: drafts, publication, category matching, revision guard, admin allowlist, anonymous RLS, private Storage, withdrawal' as security_checks;
