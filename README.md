# Stark Tube v4.0.0

[![Release](https://img.shields.io/badge/release-4.0.0-success?style=for-the-badge)](https://github.com/davicardoso5524/yt-download/releases)

## Baixar Agora

[![Download Stark Tube](https://img.shields.io/badge/Download-Stark%20Tube%204.0.0-red?style=for-the-badge&logo=windows)](https://github.com/davicardoso5524/yt-download/releases)

Aplicativo desktop para baixar videos e playlists do YouTube com interface moderna em React + Vite e backend local com Tauri (Rust).

## Recursos

- Download de video com selecao de formato/qualidade
- Download de playlist com fila, retry e skip
- Historico local de downloads
- Configuracoes persistentes no app
- Validacao de licenca local (offline) por assinatura

## Stack

- Frontend: React 19 + TypeScript + Vite
- Desktop: Tauri v2
- Backend local: Rust

## Requisitos

- Node.js 20+
- Rust (toolchain estavel)
- Dependencias de build do Tauri para Windows

## Desenvolvimento

```bash
npm install
npm run tauri dev
```

## Build Web

```bash
npm run build
```

## Build Desktop e Instalador

```bash
npm run tauri build
```

O instalador e os binarios sao gerados em `src-tauri/target/release/bundle/`.

## Licenciamento Local

- O app gera um `machineCode` local
- A key e validada offline com assinatura Ed25519
- Nao ha validacao remota obrigatoria no fluxo de login

## Versao

- Versao atual: `2.0.0`

## Download

- Instalador Windows (.exe): [Pagina de releases](https://github.com/davicardoso5524/yt-download/releases)
