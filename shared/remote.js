/* ══════════════════════════════════════════════════════════════════════
   CHECKLIST ATUAL · camada REMOTA (12/10/2026)
   Troca o banco local da demo pelas RPCs do Supabase (supabase/rpc.sql).
   Carrega DEPOIS de core.js. Só age quando CK.REMOTO é true (ver core.js).
   Leituras continuam síncronas sobre o dataset em memória (CK.load());
   escritas viram async: cada função retorna uma Promise de {ok, erro?}.
   ══════════════════════════════════════════════════════════════════════ */
(function(){
  if (!window.CK || !CK.REMOTO) return;
  var C = window.CK_REMOTO, URL0 = C.url.replace(/\/$/, ''), ANON = C.anon, LSK = 'ck_sess_token';
  var token = null; try { token = localStorage.getItem(LSK); } catch(e){}
  var ORIGEM = /\/gestao\//.test(location.pathname) ? 'portal' : 'app';

  var MSG = {
    SENHA_INCORRETA:'Senha incorreta.', CPF_NAO_CADASTRADO:'CPF não cadastrado. Peça acesso ao gestor da frota.', AGUARDANDO_APROVACAO:'Seu acesso ainda não foi aprovado.',
    USUARIO_BLOQUEADO:'Usuário bloqueado. Fale com o gestor da frota.', USUARIO_PENDENTE:'Seu acesso ainda não foi aprovado.', MUITAS_TENTATIVAS:'Muitas tentativas. Aguarde 15 minutos.',
    PRIMEIRO_ACESSO:'Primeiro acesso: crie sua senha de 6 números.', SENHA_6_NUMEROS:'A senha são 6 números.', JA_TEM_SENHA:'Você já tem senha. Entre com ela.',
    SESSAO_INVALIDA:'Sua sessão expirou. Entre de novo.', SEM_PERMISSAO:'Seu perfil não pode fazer isso.', CPF_JA_CADASTRADO:'CPF já cadastrado.', CPF_INVALIDO:'CPF inválido.',
    NOME_OBRIGATORIO:'Informe o nome.', UNIDADE_JA_EXISTE:'Já existe uma unidade com esse nome.', UNIDADE_INVALIDA:'Unidade não encontrada.', TIPO_INVALIDO:'Tipo de ativo inválido.',
    CODIGO_OBRIGATORIO:'Informe o código do ativo.', ATIVO_NAO_ENCONTRADO:'Ativo não encontrado.', ITEM_JA_EXISTE:'Já existe um item com esse nome.', ITEM_NAO_ENCONTRADO:'Item não encontrado.',
    ITEM_INVALIDO:'Item inválido.', MODELO_INVALIDO:'Checklist inválido.', MODELO_NAO_ENCONTRADO:'Checklist não encontrado.', FREQUENCIA_INVALIDA:'Frequência inválida para esse tipo de checklist.',
    TIPOS_OBRIGATORIOS:'Escolha ao menos um tipo de ativo.', CHECKLIST_VAZIO:'Nenhum item respondido.', FOTO_OBRIGATORIA:'A foto é obrigatória na não conformidade.',
    OS_NAO_ABERTA:'A OS não está aberta.', OS_JA_FECHADA:'A OS já está fechada.', OS_NAO_FECHADA:'A OS não está fechada.', EVIDENCIA_OBRIGATORIA:'Para fechar, anexe a foto da correção ou descreva o que foi feito.',
    INFORME_INTERNA_EXTERNA:'Informe se o atendimento foi interno ou externo.', FORNECEDOR_INVALIDO:'Fornecedor não encontrado.', FORNECEDOR_NAO_ENCONTRADO:'Fornecedor não encontrado.',
    MOTIVO_OBRIGATORIO:'Informe o motivo.', SO_MASTER_CRIA_ADMIN:'Só o admin master cria administradores.', SO_MASTER_APROVA_ADMIN:'Só o admin master aprova administradores.',
    PEDIDO_NAO_ENCONTRADO:'Pedido de acesso não encontrado.', CNPJ_INVALIDO:'CNPJ precisa ter 14 números.', CNPJ_JA_CADASTRADO:'Já existe um fornecedor com esse CNPJ.',
    METAS_INVALIDAS:'O amarelo precisa ser menor que o verde e as metas maiores que zero.', UPLOAD_FALHOU:'Não deu para enviar a foto. Verifique a conexão.', FOTO_INVALIDA:'Foto inválida.'
  };
  function erro(e){
    var code = String((e && (e.code || e.message)) || ''), k = code.split(/\s/)[0];
    if (/^(TypeError|Failed|NetworkError)/.test(code) || !code) return { ok:false, erro:'Sem conexão. Tente de novo.', code:'REDE' };
    return { ok:false, erro: MSG[k] || code, code:k };
  }
  function hdr(extra){ var h = { apikey:ANON, Authorization:'Bearer ' + ANON }; if (extra) Object.keys(extra).forEach(function(k){ h[k] = extra[k]; }); return h; }
  async function rpc(fn, body){
    var r = await fetch(URL0 + '/rest/v1/rpc/' + fn, { method:'POST', headers:hdr({ 'Content-Type':'application/json' }), body:JSON.stringify(body || {}) });
    var t = await r.text(), j = null; try { j = t ? JSON.parse(t) : null; } catch(e){}
    if (!r.ok) { var e = new Error((j && j.message) || ('HTTP ' + r.status)); e.code = (j && j.message) || ''; throw e; }
    return j;
  }

  /* ── datas: o servidor manda ISO com fuso; a demo trabalha em hora local 'YYYY-MM-DDTHH:MM:SS' ── */
  function p2(n){ return (n < 10 ? '0' : '') + n; }
  function loc(ts){ if (!ts) return null; var d = new Date(ts); if (isNaN(d)) return ts; return d.getFullYear() + '-' + p2(d.getMonth()+1) + '-' + p2(d.getDate()) + 'T' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()); }
  function utc(s){ return s ? new Date(CK.parse(s)).toISOString() : null; }
  function osId(n){ return n == null ? null : 'OS-' + String(n).padStart(4, '0'); }
  function osNum(id){ return parseInt(String(id).replace(/\D/g, ''), 10); }

  /* ── dataset do servidor → formato do banco da demo (o que o app e o portal já leem) ── */
  function adaptar(d){
    var cfg = d.config || {}, cob = cfg.cobranca || {};
    var db = {
      versao:'remoto', gerado_em:loc(d.gerado_em), eu:d.eu,
      unidades:(d.unidades || []).map(function(u){ return { id:String(u.id), nome:u.nome, ativa:u.ativa }; }),
      fornecedores:d.fornecedores || [],
      ativos:(d.ativos || []).map(function(a){ return Object.assign({ risco:0 }, a, { unidade:a.unidade || '' }); }),
      usuarios:(d.usuarios || []).map(function(u){ return Object.assign({}, u, { criado_em:loc(u.criado_em), ultimo_acesso:loc(u.ultimo_acesso), unidade:u.unidade || '' }); }),
      checklists:(d.checklists || []).map(function(c){ return Object.assign({}, c, { data:loc(c.data), ncs:c.ncs || [] }); }).sort(function(a, b){ return a.data < b.data ? -1 : 1; }),
      os:(d.os || []).map(function(o){ return Object.assign({}, o, {
        id:osId(o.id), num:o.id, abertura:loc(o.abertura), limite:loc(o.limite), limite_atual:loc(o.limite_atual), fechada_em:loc(o.fechada_em),
        checklists:o.checklist ? [o.checklist] : [], retorno_de:osId(o.retorno_de), foto_fech:o.foto_fech,
        eventos:(o.eventos || []).map(function(e){ return { q:loc(e.q), t:e.t, por:e.por, txt:e.txt, dados:e.dados }; }),
        reprog:(o.reprog || []).map(function(r){ return { q:loc(r.q), por:r.por, motivo:r.motivo, novo_limite:loc(r.novo_limite) }; }) }); })
        .sort(function(a, b){ return a.abertura < b.abertura ? -1 : 1; }),
      fotos:{}, anexos:{},
      modelos:(d.modelos || []).map(function(m){ return Object.assign({ exec:'equipe', sistema:false }, m, { criado_em:loc(m.criado_em) }); }),
      diarios_off:(d.tipos || []).filter(function(t){ return t.diario_ativo === false; }).map(function(t){ return t.id; }),
      itens_extra:[], itens_cfg:{}, maiusculas:true,
      config:Object.assign({}, cob, { cliente:cfg.cliente, pix:cfg.pix || {}, metas:cfg.metas || {} })
    };
    CK.setCatalogo((d.itens || []).map(function(i){ return Object.assign({}, i, { prazo:+i.prazo, ap:i.ap || [] }); }));
    CK.setDB(db);
    return db;
  }
  async function sync(){
    if (!token) return CK.load();
    try { return adaptar(await rpc('ck_dataset', { p_token:token })); }
    catch(e){ if (erro(e).code === 'SESSAO_INVALIDA') { token = null; try { localStorage.removeItem(LSK); } catch(x){} } throw e; }
  }
  async function escreve(fn, body){
    try { var r = await rpc(fn, Object.assign({ p_token:token }, body)); await sync(); return Object.assign({ ok:true }, r || {}); }
    catch(e){ return erro(e); }
  }

  /* ── Storage: fotos e anexos (buckets privados; a chave anon só insere) ── */
  async function upload(bucket, path, dataUrl){
    var m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || ''); if (!m) throw Object.assign(new Error('FOTO_INVALIDA'), { code:'FOTO_INVALIDA' });
    var bin = atob(m[2]), u8 = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    var r = await fetch(URL0 + '/storage/v1/object/' + bucket + '/' + path, { method:'POST', headers:hdr({ 'Content-Type':m[1], 'x-upsert':'false' }), body:u8 });
    if (!r.ok) throw Object.assign(new Error('UPLOAD_FALHOU'), { code:'UPLOAD_FALHOU' });
    return path;
  }
  var ASS = {};   /* cache de URLs assinadas */
  async function assinar(bucket, path){
    var k = bucket + '/' + path; if (ASS[k] && ASS[k].ate > Date.now()) return ASS[k].url;
    var r = await fetch(URL0 + '/storage/v1/object/sign/' + k, { method:'POST', headers:hdr({ 'Content-Type':'application/json' }), body:JSON.stringify({ expiresIn:3600 }) });
    if (!r.ok) return null;
    var j = await r.json(), url = URL0 + '/storage/v1' + j.signedURL; ASS[k] = { url:url, ate:Date.now() + 50 * 60000 }; return url;
  }
  /* <img src="data:,ckfoto/caminho"> vira URL assinada sozinho (o app e o portal não mudam) */
  function resolverFotos(root){
    (root || document).querySelectorAll('img[src^="data:,ckfoto/"]').forEach(function(img){
      var path = img.getAttribute('src').slice(13); img.removeAttribute('src'); img.dataset.ckfoto = path;
      assinar('fotos', path).then(function(u){ if (u) img.src = u; });
    });
  }
  new MutationObserver(function(){ resolverFotos(); }).observe(document.documentElement, { childList:true, subtree:true });
  function limpaNome(n){ return String(n || 'anexo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]/g, '_').slice(-60); }

  /* ── API pública: mesmos nomes da demo, agora async ── */
  CK.sincronizar = sync;
  CK.sessaoAtiva = function(){ return !!token; };
  CK.restaurarSessao = async function(){ if (!token) return null; try { var db = await sync(); return db.eu; } catch(e){ return null; } };
  CK.recarregar = function(){ sync().catch(function(){}); return CK.load(); };
  CK.save = function(){}; CK.reset = function(){};
  CK.login = async function(cpf, senha){
    try { var r = await rpc('ck_login', { p_cpf:cpf, p_senha:senha, p_origem:ORIGEM }); token = r.token; try { localStorage.setItem(LSK, token); } catch(e){} await sync(); return { ok:true, usuario:r.usuario }; }
    catch(e){ var x = erro(e); if (x.code === 'PRIMEIRO_ACESSO') x.primeira_vez = true; return x; }
  };
  CK.criarPin = async function(cpf, senha){
    try { var r = await rpc('ck_criar_senha', { p_cpf:cpf, p_senha:senha, p_origem:ORIGEM }); token = r.token; try { localStorage.setItem(LSK, token); } catch(e){} await sync(); return { ok:true, usuario:r.usuario }; }
    catch(e){ return erro(e); }
  };
  CK.sair = async function(){ try { if (token) await rpc('ck_sair', { p_token:token }); } catch(e){} token = null; try { localStorage.removeItem(LSK); } catch(e){} };
  CK.solicitarAcesso = async function(d){
    try { var r = await rpc('ck_solicitar_acesso', { p:{ nome:d.nome, cpf:d.cpf, senha:d.pin || d.senha, unidade:d.unidade, papel_solicitado:d.papel_solicitado, origem:d.origem || ORIGEM } });
      return { ok:true, usuario:{ id:r.id, nome:d.nome, cpf:d.cpf, papel_solicitado:d.papel_solicitado || 'motorista', status:'pendente' } }; }
    catch(e){ return erro(e); }
  };
  CK.situacaoCpf = async function(cpf){ try { return await rpc('ck_situacao_cpf', { p_cpf:cpf }); } catch(e){ return null; } };

  CK.salvarChecklist = async function(resp){
    try {
      var cid = CK.uid('ck'), itens = [];
      for (var i = 0; i < resp.itens.length; i++) {
        var it = resp.itens[i], foto = null;
        if (it.ok === false) { if (!it.foto) throw Object.assign(new Error('FOTO_OBRIGATORIA'), { code:'FOTO_OBRIGATORIA' }); foto = await upload('fotos', cid + '/' + it.item + '.jpg', it.foto); }
        itens.push({ item:it.item, ok:it.ok, obs:it.obs || '', foto:foto });
      }
      var r = await rpc('ck_salvar_checklist', { p_token:token, p:{ ativo:resp.ativo, modelo:(resp.modelo && !/^d-/.test(resp.modelo)) ? resp.modelo : null,
        leitura:resp.leitura, duracao_s:resp.duracao_s, cliente_id:cid, itens:itens } });
      var db = await sync(), ck = db.checklists.filter(function(c){ return c.id === r.id; })[0];
      var cri = db.os.filter(function(o){ return (r.os_criadas || []).indexOf(o.num) >= 0; }), rei = db.os.filter(function(o){ return (r.reincidencias || []).indexOf(o.num) >= 0; });
      return { ok:true, checklist:ck, os_criadas:cri, os_reincidentes:rei, bloqueado:r.bloqueado };
    } catch(e){ return erro(e); }
  };
  CK.osIniciar = function(id, por, execucao){ return escreve('ck_os_iniciar', { p_os:osNum(id), p_execucao:execucao }); };
  CK.osReabrir = function(id){ return escreve('ck_os_reabrir', { p_os:osNum(id) }); };
  CK.osReprogramar = function(id, d){ return escreve('ck_os_reprogramar', { p_os:osNum(id), p_novo_limite:utc(d.novo_limite), p_motivo:d.motivo }); };
  CK.osFechar = async function(id, d){
    try {
      var num = osNum(id), foto = null, doc = null;
      if (d.foto && d.foto !== 'demo') foto = await upload('fotos', 'os-' + num + '/fechamento-' + Date.now() + '.jpg', d.foto);
      if (d.doc && d.doc.data) doc = { path:await upload('anexos', 'os-' + num + '/' + Date.now() + '-' + limpaNome(d.doc.nome), d.doc.data), tipo:d.doc_tipo, nome:d.doc.nome };
      return await escreve('ck_os_fechar', { p_os:num, p:{ solucao:d.solucao, foto:foto, execucao:d.execucao, custo:d.custo, fornecedor:d.fornecedor, doc:doc } });
    } catch(e){ return erro(e); }
  };
  CK.foto = function(ref){ if (!ref) return null; if (ref === 'demo') return 'demo'; if (/^(data:image|https?:)/.test(ref)) return ref; return 'data:,ckfoto/' + ref; };   /* data: vazio evita erro de esquema no console até a URL assinada chegar */
  CK.anexo = function(path){ if (!path) return null; return { nome:String(path).split('/').pop().replace(/^\d+-/, ''), remoto:true, path:path }; };
  CK.anexoUrl = function(path){ return assinar('anexos', path); };

  function unid(d){ var x = Object.assign({}, d); if (x.unidade != null) x.unidade = String(x.unidade); return x; }
  CK.ativoCriar = function(d){ return escreve('ck_ativo_salvar', { p:unid(d) }); };
  CK.ativoSet = function(id, p){ return escreve('ck_ativo_salvar', { p:Object.assign({ id:id }, unid(p)) }); };
  CK.ativoItensFora = function(id, lista){ return escreve('ck_ativo_salvar', { p:{ id:id, itens_fora:lista || [] } }); };
  CK.usuarioCriar = async function(d){ var r = await escreve('ck_usuario_salvar', { p:unid(d) }); if (r.ok) r.usuario = { id:r.id }; return r; };
  CK.usuarioSet = function(id, p){
    var u = CK.usuario(id);
    if (u && u.status === 'pendente' && p && p.status === 'ativo') return escreve('ck_usuario_aprovar', { p_usuario:id, p_papel:p.papel || null });
    return escreve('ck_usuario_salvar', { p:Object.assign({ id:id }, unid(p)) });
  };
  CK.resetarSenha = function(id){ return escreve('ck_resetar_senha', { p_usuario:id }); };
  CK.trocarSenha = async function(atual, nova){ try { await rpc('ck_trocar_senha', { p_token:token, p_atual:atual, p_nova:nova }); return { ok:true }; } catch(e){ return erro(e); } };
  CK.unidadeCriar = function(nome){ return escreve('ck_unidade_salvar', { p:{ nome:nome } }); };
  CK.unidadeSet = function(id, p){ return escreve('ck_unidade_salvar', { p:Object.assign({ id:+id }, p) }); };
  CK.itemCriar = async function(d){ var r = await escreve('ck_item_salvar', { p:d }); if (r.ok) r.item = CK.ITEM[r.id]; return r; };
  CK.itemSet = function(id, p){ return escreve('ck_item_salvar', { p:Object.assign({ id:id }, p) }); };
  CK.diarioItensSet = function(){ return Promise.resolve({ ok:false, erro:'Os itens do diário são editados em Itens e SLA.' }); };
  CK.modeloCriar = async function(d){ var r = await escreve('ck_modelo_salvar', { p:d }); if (r.ok) r.modelo = CK.modelo(r.id); return r; };
  CK.modeloSet = function(id, p){
    if (/^d-/.test(id)) return escreve('ck_diario_set', { p_tipo:id.slice(2), p_ativo:p.ativo !== false });
    return escreve('ck_modelo_salvar', { p:Object.assign({ id:id }, p) });
  };
  CK.fornecedorCriar = function(d){ return escreve('ck_fornecedor_salvar', { p:d }); };
  CK.fornecedorSet = function(id, p){ return escreve('ck_fornecedor_salvar', { p:Object.assign({ id:id }, p) }); };
  CK.metasSet = function(p){ return escreve('ck_metas_set', { p:p }); };
  CK.fatura = async function(mk){
    try {
      var f = await rpc('ck_fatura', { p_token:token, p_mes:mk + '-01' }), cfg = CK.load().config, p = mk.split('-'), primeira = mk === CK.mesesCobranca()[0];
      var total = +f.total + (primeira ? +(cfg.implantacao || 0) : 0);
      return { mes:mk, mes_nome:CK.mesNome(mk), usuarios:f.usuarios || [], qtd:f.qtd, inclusos:f.inclusos, excedente:f.excedentes, valor_base:+f.valor_base,
        valor_excedente:+f.valor_excedente, implantacao:primeira ? +(cfg.implantacao || 0) : 0, total:total, vencimento:f.vencimento,
        numero:'FAT-' + p[0] + p[1] + '-ATUAL', txid:('ATUAL' + p[0] + p[1]).slice(0, 25), status:CK.parse(f.vencimento) < CK.HOJE ? 'paga' : 'em aberto' };
    } catch(e){ return Object.assign({ qtd:0, inclusos:0, excedente:0, valor_base:0, valor_excedente:0, implantacao:0, total:0, usuarios:[], mes:mk, mes_nome:CK.mesNome(mk), vencimento:null }, erro(e)); }
  };
})();
