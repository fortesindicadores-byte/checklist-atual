-- Checklist Atual · 22/10/2026 · Preventivas: ponto de partida, básica/completa e dados extras
-- 1) tabelas
create table if not exists ck_prev_base (
  id uuid primary key default gen_random_uuid(),
  ativo_id text not null references ck_ativos(id),
  modelo_id text not null references ck_modelos(id),
  leitura numeric check (leitura is null or leitura >= 0),
  data date not null,
  criado_em timestamptz not null default now(),
  criado_por uuid references ck_usuarios(id)
);
create index if not exists ck_prev_base_am on ck_prev_base (ativo_id, modelo_id, criado_em desc);
alter table ck_prev_base enable row level security;
alter table ck_modelos add column if not exists inclui text[];

-- 2) funções
-- ponto de partida: última revisão feita antes do sistema (não é checklist; o mais recente vale)
create or replace function ck_prev_base_salvar(p_token uuid, p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare u ck_usuarios := ck_sessao(p_token); a ck_ativos; m ck_modelos; mid text; lt numeric := nullif(p->>'leitura','')::numeric; dt date := nullif(p->>'data','')::date; n int := 0; nid uuid;
begin
  perform ck_exige(u, array['master','admin']::ck_papel[]);
  select * into a from ck_ativos where id = p->>'ativo'; if a.id is null then raise exception 'ATIVO_NAO_ENCONTRADO'; end if;
  if dt is null or dt > current_date then raise exception 'DATA_INVALIDA'; end if;
  if lt is not null and (lt < 0 or (a.leitura is not null and lt > a.leitura)) then raise exception 'LEITURA_INVALIDA'; end if;
  for mid in select jsonb_array_elements_text(coalesce(p->'modelos', '[]')) loop
    select * into m from ck_modelos where id = mid and categoria = 'preventivo'; if m.id is null then raise exception 'MODELO_INVALIDO'; end if;
    if m.freq = 'uso' and lt is null then raise exception 'LEITURA_OBRIGATORIA'; end if;
    insert into ck_prev_base (ativo_id, modelo_id, leitura, data, criado_por) values (a.id, m.id, case when m.freq = 'uso' then lt end, dt, u.id) returning id into nid;
    perform ck_audit(u.id, 'ck_prev_base', nid::text, 'insert', null, jsonb_build_object('ativo', a.id, 'modelo', m.id, 'leitura', lt, 'data', dt));
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'ESCOLHA_REVISAO'; end if;
  return jsonb_build_object('ok', true, 'n', n);
end $$;

-- revisão que inclui outra (a COMPLETA inclui a BÁSICA): fazer a maior conta como feitas as incluídas
create or replace function ck_modelo_inclui(p_token uuid, p_modelo text, p_inclui text[]) returns jsonb language plpgsql security definer set search_path = public as $$
declare u ck_usuarios := ck_sessao(p_token); antes text[];
begin
  perform ck_exige(u, array['master','admin']::ck_papel[]);
  select inclui into antes from ck_modelos where id = p_modelo and categoria = 'preventivo'; if not found then raise exception 'MODELO_INVALIDO'; end if;
  p_inclui := coalesce(p_inclui, '{}');
  if p_modelo = any(p_inclui) or exists (select 1 from unnest(p_inclui) x where not exists (select 1 from ck_modelos where id = x and categoria = 'preventivo')) then raise exception 'MODELO_INVALIDO'; end if;
  if exists (with recursive c(id) as (select unnest(p_inclui) union select unnest(m.inclui) from ck_modelos m join c on m.id = c.id) select 1 from c where id = p_modelo) then raise exception 'INCLUSAO_CIRCULAR'; end if;
  update ck_modelos set inclui = nullif(p_inclui, '{}') where id = p_modelo;
  perform ck_audit(u.id, 'ck_modelos', p_modelo, 'update', jsonb_build_object('inclui', antes), jsonb_build_object('inclui', p_inclui));
  return jsonb_build_object('ok', true);
end $$;

-- dados extras lidos junto com o ck_dataset (sem mexer nele)
create or replace function ck_extra(p_token uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare u ck_usuarios := ck_sessao(p_token);
begin
  return jsonb_build_object(
    'prev_base', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'ativo', b.ativo_id, 'modelo', b.modelo_id, 'leitura', b.leitura, 'data', b.data, 'criado_em', b.criado_em, 'criado_por', b.criado_por) order by b.criado_em), '[]') from ck_prev_base b),
    'inclui', (select coalesce(jsonb_object_agg(m.id, to_jsonb(m.inclui)), '{}') from ck_modelos m where cardinality(m.inclui) > 0));
