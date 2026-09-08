# dsh-skill-button

**English** | [中文](./README.zh-CN.md)

[![License](https://img.shields.io/badge/license-BSD--3--Clause-blue.svg)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/qwd9991/dsh-skill-button/ci.yml?branch=main)](https://github.com/qwd9991/dsh-skill-button/actions)
![Node](https://img.shields.io/badge/node-%3E%3D20-green.svg)

**DSH Input Box Multi-Select Skill Button Plugin** — a browser client panel that
lets you select multiple agent skills and insert them into the DSH composer,
plus smart translation of skill names/descriptions.

This is a plugin for [DeepSeek DSH](https://github.com/deepseek-ai) hosts. It
requires a running DSH host; it is **not** a standalone application.

## Features

- Injects a skill button into the DSH input box (`conversation.input.left` slot).
- Lists installed skills from the host (`remote.skills.list`) with live refresh.
- Multi-select and bulk-insert as `/skill-name /skill-name …`, skipping skills
  already present in the composer.
- Search, favorites (persisted in `localStorage`), and "already selected" tagging.
- Optional Chinese translation of skill names/descriptions:
  1. host model endpoint (`POST /skill-button/api/translate`, uses the model
     selected in Settings / composer seat),
  2. offline rule dictionary (kebab-case word → zh-CN),
  3. free [MyMemory API](https://mymemory.translated.net) fallback (only when
     translation is enabled and the host model is unavailable).

## Requirements

- Node.js >= 20 (`.nvmrc`).
- A DSH host that exposes `llm`, `agentDefaultModel`, `webServer`, and the
  client side `slots` / `remote.skills` / `sessions` services.
- Peer packages (`@deepseek-ai/dsh-llm`, `@deepseek-ai/dsh-tools`,
  `@deepseek-ai/dsh-client-ui-slots`, `cordis`, `schemastery`) are mirrored in
  `devDependencies` for development; all of them are published on the public
  npm registry.

## Install (as a DSH plugin)

Build the plugin, then inject the directory into your DSH host:

```bash
npm ci
npm run build
# then inject/compose this directory via your DSH host's plugin loader
```

For DSH monorepo compatibility (building against a local dsh checkout with a
matching TypeScript version), use:

```bash
DSH_CHECKOUT=<path-to-dsh-checkout> bash scripts/build.sh
```

## Development

```bash
npm ci
npm run typecheck   # strict TS check against public npm packages
npm run build       # tsc (src → lib/) + tsdown client bundle
npm run check:public # fail if host-only paths/credentials sneak into src or scripts
```

## Privacy

When the translation toggle is **on**, skill names and descriptions of
uncached skills are sent to the host's configured model. If the host model is
unavailable, descriptions may be sent to the third-party free translation
service `api.mymemory.translated.net` (which retains logs for a limited time).
Translation is **off** by default; there is no third-party call unless you
enable it. Client state (favorites, translation cache) stays in `localStorage`.

## License

[BSD-3-Clause](LICENSE).

## Acknowledgments

- Built as a DSH plugin using `@deepseek-ai` packages.
- Free translation fallback provided by MyMemory.
