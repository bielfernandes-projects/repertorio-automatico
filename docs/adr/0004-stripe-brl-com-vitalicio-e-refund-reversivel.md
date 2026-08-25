# Stripe BRL com vitalício e reversão automática em refund

Adotamos Stripe como único gateway de pagamento, em BRL, com dois products: mensal (R$7,90, Subscription) e vitalício (R$89,90, PaymentIntent one-off). O webhook `charge.refunded` reverte automaticamente `plan` para `free` + marca `payment_history.status='refunded'`. `payment_intent.succeeded` e `invoice.paid` ativam `plan='premium'`.

**Considered Options**: (a) Appmax BR-only — recusado porque bloqueia público internacional e você planeja divulgar gringo; (b) Stripe vitalício sem reversal — recusado porque permite chargeback-rollover sem proteção; (c) Stripe sem vitalício (só subscription) — recusado porque perde pitch de R$89,90 único que converte primeira wave.

**Consequences**: i18n deve suportar números de moeda (BRL formatado). Stripe BR exige KYC mínimo. `payment_history` + `profiles.plan` + `premium_trial_ends_at` são migrations obrigatórias. Admin panel deve poder reverter manualmente também.