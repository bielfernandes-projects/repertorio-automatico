# Repertório Automático

Organizador e gerenciador de repertórios musicais para bandas, músicos solo e ministérios. O app centraliza em um só lugar o acervo de cada músico e a montagem de seus shows, permitindo consultar em segundos o tom solicitado de cada música para cada apresentação e colaborar com outros integrantes do grupo.

## Limite de Escopo

O aplicativo busca, cacheia e renderiza nativamente letra e cifra, transpostas para o Tom solicitado, e permite anexar partituras próprias em PDF ou imagem. O conteúdo é obtido de fontes externas (Cifra Club para cifra, LRCLIB para letra) e sempre creditado com link para a página de origem. Ver ADR 0009 — até então o app não armazenava cifra alguma, apenas gerava URLs externas exibidas em iframe.

## Idioma

O app é distribuído em **Português Brasileiro (PT-BR)** e **Inglês (EN)**. Strings ubíquas em PT-BR são a fonte de verdade do glossário abaixo; a tradução para EN segue os mesmos termos canonicalizados.

---

## Language

### Entidades de domínio

**Catálogo**:
Acervo privado de músicas cadastradas por um Músico. Cada música tem Nome, Artista e Tom de origem.
_Evitar_: Biblioteca, Coleção, Lista de músicas

**Música do Catálogo**:
Uma entrada do catálogo. Pertence a exatamente um Músico e é referenciada por zero ou mais Itens de Bloco.
_Evitar_: Cifra, Canção

**Documento**:
Arquivo de partitura anexado a uma Música do Catálogo (PDF ou imagem). Limite de 5 arquivos por música.
_Evitar_: Anexo, Partitura (genérico), Arquivo, PDF

**Setlist**:
Coleção nomeada que representa um show, ensaio ou evento. Possui Blocos e Membros. Tem exatamente um Dono.
_Evitar_: Lista, Repertório (sinônimo do app todo)

**Bloco**:
Agrupamento conceitual de músicas dentro de um Setlist (ex: "Pagode Lado A", "Comunhão"). Possui Nome, Tema e uma Posição ordenável.
_Evitar_: Seção, Parte, Grupo

**Tema de Bloco**:
Texto livre que nomeia o caráter musical ou litúrgico do Bloco. Gera um badge visual cuja cor é determinística em função do texto.
_Evitar_: Categoria, Tag, Etiqueta

**Item de Bloco**:
Referência de uma Música do Catálogo dentro de um Bloco concreto. Possui Tom solicitado, Tom de referência (snapshot do Tom de origem no instante da atribuição), Observação e Posição.
_Evitar_: Música no show, Item

**Observação de Item**:
Texto livre anexado a um Item de Bloco com instruções para a performance (ex: "Começa do solo", "Crescente em colcheia").
_Evitar_: Nota (ambíguo), Comentário, Descrição

### Tons

**Tom de origem**:
Tom em que a música está cadastrada no Catálogo. Editável, é o tom "real" da música para o Músico dono.
_Evitar_: Tom original (ambíguo), Tom real, Key

**Tom de referência**:
Snapshot do Tom de origem no instante em que a música foi adicionada a um Bloco. Não muda quando o Tom de origem é editado posteriormente.
_Evitar_: Tom original no bloco, Tom fixo, Snapshot

**Tom solicitado**:
Tom que o cantor pediu para tocar naquela apresentação específica. Vive no Item de Bloco, não no Catálogo — a mesma música pode ser solicitada em tons diferentes em blocos diferentes.
_Evitar_: Tom pedido, Tom de execução, Tone

**Drift**:
Diferença entre o Tom de origem atual e o Tom de referência. Indica que o Tom de origem foi alterado no Catálogo depois que o Item foi fixado no Bloco, e que o Tom solicitado pode precisar ser revisado.
_Evitar_: Descompasso, Diferença de tom, Desvio

### Membros e compartilhamento

**Músico**:
Usuário autenticado do app. Possui E-mail e Nome de exibição. Pode ser Dono, Editor, Visualizador ou Convidado dependendo do Setlist.
_Evitar_: Usuário (ambíguo com usuários anônimos), Conta

**Dono**:
Músico que criou o Setlist. Pode convidar, revogar, editar tudo, excluir o Setlist e duplicá-lo. Indissociável do Setlist.
_Evitar_: Admin, Criador, Owner

**Editor**:
Membro de um Setlist convidado com papel de edição. Pode montar (adicionar/remover músicas, reordenar itens, criar/excluir Blocos, editar Tons solicitados e Observações), mas não convida nem exclui o Setlist.
_Evitar_: Editor (subset de permissões), Co-dono

