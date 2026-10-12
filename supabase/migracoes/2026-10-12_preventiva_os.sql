-- Migração 12/10/2026: preventivo = OS. Rodar em DUAS chamadas (ALTER TYPE fora da transação que usa o valor).
-- 1)
alter type ck_resposta add value if not exists 'nf';
-- 2) trigger ck_os_congelada (schema.sql) + funções ck_prev_item, ck_preventiva_iniciar, ck_preventiva_finalizar, ck_dataset, ck_modelo_salvar + grant (rpc.sql)
