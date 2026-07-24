-- Harden development moderation so the approval workflow cannot be bypassed.
--
-- Context: the Supabase anon (publishable) key is public, so RLS + triggers are the
-- only server-side protection. The original policies only constrain `user_id` and never
-- constrain approval_status / approved_by / approved_at, which allowed any authenticated
-- user to either
--   (1) INSERT a row with approval_status = 'approved' (publishing instantly), or
--   (2) UPDATE their own pending row to 'approved' (self-approval),
-- fully bypassing moderation. It also allowed approvers to reassign a development's
-- user_id to another account (attribution hijack).
--
-- RLS WITH CHECK cannot compare the NEW row against the OLD row, so column-level rules
-- are enforced with a BEFORE INSERT/UPDATE trigger instead. Note: triggers also run for
-- the service-role OSM importer, which already inserts rows as 'pending', so its
-- behaviour is unchanged.

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
    -- Non-approvers may only create pending, unapproved rows.
    if not is_priv then
      new.approval_status := 'pending';
      new.approved_by := null;
      new.approved_at := null;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Ownership is immutable for everyone (blocks reassignment / attribution hijack).
    new.user_id := old.user_id;
    -- Only approvers may change moderation columns; everyone else keeps the old values,
    -- so an owner editing title/description/etc. cannot flip their own approval state.
    if not is_priv then
      new.approval_status := old.approval_status;
      new.approved_by := old.approved_by;
      new.approved_at := old.approved_at;
      new.rejection_reason := old.rejection_reason;
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_development_moderation on public.developments;
create trigger trg_enforce_development_moderation
  before insert or update on public.developments
  for each row
  execute function public.enforce_development_moderation();
