-- ============================================================
-- CHECKLIST ATUAL — esquema do banco (v2, 12/10/2026)
-- Projeto Supabase PRÓPRIO (org Pro bi-frota-360, projeto "checklist-atual").
-- Modelo de segurança: RLS ligada em tudo, NENHUMA policy para anon; todo
-- acesso do app/portal passa por funções security definer que recebem o token
-- da sessão (ck_sessoes). Fotos e anexos em buckets privados do Storage.
-- Espelha a camada de dados da demo (shared/core.js): mesmos nomes de campos.
-- ============================================================
create extension if not exists pgcrypto with schema extensions;

-- ── enums ──
do $$ begin
  create type ck_papel as enum ('master','admin','frota','motorista');   -- frota = mecânicos e encarregados (rótulo "Mecânico")
  create type ck_status_usuario as enum ('ativo','pendente','bloqueado');
  create type ck_crit as enum ('critica','alta','media','baixa');
  create type ck_status_os as enum ('aberta','em_andamento','fechada','cancelada');   -- cancelada = excluída pelo master (12/10/2026)
  create type ck_resposta as enum ('ok','nc','nf');                        -- nf = tarefa de preventiva não feita (12/10/2026)                             -- sem N/A: o motorista só vê itens do ativo
  create type ck_execucao as enum ('interna','externa');
  create type ck_cat_modelo as enum ('inspecao','preventivo','preditivo');
  create type ck_freq as enum ('diario','semanal','quinzenal','mensal','livre','uso');   -- livre = sob demanda · uso = por km/horímetro (16/10/2026)
exception when duplicate_object then null; end $$;

-- ── cadastros ──
create table if not exists ck_unidades (
  id      serial primary key,
  nome    text not null unique,
  ativa   boolean not null default true
);

create table if not exists ck_tipos (                 -- tipo de ativo = checklist diário real da Atual
  id            text primary key,                      -- CAMINHAO, CAVALO, PIPA, COMBOIO, ESPARG, LEVE, KOMBI, REBOQUE, RETRO, ESCAV, MINI, CARREG, MOTO, ROLO, VIBRO, EQUIP
  nome          text not null,
  grupo         text not null check (grupo in ('rodo','maq','impl')),
  medidor       text check (medidor in ('km','h')),    -- null = não registra leitura
  icone         text,
  diario_ativo  boolean not null default true,         -- admin pode desligar o diário do tipo
  ordem         int not null default 0
);

create table if not exists ck_itens (                 -- catálogo: criticidade, prazo e bloqueio são INDEPENDENTES
  id        text primary key,
  categoria text not null,
  nome      text not null,
  dica      text,                                      -- orientação que aparece embaixo do item no app
  ex        text,                                      -- exemplo de observação (placeholder no app; v2 do catálogo, 12/10/2026)
  crit      ck_crit not null,
  prazo_h   numeric not null check (prazo_h > 0),      -- horas (fração = minutos) para fechar a OS = meta do SLA
  bloqueia  boolean not null default false,            -- reprovado = ativo não opera
  insp      boolean not null default false,            -- só inspeção da equipe: nunca entra no diário
  sugerido  boolean not null default false,            -- item sugerido na validação (não estava na planilha da Atual)
  ordem     int not null default 0,
  ativo     boolean not null default true
);
create table if not exists ck_itens_tipos (           -- em quais tipos de ativo o item entra no diário
  item_id text references ck_itens(id) on delete cascade,
  tipo_id text references ck_tipos(id) on delete cascade,
  primary key (item_id, tipo_id)
);

create table if not exists ck_modelos (               -- checklists da EQUIPE: inspeção, preventivo, preditivo
  id         text primary key,
  nome       text not null,
  categoria  ck_cat_modelo not null default 'inspecao',
  freq       ck_freq not null,                         -- inspeção: semanal/quinzenal/mensal · preventivo/preditivo: também 'livre'
  tipos      text[] not null,                          -- tipos de ativo cobertos
  ativo      boolean not null default true,
  origem     text not null default 'manual' check (origem in ('manual','planilha')),
  criado_em  timestamptz not null default now(),
  criado_por uuid,
  check (categoria <> 'inspecao' or freq in ('semanal','quinzenal','mensal'))
);
create table if not exists ck_modelos_itens (
  modelo_id text references ck_modelos(id) on delete cascade,
  item_id   text references ck_itens(id),
  ordem     int not null default 0,
  primary key (modelo_id, item_id)
);

