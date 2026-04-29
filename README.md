# Bulka the Dog

Одностраничный сайт для удочерения собаки Булки в Белграде. Три языка: русский, сербский, английский.

Live: [bulka.rs](https://www.bulka.rs)

## Tech Stack

| Layer | Что |
|-------|-----|
| Frontend | React 18 + TypeScript + Vite 8 |
| SSG | vite-react-ssg (pre-rendered HTML) |
| Routing | React Router 6 (SPA mode) |
| Styling | TailwindCSS 3 + Radix UI (shadcn/ui) |
| Animation | Framer Motion |
| Lightbox | yet-another-react-lightbox + Zoom/Captions/Counter |
| 3D | Three.js + @react-three/fiber |
| Testing | Vitest + Playwright |
| Deploy | Vercel |

## Quick Start

```bash
pnpm install
pnpm dev        # http://localhost:8080
```

## Commands

```bash
pnpm dev           # Dev-сервер
pnpm build         # Продакшн-сборка (SSG)
pnpm typecheck     # Тайпчек
pnpm test          # Vitest unit
pnpm test:e2e      # Playwright (нужен dev-сервер)
pnpm test:e2e:prod # Playwright против bulka.rs
```

## Content

Весь текст сайта живёт в `client/lib/translations.ts`. Русский — canonical, сербский и английский переводятся от него.

Тон голоса и правила контента — в `CLAUDE.md`.
Техническая документация — в `AGENTS.md`.
