# 💬 ZapFamily — Rede Social estilo WhatsApp

## 🖥️ VERSÃO .EXE PARA WINDOWS
O arquivo **`release/ZapFamily.exe`** (~110MB) é o app pronto para Windows 10/11 (64-bit):
- **Não precisa instalar nada**: dê dois cliques e o app abre com janela própria
- Funciona **offline** (tudo fica salvo no seu PC; suas contas do ZapFamily antigo foram mantidas automaticamente)
- Tem **tudo**: contas, amizades, grupos, chat, chamadas, status, enquetes, figurinhas, temas
- Menu no topo: 🌐 **Abrir no navegador (para usar uma 2ª conta)**, 📋 copiar endereço, 🔗 conectar a um servidor, 🏠 voltar ao local, 📱 endereço para o celular, 🔄 recarregar, ℹ️ sobre
- ⚠️ Na primeira vez, o Windows pode mostrar "fonte desconhecida" (o app não tem certificado pago) — clique em **"Mais informações" → "Executar assim mesmo"**

> ⚠️ **PADRÃO: O .exe e a versão web são MUNDOS SEPARADOS** (cada um com seu banco). Para conversar, as 2 pessoas precisam estar no MESMO mundo:
> - **No .exe**: janela do app (conta 1) + menu 🌐 "Abrir no navegador" (conta 2)
> - **Na web**: aba normal (conta 1) + janela anônima Ctrl+Shift+N (conta 2)
> - **Quer juntar os mundos?** Veja "UM MUNDO SÓ" abaixo 👇

## O que tem (web + .exe)
- 👤 **Contas e perfis** — cadastro com nome, @usuário, senha, bio, avatar, cor e **foto do computador**
- ⛔ **Nomes únicos** — ninguém pode criar conta com nome ou @usuário que já exista (aviso em tempo real ✅/⛔)
- 🔐 **Login / logout** com senha criptografada + troca de senha
- ⚙️ **Perfil editável** + estatísticas (amigos, grupos, enviadas, recebidas)
- 🔍 **Busca exata** — digite o nome ou @usuário certinho na lupa (sem lista geral, sem aba Encontrar)
- 🤝 **Amizades** — enviar pedido, aceitar/recusar, cancelar, remover amigo
- 👥 **Grupos** — criar grupo com foto, adicionar/remover membros, admins, sair, apagar grupo
- 💬 **Chat em tempo real** (1-a-1 e grupos) — texto, **fotos** 📷, "digitando…", ✓/✓✓, não-lidas
- ❤️ **Reações** + 🗑️ **apagar para mim ou todos** (sem rastro) + ✐️ **editar** (15 min)
- 👆 **Selecionar mensagens**: segure uma mensagem → barra verde no topo com responder/copiar/encaminhar/fixar/apagar (várias de uma vez, estilo WhatsApp)
- 🖼️ Clique na foto para **ampliar** • 🟢 **Status online** • 🎨 **Temas** • 📱 **Responsivo**
- 🔄 **Atualização automática**: confere pedidos/mensagens a cada 5 segundos (mesmo se o tempo real falhar) + 🔔 som de notificação + contador na aba + botão 🔄 e bolinha de conexão 🟢🟡🔴
- 🔑 **Login persistente**: continua logado mesmo se o servidor reiniciar
- 🏷️ **Tópicos personalizados**: crie listas (Família, Trabalho...) + filtro 📩 Não lidos
- ✏️ **Apelidos**: nome personalizado por amigo (só você vê)
- ⬆️⬇️ **Cargos no grupo**: promover/rebaixar admins (sempre mantém 1 admin)
- ⭐ **Figurinhas**: crie de qualquer foto, envie e salve as recebidas
- 🖌️ **Estúdio de figurinhas**: corte, remover fundo 🪄, filtros 🌈, desenho ✏️, texto 🔤, contorno ⭕, espelhar/virar/girar
- 📎 **Anexos**: fotos, vídeos 🎬, áudios 🎵 e arquivos de qualquer tipo (PDF, docs...) até ~9MB
- 🎤 **Mensagens de voz**: grave com o microfone, ouça antes e envie
- 📞📹 **Chamadas 1-a-1**: voz e vídeo com câmera, mudo e 🖥️ compartilhar tela (registro fica no chat)
- 🎨 **Temas**: 6 prontos + editor profissional (cores, cantos, fonte) + salvar/exportar/importar
- ↩️ **Responder**: cite qualquer mensagem; clique na citação para pular até a original
- ➡️ **Encaminhar**: mande qualquer mensagem para outra conversa ou grupo (marcada como encaminhada)
- 📌 **Fixar**: fixe um recado por conversa/grupo, com barra no topo (atualiza ao vivo)
- 🗑️ **Apagar para mim ou todos**: suas mensagens perguntam o destino; dos outros, somem só para você (sem rastro de "mensagem apagada")
- ⛔ **Bloquear**: no perfil da pessoa (ℹ️); bloqueados não mandam mensagem, não ligam nem aparecem na busca (selo ⛔ na lista)
- 🔇 **Silenciar** conversas e grupos (perfil da pessoa ou info do grupo)
- 📊 **Enquetes**: crie votações no chat ou grupo (anexo 📎), vote e veja % ao vivo
- ⭕ **Status 24h**: foto, vídeo ou texto que some em 24h, com visualizações e respostas
- 🖼️ **Papel de parede**: foto de fundo com opacidade, desfoque, cor de tinta e ajuste
- 📱 **Ícone + nome do app trocáveis**: 4 ícones, envie o seu, mude o título da janela
- 🎲 **Temas**: modo fácil (6 cores) + avançado (16 cores) + 5 fontes + tema surpresa + restaurar
- 🪟 **Tema secreto Windows 98** — MISSÃO: pesquise **1998** na lupa e dê Enter... 😎 Só as cores podem mudar, sem papel de parede, fonte retrô automática
- 📺 **Filtro TV de tubo** — scanlines + vinheta + chiado visual em QUALQUER tema (liga nos Temas)
- 📱 **App Android** — `release/ZapFamily.apk`: mesmo servidor do .exe, câmera/mic/fotos funcionando

