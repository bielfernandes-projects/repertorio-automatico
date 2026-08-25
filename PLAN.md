# SetSync — Plano de Produto e Arquitetura

> Documento de planejamento. Escopo de negócio, separação MVP/Backlog e as decisões
> técnicas fechadas na sessão de design. Decisões difíceis de reverter estão
> registradas individualmente em `docs/adr/`.

## 1. Visão Geral do Produto

**SetSync** é um PWA offline-first focado 100% na **experiência de palco** (mission-critical)
para músicos profissionais, bandas de baile e casamentos. É o motor do show: rápido, à prova
de falhas, sem distrações e altamente responsivo.

O SetSync **não** é um app de gestão financeira ou de backoffice. Gestão de eventos, cachês e
contratos permanecem fora de escopo — a integração futura com o app "Minha Banda" (backlog)
existe justamente para que esse domínio viva noutro lugar.

### Relação com o "Repertório Automático" (v1)

SetSync é a continuação do rewrite v2 já planejado em `ARCHITECTURE.md` e nas ADRs `0001`-`0007`,
com o escopo de palco incorporado. Todas as decisões dessas ADRs seguem valendo, com **três
exceções explícitas** decididas nesta sessão e registradas nas ADRs `0008` e `0009`:

| Decisão anterior | Exceção do SetSync | Onde |
|---|---|---|
| ADR 0002: polling, sem Realtime | Realtime **híbrido**: polling para catálogo/setlist, `postgres_changes` só para o ponto atual | ADR 0008 |
| ADR 0006: todo link exige login | **Novo tipo** de link público read-only (ordem + tons), sem login | 4.7 |
| CONTEXT.md: nunca parseamos cifra | Scraper próprio + render nativo de letra/cifra | ADR 0009 |

---

## 2. Core Features (MVP 1.0)

### 2.1 Offline-First e PWA
O repertório fica salvo localmente; a banda não pode depender de 4G no meio do palco.
Mantém o modelo já existente e testado: `localStorage` é a fonte de verdade, Supabase é
espelho, merge last-write-wins com tombstones (ADR 0003). O service worker e o manifest
já existentes no v1 são portados para o v2.

### 2.2 Cifras e letras nativas
Em vez de abrir o Cifra Club num iframe, o app busca e renderiza os textos nativamente,
permitindo controle total de fonte, contraste e dark mode. Ver 4.3 para a arquitetura de
ingestão e 4.4 para o formato interno.

### 2.3 Visualização por Role (Letra vs. Cifra)
A mesma música pode ser vista como **só letra em fonte gigante** (cantora) ou **com acordes**
(guitarrista), sem os músicos perderem a sincronia de onde a banda está. É uma preferência
**local por dispositivo** (`localStorage`), não um atributo do membro no servidor: cada músico
alterna sozinho a qualquer momento, sem afetar ninguém e sem precisar de gestão pelo Dono.

### 2.4 Estrutura de Medleys (Blocos ininterruptos)
O SetSync organiza o setlist em **Blocos** — a estrutura Setlist / Bloco / Item de Bloco já
existe no domínio (ver `CONTEXT.md`). O MVP acrescenta, para transições perfeitas:
- **BPM** por Música do Catálogo (entrada manual, ver 4.5)
- **Nota de passagem** por Item de Bloco (entrada manual, ver 4.5)

### 2.5 Ponto Eletrônico Visual (sync de palco)
Se quem conduz o show pula para a música 5, a tela de todos atualiza em seguida. Implementado
como campo persistido na setlist + Supabase Realtime (`postgres_changes`), ver 4.2.
**Dono e Editores** podem avançar o ponto atual.

### 2.6 Modo Performance (Foco)
Tela limpa, alto contraste (Dark Mode obrigatório), tela não apaga (Wake Lock API) e fontes
legíveis à distância.

### 2.7 Transposição de Tom Automática
Mudança de tom em um clique, recalculando todos os acordes. A lógica de semitons já existe
(`computeSemitoneShift`, `NOTE_MAP` em `src/lib/utils.ts`) e passa a operar sobre os acordes
estruturados vindos do parser, em vez de apenas montar a query de uma URL externa.

### 2.8 Link Público (sem login)
Link para convidados ou técnicos de som visualizarem o setlist — **apenas ordem e tons** —
via navegador, sem conta. Ver 4.7.

### 2.9 Monitoramento
Sentry (ou equivalente) desde o MVP. Dado o framing mission-critical, é preciso saber que algo
quebrou no palco antes que o músico precise reclamar. Cobertura prioritária: a camada de sync
offline/Supabase e o novo parser/scraper de cifra.

### Fora do MVP 1.0
Herdado do plano v2 sem alteração: planos Free/Premium/Trial/Vitalício/Mensal (ADR 0004),
anexos em Storage com signed URLs (ADR 0005), i18n PT/EN (ADR 0007). Não são features novas
do SetSync, mas continuam no roadmap do produto.

