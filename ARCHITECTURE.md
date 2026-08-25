# Arquitetura — Repertório Automático

Documento complementar a `CONTEXT.md`. Contém decisões técnicas, schema de banco, escolhas de stack e estrutura do projeto. O `CONTEXT.md` deve permanecer livre de detalhes implementativos.

> **Escopo de palco (SetSync)**: ver `PLAN.md` para as features de palco (ponto eletrônico, render nativo de cifra, Modo Performance, link público) e a separação MVP/Backlog. As ADRs 0008 e 0009 estreitam duas decisões deste documento; os pontos afetados estão marcados abaixo.

---

## 1. Stack Técnica

| Camada | Tecnologia |
|---|---|
| Core Framework | React 19 + TypeScript + Vite 6 |
| Roteamento | React Router v7 (`createBrowserRouter`) |
| Estado async / cache | TanStack Query v5 (polling 5-10s no setlist aberto) |
| Estado UI volátil | Zustand (modais, toasts, flags de UI) |
| Banco de Dados, Auth, Storage | Supabase (PostgreSQL + Auth + Storage; Realtime **apenas** para o ponto atual do palco — ADR 0008) |
| Estilização | Tailwind CSS v4 |
| Ícones | Lucide React (3 tokens de tamanho: `w-4 h-4` inline, `w-5 h-5` botões, `w-6 h-6` headers/cards) |
| Animações | Motion (Framer Motion) |
| i18n | i18next + react-i18next — skeleton PT/EN desde dia 1 |
| Pagamentos | Stripe BRL (Pin & Card, BRL/USD/EUR multi-moeda-ready) |
| Métricas | Vercel Analytics |
| Monitoramento de erros | Sentry (ou equivalente) — obrigatório dado o framing mission-critical |
| Ingestão de cifra/letra | Vercel Serverless Function (runtime Node) + axios/cheerio — ADR 0009 |

### Decisões técnicas confirmadas

- **Auth gate** via `supabase.auth.onAuthStateChange` — Sessão JWT é source of truth; mounts restaurados por `getSession()`; `SIGNED_OUT` / refresh falhou → desloga + limpa `localStorage`.
- **Offline-first local-truth** — `localStorage` é truth local, Supabase espelha. Tombstones, merge bidirecional, `RevisionCache`, `toUUID` mantidos (porter literal de `src/lib/sync/`, `merge.ts`, `revision-cache.ts`, `ids.ts`).
- **Colaboração ao vivo = Polling curto (5-10s)** + re-fetch em `visibilitychange` (tab focus) para catálogo e setlist. SLA: atualiza em segundos. **Exceção (ADR 0008)**: o ponto atual do palco (`current_block_id` / `current_item_id` em `setlists`) usa `postgres_changes` para sincronizar em ~100-300ms.
- **Cifra URL: Override always wins** — `slugOverride` é estado de verdade quando preenchido. Editar Nome/Artista não re-deriva a URL. Badge discreta "URL manual". Continua valendo: o slug agora endereça o fetch do scraper e a chave do `cifras_cache`, não mais um iframe.
- **Cifra renderizada nativamente (ADR 0009)** — scraper próprio (Cifra Club) com fallback de letra (LRCLIB, sem API key), parseada para `{ text, chords: [{ position, chord }] }` e cacheada globalmente por música em `cifras_cache`, sem TTL. Substitui o `CifraWebviewModal`.
- **Ícones: Lucide direto**, sem wrapper de abstração, sem Phosphor híbrido.
- **i18n skeleton: PT preenchido / EN com chaves `TODO`** — `i18next` configurado desde o primeiro commit; switch de idioma visível no perfil.

---

## 2. Estrutura de Pastas

```
src/
  features/
    catalog/        # acervo + upload de Documents + slug override
      ui/           # CatalogView, SongRow, SongFormModal, SongDocumentsModal
      model/        # validação "5 docs / 100MB", fingerprint de Documents
      api/          # songRepository (chama buildSyncPlan)
    setlist/        # setlists + blocos + itens + DnD
      ui/
      model/        # theme badge colors, drift calc, requestedKey validation
      api/          # setlistRepository, blockRepository
    share/          # Link de Acesso (gerar, revogar, aceitar via modal)
      ui/
      api/
    auth/           # AuthModal, gate, session hydration
      ui/
    billing/        # premium: UpgradeModal, PlanBadge, Stripe checkout
      ui/
      api/           # planLimits, stripeWebhookClient
      model/          # PLAN_LIMITS, trial enforcement
    cifra/          # slug extract + semitone shift + parser + render nativo (letra/cifra)
      model/
      ui/
    admin/          # /admin panel (users, payments, revoke premium)
      ui/
  app/              # AppShell, routing config, providers (QueryClient, ThemeProvider, I18nProvider), ErrorBoundary
  shared/           # Modal, Toast, OfflineBanner, BottomNav, Header — UI sem casa
  lib/              # sync (plan + adapters), merge, revision-cache, ids (porter literal)
  types.ts          # raiz do domínio: tipos ubíquos canonizados
```

