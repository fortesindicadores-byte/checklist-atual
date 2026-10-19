-- ============================================================
-- CHECKLIST ATUAL — camada de acesso (RPC) · v1, 12/10/2026
-- Todas as funções são SECURITY DEFINER e recebem o token da sessão
-- (ck_sessoes). O cliente (app/portal) usa só a chave anon + PostgREST
-- /rpc/<função>. Nenhuma tabela é acessível direto (RLS sem policy).
-- Espelha a API CK.* da demo (shared/core.js): mesmos nomes de campos.
-- Regras: tudo em MAIÚSCULAS (cadastros e textos livres); resultados
-- imutáveis (triggers do schema.sql); senha = 6 números (bcrypt).
-- ============================================================

-- ── utilitários ──
create or replace function ck_up(t text) returns text language sql immutable as $$ select nullif(upper(btrim(t)), '') $$;
create or replace function ck_digitos(t text) returns text language sql immutable as $$ select regexp_replace(coalesce(t,''), '\D', '', 'g') $$;

create or replace function ck_audit(p_usr uuid, p_tabela text, p_registro text, p_acao text, p_antes jsonb, p_depois jsonb)
returns void language sql security definer set search_path = public as $$
  insert into ck_auditoria (usuario, tabela, registro, acao, antes, depois) values (p_usr, p_tabela, p_registro, p_acao, p_antes, p_depois);
$$;

-- sessão → usuário (ou erro). Renova a expiração a cada uso.
create or replace function ck_sessao(p_token uuid) returns ck_usuarios language plpgsql security definer set search_path = public as $$
declare s ck_sessoes; u ck_usuarios;
begin
  select * into s from ck_sessoes where token = p_token and expira_em > now();
  if s.token is null then raise exception 'SESSAO_INVALIDA' using errcode = '28000'; end if;
  select * into u from ck_usuarios where id = s.usuario_id;
  if u.status <> 'ativo' then raise exception 'USUARIO_%', upper(u.status::text) using errcode = '28000'; end if;
  update ck_sessoes set expira_em = now() + interval '90 days' where token = p_token;
  return u;
end $$;

create or replace function ck_exige(u ck_usuarios, papeis ck_papel[]) returns void language plpgsql immutable as $$
begin if not (u.papel = any(papeis)) then raise exception 'SEM_PERMISSAO' using errcode = '42501'; end if; end $$;

create or replace function ck_usuario_json(u ck_usuarios) returns jsonb language sql stable as $$
  select jsonb_build_object('id', u.id, 'nome', u.nome, 'cpf', u.cpf, 'papel', u.papel, 'status', u.status,
    'unidade', (select nome from ck_unidades where id = u.unidade_id), 'unidade_id', u.unidade_id,
    'especialidade', u.especialidade, 'telefone', u.telefone, 'papel_solicitado', u.papel_solicitado, 'origem', u.origem,
    'criado_em', u.criado_em, 'ultimo_acesso', u.ultimo_acesso, 'tem_senha', u.senha_hash is not null)
$$;

-- ── acesso ──
-- login: CPF + senha de 6 números. 5 erros seguidos = 15 min de bloqueio.
create or replace function ck_login(p_cpf text, p_senha text, p_origem text default 'app')
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare u ck_usuarios; t uuid;
begin
  select * into u from ck_usuarios where cpf = ck_digitos(p_cpf);
  if u.id is null then raise exception 'CPF_NAO_CADASTRADO'; end if;
  if u.status = 'pendente' then raise exception 'AGUARDANDO_APROVACAO'; end if;
  if u.status = 'bloqueado' then raise exception 'USUARIO_BLOQUEADO'; end if;
  if u.bloqueado_ate is not null and u.bloqueado_ate > now() then raise exception 'MUITAS_TENTATIVAS'; end if;
  if u.senha_hash is null then raise exception 'PRIMEIRO_ACESSO'; end if;          -- app pede para criar a senha
  if u.senha_hash <> crypt(ck_digitos(p_senha), u.senha_hash) then
    update ck_usuarios set tentativas = tentativas + 1, bloqueado_ate = case when tentativas + 1 >= 5 then now() + interval '15 min' end where id = u.id;
    raise exception 'SENHA_INCORRETA';
  end if;
  update ck_usuarios set tentativas = 0, bloqueado_ate = null, ultimo_acesso = now() where id = u.id;
  insert into ck_sessoes (usuario_id, origem) values (u.id, case when p_origem = 'portal' then 'portal' else 'app' end) returning token into t;
  insert into ck_log (usuario_id, evento, origem) values (u.id, 'login', p_origem);
  select * into u from ck_usuarios where id = u.id;
  return jsonb_build_object('token', t, 'usuario', ck_usuario_json(u));
end $$;

-- primeiro acesso: cria a senha (só quem ainda não tem). Depois chama o login.
create or replace function ck_criar_senha(p_cpf text, p_senha text, p_origem text default 'app')
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare u ck_usuarios;
begin
  if ck_digitos(p_senha) !~ '^\d{6}$' then raise exception 'SENHA_6_NUMEROS'; end if;
  select * into u from ck_usuarios where cpf = ck_digitos(p_cpf);
  if u.id is null then raise exception 'CPF_NAO_CADASTRADO'; end if;
  if u.status <> 'ativo' then raise exception 'USUARIO_%', upper(u.status::text); end if;
  if u.senha_hash is not null then raise exception 'JA_TEM_SENHA'; end if;
  update ck_usuarios set senha_hash = crypt(ck_digitos(p_senha), gen_salt('bf', 10)) where id = u.id;
  return ck_login(p_cpf, p_senha, p_origem);
end $$;

-- troca de senha (própria) · reset pelo admin zera a senha (usuário cria de novo no próximo acesso)
create or replace function ck_trocar_senha(p_token uuid, p_atual text, p_nova text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u ck_usuarios := ck_sessao(p_token);
begin
  if ck_digitos(p_nova) !~ '^\d{6}$' then raise exception 'SENHA_6_NUMEROS'; end if;
  if u.senha_hash <> crypt(ck_digitos(p_atual), u.senha_hash) then raise exception 'SENHA_INCORRETA'; end if;
  update ck_usuarios set senha_hash = crypt(ck_digitos(p_nova), gen_salt('bf', 10)) where id = u.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function ck_resetar_senha(p_token uuid, p_usuario uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u ck_usuarios := ck_sessao(p_token); alvo ck_usuarios;
begin
  perform ck_exige(u, array['master','admin']::ck_papel[]);
  select * into alvo from ck_usuarios where id = p_usuario;
  if alvo.papel in ('master','admin') and u.papel <> 'master' then raise exception 'SEM_PERMISSAO'; end if;
  update ck_usuarios set senha_hash = null, tentativas = 0, bloqueado_ate = null where id = p_usuario;
  perform ck_audit(u.id, 'ck_usuarios', p_usuario::text, 'update', jsonb_build_object('senha', 'reset'), null);
  return jsonb_build_object('ok', true);
end $$;

create or replace function ck_sair(p_token uuid) returns void language sql security definer set search_path = public as $$
  delete from ck_sessoes where token = p_token;
$$;

-- "Solicitar acesso" (app e portal): nasce PENDENTE; admin aprova.
create or replace function ck_solicitar_acesso(p jsonb) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare cpf text := ck_digitos(p->>'cpf'); un int; nid uuid; ps ck_papel;
begin
  if length(cpf) <> 11 then raise exception 'CPF_INVALIDO'; end if;
  if ck_up(p->>'nome') is null then raise exception 'NOME_OBRIGATORIO'; end if;
  if exists (select 1 from ck_usuarios where ck_usuarios.cpf = ck_digitos(p->>'cpf')) then raise exception 'CPF_JA_CADASTRADO'; end if;
  select id into un from ck_unidades where nome = ck_up(p->>'unidade') and ativa;
  ps := case when p->>'papel_solicitado' in ('frota','admin') then (p->>'papel_solicitado')::ck_papel else 'motorista' end;
  insert into ck_usuarios (nome, cpf, senha_hash, papel, papel_solicitado, status, unidade_id, origem)
  values (ck_up(p->>'nome'), cpf, case when ck_digitos(p->>'senha') ~ '^\d{6}$' then crypt(ck_digitos(p->>'senha'), gen_salt('bf', 10)) end,
          'motorista', ps, 'pendente', un, case when p->>'origem' = 'portal' then 'portal' else 'app' end)
  returning id into nid;
  return jsonb_build_object('ok', true, 'id', nid, 'status', 'pendente');
end $$;

-- situação do pedido (tela de espera do portal/app)
create or replace function ck_situacao_cpf(p_cpf text) returns jsonb language sql security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('status', status, 'papel', papel, 'tem_senha', senha_hash is not null) from ck_usuarios where cpf = ck_digitos(p_cpf)),
                  jsonb_build_object('status', 'inexistente'))
