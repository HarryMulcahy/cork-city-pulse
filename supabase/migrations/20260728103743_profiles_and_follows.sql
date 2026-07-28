-- Identity & community: follow people + live notifications.
-- DEPENDS ON follow_and_notifications (notifications table) — apply in filename order.

-- ---------- follows (person -> person) ----------
create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (follower_id, following_id),
  check (follower_id <> following_id)
);
alter table public.follows enable row level security;

drop policy if exists "Follows are viewable by everyone" on public.follows;
create policy "Follows are viewable by everyone" on public.follows for select using (true);
drop policy if exists "Users can follow (insert own)" on public.follows;
create policy "Users can follow (insert own)" on public.follows for insert with check (auth.uid() = follower_id);
drop policy if exists "Users can unfollow (delete own)" on public.follows;
create policy "Users can unfollow (delete own)" on public.follows for delete using (auth.uid() = follower_id);

create index if not exists follows_following_idx on public.follows (following_id);
create index if not exists follows_follower_idx on public.follows (follower_id);

-- Allow the 'follow' notification kind (development_id stays null for these).
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('comment', 'status', 'approval', 'update', 'follow'));

-- Notify a user when someone follows them.
create or replace function public.notify_on_follow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into public.notifications (user_id, actor_id, kind, data)
    select new.following_id, new.follower_id, 'follow',
           jsonb_build_object(
             'follower_name',
             coalesce((select display_name from public.profiles where id = new.follower_id), 'Someone')
           );
  exception when others then
    null;
  end;
  return new;
end;
$$;
drop trigger if exists trg_notify_on_follow on public.follows;
create trigger trg_notify_on_follow
  after insert on public.follows
  for each row execute function public.notify_on_follow();

-- Turn on Supabase Realtime for notifications so the bell updates live (RLS still applies).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
