-- Threaded + upvotable comments.

-- Reply threading: a comment can point at a parent comment.
alter table public.comments add column if not exists parent_id uuid references public.comments(id) on delete cascade;
create index if not exists comments_parent_idx on public.comments (parent_id);

-- Upvotes: one per (comment, user).
create table if not exists public.comment_votes (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (comment_id, user_id)
);
alter table public.comment_votes enable row level security;

drop policy if exists "Comment votes are viewable by everyone" on public.comment_votes;
create policy "Comment votes are viewable by everyone" on public.comment_votes for select using (true);
drop policy if exists "Users can upvote (insert own)" on public.comment_votes;
create policy "Users can upvote (insert own)" on public.comment_votes for insert with check (auth.uid() = user_id);
drop policy if exists "Users can remove their own upvote" on public.comment_votes;
create policy "Users can remove their own upvote" on public.comment_votes for delete using (auth.uid() = user_id);

create index if not exists comment_votes_comment_idx on public.comment_votes (comment_id);