## 🌐 UM MUNDO SÓ: web + app juntos
Por padrão o .exe usa um servidor só dele. Para o **app e a web verem as mesmas contas e conversas**:

1. **Coloque o servidor na internet** (ex: Render.com — grátis): crie um Web Service com este projeto, comando de build `npm install` e comando de start `npm start` (a porta vai pela variável `PORT` automaticamente). Anote a URL, ex: `https://meu-zap.onrender.com`
2. **No .exe**: menu ZapFamily → **🔗 Conectar a um servidor...** → cole a URL → Conectar. Pronto: o título ganha um 🌐 e tudo passa a ser o mesmo mundo da web!
3. **Na web**: abra a mesma URL no navegador e entre com sua conta.
4. Para desfazer: menu → **🏠 Voltar ao servidor local**.

⚠️ Dicas: servidores gratuitos "dormem" — a primeira conexão pode demorar ~1 min (espere e tente de novo); os dados ficam salvos **no servidor**, então use um serviço confiável; se o servidor cair, o app oferece voltar ao modo local.

## 📱 APP ANDROID (APK)
O arquivo **`release/ZapFamily.apk`** (~260KB) é o ZapFamily para celular (Android 7+). Ele **usa o MESMO servidor do .exe** — mesmas contas, mesmas conversas:

### Usando com o .exe (mesmo Wi-Fi)
1. Abra o **ZapFamily.exe** no PC (conectado no Wi-Fi)
2. No PC: menu ZapFamily → **📱 Endereço para o celular** → o endereço é copiado (ex: `http://192.168.0.10:3000`)
3. No celular: instale o APK (permita "instalar de fontes desconhecidas" uma vez) e abra
4. Cole o endereço na primeira tela → **Conectar** → entre com sua conta. Pronto! 🎉

### Usando com servidor na internet
- Na primeira tela (ou menu ⋮ → **🔗 Servidor**), cole a URL do servidor (ex: `https://meu-zap.onrender.com`) → Conectar.

