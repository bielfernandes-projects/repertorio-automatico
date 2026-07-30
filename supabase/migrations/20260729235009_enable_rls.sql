-- =====================================================
-- HELPER FUNCTIONS (SECURITY DEFINER — bypass RLS)
-- =====================================================

drop function if exists public.is_setlist_owner(uuid, uuid) cascade;
drop function if exists public.is_setlist_member(uuid, uuid) cascade;
drop function if exists public.is_setlist_editor(uuid, uuid) cascade;
drop function if exists public.has_link_share(uuid) cascade;
drop function if exists public.has_email_invite(uuid, text) cascade;

create or replace function public.is_setlist_owner(setlist_uuid uuid, user_uuid uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.setlists
    where id = setlist_uuid
    and user_id = user_uuid
  );
end;
$$ language plpgsql security definer;

create or replace function public.is_setlist_member(setlist_uuid uuid, user_uuid uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.setlist_members
    where setlist_id = setlist_uuid
    and user_id = user_uuid
  );
end;
$$ language plpgsql security definer;

create or replace function public.is_setlist_editor(setlist_uuid uuid, user_uuid uuid)
returns boolean as $$
begin
  if exists (select 1 from public.setlists where id = setlist_uuid and user_id = user_uuid) then
    return true;
  end if;
  return exists (
    select 1 from public.setlist_members
    where setlist_id = setlist_uuid
    and user_id = user_uuid
    and role in ('owner', 'editor')
  );
end;
$$ language plpgsql security definer;

create or replace function public.has_link_share(setlist_uuid uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.setlist_invites
    where setlist_id = setlist_uuid
    and invitee_email = '__link_share__'
  );
end;
$$ language plpgsql security definer;

create or replace function public.has_email_invite(setlist_uuid uuid, user_email text)
returns boolean as $$
begin
  if user_email is null or user_email = '' then
    return false;
  end if;
  return exists (
    select 1 from public.setlist_invites
    where setlist_id = setlist_uuid
    and lower(invitee_email) = lower(user_email)
  );
end;
$$ language plpgsql security definer;

-- =====================================================
-- ATIVAR RLS EM TODAS AS TABELAS
-- =====================================================

alter table public.profiles enable row level security;
alter table public.songs enable row level security;
alter table public.setlists enable row level security;
alter table public.blocks enable row level security;
alter table public.block_songs enable row level security;
alter table public.setlist_members enable row level security;
alter table public.setlist_invites enable row level security;

-- =====================================================
-- POLÍTICAS: profiles
-- =====================================================

drop policy if exists "users_select_own_profile" on public.profiles;
create policy "users_select_own_profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "users_select_all_profiles" on public.profiles;
create policy "users_select_all_profiles"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "users_update_own_profile" on public.profiles;
create policy "users_update_own_profile"
  on public.profiles for update
  using (auth.uid() = id);

drop policy if exists "users_insert_own_profile" on public.profiles;
create policy "users_insert_own_profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- =====================================================
-- POLÍTICAS: songs (catálogo)
-- =====================================================

drop policy if exists "users_select_own_songs" on public.songs;
create policy "users_select_own_songs"
  on public.songs for select
  using (auth.uid() = user_id);

drop policy if exists "songs_select_shared" on public.songs;
create policy "songs_select_shared"
  on public.songs for select
  to authenticated
  using (
    exists (
      select 1 from public.block_songs bs
      join public.blocks b on bs.block_id = b.id
      join public.setlists s on b.setlist_id = s.id
      join public.setlist_members sm on sm.setlist_id = s.id and sm.user_id = auth.uid()
      where bs.song_id = public.songs.id
    )
  );

drop policy if exists "users_insert_own_songs" on public.songs;
create policy "users_insert_own_songs"
  on public.songs for insert
  with check (auth.uid() = user_id);

drop policy if exists "users_update_own_songs" on public.songs;
create policy "users_update_own_songs"
  on public.songs for update
  using (auth.uid() = user_id);

drop policy if exists "users_delete_own_songs" on public.songs;
create policy "users_delete_own_songs"
  on public.songs for delete
  using (auth.uid() = user_id);

-- =====================================================
-- POLÍTICAS: setlists
-- =====================================================

drop policy if exists "users_select_setlists" on public.setlists;
create policy "users_select_setlists"
  on public.setlists for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.setlist_members sm
      where sm.setlist_id = id
        and sm.user_id = auth.uid()
    )
    or public.has_link_share(id)
  );

drop policy if exists "users_insert_own_setlists" on public.setlists;
create policy "users_insert_own_setlists"
  on public.setlists for insert
  with check (auth.uid() = user_id);

drop policy if exists "users_update_own_setlists" on public.setlists;
create policy "users_update_own_setlists"
  on public.setlists for update
  using (auth.uid() = user_id);

drop policy if exists "users_delete_own_setlists" on public.setlists;
create policy "users_delete_own_setlists"
  on public.setlists for delete
  using (auth.uid() = user_id);

-- =====================================================
-- POLÍTICAS: blocks
-- =====================================================

drop policy if exists "users_select_blocks" on public.blocks;
create policy "users_select_blocks"
  on public.blocks for select
  using (
    exists (
      select 1 from public.setlists s
      where s.id = setlist_id
        and (
          s.user_id = auth.uid()
          or exists (
            select 1 from public.setlist_members sm
            where sm.setlist_id = s.id and sm.user_id = auth.uid()
          )
          or public.has_link_share(s.id)
        )
    )
  );

