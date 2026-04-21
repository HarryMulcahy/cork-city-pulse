
-- Profiles table
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone" on public.profiles for select using (true);
create policy "Users can insert their own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update their own profile" on public.profiles for update using (auth.uid() = id);

-- Auto-create profile trigger
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Developments table
create type public.dev_category as enum ('residential', 'commercial', 'infrastructure', 'public_space', 'mixed_use', 'other');
create type public.dev_status as enum ('proposed', 'planning', 'approved', 'under_construction', 'completed', 'rejected');

create table public.developments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null,
  category public.dev_category not null default 'other',
  status public.dev_status not null default 'proposed',
  latitude double precision not null,
  longitude double precision not null,
  address text,
  created_at timestamptz not null default now()
);

alter table public.developments enable row level security;

create policy "Developments viewable by everyone" on public.developments for select using (true);
create policy "Authenticated users can create developments" on public.developments for insert with check (auth.uid() = user_id);
create policy "Users can update their own developments" on public.developments for update using (auth.uid() = user_id);
create policy "Users can delete their own developments" on public.developments for delete using (auth.uid() = user_id);

create index developments_created_at_idx on public.developments (created_at desc);

-- Comments table
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  development_id uuid not null references public.developments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.comments enable row level security;

create policy "Comments viewable by everyone" on public.comments for select using (true);
create policy "Authenticated users can create comments" on public.comments for insert with check (auth.uid() = user_id);
create policy "Users can update their own comments" on public.comments for update using (auth.uid() = user_id);
create policy "Users can delete their own comments" on public.comments for delete using (auth.uid() = user_id);

create index comments_dev_idx on public.comments (development_id, created_at desc);
