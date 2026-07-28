# Repertório Automático — Documentação do Aplicativo

Este documento serve como a documentação de referência oficial do **Repertório Automático**, detalhando a visão de produto, as regras do modelo de domínio, a arquitetura e as decisões técnicas implementadas no código.

---

## 1. Visão Geral do Produto

O **Repertório Automático** é um organizador e gerenciador de repertórios musicais *mobile-first* voltado para bandas, músicos solo e ministérios que hoje sofrem com a desorganização de pastas de cifras, planilhas ou blocos de notas. 

### Objetivos Principais
*   **Centralização**: Servir como ponto único de controle do repertório geral de um músico ou grupo.
*   **Agilidade em Ensaios/Apresentações**: Resolver instantaneamente as dúvidas de tons de execução de cada música ("Qual tom o vocalista pediu para esta apresentação?").
*   **Colaboração Simplificada**: Permitir que os integrantes de uma banda acessem, configurem e visualizem o setlist sincronizado.

### Limitação de Escopo
O aplicativo **não** armazena cifras internamente. Em vez disso, gera dinamicamente e gerencia links externos de cifra (Cifra Club) ou permite a anexação de arquivos de partituras/cifras próprias em formato PDF e imagem.

*   **Nome do App**: Repertório Automático
*   **Idioma**: Português Brasileiro (PT-BR)
*   **Padrão de Design**: Escuro por padrão (*Dark Mode*), com visual moderno, gradientes sutis e microinterações fluidas.

---

## 2. Modelo de Domínio

O domínio de negócios do aplicativo é estruturado em torno de três entidades centrais: **Catálogo**, **Setlist** e **Bloco**.

```mermaid
classDiagram
    class UserProfile {
        +id: UUID
        +email: string
        +name: string
    }
    class CatalogSong {
        +id: string
        +userId: string
        +name: string
        +artist: string
        +originalKey: string
        +slugOverride: string
        +documents: SongDocument[]
    }
    class SongDocument {
        +id: string
        +name: string
        +type: "pdf" | "image" | "other"
        +dataUrl: string
        +fileSize: number
    }
    class Setlist {
        +id: string
        +ownerId: string
        +ownerEmail: string
        +name: string
        +blocks: Block[]
        +members: SetlistMember[]
    }
    class Block {
        +id: string
        +setlistId: string
        +name: string
        +theme: string
        +position: number
        +items: BlockItem[]
    }
    class BlockItem {
        +id: string
        +blockId: string
        +catalogSongId: string
        +requestedKey: string
        +position: number
        +originalKeyAtAssignment: string
        +notes: string
    }
    UserProfile "1" --> "*" CatalogSong
    UserProfile "1" --> "*" Setlist
    CatalogSong "1" --> "*" SongDocument
    Setlist "1" --> "*" Block
    Block "1" --> "*" BlockItem
    BlockItem --> "1" CatalogSong : references
```

### 2.1. Catálogo Geral
É o acervo completo e privado de músicas cadastradas de cada usuário.
*   **Campos**: `nome`, `artista` (obrigatório para busca automatizada de cifras), `tom original` (texto livre, ex: "C", "Dó#m", "Sol maior").
*   **Organização**: Exibido em lista ordenada alfabeticamente. Suporta busca em tempo real por nome ou artista.
*   **Partituras e Anexos (Documentos)**:
    *   Cada música suporta a anexação de até **5 arquivos** (PDFs ou Imagens).
    *   Limite de tamanho: **10MB por arquivo**.
    *   Os anexos são armazenados localmente e na nuvem como base64 strings (`dataUrl`).
    *   O app disponibiliza um modal lightbox e visualizador integrado via `iFrame` (para PDFs) ou tags de imagem com ação de download.

### 2.2. Setlist
Uma coleção nomeada correspondente a um show, ensaio ou evento específico.
*   **Campos**: `nome` (único por usuário dono), `blocos`, `membros`.
*   **Duplicação**: Qualquer usuário proprietário ou convidado com acesso pode duplicar um setlist, gerando um clone inteiro sob sua propriedade (com blocos e músicas clonadas).
*   **Compartilhamento**: Apenas o dono pode convidar novos membros, excluir o setlist ou gerenciar permissões de acesso.

### 2.3. Bloco
Agrupamentos conceituais ou de ritmos organizados dentro de um setlist.
*   **Campos**: `nome` (não-vazio, único dentro do setlist), `tema` (texto livre), `posição`.
*   **Temas**: O tema digitado no bloco gera um *badge* visual com uma cor gerada de forma determinística por meio de um algoritmo de hash de string.
*   **Reordenação**: Suporta arrastar e soltar (drag & drop) para ordenar a sequência de blocos dentro do setlist.

