-- Migração 12/10/2026: master pode excluir OS (status 'cancelada' + auditoria).
-- Rodar em DUAS chamadas: o ALTER TYPE não pode estar na mesma transação que o uso do novo valor.
-- 1)
alter type ck_status_os add value if not exists 'cancelada';
-- 2) recriar a view ck_v_sla (schema.sql) e as funções ck_os_excluir, ck_salvar_checklist, ck_farol, ck_dataset + grant (rpc.sql).
