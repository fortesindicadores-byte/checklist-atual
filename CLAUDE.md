# Checklist Atual · regras para o Claude

## SQL: sempre colar no chat
Toda mudança de banco (arquivo novo em `supabase/migracoes/` ou alteração em `supabase/schema.sql` / `supabase/rpc.sql`)
vai COMPLETA no chat, num bloco ```sql, pronta para colar no SQL Editor do Supabase. Nunca só citar o caminho do arquivo.
Dizer junto se é obrigatório rodar e o que deixa de funcionar sem ele.

## Publicação
- `main` publica direto no GitHub Pages (checklist-atual.onespot.com.br). Mudança pronta e testada vai para a `main`.
- A cada publicação, subir a versão do cache em `sw.js` (`ck-atual-vNNN`).
- Commits em português: título curto + lista com a regra de negócio e o SQL afetado.

## Estrutura
- `index.html` app do motorista e da equipe (PWA) · `gestao/index.html` portal do gestor
- `shared/core.js` regras e banco da demo (localStorage) · `shared/remote.js` troca as escritas por RPCs do Supabase fora do localhost
- `supabase/schema.sql` e `supabase/rpc.sql` são a fonte do banco; migrações datadas em `supabase/migracoes/`