$$;

-- ── dataset: tudo que o cliente precisa, numa chamada (igual ao DB da demo) ──
create or replace function ck_dataset(p_token uuid, p_desde date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u ck_usuarios := ck_sessao(p_token); d0 timestamptz := coalesce(p_desde, (date_trunc('year', now()) - interval '1 year'))::timestamptz; r jsonb;
begin
  select jsonb_build_object(
    'versao', 'v1', 'gerado_em', now(), 'eu', ck_usuario_json(u),
    'unidades', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'ativa', ativa) order by nome), '[]') from ck_unidades),
    'tipos', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'grupo', grupo, 'medidor', medidor, 'icone', icone, 'diario_ativo', diario_ativo) order by ordem), '[]') from ck_tipos),
    'itens', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'cat', i.categoria, 'nome', i.nome, 'dica', i.dica, 'ex', i.ex, 'crit', i.crit, 'prazo', i.prazo_h,
                'bloqueia', i.bloqueia, 'insp', i.insp, 'sugerido', i.sugerido, 'ativo', i.ativo,
                'ap', (select coalesce(array_agg(tipo_id), '{}') from ck_itens_tipos where item_id = i.id)) order by i.ordem), '[]') from ck_itens i),
    'modelos', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'nome', m.nome, 'categoria', m.categoria, 'freq', m.freq, 'intervalo_km', m.intervalo_km, 'intervalo_h', m.intervalo_h, 'ativos', m.ativos, 'tipos', m.tipos, 'ativo', m.ativo,
                'origem', m.origem, 'criado_em', m.criado_em, 'criado_por', m.criado_por,
                'itens', (select coalesce(array_agg(item_id order by ordem), '{}') from ck_modelos_itens where modelo_id = m.id)) order by m.nome), '[]') from ck_modelos m),
    'usuarios', case when u.papel in ('master','admin','frota')
                  then (select coalesce(jsonb_agg(ck_usuario_json(x) - 'cpf' || jsonb_build_object('cpf', case when u.papel in ('master','admin') then x.cpf end) order by x.nome), '[]') from ck_usuarios x)
                  else (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'papel', x.papel) order by x.nome), '[]') from ck_usuarios x where x.status = 'ativo') end,
    'fornecedores', (select coalesce(jsonb_agg(to_jsonb(f) order by f.nome), '[]') from ck_fornecedores f),
    'documentos', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'ativo', d.ativo_id, 'modelo', d.modelo_id, 'tipo', d.tipo, 'titulo', d.titulo, 'data_ref', d.data_ref, 'path', d.path, 'nome', d.nome, 'mime', d.mime, 'criado_em', d.criado_em, 'criado_por', d.criado_por) order by d.criado_em desc), '[]') from ck_documentos d where d.excluido_em is null),
    'ativos', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'tipo', a.tipo_id, 'placa', a.placa, 'frota', a.frota, 'marca', a.marca, 'modelo', a.modelo, 'ano', a.ano,
                'prop', a.proprietario, 'renavam', a.renavam, 'chassi', a.chassi, 'unidade', (select nome from ck_unidades where id = a.unidade_id), 'unidade_id', a.unidade_id, 'operador', a.operador_id,
                'itens_fora', a.itens_fora, 'leitura', a.leitura, 'status', a.status, 'medidor', t.medidor,
                'qr', case when u.papel in ('master','admin') then a.qr_token end) order by a.id), '[]') from ck_ativos a join ck_tipos t on t.id = a.tipo_id),
    'checklists', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'ativo', c.ativo_id, 'usuario', c.usuario_id, 'modelo', coalesce(c.modelo_id, 'd-' || a.tipo_id), 'data', c.data,
                'leitura', c.leitura, 'duracao_s', c.duracao_s, 'itens_total', c.itens_total, 'nc', c.nc, 'origem', c.origem,
                'ncs', (select coalesce(jsonb_agg(jsonb_build_object('item', r.item_id, 'obs', r.obs, 'foto', r.foto_path)), '[]') from ck_respostas r where r.checklist_id = c.id and r.resposta = 'nc'),
                'tarefas', case when c.origem = 'preventiva' then (select coalesce(jsonb_agg(jsonb_build_object('item', r.item_id, 'feito', r.resposta = 'ok')), '[]') from ck_respostas r where r.checklist_id = c.id) end,
                'pend', (select count(*) from ck_respostas r where r.checklist_id = c.id and r.resposta = 'nf'))
                order by c.data desc), '[]')
                from ck_checklists c join ck_ativos a on a.id = c.ativo_id where c.cancelado_em is null and c.data >= d0),
    'os', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'ativo', o.ativo_id, 'item', o.item_id, 'crit', o.crit, 'prazo', o.prazo_h, 'bloqueia', o.bloqueia,
                'abertura', o.abertura, 'limite', o.limite, 'limite_atual', o.limite_atual, 'status', o.status, 'checklist', o.checklist_id, 'obs', o.obs, 'foto', o.foto_path,
                'aberta_por', o.aberta_por, 'responsavel', o.responsavel, 'execucao', o.execucao, 'reincidencias', o.reincidencias, 'retorno_de', o.retorno_de,
                'fechada_em', o.fechada_em, 'fechada_por', o.fechada_por, 'solucao', o.solucao, 'pecas', o.pecas, 'condicao', o.condicao, 'condicao_obs', o.condicao_obs, 'executado_por', o.executado_por, 'executado_txt', o.executado_txt, 'os_externa', o.os_externa, 'pend_de', o.pend_de, 'foto_fech', o.foto_fech_path,
                'fornecedor', o.fornecedor_id, 'custo', o.custo, 'doc', o.doc_path, 'doc_tipo', o.doc_tipo, 'doc_nome', o.doc_nome,
                'eventos', (select coalesce(jsonb_agg(jsonb_build_object('q', e.quando, 't', e.tipo, 'por', e.por, 'txt', e.texto, 'dados', e.dados) order by e.quando), '[]') from ck_os_eventos e where e.os_id = o.id),
                'reprog', (select coalesce(jsonb_agg(jsonb_build_object('q', e.quando, 'por', e.por, 'motivo', e.dados->>'motivo', 'novo_limite', e.dados->>'novo_limite') order by e.quando), '[]') from ck_os_eventos e where e.os_id = o.id and e.tipo = 'reprogramada'))
                order by o.abertura desc), '[]')
                from ck_os o where o.status <> 'cancelada' and (o.abertura >= d0 or o.status <> 'fechada')),
    'config', case when u.papel in ('master','admin','frota') then (select coalesce(jsonb_object_agg(chave, valor), '{}') from ck_config where chave <> 'pix' or u.papel = 'master')
                   else (select jsonb_build_object('metas', valor) from ck_config where chave = 'metas') end
  ) into r;
  insert into ck_log (usuario_id, evento, origem) values (u.id, 'abrir', null);
  return r;
