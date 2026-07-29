# Plano de Auditoria de Segurança e Arquitetura

> **Status**: Planejado — aguardando aprovação para execução  
> **Prioridade**: 🔴 CRÍTICA — sistema em produção com usuários reais  
> **Escopo**: Frontend (React/TS), armazenamento local, integração Supabase, autenticação

---

## 🚨 VULNERABILIDADES CRÍTICAS ENCONTRADAS

### CRÍTICA 1 — Sistema de Autenticação Completamente Falso

**Arquivo**: `src/components/auth/AuthModal.tsx` (linhas 20–48)  
**Severidade**: CRÍTICA 🔴

O sistema atual **não tem autenticação real nenhuma.** Veja o que o código faz:

```typescript
// Login "valida" qualquer e-mail + senha sem verificar nada:
const user = {
  id: `usr_${Date.now()}`,   // ← ID gerado no frontend, qualquer pessoa pode forjar
  email: email.trim().toLowerCase(),
  name: name.trim() || email.split('@')[0]
};
StorageEngine.setUser(user); // ← Salva direto no localStorage sem verificar no servidor
```

**Impacto**: Qualquer pessoa pode "logar" como qualquer e-mail (incluindo `gabriel@dominio.com`) simplesmente digitando o endereço. Não há senha verificada. Um atacante pode se passar por qualquer usuário sem qualquer barreira.

**Além disso**, o formulário vem pré-preenchido com suas credenciais reais:
```typescript
const [email, setEmail] = useState(DEFAULT_USER.email); // ← Expõe seu e-mail
const [password, setPassword] = useState('123456');       // ← Expõe uma senha padrão
```

**Solução**: Integrar Supabase Auth (`signIn`, `signUp`, `signOut`) de verdade.

---

### CRÍTICA 2 — RLS (Row Level Security) Não Está Ativo

**Arquivo**: `src/lib/supabase.ts` — fetch geral  
**Severidade**: CRÍTICA 🔴

A função `fetchRemoteDataFromSupabase` busca **todos os dados do banco**:

```typescript
const { data: songsData } = await client.from('songs').select('*');       // ← Todas as músicas de todos os usuários
const { data: setlistsData } = await client.from('setlists').select('*'); // ← Todos os setlists
const { data: blocksData } = await client.from('blocks').select('*');     // ← Todos os blocos
```

Sem RLS ativo no Supabase, **qualquer usuário autenticado consegue ler os dados de TODOS os outros usuários**. Isso é uma violação completa de privacidade e LGPD.

**Solução**: Ativar RLS e adicionar políticas por `user_id = auth.uid()` em todas as tabelas.

---

### CRÍTICA 3 — Credenciais Hardcodadas no Código-Fonte

**Arquivo**: `src/lib/storage.ts` (linhas 56–60)  
**Arquivo**: `src/components/auth/AuthModal.tsx` (linhas 14–16)  
**Severidade**: ALTA 🟠

```typescript
// storage.ts
export const DEFAULT_USER: UserProfile = {
  id: 'usr_main_01',
  email: 'gabriel.fernandeshw@gmail.com', // ← E-mail real exposto no código
  name: 'Gabriel Fernandes'
};

// AuthModal.tsx
const [email, setEmail] = useState(DEFAULT_USER.email); // ← Pré-preenche com seu e-mail
const [password, setPassword] = useState('123456');      // ← Senha padrão pré-preenchida
```

O código-fonte é público no GitHub. Qualquer pessoa pode ver o repositório e encontrar estas credenciais.

**Solução**: Remover `DEFAULT_USER` hardcodado. Formulário de login começar vazio.

---

### ALTA 4 — Upload de Arquivos Sem Validação de Tipo Real

**Arquivo**: `src/components/catalog/CatalogView.tsx` (linhas 63–88)  
**Severidade**: ALTA 🟠

A validação de tipo de arquivo usa apenas o `file.type` informado pelo browser, que pode ser falsificado por um atacante:

```typescript
if (file.type.includes('pdf')) type = 'pdf';
else if (file.type.includes('image')) type = 'image';
// ← Qualquer arquivo pode declarar ser um PDF ou imagem
```

Arquivos maliciosos (ex: executáveis renomeados como `.jpg`) passariam por essa verificação. Os arquivos são convertidos para Base64 e armazenados como `dataUrl` no banco de dados, e exibidos diretamente no browser via `<iframe>` ou `<img>`.