### Princípios

- Cada feature tem `ui/`, `model/`, `api/`. `api/` é o único autorizado a tocar a camada de `lib/` (deep-module).
- Componentes com >400 linhas são split candidates automáticos. Perfis históricos que ultrapassaram isso (CatalogView, SetlistDetail, FocusedBlockView, ProfileView) já nascem decompostos.
- `shared/` não vira lixo: nenhum componente entra aqui sem ter pelo menos 2 consumidores. Se só um usa, fica na própria feature.

---

## 3. Schema do Banco de Dados (Supabase / PostgreSQL)

### Tabelas essenciais (resumo — ver `supabase/migrations/`)

| Tabela | Propósito | Notas |
|---|---|---|
| `profiles` | Músico | + `plan text default 'free'`, `premium_trial_ends_at timestamptz`, `display_name`, `email`, trigger `on_auth_user_created` com `now() + interval '7 days'` para Trial |
| `songs` | Música do Catálogo | + `updated_at timestamptz default now()` com trigger `touch_updated_at`; `documents jsonb` guarda **só metadados** (id, name, type, size, storage_path), nunca o blob |
| `setlists` | Setlist | `updated_at` já existe. `unique(user_id, name)` |
| `blocks` | Bloco | + `updated_at timestamptz default now()` + trigger |
| `block_songs` | Item de Bloco | + `updated_at timestamptz default now()` + trigger. `unique(block_id, song_id)` |
| `setlist_members` | Membro | `role text check (role in ('owner','editor','viewer'))` |
| `setlist_share_links` | Link de Acesso | NOVO. `id`, `setlist_id`, `role text check (role in ('editor','viewer'))`, `created_at`, `revoked_at`. Substitui `setlist_invites` e a sentinela `__link_share__` |
| `deletions` | Tombstone | Portada da migration atual. RLS para visibility |
| `payment_history` | Registro de pagamento | `user_email`, `amount`, `payment_method`, `product` ('monthly' \| 'lifetime'), `gateway='stripe'`, `gateway_transaction_id`, `status` |

### Bucket Supabase Storage

- Bucket privado `songs-docs`, caminho `songs/{user_id}/{song_id}/{doc_id}`.
- RLS por usuário: SELECT só em `songs/{self}/*`.
- All uploads via `storage.from('songs-docs').upload(path, file)`.
- All reads via `createSignedUrl(path, 60 * 60)` — URL assinada expira em 1h.

### Row Level Security

- Replay dos `SECURITY DEFINER` functions já existentes: `is_setlist_owner`, `is_setlist_member`, `is_setlist_editor`, `has_share_link` (substitui `has_link_share` — ver `setlist_share_links`).
- Policies garantem: Dono tudo, Editor `blocks`+`block_songs` INSERT/UPDATE/DELETE, Viewer SELECT only, Convidado SELECT após aceitar convite (não mais via sentinela).
- `setlists` SELECT nunca mais expõe setlists via link-share sem consentimento explícito (elimina o bug histórico).

---

## 4. Sincronização

- **Camada portada literalmente:** `src/lib/{sync,merge,revision-cache,ids}.ts` + `types.ts`.
- **Regras existentes preservadas:** tombstones como deleção única, merge last-write-wins (agora funciona em todas as entidades por causa do `updated_at` + trigger), guard `never deletes members on empty list`, preservação de `link_share` sentinela migrada para `setlist_share_links`.
- **Strip baseline do app (AppShell):**
  1. `onAuthStateChange` → `isAuthenticated` state
  2. `getSession()` em mount + silent `refreshSession` on focus
  3. Se logado: `useQuery(['catalog'])`, `useQuery(['setlists'])` na entrada; `useQuery(['setlist', id])` no `/setlist/:id` com `refetchInterval: isActiveInUI ? 5000 : false`
  4. TanStack `queryClient.setQueryData` para optimistic updates locais após mutações via `useMutation`
  5. Mutations chamam `StorageEngine` (truth local) + `syncLocalDataToSupabase()` (push) como side-effect

---

## 5. Pagamentos (Stripe)

### Products

- `premium_monthly` (R$7,90/mês) — Stripe `Subscription` com `recurring.interval='month'`.
- `premium_lifetime` (R$89,90 uma vez) — Stripe `PaymentIntent` one-off.

### Webhooks (Edge Functions Supabase)

