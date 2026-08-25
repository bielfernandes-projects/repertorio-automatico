# Realtime híbrido: `postgres_changes` apenas para o ponto atual do palco

Catálogo e setlist continuam em polling de 5-10s + refetch em `visibilitychange`, como decidido
na ADR 0002. **Exceção pontual**: o "ponto atual" do Ponto Eletrônico Visual (qual Bloco e qual
Item de Bloco a banda está tocando agora) usa Supabase Realtime via `postgres_changes`. O estado
é um campo persistido em `setlists` (`current_block_id`, `current_item_id`) atualizado por escrita
normal; os dispositivos assinam as mudanças **apenas dessa linha**. Dono e Editores podem avançar.

**Motivos**: (a) o SetSync reposiciona o produto para a experiência de palco mission-critical, e
"a tela de todos atualiza em até 10 segundos" não é aceitável quando o Diretor Musical pula uma
música no meio de um medley — este é o único dado do app com esse requisito de latência;
(b) o escopo é minúsculo (dois inteiros por setlist aberta), então o consumo de quota Realtime
fica muito abaixo do que a ADR 0002 temia ao considerar sincronizar o setlist inteiro;
(c) a ADR 0002 já previa explicitamente que adicionar Realtime depois seria aditivo, composto com
o polling, e não breaking — é exatamente o que se faz aqui.

**Considered Options**: (a) manter polling puro — recusado porque o pitch central do produto
("ponto eletrônico") deixa de existir; (b) canal de broadcast efêmero, sem persistir — recusado
porque quem chega atrasado, recarrega a página ou reconecta depois de uma queda de rede não
receberia o estado atual, exigindo um fallback REST e lógica de reconciliação cliente-side que o
campo persistido resolve de graça; (c) migrar tudo para Realtime — recusado, reabre exatamente a
complexidade de reconciliação com tombstones offline-first que motivou a ADR 0002.

**Consequences**: a ADR 0002 permanece válida para todo o resto do app e **não** é substituída;
esta ADR a estreita. A reconciliação offline-first (merge last-write-wins + tombstones) não muda,
porque o ponto atual é estado de sessão de palco, não conteúdo editável — em conflito, o último
write vence e isso é o comportamento desejado. O RLS existente de `setlists` já governa quem lê o
campo; é preciso acrescentar policy de escrita restrita a Dono e Editores. O marketing agora pode
dizer "ao vivo" **apenas** sobre o ponto eletrônico; para o restante, continua valendo "segundos".
