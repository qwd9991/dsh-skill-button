# Contributing

Thanks for your interest in dsh-skill-button!

## Requirements

- Node.js >= 20 (see `.nvmrc`)
- All peer packages (`@deepseek-ai/*`, `cordis`, `schemastery`) are available on the public npm registry; dev-time copies are already listed in `devDependencies`.

## Setup

```bash
npm ci
npm run typecheck
npm run build
npm run check:public   # blocks host-only paths / credentials from being committed
```

## Where to make changes

- `src/index.ts` — host-side entry: API routes and the LLM translation endpoint.
- `src/client/index.tsx` — browser client (input box slot, popover UI, translation fallbacks).

## Guidelines

- TypeScript strict mode; match existing style (no semicolons, single quotes).
- UI text is Simplified Chinese; code comments in English.
- Do not introduce host-only paths, credentials, or personal branding into the source. `npm run check:public` enforces this.
- Verify behavior in a real DSH host before submitting a PR; there is no automated runtime test suite yet.

## Tests

There is currently no automated test suite (the host-side logic depends on the DSH runtime). Please note in your PR how you verified the change manually.