**Solução**: Validar a extensão real do arquivo E os primeiros bytes (magic bytes) do conteúdo antes de processar.

---

### ALTA 5 — Sem Sanitização de Entradas do Usuário

**Arquivo**: `src/lib/storage.ts` (múltiplas funções)  
**Severidade**: ALTA 🟠

Os campos de texto livre (nome de música, artista, nome de setlist, tema do bloco, observações) são salvos no localStorage e no banco de dados **sem nenhuma sanitização contra XSS**. Embora o React escape automaticamente texto em JSX, existem caminhos onde o conteúdo pode ser exibido de forma não segura.

**Exemplo de risco**: Se um campo chegar ao DOM via `dangerouslySetInnerHTML` (atual ou futuro) ou via um iframe externo, conteúdo malicioso poderia executar scripts.

**Solução**: Implementar sanitização defensiva de strings de entrada — aparar e remover caracteres de controle (`\x00–\x1F`), limitar comprimento máximo por campo.

---

### MÉDIA 6 — Compartilhamento via Link Sem Autorização Verificável

**Arquivo**: `src/App.tsx` (linhas 96–122), `src/lib/storage.ts` (linhas 554–582)  
**Severidade**: MÉDIA 🟡

O link de compartilhamento funciona com apenas o ID do setlist na URL:
```
?setlist=setlist_1234567_abcd&role=edit
```

Um atacante pode **adivinhar ou forçar bruto** IDs de setlists (que são timestamps + 4 chars aleatórios) e se juntar a setlists privados de outros usuários simplesmente acessando a URL com o ID correto.

Além disso, o parâmetro `role` vem diretamente da URL sem verificação:
```typescript
const shareRole = (urlParams.get('role') as 'edit' | 'view') || 'edit'; 
// ← Um atacante pode colocar ?role=owner para tentar elevar privilégios
```

**Solução**: Usar tokens de convite opacos e não previsíveis (UUID v4) que expiram. O servidor valida o token, não o client.

---

### MÉDIA 7 — Identidade de Membros Perdida no Supabase

**Arquivo**: `src/lib/supabase.ts` (linhas 411–414, 420)  
**Severidade**: MÉDIA 🟡

Ao buscar dados do banco, o e-mail dos membros e do dono do setlist são **substituídos por valores hardcodados fictícios**:

```typescript
email: 'membro@repertorio.app',  // ← E-mail real não é recuperado do banco
ownerEmail: 'dono@repertorio.app', // ← Sempre esse valor, independente do banco
```

Isso significa que toda a lógica de permissão (quem é dono, quem é editor, quem é viewer) falha após sincronização com o Supabase.

**Solução**: O join de `profiles` com `setlist_members` deve trazer o e-mail real de cada membro.

---

### BAIXA 8 — Console.error com Dados Sensíveis em Produção

**Arquivo**: `src/lib/supabase.ts` (linhas 318, 433)  
**Severidade**: BAIXA 🟢

```typescript
console.error('Sync to Supabase error:', err);
console.error('Fetch remote data error:', e);
```

Erros de Supabase frequentemente incluem detalhes do schema, queries SQL e dados de usuário no stack trace. Essas mensagens são visíveis nas DevTools do browser por qualquer usuário.

**Solução**: Em produção, logar apenas um código de erro genérico. Manter logs detalhados somente em `import.meta.env.DEV`.

---

## 📋 PLANO DE EXECUÇÃO

### FASE 1 — Correções Críticas (Autenticação Real + RLS)

**Prioridade máxima. Fazer antes de divulgar para novos usuários.**

---

#### Passo 1.1 — Ativar RLS no Supabase (SQL)

Executar no SQL Editor do Supabase. **Isso é a proteção mais importante de todas.**

