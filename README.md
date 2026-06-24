# Shalom WMS — servidor + frontend

Gestão de estoque do Centro de Distribuição com **login**, dados salvos em **servidor** (PostgreSQL no Render) e histórico de inventários, entradas de XML e baixas.

## O que está incluso
- `server.js` — servidor Node/Express: login (usuário/senha), API de dados e entrega do app.
- `public/index.html` — o aplicativo (contagem, estoque, entrada XML, baixa, almoxarifado, cadastro, salvos).
- `render.yaml` — receita do Render: cria o site **e** um PostgreSQL automaticamente.
- `package.json`, `.gitignore`, `.env.example`.

Os dados ficam **compartilhados pela empresa** (todos os usuários veem o mesmo estoque). Cada inventário finalizado, cada entrada de XML e cada baixa ficam salvos no servidor.

---

## Publicar no Render (recomendado)

1. **Suba estes arquivos no seu Git** (GitHub/GitLab). Não suba a pasta `node_modules` nem `data/` (o `.gitignore` já cuida disso).
2. No **Render** → **New +** → **Blueprint**.
3. Conecte o repositório. O Render lê o `render.yaml` e cria **dois** recursos: o site (web service) e o banco **shalom-wms-db** (PostgreSQL grátis).
4. Em **Environment** do web service, defina:
   - `ADMIN_PASS` → a senha do usuário **admin** (obrigatório).
   - `USERS` *(opcional)* → outros usuários, ex.: `cristiano:senha1,joao:senha2`.
   - `JWT_SECRET` e `DATABASE_URL` já são preenchidos automaticamente.
5. Clique em **Apply / Deploy** e aguarde ficar **Live**.
6. Acesse a URL do Render e faça login com **admin** e a senha que você definiu.

> Na primeira vez que o app abrir, ele carrega sozinho a base de produtos e o saldo atual no servidor.

### Adicionar/!trocar usuários depois
- Edite a variável `USERS` no painel do Render e faça **Manual Deploy** (ou apenas salve — o Render reinicia). Novos usuários são criados no próximo start. Para trocar a senha de alguém já existente, mude o valor e reinicie.

---

## Rodar local (teste no seu PC)

```bash
npm install
# senha padrão do admin é "shalom123" se você não definir ADMIN_PASS
npm start
# abra http://localhost:3000
```

Sem `DATABASE_URL`, os dados ficam num arquivo local `data/store.json` (bom para testar). No Render, com o PostgreSQL, ficam no banco.

---

## Observações
- **Não abra o `index.html` direto no navegador** (clicando no arquivo). Ele precisa do servidor para login e dados — rode via `npm start` ou pelo Render.
- O plano grátis do Render hiberna após inatividade; a primeira abertura do dia pode levar alguns segundos.
- Segurança: troque a `ADMIN_PASS` para algo forte. O `JWT_SECRET` é gerado automaticamente pelo Render.
- Escala: os dados são guardados como blocos por chave (last-write-wins). Para a operação do CD com poucos operadores simultâneos, funciona bem.
