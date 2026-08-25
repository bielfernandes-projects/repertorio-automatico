# Polling curto (5-10s) em vez de Supabase Realtime para colaboração

O app entrega "colaboração em tempo real" via polling de 5-10s no setlist aberto + re-fetch em `visibilitychange` (tab focus), **não** via `client.channel('postgres_changes')`. Decisão tomada apesar de o Supabase suportar Realtime nativamente.

**Motivos**: (a) simplifica reconexão, ack, merges de patches parciais; (b) custa zero quota Realtime do Supabase Free; (c) o SLA resultante ("atualiza em segundos") ainda cumpre o pitch de venda — ecossistema de banda de música em ensaio. A complexidade de reconciliação com tombstones offline-first combinada com Realtime de push-on-write ultrapassa o benefício para o público-alvo.

**Consequences**: o pitch de marketing deve dizer "segundos" não "ao vivo". Se a demandslag reasser necessária, adicionar Realtime depois é aditivo (composed com polling), não breaking change.