---

## 3. Backlog (pós-MVP)

Estas features **não** fazem parte do MVP, mas a arquitetura do MVP já as comporta:

### 3.1 Integração com o app "Minha Banda"
Ponte com um app externo de gestão de backoffice já existente, permitindo que um evento criado
lá gere automaticamente um card de setlist em branco no SetSync.

**Suporte já previsto**: nenhuma mudança estrutural necessária — criar uma setlist vazia já é
uma operação de primeira classe. Falta desenhar a superfície de integração (webhook de entrada
vs. API pull, autenticação máquina-a-máquina), o que depende do contrato que o "Minha Banda"
expuser. Revisitar quando esse contrato existir.

### 3.2 Modo Solo (Voz/Violão)
Player automatizado para músicos solo: auto-scroll inteligente baseado em BPM/duração e
transição automática para a próxima música do bloco, eliminando interação manual na tela.

**Suporte já previsto**: o formato estruturado da cifra (4.4) dá as linhas discretas necessárias
para o scroll, e o `synced_lyrics` da LRCLIB (4.3) permite que o auto-scroll seja **exato por linha**,
guiado pelos timestamps reais da gravação, em vez de estimado a partir do BPM. Onde não houver letra
sincronizada, o BPM manual (2.4) e o `duration_seconds` sustentam a estimativa. Falta apenas a
lógica de player.

---

## 4. Decisões Técnicas

### 4.1 Stack
Herdada do plano v2 (`ARCHITECTURE.md`), sem mudanças: React 19 + TypeScript + Vite 6,
Tailwind v4, Zustand (estado de UI), TanStack Query v5 (server state + polling),
React Router v7, i18next, Supabase (Postgres + Auth + Storage), Stripe (BRL), deploy na Vercel.
Acrescenta-se ao MVP: **Sentry** (2.9) e uma **Vercel Serverless Function em runtime Node**
para o proxy de cifra (4.3).

### 4.2 Ponto Eletrônico — Realtime híbrido
Catálogo e setlist continuam em polling de 5-10s + refetch em `visibilitychange` (ADR 0002).
Apenas o ponto atual usa Realtime:

- `setlists` ganha `current_block_id` e `current_item_id`, atualizados por escrita normal.
- Os dispositivos assinam `postgres_changes` **só nessa linha**.

Escolhido em vez de um canal de broadcast efêmero porque o estado fica persistido: quem chega
atrasado ou recarrega a página vê o ponto atual sem nenhuma lógica de reconciliação extra, e o
RLS existente já governa quem lê. Latência típica de 100-300ms, adequada ao caso de uso.
Registrado na ADR 0008.

### 4.3 Ingestão de cifras e letras
Uma Vercel Serverless Function (runtime Node) faz fetch, parse e cache. Duas fontes:

- **Cifra com acordes**: **scraper próprio e leve** (axios + cheerio) sobre o HTML público do
  Cifra Club. A lib `code4music/cifraclub-api` foi avaliada e **descartada**: usa Selenium
  WebDriver, só roda auto-hospedada via `docker-compose`, não expõe endpoint público e o próprio
  README a descreve como automação pessoal, não produção. Serve como referência de onde os
  acordes ficam no HTML, não como dependência de runtime.
- **Letra apenas (fallback)**: **LRCLIB** (`lrclib.net/api/get`). Não exige API key, é MIT e
  **auto-hospedável** — se o serviço público sair do ar, subimos nossa própria instância em vez de
  ficar sem fallback. Retorna também `duration` e, na maioria dos casos, `syncedLyrics` com
  timestamps por linha (formato LRC). A Vagalume foi a escolha inicial e caiu: em Agosto/2026 tanto
  `auth.vagalume.com.br` quanto `api.vagalume.com.br` responderam 503, inviabilizando até a geração
  do token. `letras-de-musica` segue recusada por ser scraper puro do site, sem SLA.

**Cobertura verificada** (Agosto/2026, repertório de baile/casamento): LRCLIB devolveu letra para
7 de 7 músicas testadas — incluindo pagode, sertanejo e MPB — e letra sincronizada para 6 delas.
Como comparação, `api.lyrics.ovh` falhou em uma das três testadas.

**Cache**: tabela `cifras_cache` no Supabase, **compartilhada globalmente por música**
(chave `artist_slug` + `song_slug`), não por usuário. Duas bandas diferentes que tocam a mesma
música reaproveitam o mesmo fetch, o que reduz drasticamente o volume de requisições ao Cifra
Club e o risco de bloqueio. Sem TTL: uma vez parseada com sucesso, a cifra vale indefinidamente
(letra e acordes raramente mudam); um botão manual de atualizar força novo fetch.

