# Anexos de Documentos no Supabase Storage com signed URLs (1h de expiração)

Os anexos PDF/imagem das Músicas do Catálogo são armazenados em um bucket privado do Supabase Storage (path `songs/{user_id}/{song_id}/{doc_id}`), não mais como `dataUrl` base64 embutido em `songs.documents` JSONB. A coluna JSONB agora guarda apenas metadados (id, name, type, size, storage_path). As UIs usam URLs assinadas (`createSignedUrl`, 1h de expiração) para renderizar `<img>`/`<iframe>`.

**Motivos**: (a) base64 em JSONB crashe o `RevisionCache` (3GB JSON parse em catálogos médios); (b) free tier Supabase DB é 500MB mas Storage é 1GB praticamente grátis e scale de $0.021/GB/mês — para 50 músicas × 5 Documents × 100MB = 25GB ≈ $0.50/mês total de todos usuários; (c) signed URLs são o padrão de S3-style storage e encaixam em RLS por usuário.

**Considered Options**: (a) manter base64 mas reduzir para 2MB — recusado por ser jogando de performance; (b) Cloudflare R2 — recusado porque adiciona um serviço extra para gerir; (c) híbrido free/premium — recusado por complexidade dual codepath.

**Consequences**: migração one-shot de docs v1 para o bucket é etapa obrigatória no setup. UIs `SongDocumentsModal` e `CifraWebviewModal` precisam aceitar URLs assinadas como src. RLS no bucket: cada usuário vê só `songs/{self}/*`.