create table if not exists ck_usuarios (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  cpf              text not null unique,               -- só dígitos; privado, nunca sai pelas funções de lista
  senha_hash       text,                               -- bcrypt; null = ainda não criou a senha (6 números)
  papel            ck_papel not null default 'motorista',
  papel_solicitado ck_papel,                           -- pedido no "Solicitar acesso"
  status           ck_status_usuario not null default 'pendente',   -- default do servidor: ninguém nasce aprovado
  unidade_id       int references ck_unidades(id),
  especialidade    text,                               -- mecânicos
  telefone         text,
  tentativas       int not null default 0,
  bloqueado_ate    timestamptz,
  origem           text not null default 'portal' check (origem in ('portal','app','planilha','seed')),
  criado_em        timestamptz not null default now(),
  ultimo_acesso    timestamptz,
  aprovado_por     uuid references ck_usuarios(id),
  aprovado_em      timestamptz
);
alter table ck_modelos add constraint ck_modelos_criado_por_fk foreign key (criado_por) references ck_usuarios(id);

create table if not exists ck_sessoes (
  token      uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references ck_usuarios(id) on delete cascade,
  ver_como   uuid references ck_usuarios(id),          -- admin/frota vendo o app como um motorista
  criado_em  timestamptz not null default now(),
  expira_em  timestamptz not null default now() + interval '90 days',
  origem     text check (origem in ('app','portal'))
);

create table if not exists ck_fornecedores (          -- oficinas e prestadores do atendimento externo
  id        uuid primary key default gen_random_uuid(),
  nome      text not null,
  cnpj      text,                                      -- só dígitos (14) ou null
  servico   text,
  contato   text,
  telefone  text,
  email     text,
  cidade    text,
  status    text not null default 'ativo' check (status in ('ativo','inativo')),
  criado_em timestamptz not null default now()
);
create unique index if not exists ck_fornecedores_cnpj on ck_fornecedores (cnpj) where cnpj is not null;

create table if not exists ck_ativos (
  id           text primary key,                       -- placa ou nº de frota (código)
  tipo_id      text not null references ck_tipos(id),
  placa        text,
  frota        text,
  marca        text,
  modelo       text,
  ano          int,
  proprietario text,
  unidade_id   int references ck_unidades(id),
  operador_id  uuid references ck_usuarios(id),        -- operador habitual (opcional)
  itens_fora   text[] not null default '{}',           -- itens do tipo que ESTE ativo não tem (sem N/A para o motorista)
  leitura      numeric,                                -- último km/horímetro
  status       text not null default 'ativo' check (status in ('ativo','inativo')),
  qr_token     uuid not null default gen_random_uuid() -- vai no QR colado no ativo
);
alter table ck_ativos add column if not exists renavam text, add column if not exists chassi text;   -- relação da frota (despacho MPT, 16/10/2026)
create table if not exists ck_documentos (            -- manual, plano do fabricante, laudo preditivo, ART… (Storage anexos/docs/<ativo>/)
  id           uuid primary key default gen_random_uuid(),
  ativo_id     text not null references ck_ativos(id),
  tipo         text not null,
  titulo       text,
  data_ref     date,
  path         text not null,
  nome         text,
  mime         text,
  tamanho      bigint,
  criado_em    timestamptz not null default now(),
  criado_por   uuid references ck_usuarios(id),
  excluido_em  timestamptz,
  excluido_por uuid references ck_usuarios(id)
);
alter table ck_documentos enable row level security;
-- 16/10/2026 (despacho MPT): preventiva por uso e fechamento NR-12
alter table ck_modelos add column if not exists intervalo_km numeric, add column if not exists intervalo_h numeric;
alter table ck_os add column if not exists pecas jsonb not null default '[]', add column if not exists condicao text check (condicao in ('apto','restricao')),
  add column if not exists condicao_obs text, add column if not exists executado_por uuid references ck_usuarios(id), add column if not exists executado_txt text;
