-- profiles table: maps auth.users → role_key
create table if not exists public.profiles (
  id         uuid references auth.users(id) on delete cascade primary key,
  email      text,
  role_key   text not null default 'meghan',
  created_at timestamptz default now()
);

-- RLS
alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create profile on sign-up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, role_key)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'role_key', 'meghan')
  );
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- SEED: Run this after creating users in the Supabase dashboard
-- Authentication > Users > Add User (email/password)
-- Emails: meghan@erpindustrials.com, william@erpindustrials.com,
--         brennan@erpindustrials.com, michele@erpindustrials.com,
--         liz@erpindustrials.com, hannah@erpindustrials.com,
--         sylvia@erpindustrials.com
--
-- After creating users, update their role_key:
-- ============================================================

-- update public.profiles set role_key = 'meghan'  where email = 'meghan@erpindustrials.com';
-- update public.profiles set role_key = 'william'  where email = 'william@erpindustrials.com';
-- update public.profiles set role_key = 'brennan'  where email = 'brennan@erpindustrials.com';
-- update public.profiles set role_key = 'michele'  where email = 'michele@erpindustrials.com';
-- update public.profiles set role_key = 'liz'      where email = 'liz@erpindustrials.com';
-- update public.profiles set role_key = 'hannah'   where email = 'hannah@erpindustrials.com';
-- update public.profiles set role_key = 'sylvia'   where email = 'sylvia@erpindustrials.com';
