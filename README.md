# dsh-skill-button

**English** | [中文](#中文)

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

---

## 中文

## 功能特性

- 在 DSH 输入框左侧注入「技能」按钮（`conversation.input.left` 插槽）。
- 从宿主实时获取已安装技能列表（`remote.skills.list`），支持搜索、收藏置顶，
  并自动跳过已出现在输入框中的技能。
- 支持多选并批量插入：`/技能A /技能B …`。
- 可选技能名称/描述中文翻译，优先使用宿主配置模型
  （`POST /skill-button/api/translate`，即设置/编辑器中选择的模型），
  其次为离线规则词典（kebab-case 单词 → 中文），最后才降级到
  [MyMemory API](https://mymemory.translated.net)（仅在开启翻译且宿主模型不可用时）。

## 环境要求

- Node.js >= 20（见 `.nvmrc`）。
- 需要提供 `llm`、`agentDefaultModel`、`webServer` 及客户端
  `slots` / `remote.skills` / `sessions` 服务的 DSH 宿主。
- peer 依赖（`@deepseek-ai/dsh-llm`、`@deepseek-ai/dsh-tools`、
  `@deepseek-ai/dsh-client-ui-slots`、`cordis`、`schemastery`）已在
  `devDependencies` 中镜像，供开发使用；它们均已发布到公共 npm registry。

## 安装（作为 DSH 插件）

先构建，再把本目录注入你的 DSH 宿主：

```bash
npm ci
npm run build
# 然后用 DSH 宿主的插件加载方式注入/组合本目录
```

如需与本地 DSH monorepo 匹配（使用与宿主一致的 TypeScript 版本）：

```bash
DSH_CHECKOUT=<path-to-dsh-checkout> bash scripts/build.sh
```

## 开发

```bash
npm ci
npm run typecheck    # 针对公共 npm 包做严格类型检查
npm run build        # tsc（src → lib/）+ tsdown 客户端打包
npm run check:public # 防止宿主专用路径/凭据混入 src 或 scripts
```

## 隐私

开启翻译开关后，未缓存技能的名称与描述会发送给宿主配置的模型；当宿主模型
不可用时，描述可能被发送给第三方免费翻译服务 `api.mymemory.translated.net`
（其会保留一段时间的日志）。翻译默认**关闭**，不开启就不会有任何第三方调用。
客户端状态（收藏、翻译缓存）仅保存在 `localStorage`。

## 许可

[BSD-3-Clause](LICENSE)。

## 致谢

- 基于 `@deepseek-ai` 相关包构建的 DSH 插件。
- 免费翻译降级服务由 MyMemory 提供。
