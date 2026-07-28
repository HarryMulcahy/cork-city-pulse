-- Building specs for the data/ranking crowd: height, floors, architect, developer, year.
-- All optional. Owners edit them via the normal development UPDATE path.

alter table public.developments
  add column if not exists height_m numeric,
  add column if not exists floor_count integer,
  add column if not exists architect text,
  add column if not exists developer text,
  add column if not exists completion_year integer;

-- Extend the moderator content-freeze (from scope_approver_edits) so an approver editing
-- someone else's row can't silently change the new spec columns either.
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
    new.user_id := old.user_id;
    if not is_priv then
      new.approval_status := old.approval_status;
      new.approved_by := old.approved_by;
      new.approved_at := old.approved_at;
      new.rejection_reason := old.rejection_reason;
    elsif old.user_id is distinct from auth.uid() then
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
      new.height_m := old.height_m;
      new.floor_count := old.floor_count;
      new.architect := old.architect;
      new.developer := old.developer;
      new.completion_year := old.completion_year;
    end if;
    return new;
  end if;

  return new;
end;
$$;
