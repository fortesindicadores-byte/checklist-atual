/* ============================================================
   CHECKLIST ATUAL — núcleo compartilhado (app do motorista + portal gestor)
   OneSpot · Construtora e Pavimentadora Atual

   MODO DEMO (fase de desenho, 10/10/2026): tudo roda no navegador com dados
   fictícios gerados aqui e guardados no localStorage. App e portal estão no
   mesmo domínio, então um checklist salvo no app aparece no portal na hora.
   Quando o Supabase entrar, as funções públicas (CK.*) mantêm a assinatura e
   passam a chamar RPCs — as telas não mudam.

   Carregar ANTES deste arquivo: shared/ativos.js (CK_ATIVOS).
   ============================================================ */
var CK = (function(){
  'use strict';
  /* MODO REMOTO (12/10/2026): com shared/config.js (CK_REMOTO) fora do localhost — ou localStorage ck_modo='remoto' — o banco é o Supabase
     (shared/remote.js troca as funções de escrita por RPCs); aqui load() nunca gera demo e save() não grava nada. */
  var REMOTO = !!(window.CK_REMOTO && window.CK_REMOTO.url && (window.CK_REMOTO.forcar || !/^(localhost|127\.0\.0\.1)$/.test(location.hostname) || (function(){ try { return localStorage.getItem('ck_modo') === 'remoto'; } catch(e){ return false; } })()));
  var PIN_LEN = REMOTO ? 6 : 4;   /* senha: 6 números na plataforma oficial, 4 na demo */
  var KEY = 'ck_atual_db_v10';   /* v10: catálogo v2 — componente em MAIÚSCULAS + orientação + exemplo de observação (12/10/2026) */
  var HOJE = new Date(); HOJE.setHours(0,0,0,0);

  /* ──────────────────────────────────────────────────────────
     1. CATÁLOGO
     ────────────────────────────────────────────────────────── */
  /* tipos de ativo = os checklists diários reais da Atual (planilhas de 12/10/2026) */
  var TIPOS = [
    { id:'CAMINHAO', nome:'CAMINHÃO BASCULANTE', grupo:'rodo', medidor:'km',  icone:'truck' },
    { id:'CAVALO',   nome:'CAVALO MECÂNICO',     grupo:'rodo', medidor:'km',  icone:'truck' },
    { id:'PIPA',     nome:'CAMINHÃO PIPA',       grupo:'rodo', medidor:'km',  icone:'truck' },
    { id:'COMBOIO',  nome:'COMBOIO',             grupo:'rodo', medidor:'km',  icone:'truck' },
    { id:'ESPARG',   nome:'ESPARGIDOR',          grupo:'rodo', medidor:'km',  icone:'truck' },
    { id:'LEVE',     nome:'FROTA LEVE',          grupo:'rodo', medidor:'km',  icone:'car' },
    { id:'KOMBI',    nome:'KOMBI',               grupo:'rodo', medidor:'km',  icone:'car' },
    { id:'REBOQUE',  nome:'REBOQUE / PRANCHA',   grupo:'impl', medidor:null,  icone:'trailer' },
    { id:'RETRO',    nome:'RETROESCAVADEIRA',    grupo:'maq',  medidor:'h',   icone:'machine' },
    { id:'ESCAV',    nome:'ESCAVADEIRA',         grupo:'maq',  medidor:'h',   icone:'machine' },
    { id:'MINI',     nome:'MINICARREGADEIRA',    grupo:'maq',  medidor:'h',   icone:'machine' },
    { id:'CARREG',   nome:'PÁ CARREGADEIRA',     grupo:'maq',  medidor:'h',   icone:'machine' },
    { id:'MOTO',     nome:'PATROLA (MOTONIVELADORA)', grupo:'maq', medidor:'h', icone:'machine' },
    { id:'ROLO',     nome:'ROLO COMPACTADOR',    grupo:'maq',  medidor:'h',   icone:'roller' },
    { id:'VIBRO',    nome:'VIBROACABADORA',      grupo:'maq',  medidor:'h',   icone:'machine' },
    { id:'EQUIP',    nome:'EQUIPAMENTO',         grupo:'maq',  medidor:'h',   icone:'tool' }
  ];
  var TIPO = {}; TIPOS.forEach(function(t){ TIPO[t.id] = t; });

  /* criticidade = impacto; prazo = horas para resolver (SLA); bloqueia = o ativo
     não deve operar enquanto estiver reprovado. São três atributos
     INDEPENDENTES (Renan, 10/10/2026: farol é crítico mas resolve em 1h;
     embreagem é crítica e leva 15 dias). `ap` = a quais grupos/tipos o item
     se aplica: 'all', grupo ('rodo','maq','impl') ou lista de tipos. */
  var CRIT = {
    critica: { nome:'CRÍTICA', cor:'#FF5252', ordem:0 },
    alta:    { nome:'ALTA',    cor:'#F4A100', ordem:1 },
    media:   { nome:'MÉDIA',   cor:'#2E90E8', ordem:2 },
    baixa:   { nome:'BAIXA',   cor:'#8B94A6', ordem:3 }
  };
  /* catálogo REAL da Atual (13 planilhas diárias, 12/10/2026) + itens sugeridos na validação (sugerido:true) + listas provisórias dos tipos sem planilha.
     dica = orientação que aparece para o motorista; flag = marca usada para tirar o item de ativos que não têm aquilo (basculamento, prancha, rolo de pneu…) */
  var ITENS = [
    {"id": "doc", "cat": "DOCUMENTAÇÃO E SEGURANÇA", "nome": "DOCUMENTAÇÃO DO VEÍCULO E DO CONDUTOR", "crit": "alta", "prazo": 24, "bloqueia": true, "ap": ["CAMINHAO", "CAVALO", "PIPA", "COMBOIO", "ESPARG", "LEVE", "KOMBI", "REBOQUE"], "dica": "CRLV do veículo e CNH do condutor em dia e a bordo.", "ex": "CRLV vencido desde março"},
    {"id": "cinto", "cat": "DOCUMENTAÇÃO E SEGURANÇA", "nome": "CINTO DE SEGURANÇA", "crit": "critica", "prazo": 24, "bloqueia": true, "ap": ["CAMINHAO", "CAVALO", "PIPA", "COMBOIO", "ESPARG", "LEVE", "KOMBI", "RETRO", "ESCAV", "MINI", "CARREG", "MOTO", "ROLO", "VIBRO", "EQUIP"], "dica": "Trava, retrai e está sem cortes, em todos os bancos.", "ex": "Cinto do motorista não trava"},
    {"id": "ext", "cat": "DOCUMENTAÇÃO E SEGURANÇA", "nome": "EXTINTOR DE INCÊNDIO", "crit": "alta", "prazo": 24, "bloqueia": true, "ap": ["CAMINHAO", "CAVALO", "PIPA", "COMBOIO", "ESPARG", "LEVE", "KOMBI", "RETRO", "ESCAV", "MINI", "CARREG", "MOTO", "ROLO", "VIBRO", "EQUIP"], "dica": "Dentro da validade, com lacre e ponteiro na faixa verde, fixado no suporte.", "ex": "Extintor vencido em 08/26"},
    {"id": "taco", "cat": "DOCUMENTAÇÃO E SEGURANÇA", "nome": "TACÓGRAFO", "crit": "media", "prazo": 168, "bloqueia": false, "ap": ["CAMINHAO", "CAVALO", "PIPA", "COMBOIO", "ESPARG"], "dica": "Funcionando e registrando.", "ex": "Tacógrafo não está registrando"},
    {"id": "licamb", "cat": "DOCUMENTAÇÃO E SEGURANÇA", "nome": "LICENÇAS AMBIENTAIS (FEPAM E IBAMA)", "crit": "alta", "prazo": 24, "bloqueia": true, "ap": ["COMBOIO"], "dica": "Válidas e a bordo.", "ex": "Licença da FEPAM vencida"},
    {"id": "fispq", "cat": "DOCUMENTAÇÃO E SEGURANÇA", "nome": "FISPQ DOS PRODUTOS TRANSPORTADOS", "crit": "alta", "prazo": 24, "bloqueia": true, "ap": ["COMBOIO"], "dica": "Fichas de segurança dos produtos a bordo.", "ex": "Falta a FISPQ do diesel S10"},
    {"id": "mopp", "cat": "DOCUMENTAÇÃO E SEGURANÇA", "nome": "CURSO MOPP DO CONDUTOR", "crit": "alta", "prazo": 24, "bloqueia": true, "ap": ["COMBOIO", "ESPARG"], "dica": "Certificado válido para movimentação de produtos perigosos.", "ex": "MOPP vence semana que vem"},
    {"id": "cipp", "cat": "DOCUMENTAÇÃO E SEGURANÇA", "nome": "CIPP DO VEÍCULO", "crit": "alta", "prazo": 24, "bloqueia": true, "ap": ["COMBOIO", "ESPARG"], "dica": "Certificado de inspeção para transporte de produtos perigosos, válido.", "ex": "CIPP vencido"},
    {"id": "placpp", "cat": "DOCUMENTAÇÃO E SEGURANÇA", "nome": "PLACAS DE PRODUTO PERIGOSO", "crit": "alta", "prazo": 24, "bloqueia": true, "ap": ["COMBOIO", "ESPARG"], "dica": "Painel de segurança e rótulo de risco nas 2 laterais, legíveis.", "ex": "Rótulo de risco do lado direito rasgado"},
    {"id": "epi", "cat": "DOCUMENTAÇÃO E SEGURANÇA", "nome": "EPI DO CONDUTOR", "crit": "alta", "prazo": 24, "bloqueia": false, "ap": ["COMBOIO", "ESPARG"], "dica": "Condutor com crachá e EPI; no espargidor, roupa de proteção para asfalto quente.", "ex": "Sem roupa de proteção para o asfalto quente"},
    {"id": "mitig", "cat": "DOCUMENTAÇÃO E SEGURANÇA", "nome": "KIT DE MITIGAÇÃO AMBIENTAL", "crit": "alta", "prazo": 48, "bloqueia": false, "ap": ["ESPARG"], "dica": "Serragem, mantas absorventes e pá a bordo.", "ex": "Acabaram as mantas absorventes"},
    {"id": "chaves", "cat": "DOCUMENTAÇÃO E SEGURANÇA", "nome": "CHAVES DO VEÍCULO", "crit": "baixa", "prazo": 24, "bloqueia": false, "ap": ["COMBOIO"], "dica": "Chave principal e reserva no lugar.", "ex": "Chave reserva sumiu"},
    {"id": "rops", "cat": "DOCUMENTAÇÃO E SEGURANÇA", "nome": "ESTRUTURA DE PROTEÇÃO (ROPS/FOPS)", "crit": "alta", "prazo": 48, "bloqueia": false, "ap": ["MINI", "ROLO"], "dica": "Sem trincas ou amassados; parafusos firmes.", "ex": "Trinca na solda do pé esquerdo", "sugerido": true},
    {"id": "emerg", "cat": "DOCUMENTAÇÃO E SEGURANÇA", "nome": "PARADA DE EMERGÊNCIA", "crit": "critica", "prazo": 24, "bloqueia": true, "ap": ["VIBRO", "EQUIP"], "dica": "Testar os botões: na vibroacabadora, os dois lados da mesa e o posto do operador.", "ex": "Botão do lado direito da mesa não desliga", "sugerido": true},
    {"id": "protmov", "cat": "DOCUMENTAÇÃO E SEGURANÇA", "nome": "PROTEÇÕES DAS PARTES MÓVEIS", "crit": "critica", "prazo": 24, "bloqueia": true, "ap": ["EQUIP"], "dica": "Carenagens e proteções no lugar e fixas.", "ex": "Proteção da correia solta", "sugerido": true},
    {"id": "oleo", "cat": "MOTOR E FLUIDOS", "nome": "ÓLEO DO MOTOR", "crit": "alta", "prazo": 24, "bloqueia": false, "ap": ["CAMINHAO", "CAVALO", "PIPA", "COMBOIO", "ESPARG", "LEVE", "KOMBI", "RETRO", "ESCAV", "MINI", "CARREG", "MOTO", "ROLO", "VIBRO", "EQUIP"], "dica": "Nível na vareta entre o mínimo e o máximo; sem marcas de vazamento.", "ex": "Nível abaixo do mínimo"},
    {"id": "agua", "cat": "MOTOR E FLUIDOS", "nome": "LÍQUIDO DE ARREFECIMENTO", "crit": "alta", "prazo": 24, "bloqueia": false, "ap": ["CAMINHAO", "CAVALO", "PIPA", "COMBOIO", "ESPARG", "LEVE", "KOMBI", "RETRO", "ESCAV", "MINI", "CARREG", "MOTO", "ROLO", "VIBRO", "EQUIP"], "dica": "Nível no reservatório de expansão, com o motor frio. Na Kombi, só no motor 1.4 Flex.", "ex": "Reservatório vazio"},
    {"id": "hidr", "cat": "MOTOR E FLUIDOS", "nome": "ÓLEO HIDRÁULICO", "crit": "alta", "prazo": 24, "bloqueia": false, "ap": ["CAMINHAO", "COMBOIO", "RETRO", "ESCAV", "MINI", "CARREG", "MOTO", "ROLO", "VIBRO"], "dica": "Nível no visor, com os cilindros recolhidos; sem vazamento. No caminhão, inclui a direção hidráulica.", "ex": "Nível abaixo do visor"},
    {"id": "transm", "cat": "MOTOR E FLUIDOS", "nome": "ÓLEO DA TRANSMISSÃO", "crit": "alta", "prazo": 48, "bloqueia": false, "ap": ["MOTO"], "dica": "Nível correto e sem vazamento.", "ex": "Vazamento na tampa lateral"},
    {"id": "corr", "cat": "MOTOR E FLUIDOS", "nome": "CORREIAS DO MOTOR", "crit": "media", "prazo": 72, "bloqueia": false, "ap": ["CAVALO", "KOMBI", "ESCAV"], "dica": "Tensão correta e sem desgaste, trincas ou ruído.", "ex": "Correia do alternador trincada"},
    {"id": "vaz", "cat": "MOTOR E FLUIDOS", "nome": "VAZAMENTOS", "crit": "alta", "prazo": 48, "bloqueia": false, "ap": ["CAMINHAO", "CAVALO", "PIPA", "COMBOIO", "ESPARG", "LEVE", "KOMBI", "RETRO", "ESCAV", "MINI", "CARREG", "MOTO", "ROLO", "VIBRO", "EQUIP"], "dica": "Chão sob o veículo limpo: sem poças de óleo, combustível, água ou fluido hidráulico.", "ex": "Mancha de óleo embaixo do motor"},
    {"id": "comb", "cat": "MOTOR E FLUIDOS", "nome": "COMBUSTÍVEL", "crit": "baixa", "prazo": 24, "bloqueia": false, "ap": ["RETRO", "ESCAV", "MINI", "CARREG", "MOTO", "ROLO", "VIBRO", "EQUIP"], "dica": "Suficiente para o turno de trabalho.", "ex": "Menos de 1/4 de tanque"},
    {"id": "filtro", "cat": "MOTOR E FLUIDOS", "nome": "FILTRO DE AR E SEPARADOR DE ÁGUA", "crit": "media", "prazo": 48, "bloqueia": false, "ap": ["MINI", "MOTO"], "dica": "Válvula de poeira limpa e água drenada do separador de combustível.", "ex": "Separador cheio de água"},
    {"id": "radiad", "cat": "MOTOR E FLUIDOS", "nome": "RADIADOR", "crit": "media", "prazo": 72, "bloqueia": false, "ap": ["ESCAV"], "dica": "Colmeias limpas, sem obstrução.", "ex": "Colmeia suja de barro"},
    {"id": "limpmot", "cat": "MOTOR E FLUIDOS", "nome": "COMPARTIMENTO DO MOTOR", "crit": "alta", "prazo": 24, "bloqueia": false, "ap": ["ESCAV"], "dica": "Sem acúmulo de sujeira, folhas ou óleo: risco de incêndio.", "ex": "Muito óleo acumulado no bloco"},
    {"id": "bat", "cat": "MOTOR E FLUIDOS", "nome": "BATERIA", "crit": "alta", "prazo": 48, "bloqueia": false, "ap": ["COMBOIO"], "dica": "Sem vazamento, terminais limpos e suporte com proteção fixa.", "ex": "Terminal oxidado, falha na partida"},
    {"id": "chic", "cat": "MOTOR E FLUIDOS", "nome": "CHICOTE ELÉTRICO E FIAÇÃO", "crit": "alta", "prazo": 48, "bloqueia": false, "ap": ["COMBOIO", "ESCAV", "VIBRO"], "dica": "Sem fios expostos, soltos ou danificados.", "ex": "Fio descascado perto da bateria"},
    {"id": "freio", "cat": "FREIOS E DIREÇÃO", "nome": "FREIO DE SERVIÇO", "crit": "critica", "prazo": 24, "bloqueia": true, "ap": ["CAMINHAO", "CAVALO", "PIPA", "COMBOIO", "ESPARG", "LEVE", "KOMBI", "RETRO", "ESCAV", "MINI", "CARREG", "MOTO", "ROLO", "VIBRO", "EQUIP"], "dica": "Teste do pedal antes de movimentar: resposta firme, sem ir ao fundo.", "ex": "Pedal baixo, freio fraco"},
    {"id": "freioe", "cat": "FREIOS E DIREÇÃO", "nome": "FREIO DE ESTACIONAMENTO", "crit": "critica", "prazo": 24, "bloqueia": true, "ap": ["CAMINHAO", "CAVALO", "PIPA", "COMBOIO", "ESPARG", "LEVE", "KOMBI", "RETRO", "ESCAV", "MINI", "CARREG", "MOTO", "ROLO", "VIBRO", "EQUIP"], "dica": "Teste de retenção com o veículo parado (maneco ou catraca).", "ex": "Freio de mão não segura na rampa"},
    {"id": "fluf", "cat": "FREIOS E DIREÇÃO", "nome": "FLUIDO DE FREIO", "crit": "critica", "prazo": 24, "bloqueia": true, "ap": ["CAMINHAO", "CAVALO", "COMBOIO", "LEVE", "KOMBI"], "dica": "Nível no reservatório e sem vazamento. No cavalo, inclui o fluido da embreagem.", "ex": "Reservatório abaixo do mínimo"},
    {"id": "press", "cat": "FREIOS E DIREÇÃO", "nome": "PRESSÃO DO SISTEMA DE AR", "crit": "critica", "prazo": 24, "bloqueia": true, "ap": ["CAMINHAO", "CAVALO"], "dica": "Manômetros sobem normalmente e seguram a pressão.", "ex": "Manômetro demora muito para subir"},
    {"id": "dren", "cat": "FREIOS E DIREÇÃO", "nome": "DRENAGEM DO RESERVATÓRIO DE AR", "crit": "media", "prazo": 24, "bloqueia": false, "ap": ["CAMINHAO", "CAVALO", "COMBOIO"], "dica": "Eliminar a água acumulada nos reservatórios de ar.", "ex": "Saiu muita água do reservatório"},
    {"id": "dir", "cat": "FREIOS E DIREÇÃO", "nome": "CAIXA DE DIREÇÃO", "crit": "critica", "prazo": 24, "bloqueia": true, "ap": ["PIPA", "COMBOIO", "KOMBI", "CAMINHAO", "CAVALO", "ESPARG", "RETRO", "MOTO", "CARREG"], "dica": "Sem folga excessiva ou ruído ao esterçar o volante.", "ex": "Folga grande no volante"},
    {"id": "alinh", "cat": "FREIOS E DIREÇÃO", "nome": "ALINHAMENTO", "crit": "media", "prazo": 168, "bloqueia": false, "ap": ["LEVE", "COMBOIO"], "dica": "O volante não puxa para um dos lados.", "ex": "Puxa para a direita"},
    {"id": "difer", "cat": "FREIOS E DIREÇÃO", "nome": "BLOQUEIO DO DIFERENCIAL", "crit": "alta", "prazo": 72, "bloqueia": false, "ap": ["MOTO"], "dica": "Aciona e desaciona normalmente.", "ex": "Bloqueio não desarma"},
    {"id": "giro", "cat": "FREIOS E DIREÇÃO", "nome": "FREIO E TRAVA DE GIRO", "crit": "alta", "prazo": 48, "bloqueia": false, "ap": ["ESCAV"], "dica": "Giro da superestrutura trava e freia.", "ex": "Freio de giro não segura na rampa", "sugerido": true},
    {"id": "cmd", "cat": "FREIOS E DIREÇÃO", "nome": "COMANDOS E ALAVANCAS", "crit": "critica", "prazo": 24, "bloqueia": true, "ap": ["ESCAV", "RETRO", "ROLO", "MINI", "CARREG"], "dica": "Respondem com suavidade: joysticks, alavancas, direção e vibração.", "ex": "Alavanca da lança travando"},
    {"id": "trvcmd", "cat": "FREIOS E DIREÇÃO", "nome": "TRAVA DE SEGURANÇA DOS COMANDOS", "crit": "critica", "prazo": 24, "bloqueia": true, "ap": ["ESCAV", "MINI"], "dica": "Com a alavanca de bloqueio levantada ou a barra do operador erguida, os comandos não respondem.", "ex": "Comandos mexem com a trava levantada"},
    {"id": "artic", "cat": "FREIOS E DIREÇÃO", "nome": "ARTICULAÇÃO CENTRAL", "crit": "critica", "prazo": 24, "bloqueia": true, "ap": ["MOTO", "CARREG"], "dica": "Sem folga ao articular; trava de articulação no lugar.", "ex": "Folga ao articular, batida seca", "sugerido": true},
    {"id": "pneu", "cat": "RODAGEM", "nome": "PNEUS", "crit": "alta", "prazo": 24, "bloqueia": false, "ap": ["CAMINHAO", "CAVALO", "PIPA", "COMBOIO", "ESPARG", "LEVE", "KOMBI", "REBOQUE", "RETRO", "MINI", "CARREG", "MOTO", "ROLO", "VIBRO"], "dica": "Pressão e estado, inclusive o estepe: sem cortes, bolhas, sulco careca ou objetos encravados.", "ex": "Pneu traseiro esquerdo externo murcho"},
    {"id": "roda", "cat": "RODAGEM", "nome": "RODAS, AROS E PORCAS", "crit": "critica", "prazo": 24, "bloqueia": true, "ap": ["CAMINHAO", "CAVALO", "PIPA", "COMBOIO", "ESPARG", "REBOQUE", "MOTO", "CARREG"], "dica": "Porcas firmes, sem falta nem marca de ferrugem escorrendo; aros sem trincas.", "ex": "Falta uma porca na roda dianteira direita"},
    {"id": "estepe", "cat": "RODAGEM", "nome": "ESTEPE", "crit": "media", "prazo": 168, "bloqueia": false, "ap": ["PIPA"], "dica": "Calibrado, fixado e pronto para uso.", "ex": "Estepe murcho"},
    {"id": "susp", "cat": "RODAGEM", "nome": "SUSPENSÃO", "crit": "alta", "prazo": 48, "bloqueia": false, "ap": ["CAVALO", "CAMINHAO"], "dica": "Feixes de mola sem lâminas quebradas; sem ruídos.", "ex": "Lâmina quebrada no feixe traseiro direito"},
    {"id": "esteir", "cat": "RODAGEM", "nome": "ESTEIRAS", "crit": "alta", "prazo": 72, "bloqueia": false, "ap": ["ESCAV", "VIBRO", "MINI"], "dica": "Tensão correta, sem sapatas ou parafusos soltos; roletes e rodas-guia limpos.", "ex": "Esteira direita frouxa"},
    {"id": "transl", "cat": "RODAGEM", "nome": "MOTORES DE TRANSLAÇÃO", "crit": "alta", "prazo": 48, "bloqueia": false, "ap": ["ESCAV"], "dica": "Sem vazamentos.", "ex": "Vazamento no motor da esteira esquerda"},
    {"id": "farol", "cat": "ILUMINAÇÃO E SINALIZAÇÃO", "nome": "FARÓIS", "crit": "alta", "prazo": 24, "bloqueia": false, "ap": ["CAMINHAO", "CAVALO", "PIPA", "COMBOIO", "ESPARG", "LEVE", "KOMBI", "RETRO", "ESCAV", "MINI", "CARREG", "MOTO", "ROLO", "VIBRO", "EQUIP"], "dica": "Luz alta e baixa; nas máquinas, as luzes de trabalho.", "ex": "Farol baixo direito apagado"},
    {"id": "lant", "cat": "ILUMINAÇÃO E SINALIZAÇÃO", "nome": "LANTERNAS, SETAS E LUZ DE FREIO", "crit": "alta", "prazo": 24, "bloqueia": false, "ap": ["CAMINHAO", "CAVALO", "PIPA", "COMBOIO", "ESPARG", "LEVE", "KOMBI", "REBOQUE"], "dica": "Posição, setas dos dois lados, pisca-alerta, freio e ré.", "ex": "Seta traseira esquerda não funciona"},
    {"id": "re", "cat": "ILUMINAÇÃO E SINALIZAÇÃO", "nome": "ALARME SONORO DE RÉ", "crit": "alta", "prazo": 24, "bloqueia": false, "ap": ["CAMINHAO", "CAVALO", "PIPA", "COMBOIO", "ESPARG", "RETRO", "ESCAV", "MINI", "CARREG", "MOTO", "ROLO", "VIBRO"], "dica": "Toca ao engatar a ré.", "ex": "Alarme de ré mudo"},
    {"id": "buz", "cat": "ILUMINAÇÃO E SINALIZAÇÃO", "nome": "BUZINA", "crit": "alta", "prazo": 24, "bloqueia": false, "ap": ["CAMINHAO", "CAVALO", "PIPA", "COMBOIO", "ESPARG", "LEVE", "KOMBI", "RETRO", "ESCAV", "MINI", "CARREG", "MOTO", "ROLO", "VIBRO", "EQUIP"], "dica": "Funciona.", "ex": "Buzina não funciona"},
    {"id": "giroflx", "cat": "ILUMINAÇÃO E SINALIZAÇÃO", "nome": "GIROFLEX", "crit": "alta", "prazo": 24, "bloqueia": false, "ap": ["ESPARG", "MOTO", "VIBRO"], "dica": "Luz de advertência funcionando.", "ex": "Giroflex apagado"},
    {"id": "painel", "cat": "ILUMINAÇÃO E SINALIZAÇÃO", "nome": "PAINEL DE INSTRUMENTOS", "crit": "alta", "prazo": 24, "bloqueia": false, "ap": ["PIPA", "COMBOIO", "LEVE", "RETRO", "ROLO", "VIBRO", "MINI", "CAMINHAO", "ESCAV", "MOTO"], "dica": "Sem luz de alerta acesa; velocímetro, odômetro ou horímetro, temperatura e combustível funcionando.", "ex": "Luz do motor acesa"},
    {"id": "refl", "cat": "ILUMINAÇÃO E SINALIZAÇÃO", "nome": "FAIXAS REFLETIVAS E PLACAS", "crit": "media", "prazo": 168, "bloqueia": false, "ap": ["COMBOIO", "REBOQUE"], "dica": "Faixas inteiras e placas dianteira e traseira legíveis.", "ex": "Faixa da lateral direita solta"},
    {"id": "vidros", "cat": "CABINE E ESTRUTURA", "nome": "PARA-BRISA, VIDROS E RETROVISORES", "crit": "alta", "prazo": 48, "bloqueia": false, "ap": ["CAMINHAO", "CAVALO", "PIPA", "COMBOIO", "ESPARG", "LEVE", "KOMBI", "RETRO", "ESCAV", "MINI", "CARREG", "MOTO", "ROLO", "VIBRO", "EQUIP"], "dica": "Limpos, sem trincas no campo de visão; espelhos inteiros e ajustados.", "ex": "Trinca no para-brisa, lado do motorista"},
    {"id": "limp", "cat": "CABINE E ESTRUTURA", "nome": "LIMPADOR DE PARA-BRISA", "crit": "media", "prazo": 72, "bloqueia": false, "ap": ["PIPA", "LEVE", "KOMBI", "COMBOIO"], "dica": "Palhetas em bom estado e esguicho com água.", "ex": "Palheta do motorista rasgada"},
    {"id": "portas", "cat": "CABINE E ESTRUTURA", "nome": "PORTAS E FECHADURAS", "crit": "alta", "prazo": 48, "bloqueia": false, "ap": ["KOMBI", "COMBOIO"], "dica": "Dobradiças, trincos e fechaduras; na Kombi, trilho e trava da porta de correr.", "ex": "Porta de correr não trava"},
    {"id": "bancos", "cat": "CABINE E ESTRUTURA", "nome": "BANCOS", "crit": "baixa", "prazo": 360, "bloqueia": false, "ap": ["KOMBI", "COMBOIO"], "dica": "Fixos, com estofamento inteiro.", "ex": "Banco do carona solto"},
    {"id": "tampao", "cat": "CABINE E ESTRUTURA", "nome": "TAMPÃO DO MOTOR", "crit": "media", "prazo": 72, "bloqueia": false, "ap": ["KOMBI"], "dica": "Fecha e trava.", "ex": "Tampão não trava"},
    {"id": "acesso", "cat": "CABINE E ESTRUTURA", "nome": "ACESSO À CABINE", "crit": "alta", "prazo": 48, "bloqueia": false, "ap": ["COMBOIO", "VIBRO", "ROLO"], "dica": "Estribo, alças de apoio, escada e piso antiderrapante firmes; na máquina, plataforma e corrimãos.", "ex": "Estribo do lado do motorista solto"},
    {"id": "parach", "cat": "CABINE E ESTRUTURA", "nome": "PARA-CHOQUES E PARA-BARRO", "crit": "media", "prazo": 168, "bloqueia": false, "ap": ["COMBOIO", "REBOQUE"], "dica": "No lugar e fixos.", "ex": "Para-barro traseiro esquerdo rasgado"},
    {"id": "acab", "cat": "CABINE E ESTRUTURA", "nome": "ACABAMENTO DA CABINE", "crit": "baixa", "prazo": 360, "bloqueia": false, "ap": ["COMBOIO"], "dica": "Quebra-sol, porta-luvas, forro e manopla inteiros; lataria sem avaria nova.", "ex": "Quebra-sol do motorista caído"},
    {"id": "escap", "cat": "CABINE E ESTRUTURA", "nome": "CANO DE DESCARGA", "crit": "media", "prazo": 72, "bloqueia": false, "ap": ["COMBOIO"], "dica": "Silencioso fixo, sem furos.", "ex": "Escapamento furado, barulho alto"},
    {"id": "pto", "cat": "IMPLEMENTO", "nome": "TOMADA DE FORÇA (PTO)", "crit": "alta", "prazo": 48, "bloqueia": false, "ap": ["CAMINHAO"], "dica": "Engata e os comandos de basculamento respondem.", "ex": "PTO não engata", "flag": "basc"},
    {"id": "cil", "cat": "IMPLEMENTO", "nome": "CILINDRO DE BASCULAMENTO", "crit": "alta", "prazo": 48, "bloqueia": false, "ap": ["CAMINHAO"], "dica": "Sem vazamento, riscos ou amassados.", "ex": "Cilindro vazando óleo", "flag": "basc"},
    {"id": "cac", "cat": "IMPLEMENTO", "nome": "TRAVA DE SEGURANÇA DA CAÇAMBA", "crit": "critica", "prazo": 24, "bloqueia": true, "ap": ["CAMINHAO"], "dica": "Pino de segurança no lugar.", "ex": "Pino de segurança da caçamba sumiu", "flag": "basc"},
    {"id": "lona", "cat": "IMPLEMENTO", "nome": "LONA DE COBERTURA", "crit": "media", "prazo": 72, "bloqueia": false, "ap": ["CAMINHAO"], "dica": "Cobre toda a carga, sem rasgos.", "ex": "Lona rasgada no meio", "sugerido": true, "flag": "basc"},
    {"id": "qroda", "cat": "IMPLEMENTO", "nome": "QUINTA RODA", "crit": "critica", "prazo": 24, "bloqueia": true, "ap": ["CAVALO"], "dica": "Pino-rei travado e lubrificação em dia.", "ex": "Pino-rei com folga"},
    {"id": "qtrava", "cat": "IMPLEMENTO", "nome": "TRAVA DE SEGURANÇA DA QUINTA RODA", "crit": "critica", "prazo": 24, "bloqueia": true, "ap": ["CAVALO"], "dica": "Copa ou cupilha de segurança no lugar.", "ex": "Cupilha de segurança faltando"},
    {"id": "acopl", "cat": "IMPLEMENTO", "nome": "MANGUEIRAS E CABO DO ACOPLAMENTO", "crit": "alta", "prazo": 24, "bloqueia": false, "ap": ["CAVALO"], "dica": "Conexões pneumáticas (mão de amigo) e cabo elétrico espiral inteiros.", "ex": "Cabo espiral com fio exposto"},
    {"id": "tqagua", "cat": "IMPLEMENTO", "nome": "TANQUE DE ÁGUA", "crit": "alta", "prazo": 72, "bloqueia": false, "ap": ["PIPA"], "dica": "Sem trincas, vazamentos ou deformações.", "ex": "Vazamento no fundo do tanque"},
    {"id": "bomba", "cat": "IMPLEMENTO", "nome": "MOTOBOMBA", "crit": "alta", "prazo": 48, "bloqueia": false, "ap": ["PIPA"], "dica": "Motor auxiliar funcionando, sem vazamento de combustível ou óleo.", "ex": "Motobomba não pega"},
    {"id": "mang", "cat": "IMPLEMENTO", "nome": "MANGUEIRAS E MANGOTES", "crit": "media", "prazo": 72, "bloqueia": false, "ap": ["PIPA", "ESPARG"], "dica": "Sem furos ou rachaduras; conexões e abraçadeiras firmes.", "ex": "Mangote traseiro rachado"},
    {"id": "valv", "cat": "IMPLEMENTO", "nome": "REGISTROS E VÁLVULAS", "crit": "media", "prazo": 72, "bloqueia": false, "ap": ["PIPA", "ESPARG"], "dica": "Abrem e fecham livres, sem vazamento.", "ex": "Registro lateral emperrado"},
    {"id": "barra", "cat": "IMPLEMENTO", "nome": "BARRA DE IRRIGAÇÃO", "crit": "media", "prazo": 72, "bloqueia": false, "ap": ["PIPA"], "dica": "Rabo de pavão alinhado, com todos os bicos abrindo.", "ex": "Dois bicos da esquerda entupidos"},
    {"id": "ligante", "cat": "IMPLEMENTO", "nome": "TANQUE DE LIGANTE", "crit": "media", "prazo": 24, "bloqueia": false, "ap": ["ESPARG"], "dica": "Nível de emulsão ou CAP para o serviço.", "ex": "Pouca emulsão para o serviço"},
    {"id": "bicos", "cat": "IMPLEMENTO", "nome": "BARRA ESPARGIDORA", "crit": "media", "prazo": 48, "bloqueia": false, "ap": ["ESPARG"], "dica": "Bocais e bicos limpos e sem obstrução.", "ex": "Três bicos entupidos no centro"},
    {"id": "queim", "cat": "IMPLEMENTO", "nome": "QUEIMADOR", "crit": "critica", "prazo": 24, "bloqueia": true, "ap": ["ESPARG"], "dica": "Sistema de aquecimento íntegro na inspeção visual, antes de acender.", "ex": "Mangueira do queimador ressecada"},
    {"id": "termo", "cat": "IMPLEMENTO", "nome": "TERMÔMETRO DO TANQUE", "crit": "media", "prazo": 48, "bloqueia": false, "ap": ["ESPARG"], "dica": "Marcando a temperatura do ligante.", "ex": "Termômetro não marca", "sugerido": true},
    {"id": "tqcomb", "cat": "IMPLEMENTO", "nome": "TANQUE DE COMBUSTÍVEL", "crit": "critica", "prazo": 24, "bloqueia": true, "ap": ["COMBOIO"], "dica": "Sem vazamento; tampas, respiros e lacres no lugar.", "ex": "Lacre do tanque rompido", "sugerido": true},
    {"id": "babast", "cat": "IMPLEMENTO", "nome": "BOMBAS DE ABASTECIMENTO", "crit": "alta", "prazo": 48, "bloqueia": false, "ap": ["COMBOIO"], "dica": "Bombas e mangueiras de S10 e S500 funcionando, sem vazamento.", "ex": "Bomba do S10 vazando na saída"},
    {"id": "blubr", "cat": "IMPLEMENTO", "nome": "BOMBAS DE LUBRIFICAÇÃO E HIDROJATO", "crit": "media", "prazo": 72, "bloqueia": false, "ap": ["COMBOIO"], "dica": "Bomba de graxa, de óleo hidráulico e hidrojato funcionando.", "ex": "Bomba de graxa sem pressão"},
    {"id": "pistola", "cat": "IMPLEMENTO", "nome": "TRAVA DA PISTOLA DE ABASTECIMENTO", "crit": "critica", "prazo": 24, "bloqueia": true, "ap": ["COMBOIO"], "dica": "Trava de segurança funcionando.", "ex": "Trava da pistola não solta"},
    {"id": "teclado", "cat": "IMPLEMENTO", "nome": "TECLADO DE ABASTECIMENTO", "crit": "alta", "prazo": 72, "bloqueia": false, "ap": ["COMBOIO"], "dica": "Registra o abastecimento.", "ex": "Teclado não registra o abastecimento"},
    {"id": "manghid", "cat": "IMPLEMENTO", "nome": "MANGUEIRAS E CONEXÕES HIDRÁULICAS", "crit": "alta", "prazo": 48, "bloqueia": false, "ap": ["ESCAV", "MINI", "MOTO"], "dica": "Sem vazamento, umidade ou mangueira ressecada; inclui articulação e giro.", "ex": "Mangueira da lança suando óleo"},
    {"id": "pinos", "cat": "IMPLEMENTO", "nome": "PINOS, BUCHAS E ARTICULAÇÕES", "crit": "media", "prazo": 48, "bloqueia": false, "ap": ["ESCAV", "RETRO", "ROLO", "VIBRO", "CARREG"], "dica": "Lubrificados, sem folga.", "ex": "Pino da caçamba seco, com folga"},
    {"id": "cacamb", "cat": "IMPLEMENTO", "nome": "CAÇAMBA, DENTES E LÂMINAS", "crit": "media", "prazo": 72, "bloqueia": false, "ap": ["ESCAV", "RETRO", "MINI", "CARREG"], "dica": "Sem desgaste excessivo, trincas ou dentes faltando.", "ex": "Falta um dente na caçamba"},
    {"id": "engate", "cat": "IMPLEMENTO", "nome": "ENGATE RÁPIDO", "crit": "critica", "prazo": 24, "bloqueia": true, "ap": ["ESCAV", "MINI"], "dica": "Pino de trava inserido e implemento firme.", "ex": "Pino do engate rápido não trava"},
    {"id": "patola", "cat": "IMPLEMENTO", "nome": "PATOLAS (ESTABILIZADORES)", "crit": "critica", "prazo": 24, "bloqueia": true, "ap": ["RETRO"], "dica": "Descem, travam e não cedem.", "ex": "Patola direita cede sozinha", "sugerido": true},
    {"id": "trvlan", "cat": "IMPLEMENTO", "nome": "TRAVA DE TRANSPORTE DA LANÇA", "crit": "critica", "prazo": 24, "bloqueia": true, "ap": ["RETRO"], "dica": "Lança travada para o deslocamento.", "ex": "Trava da lança não encaixa", "sugerido": true},
    {"id": "lamina", "cat": "IMPLEMENTO", "nome": "LÂMINA", "crit": "media", "prazo": 168, "bloqueia": false, "ap": ["MOTO"], "dica": "Bordas sem desgaste excessivo.", "ex": "Borda da lâmina gasta"},
    {"id": "circ", "cat": "IMPLEMENTO", "nome": "CÍRCULO E SAPATAS", "crit": "media", "prazo": 168, "bloqueia": false, "ap": ["MOTO"], "dica": "Sem folgas excessivas.", "ex": "Folga no círculo"},
    {"id": "coroa", "cat": "IMPLEMENTO", "nome": "COROA E PINHÃO", "crit": "media", "prazo": 72, "bloqueia": false, "ap": ["MOTO"], "dica": "Lubrificação em dia.", "ex": "Coroa seca, sem graxa"},
    {"id": "ripper", "cat": "IMPLEMENTO", "nome": "ESCARIFICADOR (RIPPER)", "crit": "media", "prazo": 168, "bloqueia": false, "ap": ["MOTO"], "dica": "Dentes sem desgaste excessivo nem faltando.", "ex": "Dente do ripper quebrado"},
    {"id": "tambor", "cat": "IMPLEMENTO", "nome": "CILINDROS E TAMBORES", "crit": "alta", "prazo": 72, "bloqueia": false, "ap": ["ROLO"], "dica": "Sem trincas ou desgaste.", "ex": "Trinca no tambor dianteiro"},
    {"id": "rasp", "cat": "IMPLEMENTO", "nome": "BARRAS RASPADORAS", "crit": "media", "prazo": 72, "bloqueia": false, "ap": ["ROLO"], "dica": "Ajustadas e sem desgaste.", "ex": "Raspador traseiro gasto"},
    {"id": "asper", "cat": "IMPLEMENTO", "nome": "SISTEMA DE ASPERSÃO DE ÁGUA", "crit": "media", "prazo": 24, "bloqueia": false, "ap": ["ROLO"], "dica": "Bicos abrindo e tanque com água, nos rolos de asfalto.", "ex": "Bicos da frente sem água", "flag": "aspersao"},
    {"id": "hopper", "cat": "IMPLEMENTO", "nome": "HOPPER (TREMONHA)", "crit": "media", "prazo": 48, "bloqueia": false, "ap": ["VIBRO"], "dica": "Limpo e sem deformação.", "ex": "Hopper amassado do lado esquerdo"},
    {"id": "transp", "cat": "IMPLEMENTO", "nome": "TRANSPORTADORES DE MATERIAL", "crit": "alta", "prazo": 48, "bloqueia": false, "ap": ["VIBRO"], "dica": "Correntes sem desgaste excessivo.", "ex": "Corrente da esquerda frouxa"},
    {"id": "rosca", "cat": "IMPLEMENTO", "nome": "ROSCAS SEM-FIM", "crit": "alta", "prazo": 48, "bloqueia": false, "ap": ["VIBRO"], "dica": "Espirais sem desgaste excessivo.", "ex": "Espiral direita gasta"},
    {"id": "mesa", "cat": "IMPLEMENTO", "nome": "MESA", "crit": "alta", "prazo": 24, "bloqueia": false, "ap": ["VIBRO"], "dica": "Aquecimento liga no início; controles de altura, inclinação e vibração respondem.", "ex": "Mesa não aquece do lado direito"},
    {"id": "gas", "cat": "IMPLEMENTO", "nome": "GÁS DO AQUECIMENTO", "crit": "critica", "prazo": 24, "bloqueia": true, "ap": ["VIBRO"], "dica": "Botijões, mangueiras e válvulas sem cheiro de gás nem vazamento (mesas a gás).", "ex": "Cheiro de gás perto da válvula", "sugerido": true},
    {"id": "sensor", "cat": "IMPLEMENTO", "nome": "SENSORES DE NIVELAMENTO", "crit": "media", "prazo": 48, "bloqueia": false, "ap": ["VIBRO"], "dica": "Limpos e com leitura, se houver.", "ex": "Sensor esquerdo sem leitura"},
    {"id": "engreb", "cat": "IMPLEMENTO", "nome": "ENGATE DO REBOQUE", "crit": "critica", "prazo": 24, "bloqueia": true, "ap": ["REBOQUE"], "dica": "Engate, pino-rei e trava firmes.", "ex": "Trava do engate com folga", "sugerido": true},
    {"id": "freior", "cat": "IMPLEMENTO", "nome": "FREIOS E MANGUEIRAS DE AR DO REBOQUE", "crit": "critica", "prazo": 24, "bloqueia": true, "ap": ["REBOQUE"], "dica": "Conexões firmes e freio respondendo.", "ex": "Mangueira de ar vazando", "sugerido": true},
    {"id": "amarr", "cat": "IMPLEMENTO", "nome": "AMARRAÇÃO DA CARGA", "crit": "alta", "prazo": 24, "bloqueia": false, "ap": ["REBOQUE"], "dica": "Pontos de amarração, correntes e catracas inteiros.", "ex": "Catraca quebrada", "sugerido": true},
    {"id": "ramp", "cat": "IMPLEMENTO", "nome": "RAMPAS E TRAVAS DA PRANCHA", "crit": "alta", "prazo": 48, "bloqueia": false, "ap": ["REBOQUE"], "dica": "Rampas inteiras e travas funcionando.", "ex": "Trava da rampa esquerda não segura", "sugerido": true, "flag": "prancha"},
    {"id": "kit", "cat": "KIT DE EMERGÊNCIA E FERRAMENTAS", "nome": "KIT OBRIGATÓRIO", "crit": "media", "prazo": 168, "bloqueia": false, "ap": ["LEVE", "KOMBI", "COMBOIO"], "dica": "Estepe, macaco, triângulo e chave de roda a bordo.", "ex": "Sem triângulo"},
    {"id": "ferr", "cat": "KIT DE EMERGÊNCIA E FERRAMENTAS", "nome": "BOLSA DE FERRAMENTAS", "crit": "baixa", "prazo": 360, "bloqueia": false, "ap": ["COMBOIO"], "dica": "Chaves inglesa, Philips e fenda, alicate, cabo e jogo de chaves completo.", "ex": "Falta a chave inglesa"},
    {"id": "kitcont", "cat": "KIT DE EMERGÊNCIA E FERRAMENTAS", "nome": "KIT DE EMERGÊNCIA · CONTENÇÃO", "crit": "alta", "prazo": 48, "bloqueia": false, "ap": ["COMBOIO"], "dica": "Batoques e calços de madeira, cabo terra de 5 m, 4 cones e 4 cavaletes de aviso.", "ex": "Só tem 2 cones"},
    {"id": "kitepi", "cat": "KIT DE EMERGÊNCIA E FERRAMENTAS", "nome": "KIT DE EMERGÊNCIA · EPI", "crit": "alta", "prazo": 48, "bloqueia": false, "ap": ["COMBOIO"], "dica": "Óculos de ampla visão, capacete, enxada e pá antifaiscantes, lanterna à prova de explosão, martelo de madeira e balde.", "ex": "Lanterna não acende"},
    {"id": "socorr", "cat": "KIT DE EMERGÊNCIA E FERRAMENTAS", "nome": "KIT DE PRIMEIROS SOCORROS", "crit": "alta", "prazo": 48, "bloqueia": false, "ap": ["COMBOIO"], "dica": "Completo e dentro da validade.", "ex": "Kit vencido"}
  ];
  (function(){ var ord = []; ITENS.forEach(function(i){ if (ord.indexOf(i.cat) < 0) ord.push(i.cat); });
    ITENS.forEach(function(i, k){ i._k = k; });
    ITENS.sort(function(a, b){ return ord.indexOf(a.cat) - ord.indexOf(b.cat) || a._k - b._k; }); })();
  /* Itens exclusivos de inspeção da equipe (ap:[] = nunca entram no checklist diário do motorista) */
  var ITENS_INSP = [
    { id:'i-torque', cat:'RODAGEM',          nome:'TORQUE DAS PORCAS DE RODA',           dica:'Conferir com torquímetro.',                              ex:'Duas porcas abaixo do torque na roda traseira direita', crit:'critica', prazo:24,  bloqueia:true,  ap:[], insp:true },
    { id:'i-rolam',  cat:'RODAGEM',          nome:'ROLAMENTOS E CUBOS DE RODA',          dica:'Folga e ruído ao girar a roda.',                        ex:'Folga no cubo dianteiro esquerdo',      crit:'alta',    prazo:72,  bloqueia:false, ap:[], insp:true },
    { id:'i-ar',     cat:'FREIOS E DIREÇÃO', nome:'ESTANQUEIDADE DO SISTEMA DE AR',      dica:'Teste de queda de pressão com o motor desligado.',     ex:'Perde 1 bar em 5 minutos',               crit:'critica', prazo:48,  bloqueia:true,  ap:[], insp:true },
    { id:'i-lonas',  cat:'FREIOS E DIREÇÃO', nome:'LONAS E PASTILHAS DE FREIO',          dica:'Espessura restante.',                                    ex:'Lona traseira no limite',               crit:'alta',    prazo:72,  bloqueia:false, ap:[], insp:true },
    { id:'i-trinca', cat:'CABINE E ESTRUTURA', nome:'ESTRUTURA E CHASSI',                dica:'Trincas e soldas.',                                      ex:'Trinca na longarina perto do eixo traseiro', crit:'alta', prazo:168, bloqueia:false, ap:[], insp:true },
    { id:'i-amost',  cat:'MOTOR E FLUIDOS',  nome:'AMOSTRA DE ÓLEO',                     dica:'Coleta para análise.',                                   ex:'Amostra coletada, enviada ao laboratório', crit:'baixa', prazo:168, bloqueia:false, ap:[], insp:true },
    { id:'i-corr',   cat:'MOTOR E FLUIDOS',  nome:'CORREIAS E TENSIONADORES',            dica:'Tensão, trincas e desgaste.',                            ex:'Tensionador com ruído',                 crit:'media',   prazo:72,  bloqueia:false, ap:[], insp:true },
    { id:'i-dentes', cat:'IMPLEMENTO',       nome:'DENTES, LÂMINAS E BORDAS CORTANTES',  dica:'Desgaste e peças faltando.',                             ex:'Borda cortante no limite',              crit:'media',   prazo:168, bloqueia:false, ap:[], insp:true },
    { id:'i-esteir', cat:'RODAGEM',          nome:'ESTEIRA E ROLETES',                   dica:'Tensão e desgaste.',                                     ex:'Rolete inferior travado',               crit:'alta',    prazo:168, bloqueia:false, ap:[], insp:true },
    { id:'i-extval', cat:'DOCUMENTAÇÃO E SEGURANÇA', nome:'EXTINTOR · VALIDADE E RECARGA', dica:'Etiqueta de recarga e validade.',                     ex:'Recarga vence em 30 dias',              crit:'alta',    prazo:168, bloqueia:true,  ap:[], insp:true }
  ];
  ITENS_INSP.forEach(function(i){ ITENS.push(i); });
  var ITEM = {}; ITENS.forEach(function(i){ ITEM[i.id] = i; });
  /* itens criados pelo admin (DB.itens_extra) entram no catálogo ao carregar */
  function registrarExtras(lista){ (lista || []).forEach(function(i){ if (!ITEM[i.id]) { if (i.insp !== false) { i.ap = []; i.insp = true; } else { i.ap = (i.ap || []).slice(); } ITENS.push(i); ITEM[i.id] = i; } }); }
  /* item novo pelo cadastro Itens e SLA (Renan, 11/10/2026): do diário (com os tipos) ou só de inspeção */
  function itemCriar(d){
    var nome = String(d.nome || '').trim().toUpperCase(); if (!nome) return { ok:false, erro:'Dê um nome ao item.' };   /* itens em MAIÚSCULAS (Renan, 12/10/2026) */
    if (ITENS.some(function(i){ return ITEM[i.id] === i && i.nome.toLowerCase() === nome.toLowerCase(); })) return { ok:false, erro:'Já existe um item com esse nome.' };
    var prazo = +d.prazo; if (!(prazo > 0)) return { ok:false, erro:'Informe o prazo.' };
    var insp = !!d.insp, ap = insp ? [] : (d.ap || []).filter(function(t){ return TIPO[t]; });
    if (!insp && !ap.length) return { ok:false, erro:'Escolha ao menos um tipo de ativo.' };
    var it = { id:uid('x'), cat:String(d.cat || 'INSPEÇÃO'), nome:nome, crit:CRIT[d.crit] ? d.crit : 'media', prazo:prazo, bloqueia:!!d.bloqueia, ap:ap, insp:insp };
    if (String(d.dica || '').trim()) it.dica = String(d.dica).trim();
    if (String(d.ex || '').trim()) it.ex = String(d.ex).trim();   /* exemplo de observação (Renan, 12/10/2026) */
    var db = load(); db.itens_extra = db.itens_extra || []; db.itens_extra.push(it); save();
    registrarExtras([JSON.parse(JSON.stringify(it))]); return { ok:true, item:ITEM[it.id] };
  }

  function itemAplica(it, tipoId){
    var t = TIPO[tipoId]; if (!t) return false;
    if (it.ap === 'all') return true;
    if (typeof it.ap === 'string') return it.ap === t.grupo;
    return it.ap.indexOf(tipoId) >= 0;
  }
  function modeloDoTipo(tipoId){ return ITENS.filter(function(i){ return itemAplica(i, tipoId); }); }
  /* lista que o motorista vê: modelo do tipo menos os itens que o gestor tirou deste ativo
     (Renan, 11/10/2026: "só os itens do ativo em questão", sem N/A para o motorista) */
  function itensDoAtivo(ativoId){
    var a = typeof ativoId === 'object' ? ativoId : ativo(ativoId); if (!a) return [];
    var fora = a.itens_fora || [];
    return modeloDoTipo(a.tipo).filter(function(i){ return fora.indexOf(i.id) < 0; });
  }
  /* ── MODELOS DE CHECKLIST ("Tipos de checklist", Renan 11/10/2026) ──
     Diários: um por tipo de ativo, gerados do catálogo (Itens e SLA) — executados pelo motorista.
     Inspeções: criados pelo admin (semanal/quinzenal/mensal), executados SÓ pela equipe (admin e frota), nunca pelo motorista. */
  var FREQ = { diario:{ nome:'DIÁRIO', dias:1 }, semanal:{ nome:'SEMANAL', dias:7 }, quinzenal:{ nome:'QUINZENAL', dias:15 }, mensal:{ nome:'MENSAL', dias:30 }, livre:{ nome:'SOB DEMANDA', dias:null } };
  /* tipos de checklist da equipe (Renan, 12/10/2026): inspeção (periódica), preventivo (mecânicos na preventiva interna) e preditivo (a frota decide quando);
     preventivo e preditivo podem ser sob demanda (sem periodicidade) */
  var CATCK = { inspecao:{ nome:'INSPEÇÃO', plural:'INSPEÇÕES', quem:'admin e frota · o motorista não vê' },
                preventivo:{ nome:'PREVENTIVO', plural:'PREVENTIVOS', quem:'mecânicos, na preventiva interna' },
                preditivo:{ nome:'PREDITIVO', plural:'PREDITIVOS', quem:'frota, quando julgar importante' } };
  function catDe(m){ return !m ? null : m.freq === 'diario' ? 'diario' : (CATCK[m.categoria] ? m.categoria : 'inspecao'); }
  function freqOk(cat, f){ return cat === 'inspecao' ? ['semanal','quinzenal','mensal'].indexOf(f) >= 0 : ['livre','semanal','quinzenal','mensal'].indexOf(f) >= 0; }
  /* diário de um tipo pode ser desligado pelo admin (Renan, 11/10/2026): o motorista deixa de ter checklist nesses ativos */
  function modelosDiarios(){ var off = load().diarios_off || []; return TIPOS.map(function(t){ return { id:'d-' + t.id, nome:'Diário · ' + t.nome, freq:'diario', exec:'motorista', tipos:[t.id], itens:null, sistema:true, ativo: off.indexOf(t.id) < 0 }; }); }
  function diarioAtivo(tipoId){ return (load().diarios_off || []).indexOf(tipoId) < 0; }
  function modelos(todos){ var l = modelosDiarios().concat(load().modelos || []); return todos ? l : l.filter(function(m){ return m.ativo !== false; }); }
  function modelo(id){ return modelos(true).filter(function(m){ return m.id === id; })[0] || null; }
  /* itens que aparecem num checklist: diário = itens do ativo (catálogo do tipo menos as exceções); inspeção = lista do modelo */
  function itensDoModelo(modeloId, ativoOuId){
    var m = modelo(modeloId); if (!m) return [];
    if (m.freq === 'diario') return itensDoAtivo(ativoOuId);
    return (m.itens || []).map(function(id){ return ITEM[id]; }).filter(Boolean);
  }
  function modeloCriar(d){
    var db = load(); var nome = UP(d.nome);
    if (!nome) return { ok:false, erro:'Dê um nome ao checklist.' };
    var cat = CATCK[d.categoria] ? d.categoria : 'inspecao';
    if (!freqOk(cat, d.freq)) return { ok:false, erro: cat === 'inspecao' ? 'Escolha a frequência (semanal, quinzenal ou mensal).' : 'Escolha a frequência (sob demanda, semanal, quinzenal ou mensal).' };
    if (!d.tipos || !d.tipos.length) return { ok:false, erro:'Escolha ao menos um tipo de ativo.' };
    db.itens_extra = db.itens_extra || [];
    var novos = (d.novos || []).filter(function(n){ return n && String(n.nome || '').trim(); }).map(function(n){
      var it = { id:uid('x'), cat:n.cat || 'INSPEÇÃO', nome:UP(n.nome), crit:CRIT[n.crit] ? n.crit : 'media', prazo:Math.max(1, +n.prazo || 72), bloqueia:!!n.bloqueia, ap:[], insp:true };
      db.itens_extra.push(it); return it;
    });
    registrarExtras(novos);
    var itens = (d.itens || []).filter(function(id){ return ITEM[id]; }).concat(novos.map(function(n){ return n.id; }));
    if (!itens.length) return { ok:false, erro:'O checklist precisa ter ao menos um item.' };
    var m = { id:uid('m'), nome:nome, categoria:cat, freq:d.freq, exec:'equipe', tipos:d.tipos.slice(), itens:itens, sistema:false, ativo:true, criado_em:isoDT(new Date()), criado_por:d.por || null, origem:d.origem || 'manual' };
    db.modelos = db.modelos || []; db.modelos.push(m); save();
    garantePrevItens(); return { ok:true, modelo:m, itens_novos:novos.length };
  }
  /* itens do diário de um tipo (Renan, 11/10/2026: "deveria poder editar"): liga/desliga o tipo em cada item do catálogo.
     Só itens do diário (insp nunca entra); grava em itens_cfg[id].ap como lista explícita; vale para checklists e OS novos. */
  function diarioItensSet(tipoId, ids){
    if (!TIPO[tipoId]) return { ok:false, erro:'Tipo não encontrado.' };
    var quer = {}; (ids || []).forEach(function(id){ if (ITEM[id] && !ITEM[id].insp) quer[id] = 1; });
    if (!Object.keys(quer).length) return { ok:false, erro:'O diário precisa ter ao menos um item.' };
    var mud = 0;
    ITENS.forEach(function(it){
      if (it.insp || ITEM[it.id] !== it) return;
      var tem = itemAplica(it, tipoId), deve = !!quer[it.id]; if (tem === deve) return;
      var lista = TIPOS.filter(function(t){ return itemAplica(it, t.id); }).map(function(t){ return t.id; });
      lista = deve ? lista.concat([tipoId]) : lista.filter(function(x){ return x !== tipoId; });
      itemSet(it.id, { ap: lista }); mud++;
    });
    return { ok:true, alterados:mud };
  }
  function modeloSet(id, patch){
    var db = load();
    if (/^d-/.test(id)) {   /* diário: só liga/desliga; o conteúdo vem de Itens e SLA */
      var tipo = id.slice(2); if (!TIPO[tipo]) return { ok:false, erro:'Tipo não encontrado.' };
      if (patch.ativo == null) return { ok:false, erro:'Os itens do diário são editados em Itens e SLA.' };
      db.diarios_off = (db.diarios_off || []).filter(function(x){ return x !== tipo; }); if (!patch.ativo) db.diarios_off.push(tipo);
      save(); garantePrevItens(); return { ok:true, modelo:modelo(id) };
    }
    var m = (db.modelos || []).filter(function(x){ return x.id === id; })[0];
    if (!m) return { ok:false, erro:'Checklist não encontrado.' };
    var cat2 = patch.categoria != null ? patch.categoria : catDe(m), fr2 = patch.freq != null ? patch.freq : m.freq;
    if (!CATCK[cat2]) return { ok:false, erro:'Tipo de checklist inválido.' };
    if (!freqOk(cat2, fr2)) return { ok:false, erro:'Frequência não vale para ' + CATCK[cat2].nome.toLowerCase() + '.' };
    ['nome','categoria','freq','tipos','itens','ativo'].forEach(function(k){ if (patch[k] != null) m[k] = patch[k]; });
    save(); garantePrevItens(); return { ok:true, modelo:m };
  }
  /* inspeções da equipe para o usuário (admin/frota/master): modelo × ativo, com a situação pela última execução */
  function inspecoesPara(u){
    if (!u || ['master','admin','frota'].indexOf(u.papel) < 0) return [];
    var db = load(), agora = isoDT(new Date()), out = [];
    modelos().filter(function(m){ return m.freq !== 'diario'; }).forEach(function(m){
      db.ativos.filter(function(a){ return a.status === 'ativo' && m.tipos.indexOf(a.tipo) >= 0; }).forEach(function(a){
        var ult = null; for (var i = db.checklists.length - 1; i >= 0; i--) { var c = db.checklists[i]; if (c.ativo === a.id && c.modelo === m.id) { ult = c; break; } }
        if (!FREQ[m.freq].dias) { out.push({ modelo:m, ativo:a, ultima:ult, vence:null, horas:Infinity, status:'livre' }); return; }   /* sob demanda: nunca atrasa */
        var vence = ult ? addH(ult.data, FREQ[m.freq].dias * 24) : null;
        var h = vence ? diffH(agora, vence) : -1;
        out.push({ modelo:m, ativo:a, ultima:ult, vence:vence, horas:h, status: !ult ? 'nunca' : h < 0 ? 'atrasada' : h < 48 ? 'vence' : 'em_dia' });
      });
    });
    var ord = { atrasada:0, nunca:1, vence:2, em_dia:3, livre:4 };
    return out.sort(function(x, y){ return ord[x.status] - ord[y.status] || (x.horas - y.horas); });
  }
  /* importação: planilha CSV (separador ;) com categoria;item;criticidade;prazo_horas;bloqueia */
  function modeloCsvTemplate(){
    return ['categoria;item;criticidade;prazo_horas;bloqueia',
      'Rodagem;Torque das porcas de roda (torquímetro);critica;24;sim',
      'Freios e direção;Espessura das lonas de freio;alta;72;nao',
      'Motor e fluidos;Correias e tensionadores;media;72;nao',
      'Cabine e estrutura;Trincas e soldas no chassi;alta;168;nao'].join('\r\n');
  }
  function lerCsvModelo(texto){
    var linhas = String(texto || '').replace(/^\uFEFF/, '').split(/\r?\n/).map(function(l){ return l.trim(); }).filter(Boolean);
    if (!linhas.length) return { ok:false, erro:'Arquivo vazio.' };
    var sep = linhas[0].indexOf(';') >= 0 ? ';' : ',';
    var cab = linhas[0].toLowerCase().split(sep).map(function(c){ return c.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,''); });
    var ix = function(n){ return cab.findIndex(function(c){ return c.indexOf(n) === 0; }); };
    var iC = ix('categ'), iI = ix('item'), iK = ix('critic'), iP = ix('prazo'), iB = ix('bloq');
    if (iI < 0) return { ok:false, erro:'A planilha precisa da coluna "item". Baixe o modelo.' };
    var mapCrit = { critica:'critica', alta:'alta', media:'media', baixa:'baixa' }, itens = [], erros = [];
    linhas.slice(1).forEach(function(l, k){
      var c = l.split(sep).map(function(x){ return x.trim(); }); var nome = c[iI];
      if (!nome) { erros.push('Linha ' + (k + 2) + ': sem nome do item.'); return; }
      var crit = mapCrit[String(c[iK] || 'media').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')] || 'media';
      var prazo = parseInt(c[iP], 10); if (!(prazo > 0)) { prazo = 72; erros.push('Linha ' + (k + 2) + ': prazo inválido, usei 72 h.'); }
      var bl = /^(s|sim|1|true|x)$/i.test(String(c[iB] || ''));
      var exist = ITENS.filter(function(i){ return i.nome.toLowerCase() === nome.toLowerCase(); })[0];
      itens.push({ cat:c[iC] || 'INSPEÇÃO', nome:nome, crit:crit, prazo:prazo, bloqueia:bl, existente: exist ? exist.id : null });
    });
    return { ok:itens.length > 0, itens:itens, erros:erros, erro: itens.length ? null : 'Nenhum item válido na planilha.' };
  }
  function ativoItensFora(id, lista){ var a = ativo(id); if (!a) return { ok:false, erro:'Ativo não encontrado.' }; a.itens_fora = (lista || []).slice(); save(); return { ok:true, ativo:a }; }

  /* ──────────────────────────────────────────────────────────
     2. USUÁRIOS FICTÍCIOS
     papel: master (Renan) · admin (gestor da Atual) · frota (mecânico/encarregado) · motorista
     status: ativo · pendente · bloqueado
     ────────────────────────────────────────────────────────── */
  var UNIDADES = ['Obra Taquara', 'Obra Sapucaia do Sul', 'Pátio Imbé'];
  var USUARIOS_SEED = [
    { id:'u0',  nome:'Renan Fortes',            cpf:'00000000191', pin:'1234', papel:'master',    status:'ativo', unidade:'OneSpot' },
    { id:'u1',  nome:'Carlos Dávila',           cpf:'11111111111', pin:'1234', papel:'admin',     status:'ativo', unidade:'Pátio Imbé' },
    { id:'u2',  nome:'Nardi Holzschuh',         cpf:'22222222222', pin:'1234', papel:'frota',     status:'ativo', unidade:'Pátio Imbé' },
    { id:'u3',  nome:'Deomarino Souza',         cpf:'33333333333', pin:'1234', papel:'frota',     status:'ativo', unidade:'Obra Taquara' },
    { id:'m01', nome:'João Pedro Lauffer',      cpf:'10000000001', pin:'1234', papel:'motorista', status:'ativo', unidade:'Obra Taquara' },
    { id:'m02', nome:'Anderson Kirch',          cpf:'10000000002', pin:'1234', papel:'motorista', status:'ativo', unidade:'Obra Taquara' },
    { id:'m03', nome:'Marcos Vinícius Simão',   cpf:'10000000003', pin:'1234', papel:'motorista', status:'ativo', unidade:'Obra Taquara' },
    { id:'m04', nome:'Adilmar Freitas',         cpf:'10000000004', pin:'1234', papel:'motorista', status:'ativo', unidade:'Obra Sapucaia do Sul' },
    { id:'m05', nome:'Denísio Barbosa',         cpf:'10000000005', pin:'1234', papel:'motorista', status:'ativo', unidade:'Obra Sapucaia do Sul' },
    { id:'m06', nome:'Rodrigo Schenkel',        cpf:'10000000006', pin:'1234', papel:'motorista', status:'ativo', unidade:'Obra Sapucaia do Sul' },
    { id:'m07', nome:'Samuel Lauffer',          cpf:'10000000007', pin:'1234', papel:'motorista', status:'ativo', unidade:'Pátio Imbé' },
    { id:'m08', nome:'André Galimberti',        cpf:'10000000008', pin:'1234', papel:'motorista', status:'ativo', unidade:'Pátio Imbé' },
    { id:'m09', nome:'Luiz Carlos Serini',      cpf:'10000000009', pin:'1234', papel:'motorista', status:'ativo', unidade:'Obra Taquara' },
    { id:'m10', nome:'Paulo Roberto Chaves',    cpf:'10000000010', pin:'1234', papel:'motorista', status:'ativo', unidade:'Obra Sapucaia do Sul' },
    { id:'m11', nome:'Wanderson Preserve',      cpf:'10000000011', pin:'1234', papel:'motorista', status:'ativo', unidade:'Pátio Imbé' },
    { id:'m12', nome:'Thiago Becker',           cpf:'10000000012', pin:'1234', papel:'motorista', status:'ativo', unidade:'Obra Taquara' },
    { id:'m13', nome:'Ana Tássia Dávila',       cpf:'10000000013', pin:'1234', papel:'motorista', status:'ativo', unidade:'Pátio Imbé' },
    { id:'m14', nome:'Wandiney Facchini',       cpf:'10000000014', pin:'1234', papel:'motorista', status:'ativo', unidade:'Obra Sapucaia do Sul' },
    { id:'m15', nome:'Natanael Rodovale',       cpf:'10000000015', pin:'1234', papel:'motorista', status:'ativo', unidade:'Obra Taquara' },
    { id:'m16', nome:'Breno Salvaro',           cpf:'10000000016', pin:'1234', papel:'motorista', status:'ativo', unidade:'Obra Sapucaia do Sul' },
    { id:'m17', nome:'Dalisvan Pitsport',       cpf:'10000000017', pin:'1234', papel:'motorista', status:'ativo', unidade:'Pátio Imbé' },
    { id:'m18', nome:'Mário Sérgio Capile',     cpf:'10000000018', pin:'1234', papel:'motorista', status:'ativo', unidade:'Obra Taquara' },
    { id:'m19', nome:'Willian Transterra',      cpf:'10000000019', pin:null,   papel:'motorista', status:'pendente', unidade:'Obra Sapucaia do Sul' },
    { id:'m20', nome:'Lucas Cibersol',          cpf:'10000000020', pin:'1234', papel:'motorista', status:'bloqueado', unidade:'Pátio Imbé' }
  ];
  var PAPEL = { master:'ADMIN MASTER', admin:'ADMINISTRADOR', frota:'MECÂNICO', motorista:'MOTORISTA' };   /* 'frota' = mecânicos e encarregados (Renan, 12/10/2026: perfil Mecânico em Usuários) */

  /* ──────────────────────────────────────────────────────────
     3. UTILITÁRIOS
     ────────────────────────────────────────────────────────── */
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function iso(d){ return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()); }
  function isoDT(d){ return iso(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':00'; }
  function parse(s){ if (s instanceof Date) return s; var p = s.split(/[-T:]/); return new Date(+p[0], +p[1]-1, +p[2], +(p[3]||0), +(p[4]||0), +(p[5]||0)); }
  function addH(s, h){ var d = parse(s); d.setTime(d.getTime() + h*3600e3); return isoDT(d); }
  function diffH(a, b){ return (parse(b).getTime() - parse(a).getTime()) / 3600e3; }
  function fmtData(s){ var d = parse(s); return pad(d.getDate()) + '/' + pad(d.getMonth()+1) + '/' + d.getFullYear(); }
  function fmtDataCurta(s){ var d = parse(s); return pad(d.getDate()) + '/' + pad(d.getMonth()+1); }
  function fmtHora(s){ var d = parse(s); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function fmtDH(s){ return fmtData(s) + ' ' + fmtHora(s); }
  function mesKey(s){ return String(s).slice(0,7); }
  var MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  var MESES_N = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  function mesLabel(mk){ var p = mk.split('-'); return MESES[+p[1]-1] + '/' + p[0].slice(2); }
  function mesNome(mk){ var p = mk.split('-'); return MESES_N[+p[1]-1] + ' de ' + p[0]; }
  function prazoTxt(h){ h = +h; if (h < 1) return Math.round(h * 60) + ' min'; if (h % 1) { var hh = Math.floor(h), mm = Math.round((h - hh) * 60); return hh + 'h ' + mm + 'min'; } return h < 24 ? h + 'h' : h % 24 === 0 && h < 168 ? (h/24) + (h === 24 ? ' dia' : ' dias') : h % 24 === 0 ? (h/24) + ' dias' : h + 'h'; }
  function brl(v){ return 'R$ ' + (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 }); }
  function cpfFmt(c){ c = String(c||'').replace(/\D/g,''); return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'); }
  function nomeAtivo(a){ return (a.placa || ('Frota ' + a.frota)) + ' · ' + a.marca + ' ' + a.modelo; }
  /* MAIÚSCULAS (Renan, 12/10/2026): cadastros e textos livres sempre em caixa alta; e-mail, CPF, senha, ids e fotos ficam como estão */
  function UP(v){ return String(v == null ? '' : v).trim().toUpperCase(); }
  function upObj(o, keys){ if (!o) return o; keys.forEach(function(k){ if (o[k] != null && typeof o[k] === 'string') o[k] = UP(o[k]); }); return o; }
  var UP_ATIVO = ['marca','modelo','prop','unidade'], UP_USR = ['nome','unidade','especialidade'], UP_FORN = ['nome','servico','contato','cidade'];
  function migraMaiusculas(){
    if (DB.maiusculas) return; DB.maiusculas = true;
    (DB.unidades || []).forEach(function(u){ u.nome = UP(u.nome); });
    DB.ativos.forEach(function(a){ upObj(a, UP_ATIVO); });
    DB.usuarios.forEach(function(u){ upObj(u, UP_USR); });
    (DB.fornecedores || []).forEach(function(f){ upObj(f, UP_FORN); });
    (DB.modelos || []).forEach(function(m){ m.nome = UP(m.nome); });
    (DB.itens_extra || []).forEach(function(i){ i.nome = UP(i.nome); if (i.cat) i.cat = UP(i.cat); }); Object.keys(DB.itens_cfg || {}).forEach(function(k){ if (DB.itens_cfg[k].nome) DB.itens_cfg[k].nome = UP(DB.itens_cfg[k].nome); });
    DB.checklists.forEach(function(c){ (c.ncs || []).forEach(function(nc){ if (nc.obs) nc.obs = UP(nc.obs); }); });
    DB.os.forEach(function(o){ if (o.solucao) o.solucao = UP(o.solucao); if (o.obs) o.obs = UP(o.obs); (o.reprog || []).forEach(function(r){ if (r.motivo) r.motivo = UP(r.motivo); }); (o.eventos || []).forEach(function(e){ if (e.txt) e.txt = UP(e.txt); }); });
    save();
  }
  function uid(p){ return (p || 'id') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

  // PRNG determinístico (mulberry32) para a demo nascer igual em todo lugar
  function rng(seed){ var a = seed >>> 0; return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  /* ──────────────────────────────────────────────────────────
     4. REGRAS DE OS E SLA
     ────────────────────────────────────────────────────────── */
  function limiteDe(abertura, item){ return addH(abertura, item.prazo); }
  /* situação de uma OS em relação ao prazo: usa o limite reprogramado se houver,
     mas guarda o original para o SLA "puro" */
  function slaDe(os, agora){
    agora = agora || isoDT(new Date());
    var lim = os.limite_atual || os.limite;
    var fim = os.fechada_em || agora;
    var restante = diffH(fim, lim);
    return {
      limite: lim, limite_original: os.limite,
      no_prazo: diffH(fim, os.limite) >= 0,            // SLA original
      no_prazo_atual: restante >= 0,                    // considerando reprogramação
      horas_restantes: restante,
      vencida: os.status !== 'fechada' && restante < 0,
      tempo_resolucao_h: os.fechada_em ? diffH(os.abertura, os.fechada_em) : null
    };
  }
  // prioridade na fila: criticidade primeiro, depois quem vence antes
  /* ordem do Painel OS: primeiro o prazo (quem vence antes), depois a criticidade (Renan, 12/10/2026) */
  function prioridadeOS(a, b){
    var d = parse(a.limite_atual || a.limite) - parse(b.limite_atual || b.limite);
    if (d) return d;
    return CRIT[a.crit].ordem - CRIT[b.crit].ordem;
  }

  /* ──────────────────────────────────────────────────────────
     5. BANCO (localStorage) + SEED
     ────────────────────────────────────────────────────────── */
  var DB = null;
  var OBS = {
    pneu:['Pneu dianteiro direito careca', 'Bolha na lateral do pneu traseiro', 'Pneu interno traseiro murcho'],
    farol:['Farol baixo esquerdo queimado', 'Farol alto não acende', 'Lente do farol trincada'],
    lant:['Luz de freio direita apagada', 'Lanterna traseira quebrada'],
    seta:['Seta esquerda não funciona', 'Pisca-alerta com falha'],
    oleo:['Nível abaixo do mínimo', 'Óleo escuro, precisa troca'],
    agua:['Reservatório vazio', 'Mangueira do radiador com vazamento'],
    vaz:['Mancha de óleo embaixo do motor', 'Vazamento no cilindro hidráulico'],
    freio:['Pedal baixo, freio fraco', 'Ruído ao frear'],
    cinto:['Cinto não trava', 'Fecho quebrado'],
    ext:['Extintor vencido', 'Extintor sem pressão'],
    vidros:['Retrovisor direito quebrado', 'Trinca no para-brisa'],
    re:['Alarme de ré mudo', 'Sirene de ré intermitente'],
    cac:['Trava da caçamba não fecha', 'Cilindro da caçamba vazando'],
    cil:['Mangueira hidráulica estourada', 'Cilindro da lança vazando'],
    dir:['Folga grande no volante', 'Direção pesada'],
    roda:['Parafuso de roda faltando', 'Aro amassado'],
    bat:['Bateria descarregando', 'Terminal oxidado'],
    taco:['Tacógrafo sem disco', 'Tacógrafo não registra'],
    limp:['Palheta rasgada', 'Esguicho sem água']
  };
  var OBS_PAL = [[/vazament/i,['Vazamento visível embaixo do veículo','Gotejamento na conexão']],[/pneu|calibr/i,['Pneu com desgaste irregular','Pneu murcho']],
    [/freio|maneco/i,['Freio fraco','Pedal baixo']],[/luz|farol|lantern|seta|pisca|giroflex/i,['Lâmpada queimada','Lente quebrada']],
    [/óleo|oleo|fluido|arrefec|água|agua|radiador/i,['Nível abaixo do mínimo','Completado no início do turno']],[/cinto/i,['Cinto não trava','Fivela quebrada']],
    [/extintor/i,['Extintor vencido','Lacre rompido']],[/document|licen|cipp|mopp|fispq|cnh|crlv/i,['Documento vencido','Documento não está no veículo']],
    [/alarme|buzina/i,['Alarme de ré mudo','Buzina não funciona']],[/vidro|para-brisa|espelho|retrovisor/i,['Para-brisa trincado','Retrovisor quebrado']],
    [/dire|volante/i,['Folga grande no volante','Direção pesada']],[/porca|roda|aro/i,['Porca solta','Marca de ferrugem escorrendo']]];
  function obsPara(itemId, r){ var it = ITEM[itemId], l = OBS[itemId]; if (!l && it && it.ex) l = [it.ex]; if (!l && it) OBS_PAL.some(function(p){ if (p[0].test(it.nome)) { l = p[1]; return true; } }); l = l || ['Item com defeito', 'Precisa reparo', 'Não conforme na inspeção']; return l[Math.floor(r()*l.length)]; }

  function gerarSeed(){
    var r = rng(20261010);
    var ativos = CK_ATIVOS.map(function(a){
      var t = TIPO[a.tipo], idade = a.ano ? (2026 - a.ano) : 20;
      return {
        id:a.id, tipo:a.tipo, placa:a.placa, frota:a.frota, marca:a.marca, modelo:a.modelo, ano:a.ano, prop:a.prop,
        unidade: UNIDADES[Math.floor(r()*3)],
        status:'ativo',
        medidor: t.medidor,
        leitura: t.medidor === 'km' ? Math.round(80000 + r()*350000) : t.medidor === 'h' ? Math.round(1500 + r()*12000) : null,
        risco: Math.min(.03, .006 + idade*.0006 + r()*.004)   // ativos velhos reprovam mais (~0,4 NC por checklist na média)
      };
    });
    ativos.forEach(function(a){
      var m = (a.modelo + ' ' + a.marca).toUpperCase();
      var comFlag = function(fl){ return ITENS.filter(function(i){ return i.flag === fl && i.ap.indexOf(a.tipo) >= 0; }).map(function(i){ return i.id; }); };
      if (a.tipo === 'CAMINHAO' && /8\.140|L 1113|L-1113|F14000|CNM|1720/.test(m)) a.itens_fora = comFlag('basc');   /* caminhões sem caçamba basculante */
      if (a.tipo === 'REBOQUE' && !/PRANCHA|RODOVALE|RODOMOURA|SALVARO|BECKER|FACCHINI/.test(m)) a.itens_fora = comFlag('prancha');
    });
    var usuarios = USUARIOS_SEED.map(function(u){ return Object.assign({ criado_em:'2026-08-01T08:00:00', ultimo_acesso:null }, u); });
    var motoristas = usuarios.filter(function(u){ return u.papel === 'motorista' && u.status === 'ativo'; });
    // cada ativo tem um operador habitual da mesma unidade (quando houver)
    ativos.forEach(function(a){
      var da = motoristas.filter(function(m){ return m.unidade === a.unidade; });
      a.operador = (da.length ? da : motoristas)[Math.floor(r()*(da.length ? da.length : motoristas.length))].id;
    });

    var checklists = [], oss = [], abertasPorChave = {};
    /* abre (ou marca reincidência) e simula o ciclo de vida da OS de uma não conformidade da demo */
    function abreOsSeed(ck, a, oper, nc){
          var k = a.id + '|' + nc.item, ab = abertasPorChave[k], it = ITEM[nc.item];
          if (ab && ab.status !== 'fechada') { ab.reincidencias++; ab.checklists.push(ck.id); return; }
          var os = { id:'OS-' + String(oss.length + 1).padStart(4,'0'), ativo:a.id, item:nc.item, crit:it.crit, prazo_h:it.prazo, bloqueia:it.bloqueia,
            abertura:ck.data, limite:limiteDe(ck.data, it), limite_atual:null, status:'aberta', checklists:[ck.id], checklist:ck.id,
            obs:nc.obs, foto:'demo', aberta_por:oper, reincidencias:0, reprog:[], eventos:[{ q:ck.data, t:'aberta', por:oper }] };
          // simula o ciclo de vida: parte vira "em andamento", parte fecha (60% dentro do prazo)
          var idadeH = diffH(ck.data, isoDT(new Date()));
          var dentro = r() < .62;
          var fechaEm = dentro ? it.prazo * (0.15 + r()*0.8) : it.prazo * (1.1 + r()*1.6);
          var resp = frota[Math.floor(r()*frota.length)];
          if (fechaEm < idadeH) {
            os.status = 'fechada'; os.fechada_em = addH(ck.data, fechaEm); os.fechada_por = resp.id;
            os.solucao = ['Peça trocada', 'Reparo feito na oficina interna', 'Ajuste e teste ok', 'Serviço externo concluído'][Math.floor(r()*4)];
            os.custo = it.crit === 'baixa' ? Math.round(r()*300) : Math.round(80 + r()*(it.prazo > 200 ? 6000 : 1500));
            os.foto_fech = 'demo';
            os.execucao = /externo/.test(os.solucao) ? 'externa' : (r() < .2 ? 'externa' : 'interna');
            if (!dentro && r() < .5) { os.limite_atual = addH(os.limite, it.prazo); os.reprog.push({ q:addH(ck.data, it.prazo*.8), novo_limite:os.limite_atual, motivo:'Aguardando peça do fornecedor', por:resp.id }); os.eventos.push({ q:os.reprog[0].q, t:'reprogramada', por:resp.id, txt:'Novo prazo: ' + fmtDH(os.limite_atual) }); }
            os.eventos.push({ q:os.fechada_em, t:'fechada', por:resp.id, txt:os.solucao });
          } else if (idadeH > it.prazo * .3 && r() < .5) {
            os.status = 'em_andamento'; os.responsavel = resp.id; os.execucao = r() < .25 ? 'externa' : 'interna'; os.eventos.push({ q:addH(ck.data, Math.min(idadeH, it.prazo*.3)), t:'em_andamento', por:resp.id });
            if (idadeH > it.prazo && r() < .5) { os.limite_atual = addH(os.limite, it.prazo); os.reprog.push({ q:addH(os.limite, -1), novo_limite:os.limite_atual, motivo:'Oficina externa sem agenda', por:resp.id }); os.eventos.push({ q:os.reprog[0].q, t:'reprogramada', por:resp.id, txt:'Novo prazo: ' + fmtDH(os.limite_atual) }); }
          }
          oss.push(os); abertasPorChave[k] = os;
        }

    var ini = new Date(HOJE); ini.setDate(ini.getDate() - 75);   // ~2,5 meses de histórico
    var frota = usuarios.filter(function(u){ return u.papel === 'frota'; });
    for (var d = new Date(ini); d <= HOJE; d.setDate(d.getDate()+1)) {
      var dow = d.getDay(); if (dow === 0) continue;             // domingo não opera
      var sab = dow === 6;
      ativos.forEach(function(a){
        var t = TIPO[a.tipo];
        var pAdesao = (t.grupo === 'impl' ? .45 : t.grupo === 'maq' ? .72 : .82) * (sab ? .4 : 1);
        if (iso(d) === iso(HOJE)) pAdesao *= .55;               // hoje ainda está em andamento
        if (r() > pAdesao) return;
        var oper = (r() < .8) ? a.operador : motoristas[Math.floor(r()*motoristas.length)].id;
        var dt = new Date(d); dt.setHours(6 + Math.floor(r()*2), Math.floor(r()*60), 0, 0);
        var itens = itensDoAtivo(a), ncs = [];
        itens.forEach(function(it){
          var p = a.risco * (it.crit === 'critica' ? .6 : it.crit === 'alta' ? 1 : it.crit === 'media' ? 1.2 : 1.4);
          if (r() < p) ncs.push({ item:it.id, obs:obsPara(it.id, r), foto:'demo' });
        });
        if (t.medidor === 'km') a.leitura += Math.round(40 + r()*260);
        else if (t.medidor === 'h') a.leitura += Math.round(3 + r()*7);
        var ck = { id:'ck-' + checklists.length, ativo:a.id, modelo:'d-' + a.tipo, usuario:oper, data:isoDT(dt), leitura:a.leitura,
          itens_total:itens.length, nc:ncs.length, ncs:ncs, duracao_s: 180 + Math.floor(r()*420), origem:'app' };
        checklists.push(ck);
        ncs.forEach(function(nc){ abreOsSeed(ck, a, oper, nc); });
      });
    }
    /* inspeções da equipe (exemplos): semanal das máquinas e quinzenal dos caminhões, executadas pela frota */
    var modelosSeed = [
      { id:'m-sem-maq', nome:'Inspeção semanal · Máquinas pesadas', freq:'semanal', exec:'equipe', tipos:['RETRO','ESCAV','MINI','ROLO','MOTO','VIBRO','CARREG'],
        itens:['i-trinca','i-dentes','i-esteir','i-corr','i-amost','i-extval'], sistema:false, ativo:true, criado_em:'2026-07-28T09:00:00', criado_por:'u1', origem:'manual' },
      { id:'m-qui-cam', nome:'Inspeção quinzenal · Caminhões e cavalos', freq:'quinzenal', exec:'equipe', tipos:['CAMINHAO','CAVALO'],
        itens:['i-torque','i-rolam','i-ar','i-lonas','i-trinca','i-corr','i-extval'], sistema:false, ativo:true, criado_em:'2026-07-28T09:00:00', criado_por:'u1', origem:'manual' }
    ];
    modelosSeed.forEach(function(m){
      var passo = FREQ[m.freq].dias;
      ativos.filter(function(a){ return m.tipos.indexOf(a.tipo) >= 0; }).forEach(function(a){
        var d0 = new Date(ini); d0.setDate(d0.getDate() + Math.floor(r()*passo));
        for (var d = new Date(d0); d <= HOJE; d.setDate(d.getDate() + passo + (r() < .2 ? Math.ceil(r()*4) : 0))) {
          if (r() > .88) continue;                                   // às vezes a equipe não faz
          var oper = frota[Math.floor(r()*frota.length)].id;
          var dt = new Date(d); dt.setHours(9 + Math.floor(r()*6), Math.floor(r()*60), 0, 0); if (dt > new Date()) break;
          var its = m.itens.map(function(id){ return ITEM[id]; }).filter(Boolean), ncs = [];
          its.forEach(function(it){ if (r() < a.risco * 1.6) ncs.push({ item:it.id, obs:obsPara(it.id, r), foto:'demo' }); });
          var ck = { id:'ck-' + checklists.length, ativo:a.id, modelo:m.id, usuario:oper, data:isoDT(dt), leitura:a.leitura,
            itens_total:its.length, nc:ncs.length, ncs:ncs, duracao_s:600 + Math.floor(r()*900), origem:'inspecao' };
          checklists.push(ck);
          ncs.forEach(function(nc){ abreOsSeed(ck, a, oper, nc); });
        }
      });
    });
    checklists.sort(function(x, y){ return x.data < y.data ? -1 : x.data > y.data ? 1 : 0; });

    // último acesso dos usuários (para cobrança e tela de usuários)
    usuarios.forEach(function(u){
      var meus = checklists.filter(function(c){ return c.usuario === u.id; });
      u.ultimo_acesso = meus.length ? meus[meus.length-1].data : (u.status === 'ativo' && u.papel !== 'motorista' ? isoDT(new Date()) : null);
    });
    return { versao:10, gerado_em:isoDT(new Date()), ativos:ativos, usuarios:usuarios, checklists:checklists, os:oss, fotos:{}, modelos:modelosSeed, itens_extra:[],
      unidades: UNIDADES.map(function(n, i){ return { id:'un' + (i+1), nome:n, ativa:true }; }),
      config:{ cliente:'Construtora e Pavimentadora Atual', inclusos:30, valor_base:300, valor_usuario:5, implantacao:3000,
               pix:{ chave:'fortesindicadores@gmail.com', nome:'RENAN FORTES', cidade:'PORTO ALEGRE' }, vencimento_dia:10 } };
  }

  function dbVazio(){ return { versao:'remoto', ativos:[], usuarios:[], checklists:[], os:[], fotos:{}, anexos:{}, modelos:[], itens_extra:[], itens_cfg:{}, unidades:[], fornecedores:[], diarios_off:[], config:{ metas:JSON.parse(JSON.stringify(METAS_PADRAO)) }, maiusculas:true }; }
  function setDB(d){ DB = d; garantePrevItens(); return DB; }
  function setCatalogo(lista){ ITENS.length = 0; Object.keys(ITEM).forEach(function(k){ delete ITEM[k]; }); (lista || []).forEach(function(i){ if (/^prev-/.test(i.id)) { i.preventiva = true; ITEM[i.id] = i; return; } ITENS.push(i); ITEM[i.id] = i; }); }
  function load(){
    if (DB) return DB;
    if (REMOTO) { DB = dbVazio(); return DB; }
    try { var raw = localStorage.getItem(KEY); if (raw) { DB = JSON.parse(raw); if (DB.versao === 10) { registrarExtras(DB.itens_extra); migraExecucao(); migraFornecedores(); migraPrevPred(); migraInicio(); migraMaiusculas(); if (!DB.unidades) { DB.unidades = UNIDADES.map(function(n, i){ return { id:'un' + (i+1), nome:n, ativa:true }; }); save(); } garantePrevItens(); return DB; } } } catch(e){}
    DB = gerarSeed(); migraExecucao(); migraFornecedores(); migraPrevPred(); migraInicio(); migraMaiusculas(); save(); garantePrevItens(); return DB;
  }
  function migraExecucao(){ var mud = 0; (DB.os || []).forEach(function(o){ if (o.execucao || o.status === 'aberta') return; var h = 0; for (var i = 0; i < o.id.length; i++) h = (h * 31 + o.id.charCodeAt(i)) % 997;
      o.execucao = /extern/i.test(o.solucao || '') || (o.reprog || []).some(function(r){ return /extern/i.test(r.motivo || ''); }) || h % 5 === 0 ? 'externa' : 'interna'; mud++; }); if (mud) save(); }
  /* fornecedores fictícios da demo + OS externas fechadas ligadas a eles; interna não tem custo (Renan, 11/10/2026) */
  /* fornecedores REAIS da Atual: os 72 do relatório de OS do sistema de manutenção deles (jan–out/2026), com CNPJ (Renan, 12/10/2026) */
  var FORN_SEED = [
    { nome:"FAGNER CESARIO", cnpj:"13682033000100", servico:"", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"GOULART", cnpj:"11474981000125", servico:"", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"OFICINA INTERNA IMBE", cnpj:"02671258000145", servico:"Oficina interna", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"N.S APARECIDA", cnpj:"86752032000169", servico:"", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"PEDRO ERNANDO JAQUES NUNES", cnpj:"15760752000128", servico:"", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"POSTO DE MOLAS MULLER", cnpj:"16416821000143", servico:"Suspensão e molas", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"AUTO ELETRICA FLECK", cnpj:"03395006000101", servico:"Elétrica", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"DIRCEU TRUCK CENTER LTDA", cnpj:"90440645000219", servico:"Mecânica", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"SINOS TINTAS", cnpj:"93411213000197", servico:"Tintas e pintura", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"LAVAGEM FONTES", cnpj:"52882159000180", servico:"Lavagem", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"STAR MECANICA", cnpj:"24438850000134", servico:"Mecânica", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"RAVAS PEÇAS MULTIMARCAS", cnpj:"08108006000270", servico:"Peças", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"DAVI COSTA MEDEIROS", cnpj:"05023522000122", servico:"", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"JR TRUCKS", cnpj:"22708806000171", servico:"Mecânica", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"RETROPARTES", cnpj:"08459946000122", servico:"Peças de máquinas", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"BODISUL COMERCIAL DE PEÇAS LTDA", cnpj:"05120992000104", servico:"Peças", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"AUTO PEÇAS PEREIRA", cnpj:"91325266000160", servico:"Peças", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"TRUCK SINOS", cnpj:"07797613000140", servico:"Mecânica", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"FEDERAL COML", cnpj:"96743547000156", servico:"Peças", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"AUTO POSTO SABIA LTDA", cnpj:"90737826000120", servico:"Combustível", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"RONI CHAVES", cnpj:"05849430000287", servico:"", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"SAVAR", cnpj:"92889070000160", servico:"", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"DIRCEU TRUCK CENTER", cnpj:"05253702000109", servico:"Mecânica", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"EXTINTORES L DOS SANTOS BADIA", cnpj:"57852059000125", servico:"Extintores", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"CHILE PNEUS", cnpj:"91893321000118", servico:"Pneus", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"MAURICIO DAMBROS", cnpj:"30978577000133", servico:"", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"RETIFICA FEDERAL", cnpj:"09560144000177", servico:"Retífica de motores", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"CARDOSO", cnpj:"02111934000126", servico:"", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"POLIFILTRO IND E COM DE PECAS P AUTOS LTDA", cnpj:"60700135000515", servico:"Filtros", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"MERCO PEÇAS", cnpj:"49636487000192", servico:"Peças", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"APARA BARRO DEMA", cnpj:"87325569000105", servico:"Para-barro", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"LINEPARTS DISTRIBUIDORA AUTOMOTIVA", cnpj:"38331607000127", servico:"Peças", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"AUTO MOTORE", cnpj:"73423923000120", servico:"Mecânica", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"FILTROBOM", cnpj:"88761499000281", servico:"Filtros", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"CARDAN SINOS LTDA", cnpj:"06064771000129", servico:"Cardan", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"SANTOS", cnpj:"22582757000173", servico:"", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"IRMAOS ELY LTDA", cnpj:"92313949000160", servico:"", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"IND E COM DE BATERIAS APOLO LTDA", cnpj:"97013460000196", servico:"Baterias", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"JEFERSON DARIVA", cnpj:"03949149000100", servico:"", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"POSTO DE MOLAS BARBOSA", cnpj:"10514969000134", servico:"Suspensão e molas", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"RITMO", cnpj:"26856130000114", servico:"", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"POSTO DE MOLAS SORAMONTTI", cnpj:"02765466000456", servico:"Suspensão e molas", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"MECANICA POLEGADA", cnpj:"17038380000156", servico:"Mecânica", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"SORAMONTTI", cnpj:"02765466000375", servico:"", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"J.C.R", cnpj:"06275066000170", servico:"", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"RETIFICA DE MOTORES A.M.C.LTDA", cnpj:"02082710000133", servico:"Retífica de motores", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"MECANICA ROSA DIESEL", cnpj:"06784493000184", servico:"Mecânica", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"S P COMERCIO DE PEÇAS E MANUTENÇÕES LTDA", cnpj:"44384306000164", servico:"Peças", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"SAN BOMBAS E  MOTORES", cnpj:"89880975000165", servico:"Bombas", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"C. DOS SANTOS", cnpj:"09631349000104", servico:"", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"TRUCK CENTER", cnpj:"24626266000102", servico:"Mecânica", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"ABASTECEDORA ZANINI", cnpj:"91873281000142", servico:"Combustível", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"DISPAV", cnpj:"14005563000187", servico:"", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"DIPESUL", cnpj:"90576356000160", servico:"", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"SINOSCAR", cnpj:"91688234000714", servico:"", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"JB DIESEL", cnpj:"52913476000117", servico:"Mecânica", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"NERI MOREIRA DE OLIVEIRA", cnpj:"42371410000199", servico:"", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"CASA DAS RETROS", cnpj:"05326757000193", servico:"Peças de máquinas", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"HERBERT DE SOUZA", cnpj:"50311651000170", servico:"", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"FRATELLI AUTO PEÇAS", cnpj:"27617341000167", servico:"Peças", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"MOTOR PEÇAS FEDERAL", cnpj:"46412440000157", servico:"Peças", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"MUNDIALMIX", cnpj:"23875951000100", servico:"", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"JOSE LUIS DE SOUZA RODRIGUES", cnpj:"91791764000106", servico:"", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"TURBOTEC", cnpj:"04854817000188", servico:"Turbinas", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"RS INDUSTRIA DE GIUNDASTES", cnpj:"19568133000278", servico:"Guindastes", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"KAYSERMAQ", cnpj:"73390189000140", servico:"Mecânica", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"JGS", cnpj:"25138750000155", servico:"", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"NOVO PONTO PNEUS", cnpj:"50856763000107", servico:"Pneus", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"CASA DE VELOCIMETROS", cnpj:"04112238000160", servico:"Instrumentos do painel", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"CARBURGO", cnpj:"91667618000599", servico:"", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"CHAISE LTDA", cnpj:"59321433000191", servico:"", contato:'', telefone:'', email:'', cidade:'' },
    { nome:"EMBRAPEÇAS", cnpj:"93116796000123", servico:"Peças", contato:'', telefone:'', email:'', cidade:'' }
  ];
  function migraFornecedores(){
    if (DB.forn_reais) return; DB.forn_reais = true;   /* troca os fictícios pelos reais também numa demo já gravada */
    DB.fornecedores = FORN_SEED.map(function(f, i){ return Object.assign({ id:'fo' + (i + 1), status:'ativo', criado_em:isoDT(new Date()) }, f); });
    (DB.os || []).forEach(function(o){
      if (o.status !== 'fechada') return;
      if (o.execucao !== 'externa') { o.custo = null; return; }
      var h = 0; for (var i = 0; i < o.id.length; i++) h = (h * 31 + o.id.charCodeAt(i)) % 9973;
      var ext = DB.fornecedores.filter(function(f){ return !/OFICINA INTERNA/.test(f.nome); });
      o.fornecedor = h % 7 ? ext[h % ext.length].id : null;
    });
    save();
  }
  /* demo: OS fechadas ganham o evento de início do atendimento (a visão Mecânicos mede a execução a partir dele) */
  function migraInicio(){
    if (DB.inicio_demo) return; DB.inicio_demo = true;
    (DB.os || []).forEach(function(o){
      if (o.status !== 'fechada' || !o.fechada_em || (o.eventos || []).some(function(e){ return e.t === 'em_andamento'; })) return;
      var h = 0; for (var i = 0; i < o.id.length; i++) h = (h * 31 + o.id.charCodeAt(i)) % 997;
      var tot = diffH(o.abertura, o.fechada_em), q = addH(o.abertura, tot * (0.15 + (h % 50) / 100));
      o.eventos.push({ q:q, t:'em_andamento', por:o.fechada_por, txt:'Atendimento ' + (o.execucao === 'externa' ? 'externo' : 'interno') });
    });
    save();
  }
  function migraPrevPred(){
    if (DB.prevpred_demo) return; DB.prevpred_demo = true; DB.modelos = DB.modelos || [];
    var so = function(l){ return l.filter(function(id){ return ITEM[id]; }); }, q = isoDT(new Date());
    DB.modelos.push({ id:'m-prev-maq', nome:'Preventiva interna · Máquinas', categoria:'preventivo', freq:'livre', exec:'equipe', tipos:['RETRO','ESCAV','ROLO','MOTO','VIBRO','CARREG'],
      itens:so(['oleo','agua','hidr','i-rolam','i-ar','i-dentes','i-esteir','i-corr','i-extval']), sistema:false, ativo:true, criado_em:q, criado_por:null, origem:'manual' });
    DB.modelos.push({ id:'m-pred-frota', nome:'Preditivo · Desgaste e análise de óleo', categoria:'preditivo', freq:'livre', exec:'equipe', tipos:['CAMINHAO','CAVALO','RETRO','ESCAV','CARREG'],
      itens:so(['i-amost','i-trinca','i-lonas','i-torque','i-rolam']), sistema:false, ativo:true, criado_em:q, criado_por:null, origem:'manual' });
    save();
  }
  function fornecedores(todos){ var l = load().fornecedores || []; return todos ? l : l.filter(function(f){ return f.status !== 'inativo'; }); }
  function fornecedor(id){ return (load().fornecedores || []).filter(function(f){ return f.id === id; })[0] || null; }
  function fornValidar(d, id){
    var nome = String(d.nome || '').trim(); if (!nome) return 'Informe o nome do fornecedor.';
    var cnpj = String(d.cnpj || '').replace(/\D/g, ''); if (cnpj && cnpj.length !== 14) return 'CNPJ precisa ter 14 números.';
    var dup = (load().fornecedores || []).filter(function(f){ return f.id !== id && ((cnpj && f.cnpj === cnpj) || f.nome.toLowerCase() === nome.toLowerCase()); })[0];
    return dup ? 'Já existe um fornecedor com esse ' + (cnpj && dup.cnpj === cnpj ? 'CNPJ' : 'nome') + '.' : null;
  }
  var FORN_CAMPOS = ['nome','cnpj','servico','contato','telefone','email','cidade','status'];
  function fornecedorCriar(d){
    var e = fornValidar(d, null); if (e) return { ok:false, erro:e };
    var db = load(); db.fornecedores = db.fornecedores || [];
    var f = { id:uid('fo'), status:d.status === 'inativo' ? 'inativo' : 'ativo', criado_em:isoDT(new Date()) };
    FORN_CAMPOS.forEach(function(k){ if (k !== 'status') f[k] = k === 'cnpj' ? String(d[k] || '').replace(/\D/g, '') : UP_FORN.indexOf(k) >= 0 ? UP(d[k]) : String(d[k] || '').trim(); });
    db.fornecedores.push(f); save(); return { ok:true, fornecedor:f };
  }
  function fornecedorSet(id, patch){
    var f = fornecedor(id); if (!f) return { ok:false, erro:'Fornecedor não encontrado.' };
    var e = fornValidar(Object.assign({}, f, patch), id); if (e) return { ok:false, erro:e };
    FORN_CAMPOS.forEach(function(k){ if (patch[k] != null) f[k] = k === 'cnpj' ? String(patch[k]).replace(/\D/g, '') : UP_FORN.indexOf(k) >= 0 ? UP(patch[k]) : String(patch[k]).trim(); });
    save(); return { ok:true, fornecedor:f };
  }
  function anexo(id){ return id ? ((load().anexos || {})[id] || null) : null; }
  function save(){ if (REMOTO) return; try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch(e){ console.warn('localStorage cheio?', e); } }
  function recarregar(){ DB = null; return load(); }
  function reset(){ try { localStorage.removeItem(KEY); } catch(e){} DB = null; return load(); }

  /* ──────────────────────────────────────────────────────────
     6. API PÚBLICA (mesma assinatura que terão as RPCs do Supabase)
     ────────────────────────────────────────────────────────── */
  function usuario(id){ return load().usuarios.filter(function(u){ return u.id === id; })[0] || null; }
  function ativo(id){ return load().ativos.filter(function(a){ return a.id === id; })[0] || null; }
  function login(cpf, pin){
    cpf = String(cpf||'').replace(/\D/g,''); pin = String(pin||'').replace(/\D/g,'');
    var u = load().usuarios.filter(function(x){ return x.cpf === cpf; })[0];
    if (!u) return { ok:false, erro:'CPF não cadastrado. Peça ao gestor para liberar seu acesso.' };
    if (u.status === 'bloqueado') return { ok:false, erro:'Seu acesso está bloqueado. Fale com o gestor da frota.' };
    if (u.status === 'pendente') return { ok:false, erro:'Seu cadastro ainda não foi aprovado pelo gestor.', pendente:true };
    if (!u.pin) return { ok:false, erro:'Primeira vez? Crie sua senha.', primeira_vez:true };
    if (u.pin !== pin) return { ok:false, erro:'Senha errada.' };
    u.ultimo_acesso = isoDT(new Date()); save();
    return { ok:true, usuario:u };
  }
  function criarPin(cpf, pin){
    cpf = String(cpf||'').replace(/\D/g,''); pin = String(pin||'').replace(/\D/g,'');
    var u = load().usuarios.filter(function(x){ return x.cpf === cpf; })[0];
    if (!u) return { ok:false, erro:'CPF não cadastrado. Peça ao gestor para liberar seu acesso.' };
    if (u.pin) return { ok:false, erro:'Você já tem senha. Entre com ela.' };
    if (pin.length !== 4) return { ok:false, erro:'A senha são 4 números.' };
    u.pin = pin; save(); return login(cpf, pin);
  }
  function solicitarAcesso(dados){
    var db = load(); var cpf = String(dados.cpf||'').replace(/\D/g,'');
    if (db.usuarios.some(function(x){ return x.cpf === cpf; })) return { ok:false, erro:'Este CPF já está cadastrado.' };
    var u = { id:uid('u'), nome:UP(dados.nome), cpf:cpf, pin:String(dados.pin||'').replace(/\D/g,'') || null, papel:'motorista', papel_solicitado: ['frota','admin'].indexOf(dados.papel_solicitado) >= 0 ? dados.papel_solicitado : 'motorista', origem: dados.origem || 'app', status:'pendente', unidade:UP(dados.unidade || UNIDADES[0]), criado_em:isoDT(new Date()), ultimo_acesso:null };
    db.usuarios.push(u); save(); return { ok:true, usuario:u };
  }
  function ativosPara(u){
    var db = load(), lista = db.ativos.filter(function(a){ return a.status === 'ativo'; });
    // o operador habitual aparece primeiro; depois a unidade; depois o resto
    return lista.slice().sort(function(a, b){
      var sa = (a.operador === u.id ? 0 : a.unidade === u.unidade ? 1 : 2), sb = (b.operador === u.id ? 0 : b.unidade === u.unidade ? 1 : 2);
      return sa - sb || nomeAtivo(a).localeCompare(nomeAtivo(b));
    });
  }
  /* último checklist de um ativo e OS abertas dele (para o app avisar) */
  function situacaoAtivo(ativoId){
    var db = load();
    var cks = db.checklists.filter(function(c){ return c.ativo === ativoId; });
    var abertas = db.os.filter(function(o){ return o.ativo === ativoId && o.status !== 'fechada'; }).sort(prioridadeOS);
    return { ultimo: cks.length ? cks[cks.length-1] : null, abertas:abertas, bloqueado: abertas.some(function(o){ return o.bloqueia; }) };
  }
  /* salva checklist vindo do app. resp = { ativo, usuario, leitura, duracao_s,
     itens:[{item, ok:true|false|null, obs, foto(dataURL)}] } */
  function salvarChecklist(resp){
    var db = load(), a = ativo(resp.ativo); if (!a) return { ok:false, erro:'Ativo não encontrado.' };
    var agora = isoDT(new Date());
    var ncs = resp.itens.filter(function(i){ return i.ok === false; }).map(function(i){
      var fid = null;
      if (i.foto && i.foto !== 'demo') { fid = uid('f'); db.fotos[fid] = i.foto; }
      return { item:i.item, obs:UP(i.obs), foto: fid || (i.foto ? 'demo' : null) };
    });
    var ck = { id:uid('ck'), ativo:a.id, modelo: resp.modelo || ('d-' + a.tipo), usuario:resp.usuario, data:agora, leitura:resp.leitura || null,
      itens_total:resp.itens.filter(function(i){ return i.ok !== null; }).length, nc:ncs.length, ncs:ncs, duracao_s:resp.duracao_s || null, origem:'app',
      na: resp.itens.filter(function(i){ return i.ok === null; }).map(function(i){ return i.item; }) };
    if (resp.leitura) a.leitura = resp.leitura;
    db.checklists.push(ck);
    var criadas = [], reinc = [];
    ncs.forEach(function(nc){
      var it = ITEM[nc.item];
      var ab = db.os.filter(function(o){ return o.ativo === a.id && o.item === nc.item && o.status !== 'fechada'; })[0];
      if (ab) { ab.reincidencias++; ab.checklists.push(ck.id); ab.eventos.push({ q:agora, t:'reincidencia', por:resp.usuario, txt:'Reprovado de novo no checklist' }); reinc.push(ab); return; }
      // reincidência "real": OS fechada há menos de 30 dias para o mesmo item
      var recente = db.os.filter(function(o){ return o.ativo === a.id && o.item === nc.item && o.status === 'fechada' && diffH(o.fechada_em, agora) < 720; })[0];
      var os = { id:'OS-' + String(db.os.length + 1).padStart(4,'0'), ativo:a.id, item:nc.item, crit:it.crit, prazo_h:it.prazo, bloqueia:it.bloqueia,
        abertura:agora, limite:limiteDe(agora, it), limite_atual:null, status:'aberta', checklists:[ck.id], checklist:ck.id,
        obs:nc.obs, foto:nc.foto, aberta_por:resp.usuario, reincidencias:0, reprog:[], retorno_de: recente ? recente.id : null,
        eventos:[{ q:agora, t:'aberta', por:resp.usuario }] };
      db.os.push(os); criadas.push(os);
    });
    save();
    return { ok:true, checklist:ck, os_criadas:criadas, os_reincidentes:reinc };
  }
  function osPorId(id){ return load().os.filter(function(o){ return o.id === id; })[0] || null; }
  /* atendimento interno (equipe da Atual) ou externo (oficina/fornecedor) — escolhido ao iniciar (Renan, 11/10/2026) */
  var EXEC = { interna:'INTERNA', externa:'EXTERNA' };
  function osIniciar(id, por, execucao){ var o = osPorId(id); if (!o || o.status === 'fechada') return { ok:false, erro:'OS não está aberta.' }; if (!EXEC[execucao]) return { ok:false, erro:'Escolha se o atendimento é interno ou externo.' }; o.status = 'em_andamento'; o.responsavel = por; o.execucao = execucao; o.eventos.push({ q:isoDT(new Date()), t:'em_andamento', por:por, txt:'ATENDIMENTO ' + UP(EXEC[execucao]) }); save(); return { ok:true, os:o }; }
  function osFechar(id, d){
    var db = load(), o = osPorId(id); if (!o || o.status === 'fechada') return { ok:false, erro:'OS já fechada.' };
    if (!d.foto && !d.solucao) return { ok:false, erro:'Para fechar, anexe a foto da correção ou descreva o que foi feito.' };
    var ex = o.execucao || d.execucao; if (!EXEC[ex]) return { ok:false, erro:'Informe se o atendimento foi interno ou externo.' };
    if (ex === 'externa' && d.fornecedor && !fornecedor(d.fornecedor)) return { ok:false, erro:'Fornecedor não encontrado.' };
    if (ex === 'externa' && d.doc && String(d.doc.data || '').length > 2800000) return { ok:false, erro:'Anexo grande demais (máximo 2 MB).' };
    o.execucao = ex;
    var fid = null; if (d.foto && d.foto !== 'demo') { fid = uid('f'); db.fotos[fid] = d.foto; }
    o.status = 'fechada'; o.fechada_em = isoDT(new Date()); o.fechada_por = d.por; o.solucao = UP(d.solucao); o.custo = (o.execucao !== 'externa' || d.custo === '' || d.custo == null || isNaN(+d.custo)) ? null : +d.custo;   /* custo só no atendimento externo, opcional (Renan, 11/10/2026) */ o.foto_fech = fid || (d.foto ? 'demo' : null);
    o.fornecedor = ex === 'externa' ? (d.fornecedor || null) : null; o.doc = null; o.doc_tipo = null;
    if (ex === 'externa' && d.doc && d.doc.data) { var aid = uid('a'); db.anexos = db.anexos || {}; db.anexos[aid] = { nome:d.doc.nome || 'anexo', mime:d.doc.mime || '', data:d.doc.data }; o.doc = aid; o.doc_tipo = d.doc_tipo === 'orcamento' ? 'orcamento' : 'nf'; }
    o.eventos.push({ q:o.fechada_em, t:'fechada', por:d.por, txt:o.solucao }); save(); return { ok:true, os:o };
  }
  function osReprogramar(id, d){
    var o = osPorId(id); if (!o || o.status === 'fechada') return { ok:false, erro:'OS já fechada.' };
    if (!d.motivo) return { ok:false, erro:'Informe o motivo da reprogramação.' };
    var q = isoDT(new Date()); o.limite_atual = d.novo_limite; o.reprog.push({ q:q, novo_limite:d.novo_limite, motivo:UP(d.motivo), por:d.por });
    o.eventos.push({ q:q, t:'reprogramada', por:d.por, txt:UP(d.motivo) + ' · NOVO PRAZO ' + fmtDH(d.novo_limite) }); save(); return { ok:true, os:o };
  }
  /* ── PREVENTIVO = OS (Renan, 12/10/2026) ──
     item virtual 'prev-<modelo>' representa a preventiva na OS (só em ITEM, nunca em ITENS: não aparece em Itens e SLA) */
  function prevItemId(mid){ return 'prev-' + mid; }
  function ehPrev(o){ return !!o && /^prev-/.test(String(o.item || '')); }
  function garantePrevItens(){
    (load().modelos || []).forEach(function(m){
      if (catDe(m) !== 'preventivo') return;
      var id = prevItemId(m.id), nome = /^PREVENTIV/i.test(m.nome) ? m.nome : 'PREVENTIVA · ' + m.nome;   /* não repete o prefixo */
      if (!ITEM[id]) ITEM[id] = { id:id, cat:'PREVENTIVA', nome:nome, crit:'media', prazo:24, bloqueia:false, ap:[], insp:true, preventiva:true };
      else ITEM[id].nome = nome;
    });
  }
  function proxNumOS(db){ var mx = 0; db.os.forEach(function(o){ var n = parseInt(String(o.id).replace(/\D/g, ''), 10); if (n > mx) mx = n; }); return mx + 1; }
  function preventivaIniciar(d){
    var db = load(), a = ativo(d.ativo), m = modelo(d.modelo);
    if (!a || !m || catDe(m) !== 'preventivo') return { ok:false, erro:'Preventiva não encontrada.' };
    var u = usuario(d.usuario); if (!u || u.papel === 'motorista') return { ok:false, erro:'Só a equipe executa preventivas.' };
    if (db.os.some(function(o){ return o.ativo === a.id && o.item === prevItemId(m.id) && o.status === 'em_andamento'; })) return { ok:false, erro:'Já há uma preventiva em andamento neste ativo.' };
    garantePrevItens(); var q = isoDT(new Date()), ex = EXEC[d.execucao] ? d.execucao : 'interna';
    var o = { id:'OS-' + String(proxNumOS(db)).padStart(4,'0'), ativo:a.id, item:prevItemId(m.id), modelo:m.id, preventiva:true, crit:'media', prazo_h:24, bloqueia:false,
      abertura:q, limite:addH(q, 24), limite_atual:null, status:'em_andamento', checklists:[], checklist:null, obs:'', foto:null, aberta_por:u.id, responsavel:u.id, execucao:ex,
      reincidencias:0, retorno_de:null, reprog:[], eventos:[{ q:q, t:'aberta', por:u.id, txt:'PREVENTIVA INICIADA · ' + m.nome }, { q:q, t:'em_andamento', por:u.id, txt:'ATENDIMENTO ' + UP(EXEC[ex]) }] };
    db.os.push(o); save(); return { ok:true, os:o };
  }
  function preventivaFinalizar(id, d){
    var db = load(), o = osPorId(id); if (!o || !ehPrev(o) || o.status !== 'em_andamento') return { ok:false, erro:'A preventiva não está em andamento.' };
    var a = ativo(o.ativo), q = isoDT(new Date()), tarefas = (d.tarefas || []).map(function(t){ return { item:t.item, feito:!!t.feito }; });
    var feitas = tarefas.filter(function(t){ return t.feito; }).length, pend = tarefas.filter(function(t){ return !t.feito; });
    var ck = { id:uid('ck'), ativo:o.ativo, modelo:o.modelo, usuario:d.usuario, data:q, leitura:d.leitura || null, itens_total:tarefas.length, nc:0, ncs:[], tarefas:tarefas, pend:pend.length, duracao_s:d.duracao_s || null, origem:'preventiva', na:[] };
    if (d.leitura && a) a.leitura = d.leitura;
    db.checklists.push(ck);
    o.status = 'fechada'; o.fechada_em = q; o.fechada_por = d.usuario; o.checklist = ck.id; o.checklists = [ck.id];
    o.solucao = UP(feitas + ' DE ' + tarefas.length + ' TAREFAS FEITAS' + (pend.length ? ' · PENDENTE: ' + pend.map(function(t){ return ITEM[t.item] ? ITEM[t.item].nome : t.item; }).join(', ') : '') + (d.obs ? ' · ' + d.obs : ''));
    o.eventos.push({ q:q, t:'fechada', por:d.usuario, txt:o.solucao }); save();
    return { ok:true, checklist:ck, os:o };
  }
  function osExcluir(id, por, motivo){ var db = load(), o = osPorId(id); if (!o) return { ok:false, erro:'OS não encontrada.' }; var u = usuario(por); if (!u || u.papel !== 'master') return { ok:false, erro:'Só o admin master exclui OS.' }; db.os = db.os.filter(function(x){ return x.id !== id; }); save(); return { ok:true }; }
  function osReabrir(id, por){ var o = osPorId(id); if (!o || o.status !== 'fechada') return { ok:false }; o.status = 'aberta'; o.fechada_em = null; o.eventos.push({ q:isoDT(new Date()), t:'reaberta', por:por }); save(); return { ok:true, os:o }; }
  function foto(ref){ if (!ref) return null; if (ref === 'demo') return 'demo'; return load().fotos[ref] || null; }

  /* unidades (obra / pátio): o gestor cria, renomeia e desativa; vínculo de ativo e usuário é pelo nome */
  function unidades(soAtivas){ var l = load().unidades || []; return soAtivas ? l.filter(function(u){ return u.ativa; }) : l; }
  function nomesUnidades(){ return unidades(true).map(function(u){ return u.nome; }); }
  function unidadeCriar(nome){ var db = load(); nome = UP(nome); if (!nome) return { ok:false, erro:'Informe o nome.' }; if (db.unidades.some(function(u){ return u.nome.toLowerCase() === nome.toLowerCase(); })) return { ok:false, erro:'Já existe uma unidade com esse nome.' }; var u = { id:uid('un'), nome:nome, ativa:true }; db.unidades.push(u); save(); return { ok:true, unidade:u }; }
  function unidadeSet(id, patch){
    var db = load(), u = db.unidades.filter(function(x){ return x.id === id; })[0]; if (!u) return { ok:false, erro:'Unidade não encontrada.' };
    if (patch.nome != null) { var novo = UP(patch.nome); if (!novo) return { ok:false, erro:'Informe o nome.' };
      if (db.unidades.some(function(x){ return x.id !== id && x.nome.toLowerCase() === novo.toLowerCase(); })) return { ok:false, erro:'Já existe uma unidade com esse nome.' };
      db.ativos.forEach(function(a){ if (a.unidade === u.nome) a.unidade = novo; }); db.usuarios.forEach(function(x){ if (x.unidade === u.nome) x.unidade = novo; }); u.nome = novo; }
    if (patch.ativa != null) u.ativa = !!patch.ativa;
    save(); return { ok:true, unidade:u };
  }

  /* ── PARÂMETROS: metas e faixas dos indicadores (Renan, 11/10/2026: "um local para o usuário definir os parâmetros")
     verde = meta (alvo); amarelo = limite de atenção. Maior é melhor em todos os percentuais.
     MTTR e MTBF: meta em horas/dias (MTTR menor é melhor; MTBF maior é melhor). Na produção, cada alteração vai para a auditoria. */
  var METAS_PADRAO = {
    conformidade: { verde:90, amarelo:80 },        // % itens conformes: >90 verde, 80–90 amarelo, <80 vermelho
    sla:          { verde:85, amarelo:70 },        // % OS fechadas no prazo
    inspecoes:    { verde:85, amarelo:70 },        // % ativos com a inspeção em dia
    mttr_h:       72,                              // meta de tempo médio de reparo (horas)
    mtbf_d:       7                                // meta de tempo médio entre falhas (dias)
  };
  function metas(){ var c = load().config || {}; var m = JSON.parse(JSON.stringify(METAS_PADRAO)), u = c.metas || {};
    Object.keys(u).forEach(function(k){ m[k] = (typeof u[k] === 'object') ? Object.assign({}, m[k], u[k]) : u[k]; }); return m; }
  function metasSet(patch, por){
    var db = load(); db.config = db.config || {}; var m = metas();
    Object.keys(patch || {}).forEach(function(k){ if (!(k in METAS_PADRAO)) return; m[k] = (typeof METAS_PADRAO[k] === 'object') ? Object.assign({}, m[k], patch[k]) : +patch[k]; });
    var erro = null;
    ['conformidade','sla','inspecoes'].forEach(function(k){ var f = m[k]; if (!(f.verde > 0 && f.verde <= 100 && f.amarelo >= 0 && f.amarelo < f.verde)) erro = 'Em ' + k + ': o amarelo precisa ser menor que o verde, entre 0 e 100.'; });
    if (!(m.mttr_h > 0)) erro = 'A meta de MTTR precisa ser maior que zero.'; if (!(m.mtbf_d > 0)) erro = 'A meta de MTBF precisa ser maior que zero.';
    if (erro) return { ok:false, erro:erro };
    db.config.metas = m; db.config.metas_log = (db.config.metas_log || []).concat([{ q:isoDT(new Date()), por:por || null, metas:m }]); save();
    return { ok:true, metas:m };
  }
  function faixa(k, v){ var f = metas()[k]; if (v == null || !f) return null; return v >= f.verde ? 'verde' : v >= f.amarelo ? 'amarelo' : 'vermelho'; }

  /* usuários / acessos (portal) */
  function usuarioSet(id, patch){ var u = usuario(id); if (!u) return { ok:false }; Object.assign(u, upObj(patch, UP_USR)); save(); return { ok:true, usuario:u }; }
  function usuarioCriar(d){ var db = load(); var cpf = String(d.cpf||'').replace(/\D/g,''); if (db.usuarios.some(function(x){ return x.cpf === cpf; })) return { ok:false, erro:'CPF já cadastrado.' }; var u = { id:uid('u'), nome:UP(d.nome), cpf:cpf, pin:null, papel:d.papel || 'motorista', status:d.status === 'bloqueado' ? 'bloqueado' : 'ativo', unidade:UP(d.unidade || UNIDADES[0]), especialidade:UP(d.especialidade), telefone:String(d.telefone || '').trim(), criado_em:isoDT(new Date()), ultimo_acesso:null }; db.usuarios.push(u); save(); return { ok:true, usuario:u }; }
  function ativoSet(id, patch){ var a = ativo(id); if (!a) return { ok:false }; Object.assign(a, upObj(patch, UP_ATIVO)); save(); return { ok:true, ativo:a }; }
  function ativoCriar(d){ var db = load(); if (db.ativos.some(function(x){ return x.id === d.id; })) return { ok:false, erro:'Já existe um ativo com este código.' }; var t = TIPO[d.tipo] || TIPOS[0]; var a = { id:d.id, tipo:t.id, placa:/^\d+$/.test(d.id) ? null : d.id, frota:/^\d+$/.test(d.id) ? d.id : null, marca:UP(d.marca), modelo:UP(d.modelo), ano:+d.ano||null, prop:d.prop?UP(d.prop):null, unidade:UP(d.unidade||UNIDADES[0]), status:'ativo', medidor:t.medidor, leitura:+d.leitura||0, operador:d.operador||null, risco:.04 }; db.ativos.push(a); save(); return { ok:true, ativo:a }; }
  function itemSet(id, patch){ var it = ITEM[id]; if (!it) return { ok:false }; if (patch.nome) patch.nome = String(patch.nome).trim().toUpperCase(); var db = load(); db.itens_cfg = db.itens_cfg || {}; db.itens_cfg[id] = Object.assign(db.itens_cfg[id] || {}, patch); Object.assign(it, patch); save(); return { ok:true, item:it }; }
  function aplicarCfgItens(){ if (REMOTO) return; var db = load(); if (db.itens_cfg) Object.keys(db.itens_cfg).forEach(function(k){ if (ITEM[k]) Object.assign(ITEM[k], db.itens_cfg[k]); }); }

  /* ──────────────────────────────────────────────────────────
     7. COBRANÇA — usuários ativos no mês × tabela da proposta
     usuário "ativo no mês" = fez login ou checklist no mês (motorista, frota ou admin da Atual; o master não conta)
     ────────────────────────────────────────────────────────── */
  function usuariosAtivosNoMes(mk){
    var db = load(), set = {};
    db.checklists.forEach(function(c){ if (mesKey(c.data) === mk) set[c.usuario] = 1; });
    db.usuarios.forEach(function(u){ if (u.papel !== 'master' && u.status === 'ativo' && u.ultimo_acesso && mesKey(u.ultimo_acesso) === mk) set[u.id] = 1; });
    delete set['u0'];
    return Object.keys(set).map(usuario).filter(Boolean);
  }
  function fatura(mk){
    var db = load(), cfg = db.config, us = usuariosAtivosNoMes(mk);
    var exced = Math.max(0, us.length - cfg.inclusos), p = mk.split('-');
    var venc = new Date(+p[0], +p[1], cfg.vencimento_dia);   // mês seguinte ao de referência
    var total = cfg.valor_base + exced * cfg.valor_usuario;
    var primeira = mk === mesesCobranca()[0];
    if (primeira) total += cfg.implantacao;
    return { mes:mk, mes_nome:mesNome(mk), usuarios:us, qtd:us.length, inclusos:cfg.inclusos, excedente:exced, valor_base:cfg.valor_base,
      valor_excedente: exced * cfg.valor_usuario, implantacao: primeira ? cfg.implantacao : 0, total:total, vencimento:iso(venc),
      numero: 'FAT-' + p[0] + p[1] + '-ATUAL', txid: ('ATUAL' + p[0] + p[1]).slice(0,25), status: parse(iso(venc)) < HOJE ? 'paga' : 'em aberto' };
  }
  function mesesCobranca(){ var db = load(), set = {}; db.checklists.forEach(function(c){ set[mesKey(c.data)] = 1; }); return Object.keys(set).sort(); }

  /* ──────────────────────────────────────────────────────────
     8. PIX — BR Code estático (padrão EMV do Banco Central). Não expira.
     ────────────────────────────────────────────────────────── */
  function crc16(s){ var crc = 0xFFFF; for (var i = 0; i < s.length; i++) { crc ^= s.charCodeAt(i) << 8; for (var j = 0; j < 8; j++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF; } return crc.toString(16).toUpperCase().padStart(4,'0'); }
  function emv(id, v){ v = String(v); return id + String(v.length).padStart(2,'0') + v; }
  function semAcento(s){ return String(s).normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9 .-]/g,' ').replace(/\s+/g,' ').trim(); }
  function pixPayload(o){
    var nome = semAcento(o.nome || 'RECEBEDOR').toUpperCase().slice(0,25), cid = semAcento(o.cidade || 'BRASIL').toUpperCase().slice(0,15);
    var txid = (o.txid || '***').replace(/[^A-Za-z0-9]/g,'').slice(0,25) || '***';
    var p = emv('00','01') + emv('26', emv('00','BR.GOV.BCB.PIX') + emv('01', o.chave) + (o.descricao ? emv('02', semAcento(o.descricao).slice(0, 40)) : ''))
      + emv('52','0000') + emv('53','986') + (o.valor ? emv('54', (+o.valor).toFixed(2)) : '') + emv('58','BR') + emv('59', nome) + emv('60', cid)
      + emv('62', emv('05', txid)) + '6304';
    return p + crc16(p);
  }

  /* ──────────────────────────────────────────────────────────
     9. ÍCONES (SVG de linha, currentColor) — sem emoji na UI
     ────────────────────────────────────────────────────────── */
  var I = function(d){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>'; };
  var ICONES = {
    truck:   I('<rect x="1" y="5" width="14" height="11" rx="1.5"/><path d="M15 9h4l3 3v4h-7z"/><circle cx="5.5" cy="18.5" r="2"/><circle cx="18.5" cy="18.5" r="2"/>'),
    car:     I('<path d="M3 13l2-5a2 2 0 0 1 1.9-1.3h10.2A2 2 0 0 1 19 8l2 5v5H3z"/><circle cx="7" cy="16" r="1.5"/><circle cx="17" cy="16" r="1.5"/>'),
    trailer: I('<rect x="2" y="6" width="17" height="9" rx="1"/><path d="M19 12h3"/><circle cx="7" cy="18" r="2"/><circle cx="13" cy="18" r="2"/>'),
    machine: I('<path d="M3 17h10v-5H7l-2 2v3z"/><path d="M13 12l3-7h2l1 4 3 1v7h-9"/><circle cx="6" cy="20" r="1.5"/><circle cx="16" cy="20" r="1.5"/>'),
    roller:  I('<circle cx="7" cy="15" r="4"/><path d="M11 15h8v-5h-5l-3 5"/><path d="M14 10V6h3"/>'),
    tool:    I('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>'),
    check:   I('<path d="M20 6L9 17l-5-5"/>'),
    x:       I('<path d="M18 6L6 18M6 6l12 12"/>'),
    camera:  I('<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>'),
    alert:   I('<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'),
    clock:   I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    list:    I('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>'),
    home:    I('<path d="M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z"/>'),
    history: I('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>'),
    wrench:  I('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>'),
    user:    I('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
    users:   I('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
    qr:      I('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM20 14h1M14 20h1M20 20h1M17 17h4"/>'),
    search:  I('<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/>'),
    chart:   I('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    bill:    I('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>'),
    settings:I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
    block:   I('<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>'),
    gauge:   I('<path d="M4 16a8 8 0 1 1 16 0"/><path d="M12 16l4-5"/>'),
    sun:     I('<circle cx="12" cy="12" r="4.5"/><path d="M12 1.5v2M12 20.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1.5 12h2M20.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>'),
    moon:    I('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'),
    logout:  I('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>'),
    plus:    I('<path d="M12 5v14M5 12h14"/>'),
    back:    I('<path d="M19 12H5M12 19l-7-7 7-7"/>'),
    flag:    I('<path d="M4 22V4a1 1 0 0 1 1-1h11l-1.5 4L16 11H5"/>'),
    image:   I('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>'),
    calendar:I('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
    refresh: I('<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>')
  };
  /* foto de demonstração: um SVG neutro com o nome do item (não é foto real) */
  function fotoDemo(txt, cor){
    var t = semAcento(txt || 'Foto');
    return 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a3340"/><stop offset="1" stop-color="#121820"/></linearGradient></defs><rect width="640" height="420" fill="url(#g)"/><rect x="40" y="300" width="560" height="80" rx="8" fill="#1a2230" stroke="' + (cor||'#0E8BC8') + '" stroke-width="2"/><text x="60" y="335" font-family="Arial" font-size="20" fill="#E8ECF1">' + t + '</text><text x="60" y="362" font-family="Arial" font-size="14" fill="#8B94A6">foto de demonstracao · substituida pela camera no app</text><circle cx="320" cy="160" r="60" fill="none" stroke="' + (cor||'#0E8BC8') + '" stroke-width="6"/><path d="M290 160l20 20 40-40" fill="none" stroke="' + (cor||'#0E8BC8') + '" stroke-width="6"/></svg>');
  }

  return {
    REMOTO:REMOTO, PIN_LEN:PIN_LEN, setDB:setDB, setCatalogo:setCatalogo,
    TIPOS:TIPOS, TIPO:TIPO, ITENS:ITENS, ITEM:ITEM, CRIT:CRIT, PAPEL:PAPEL, UNIDADES:UNIDADES, ICONES:ICONES, MESES:MESES, MESES_N:MESES_N,
    load:load, save:save, reset:reset, recarregar:recarregar, aplicarCfgItens:aplicarCfgItens, EXEC:EXEC, CATCK:CATCK, catDe:catDe, fornecedores:fornecedores, fornecedor:fornecedor, fornecedorCriar:fornecedorCriar, fornecedorSet:fornecedorSet, anexo:anexo, itemCriar:itemCriar,
    modeloDoTipo:modeloDoTipo, itemAplica:itemAplica, itensDoAtivo:itensDoAtivo, ativoItensFora:ativoItensFora,
    FREQ:FREQ, modelos:modelos, modelo:modelo, diarioAtivo:diarioAtivo, itensDoModelo:itensDoModelo, modeloCriar:modeloCriar, modeloSet:modeloSet, diarioItensSet:diarioItensSet, inspecoesPara:inspecoesPara,
    modeloCsvTemplate:modeloCsvTemplate, lerCsvModelo:lerCsvModelo,
    usuario:usuario, ativo:ativo, login:login, criarPin:criarPin, solicitarAcesso:solicitarAcesso, ativosPara:ativosPara, situacaoAtivo:situacaoAtivo,
    preventivaIniciar:preventivaIniciar, preventivaFinalizar:preventivaFinalizar, prevItemId:prevItemId, ehPrev:ehPrev, garantePrevItens:garantePrevItens,
    salvarChecklist:salvarChecklist, osPorId:osPorId, osIniciar:osIniciar, osFechar:osFechar, osReprogramar:osReprogramar, osReabrir:osReabrir, osExcluir:osExcluir, foto:foto, fotoDemo:fotoDemo,
    usuarioSet:usuarioSet, usuarioCriar:usuarioCriar, ativoSet:ativoSet, ativoCriar:ativoCriar, itemSet:itemSet,
    metas:metas, metasSet:metasSet, faixa:faixa, METAS_PADRAO:METAS_PADRAO,
    unidades:unidades, nomesUnidades:nomesUnidades, unidadeCriar:unidadeCriar, unidadeSet:unidadeSet,
    slaDe:slaDe, prioridadeOS:prioridadeOS, limiteDe:limiteDe,
    usuariosAtivosNoMes:usuariosAtivosNoMes, fatura:fatura, mesesCobranca:mesesCobranca, pixPayload:pixPayload, crc16:crc16,
    iso:iso, isoDT:isoDT, parse:parse, addH:addH, diffH:diffH, fmtData:fmtData, fmtDataCurta:fmtDataCurta, fmtHora:fmtHora, fmtDH:fmtDH, mesKey:mesKey, mesLabel:mesLabel, mesNome:mesNome,
    prazoTxt:prazoTxt, brl:brl, cpfFmt:cpfFmt, nomeAtivo:nomeAtivo, uid:uid, HOJE:HOJE
  };
})();