**Atribuição**: mesmo com render nativo, a tela sempre credita a fonte de onde o conteúdo veio —
link "ver no Cifra Club" quando a cifra veio do scraper, crédito à LRCLIB quando é letra de fallback.
O campo `source` de `cifras_cache` é o que determina qual atribuição exibir.

### 4.4 Formato interno da cifra
Cada linha é armazenada como `{ text, chords: [{ position, chord }] }`, onde `position` é o
índice do caractere na letra sobre o qual o acorde incide (tipos `CifraLine` / `CifraChord`
em `src/types.ts`).

Escolhido em vez de um formato inline tipo ChordPro por causa do requisito de fonte gigante
(2.3): com o índice de caractere separado do texto, o acorde pode ser reposicionado sobre a
sílaba correta a cada mudança de tamanho de fonte, em vez de depender de alinhamento
monoespaçado. Também simplifica a transposição, que passa a mapear sobre o campo `chord`
sem tocar na letra.

### 4.5 BPM e nota de passagem — entrada manual
Ambos são digitados pelo músico, não derivados automaticamente:

- **BPM** é campo de `CatalogSong`, preenchido no cadastro como já acontece com o Tom de origem.
  A API de audio-features do Spotify foi descontinuada para apps novos em 2024, e depender de
  metadados externos para um dado exibido no palco contraria o requisito de ser à prova de falhas.
- **Nota de passagem** é campo de `BlockItem`, análoga à Observação de Item que já existe.
  Derivá-la comparando o último acorde da música A com o primeiro da B é frágil: cifras terminam
  com frequência em repetição ou trecho instrumental sem acorde final claro.

### 4.6 Visualização por Role
Preferência local por dispositivo em `localStorage`. Não há campo novo em `SetlistMember` nem
tela de gestão: o Dono não precisa saber quem toca o quê para que a feature funcione.

### 4.7 Link Público
Nova tabela `setlist_public_links`, distinta de `setlist_share_links` da ADR 0006. O link de
colaborador (editor/viewer) continua exigindo login e aceite explícito; o link público é
read-only, anônimo, não gera Membro, e sua policy de RLS expõe **apenas ordem e tons** — nunca
letra, cifra, anexos ou dados dos Membros. Manter as duas tabelas separadas evita reabrir a
classe de bug de vazamento que motivou a ADR 0006.

---

## 5. Modelo de Dados — mudanças

Campos novos:

| Entidade | Campo | Motivo |
|---|---|---|
| `CatalogSong` | `bpm?: number` | 2.4, 4.5 |
| `BlockItem` | `transitionNote?: string` | 2.4, 4.5 |
| `Setlist` | `currentBlockId?`, `currentItemId?` | 2.5, 4.2 |

Tabelas novas:

- **`cifras_cache`** — `{ id, artist_slug, song_slug, source, original_key?, lines: jsonb,
  synced_lyrics?, duration_seconds?, source_url, fetched_at }`, com índice único em
  `(artist_slug, song_slug)`. Leitura liberada para usuários autenticados; escrita apenas pela
  função serverless. `synced_lyrics` e `duration_seconds` vêm de graça no mesmo fetch da LRCLIB e
  são persistidos já no MVP, mesmo sem consumidor imediato: capturá-los depois exigiria refazer o
  fetch de todo o cache (ver 3.2).
- **`setlist_public_links`** — `{ id, setlist_id, short_id, created_at, revoked_at? }`.

Todas as migrações são **aditivas** (ADR 0001), sem alterar o schema que a camada de sync já
consome.

---

## 6. Fases de Implementação

1. **Fundação** — migrações aditivas, novos tipos em `src/types.ts`, Sentry.
2. **Ingestão de cifra** — serverless function, scraper, parser, `cifras_cache`, testes com
   fixture de HTML local.
3. **Render nativo** — componente de letra/cifra substituindo `CifraWebviewModal`, controle de
   fonte, dark mode, transposição sobre o formato estruturado.
4. **Palco** — ponto eletrônico via Realtime, Modo Performance, Wake Lock.
5. **Blocos** — BPM, nota de passagem, exibição de transição.
6. **Compartilhamento** — link público read-only.

---

## 7. Verificação

- **Parser**: testes unitários contra fixtures de HTML salvos localmente, sem rede no CI.
- **Sync do ponto atual**: reusar o padrão de `src/lib/sync/orchestrator.test.ts`
  (adapter em memória), sem precisar de Supabase real.
- **Ponto eletrônico**: teste manual em 2+ dispositivos — um avança, o outro reflete em segundos.
- **Link público**: abrir em aba anônima e confirmar que mostra só ordem e tons, sem permitir
  edição nem expor letra/cifra.
- **Offline**: colocar o dispositivo em modo avião durante um setlist aberto e confirmar que
  navegação, transposição e leitura de cifra cacheada seguem funcionando.