drop policy if exists "users_insert_blocks" on public.blocks;
create policy "users_insert_blocks"
  on public.blocks for insert
  with check (
    exists (
      select 1 from public.setlists s
      where s.id = setlist_id
        and public.is_setlist_editor(setlist_id, auth.uid())
    )
  );

drop policy if exists "users_update_blocks" on public.blocks;
create policy "users_update_blocks"
  on public.blocks for update
  using (
    exists (
      select 1 from public.setlists s
      where s.id = setlist_id
        and public.is_setlist_editor(setlist_id, auth.uid())
    )
  );

drop policy if exists "users_delete_blocks" on public.blocks;
create policy "users_delete_blocks"
  on public.blocks for delete
  using (
    exists (
      select 1 from public.setlists s
      where s.id = setlist_id
        and public.is_setlist_editor(setlist_id, auth.uid())
    )
  );

-- =====================================================
-- POLÍTICAS: block_songs
-- =====================================================

drop policy if exists "users_select_block_songs" on public.block_songs;
create policy "users_select_block_songs"
  on public.block_songs for select
  using (
    exists (
      select 1 from public.blocks b
      join public.setlists s on b.setlist_id = s.id
      where b.id = block_id
        and (
          s.user_id = auth.uid()
          or exists (
            select 1 from public.setlist_members sm
            where sm.setlist_id = s.id and sm.user_id = auth.uid()
          )
          or public.has_link_share(s.id)
        )
    )
  );

drop policy if exists "users_insert_block_songs" on public.block_songs;
create policy "users_insert_block_songs"
  on public.block_songs for insert
  with check (
    exists (
      select 1 from public.blocks b
      join public.setlists s on b.setlist_id = s.id
      where b.id = block_id
        and public.is_setlist_editor(s.id, auth.uid())
    )
  );

drop policy if exists "users_update_block_songs" on public.block_songs;
create policy "users_update_block_songs"
  on public.block_songs for update
  using (
    exists (
      select 1 from public.blocks b
      join public.setlists s on b.setlist_id = s.id
      where b.id = block_id
        and public.is_setlist_editor(s.id, auth.uid())
    )
  );

drop policy if exists "users_delete_block_songs" on public.block_songs;
create policy "users_delete_block_songs"
  on public.block_songs for delete
  using (
    exists (
      select 1 from public.blocks b
      join public.setlists s on b.setlist_id = s.id
      where b.id = block_id
        and public.is_setlist_editor(s.id, auth.uid())
    )
  );

-- =====================================================
-- POLÍTICAS: setlist_members
-- =====================================================

drop policy if exists "users_select_setlist_members" on public.setlist_members;
create policy "users_select_setlist_members"
  on public.setlist_members for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.setlists s
      where s.id = setlist_id and s.user_id = auth.uid()
    )
  );

drop policy if exists "owner_insert_setlist_members" on public.setlist_members;
create policy "owner_insert_setlist_members"
  on public.setlist_members for insert
  with check (
    exists (
      select 1 from public.setlists s
      where s.id = setlist_id and s.user_id = auth.uid()
    )
    or user_id = auth.uid()
  );

drop policy if exists "owner_update_setlist_members" on public.setlist_members;
create policy "owner_update_setlist_members"
  on public.setlist_members for update
  using (
    exists (
      select 1 from public.setlists s
      where s.id = setlist_id and s.user_id = auth.uid()
    )
  );

drop policy if exists "owner_delete_setlist_members" on public.setlist_members;
create policy "owner_delete_setlist_members"
  on public.setlist_members for delete
  using (
    exists (
      select 1 from public.setlists s
      where s.id = setlist_id and s.user_id = auth.uid()
    )
  );

-- =====================================================
-- POLÍTICAS: setlist_invites
-- =====================================================

drop policy if exists "users_see_own_invites" on public.setlist_invites;
create policy "users_see_own_invites"
  on public.setlist_invites for select
  using (
    inviter_id = auth.uid()
    or invitee_email = auth.email()
    or (invitee_email = '__link_share__' and exists (
      select 1 from public.setlists s
      where s.id = setlist_id and (
        s.user_id = auth.uid()
        or exists (
          select 1 from public.setlist_members sm
          where sm.setlist_id = s.id and sm.user_id = auth.uid()
        )
      )
    ))
  );

drop policy if exists "owner_create_invite" on public.setlist_invites;
create policy "owner_create_invite"
  on public.setlist_invites for insert
  with check (
    exists (
      select 1 from public.setlists s
      where s.id = setlist_id and s.user_id = auth.uid()
    )
  );

drop policy if exists "owner_update_invite" on public.setlist_invites;
create policy "owner_update_invite"
  on public.setlist_invites for update
  using (
    exists (
      select 1 from public.setlists s
      where s.id = setlist_id and s.user_id = auth.uid()
    )
  );

drop policy if exists "owner_delete_invite" on public.setlist_invites;
create policy "owner_delete_invite"
  on public.setlist_invites for delete
  using (
    exists (
      select 1 from public.setlists s
      where s.id = setlist_id and s.user_id = auth.uid()
    )
  );

-- =====================================================
-- TRIGGER: auto-criar profile ao criar usuário
-- =====================================================

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