alter table ck_os add column if not exists os_externa text;
alter table ck_os add column if not exists pend_de int references ck_os(id);   -- OS aberta por tarefa pendente da preventiva (17/10/2026)   -- nº da OS no sistema de manutenção da Atual (17/10/2026)

-- ── movimento ──
create table if not exists ck_checklists (
  id          uuid primary key default gen_random_uuid(),
  ativo_id    text not null references ck_ativos(id),
  usuario_id  uuid not null references ck_usuarios(id),
  modelo_id   text references ck_modelos(id),          -- null = diário do tipo
  data        timestamptz not null default now(),      -- SEMPRE do servidor (trigger)
  leitura     numeric,
  duracao_s   int,
  itens_total int not null,
  nc          int not null default 0,
  origem      text not null default 'app',
  lat         numeric, lng numeric,
  cliente_id  text                                     -- id gerado no celular (idempotência offline)
);
alter table ck_checklists add column if not exists cancelado_em timestamptz, add column if not exists cancelado_por uuid references ck_usuarios(id), add column if not exists cancelado_motivo text;   -- excluído pelo master (12/10/2026)
create unique index if not exists ck_checklists_cliente on ck_checklists (cliente_id) where cliente_id is not null;
create index if not exists ck_checklists_ativo_data on ck_checklists (ativo_id, data desc);
create index if not exists ck_checklists_usuario_data on ck_checklists (usuario_id, data desc);

create table if not exists ck_respostas (
  checklist_id uuid references ck_checklists(id) on delete cascade,
  item_id      text references ck_itens(id),
  resposta     ck_resposta not null,
  obs          text,
  foto_path    text,                                   -- Storage fotos/<checklist>/<item>.jpg (obrigatória na NC)
  foto_sha256  text,
  primary key (checklist_id, item_id)
);

create table if not exists ck_os (
  id             serial primary key,                   -- exibido como OS-0001
  ativo_id       text not null references ck_ativos(id),
  item_id        text not null references ck_itens(id),
  crit           ck_crit not null,                     -- congelado na abertura (histórico fiel)
  prazo_h        numeric not null,
  bloqueia       boolean not null,
  abertura       timestamptz not null default now(),
  limite         timestamptz not null,                 -- abertura + prazo_h = SLA original (nunca muda)
  limite_atual   timestamptz,                          -- após reprogramação
  status         ck_status_os not null default 'aberta',
  checklist_id   uuid references ck_checklists(id),    -- checklist que abriu
  obs            text,
  foto_path      text,
  aberta_por     uuid references ck_usuarios(id),
  responsavel    uuid references ck_usuarios(id),      -- quem iniciou o atendimento
  execucao       ck_execucao,                          -- escolhido ao iniciar (obrigatório para fechar)
  reincidencias  int not null default 0,               -- reprovado de novo com a OS aberta
  retorno_de     int references ck_os(id),             -- OS fechada há <30d para o mesmo item
  fechada_em     timestamptz,
  fechada_por    uuid references ck_usuarios(id),
  solucao        text,
  foto_fech_path text,
  fornecedor_id  uuid references ck_fornecedores(id),  -- só no externo (opcional)
  custo          numeric,                              -- só no externo (opcional)
  doc_path       text,                                 -- NF ou orçamento no Storage anexos/ (opcional)
  doc_tipo       text check (doc_tipo in ('nf','orcamento')),
  doc_nome       text
);
create index if not exists ck_os_abertas on ck_os (ativo_id, item_id) where status <> 'fechada';
create index if not exists ck_os_abertura on ck_os (abertura desc);

create table if not exists ck_os_eventos (            -- linha do tempo: aberta, em_andamento, reprogramada, reincidencia, fechada, reaberta
  id     bigserial primary key,
  os_id  int references ck_os(id) on delete cascade,
  quando timestamptz not null default now(),
  tipo   text not null,
  por    uuid references ck_usuarios(id),
  texto  text,
  dados  jsonb                                         -- ex.: {novo_limite, motivo} · {checklist_id} na reincidência
);
create index if not exists ck_os_eventos_os on ck_os_eventos (os_id, quando);