end $$;

-- ── DOCUMENTOS DO ATIVO (16/10/2026 — despacho MPT itens d, g, j) ──
create or replace function ck_documento_salvar(p_token uuid, p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare u ck_usuarios := ck_sessao(p_token); nid uuid;
begin
  perform ck_exige(u, array['master','admin','frota']::ck_papel[]);
  if p->>'modelo' is not null then
    if not exists (select 1 from ck_modelos where id = p->>'modelo') then raise exception 'MODELO_NAO_ENCONTRADO'; end if;
    if coalesce(p->>'path', '') !~ ('^docs/modelo/' || (p->>'modelo') || '/') then raise exception 'ARQUIVO_INVALIDO'; end if;
  else
    if not exists (select 1 from ck_ativos where id = p->>'ativo') then raise exception 'ATIVO_NAO_ENCONTRADO'; end if;
    if coalesce(p->>'path', '') !~ ('^docs/' || (p->>'ativo') || '/') then raise exception 'ARQUIVO_INVALIDO'; end if;
  end if;
  insert into ck_documentos (ativo_id, modelo_id, tipo, titulo, data_ref, path, nome, mime, tamanho, criado_por)
  values (nullif(p->>'ativo',''), nullif(p->>'modelo',''), ck_up(p->>'tipo'), ck_up(p->>'titulo'), nullif(p->>'data_ref', '')::date, p->>'path', p->>'nome', p->>'mime', nullif(p->>'tamanho', '')::bigint, u.id)
  returning id into nid;
  perform ck_audit(u.id, 'ck_documentos', nid::text, 'insert', null, p);
  return jsonb_build_object('ok', true, 'id', nid);
end $$;

create or replace function ck_documento_excluir(p_token uuid, p_documento uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare u ck_usuarios := ck_sessao(p_token); d ck_documentos;
begin
  perform ck_exige(u, array['master','admin']::ck_papel[]);
  select * into d from ck_documentos where id = p_documento and excluido_em is null; if d.id is null then raise exception 'DOCUMENTO_NAO_ENCONTRADO'; end if;
  update ck_documentos set excluido_em = now(), excluido_por = u.id where id = p_documento;
  perform ck_audit(u.id, 'ck_documentos', p_documento::text, 'delete', to_jsonb(d), null);
  return jsonb_build_object('ok', true);
end $$;

-- ── checklist do motorista / equipe ──
-- p = {ativo, modelo?, leitura?, duracao_s?, cliente_id?, lat?, lng?, itens:[{item, ok:true|false|null, obs?, foto?}]}
-- foto = caminho no bucket "fotos" (o app sobe antes, com a chave anon; ver políticas no fim)
create or replace function ck_salvar_checklist(p_token uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u ck_usuarios := ck_sessao(p_token); a ck_ativos; it ck_itens; cid uuid; r jsonb; nc_n int := 0; tot int := 0;
        o ck_os; nova int; criadas int[] := '{}'; reinc int[] := '{}'; ret int; ag timestamptz := now(); bloq boolean := false;
begin
  select * into a from ck_ativos where id = p->>'ativo' and status = 'ativo';
  if a.id is null then raise exception 'ATIVO_NAO_ENCONTRADO'; end if;
  if p->>'cliente_id' is not null then
    select id into cid from ck_checklists where cliente_id = p->>'cliente_id';
    if cid is not null then return jsonb_build_object('ok', true, 'id', cid, 'repetido', true); end if;    -- reenvio offline
  end if;
  if p->>'modelo' is not null and p->>'modelo' !~ '^d-' then
    perform ck_exige(u, array['master','admin','frota']::ck_papel[]);                                      -- inspeções: só equipe
    if not exists (select 1 from ck_modelos where id = p->>'modelo' and ativo) then raise exception 'MODELO_INVALIDO'; end if;
  end if;
  select count(*) filter (where (x->>'ok') is not null), count(*) filter (where (x->>'ok')::boolean = false)
    into tot, nc_n from jsonb_array_elements(p->'itens') x;
  if tot = 0 then raise exception 'CHECKLIST_VAZIO'; end if;
  insert into ck_checklists (ativo_id, usuario_id, modelo_id, leitura, duracao_s, itens_total, nc, origem, lat, lng, cliente_id)
  values (a.id, u.id, nullif(p->>'modelo', '') , (p->>'leitura')::numeric, (p->>'duracao_s')::int, tot, nc_n,
          case when p->>'modelo' is null or p->>'modelo' ~ '^d-' then 'app' else 'inspecao' end, (p->>'lat')::numeric, (p->>'lng')::numeric, p->>'cliente_id')
  returning id into cid;
  if (p->>'leitura')::numeric is not null then update ck_ativos set leitura = (p->>'leitura')::numeric where id = a.id; end if;
  for r in select x from jsonb_array_elements(p->'itens') x loop
    continue when r->>'ok' is null;
    select * into it from ck_itens where id = r->>'item';
    if it.id is null then raise exception 'ITEM_INVALIDO %', r->>'item'; end if;
    if (r->>'ok')::boolean then
      insert into ck_respostas (checklist_id, item_id, resposta) values (cid, it.id, 'ok');
    else
      if coalesce(r->>'foto', '') = '' then raise exception 'FOTO_OBRIGATORIA %', it.nome; end if;
      insert into ck_respostas (checklist_id, item_id, resposta, obs, foto_path, foto_sha256) values (cid, it.id, 'nc', ck_up(r->>'obs'), r->>'foto', r->>'sha256');
      if it.bloqueia then bloq := true; end if;
      select * into o from ck_os where ativo_id = a.id and item_id = it.id and status in ('aberta','em_andamento') order by abertura desc limit 1;
      if o.id is not null then                                                                               -- OS aberta: só reincidência
        update ck_os set reincidencias = reincidencias + 1 where id = o.id;
        insert into ck_os_eventos (os_id, tipo, por, texto, dados) values (o.id, 'reincidencia', u.id, 'REPROVADO DE NOVO NO CHECKLIST', jsonb_build_object('checklist_id', cid));
        reinc := reinc || o.id;
      else
        select id into ret from ck_os where ativo_id = a.id and item_id = it.id and status = 'fechada' and fechada_em > ag - interval '30 days' order by fechada_em desc limit 1;
        insert into ck_os (ativo_id, item_id, crit, prazo_h, bloqueia, limite, checklist_id, obs, foto_path, aberta_por, retorno_de)
        values (a.id, it.id, it.crit, it.prazo_h, it.bloqueia, ag + (it.prazo_h || ' hours')::interval, cid, ck_up(r->>'obs'), r->>'foto', u.id, ret)
        returning id into nova;
        insert into ck_os_eventos (os_id, tipo, por, texto) values (nova, 'aberta', u.id, case when ret is null then 'ABERTA PELO CHECKLIST' else 'ABERTA PELO CHECKLIST · RETORNO DA OS ' || ret end);
        criadas := criadas || nova;
      end if;
    end if;
  end loop;
  insert into ck_log (usuario_id, evento, origem) values (u.id, 'checklist', 'app');
  return jsonb_build_object('ok', true, 'id', cid, 'nc', nc_n, 'os_criadas', criadas, 'reincidencias', reinc,
    'bloqueado', bloq or exists (select 1 from ck_os where ativo_id = a.id and bloqueia and status in ('aberta','em_andamento')));
end $$;

-- farol do ativo (app): liberado / não opere / sem checklist hoje
create or replace function ck_farol(p_token uuid, p_ativo text) returns jsonb language plpgsql security definer set search_path = public as $$
declare u ck_usuarios := ck_sessao(p_token); ult ck_checklists;
begin
  select * into ult from ck_checklists c where c.ativo_id = p_ativo order by data desc limit 1;
  return jsonb_build_object('bloqueado', exists (select 1 from ck_os where ativo_id = p_ativo and bloqueia and status in ('aberta','em_andamento')),
    'ultimo', ult.data, 'hoje', ult.data::date = current_date, 'abertas', (select count(*) from ck_os where ativo_id = p_ativo and status in ('aberta','em_andamento')));
end $$;

-- ── OS ──
create or replace function ck_os_iniciar(p_token uuid, p_os int, p_execucao ck_execucao) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u ck_usuarios := ck_sessao(p_token); o ck_os;
begin
  perform ck_exige(u, array['master','admin','frota']::ck_papel[]);
  select * into o from ck_os where id = p_os; if o.id is null or o.status = 'fechada' then raise exception 'OS_NAO_ABERTA'; end if;
  update ck_os set status = 'em_andamento', responsavel = u.id, execucao = p_execucao where id = p_os;
  insert into ck_os_eventos (os_id, tipo, por, texto) values (p_os, 'em_andamento', u.id, 'ATENDIMENTO ' || upper(p_execucao::text));
  return jsonb_build_object('ok', true);
end $$;

-- p = {solucao?, foto?, execucao?, custo?, fornecedor?, doc?:{path,tipo,nome}}
create or replace function ck_os_fechar(p_token uuid, p_os int, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u ck_usuarios := ck_sessao(p_token); o ck_os; ex ck_execucao; sol text := ck_up(p->>'solucao');
begin
  perform ck_exige(u, array['master','admin','frota']::ck_papel[]);
  select * into o from ck_os where id = p_os; if o.id is null or o.status = 'fechada' then raise exception 'OS_JA_FECHADA'; end if;
  if sol is null and coalesce(p->>'foto', '') = '' then raise exception 'EVIDENCIA_OBRIGATORIA'; end if;
  if coalesce(p->>'condicao', '') not in ('apto','restricao') then raise exception 'CONDICAO_OBRIGATORIA'; end if;   -- NR-12 / cláusula 2.8 (16/10/2026)
  if p->>'condicao' = 'restricao' and ck_up(p->>'condicao_obs') is null then raise exception 'RESTRICAO_OBRIGATORIA'; end if;
   -- foto da correção ou o que foi feito
  ex := coalesce(o.execucao, (p->>'execucao')::ck_execucao); if ex is null then raise exception 'INFORME_INTERNA_EXTERNA'; end if;
  if ex = 'externa' and p->>'fornecedor' is not null and not exists (select 1 from ck_fornecedores where id = (p->>'fornecedor')::uuid) then raise exception 'FORNECEDOR_INVALIDO'; end if;
  update ck_os set status = 'fechada', fechada_por = u.id, execucao = ex,
    pecas = (select coalesce(jsonb_agg(jsonb_build_object('desc', ck_up(x->>'desc'), 'ref', ck_up(x->>'ref'), 'origem', case when x->>'origem' = 'equivalente' then 'equivalente' else 'original' end)), '[]') from jsonb_array_elements(coalesce(p->'pecas','[]')) x where ck_up(x->>'desc') is not null),
    condicao = p->>'condicao', condicao_obs = case when p->>'condicao' = 'restricao' then ck_up(p->>'condicao_obs') end,
    executado_por = nullif(p->>'executado_por','')::uuid, executado_txt = ck_up(p->>'executado_txt'), os_externa = ck_up(p->>'os_externa'), solucao = sol, foto_fech_path = nullif(p->>'foto', ''),
    fornecedor_id = case when ex = 'externa' then (p->>'fornecedor')::uuid end,
    custo = case when ex = 'externa' and (p->>'custo') ~ '^\d+(\.\d+)?$' then (p->>'custo')::numeric end,
    doc_path = case when ex = 'externa' then p#>>'{doc,path}' end, doc_tipo = case when ex = 'externa' and p#>>'{doc,tipo}' in ('nf','orcamento') then p#>>'{doc,tipo}' end,
    doc_nome = case when ex = 'externa' then p#>>'{doc,nome}' end
  where id = p_os;
  insert into ck_os_eventos (os_id, tipo, por, texto) values (p_os, 'fechada', u.id, sol);
  return jsonb_build_object('ok', true);
end $$;

create or replace function ck_os_reprogramar(p_token uuid, p_os int, p_novo_limite timestamptz, p_motivo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u ck_usuarios := ck_sessao(p_token); o ck_os; m text := ck_up(p_motivo);
begin
  perform ck_exige(u, array['master','admin','frota']::ck_papel[]);
  select * into o from ck_os where id = p_os; if o.id is null or o.status = 'fechada' then raise exception 'OS_JA_FECHADA'; end if;
  if m is null then raise exception 'MOTIVO_OBRIGATORIO'; end if;
  update ck_os set limite_atual = p_novo_limite where id = p_os;
  insert into ck_os_eventos (os_id, tipo, por, texto, dados) values (p_os, 'reprogramada', u.id, m || ' · NOVO PRAZO ' || to_char(p_novo_limite at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'),
    jsonb_build_object('motivo', m, 'novo_limite', p_novo_limite, 'limite_anterior', coalesce(o.limite_atual, o.limite)));
  return jsonb_build_object('ok', true);
end $$;

-- ── PREVENTIVO = OS (Renan, 12/10/2026) ──
-- item virtual 'prev-<modelo>' em ck_itens (categoria PREVENTIVA, insp) representa a preventiva na OS; o cliente não o lista no catálogo.
create or replace function ck_prev_item(p_modelo text) returns text language plpgsql security definer set search_path = public as $$
declare m ck_modelos; iid text := 'prev-' || p_modelo;
begin
  select * into m from ck_modelos where id = p_modelo and categoria = 'preventivo'; if m.id is null then raise exception 'MODELO_INVALIDO'; end if;
  insert into ck_itens (id, categoria, nome, crit, prazo_h, bloqueia, insp, ordem) values (iid, 'PREVENTIVA', case when m.nome ~* '^preventiv' then m.nome else 'PREVENTIVA · ' || m.nome end, 'media', 24, false, true, 9999)
  on conflict (id) do update set nome = excluded.nome;
  return iid;
end $$;

create or replace function ck_preventiva_iniciar(p_token uuid, p_ativo text, p_modelo text, p_execucao ck_execucao default 'interna') returns jsonb
language plpgsql security definer set search_path = public as $$
declare u ck_usuarios := ck_sessao(p_token); iid text; nid int; m ck_modelos;
begin
  perform ck_exige(u, array['master','admin','frota']::ck_papel[]);
  if not exists (select 1 from ck_ativos where id = p_ativo and status = 'ativo') then raise exception 'ATIVO_NAO_ENCONTRADO'; end if;
  iid := ck_prev_item(p_modelo); select * into m from ck_modelos where id = p_modelo;
  if exists (select 1 from ck_os where ativo_id = p_ativo and item_id = iid and status = 'em_andamento') then raise exception 'PREVENTIVA_JA_EM_ANDAMENTO'; end if;
  insert into ck_os (ativo_id, item_id, crit, prazo_h, bloqueia, limite, status, aberta_por, responsavel, execucao)
  values (p_ativo, iid, 'media', 24, false, now() + interval '24 hours', 'em_andamento', u.id, u.id, p_execucao) returning id into nid;
  insert into ck_os_eventos (os_id, tipo, por, texto) values (nid, 'aberta', u.id, 'PREVENTIVA INICIADA · ' || m.nome), (nid, 'em_andamento', u.id, 'ATENDIMENTO ' || upper(p_execucao::text));
  return jsonb_build_object('ok', true, 'id', nid);
end $$;

-- p = {cliente_id?, tarefas:[{item, feito}], leitura?, duracao_s?, obs?}
create or replace function ck_preventiva_finalizar(p_token uuid, p_os int, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u ck_usuarios := ck_sessao(p_token); o ck_os; cid uuid; t jsonb; tot int := 0; feitas int := 0; pend text[] := '{}'; sol text; it ck_itens; nid int; novas int[] := '{}';
begin
  perform ck_exige(u, array['master','admin','frota']::ck_papel[]);
  select * into o from ck_os where id = p_os; if o.id is null or o.item_id not like 'prev-%' then raise exception 'OS_NAO_ENCONTRADA'; end if;
  if o.status <> 'em_andamento' then raise exception 'PREVENTIVA_NAO_EM_ANDAMENTO'; end if;
  if p->>'cliente_id' is not null then select id into cid from ck_checklists where cliente_id = p->>'cliente_id'; if cid is not null then return jsonb_build_object('ok', true, 'id', cid, 'repetido', true); end if; end if;
  select count(*), count(*) filter (where (x->>'feito')::boolean) into tot, feitas from jsonb_array_elements(coalesce(p->'tarefas', '[]')) x;
  insert into ck_checklists (ativo_id, usuario_id, modelo_id, leitura, duracao_s, itens_total, nc, origem, cliente_id)
  values (o.ativo_id, u.id, substr(o.item_id, 6), (p->>'leitura')::numeric, (p->>'duracao_s')::int, tot, 0, 'preventiva', p->>'cliente_id') returning id into cid;
  for t in select x from jsonb_array_elements(coalesce(p->'tarefas', '[]')) x loop
    if not exists (select 1 from ck_itens where id = t->>'item') then continue; end if;
    insert into ck_respostas (checklist_id, item_id, resposta) values (cid, t->>'item', case when (t->>'feito')::boolean then 'ok' else 'nf' end::ck_resposta) on conflict do nothing;
    if not (t->>'feito')::boolean then pend := pend || (select nome from ck_itens where id = t->>'item'); end if;
  end loop;
  if (p->>'leitura')::numeric is not null then update ck_ativos set leitura = (p->>'leitura')::numeric where id = o.ativo_id; end if;
  sol := ck_up(feitas || ' DE ' || tot || ' TAREFAS FEITAS' || case when cardinality(pend) > 0 then ' · PENDENTE: ' || array_to_string(pend, ', ') else '' end || case when ck_up(p->>'obs') is not null then ' · ' || ck_up(p->>'obs') else '' end);
  if coalesce(p->>'condicao', '') not in ('apto','restricao') then raise exception 'CONDICAO_OBRIGATORIA'; end if;
  update ck_os set status = 'fechada', fechada_por = u.id, solucao = sol, checklist_id = cid, condicao = p->>'condicao',
    condicao_obs = case when p->>'condicao' = 'restricao' then ck_up(p->>'condicao_obs') end, executado_por = u.id where id = p_os;
  insert into ck_os_eventos (os_id, tipo, por, texto) values (p_os, 'fechada', u.id, sol);
  -- tarefa não feita vira OS própria (17/10/2026)
  for t in select x from jsonb_array_elements(coalesce(p->'tarefas', '[]')) x where not coalesce((x->>'feito')::boolean, false) loop
    select * into it from ck_itens where id = t->>'item'; continue when it.id is null;
    continue when exists (select 1 from ck_os where ativo_id = o.ativo_id and item_id = it.id and status in ('aberta','em_andamento'));
    insert into ck_os (ativo_id, item_id, crit, prazo_h, bloqueia, limite, checklist_id, obs, aberta_por, pend_de)
    values (o.ativo_id, it.id, it.crit, it.prazo_h, it.bloqueia, now() + (it.prazo_h || ' hours')::interval, cid, 'TAREFA PENDENTE DA PREVENTIVA OS-' || lpad(p_os::text, 4, '0'), u.id, p_os) returning id into nid;
    insert into ck_os_eventos (os_id, tipo, por, texto) values (nid, 'aberta', u.id, 'TAREFA PENDENTE DA PREVENTIVA OS-' || lpad(p_os::text, 4, '0'));
    novas := novas || nid;
  end loop;
  insert into ck_log (usuario_id, evento, origem) values (u.id, 'checklist', 'app');
  return jsonb_build_object('ok', true, 'id', cid, 'os', p_os, 'pendentes', novas);
end $$;

-- excluir checklist (SÓ master): marca cancelado (some do dataset e dos indicadores), cancela as OS que ele abriu; tudo na auditoria (Renan, 12/10/2026)
create or replace function ck_checklist_excluir(p_token uuid, p_checklist uuid, p_motivo text) returns jsonb language plpgsql security definer set search_path = public as $$
declare u ck_usuarios := ck_sessao(p_token); c ck_checklists; o ck_os; m text := coalesce(ck_up(p_motivo), 'EXCLUÍDO PELO ADMIN MASTER');
begin
  perform ck_exige(u, array['master']::ck_papel[]);
  select * into c from ck_checklists where id = p_checklist; if c.id is null then raise exception 'CHECKLIST_NAO_ENCONTRADO'; end if;
  if c.cancelado_em is not null then raise exception 'CHECKLIST_JA_EXCLUIDO'; end if;
  perform ck_audit(u.id, 'ck_checklists', p_checklist::text, 'delete', to_jsonb(c), jsonb_build_object('motivo', m));
  update ck_checklists set cancelado_em = now(), cancelado_por = u.id, cancelado_motivo = m where id = p_checklist;
  for o in select * from ck_os where checklist_id = p_checklist and status <> 'cancelada' loop
    perform ck_audit(u.id, 'ck_os', o.id::text, 'delete', to_jsonb(o), jsonb_build_object('motivo', 'CHECKLIST EXCLUÍDO · ' || m));
    update ck_os set status = 'cancelada' where id = o.id;
    insert into ck_os_eventos (os_id, tipo, por, texto) values (o.id, 'cancelada', u.id, 'CHECKLIST EXCLUÍDO · ' || m);
  end loop;
  return jsonb_build_object('ok', true);
end $$;

-- excluir OS (SÓ master): a OS vira 'cancelada' — some do painel, dos indicadores e do app; o registro completo fica na auditoria (Renan, 12/10/2026)
create or replace function ck_os_excluir(p_token uuid, p_os int, p_motivo text) returns jsonb language plpgsql security definer set search_path = public as $$
declare u ck_usuarios := ck_sessao(p_token); o ck_os;
begin
  perform ck_exige(u, array['master']::ck_papel[]);
  select * into o from ck_os where id = p_os; if o.id is null then raise exception 'OS_NAO_ENCONTRADA'; end if;
  if o.status = 'cancelada' then raise exception 'OS_JA_EXCLUIDA'; end if;
  perform ck_audit(u.id, 'ck_os', p_os::text, 'delete', to_jsonb(o), jsonb_build_object('motivo', ck_up(p_motivo)));
  update ck_os set status = 'cancelada' where id = p_os;
  insert into ck_os_eventos (os_id, tipo, por, texto) values (p_os, 'cancelada', u.id, coalesce(ck_up(p_motivo), 'EXCLUÍDA PELO ADMIN MASTER'));
  return jsonb_build_object('ok', true);
end $$;

create or replace function ck_os_reabrir(p_token uuid, p_os int) returns jsonb language plpgsql security definer set search_path = public as $$
declare u ck_usuarios := ck_sessao(p_token);
begin
  perform ck_exige(u, array['master','admin']::ck_papel[]);
  update ck_os set status = 'aberta' where id = p_os and status = 'fechada';
  if not found then raise exception 'OS_NAO_FECHADA'; end if;
  insert into ck_os_eventos (os_id, tipo, por, texto) values (p_os, 'reaberta', u.id, 'REABERTA');
  return jsonb_build_object('ok', true);
end $$;

-- ── cadastros (master/admin; auditados) ──
create or replace function ck_unidade_salvar(p_token uuid, p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare u ck_usuarios := ck_sessao(p_token); antes ck_unidades; nid int;
begin
  perform ck_exige(u, array['master','admin']::ck_papel[]);
  if (p->>'id') is null then
    insert into ck_unidades (nome) values (ck_up(p->>'nome')) returning id into nid;
    perform ck_audit(u.id, 'ck_unidades', nid::text, 'insert', null, p);
  else
    nid := (p->>'id')::int; select * into antes from ck_unidades where id = nid;
    update ck_unidades set nome = coalesce(ck_up(p->>'nome'), nome), ativa = coalesce((p->>'ativa')::boolean, ativa) where id = nid;
    perform ck_audit(u.id, 'ck_unidades', nid::text, 'update', to_jsonb(antes), p);
  end if;
  return jsonb_build_object('ok', true, 'id', nid);
exception when unique_violation then raise exception 'UNIDADE_JA_EXISTE';
end $$;

-- p = {id, tipo, marca?, modelo?, ano?, prop?, unidade?, operador?, status?, itens_fora?, leitura?}
create or replace function ck_ativo_salvar(p_token uuid, p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare u ck_usuarios := ck_sessao(p_token); antes ck_ativos; cod text := upper(regexp_replace(p->>'id', '[^A-Za-z0-9]', '', 'g')); un int;
begin
  perform ck_exige(u, array['master','admin']::ck_papel[]);
  if cod = '' then raise exception 'CODIGO_OBRIGATORIO'; end if;
  if p ? 'unidade' then select id into un from ck_unidades where nome = ck_up(p->>'unidade'); if un is null then raise exception 'UNIDADE_INVALIDA'; end if; end if;
  select * into antes from ck_ativos where id = cod;
  if antes.id is null then
    if not exists (select 1 from ck_tipos where id = p->>'tipo') then raise exception 'TIPO_INVALIDO'; end if;
    insert into ck_ativos (id, tipo_id, placa, frota, marca, modelo, ano, proprietario, renavam, chassi, unidade_id, operador_id, itens_fora, leitura, status)
    values (cod, p->>'tipo', case when cod ~ '^\d+$' then null else cod end, case when cod ~ '^\d+$' then cod end, ck_up(p->>'marca'), ck_up(p->>'modelo'),
            nullif(p->>'ano', '')::int, ck_up(p->>'prop'), nullif(regexp_replace(coalesce(p->>'renavam',''), '\D', '', 'g'), ''), nullif(upper(regexp_replace(coalesce(p->>'chassi',''), '\s', '', 'g')), ''), un, nullif(p->>'operador', '')::uuid,
            coalesce((select array_agg(x) from jsonb_array_elements_text(p->'itens_fora') x), '{}'), nullif(p->>'leitura', '')::numeric,
            coalesce(p->>'status', 'ativo'));
    perform ck_audit(u.id, 'ck_ativos', cod, 'insert', null, p);
  else
    update ck_ativos set tipo_id = coalesce(p->>'tipo', tipo_id), marca = coalesce(ck_up(p->>'marca'), marca), modelo = coalesce(ck_up(p->>'modelo'), modelo),
      ano = coalesce(nullif(p->>'ano', '')::int, ano), proprietario = coalesce(ck_up(p->>'prop'), proprietario),
      renavam = case when p ? 'renavam' then nullif(regexp_replace(coalesce(p->>'renavam',''), '\D', '', 'g'), '') else renavam end,
      chassi = case when p ? 'chassi' then nullif(upper(regexp_replace(coalesce(p->>'chassi',''), '\s', '', 'g')), '') else chassi end, unidade_id = coalesce(un, unidade_id),
      operador_id = case when p ? 'operador' then nullif(p->>'operador', '')::uuid else operador_id end,
      itens_fora = case when p ? 'itens_fora' then coalesce((select array_agg(x) from jsonb_array_elements_text(p->'itens_fora') x), '{}') else itens_fora end,
      status = coalesce(p->>'status', status)
    where id = cod;
    perform ck_audit(u.id, 'ck_ativos', cod, 'update', to_jsonb(antes), p);
  end if;
  return jsonb_build_object('ok', true, 'id', cod);
end $$;

-- p = {id?, nome, cpf, papel, unidade, especialidade?, telefone?, status?}
create or replace function ck_usuario_salvar(p_token uuid, p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare u ck_usuarios := ck_sessao(p_token); antes ck_usuarios; un int; nid uuid; pp ck_papel;
begin
  perform ck_exige(u, array['master','admin']::ck_papel[]);
  pp := coalesce((p->>'papel')::ck_papel, 'motorista');
  if pp in ('master','admin') and u.papel <> 'master' then raise exception 'SO_MASTER_CRIA_ADMIN'; end if;
  if p ? 'unidade' then select id into un from ck_unidades where nome = ck_up(p->>'unidade'); end if;
  if (p->>'id') is null then
    if length(ck_digitos(p->>'cpf')) <> 11 then raise exception 'CPF_INVALIDO'; end if;
    insert into ck_usuarios (nome, cpf, papel, status, unidade_id, especialidade, telefone, origem, aprovado_por, aprovado_em)
    values (ck_up(p->>'nome'), ck_digitos(p->>'cpf'), pp, coalesce((p->>'status')::ck_status_usuario, 'ativo'), un, ck_up(p->>'especialidade'), btrim(p->>'telefone'),
            coalesce(p->>'origem', 'portal'), u.id, now())
    returning id into nid;
    perform ck_audit(u.id, 'ck_usuarios', nid::text, 'insert', null, p - 'cpf');
  else
    nid := (p->>'id')::uuid; select * into antes from ck_usuarios where id = nid;
    if antes.papel = 'master' or (antes.papel = 'admin' and u.papel <> 'master') then raise exception 'SEM_PERMISSAO'; end if;
    update ck_usuarios set nome = coalesce(ck_up(p->>'nome'), nome), papel = case when p ? 'papel' then pp else papel end,
      status = coalesce((p->>'status')::ck_status_usuario, status), unidade_id = coalesce(un, unidade_id),
      especialidade = case when p ? 'especialidade' then ck_up(p->>'especialidade') else especialidade end,
      telefone = case when p ? 'telefone' then btrim(p->>'telefone') else telefone end
    where id = nid;
    perform ck_audit(u.id, 'ck_usuarios', nid::text, 'update', to_jsonb(antes) - 'senha_hash' - 'cpf', p - 'cpf');
  end if;
  return jsonb_build_object('ok', true, 'id', nid);
exception when unique_violation then raise exception 'CPF_JA_CADASTRADO';
end $$;

-- aprovar pedido de acesso: define papel (admin só aprova motorista/frota) e ativa
create or replace function ck_usuario_aprovar(p_token uuid, p_usuario uuid, p_papel ck_papel default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u ck_usuarios := ck_sessao(p_token); alvo ck_usuarios; pp ck_papel;
begin
  perform ck_exige(u, array['master','admin']::ck_papel[]);
  select * into alvo from ck_usuarios where id = p_usuario and status = 'pendente'; if alvo.id is null then raise exception 'PEDIDO_NAO_ENCONTRADO'; end if;
  pp := coalesce(p_papel, alvo.papel_solicitado, 'motorista');
  if pp in ('master','admin') and u.papel <> 'master' then raise exception 'SO_MASTER_APROVA_ADMIN'; end if;
  update ck_usuarios set status = 'ativo', papel = pp, aprovado_por = u.id, aprovado_em = now() where id = p_usuario;
  perform ck_audit(u.id, 'ck_usuarios', p_usuario::text, 'update', jsonb_build_object('status', 'pendente'), jsonb_build_object('status', 'ativo', 'papel', pp));
  return jsonb_build_object('ok', true);
end $$;

-- p = {id?, nome, cat, crit, prazo (h), bloqueia, insp, ap:[tipos], dica?, ex?, ativo?}
create or replace function ck_item_salvar(p_token uuid, p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare u ck_usuarios := ck_sessao(p_token); antes ck_itens; iid text := p->>'id';
begin
  perform ck_exige(u, array['master','admin']::ck_papel[]);
  if ck_up(p->>'nome') is null then raise exception 'NOME_OBRIGATORIO'; end if;
  if iid is null then
    iid := 'x-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
    if exists (select 1 from ck_itens where nome = ck_up(p->>'nome')) then raise exception 'ITEM_JA_EXISTE'; end if;
    insert into ck_itens (id, categoria, nome, dica, ex, crit, prazo_h, bloqueia, insp, ordem)
    values (iid, coalesce(ck_up(p->>'cat'), 'INSPEÇÃO'), ck_up(p->>'nome'), btrim(p->>'dica'), ck_up(p->>'ex'), (p->>'crit')::ck_crit, (p->>'prazo')::numeric,
            coalesce((p->>'bloqueia')::boolean, false), coalesce((p->>'insp')::boolean, false), (select coalesce(max(ordem), 0) + 1 from ck_itens));
    perform ck_audit(u.id, 'ck_itens', iid, 'insert', null, p);
  else
    select * into antes from ck_itens where id = iid; if antes.id is null then raise exception 'ITEM_NAO_ENCONTRADO'; end if;
    update ck_itens set nome = coalesce(ck_up(p->>'nome'), nome), categoria = coalesce(ck_up(p->>'cat'), categoria),
      dica = case when p ? 'dica' then btrim(p->>'dica') else dica end, ex = case when p ? 'ex' then ck_up(p->>'ex') else ex end,
      crit = coalesce((p->>'crit')::ck_crit, crit), prazo_h = coalesce((p->>'prazo')::numeric, prazo_h),
      bloqueia = coalesce((p->>'bloqueia')::boolean, bloqueia), ativo = coalesce((p->>'ativo')::boolean, ativo)
    where id = iid;
    perform ck_audit(u.id, 'ck_itens', iid, 'update', to_jsonb(antes), p);
  end if;
  if p ? 'ap' and not coalesce((p->>'insp')::boolean, antes.insp, false) then
    delete from ck_itens_tipos where item_id = iid;
    insert into ck_itens_tipos (item_id, tipo_id) select iid, x from jsonb_array_elements_text(p->'ap') x where exists (select 1 from ck_tipos where id = x);
  end if;
  return jsonb_build_object('ok', true, 'id', iid);
end $$;

-- diário de um tipo: liga/desliga
create or replace function ck_diario_set(p_token uuid, p_tipo text, p_ativo boolean) returns jsonb language plpgsql security definer set search_path = public as $$
declare u ck_usuarios := ck_sessao(p_token);
begin
  perform ck_exige(u, array['master','admin']::ck_papel[]);
  update ck_tipos set diario_ativo = p_ativo where id = p_tipo; if not found then raise exception 'TIPO_INVALIDO'; end if;
  perform ck_audit(u.id, 'ck_tipos', p_tipo, 'update', null, jsonb_build_object('diario_ativo', p_ativo));
  return jsonb_build_object('ok', true);
end $$;

-- p = {id?, nome, categoria, freq, tipos:[...], itens:[ids], novos:[{nome,cat,crit,prazo,bloqueia}], ativo?, origem?}
create or replace function ck_modelo_salvar(p_token uuid, p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare u ck_usuarios := ck_sessao(p_token); mid text := p->>'id'; antes ck_modelos; cat ck_cat_modelo; fq ck_freq; n jsonb; nid text; ids text[] := '{}'; k int := 0;
begin
  perform ck_exige(u, array['master','admin']::ck_papel[]);
  cat := coalesce((p->>'categoria')::ck_cat_modelo, 'inspecao'); fq := (p->>'freq')::ck_freq;
  if cat = 'inspecao' and fq not in ('semanal','quinzenal','mensal','uso') then raise exception 'FREQUENCIA_INVALIDA'; end if;
  if fq = 'uso' and coalesce((p->>'intervalo_km')::numeric, 0) <= 0 and coalesce((p->>'intervalo_h')::numeric, 0) <= 0 then raise exception 'INTERVALO_OBRIGATORIO'; end if;
  if cat <> 'inspecao' and fq = 'diario' then raise exception 'FREQUENCIA_INVALIDA'; end if;
  for n in select x from jsonb_array_elements(coalesce(p->'novos', '[]')) x loop                       -- itens novos só de inspeção
    nid := 'x-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
    insert into ck_itens (id, categoria, nome, crit, prazo_h, bloqueia, insp, ordem)
    values (nid, coalesce(ck_up(n->>'cat'), 'INSPEÇÃO'), ck_up(n->>'nome'), coalesce((n->>'crit')::ck_crit, 'media'), greatest(1, coalesce((n->>'prazo')::numeric, 72)),
            coalesce((n->>'bloqueia')::boolean, false), true, (select coalesce(max(ordem), 0) + 1 from ck_itens));
    ids := ids || nid;
  end loop;
  ids := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'itens', '[]')) x where exists (select 1 from ck_itens where id = x)), '{}') || ids;
  if mid is null then
    mid := 'm-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
    if ck_up(p->>'nome') is null then raise exception 'NOME_OBRIGATORIO'; end if;
    if jsonb_array_length(coalesce(p->'tipos', '[]')) = 0 then raise exception 'TIPOS_OBRIGATORIOS'; end if;
    insert into ck_modelos (id, nome, categoria, freq, intervalo_km, intervalo_h, tipos, ativos, origem, criado_por)
    values (mid, ck_up(p->>'nome'), cat, fq, nullif(p->>'intervalo_km','')::numeric, nullif(p->>'intervalo_h','')::numeric, (select array_agg(x) from jsonb_array_elements_text(p->'tipos') x), nullif((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'ativos','[]')) x), '{}'), coalesce(p->>'origem', 'manual'), u.id);
    perform ck_audit(u.id, 'ck_modelos', mid, 'insert', null, p);
    if cat = 'preventivo' then perform ck_prev_item(mid); end if;
  else
    select * into antes from ck_modelos where id = mid; if antes.id is null then raise exception 'MODELO_NAO_ENCONTRADO'; end if;
    update ck_modelos set nome = coalesce(ck_up(p->>'nome'), nome), categoria = cat, freq = fq,
      intervalo_km = case when fq = 'uso' then coalesce(nullif(p->>'intervalo_km','')::numeric, intervalo_km) end, intervalo_h = case when fq = 'uso' then coalesce(nullif(p->>'intervalo_h','')::numeric, intervalo_h) end,
      tipos = case when p ? 'tipos' then (select array_agg(x) from jsonb_array_elements_text(p->'tipos') x) else tipos end,
      ativos = case when p ? 'ativos' then nullif((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'ativos','[]')) x), '{}') else ativos end,
      ativo = coalesce((p->>'ativo')::boolean, ativo) where id = mid;
    perform ck_audit(u.id, 'ck_modelos', mid, 'update', to_jsonb(antes), p);
    if cat = 'preventivo' then perform ck_prev_item(mid); end if;
  end if;
  if p ? 'itens' or p ? 'novos' then
    delete from ck_modelos_itens where modelo_id = mid;
    foreach nid in array ids loop k := k + 1; insert into ck_modelos_itens (modelo_id, item_id, ordem) values (mid, nid, k) on conflict do nothing; end loop;
  end if;
  return jsonb_build_object('ok', true, 'id', mid);
end $$;

-- p = {id?, nome, cnpj?, servico?, contato?, telefone?, email?, cidade?, status?}
create or replace function ck_fornecedor_salvar(p_token uuid, p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare u ck_usuarios := ck_sessao(p_token); antes ck_fornecedores; fid uuid; cn text := nullif(ck_digitos(p->>'cnpj'), '');
begin
  perform ck_exige(u, array['master','admin']::ck_papel[]);
  if cn is not null and length(cn) <> 14 then raise exception 'CNPJ_INVALIDO'; end if;
  if (p->>'id') is null then
    if ck_up(p->>'nome') is null then raise exception 'NOME_OBRIGATORIO'; end if;
    insert into ck_fornecedores (nome, cnpj, servico, contato, telefone, email, cidade, status)
    values (ck_up(p->>'nome'), cn, ck_up(p->>'servico'), ck_up(p->>'contato'), btrim(p->>'telefone'), lower(btrim(p->>'email')), ck_up(p->>'cidade'), coalesce(p->>'status', 'ativo'))
    returning id into fid;
    perform ck_audit(u.id, 'ck_fornecedores', fid::text, 'insert', null, p);
  else
    fid := (p->>'id')::uuid; select * into antes from ck_fornecedores where id = fid; if antes.id is null then raise exception 'FORNECEDOR_NAO_ENCONTRADO'; end if;
    update ck_fornecedores set nome = coalesce(ck_up(p->>'nome'), nome), cnpj = case when p ? 'cnpj' then cn else cnpj end,
      servico = case when p ? 'servico' then ck_up(p->>'servico') else servico end, contato = case when p ? 'contato' then ck_up(p->>'contato') else contato end,
      telefone = case when p ? 'telefone' then btrim(p->>'telefone') else telefone end, email = case when p ? 'email' then lower(btrim(p->>'email')) else email end,
      cidade = case when p ? 'cidade' then ck_up(p->>'cidade') else cidade end, status = coalesce(p->>'status', status)
    where id = fid;
    perform ck_audit(u.id, 'ck_fornecedores', fid::text, 'update', to_jsonb(antes), p);
  end if;
  return jsonb_build_object('ok', true, 'id', fid);
exception when unique_violation then raise exception 'CNPJ_JA_CADASTRADO';
end $$;

-- metas e faixas (Parâmetros); histórico fica na auditoria
create or replace function ck_metas_set(p_token uuid, p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare u ck_usuarios := ck_sessao(p_token); antes jsonb; novo jsonb;
begin
  perform ck_exige(u, array['master','admin']::ck_papel[]);
  select valor into antes from ck_config where chave = 'metas';
  novo := antes || p;
  if not ((novo#>>'{conformidade,verde}')::numeric > (novo#>>'{conformidade,amarelo}')::numeric and (novo#>>'{sla,verde}')::numeric > (novo#>>'{sla,amarelo}')::numeric
          and (novo#>>'{inspecoes,verde}')::numeric > (novo#>>'{inspecoes,amarelo}')::numeric and (novo->>'mttr_h')::numeric > 0 and (novo->>'mtbf_d')::numeric > 0) then
    raise exception 'METAS_INVALIDAS';
  end if;
  update ck_config set valor = novo where chave = 'metas';
  perform ck_audit(u.id, 'ck_config', 'metas', 'update', antes, novo);
  return jsonb_build_object('ok', true, 'metas', novo);
end $$;

-- ── cobrança (só master): usuários ativos no mês × tabela do contrato ──
create or replace function ck_fatura(p_token uuid, p_mes date) returns jsonb language plpgsql security definer set search_path = public as $$
declare u ck_usuarios := ck_sessao(p_token); cb jsonb; q int; r jsonb;
begin
  perform ck_exige(u, array['master']::ck_papel[]);
  select valor into cb from ck_config where chave = 'cobranca';
  select count(*) into q from ck_v_usuarios_mes where mes = date_trunc('month', p_mes)::date;
  select jsonb_build_object('mes', date_trunc('month', p_mes)::date, 'qtd', q, 'inclusos', (cb->>'inclusos')::int,
    'excedentes', greatest(0, q - (cb->>'inclusos')::int), 'valor_base', (cb->>'valor_base')::numeric,
    'valor_excedente', greatest(0, q - (cb->>'inclusos')::int) * (cb->>'valor_usuario')::numeric,
    'total', (cb->>'valor_base')::numeric + greatest(0, q - (cb->>'inclusos')::int) * (cb->>'valor_usuario')::numeric,
    'vencimento', (date_trunc('month', p_mes) + interval '1 month' + ((cb->>'vencimento_dia')::int - 1) * interval '1 day')::date,
    'usuarios', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'papel', x.papel) order by x.nome), '[]')
                 from ck_v_usuarios_mes m join ck_usuarios x on x.id = m.usuario_id where m.mes = date_trunc('month', p_mes)::date),
    'pix', (select valor from ck_config where chave = 'pix')) into r;
  return r;
end $$;

-- ── permissões de execução: só anon/authenticated chamam as RPCs; nada mais ──
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function ck_login(text,text,text), ck_criar_senha(text,text,text), ck_solicitar_acesso(jsonb), ck_situacao_cpf(text), ck_sair(uuid),
  ck_trocar_senha(uuid,text,text), ck_resetar_senha(uuid,uuid), ck_dataset(uuid,date), ck_salvar_checklist(uuid,jsonb), ck_farol(uuid,text),
  ck_os_iniciar(uuid,int,ck_execucao), ck_os_fechar(uuid,int,jsonb), ck_os_reprogramar(uuid,int,timestamptz,text), ck_os_reabrir(uuid,int), ck_os_excluir(uuid,int,text), ck_checklist_excluir(uuid,uuid,text), ck_documento_salvar(uuid,jsonb), ck_documento_excluir(uuid,uuid), ck_preventiva_iniciar(uuid,text,text,ck_execucao), ck_preventiva_finalizar(uuid,int,jsonb),
  ck_unidade_salvar(uuid,jsonb), ck_ativo_salvar(uuid,jsonb), ck_usuario_salvar(uuid,jsonb), ck_usuario_aprovar(uuid,uuid,ck_papel),
  ck_item_salvar(uuid,jsonb), ck_diario_set(uuid,text,boolean), ck_modelo_salvar(uuid,jsonb), ck_fornecedor_salvar(uuid,jsonb),
  ck_metas_set(uuid,jsonb), ck_fatura(uuid,date)
to anon, authenticated;

-- ── Storage (buckets privados "fotos" e "anexos", criados pela API) ──
-- Política mínima para o MVP: a chave anon só INSERE (nunca lista, altera ou apaga); a leitura é por
-- caminho exato (uuid do checklist/OS no caminho = não adivinhável). Sem UPDATE/DELETE para ninguém.
do $$ begin
  create policy ck_fotos_insert on storage.objects for insert to anon with check (bucket_id in ('fotos','anexos'));
  create policy ck_fotos_select on storage.objects for select to anon using (bucket_id in ('fotos','anexos'));
exception when duplicate_object then null; end $$;
