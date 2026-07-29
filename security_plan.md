# Plano de Ação de Segurança (Security Action Plan)

> **Data de Atualização**: 29/07/2026  
> **Status**: Pronto para execução futura  
> **Objetivo**: Guiar as correções técnicas e ajustes finos de segurança identificados na varredura completa do projeto **Repertório Automático**.

---

## 🎯 Visão Geral do Status Atual

Na varredura realizada em 29/07/2026, verificamos que os problemas **CRÍTICOS** anteriores (como autenticação simulada e credenciais hardcodadas) foram corrigidos. A aplicação já conta com:
- **Autenticação Real com Supabase SDK** (`AuthModal.tsx`).
- **Remoção de credenciais padrão/hardcodadas** (`DEFAULT_USER` removido).
- **Headers de Segurança & CSP em `vercel.json`** (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy`).
- **Sanitização de texto e limitação de caracteres** (`sanitizeText` em `sanitize.ts`).
- **Iframe Sandboxing** para cifras em `CifraWebviewModal.tsx`.

---

## 📋 Itens a Serem Corrigidos (Plano de Trabalho)

### 🔴 Item 1 — Validação Estrita de Tipo de Arquivo no Upload de Anexos
- **Arquivo Impactado**: [src/components/common/SongDocumentsModal.tsx](file:///c:/Users/Gabriel%20Fernandes/OneDrive%20-%20LEMA/Desktop/Pessoal/repertorio-automatico-novo/src/components/common/SongDocumentsModal.tsx#L113-L130)
- **Problema**: O formulário de anexos de partituras/documentos checa apenas `file.type.includes('pdf')` / `file.type.includes('image')`, ignorando a validação de extensão e MIME types do módulo `isAllowedFileType()` em `src/lib/sanitize.ts`.
- **Ação Recomendada**:
  1. Importar `isAllowedFileType` de `../../lib/sanitize`.
  2. Antes de processar cada arquivo em `handleFileUpload`:
     ```typescript
     if (!isAllowedFileType(file.name, file.type)) {
       showToast(`Formato de arquivo não permitido: "${file.name}". Use PDF ou imagens (PNG, JPG, GIF, WebP).`, 'error');
       setIsUploading(false);
       return;
     }
     ```
- **Prioridade**: Alta 🟠

---

### 🟠 Item 2 — Verificação de RLS (Row Level Security) no Painel Supabase
- **Arquivo Impactado**: Supabase Database Server
- **Problema**: O código do cliente já envia solicitações com Supabase SDK e token de autenticação, porém o banco de dados no Supabase precisa ter o RLS habilitado e políticas por `user_id = auth.uid()` aplicadas em todas as tabelas (`songs`, `setlists`, `blocks`, `profiles`, `setlist_members`).
- **Ação Recomendada**:
  1. Acessar o Dashboard do Supabase -> SQL Editor.
  2. Executar o script SQL presente na constante `SUPABASE_SQL_SCHEMA` em [src/lib/supabase.ts](file:///c:/Users/Gabriel%20Fernandes/OneDrive%20-%20LEMA/Desktop/Pessoal/repertorio-automatico-novo/src/lib/supabase.ts#L114-L150).
  3. Confirmar que todas as tabelas possuem `ALTER TABLE <tabela> ENABLE ROW LEVEL SECURITY;`.
- **Prioridade**: Alta 🟠

---

### 🟡 Item 3 — Otimização da Content Security Policy (CSP)
- **Arquivo Impactado**: [vercel.json](file:///c:/Users/Gabriel%20Fernandes/OneDrive%20-%20LEMA/Desktop/Pessoal/repertorio-automatico-novo/vercel.json#L11-L13)
- **Problema**: Atualmente a instrução `script-src 'self' 'unsafe-inline'` é utilizada para permitir scripts do bundle. 
- **Ação Recomendada**:
  1. Quando o projeto adotar um ambiente com servidor de renderização ou hashes estáticos, remover `'unsafe-inline'` de `script-src` para reforçar a proteção contra possíveis injeções XSS secundárias.
- **Prioridade**: Média 🟡

---

## 🧪 Plano de Testes & Verificação

Após implementar as correções acima, executar as seguintes verificações:
1. **Teste de Upload Invalido**: Tentar fazer upload de um arquivo `.exe` ou `.html` renomeado e verificar se a aplicação rejeita via Toast informando tipo não permitido.
2. **Teste de Isolamento RLS**: Criar duas contas de usuários distintas e validar se o usuário A não consegue visualizar as músicas/setlists do usuário B no painel.
3. **Build & Lint**: Executar `npm run build` e `npm run lint` para garantir ausência de erros de compilação TypeScript.

---
*Documento criado em 29/07/2026. Reservado para execução posterior pelo desenvolvedor.*
