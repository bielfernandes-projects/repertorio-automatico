# Greenfield total portando a camada de sync

Decidimos reescrever o app do zero (pasta sibling `repertorio-automatico-v2/`) em vez de refatorar incrementalmente o repo atual. A camada de sincronização (`src/lib/sync/` com `plan.ts` + `supabase-adapter.ts` + `in-memory-adapter.ts` + testes), `merge.ts`, `revision-cache.ts`, `ids.ts` e `types.ts` (tombstones) são portadas literalmente. O resto (App shell, componentes, auth, Realtime, premium, sharing via share-link) é reconstruído.

**Considered Options**: (a) refatorar incrementalmente — recusado porque os 5 componentes gigantes (>400 linhas cada) e o `App.tsx` com 5 concerns mixed inviabilizam refactor safe; (b) greenfield puro sem portar nada — recusado porque reacende uma classe inteira de bugs de sync/zumbi/link-share-leak já aspetrados; (c) greenfield + sync portado — aceito.

**Consequences**: reescrever UI é mais lento no início mas corta classes de bug estruturais; o risco de regressão semântica concentra-se na camada portada (mitigado pelo suite de testes existente).