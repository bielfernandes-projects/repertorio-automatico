# Offline-first com localStorage como verdade local e Supabase como espelho

O dispositivo do Músico (`localStorage`) é a source de truth do estado de domínio durante a edição. O Supabase espelha o estado local via `syncLocalDataToSupabase()` em cada mutação e via merge bidirecional em mount. Funciona offline por tempo indeterminado (palco ou ensaio sem wifi).

**Motivos**: (a) o público-alvo (bandas em ensaio, ministérios em culto) frequentemente não tem wifi; (b) offline-first com tombstones já resolveu bugs de "itens zumbis" e "deleção vira suck" que reaparecem em merge strategies alternativas; (c) portar a infraestrutura de tombstones+merge da v1 é custo-efetivo vs re-desenvolver.

**Consequences**: a camada de sync (`plan.ts`, `supabase-adapter.ts`), tombstones (`DeletionRecord`) e revision-cache são portadas literalmente; novos bugs surgem apenas se essa camada for tocada. O `localStorage` precisa ser limpo em `SIGNED_OUT` para evitar leak de dados cross-account.