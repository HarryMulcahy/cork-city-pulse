-- Allow approvers (admin / city_mod / developer) to delete ANY comment so moderators
-- can remove spam or abuse. Comment owners can already update + delete their own comments
-- via the policies in the initial schema migration; this adds moderator removal on top.
create policy "Approvers can delete any comment"
  on public.comments for delete
  using (public.is_approver(auth.uid()));
