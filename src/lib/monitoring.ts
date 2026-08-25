import * as Sentry from '@sentry/react';

// Monitoramento de erros em produção (PLAN.md 2.9).
// O SetSync é usado no palco: quando algo quebra durante um show,
// o músico não vai abrir um chamado — ele vai desistir do app. Por
// isso o erro precisa chegar até nós sozinho.

const DSN = (((import.meta as any).env?.VITE_SENTRY_DSN as string) || '').trim();

// Padrões que nunca devem sair do dispositivo. O app manipula e-mail
// de integrantes e chaves do Supabase em querystring; o Sentry não
// scrubba nada disso sozinho.
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const SEGREDO_NA_URL = /([?&](?:apikey|access_token|refresh_token|token)=)[^&#\s]+/gi;

function limpar(texto: string): string {
  return texto.replace(EMAIL, '[email]').replace(SEGREDO_NA_URL, '$1[removido]');
}

// Percorre o evento inteiro porque dado sensível aparece em lugares
// imprevisíveis: mensagem, nome de exception, valor de breadcrumb, URL.
function limparProfundo<T>(valor: T): T {
  if (typeof valor === 'string') return limpar(valor) as unknown as T;
  if (Array.isArray(valor)) return valor.map(limparProfundo) as unknown as T;
  if (valor && typeof valor === 'object') {
    const saida: Record<string, unknown> = {};
    for (const [chave, item] of Object.entries(valor as Record<string, unknown>)) {
      saida[chave] = limparProfundo(item);
    }
    return saida as unknown as T;
  }
  return valor;
}

export function initMonitoring(): void {
  // Sem DSN o monitoramento simplesmente não existe. Isso mantém
  // `npm run dev` e qualquer fork do projeto funcionando sem conta
  // no Sentry, em vez de encher o console de erro de configuração.
  if (!DSN) return;

  Sentry.init({
    dsn: DSN,
    environment: ((import.meta as any).env?.MODE as string) || 'development',

    // Nunca anexar IP, cookies ou headers do usuário.
    sendDefaultPii: false,

    // Só erros. Tracing e Session Replay ficam de fora: custam banda
    // no 4G ruim do palco e Replay capturaria a letra na tela.
    tracesSampleRate: 0,

    // O app é offline-first. Com o transporte padrão, todo erro que
    // acontece justamente no cenário mais crítico — palco sem rede —
    // seria descartado. O transporte offline guarda em IndexedDB e
    // reenvia quando a conexão volta.
    transport: Sentry.makeBrowserOfflineTransport(Sentry.makeFetchTransport),

    beforeSend: (evento) => limparProfundo(evento),
    beforeBreadcrumb: (breadcrumb) => {
      // Breadcrumb de console costuma carregar payload inteiro de sync.
      if (breadcrumb.category === 'console') return null;
      return limparProfundo(breadcrumb);
    },
  });
}

// As duas áreas mais frágeis do sistema, marcadas para poderem ser
// filtradas e alertadas separadamente no Sentry.
export type AreaCritica = 'sync' | 'cifra';

export function reportarErro(area: AreaCritica, erro: unknown, contexto?: Record<string, unknown>): void {
  if (!DSN) return;
  Sentry.withScope((escopo) => {
    escopo.setTag('area', area);
    if (contexto) escopo.setContext('detalhes', limparProfundo(contexto));
    Sentry.captureException(erro);
  });
}
