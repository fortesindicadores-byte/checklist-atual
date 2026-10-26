-- Checklist Atual · 26/10/2026 · quem executa o checklist da equipe (equipe, ou motorista e equipe)
-- Rodar inteiro no SQL Editor do Supabase. Idempotente.
alter table ck_modelos add column if not exists exec text not null default 'equipe' check (exec in ('equipe','motorista'));

-- dataset expõe exec; salvar grava; motorista só executa (checklist e preventiva) o tipo que libera
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
    'modelos', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'nome', m.nome, 'categoria', m.categoria, 'freq', m.freq, 'intervalo_km', m.intervalo_km, 'intervalo_h', m.intervalo_h, 'ativos', m.ativos, 'tipos', m.tipos, 'ativo', m.ativo, 'exec', m.exec,
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

create or replace function ck_modelo_salvar(p_token uuid, p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare u ck_usuarios := ck_sessao(p_token); mid text := p->>'id'; antes ck_modelos; cat ck_cat_modelo; fq ck_freq; n jsonb; nid text; ids text[] := '{}'; k int := 0; ex text;
begin
  perform ck_exige(u, array['master','admin']::ck_papel[]);
  cat := coalesce((p->>'categoria')::ck_cat_modelo, 'inspecao'); fq := (p->>'freq')::ck_freq;
  ex := case when p->>'exec' in ('equipe','motorista') then p->>'exec' else 'equipe' end;   -- quem executa (26/10/2026): equipe, ou motorista e equipe
  if cat = 'inspecao' and fq not in ('semanal','quinzenal','mensal','semestral','uso') then raise exception 'FREQUENCIA_INVALIDA'; end if;
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
    insert into ck_modelos (id, nome, categoria, freq, intervalo_km, intervalo_h, tipos, ativos, origem, criado_por, exec)
    values (mid, ck_up(p->>'nome'), cat, fq, nullif(p->>'intervalo_km','')::numeric, nullif(p->>'intervalo_h','')::numeric, (select array_agg(x) from jsonb_array_elements_text(p->'tipos') x), nullif((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'ativos','[]')) x), '{}'), coalesce(p->>'origem', 'manual'), u.id, ex);
    perform ck_audit(u.id, 'ck_modelos', mid, 'insert', null, p);
    if cat = 'preventivo' then perform ck_prev_item(mid); end if;
  else
    select * into antes from ck_modelos where id = mid; if antes.id is null then raise exception 'MODELO_NAO_ENCONTRADO'; end if;
    update ck_modelos set nome = coalesce(ck_up(p->>'nome'), nome), categoria = cat, freq = fq,
      intervalo_km = case when fq = 'uso' then coalesce(nullif(p->>'intervalo_km','')::numeric, intervalo_km) end, intervalo_h = case when fq = 'uso' then coalesce(nullif(p->>'intervalo_h','')::numeric, intervalo_h) end,
      tipos = case when p ? 'tipos' then (select array_agg(x) from jsonb_array_elements_text(p->'tipos') x) else tipos end,
      ativos = case when p ? 'ativos' then nullif((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'ativos','[]')) x), '{}') else ativos end,
      ativo = coalesce((p->>'ativo')::boolean, ativo), exec = case when p ? 'exec' then ex else exec end where id = mid;
    perform ck_audit(u.id, 'ck_modelos', mid, 'update', to_jsonb(antes), p);
    if cat = 'preventivo' then perform ck_prev_item(mid); end if;
  end if;
  if p ? 'itens' or p ? 'novos' then
    delete from ck_modelos_itens where modelo_id = mid;
    foreach nid in array ids loop k := k + 1; insert into ck_modelos_itens (modelo_id, item_id, ordem) values (mid, nid, k) on conflict do nothing; end loop;
  end if;
  return jsonb_build_object('ok', true, 'id', mid);
end $$;

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
    if not exists (select 1 from ck_modelos where id = p->>'modelo' and ativo) then raise exception 'MODELO_INVALIDO'; end if;
    if u.papel = 'motorista' and not exists (select 1 from ck_modelos where id = p->>'modelo' and exec = 'motorista') then raise exception 'SEM_PERMISSAO'; end if;   -- quem executa (26/10/2026)
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

create or replace function ck_preventiva_iniciar(p_token uuid, p_ativo text, p_modelo text, p_execucao ck_execucao default 'interna') returns jsonb
language plpgsql security definer set search_path = public as $$
declare u ck_usuarios := ck_sessao(p_token); iid text; nid int; m ck_modelos;
begin
  select * into m from ck_modelos where id = p_modelo and ativo; if m.id is null then raise exception 'MODELO_INVALIDO'; end if;
  if u.papel = 'motorista' and m.exec <> 'motorista' then raise exception 'SEM_PERMISSAO'; end if;   -- quem executa (26/10/2026): motorista só se o tipo liberar
  if not exists (select 1 from ck_ativos where id = p_ativo and status = 'ativo') then raise exception 'ATIVO_NAO_ENCONTRADO'; end if;
  iid := ck_prev_item(p_modelo);
  if exists (select 1 from ck_os where ativo_id = p_ativo and item_id = iid and status = 'em_andamento') then raise exception 'PREVENTIVA_JA_EM_ANDAMENTO'; end if;
  insert into ck_os (ativo_id, item_id, crit, prazo_h, bloqueia, limite, status, aberta_por, responsavel, execucao)
  values (p_ativo, iid, 'media', 24, false, now() + interval '24 hours', 'em_andamento', u.id, u.id, p_execucao) returning id into nid;
  insert into ck_os_eventos (os_id, tipo, por, texto) values (nid, 'aberta', u.id, 'PREVENTIVA INICIADA · ' || m.nome), (nid, 'em_andamento', u.id, 'ATENDIMENTO ' || upper(p_execucao::text));
  return jsonb_build_object('ok', true, 'id', nid);
end $$;
