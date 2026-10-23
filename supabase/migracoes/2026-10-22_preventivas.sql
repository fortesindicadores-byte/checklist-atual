-- Visão Preventivas: ponto de partida das revisões (22/10/2026)
-- ── ponto de partida das revisões (22/10/2026): última revisão feita ANTES do sistema, informada pelo admin.
--    Não é checklist (nada retroativo): só a base de cálculo da próxima. O mais recente por ativo×revisão vale.
create table if not exists ck_prev_base (
  id         uuid primary key default gen_random_uuid(),
  ativo_id   text not null references ck_ativos(id),
  modelo_id  text not null references ck_modelos(id),
  leitura    numeric check (leitura is null or leitura >= 0),
  data       date not null,
  criado_em  timestamptz not null default now(),
  criado_por uuid references ck_usuarios(id)
);
create index if not exists ck_prev_base_am on ck_prev_base (ativo_id, modelo_id, criado_em desc);
alter table ck_prev_base enable row level security;

-- depois: rodar supabase/rpc.sql inteiro (ck_prev_base_salvar + dataset com prev_base) e notify pgrst, 'reload schema';
