## Thoth

An open-source, Notion‑inspired application.

Thoth aims to provide a fast, flexible note‑taking and knowledge management experience with a familiar hierarchy of pages and blocks, focusing on simplicity and speed.

### Highlights

- **Open source**: community‑driven, MIT‑licensed.
- **Notion‑inspired UX**: pages, hierarchy, and a clean editor experience.
- **Modern stack**: TypeScript across the stack, React with Mantine UI, Vite dev tooling.

### Monorepo

This project is a pnpm‑managed monorepo. Notable packages:

- `packages/web`: Vite + React app using Mantine UI 8 and React Router, following Atomic Design for components.
- `packages/backend`: TypeScript backend modules and API routes.
- `packages/types`: Shared TypeScript types.

### Getting Started

Prerequisites: pnpm 10+

```bash
pnpm install
pnpm -r dev
```

Open the web app package during development:

```bash
cd packages/web
pnpm dev
```

### Contributing

Issues and PRs are welcome. Please follow TypeScript best practices and the existing Atomic Design conventions in `packages/web`.

### License

MIT
