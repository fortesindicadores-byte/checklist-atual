-- Checklist Atual · 23/10/2026 · excluir tipo de checklist + nomes sem km
-- excluir tipo de checklist: só sem histórico (nenhuma execução nem OS de preventiva); com histórico, só desativar
create or replace function ck_modelo_excluir(p_token uuid, p_modelo text) returns jsonb language plpgsql security definer set search_path = public as $$
declare u ck_usuarios := ck_sessao(p_token); m ck_modelos;
begin
  perform ck_exige(u, array['master','admin']::ck_papel[]);
  select * into m from ck_modelos where id = p_modelo; if m.id is null then raise exception 'MODELO_NAO_ENCONTRADO'; end if;
  if exists (select 1 from ck_checklists where modelo_id = p_modelo) or exists (select 1 from ck_os where item_id = 'prev-' || p_modelo) then raise exception 'MODELO_COM_HISTORICO'; end if;
  if exists (select 1 from ck_documentos where modelo_id = p_modelo and excluido_em is null) then raise exception 'MODELO_COM_DOCUMENTOS'; end if;
  update ck_modelos set inclui = nullif(array_remove(inclui, p_modelo), '{}') where p_modelo = any(inclui);
  delete from ck_prev_base where modelo_id = p_modelo;
  delete from ck_documentos where modelo_id = p_modelo;
  delete from ck_modelos_itens where modelo_id = p_modelo;
  delete from ck_modelos where id = p_modelo;
  delete from ck_itens where id = 'prev-' || p_modelo;
  perform ck_audit(u.id, 'ck_modelos', p_modelo, 'delete', to_jsonb(m), null);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function ck_modelo_excluir(uuid,text) from public;
grant execute on function ck_modelo_excluir(uuid,text) to anon, authenticated;

update ck_modelos set nome = 'REVISÃO BÁSICA · CAMINHÕES' where id = 'rev-revisao-a-10-000-km-caminhoes';
update ck_modelos set nome = 'REVISÃO COMPLETA · CAMINHÕES' where id = 'rev-revisao-b-20-000-km-caminhoes';
update ck_modelos set nome = 'REVISÃO GERAL · CAMINHÕES' where id = 'rev-revisao-c-60-000-km-caminhoes';
update ck_modelos set nome = 'REVISÃO BÁSICA · LEVES E KOMBI' where id = 'rev-revisao-10-000-km-veiculos-leves-e-kombi';
update ck_modelos set nome = 'REVISÃO COMPLETA · LEVES E KOMBI' where id = 'rev-revisao-40-000-km-veiculos-leves-e-kombi';
update ck_modelos set nome = 'CORREIA DENTADA · LEVES E KOMBI' where id = 'rev-correia-dentada-60-000-km-leves';
update ck_modelos set nome = 'REVISÃO · REBOQUES E PRANCHAS' where id = 'rev-revisao-semestral-reboques-e-pranchas';
select ck_prev_item(id) from ck_modelos where id like 'rev-%' and categoria = 'preventivo';

notify pgrst, 'reload schema';
