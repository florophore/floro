# Floro (CLI & Daemon)

<img width="300" src="./docs/images/floro_blink_text.png">

### Floro Desktop Client & Host

For code related to the UI clients & remote host please go to <a href="https://github.com/florophore/floro-mono">this repository</a>.

### Documentation References
<b>Please <a href="https://floro.io/docs">read the product & development docs here before getting started</a>.</b>

<b>Please <a href="https://floro.io/oss">read the OSS guide here</a>.</b>

### Setting up the development environment

Floro cli & daemon development has NOT been tested on windows.

run `yarn install`

### Global Link

build project first `yarn build`

then from project root `npm link`

confirm with `floro --help`

### Global Un-Link

to unlink do `npm unlink -g floro`

### For Daemon Development

run `yarn dev`

entry is `src/server.ts`

### CLI Development

run `yarn dev:command`

entry is `src/command.ts`

### For Tests

run `yarn test`


### Getting started with CLI

see `command.ts`

### Floro runs on the following
```bash
http://127.0.0.1:63403 # General Daemon Server
http://0.0.0.0:63404 # TLS Cert Server
https://0.0.0.0:63405 # Only Websocket

```