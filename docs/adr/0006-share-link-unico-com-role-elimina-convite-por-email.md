# Share Link único com role (elimina convite por e-mail)

O compartilhamento de setlists usa um único Link de Acesso por setlist (`/s/{short_id}?role={editor|viewer}`) gerado pelo Dono na tabela `setlist_share_links`. O convidado não-Membro vê um modal "aceitar este convite como [role]"; não há auto-join. O Dono pode revogar/regenerar o link a qualquer momento. O convite por e-mail separado (`setlist_invites` com `status='pending'`) e a sentinela `__link_share__` são eliminados.

**Motivos**: (a) o público-alvo (bandas de música, ministérios) usa WhatsApp, não email; sem SMTP próprio o convite por e-mail fica pending-policy-purgatório; (b) a sentinela `__link_share__` foi origem de um vazamento histórico corrigido em Julho/2026 — eliminar a camada elimina a classe de bug; (c) um único link simplifica UI e backend.

**Considered Options**: (a) status quo (email + link) — recusado por duplicate backend e reprint do bug de vazamento; (b) convite só por email — recusado porque requer SMTP e fricção WhatsApp baixa conversão.

**Consequences**: Old `setlist_invites` e `__link_share__` (se ainda existentes no v1 DB) são migrados para `setlist_share_links` com `role` default `viewer`. RLS policies atualizadas para usar `has_share_link(session.user.id, setlist_id)` que lê a nova tabela.