### 2.4. Itens do Bloco (Referência de Música)
Relação entre uma música do catálogo e um bloco específico do setlist.
*   **Campos**: `música_id`, `tom solicitado` (opcional e texto livre), `notes` (observação opcional).
*   **Regras de Negócio**:
    *   O **tom solicitado vive na referência** e não no catálogo. Isso permite tocar a mesma música em tons diferentes dependendo da apresentação ou do cantor do dia.
    *   **Observações/Notas da Apresentação**: É possível adicionar uma observação de texto livre (ex: "Começa do solo de violão", "Crescente em colcheia") para a música na referência. Ela pode ser digitada no momento da adição ou editada inline no bloco focado.
    *   **Sem duplicação**: Não é permitido inserir a mesma música do catálogo duas vezes no mesmo bloco.
    *   Se o tom original for alterado no catálogo, o tom solicitado no bloco não é modificado, mas o item recebe uma badge discreta de atenção indicando que o tom original foi alterado.

---

## 3. Sincronização e Colaboração

O Repertório Automático é colaborativo por setlist, implementando regras de acesso baseadas em perfis.

### 3.1. Níveis de Permissão
*   **Owner (Dono)**: Acesso total. Exclui o setlist, convida/revoga integrantes, edita blocos, músicas e referências. Controla também a música correspondente no catálogo geral.
*   **Edit (Editor)**: Permissões de montagem. Adiciona/remove músicas de blocos, reordena itens, ajusta os tons solicitados das músicas e cria/exclui blocos dentro do setlist.
*   **View (Visualizador)**: Modo leitura. Apenas consulta a ordem do show, visualiza os tons solicitados, abre cifras e consulta arquivos/anexos de partituras.

### 3.2. Convites e Compartilhamento de Acesso
O aplicativo implementa dois métodos de compartilhamento de setlists:
1.  **Convite por E-mail**: O dono informa o e-mail do convidado. Se a conta já existe, o setlist é vinculado imediatamente. Se não, um convite de status pendente é criado, aguardando que o convidado crie sua conta para aceitá-lo/recusá-lo.
2.  **Links de Acesso Rápido & WhatsApp**:
    *   Na tela de perfil, o proprietário pode copiar um link direto de compartilhamento estruturado como `?setlist=SETLIST_ID&role=edit|view`.
    *   O app oferece um botão rápido para disparar o link preenchido em uma mensagem direta no WhatsApp.
    *   Ao acessar a aplicação através desse link, se o usuário estiver logado, o app faz a associação de associação automática (`joinSetlistViaLink`) adicionando o setlist à sua lista.

### 3.3. Edição Simultânea e Realtime
*   **Sincronização**: Conectado à rede do Supabase Realtime, mudanças de estrutura são sincronizadas em tempo real.
*   **Resolução de Conflitos**: Estrutura de campos independentes evita colisões comuns. Se dois editores salvarem o mesmo campo simultaneamente, aplica-se a regra de *Last-Write-Wins* (última escrita prevalece).

---

## 4. Integração de Cifras Externas

A geração e a renderização de cifras dependem da integração com o site **Cifra Club**.

### 4.1. Construção da URL de Cifra
A URL base é montada dinamicamente:
`https://www.cifraclub.com.br/{slug-artista}/{slug-musica}/`

*   **Slug Automatizada**: O texto do nome da música e do artista passa por um normalizador que remove acentos, retira caracteres não-alfanuméricos e substitui espaços por hifens.
*   **Customização (Slug Override)**: Caso a slug gerada não corresponda ao link correto no Cifra Club, o usuário pode configurar um `slugOverride` editando o campo diretamente no modal de cifras in-app ou no catálogo. **Inteligência ao colar links**: Se o usuário colar uma URL completa do Cifra Club no campo de slug, o app extrai automaticamente os slugs do artista e da música e os atualiza de forma apropriada, resolvendo o problema de cifras não encontradas.

### 4.2. Transposição Automatizada
O aplicativo calcula a distância de semitons relativos entre o **Tom Original** cadastrado no catálogo e o **Tom Solicitado** cadastrado na referência:
1.  Faz o mapeamento e tradução dos termos livres (ex: "Dó#" e "C#" viram índice `1`).
2.  Subtrai o índice do tom solicitado pelo original modulo 12.
3.  Calcula a mudança relativa na escala de `-6` a `+6` semitons (compatível com a transposição do Cifra Club).
4.  Acrescenta o parâmetro `?tom={N}` ao final do link da cifra para que ela já carregue transposta na tela.

### 4.3. Visualização com Fallback de Webview
As cifras são exibidas em um modal in-app que contém um `iframe`. 
*   **Tratamento de Bloqueio**: Como o Cifra Club restringe renderização em iFrames por cabeçalhos `X-Frame-Options` em certos dispositivos/navegadores, o app monitora falhas de renderização.
*   **Fallback**: Caso o carregamento falhe, exibe-se uma tela informativa recomendando que o usuário clique no botão para abrir a cifra diretamente em um navegador externo do sistema.

---

## 5. Interface, UX e Estado

### 5.1. Roteamento e Estrutura de Abas
O app utiliza uma navegação por abas na barra inferior (`BottomNav`) para gerenciar as rotas:
*   `ListMusic` (Setlists)
*   `Music` (Catálogo Geral)
*   `User` (Perfil de Usuário)

