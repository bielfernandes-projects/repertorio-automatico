# i18n skeleton PT/EN com i18next desde o dia 1

Adotamos `i18next` + `react-i18next` no setup inicial do projeto, com namespace PT totalmente preenchido e namespace EN com chaves idênticas marcadas `TODO`. Switch de idioma visível no perfil. O app lança em PT-BR primeiro; EN vira default quando a tradução estiver completa.

**Motivos**: você planeja divulgar o app para público gringo. Adicionar i18n depois em app madura é refatoração mecânica de 3-5 dias em centenas de pontos. Adicionar desde o início é custo de setup contido (~2-4h) + boilerplate moderado por cada nova string. O `billing/` Stripe já nasce i18n-ready.

**Considered Options**: (a) PT-BR fixo, i18n na fase 2 — recusado pelo custo futuro conhecido; (b) EN-default com PT fallback — recusado porque aliena a base BR atual; (c) i18n escondido até o launch intl — recusado porque esconde a feature atrás de refactor.

**Consequences**: cada nova string UI precisa entrar em ambas namespaces (PT preenchida, EN com TODO ou traduzida). O `cifra/model` (NOTE_MAP, transpose logic) é termo-canônico (Dó/Ré/Mí são PT; em EN usa C/D/E) — namespace EN mapeia letras para exibição names.