### Detalhes
- O app pede acesso a **câmera, microfone e arquivos** (chamadas de vídeo, áudios e fotos) e guarda o servidor nas configurações.
- Para trocar de servidor depois: menu ⋮ → **🔗 Servidor**.
- Se instalou um APK anterior, **desinstale antes** de instalar o novo (a assinatura mudou; daqui pra frente as atualizações instalam por cima).
- Recompilar: pasta `android/` (projeto Gradle nativo, sem dependências) — `gradle assembleRelease` com JDK 17 + SDK 34; o APK assinado sai em `app/build/outputs/apk/release/`. Assinatura: `android/keystore/zapfamily.keystore` (senha em `keystore.properties`).

## 🚀 MODO AUTOMÁTICO: instalar e usar, sem configurar
Para o APK e o .exe funcionarem **sem digitar nada** (mesmo do outro lado do mundo 🌍), o servidor precisa estar na internet. Isso se faz **UMA vez só**:

### Passo 1 — baixe o pacote do servidor
- Baixe o arquivo **`zapfamily-deploy.zip`** (está na pasta do projeto) e extraia.

### Passo 2 — coloque no GitHub (grátis)
1. Crie conta em github.com (se não tem)
2. **New repository** → nome `zapfamily` → **Create repository**
3. Clique em **uploading an existing file** → arraste TODOS os arquivos extraídos → **Commit changes**

### Passo 3 — publique grátis no Render
1. Crie conta em render.com (pode entrar com o GitHub)
2. **New** → **Blueprint** → conecte o repositório `zapfamily` → **Apply**
3. Aguarde ~5 min → anote a URL (ex: `https://zapfamily.onrender.com`)

### Passo 4 — PRONTO! 🎉
- Servidor oficial: **https://zapfamily.onrender.com** — já gravado dentro do APK e do .exe!
- **Quem instalar, entra direto no mesmo mundo. Zero configuração.** 🌍

⚠️ O plano grátis "dorme" quando ninguém usa — a primeira abertura do dia pode demorar ~1 min. Depois fica rápido.

## Como usar a versão web
Abra a pré-visualização **"ZapFamily"** (porta 3000).

1. Clique em **Criar conta** e escolha uma foto 📷
2. Para testar com 2 pessoas: abra em **2 abas** (ou **janela anônima** Ctrl+Shift+N) e crie **2 contas**
3. Conta 1: digite o nome exato da Conta 2 na **🔍 busca** → **＋** → Conta 2: 📩 **Pedidos** → ✔ → conversem! 🎉
4. 📞 **Chamadas**: abra a conversa e toque em 📞 (voz) ou 📹 (vídeo) — permita microfone/câmera quando pedir
5. 🖌️ **Figurinhas**: no chat, ⭐ → **criar** (edita antes de salvar) ou ✏️ numa figurinha pronta para editar
6. 🎨 **Temas**: botão 🎨 no topo para trocar o visual ou criar o seu no editor

## Estrutura
```
zapsocial/
├── server.js          → servidor (Express + Socket.io + sessões)
├── data.json          → banco de dados (web)
├── electron/main.js   → janela do app desktop
├── assets/            → ícones do app (png + ico)
├── scripts/inject-icon.js → coloca o ícone no .exe (sem wine)
├── release/ZapFamily.exe  → ⭐ O APP PRONTO PARA WINDOWS
├── public/            → interface (html + css + js)
└── package.json
```

## Para rodar a web de novo
```bash
cd ~/zapsocial
npm install --no-audit --no-fund   # só se der erro de módulo
npm start
```

## Para gerar o .exe de novo (após mudar o código)
```bash
cd ~/zapsocial
npm install --no-audit --no-fund
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install -D electron-builder electron resedit
npm run exe
node scripts/inject-icon.js release/ZapFamily.exe assets/icon.ico
rm -rf release/win-unpacked
```
> Se der erro de memória no empacotamento, limite o 7-Zip (1 thread, compressão leve) antes de rodar.

Feito com 💚 — bom uso!
