# Bulka the Dog

Сайт об удочерении собаки Булки в Белграде. Три языка: `ru` (canonical), `rs` (Serbian), `en` (English).

Про голос, тон и правила контента — см. `CLAUDE.md`. Этот файл про технику.

## Tech Stack

- **Package manager**: pnpm (v10)
- **Runtime**: Node.js 24
- **Frontend**: React 18 + React Router 6 + TypeScript + Vite 8
- **SSG**: vite-react-ssg (статическая генерация — вся страница pre-rendered, нет API-роутов в продакшне)
- **Styling**: TailwindCSS 3 + Radix UI (shadcn/ui компоненты) + Lucide React
- **Animation**: Framer Motion
- **Lightbox**: yet-another-react-lightbox (yarl) с плагинами Zoom, Captions, Counter
- **3D**: Three.js + @react-three/fiber + @react-three/drei
- **State**: React Context + TanStack React Query
- **Forms**: React Hook Form + Zod
- **Server** (только для локального dev + serverless fallback): Express 5
- **Testing**: Vitest (unit) + Playwright (e2e)
- **Deployment**: Vercel (SSG + serverless функции)
- **Analytics**: @vercel/analytics + @vercel/speed-insights

## Project Structure

```
client/
├── pages/Index.tsx          # Единственная страница — весь сайт
├── components/
│   ├── Gallery.tsx          # Фотогалерея + лайтбокс (pinch-to-open, seed-zoom)
│   ├── Header.tsx           # Sticky header с навигацией
│   └── ui/                  # shadcn/ui компоненты
├── context/LanguageContext  # Переключение языка (ru/rs/en)
├── lib/translations.ts      # Весь текстовый контент (3 языка)
├── App.tsx                  # Корень приложения, React Router
├── global.css               # TailwindCSS темизация + глобальные стили
└── main.tsx                 # Точка входа (vite-react-ssg)

server/
└── index.ts                 # Express dev-сервер (не используется в продакшне)

tests/
└── e2e/                     # Playwright тесты

shared/
└── api.ts                   # Общие типы client/server
```

## Commands

```bash
pnpm dev           # Dev-сервер
pnpm build         # Полная сборка (SSG + server)
pnpm build:client  # Только SSG (vite-react-ssg build)
pnpm typecheck     # tsc без emit
pnpm test          # Vitest unit-тесты
pnpm test:e2e      # Playwright e2e (нужен запущенный dev-сервер)
pnpm test:e2e:prod # Playwright против продакшна (bulka.rs)
```

## Key files

- `client/lib/translations.ts` — весь копирайт, три языка. Менять только здесь.
- `client/components/Gallery.tsx` — GalleryProvider + GalleryImage + GalleryLightbox + PinchTransitionOverlay
- `client/pages/Index.tsx` — единственная страница, все секции

## Path aliases

- `@/*` → `client/`
- `@shared/*` → `shared/`

## Conventions

- `cn()` из `@/lib/utils` для conditional classNames (clsx + tailwind-merge)
- Компоненты в `client/components/ui/` — shadcn/ui, не трогать без необходимости
- Новые цвета темы — в `client/global.css` (CSS vars) + `tailwind.config.ts`
- Контент только в `translations.ts`, не hardcode в JSX
