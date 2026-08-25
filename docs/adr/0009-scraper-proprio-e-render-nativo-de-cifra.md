# Scraper próprio e render nativo de cifra (revoga o "nunca armazenamos cifra")

O app passa a buscar, parsear, cachear e **renderizar nativamente** letra e cifra, em vez de
apenas gerar uma URL externa do Cifra Club exibida em iframe. Uma Vercel Serverless Function
(runtime Node) faz o fetch com um **scraper próprio e leve** (axios + cheerio) sobre o HTML
público do Cifra Club, com **LRCLIB** (`lrclib.net`) como fonte de fallback para letra-apenas. O resultado é
normalizado para `{ text, chords: [{ position, chord }] }` por linha e gravado em
`cifras_cache`, tabela **compartilhada globalmente por música** (chave `artist_slug` +
`song_slug`), sem TTL, com botão manual de atualizar. A tela sempre mantém um link visível
"ver no Cifra Club" para a página original.

**Motivos**: (a) o iframe impede o requisito central da Visualização por Role — não é possível
controlar tamanho de fonte, contraste ou esconder acordes dentro de um documento de terceiros,
e a cantora precisa de letra em fonte gigante enquanto o guitarrista vê a cifra;
(b) o iframe não funciona offline, o que contradiz a premissa do produto de sobreviver a um palco
sem 4G; (c) o Cifra Club bloqueia embedding em muitas páginas, e o `CifraWebviewModal` atual já
precisa de uma UI de fallback "abrir no navegador externo" — a experiência já estava degradada;
(d) transpor o texto localmente elimina o round-trip de recarregar a página externa a cada clique
de mudança de tom.

**Considered Options**: (a) manter iframe — recusado pelos motivos acima; (b) usar
`code4music/cifraclub-api` como dependência de runtime, conforme cogitado no briefing inicial —
recusado após avaliação: usa Selenium WebDriver, só roda auto-hospedada via `docker-compose`, não
expõe endpoint público e o próprio README a descreve como automação pessoal, não produção; serve
como referência de onde os acordes ficam no HTML, não como dependência; (c) usar
`letras-de-musica` como fallback de letra — recusado por ser scraper puro do site, sem SLA;
(c2) **Vagalume** — foi a escolha original desta ADR, revertida antes de qualquer implementação:
em Agosto/2026 o serviço respondeu 503 tanto em `auth.vagalume.com.br` (impedindo gerar o token)
quanto em `api.vagalume.com.br`. Uma dependência que exige credencial de um portal fora do ar é
um ponto único de falha inaceitável para o fallback; (c3) `api.lyrics.ovh` — recusado por cobertura
inferior, falhou em uma de três músicas brasileiras testadas, contra 7 de 7 da LRCLIB; (d) cache por usuário — recusado, multiplicaria requisições ao Cifra
Club por banda e aumentaria o risco de bloqueio sem nenhum ganho, já que a cifra de uma música
não varia por usuário.

**Consequences**: o "Limite de Escopo" do `CONTEXT.md` ("o aplicativo não armazena cifras
internamente") deixa de valer e precisa ser reescrito; o glossário ganha os termos Cifra Parseada
e Cache de Cifra. O app passa a ter um componente de backend próprio (a serverless function),
onde antes era client + Supabase apenas — Sentry cobre esse ponto novo de falha. Como o scraper
depende do HTML de terceiros, ele **vai** quebrar eventualmente: por isso o cache é indefinido
(uma quebra não apaga o que já funciona) e o parser é testado contra fixtures de HTML locais, sem
rede no CI. A transposição em `src/lib/utils.ts` passa a operar sobre o campo `chord` estruturado,
mantendo `NOTE_MAP` e `computeSemitoneShift`. Os anexos em PDF/imagem (ADR 0005) continuam sendo o
caminho para partituras próprias e não são substituídos por esta decisão.

**Nota sobre a escolha do fallback (revisão)**: a LRCLIB não exige API key, é licenciada sob MIT e
é **auto-hospedável**. Isso é o critério decisivo depois do episódio da Vagalume: se o serviço
público sair do ar, subimos nossa própria instância e o fallback continua existindo — algo
impossível com uma API proprietária de token. Ela devolve ainda `duration` e, na maioria dos casos,
`syncedLyrics` (timestamps por linha, formato LRC), ambos persistidos em `cifras_cache` desde o MVP:
vêm de graça no mesmo fetch e habilitam o auto-scroll exato do Modo Solo (backlog), enquanto
capturá-los depois obrigaria a refazer o fetch de todo o cache. Como cortesia ao serviço, as
requisições devem enviar um `User-Agent` identificando o app e uma forma de contato.
