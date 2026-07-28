-- ============================================================================
-- SiteWatch — APPLY ALL PENDING MIGRATIONS (paste this whole file into
-- Supabase → SQL Editor → New query → Run).  Safe to run ONCE, in this order.
--
-- This turns today's staged work LIVE: follow/notify + notification bell,
-- comment moderation, moderator-edit hardening, the OSM queue clear, and the
-- construction Progress diary. (The optional CRON_SECRET import-lock migration
-- is intentionally NOT included.)
--
-- This file is NOT a numbered migration, so Lovable/Supabase won't auto-run it.
-- ============================================================================

-- ==================== 20260725072608_follow_and_notifications ====================

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

-- ==================== 20260725083045_scope_approver_edits ====================

-- Least-privilege for moderators: an approver acting on someone else's development may
-- only change the moderation columns (approval_status / approved_by / approved_at /
-- rejection_reason) — not rewrite its content, move its pin, or swap its images.
--
-- This replaces the enforce_development_moderation() function from
-- 20260723125026_harden_development_moderation.sql, keeping all of its existing behaviour
-- (non-approvers can't touch approval columns; user_id is immutable) and adding the
-- content lock for approvers editing rows they don't own. Owners editing their own rows
-- (whether or not they are approvers) are unaffected.

create or replace function public.enforce_development_moderation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_priv boolean := public.is_approver(auth.uid());
begin
  if tg_op = 'INSERT' then
    if not is_priv then
      new.approval_status := 'pending';
      new.approved_by := null;
      new.approved_at := null;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Ownership is immutable for everyone.
    new.user_id := old.user_id;

    if not is_priv then
      -- Non-approvers can never change moderation columns.
      new.approval_status := old.approval_status;
      new.approved_by := old.approved_by;
      new.approved_at := old.approved_at;
      new.rejection_reason := old.rejection_reason;
    elsif old.user_id is distinct from auth.uid() then
      -- Approver moderating someone else's submission: allow ONLY the moderation
      -- columns to change; freeze all content so they can't silently rewrite it.
      new.title := old.title;
      new.description := old.description;
      new.category := old.category;
      new.status := old.status;
      new.latitude := old.latitude;
      new.longitude := old.longitude;
      new.address := old.address;
      new.area_geojson := old.area_geojson;
      new.images := old.images;
      new.source := old.source;
      new.source_ref := old.source_ref;
    end if;
    return new;
  end if;

  return new;
end;
$$;

-- Trigger already exists from the earlier migration; create-or-replace above is enough.

-- ==================== 20260725083046_clear_pending_osm_queue ====================

-- One-time cleanup: clear the review queue of auto-imported OSM sites that were never
-- reviewed. The importer now only pulls large-scale projects (significance filter added
-- in the OSM import PR), so re-running the import after this will bring back only the
-- notable ones. Approved OSM sites and all user submissions are left untouched.
delete from public.developments
where source = 'osm'
  and approval_status = 'pending';

-- ==================== 20260728094718_development_updates ====================

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

-- ============================================================================
-- VERIFY (optional): each of these should return a row after running the above.
-- ============================================================================
select 'subscriptions table'      as check, to_regclass('public.subscriptions')::text        as found
union all select 'notifications table', to_regclass('public.notifications')::text
union all select 'development_updates table', to_regclass('public.development_updates')::text
union all select 'moderation trigger', tgname::text from pg_trigger where tgname = 'trg_enforce_development_moderation'
union all select 'progress-notify trigger', tgname::text from pg_trigger where tgname = 'trg_notify_on_progress_update';