```sql
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

-- Usuário vê apenas seu próprio perfil
create policy "users_select_own_profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Usuário atualiza apenas seu próprio perfil
create policy "users_update_own_profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Permite inserção apenas para o próprio usuário
create policy "users_insert_own_profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- =====================================================
-- POLÍTICAS: songs (catálogo)
-- =====================================================

create policy "users_select_own_songs"
  on public.songs for select
  using (auth.uid() = user_id);

create policy "users_insert_own_songs"
  on public.songs for insert
  with check (auth.uid() = user_id);

create policy "users_update_own_songs"
  on public.songs for update
  using (auth.uid() = user_id);

create policy "users_delete_own_songs"
  on public.songs for delete
  using (auth.uid() = user_id);

-- =====================================================
-- POLÍTICAS: setlists
-- =====================================================

-- Dono do setlist ou membro com role aceito pode ver
create policy "users_select_setlists"
  on public.setlists for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.setlist_members sm
      where sm.setlist_id = id
        and sm.user_id = auth.uid()
    )
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

-- =====================================================
-- POLÍTICAS: blocks
-- =====================================================

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
        )
    )
  );

create policy "users_write_blocks"
  on public.blocks for all
  using (
    exists (
      select 1 from public.setlists s
      where s.id = setlist_id and s.user_id = auth.uid()
    )
  );

-- =====================================================
-- POLÍTICAS: block_songs
-- =====================================================

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
        )
    )
  );

create policy "users_write_block_songs"
  on public.block_songs for all
  using (
    exists (
      select 1 from public.blocks b
      join public.setlists s on b.setlist_id = s.id
      where b.id = block_id and s.user_id = auth.uid()
    )
  );

-- =====================================================
-- POLÍTICAS: setlist_members
-- =====================================================

create policy "users_select_setlist_members"
  on public.setlist_members for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.setlists s
      where s.id = setlist_id and s.user_id = auth.uid()
    )
  );

create policy "owner_manage_setlist_members"
  on public.setlist_members for all
  using (
    exists (
      select 1 from public.setlists s
      where s.id = setlist_id and s.user_id = auth.uid()
    )
  );

-- =====================================================
-- POLÍTICAS: setlist_invites
-- =====================================================

create policy "users_see_own_invites"
  on public.setlist_invites for select
  using (
    inviter_id = auth.uid()
    or invitee_email = auth.email()
  );

create policy "owner_create_invite"
  on public.setlist_invites for insert
  with check (inviter_id = auth.uid());

create policy "owner_delete_invite"
  on public.setlist_invites for delete
  using (inviter_id = auth.uid());

-- =====================================================
-- TRIGGER: auto-criar profile ao criar usuário
-- =====================================================

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

---

#### Passo 1.2 — [MODIFY] `src/components/auth/AuthModal.tsx`

Integrar Supabase Auth real:

```typescript
import { getSupabaseClient } from '../../lib/supabase';

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  const client = getSupabaseClient();
  if (!client) {
    showToast('Serviço de autenticação não disponível.', 'error');
    return;
  }

  if (mode === 'register') {
    const { data, error } = await client.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { name: name.trim() || 'Músico' } }
    });
    if (error) { showToast(error.message, 'error'); return; }
    if (data.user) {
      StorageEngine.setUser({ id: data.user.id, email: data.user.email!, name: name.trim() });
      onLoginSuccess();
    }
  } else if (mode === 'login') {
    const { data, error } = await client.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password
    });
    if (error) { showToast('E-mail ou senha incorretos.', 'error'); return; }
    if (data.user) {
      StorageEngine.setUser({ id: data.user.id, email: data.user.email!, name: data.user.user_metadata?.name || '' });
      onLoginSuccess();
    }
  } else if (mode === 'reset') {
    const { error } = await client.auth.resetPasswordForEmail(email.trim());
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Link de redefinição enviado!', 'success');
    setMode('login');
  }
};
```

Campos de email e senha começam **vazios** (remover `useState(DEFAULT_USER.email)` e `useState('123456')`).

---

#### Passo 1.3 — [MODIFY] `src/lib/storage.ts`

Remover `DEFAULT_USER` com credenciais reais hardcodadas:

```typescript
// Remover completamente:
export const DEFAULT_USER: UserProfile = {
  id: 'usr_main_01',
  email: 'gabriel.fernandeshw@gmail.com',
  name: 'Gabriel Fernandes'
};

// Substituir por:
const ANONYMOUS_USER: UserProfile = {
  id: '',
  email: '',
  name: ''
};

// getUser() retorna null se não há usuário, ao invés de DEFAULT_USER:
static getUser(): UserProfile | null {
  const raw = localStorage.getItem(STORAGE_KEYS.USER);
  if (!raw) return null;
  try { return JSON.parse(raw); }
  catch { return null; }
}
```

---

### FASE 2 — Correções de Segurança de Alta Prioridade

#### Passo 2.1 — [MODIFY] `src/lib/supabase.ts` — Corrigir fetch de membros

Substituir e-mails placeholder por join real com profiles:

```typescript
// Antes (linha 411):
email: 'membro@repertorio.app', // ← ERRADO

