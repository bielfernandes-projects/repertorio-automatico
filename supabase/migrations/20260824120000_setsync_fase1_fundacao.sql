-- =====================================================
-- SETSYNC — FASE 1: Fundação
-- Migração puramente ADITIVA (ADR 0001): nenhuma coluna
-- ou tabela existente é alterada ou removida, de modo que
-- a camada de sync atual (merge + tombstones) continua
-- funcionando sem saber que estas colunas existem.
--
-- Cobre: BPM e nota de passagem (PLAN.md 2.4 / 4.5),
-- ponto eletrônico do palco (4.2 / ADR 0008), cache de
-- cifra (4.3 / ADR 0009) e link público (4.7).
-- =====================================================

-- -----------------------------------------------------
-- 1. BPM por Música do Catálogo
-- Entrada manual (PLAN.md 4.5). Usado para exibir a
-- transição entre músicas do mesmo Bloco e, no futuro,
-- como fallback do auto-scroll do Modo Solo.
-- -----------------------------------------------------
alter table public.songs add column if not exists bpm integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'songs_bpm_range'
  ) then
    alter table public.songs
      add constraint songs_bpm_range
      check (bpm is null or (bpm > 0 and bpm <= 400));
  end if;
end $$;

-- -----------------------------------------------------
-- 2. Nota de passagem por Item de Bloco
-- Texto livre com o acorde/nota de transição para a
-- próxima música do Bloco. Manual, análogo a `notes`.
-- -----------------------------------------------------
alter table public.block_songs add column if not exists transition_note text;

-- -----------------------------------------------------
-- 3. Ponto Eletrônico Visual (ADR 0008)
-- O ponto atual é estado PERSISTIDO, não efêmero: quem
-- entra atrasado, recarrega a página ou reconecta depois
-- de uma queda de rede lê o valor direto da linha, sem
-- precisar de reconciliação no cliente.
-- `on delete set null` garante que apagar um bloco ou uma
-- música não deixa o ponto apontando para um item morto.
-- -----------------------------------------------------
alter table public.setlists
  add column if not exists current_block_id uuid references public.blocks(id) on delete set null;

alter table public.setlists
  add column if not exists current_item_id uuid references public.block_songs(id) on delete set null;

alter table public.setlists
  add column if not exists current_point_updated_at timestamp with time zone;

-- Replicação em tempo real da linha de setlists. É a ÚNICA
-- tabela publicada: catálogo e setlist seguem em polling
-- (ADR 0002), apenas o ponto atual usa postgres_changes.
do $$
begin
  alter publication supabase_realtime add table public.setlists;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- Editores precisam avançar o ponto atual, mas a policy de
-- UPDATE de setlists é owner-only e assim deve permanecer:
-- alargá-la daria a editores poder sobre nome e exclusão do
-- setlist. Esta função SECURITY DEFINER é a única porta pela
-- qual um editor escreve, e ela só toca nas colunas do ponto.
create or replace function public.set_setlist_current_point(
  setlist_uuid uuid,
  block_uuid uuid,
  item_uuid uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_setlist_editor(setlist_uuid, auth.uid()) then
    raise exception 'sem permissao para controlar o ponto atual deste setlist';
  end if;

  update public.setlists
     set current_block_id = block_uuid,
         current_item_id = item_uuid,
         current_point_updated_at = now()
   where id = setlist_uuid;
end $$;

revoke all on function public.set_setlist_current_point(uuid, uuid, uuid) from public;
grant execute on function public.set_setlist_current_point(uuid, uuid, uuid) to authenticated;

-- -----------------------------------------------------
-- 4. Cache de Cifra (ADR 0009)
-- Compartilhado GLOBALMENTE por música, não por usuário:
-- duas bandas que tocam a mesma música reaproveitam o
-- mesmo fetch, o que reduz o volume de requisições às
-- fontes externas e o risco de bloqueio.
-- Sem TTL: uma vez parseada com sucesso, a cifra vale
-- indefinidamente; só um "atualizar" explícito refaz.
--
-- `lines` guarda o formato estruturado por linha
-- (PLAN.md 4.4): [{ "text": "...", "chords": [{ "position": 0, "chord": "C" }] }]
-- `synced_lyrics` e `duration_seconds` vêm de graça no
-- mesmo fetch da LRCLIB e habilitam o auto-scroll exato
-- do Modo Solo (backlog) sem refazer o cache depois.
-- -----------------------------------------------------
create table if not exists public.cifras_cache (
  id uuid default uuid_generate_v4() primary key,
  artist_slug text not null,
  song_slug text not null,
  source text not null check (source in ('cifraclub', 'lrclib')),
  original_key text,
  lines jsonb not null default '[]'::jsonb,
  synced_lyrics text,
  duration_seconds numeric,
  source_url text,
  fetched_at timestamp with time zone default now() not null,
  unique(artist_slug, song_slug)
);

create index if not exists cifras_cache_lookup
  on public.cifras_cache (artist_slug, song_slug);

alter table public.cifras_cache enable row level security;

-- Leitura liberada para qualquer usuário autenticado: o
-- conteúdo não é de ninguém em particular. A ESCRITA não
-- tem policy alguma de propósito — quem grava é a função
-- serverless com service role, que ignora RLS. Sem policy
-- de insert/update, nenhum cliente consegue envenenar o
-- cache compartilhado.
drop policy if exists "authenticated_select_cifras_cache" on public.cifras_cache;
create policy "authenticated_select_cifras_cache"
  on public.cifras_cache for select
  to authenticated
  using (true);

-- -----------------------------------------------------
-- 5. Link Público (PLAN.md 4.7)
-- Tabela SEPARADA de setlist_share_links (ADR 0006) de
-- propósito: o link de colaborador exige login e gera
-- Membro; este é anônimo, read-only e não gera Membro.
-- Manter as duas separadas evita reabrir a classe de bug
-- de vazamento que motivou a ADR 0006.
--
-- ATENÇÃO: a policy de leitura ANÔNIMA (role `anon`) do
-- setlist NÃO é criada aqui. Ela entra na Fase 6, junto
-- com o caminho de leitura que ela protege, para que a
-- superfície exposta seja desenhada e revisada de uma vez
-- — e não fique aberta durante fases em que nada a usa.
-- -----------------------------------------------------
create table if not exists public.setlist_public_links (
  id uuid default uuid_generate_v4() primary key,
  setlist_id uuid references public.setlists(id) on delete cascade not null,
  short_id text not null unique,
  created_by uuid references public.profiles(id) on delete cascade not null,
  created_at timestamp with time zone default now() not null,
  revoked_at timestamp with time zone
);

-- No máximo um link público ATIVO por setlist; revogados
-- ficam no histórico sem bloquear a criação de um novo.
create unique index if not exists setlist_public_links_one_active
  on public.setlist_public_links (setlist_id)
  where revoked_at is null;

alter table public.setlist_public_links enable row level security;

-- Só o Dono cria, vê e revoga o link público do seu setlist.
drop policy if exists "owner_manage_public_links" on public.setlist_public_links;
create policy "owner_manage_public_links"
  on public.setlist_public_links for all
  to authenticated
  using (public.is_setlist_owner(setlist_id, auth.uid()))
  with check (public.is_setlist_owner(setlist_id, auth.uid()));