**Visualizador**:
Membro de um Setlist convidado com papel de leitura. Consulta a ordem, Tons solicitados, abre cifras e Documents, mas não edita.
_Evitar_: Viewer, Convidado sem permissão

**Membro**:
Músico que tem acesso persistente a um Setlist específico. Ou é Dono, Editor ou Visualizador.
_Evitar_: Participante, Integrante

**Convidado**:
Músico que recebeu um Link de Acesso mas ainda não aceitou entrar como Membro. Não enxerga o Setlist até aceitar.
_Evitar_: Pendente, Pré-membro

**Link de Acesso**:
URL curta gerada pelo Dono (ex: `/s/A7F3K9?role=edit`) que dá ingresso a um Setlist com um papel fixo. Pode ser revogada/regenerada pelo Dono. Elimina o conceito de convite por e-mail separado.
_Evitar_: Invite, Convite, Link de compartilhamento (ambíguo)

### Cifra e transposição

**Cifra**:
Letra de uma música acompanhada dos acordes, buscada de fonte externa e renderizada nativamente pelo app, transposta para o Tom solicitado calculado a partir do Drift.
_Evitar_: Tablatura, Tab, Letra

**Letra**:
Apenas o texto cantado de uma música, sem acordes. É o que a Visualização por Role exibe para quem canta, e o fallback quando não há Cifra disponível na fonte externa.
_Evitar_: Lyrics, Texto

**Cifra Parseada**:
Representação interna de uma Cifra após o parsing: uma lista de linhas, cada uma com o texto da letra e os acordes posicionados por índice de caractere. É sobre ela que a transposição opera.
_Evitar_: Cifra processada, Chart, ChordPro

**Cache de Cifra**:
Armazenamento compartilhado de Cifras Parseadas, indexado por Slug de Cifra e comum a todos os Músicos. Não expira: só é renovado por ação explícita de atualizar.
_Evitar_: Cache local, Cifra salva

**Slug de Cifra**:
Identificador de Artista/Música na URL do Cifra Club (`cifraclub.com.br/{slug-artista}/{slug-musica}`). Derivado automaticamente de Nome/Artista, mas pode ser sobrescrito por Override.
_Evitar_: Identificador, Url-key

**Override de Slug**:
Estado de verdade do par de slugs de uma Música do Catálogo. Quando preenchido (manualmente ou por colar uma URL completa do Cifra Club), congela os slugs — editar Nome/Artista no Catálogo **não** re-deriva a URL. Badge "URL manual" o destaca visualmente.
_Evitar_: Slug manual, Slug override (termo interno), Custom URL

### Sincronização e replicação

**Verdade Local**:
Princípio arquitetural onde o dispositivo do Músico é a fonte verdadeira do estado de domínio durante a edição. O Supabase espelha. Funciona offline por tempo indeterminado.
_Evitar_: Cache local (errado — cache é secundário; aqui é font), Estado offline

**Tombstone**:
Registro explícito de que uma entidade foi apagada. Elimina a ambiguidade de "está ausente porque foi apagado ou porque ainda não sincronizou". Toda deleção gera um; a entidade é removida da nuvem e dos merges somente quando um tombstone existe.
_Evitar_: Marker de deleção, Soft delete, Lápide

**Drift de Fetch**:
Intervalo máximo plausível entre uma mutação por um Membro e a chegada visual ao outro Membro. Aceito em segundos, não em tempo real.
_Evitar_: Latência, Atraso, Realtime

### Planos e monetização

**Plano Free**:
Plano padrão ao se cadastrar. Permite até 16 Músicas do Catálogo e 1 Setlist, sem Documents, sem convidar e entrar via Link de Acesso apenas como Visualizador.
_Evitar_: Plano básico, Free tier, Trial não-premium

**Plano Premium**:
Plano pago que remove os limites do Free. Permite catálogo ilimitado, Setlists ilimitados, 5 Documents por música, convidar Membros e entrar via Link de Acesso como Editor.
_Evitar_: Plano Pro, Plano pago, Plus

**Trial Premium**:
Período de 7 dias em que todo Músico recém-cadastrado é tratado como Premium. Expira automaticamente para Plano Free sem intervenção.
_Evitar_: Período grátis, Plano temporário

**Vitalício**:
Modalidade de pagamento que ativa o Plano Premium por tempo indeterminado após um pagamento único. É revertido automaticamente para Plano Free apenas se o pagamento for reembolsado.
_Evitar_: Lifetime, Compra única, Pay-once

**Mensal**:
Modalidade de pagamento de assinatura recorrente do Plano Premium. Cancelada pelo Músico reverte para Plano Free ao fim do ciclo.
_Evitar_: Subscription, Assinatura, Recorrente