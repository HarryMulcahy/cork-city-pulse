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