### 5.2. Padrões de Interação e UI
*   **Modais / Bottom Sheets**: Toda ação de criação e configuração (adicionar música, criar bloco, convidar integrante) é executada por modais suspensos, evitando redirecionamentos que tiram o músico do seu contexto.
*   **Edição Inline**: Nomes de setlists e tons solicitados podem ser editados com um clique simples sobre o texto, que se transforma em um campo de entrada e é atualizado ao pressionar Enter ou perder o foco.
*   **Desfazer Rápido (Undo)**: Exclusões pontuais (ex: retirar música do bloco) disparam um toast com duração de 5 segundos contendo um botão de "Desfazer".

### 5.3. PWA (Progressive Web App) e Offline
*   **Instalação**: O app se comporta como um aplicativo nativo no celular. O botão "Instalar" na aba de perfil monitora o evento `beforeinstallprompt` do navegador.
*   **Funcionamento Offline**: O aplicativo armazena todos os setlists ativos e catálogo em um cache local. Em caso de perda de conexão:
    *   Um banner persistente `OfflineBanner` surge no topo da tela.
    *   O app entra em modo de leitura offline estruturado, permitindo consultar a ordem e os tons das músicas sem acesso à internet, suspendendo novos salvamentos em nuvem.

### 5.4. Error Boundary e Resiliência
*   O componente raiz é envelopado por um `ErrorBoundary` global. Em caso de erro fatal de execução do React, o usuário visualiza uma tela de alerta amigável contendo um botão para recarregar a aplicação de forma limpa.

---

## 6. Arquitetura e Stack Técnica

A estrutura técnica do projeto baseia-se em uma arquitetura limpa focada em desempenho e sincronização background:

| Camada | Tecnologia |
|---|---|
| **Core Framework** | React 19 + TypeScript + Vite |
| **Banco de Dados & Auth** | Supabase (PostgreSQL + Auth + Realtime) |
| **Estilização** | Tailwind CSS v4 |
| **Biblioteca de Ícones** | Lucide React |
| **Animações** | Motion (Framer Motion) |
| **Gerenciamento de Estado** | Zustand (estado volátil de UI, toasts e modais) |
| **Mecanismo de Cache** | `StorageEngine` (abstração de `localStorage`) |
| **Métricas & Analytics** | Vercel Analytics (`@vercel/analytics`) |

### 6.1. Sincronização em Background (Debounce)
Sempre que uma modificação local é executada, o `StorageEngine` sinaliza um temporizador interno de background (`triggerAutoBackgroundSync` com debounce de **1200ms**). Caso o usuário esteja online e com credenciais Supabase válidas, os dados do localStorage são convertidos e enviados automaticamente para o banco remoto em lote de forma transparente.

### 6.2. Mapeamento de IDs Determinísticos (Helper `toUUID`)
No banco de dados Supabase (PostgreSQL), os registros utilizam tipos de chaves primárias `uuid`. A fim de permitir o funcionamento offline de criação com IDs simplificados (Ex: `song_01`, `setlist_01`), o app implementa a função `toUUID()`. Este helper cria um hash determinístico da string de entrada, garantindo que o mesmo ID de texto local resulte sempre em um UUID v4 compatível e idêntico para a inserção correta no banco de dados.

### 6.3. Esquema de Tabelas (Supabase SQL)
```sql
-- Perfis de Usuário
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text not null default '',
  created_at timestamp with time zone default now() not null
);

-- Músicas do Catálogo
create table if not exists public.songs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  artist text not null,
  original_key text not null default '',
  slug text not null default '',
  cifra_url text,
  documents jsonb default '[]'::jsonb,
  created_at timestamp with time zone default now() not null
);

-- Setlists
create table if not exists public.setlists (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  unique(user_id, name)
);

-- Blocos
create table if not exists public.blocks (
  id uuid default uuid_generate_v4() primary key,
  setlist_id uuid references public.setlists(id) on delete cascade not null,
  name text not null,
  theme text not null default '',
  position integer not null default 0,
  created_at timestamp with time zone default now() not null
);

-- Músicas do Bloco (Referências)
create table if not exists public.block_songs (
  id uuid default uuid_generate_v4() primary key,
  block_id uuid references public.blocks(id) on delete cascade not null,
  song_id uuid references public.songs(id) on delete cascade not null,
  position integer not null default 0,
  requested_key text,
  notes text,
  created_at timestamp with time zone default now() not null,
  unique(block_id, song_id)
);

-- Migração caso a tabela já exista:
-- alter table public.block_songs add column if not exists notes text;

-- Integrantes do Setlist
create table if not exists public.setlist_members (
  id uuid default uuid_generate_v4() primary key,
  setlist_id uuid references public.setlists(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role text not null default 'viewer' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamp with time zone default now() not null,
  unique(setlist_id, user_id)
);

-- Convites
create table if not exists public.setlist_invites (
  id uuid default uuid_generate_v4() primary key,
  setlist_id uuid references public.setlists(id) on delete cascade not null,
  inviter_id uuid references public.profiles(id) on delete cascade not null,
  invitee_email text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamp with time zone default now() not null
);
```
