# Correções de RLS e Colaboração no Supabase (Ajuste Final)

Identificamos por que os recursos de colaboração (Bugs 1, 2 e 3) não estavam refletindo e lançavam erros 403 no console.

### Análise dos Erros 403 Encontrados:
1. **`setlist_members` (403 Forbidden)**: Ao entrar pelo link, o convidado (Destino) executa `selfJoinSetlistAsMember` para se registrar. Porém, a política antiga no banco só permitia que o **dono** (Owner) fizesse alterações nesta tabela, gerando erro 403 ao convidado tentar se auto-inserir.
2. **`songs` (403 Forbidden)**: Sincronizações da nuvem tentavam fazer `upsert` em lote de todas as músicas dos blocos (inclusive as do Dono). O Supabase barrou essas escritas porque a política RLS padrão de `songs` só permite edições pelo proprietário da música.

---

### Soluções Implementadas no Código:
* **Filtro de Propriedade de Músicas (`isMySong`)**: Atualizamos `syncLocalDataToSupabase` e `syncMemberEditsToSupabase` para buscar a música correspondente na coleção local antes do envio. Agora, o aplicativo **só faz upsert de músicas que pertencem ao usuário logado**. Músicas de terceiros nos setlists compartilhados são preservadas sem acionar escritas redundantes, eliminando os erros 403.

---

### 🛠️ Nova Migration SQL para o Supabase SQL Editor
Para corrigir as permissões de leitura/escrita dos membros no banco, você precisa rodar este novo script SQL no **SQL Editor** do seu Supabase Dashboard. Ele substitui as políticas antigas e libera os acessos de forma segura:

```sql
-- ================================================================
-- MIGRATION: Corrigir RLS para Colaboração (Membros, Convites e Músicas)
-- Execute no SQL Editor do Supabase para corrigir os erros 403
-- ================================================================

-- --- 1. AJUSTE DE RLS PARA MÚSICAS (songs) ---
drop policy if exists "Users can view own songs" on public.songs;

-- Permitir leitura da música se for sua OU se ela fizer parte de um setlist que você é membro
create policy "Users can view own songs or songs in shared setlists"
  on public.songs for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.block_songs bs
      join public.blocks b on b.id = bs.block_id
      join public.setlists s on s.id = b.setlist_id
      join public.setlist_members sm on sm.setlist_id = s.id
      where bs.song_id = songs.id
      and sm.user_id = auth.uid()
    )
  );

-- --- 2. AJUSTE DE RLS PARA MEMBROS (setlist_members) ---
drop policy if exists "Members can view setlist members" on public.setlist_members;
drop policy if exists "Owners can manage setlist members" on public.setlist_members;

-- A. Permitir leitura se você for membro ou se o link-share estiver ativo
create policy "Members can view setlist members"
  on public.setlist_members for select
  using (
    exists (
      select 1 from public.setlist_members sm
      where sm.setlist_id = setlist_members.setlist_id
      and sm.user_id = auth.uid()
    )
    or exists (
      select 1 from public.setlist_invites
      where setlist_id = setlist_members.setlist_id
      and invitee_email = '__link_share__'
    )
  );

-- B. Permitir inserção de membros (Dono convidando OU convidado entrando via link/email)
create policy "Anyone can insert setlist members if owner or invited"
  on public.setlist_members for insert
  with check (
    exists (
      select 1 from public.setlists s
      where s.id = setlist_members.setlist_id
      and s.user_id = auth.uid()
    )
    or (
      auth.uid() = user_id
      and (
        exists (
          select 1 from public.setlist_invites i
          where i.setlist_id = setlist_members.setlist_id
          and i.invitee_email = '__link_share__'
        )
        or exists (
          select 1 from public.setlist_invites i
          where i.setlist_id = setlist_members.setlist_id
          and lower(i.invitee_email) = lower(auth.jwt() ->> 'email')
        )
      )
    )
  );

-- C. Permitir atualizar/deletar se for o Dono do setlist OU se o membro estiver se removendo
create policy "Owners can update/delete members, or members can leave"
  on public.setlist_members for all
  using (
    exists (
      select 1 from public.setlists s
      where s.id = setlist_members.setlist_id
      and s.user_id = auth.uid()
    )
    or auth.uid() = user_id
  );

-- --- 3. AJUSTE DE RLS PARA CONVITES (setlist_invites) ---
drop policy if exists "Inviters can view own invites" on public.setlist_invites;

-- Permitir ver convite se você o criou, se é o dono do setlist ou se você é o convidado (por email ou link_share)
create policy "Anyone can view invites they are involved in"
  on public.setlist_invites for select
  using (
    inviter_id = auth.uid()
    or invitee_email = '__link_share__'
    or lower(invitee_email) = lower(auth.jwt() ->> 'email')
    or exists (
      select 1 from public.setlist_members sm
      where sm.setlist_id = setlist_invites.setlist_id
      and sm.user_id = auth.uid()
      and sm.role = 'owner'
    )
  );

-- --- 4. AJUSTE DE RLS PARA VISUALIZAR SETLISTS/BLOCOS (setlists, blocks, block_songs) ---
drop policy if exists "Users can view own setlists" on public.setlists;
drop policy if exists "Members can view blocks" on public.blocks;
drop policy if exists "Members can view block songs" on public.block_songs;

-- Permitir ver setlist se for dono, se for membro ou se tiver link ativo/convite
create policy "Users can view own setlists or shared/invited setlists"
  on public.setlists for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.setlist_members sm
      where sm.setlist_id = setlists.id
      and sm.user_id = auth.uid()
    )
    or exists (
      select 1 from public.setlist_invites i
      where i.setlist_id = setlists.id
      and (
        i.invitee_email = '__link_share__'
        or lower(i.invitee_email) = lower(auth.jwt() ->> 'email')
      )
    )
  );

-- Permitir ver blocos se for membro ou convidado por link/email
create policy "Members or invited guests can view blocks"
  on public.blocks for select
  using (
    exists (
      select 1 from public.setlist_members sm
      where sm.setlist_id = blocks.setlist_id
      and sm.user_id = auth.uid()
    )
    or exists (
      select 1 from public.setlist_invites i
      where i.setlist_id = blocks.setlist_id
      and (
        i.invitee_email = '__link_share__'
        or lower(i.invitee_email) = lower(auth.jwt() ->> 'email')
      )
    )
  );

-- Permitir ver músicas dos blocos se for membro ou convidado por link/email
create policy "Members or invited guests can view block songs"
  on public.block_songs for select
  using (
    exists (
      select 1 from public.blocks b
      join public.setlist_members sm on sm.setlist_id = b.setlist_id
      where b.id = block_songs.block_id
      and sm.user_id = auth.uid()
    )
    or exists (
      select 1 from public.blocks b
      join public.setlist_invites i on i.setlist_id = b.setlist_id
      where b.id = block_songs.block_id
      and (
        i.invitee_email = '__link_share__'
        or lower(i.invitee_email) = lower(auth.jwt() ->> 'email')
      )
    )
  );
```,Description:
