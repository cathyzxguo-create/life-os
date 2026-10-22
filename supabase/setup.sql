-- 生活 OS · Supabase 初始化（在 SQL Editor 里整段运行一次即可，重复运行也安全）

-- 1. 数据表：每条数据是一份 JSON 文档，只属于登录的那个用户
create sequence if not exists public.docs_seq;

create table if not exists public.docs (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  path       text        not null,
  data       jsonb,
  deleted    boolean     not null default false,
  seq        bigint      not null default nextval('public.docs_seq'),
  updated_at timestamptz not null default now(),
  primary key (user_id, path)
);
create index if not exists docs_user_seq on public.docs (user_id, seq);

-- 每次写入都拿一个新的序号，手机和电脑靠它增量同步
create or replace function public.docs_touch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.seq := nextval('public.docs_seq');
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before insert or update on public.docs
for each row execute function public.docs_touch();

-- 2. 行级安全：只能读写自己的数据
alter table public.docs enable row level security;
drop policy if exists "own docs select" on public.docs;
drop policy if exists "own docs insert" on public.docs;
drop policy if exists "own docs update" on public.docs;
drop policy if exists "own docs delete" on public.docs;
create policy "own docs select" on public.docs for select to authenticated using (auth.uid() = user_id);
create policy "own docs insert" on public.docs for insert to authenticated with check (auth.uid() = user_id);
create policy "own docs update" on public.docs for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own docs delete" on public.docs for delete to authenticated using (auth.uid() = user_id);
grant select, insert, update, delete on public.docs to authenticated;
grant select on public.docs to anon;            -- 行级安全下 anon 读不到任何行，只用于每日保活
grant usage on sequence public.docs_seq to authenticated;

-- 3. 图片：私有存储桶，每个用户只能访问自己文件夹
insert into storage.buckets (id, name, public) values ('blobs', 'blobs', false)
on conflict (id) do nothing;
drop policy if exists "own blobs read" on storage.objects;
drop policy if exists "own blobs write" on storage.objects;
drop policy if exists "own blobs delete" on storage.objects;
create policy "own blobs read" on storage.objects for select to authenticated
  using (bucket_id = 'blobs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own blobs write" on storage.objects for insert to authenticated
  with check (bucket_id = 'blobs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own blobs delete" on storage.objects for delete to authenticated
  using (bucket_id = 'blobs' and (storage.foldername(name))[1] = auth.uid()::text);