end $$;

revoke all on function ck_prev_base_salvar(uuid,jsonb), ck_modelo_inclui(uuid,text,text[]), ck_extra(uuid) from public;
grant execute on function ck_prev_base_salvar(uuid,jsonb), ck_modelo_inclui(uuid,text,text[]), ck_extra(uuid) to anon, authenticated;

-- 3) básica e completa (renomeia e encadeia as revisões já cadastradas)
update ck_modelos set nome = 'REVISÃO BÁSICA · 10.000 KM · CAMINHÕES', inclui = null where id = 'rev-revisao-a-10-000-km-caminhoes';
update ck_modelos set nome = 'REVISÃO COMPLETA · 20.000 KM · CAMINHÕES', inclui = array['rev-revisao-a-10-000-km-caminhoes'] where id = 'rev-revisao-b-20-000-km-caminhoes';
update ck_modelos set nome = 'REVISÃO GERAL · 60.000 KM · CAMINHÕES', inclui = array['rev-revisao-b-20-000-km-caminhoes'] where id = 'rev-revisao-c-60-000-km-caminhoes';
update ck_modelos set nome = 'REVISÃO BÁSICA · 10.000 KM · LEVES E KOMBI', inclui = null where id = 'rev-revisao-10-000-km-veiculos-leves-e-kombi';
update ck_modelos set nome = 'REVISÃO COMPLETA · 40.000 KM · LEVES E KOMBI', inclui = array['rev-revisao-10-000-km-veiculos-leves-e-kombi'] where id = 'rev-revisao-40-000-km-veiculos-leves-e-kombi';
update ck_modelos set inclui = array['rev-revisao-250-h-dynapac-cp221'] where id = 'rev-revisao-500-h-dynapac-cp221';
update ck_modelos set inclui = array['rev-revisao-500-h-dynapac-cp221'] where id = 'rev-revisao-1-000-h-dynapac-cp221';
update ck_modelos set inclui = array['rev-revisao-1-000-h-dynapac-cp221'] where id = 'rev-revisao-2-000-h-dynapac-cp221';
update ck_modelos set inclui = array['rev-revisao-250-h-maquinas-caterpillar'] where id = 'rev-revisao-500-h-maquinas-caterpillar';
update ck_modelos set inclui = array['rev-revisao-500-h-maquinas-caterpillar'] where id = 'rev-revisao-1-000-h-maquinas-caterpillar';
update ck_modelos set inclui = array['rev-revisao-1-000-h-maquinas-caterpillar'] where id = 'rev-revisao-2-000-h-maquinas-caterpillar';
update ck_modelos set inclui = array['rev-revisao-250-h-hyundai-volvo-randon-case'] where id = 'rev-revisao-500-h-hyundai-volvo-randon-case';
update ck_modelos set inclui = array['rev-revisao-500-h-hyundai-volvo-randon-case'] where id = 'rev-revisao-1-000-h-hyundai-volvo-randon-case';
update ck_modelos set inclui = array['rev-revisao-1-000-h-hyundai-volvo-randon-case'] where id = 'rev-revisao-2-000-h-hyundai-volvo-randon-case';
update ck_modelos set inclui = array['rev-revisao-250-h-rolos-vibroacabadoras-e-equipamentos'] where id = 'rev-revisao-500-h-rolos-vibroacabadoras-e-equipamentos';
update ck_modelos set inclui = array['rev-revisao-500-h-rolos-vibroacabadoras-e-equipamentos'] where id = 'rev-revisao-1-000-h-rolos-vibroacabadoras-e-equipament';
select ck_prev_item(id) from ck_modelos where id like 'rev-%' and categoria = 'preventivo';

notify pgrst, 'reload schema';