create table if not exists ck_log (                   -- uso: login, abertura do app, checklist (cobrança por usuário ativo no mês)
  id         bigserial primary key,
  usuario_id uuid references ck_usuarios(id) on delete cascade,
  evento     text not null,
  origem     text,
  quando     timestamptz not null default now()
);
create index if not exists ck_log_mes on ck_log (usuario_id, quando);

create table if not exists ck_config (                -- cliente, cobrança, Pix, metas (com histórico em ck_auditoria)
  chave text primary key,
  valor jsonb not null
);
insert into ck_config values
  ('cliente',  '{"nome":"Construtora e Pavimentadora Atual Ltda","cnpj":"05253702000109"}'),
  ('cobranca', '{"inclusos":30,"valor_base":300,"valor_usuario":5,"implantacao":3000,"vencimento_dia":10,"apuracao_dia":1,"inicio":"2026-10"}'),
  ('pix',      '{"chave":"fortesindicadores@gmail.com","nome":"RENAN FORTES","cidade":"PALHOCA"}'),
  ('metas',    '{"conformidade":{"verde":90,"amarelo":80},"sla":{"verde":85,"amarelo":70},"inspecoes":{"verde":85,"amarelo":70},"mttr_h":72,"mtbf_d":7}')
on conflict do nothing;

-- ── RLS: tudo fechado; só as funções security definer chegam ──
do $$ declare t text; begin
  for t in select unnest(array['ck_unidades','ck_tipos','ck_itens','ck_itens_tipos','ck_modelos','ck_modelos_itens','ck_usuarios','ck_sessoes',
                               'ck_fornecedores','ck_ativos','ck_checklists','ck_respostas','ck_os','ck_os_eventos','ck_log','ck_config']) loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ── views de apoio ──
create or replace view ck_v_sla as
select o.*,
       coalesce(o.fechada_em, now()) <= o.limite                              as no_prazo,          -- SLA original
       coalesce(o.fechada_em, now()) <= coalesce(o.limite_atual, o.limite)    as no_prazo_atual,
       extract(epoch from (coalesce(o.fechada_em, now()) - o.abertura))/3600  as horas_resolucao,
       (o.status in ('aberta','em_andamento') and now() > coalesce(o.limite_atual, o.limite)) as vencida
from ck_os o where o.status <> 'cancelada';

create or replace view ck_v_usuarios_mes as                 -- base da cobrança: usuário ativo no mês (login ou checklist)
select date_trunc('month', l.quando)::date as mes, l.usuario_id
from ck_log l join ck_usuarios u on u.id = l.usuario_id
where l.evento in ('login','checklist') and u.papel <> 'master'
group by 1,2;

-- ============================================================
-- INTEGRIDADE DOS RESULTADOS (Renan, 11/10/2026: "o admin faz tudo, menos
-- manipular resultados; dados precisam ser seguros e não manipuláveis")
--
-- O admin PODE (via funções ck_*): cadastrar e editar unidades, usuários,
-- ativos, itens, tipos de checklist, fornecedores, metas; dar andamento a OS
-- (iniciar, fechar com evidência, reprogramar com motivo, reabrir). Tudo fica
-- em ck_auditoria. NINGUÉM, nem o master, altera ou apaga checklist, resposta,
-- foto, data, leitura, abertura de OS, prazo original ou evento da linha do
-- tempo: esses registros são só de inclusão (append-only).
-- ============================================================

-- 1) carimbo de hora é do SERVIDOR, nunca do celular
create or replace function ck_carimbo_servidor() returns trigger language plpgsql as $$
begin new.data := now(); return new; end $$;
drop trigger if exists ck_checklists_carimbo on ck_checklists;
create trigger ck_checklists_carimbo before insert on ck_checklists for each row execute function ck_carimbo_servidor();

