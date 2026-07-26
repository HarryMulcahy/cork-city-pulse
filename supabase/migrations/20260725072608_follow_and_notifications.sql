-- Follow / notify: let residents follow a development and be told when it changes.
--
-- Two tables + triggers. Notifications are written only by SECURITY DEFINER triggers
-- (which run as the table owner and bypass RLS), so there is no INSERT policy for users.
-- The notify triggers wrap their work in an exception guard so a notification failure can
-- never roll back the underlying comment / development write.

-- ---------- subscriptions ----------
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  development_id uuid not null references public.developments(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, development_id)
);
alter table public.subscriptions enable row level security;

create policy "Users can view their own subscriptions"
  on public.subscriptions for select using (auth.uid() = user_id);
create policy "Users can follow (insert own subscription)"
  on public.subscriptions for insert with check (auth.uid() = user_id);
create policy "Users can unfollow (delete own subscription)"
  on public.subscriptions for delete using (auth.uid() = user_id);

create index if not exists subscriptions_development_idx on public.subscriptions (development_id);
create index if not exists subscriptions_user_idx on public.subscriptions (user_id);

-- ---------- notifications ----------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,     -- recipient
  development_id uuid references public.developments(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,            -- who caused it
  kind text not null check (kind in ('comment', 'status', 'approval')),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
alter table public.notifications enable row level security;

-- Recipients can read / mark-read / delete their own; inserts happen only via triggers.
create policy "Users can view their own notifications"
  on public.notifications for select using (auth.uid() = user_id);
create policy "Users can update their own notifications"
  on public.notifications for update using (auth.uid() = user_id);
create policy "Users can delete their own notifications"
  on public.notifications for delete using (auth.uid() = user_id);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------- auto-follow the author of a real user submission ----------
create or replace function public.subscribe_author_to_development()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Only real user submissions; skip OSM imports and the per-city general discussion
  -- so the importer/admin isn't auto-subscribed to everything.
  if coalesce(new.source, 'user') = 'user' then
    insert into public.subscriptions (user_id, development_id)
    values (new.user_id, new.id)
    on conflict (user_id, development_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_subscribe_author on public.developments;
create trigger trg_subscribe_author
  after insert on public.developments
  for each row execute function public.subscribe_author_to_development();

-- ---------- on new comment: auto-follow commenter + notify other followers ----------
create or replace function public.notify_on_comment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into public.subscriptions (user_id, development_id)
    values (new.user_id, new.development_id)
    on conflict (user_id, development_id) do nothing;

    insert into public.notifications (user_id, development_id, actor_id, kind, data)
    select s.user_id, new.development_id, new.user_id, 'comment',
           jsonb_build_object('dev_title', d.title)
    from public.subscriptions s
    join public.developments d on d.id = new.development_id
    where s.development_id = new.development_id
      and s.user_id <> new.user_id;
  exception when others then
    -- never let a notification failure block the comment being posted
    null;
  end;
  return new;
end;
$$;
drop trigger if exists trg_notify_on_comment on public.comments;
create trigger trg_notify_on_comment
  after insert on public.comments
  for each row execute function public.notify_on_comment();

-- ---------- on status / approval change: notify followers ----------
create or replace function public.notify_on_development_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  n_kind text;
  from_val text;
  to_val text;
begin
  if new.approval_status is distinct from old.approval_status then
    n_kind := 'approval'; from_val := old.approval_status; to_val := new.approval_status;
  elsif new.status is distinct from old.status then
    n_kind := 'status'; from_val := old.status::text; to_val := new.status::text;
  else
    return new;
  end if;

  begin
    insert into public.notifications (user_id, development_id, actor_id, kind, data)
    select s.user_id, new.id, auth.uid(), n_kind,
           jsonb_build_object('dev_title', new.title, 'from', from_val, 'to', to_val)
    from public.subscriptions s
    where s.development_id = new.id
      and s.user_id is distinct from auth.uid();
  exception when others then
    null;
  end;
  return new;
end;
$$;
drop trigger if exists trg_notify_on_development_change on public.developments;
create trigger trg_notify_on_development_change
  after update on public.developments
  for each row execute function public.notify_on_development_change();