| Evento | Ação |
|---|---|
| `payment_intent.succeeded` (mode='lifetime') | `UPDATE profiles SET plan='premium' WHERE email=buyer`; `INSERT payment_history (status='confirmed', product='lifetime')` |
| `invoice.paid` (mode='subscription', first invoice) | `UPDATE profiles SET plan='premium' WHERE email=buyer`; `INSERT payment_history (status='confirmed', product='monthly')` |
| `invoice.paid` (recurring) | Idempotente — apenas `INSERT payment_history (status='confirmed', product='monthly')` |
| `customer.subscription.deleted` | `UPDATE profiles SET plan='free' WHERE email=customer.email` |
| `charge.refunded` | `UPDATE profiles SET plan='free' WHERE email=buyer`; `UPDATE payment_history SET status='refunded' WHERE gateway_transaction_id=charge_id` |
| `payment_intent.payment_failed` (mode='lifetime' failed) | Log; sem mudança de plano |
| `invoice.payment_failed` (mode='subscription') | Log; depois de retry policy do Stripe, `customer.subscription.deleted` vai disparar |

### Rota UI

- `/billing/success` — Stripe redirect pós-constants
- `/billing/cancel` — Stripe redirect se cancelar no checkout
- `UpgradeModal` em `billing/ui/` mostrada em todos os pontos de bloqueio: `canAddCatalogSong`, `canCreateSetlist`, `canAddDocument`, `canInviteMember`, `canEditSharedSetlist`

### Free vs Premium Limits

| | Free | Premium |
|---|---|---|
| Músicas no Catálogo | **16** | ilimitado |
| Setlists | **1** | ilimitado |
| Documents por música | **0** | 5 (100MB cada, Supabase Storage) |
| Convidar via Link (Edit) | ❌ | ✅ |
| Entrar via Link de Acesso | como **Visualizador** | com papel do link |
| Trial Premium | 7 dias ao se cadastrar | — |

---

## 6. Sharing

- Dono gera uma `setlist_share_links` row por setlist, com `role` fixo (`editor` ou `viewer`).
- URL curta no app: `/s/{short_id}?role={role}` (short_id = base32, ~7 chars).
- Convidadado clica → cai em `/s/{short_id}` route:
  - Não logado → redirect `/login?next=/s/{short_id}`
  - Logado + já Membro → redirect `/setlist/{id}`
  - Logado + não-Membro → modal "Aceitar este convite como [Editor/Visualizador]?"
  - Não há auto-join.
- Dono pode revogar/regenerar via modal de share: `UPDATE setlist_share_links SET revoked_at=now() WHERE id=...` e/ou `INSERT setlist_share_links` nova (URL anterior cessa de funcionar).
- Elimina completamente `setlist_invites` (e-mail-style) e a sentinela `__link_share__`.

---

## 7. Migração de Dados do app v1

- Adicionar migrations **verdes** que estendem o DB atual: `updated_at` + triggers em `songs/blocks/block_songs`, `plan`/`premium_trial_ends_at` em `profiles`, `payment_history`, `setlist_share_links`, Bucket Storage.
- Script **one-shot** Node/TS para migrar `songs.documents[].dataUrl` (base64 em JSONB) → upload para bucket + reescrita do JSONB só com metadados (`storage_path`, `id`, `name`, `type`, `size`).
- IDs e dados existentes mantidos. O histórico de usuário v1 continua visível no v2 sem exceções.

---

## 8. Decisões Ad Hoc e Cleanup do v1

- `package.json` `name` renomeado para `repertorio-automatico` (era `react-example`).
- Deprecate deps mortas do v1: `@google/genai`, `express` não importados em lugar nenhum.
- `SUPABASE_SQL_SCHEMA` inline em `supabase.ts` removido — só migrations reais.
- `ErrorBoundary` global cobre **todo** o app (inclusive Header, Toast, OfflineBanner) — não parcial como hoje.

---

## 9. Decisões Pendentes (FUTURE_DECISIONS)

Capturadas mas não resolvidas agora — grillar em sessão futura.

- **Onboarding flow**: Magic link vs Senha vs OAuth Google?
- **Backup/export**: Músico pode baixar JSON do próprio Catálogo para portabilidade?
- **Multi-setlist aberto em abas**: só um Setlist ativo por vez ou múltiplos em abas internas?
- **Mobile-first vs desktop**: PWA capricha, desktop é secundário ou co-igual?
- **Audit log de mutações**: quem editou qual bloco quando — feature premium de governance?
- **Branding internacional**: nome permanece "Repertório Automático" em EN, ou adota alias "Repertory Auto" para gringos?
- **Multi-moeda Stripe**: checkout em BRL sempre, ou detectar geo do cliente e mostrar USD/EUR?

Veja `docs/adr/` para decisões hard-to-reverse registradas formalmente.