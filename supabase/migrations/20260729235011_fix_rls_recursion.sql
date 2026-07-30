-- =====================================================
-- CORREÇÃO: substituir subqueries raw por SECURITY DEFINER
-- nas policies para quebrar ciclo de recursão infinita
-- entre setlists SELECT ↔ setlist_members SELECT
-- =====================================================

-- Helper functions já existem (mesmas). Drop com cascade
-- remove todas as policies que as referenciam.
drop function if exists public.is_setlist_owner(uuid, uuid) cascade;
drop function if exists public.is_setlist_member(uuid, uuid) cascade;
drop function if exists public.is_setlist_editor(uuid, uuid) cascade;
drop function if exists public.has_link_share(uuid) cascade;
drop function if exists public.has_email_invite(uuid, text) cascade;

-- Drop policies que NÃO referenciam helpers (para recriar tudo limpo)
drop policy if exists "users_select_own_profile" on public.profiles;
drop policy if exists "users_select_all_profiles" on public.profiles;
drop policy if exists "users_update_own_profile" on public.profiles;
drop policy if exists "users_insert_own_profile" on public.profiles;
drop policy if exists "users_select_own_songs" on public.songs;
drop policy if exists "songs_select_shared" on public.songs;
drop policy if exists "users_insert_own_songs" on public.songs;
drop policy if exists "users_update_own_songs" on public.songs;
drop policy if exists "users_delete_own_songs" on public.songs;
drop policy if exists "users_insert_own_setlists" on public.setlists;
drop policy if exists "users_update_own_setlists" on public.setlists;
drop policy if exists "users_delete_own_setlists" on public.setlists;
drop policy if exists "users_select_setlist_members" on public.setlist_members;
drop policy if exists "owner_insert_setlist_members" on public.setlist_members;
drop policy if exists "owner_update_setlist_members" on public.setlist_members;
drop policy if exists "owner_delete_setlist_members" on public.setlist_members;
drop policy if exists "users_see_own_invites" on public.setlist_invites;
drop policy if exists "owner_create_invite" on public.setlist_invites;
drop policy if exists "owner_update_invite" on public.setlist_invites;
drop policy if exists "owner_delete_invite" on public.setlist_invites;

-- =====================================================
-- RECRIA HELPER FUNCTIONS (SECURITY DEFINER)
-- =====================================================

create or replace function public.is_setlist_owner(setlist_uuid uuid, user_uuid uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.setlists
    where id = setlist_uuid and user_id = user_uuid
  );
end;
$$ language plpgsql security definer;

create or replace function public.is_setlist_member(setlist_uuid uuid, user_uuid uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.setlist_members
    where setlist_id = setlist_uuid and user_id = user_uuid
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
    where setlist_id = setlist_uuid and invitee_email = '__link_share__'
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
-- RECRIA TODAS AS POLICIES (CORRIGIDAS)
-- =====================================================

-- profiles
create policy "users_select_own_profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "users_select_all_profiles"
  on public.profiles for select
  to authenticated
  using (true);

create policy "users_update_own_profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "users_insert_own_profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- songs
create policy "users_select_own_songs"
  on public.songs for select
  using (auth.uid() = user_id);

create policy "songs_select_shared"
  on public.songs for select
  to authenticated
  using (
    exists (
      select 1 from public.block_songs bs
      join public.blocks b on bs.block_id = b.id
      where bs.song_id = public.songs.id
        and (
          public.is_setlist_owner(b.setlist_id, auth.uid())
          or public.is_setlist_member(b.setlist_id, auth.uid())
        )
    )
  );

create policy "users_insert_own_songs"
  on public.songs for insert
  with check (auth.uid() = user_id);

create policy "users_update_own_songs"
  on public.songs for update
  using (auth.uid() = user_id);

create policy "users_delete_own_songs"
  on public.songs for delete
  using (auth.uid() = user_id);

-- setlists
create policy "users_select_setlists"
  on public.setlists for select
  using (
    auth.uid() = user_id
    or public.is_setlist_member(id, auth.uid())
    or public.has_link_share(id)
  );

create policy "users_insert_own_setlists"
  on public.setlists for insert
  with check (auth.uid() = user_id);

create policy "users_update_own_setlists"
  on public.setlists for update
  using (auth.uid() = user_id);

create policy "users_delete_own_setlists"
  on public.setlists for delete
  using (auth.uid() = user_id);

-- blocks
create policy "users_select_blocks"
  on public.blocks for select
  using (
    public.is_setlist_owner(setlist_id, auth.uid())
    or public.is_setlist_member(setlist_id, auth.uid())
    or public.has_link_share(setlist_id)
  );

create policy "users_insert_blocks"
  on public.blocks for insert
  with check (
    public.is_setlist_editor(setlist_id, auth.uid())
  );

create policy "users_update_blocks"
  on public.blocks for update
  using (
    public.is_setlist_editor(setlist_id, auth.uid())
  );

create policy "users_delete_blocks"
  on public.blocks for delete
  using (
    public.is_setlist_editor(setlist_id, auth.uid())
  );

-- block_songs
create policy "users_select_block_songs"
  on public.block_songs for select
  using (
    exists (
      select 1 from public.blocks b
      where b.id = block_id
        and (
          public.is_setlist_owner(b.setlist_id, auth.uid())
          or public.is_setlist_member(b.setlist_id, auth.uid())
          or public.has_link_share(b.setlist_id)
        )
    )
  );

create policy "users_insert_block_songs"
  on public.block_songs for insert
  with check (
    public.is_setlist_editor(
      (select setlist_id from public.blocks where id = block_id),
      auth.uid()
    )
  );

create policy "users_update_block_songs"
  on public.block_songs for update
  using (
    public.is_setlist_editor(
      (select setlist_id from public.blocks where id = block_id),
      auth.uid()
    )
  );

create policy "users_delete_block_songs"
  on public.block_songs for delete
  using (
    public.is_setlist_editor(
      (select setlist_id from public.blocks where id = block_id),
      auth.uid()
    )
  );

-- setlist_members
create policy "users_select_setlist_members"
  on public.setlist_members for select
  using (
    user_id = auth.uid()
    or public.is_setlist_owner(setlist_id, auth.uid())
  );

create policy "owner_insert_setlist_members"
  on public.setlist_members for insert
  with check (
    public.is_setlist_owner(setlist_id, auth.uid())
    or user_id = auth.uid()
  );

create policy "owner_update_setlist_members"
  on public.setlist_members for update
  using (
    public.is_setlist_owner(setlist_id, auth.uid())
  );

create policy "owner_delete_setlist_members"
  on public.setlist_members for delete
  using (
    public.is_setlist_owner(setlist_id, auth.uid())
  );

-- setlist_invites
create policy "users_see_own_invites"
  on public.setlist_invites for select
  using (
    inviter_id = auth.uid()
    or invitee_email = auth.email()
    or (invitee_email = '__link_share__' and (
      public.is_setlist_owner(setlist_id, auth.uid())
      or public.is_setlist_member(setlist_id, auth.uid())
    ))
  );

create policy "owner_create_invite"
  on public.setlist_invites for insert
  with check (
    public.is_setlist_owner(setlist_id, auth.uid())
  );

create policy "owner_update_invite"
  on public.setlist_invites for update
  using (
    public.is_setlist_owner(setlist_id, auth.uid())
  );

create policy "owner_delete_invite"
  on public.setlist_invites for delete
  using (
    public.is_setlist_owner(setlist_id, auth.uid())
  );
