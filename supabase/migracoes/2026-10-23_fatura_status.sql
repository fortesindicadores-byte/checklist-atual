-- Checklist Atual · 23/10/2026 · status da fatura
create table if not exists ck_faturas (
  mes date primary key,
  status text not null check (status in ('aberta','paga')),
  pago_em date,
  valor_pago numeric,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references ck_usuarios(id)
);
alter table ck_faturas enable row level security;

-- status da fatura (só master): paga com data e valor, ou em aberto; vencida é calculada (vencimento passou sem pagamento)
create or replace function ck_fatura_status(p_token uuid, p_mes date, p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare u ck_usuarios := ck_sessao(p_token); m date := date_trunc('month', p_mes)::date; st text := p->>'status'; pg date := nullif(p->>'pago_em','')::date; antes jsonb;
begin
  perform ck_exige(u, array['master']::ck_papel[]);
  if st not in ('aberta','paga') then raise exception 'STATUS_INVALIDO'; end if;
  if st = 'paga' and (pg is null or pg > current_date) then raise exception 'DATA_PAGAMENTO_INVALIDA'; end if;
  select to_jsonb(f) into antes from ck_faturas f where f.mes = m;
  insert into ck_faturas (mes, status, pago_em, valor_pago, atualizado_por)
  values (m, st, case when st = 'paga' then pg end, case when st = 'paga' then nullif(p->>'valor_pago','')::numeric end, u.id)
  on conflict (mes) do update set status = excluded.status, pago_em = excluded.pago_em, valor_pago = excluded.valor_pago, atualizado_em = now(), atualizado_por = u.id;
  perform ck_audit(u.id, 'ck_faturas', m::text, 'update', antes, p);
  return jsonb_build_object('ok', true);
end $$;

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
    'pix', (select valor from ck_config where chave = 'pix'),
    'pagamento', (select jsonb_build_object('status', f.status, 'pago_em', f.pago_em, 'valor_pago', f.valor_pago) from ck_faturas f where f.mes = date_trunc('month', p_mes)::date)) into r;
  return r;
end $$;

revoke all on function ck_fatura_status(uuid,date,jsonb) from public;
grant execute on function ck_fatura_status(uuid,date,jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
