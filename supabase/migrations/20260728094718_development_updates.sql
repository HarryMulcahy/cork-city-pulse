-- Progress Updates: a dated construction-progress diary per development — the feature
-- SkyscraperCity users live in, geo-anchored to a pin.
--
-- DEPENDS ON 20260725072608_follow_and_notifications.sql (notifications/subscriptions):
-- apply migrations in filename order so those tables exist before this runs.

create table if not exists public.development_updates (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references public.developments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  captured_at timestamptz not null default now(),   -- when the photo was actually taken
  caption text,
  images text[] not null default '{}',
  milestone text check (milestone in ('foundation', 'core_rising', 'topped_out', 'facade', 'completed')),
  created_at timestamptz not null default now()
);
alter table public.development_updates enable row level security;

create policy "Progress updates are viewable by everyone"
  on public.development_updates for select using (true);
create policy "Authenticated users can post updates"
  on public.development_updates for insert with check (auth.uid() = user_id);
create policy "Users can edit their own updates"
  on public.development_updates for update using (auth.uid() = user_id);
create policy "Owners and approvers can delete updates"
  on public.development_updates for delete
  using (auth.uid() = user_id or public.is_approver(auth.uid()));

create index if not exists development_updates_dev_idx
  on public.development_updates (development_id, captured_at desc);

-- Allow the 'update' notification kind.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('comment', 'status', 'approval', 'update'));

-- On a new progress update: auto-follow the poster and notify the project's other followers.
create or replace function public.notify_on_progress_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into public.subscriptions (user_id, development_id)
    values (new.user_id, new.development_id)
    on conflict (user_id, development_id) do nothing;

    insert into public.notifications (user_id, development_id, actor_id, kind, data)
    select s.user_id, new.development_id, new.user_id, 'update',
           jsonb_build_object('dev_title', d.title)
    from public.subscriptions s
    join public.developments d on d.id = new.development_id
    where s.development_id = new.development_id
      and s.user_id <> new.user_id;
  exception when others then
    null;
  end;
  return new;
end;
$$;
drop trigger if exists trg_notify_on_progress_update on public.development_updates;
create trigger trg_notify_on_progress_update
  after insert on public.development_updates
  for each row execute function public.notify_on_progress_update();