// Depois — incluir email no select de setlist_members:
const { data: membersData } = await client
  .from('setlist_members')
  .select('*, profiles!inner(email:id, display_name)'); 
// E usar mRow.profiles.email no mapeamento
```

---

#### Passo 2.2 — [NEW] `src/lib/sanitize.ts`

Criar módulo de sanitização de entradas:

```typescript
const MAX_LENGTHS = {
  songName: 200,
  artist: 200,
  setlistName: 100,
  blockName: 100,
  blockTheme: 80,
  notes: 500,
  key: 10,
  slugOverride: 300,
};

// Remove caracteres de controle e limita comprimento
export function sanitizeText(input: string, field: keyof typeof MAX_LENGTHS): string {
  if (!input) return '';
  return input
    .replace(/[\x00-\x1F\x7F]/g, '') // Remover caracteres de controle
    .trim()
    .slice(0, MAX_LENGTHS[field]);
}

// Valida e-mail básico
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

// Valida extensão de arquivo permitida
const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp'];
export function isAllowedFileType(filename: string, mimeType: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const allowedMime = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  return ALLOWED_EXTENSIONS.includes(ext) && allowedMime.includes(mimeType);
}
```

Aplicar `sanitizeText` em todos os pontos onde strings do usuário são salvas.

---

#### Passo 2.3 — [MODIFY] `src/components/catalog/CatalogView.tsx` — Validação de Upload

Adicionar validação dupla no upload de documentos:

```typescript
// Validar extensão + MIME type antes de processar:
import { isAllowedFileType } from '../../lib/sanitize';

Array.from(files).forEach((file: File) => {
  if (!isAllowedFileType(file.name, file.type)) {
    showToast(`Tipo de arquivo não permitido: "${file.name}". Use PDF ou imagens.`, 'error');
    return;
  }
  if (file.size > 10 * 1024 * 1024) { ... }
  // continua...
});
```

---

#### Passo 2.4 — [MODIFY] `src/App.tsx` — Token de Compartilhamento Seguro

Substituir o ID direto do setlist por um token opaco:

```typescript
// Ao gerar link de compartilhamento (ProfileView.tsx):
// Usar um token separado — não o ID do setlist diretamente
const shareToken = crypto.randomUUID(); // Token opaco, não relacionado ao ID

// No Supabase, criar tabela share_tokens:
// create table share_tokens (token uuid primary key, setlist_id uuid, role text, expires_at timestamp);

// Ao processar link:
// Validar se o token existe e não expirou → obter setlist_id do servidor
```

> [!NOTE]
> Esta correção requer uma tabela adicional no banco (`share_tokens`). É a abordagem mais segura. 
> Como alternativa mais simples (sem nova tabela), aumentar a entropia do ID: usar `crypto.randomUUID()` 
> para gerar os IDs de setlist ao invés de `Date.now() + 4 chars`.

---

#### Passo 2.5 — [MODIFY] `src/lib/supabase.ts` — Remover logs sensíveis em produção

```typescript
// Substituir:
console.error('Sync to Supabase error:', err);

// Por:
if (import.meta.env.DEV) {
  console.error('[DEV] Sync to Supabase error:', err);
}
```

---

### FASE 3 — Melhorias de Arquitetura e Código

#### Passo 3.1 — Usar `crypto.randomUUID()` em todos os IDs

Substituir o padrão de geração de IDs:

```typescript
// Antes (fraco — apenas 4 chars aleatórios após timestamp):
id: `song_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`

