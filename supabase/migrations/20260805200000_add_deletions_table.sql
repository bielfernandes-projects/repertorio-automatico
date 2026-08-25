-- =====================================================
-- TOMBSTONES / DELETIONS TABLE
-- Substitui a estratégia de "delete por ausência" por
-- tombstones explícitos. Uma exclusão só é aplicada ao
-- banco se existir um tombstone correspondente, evitando
-- que cópias locais desatualizadas apaguem dados remotos
-- e impedindo a ressurreição de itens excluídos no merge.
-- =====================================================

create table if not exists public.deletions (
  id uuid default gen_random_uuid() primary key,
  entity_type text not null check (entity_type in ('song', 'setlist', 'block', 'block_song')),
  entity_key text not null,
  deleted_by uuid references public.profiles(id) on delete cascade not null,
  setlist_id uuid references public.setlists(id) on delete cascade,
  created_at timestamp with time zone default now() not null,
  unique(entity_type, entity_key)
);

alter table public.deletions enable row level security;

drop policy if exists "users_select_deletions" on public.deletions;
drop policy if exists "users_insert_deletions" on public.deletions;
drop policy if exists "users_update_deletions" on public.deletions;
drop policy if exists "users_delete_deletions" on public.deletions;

-- SELECT: o próprio autor da exclusão, ou (para tombstones de
-- bloco / música-de-bloco) qualquer dono ou membro do setlist
-- relacionado. Tombstones de setlist e música não carregam
-- setlist_id e ficam visíveis apenas para quem os criou.
create policy "users_select_deletions"
  on public.deletions for select
  using (
    deleted_by = auth.uid()
    or (
      setlist_id is not null
      and (
        public.is_setlist_owner(setlist_id, auth.uid())
        or public.is_setlist_member(setlist_id, auth.uid())
      )
    )
  );

-- INSERT: só o próprio usuário grava tombstones; para blocos e
-- músicas de bloco precisa ser owner/editor do setlist.
create policy "users_insert_deletions"
  on public.deletions for insert
  with check (
    deleted_by = auth.uid()
    and (
      setlist_id is null
      or public.is_setlist_editor(setlist_id, auth.uid())
    )
  );

-- UPDATE: re-upsert do mesmo tombstone pelo autor; o dono do
-- setlist também pode atualizar tombstones de membros.
create policy "users_update_deletions"
  on public.deletions for update
  using (
    deleted_by = auth.uid()
    or (
      setlist_id is not null
      and public.is_setlist_owner(setlist_id, auth.uid())
    )
  );

-- DELETE (undo): o autor pode remover o próprio tombstone; o dono
-- do setlist pode remover tombstones de membros para restaurar itens.
create policy "users_delete_deletions"
  on public.deletions for delete
  using (
    deleted_by = auth.uid()
    or (
      setlist_id is not null
      and public.is_setlist_owner(setlist_id, auth.uid())
    )
  );