-- 2) checklist, respostas, eventos de OS e log: sem UPDATE e sem DELETE, para ninguém
create or replace function ck_bloqueia_alteracao() returns trigger language plpgsql as $$
begin raise exception 'Registro de resultado não pode ser alterado nem apagado (%).', tg_table_name; end $$;
-- checklist: imutável, exceto a marcação de cancelamento pelo master (uma vez só)
create or replace function ck_checklist_imutavel() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Checklist não pode ser apagado.'; end if;
  if old.cancelado_em is not null or new.cancelado_em is null then raise exception 'Checklist não pode ser alterado.'; end if;
  if (new.ativo_id, new.usuario_id, new.modelo_id, new.data, new.leitura, new.duracao_s, new.itens_total, new.nc, new.origem, new.cliente_id)
     is distinct from (old.ativo_id, old.usuario_id, old.modelo_id, old.data, old.leitura, old.duracao_s, old.itens_total, old.nc, old.origem, old.cliente_id) then
    raise exception 'Checklist não pode ser alterado.';
  end if;
  return new;
end $$;
drop trigger if exists ck_checklists_imutavel on ck_checklists;
create trigger ck_checklists_imutavel before update or delete on ck_checklists for each row execute function ck_checklist_imutavel();
do $$ declare t text; begin
  foreach t in array array['ck_respostas','ck_os_eventos','ck_log'] loop
    execute format('drop trigger if exists %I_imutavel on %I', t, t);
    execute format('create trigger %I_imutavel before update or delete on %I for each row execute function ck_bloqueia_alteracao()', t, t);
  end loop;
end $$;

-- 3) OS: o que nasce com ela fica congelado. Só o fluxo muda (status, responsável,
--    execução, limite_atual, dados de fechamento). O SLA usa sempre o limite original.
create or replace function ck_os_congelada() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'OS não pode ser apagada.'; end if;
  if (new.ativo_id, new.item_id, new.crit, new.prazo_h, new.bloqueia, new.abertura, new.limite, case when old.checklist_id is null then old.checklist_id else new.checklist_id end, new.obs, new.foto_path, new.aberta_por, new.retorno_de)
     is distinct from
     (old.ativo_id, old.item_id, old.crit, old.prazo_h, old.bloqueia, old.abertura, old.limite, old.checklist_id, old.obs, old.foto_path, old.aberta_por, old.retorno_de) then
    raise exception 'Campos de origem da OS não podem ser alterados.';
  end if;
  if new.status = 'fechada' and old.status <> 'fechada' then new.fechada_em := now(); end if;   -- hora do fechamento é do servidor
  if new.status <> 'fechada' and old.status = 'fechada' then                                   -- reabertura limpa o fechamento
    new.fechada_em := null; new.fechada_por := null;
  end if;
  return new;
end $$;
drop trigger if exists ck_os_congela on ck_os;
create trigger ck_os_congela before update or delete on ck_os for each row execute function ck_os_congelada();

-- 4) mudar configuração NÃO reescreve o passado: a OS guarda crit/prazo_h/limite
--    do momento em que abriu; mudar o prazo de um item só vale para OS novas.

-- 5) auditoria de toda alteração de cadastro e configuração (quem, quando, antes, depois)
create table if not exists ck_auditoria (
  id        bigserial primary key,
  quando    timestamptz not null default now(),
  usuario   uuid references ck_usuarios(id),
  tabela    text not null,
  registro  text not null,
  acao      text not null check (acao in ('insert','update','delete')),
  antes     jsonb,
  depois    jsonb
);
alter table ck_auditoria enable row level security;
drop trigger if exists ck_auditoria_imutavel on ck_auditoria;
create trigger ck_auditoria_imutavel before update or delete on ck_auditoria for each row execute function ck_bloqueia_alteracao();

-- 6) fotos e anexos: buckets PRIVADOS ("fotos" e "anexos"); upload só por URL assinada emitida pela função
--    do checklist/fechamento; o caminho e o hash SHA-256 ficam no registro imutável. Sem UPDATE/DELETE no bucket.
-- (os buckets são criados pela API do Storage, não por SQL)