// Depois (seguro — 122 bits de entropia):
id: crypto.randomUUID()
```

Aplicar em: `addCatalogSong`, `createSetlist`, `addBlock`, `addSongToBlock`, `sendInvitation`.

---

#### Passo 3.2 — Adicionar Content Security Policy (CSP) Header

No arquivo `public/index.html` ou via Vercel (`vercel.json`), adicionar headers de segurança:

```json
// vercel.json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-XSS-Protection", "value": "1; mode=block" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; frame-src https://www.cifraclub.com.br; img-src 'self' data: blob:; script-src 'self' https://va.vercel-scripts.com; connect-src 'self' https://*.supabase.co wss://*.supabase.co"
        }
      ]
    }
  ]
}
```

---

#### Passo 3.3 — Validação de Role no Link de Compartilhamento

```typescript
// App.tsx — antes de chamar joinSetlistViaLink:
const rawRole = urlParams.get('role');
// Aceitar APENAS 'edit' ou 'view', ignorar qualquer outra coisa
const shareRole: 'edit' | 'view' = rawRole === 'view' ? 'view' : 'edit';
```

---

## 📊 Resumo das Vulnerabilidades

| # | Vulnerabilidade | Severidade | Tipo | Fase |
|---|---|---|---|---|
| 1 | Autenticação falsa (sem backend) | 🔴 CRÍTICA | Auth Bypass | 1 |
| 2 | RLS desativado no Supabase | 🔴 CRÍTICA | Data Exposure | 1 |
| 3 | Credenciais hardcodadas no código | 🟠 ALTA | Information Disclosure | 1 |
| 4 | Upload sem validação real de tipo | 🟠 ALTA | File Upload | 2 |
| 5 | Entradas sem sanitização | 🟠 ALTA | XSS/Injection | 2 |
| 6 | Link de compartilhamento adivinhável | 🟡 MÉDIA | IDOR | 2 |
| 7 | Identidade de membros perdida | 🟡 MÉDIA | Logic Flaw | 2 |
| 8 | Logs sensíveis em produção | 🟢 BAIXA | Info Disclosure | 2 |
| 9 | IDs fracos (timestamp+4chars) | 🟢 BAIXA | IDOR | 3 |
| 10 | Sem Security Headers HTTP | 🟢 BAIXA | Browser Security | 3 |
| 11 | Role do link não validado server-side | 🟡 MÉDIA | Privilege Escalation | 3 |

---

## ⚠️ Aviso Importante

> [!CAUTION]
> A **CRÍTICA 1 (autenticação falsa)** é o problema mais urgente. Atualmente, qualquer pessoa
> que saiba seu e-mail pode "fazer login" como você e ver/editar todos os seus dados.
> Isso precisa ser corrigido **antes de qualquer divulgação do app**.

> [!IMPORTANT]
> A **CRÍTICA 2 (RLS)** pode ser corrigida em minutos apenas executando o SQL acima
> no painel do Supabase. Custo zero, impacto máximo.

---

## 📁 Arquivos Impactados

| Arquivo | Ação | Fase |
|---|---|---|
| SQL no Supabase | RLS + políticas + trigger | 1 |
| `src/components/auth/AuthModal.tsx` | Integrar Supabase Auth real | 1 |
| `src/lib/storage.ts` | Remover DEFAULT_USER hardcodado | 1 |
| `src/lib/supabase.ts` | Fix fetch members + logs | 2 |
| `src/lib/sanitize.ts` | Criar módulo de sanitização (NOVO) | 2 |
| `src/components/catalog/CatalogView.tsx` | Validação de upload | 2 |
| `src/App.tsx` | Validar role do link | 3 |
| `vercel.json` | Security headers (NOVO) | 3 |
| Múltiplos arquivos | Substituir IDs por `crypto.randomUUID()` | 3 |

---

## 🔄 Re-Auditoria e Varredura Completa (29/07/2026)

> **Status da Varredura**: Concluída  
> **Resultado**: Todos os pontos críticos anteriores (Autenticação Falsa, Credenciais Hardcodadas, Ausência de Headers e Inexistência de Sanitização) foram **CORRIGIDOS E RESOLVIDOS**.

### ✅ Resumo das Correções Confirmadas na Varredura:
1. **Autenticação Real com Supabase**: `AuthModal.tsx` utiliza `client.auth.signInWithPassword` e `signUp`.
2. **Remoção de Credenciais Hardcodadas**: `DEFAULT_USER` e e-mails fictícios removidos do código-fonte.
3. **Cabeçalhos de Segurança & CSP**: `vercel.json` configurado com `nosniff`, `DENY` e regras restritivas de `Content-Security-Policy`.
4. **Sanitização de Inputs**: Módulo `src/lib/sanitize.ts` criado e aplicando limites e remoção de caracteres de controle.
5. **Proteção em Iframes**: `CifraWebviewModal.tsx` configurado com política estrita de `sandbox`.

### 📌 Pendências Restantes Mapeadas no `security_plan.md`:
1. **Upload de Anexos**: Chamar `isAllowedFileType()` dentro de `SongDocumentsModal.tsx` para assegurar rejeição de arquivos não permitidos pelo navegador.
2. **RLS no Banco de Dados**: Confirmar no dashboard do Supabase a ativação das políticas RLS no servidor PostgreSQL.

---

*Última varredura e re-auditoria realizada em 29/07/2026.*

