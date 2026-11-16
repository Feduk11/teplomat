-- Выполните один раз в SQL Editor своего проекта Supabase.
-- Права администратора выдаются отдельно в конце файла, после создания пользователя.
begin;

create table if not exists public.site_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.site_admins enable row level security;
revoke all on public.site_admins from anon, authenticated;

create or replace function public.is_site_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.site_admins where user_id = (select auth.uid()));
$$;
revoke all on function public.is_site_admin() from public;
grant execute on function public.is_site_admin() to authenticated;

create table if not exists public.site_content (
  id text primary key check (id = 'main'),
  content jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 1000000),
  version integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.site_content enable row level security;
revoke all on public.site_content from anon, authenticated;
grant select on public.site_content to anon, authenticated;
grant update on public.site_content to authenticated;

drop policy if exists "Published page is readable" on public.site_content;
create policy "Published page is readable" on public.site_content for select to anon, authenticated using (id = 'main');
drop policy if exists "Only site admins update content" on public.site_content;
create policy "Only site admins update content" on public.site_content for update to authenticated
  using ((select public.is_site_admin())) with check ((select public.is_site_admin()) and id = 'main');
insert into public.site_content(id) values ('main') on conflict (id) do nothing;

create or replace function public.publish_site_content(new_content jsonb, expected_version integer)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare next_version integer;
begin
  if not public.is_site_admin() then raise exception 'not_authorized' using errcode = '42501'; end if;
  if jsonb_typeof(new_content) <> 'object' or octet_length(new_content::text) > 1000000 then
    raise exception 'invalid_content';
  end if;
  update public.site_content set content = new_content, version = version + 1, updated_at = now()
    where id = 'main' and version = expected_version returning version into next_version;
  if next_version is null then raise exception 'version_conflict'; end if;
  return jsonb_build_object('version', next_version);
end;
$$;
revoke all on function public.publish_site_content(jsonb, integer) from public;
grant execute on function public.publish_site_content(jsonb, integer) to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('site-media', 'site-media', true, 5242880, array['image/png','image/jpeg','image/webp','image/avif'])
on conflict (id) do nothing;

drop policy if exists "Public site media read" on storage.objects;
create policy "Public site media read" on storage.objects for select to anon, authenticated using (bucket_id = 'site-media');
drop policy if exists "Site admins upload media" on storage.objects;
create policy "Site admins upload media" on storage.objects for insert to authenticated
  with check (bucket_id = 'site-media' and (select public.is_site_admin()));
-- Нет клиентских прав delete/update: новые версии загружаются отдельным файлом.
commit;

-- После создания пользователя в Authentication > Users выполните ОТДЕЛЬНО:
-- insert into public.site_admins(user_id)
-- select id from auth.users where email = 'ВАШ_EMAIL'
-- on conflict (user_id) do nothing;
-- Проверка назначения (только в SQL Editor):
-- select a.user_id, u.email from public.site_admins a join auth.users u on u.id = a.user_id;
