# Bulka the Dog

Сайт об удочерении собаки Булки в Белграде. Три языка: `ru` (canonical), `rs` (Serbian), `en` (English).

Про голос, тон и правила контента — см. `CLAUDE.md`. Этот файл про технику.

## Tech Stack

- **Package manager**: pnpm (v10)
- **Runtime**: Node.js 24
- **Frontend**: Astro 7 + React 19 + TypeScript + Vite 8
- **SSG**: Astro static output; HTML для `/`, `/rs/`, `/en/` и опубликованных CMS-страниц. Одна React island на страницу сохраняет общие контексты.
- **Styling**: TailwindCSS 3 + Radix UI (shadcn/ui компоненты) + Lucide React
- **Animation**: Framer Motion
- **Lightbox**: yet-another-react-lightbox (yarl) с плагинами Zoom, Captions, Counter
- **3D**: Three.js + @react-three/fiber + @react-three/drei
- **State**: React Context + TanStack React Query
- **Forms**: React Hook Form + Zod
- **CMS**: Conloca `@conloca/astro-cms` + `@conloca/cloud-astro` 0.2.1, Puck 0.23.0; content хранится в git
- **Testing**: Vitest (unit) + Playwright (e2e)
- **Deployment**: Vercel, статический каталог `dist`; cloud editor assets в `dist/_conloca`
- **Analytics**: @vercel/analytics + @vercel/speed-insights

## Project Structure

```
src/
├── pages/[...slug].astro    # Опубликованные страницы и префиксы языков
├── layouts/PageLayout.astro # HTML lang, SEO, CSS и safe-area
├── lib/pages.ts            # Чтение/валидация Conloca collection
├── content.config.ts       # conlocaPages()
├── puck.config.tsx         # Девять реальных редактируемых блоков
└── puck.definitions.ts     # Статические поля/defaults для manifest

content/
├── sites.json              # Site default, локали ru/rs/en
└── default/pages/*.vxjson  # Источник опубликованного контента

client/
├── cms/                    # Shared page shell, runtime isolation, content model
├── pages/Index.tsx         # Рендер отдельных Bulka-секций
├── components/Gallery.tsx  # Галерея, lightbox, pinch-to-open
├── components/Header.tsx   # Навигация по фактическим CMS-блокам
├── components/ui/          # shadcn/ui
├── context/LanguageContext.tsx
├── lib/translations.ts     # Системные строки + исходный migration seed
└── global.css              # Тема и глобальные стили

scripts/                    # Явные seed/definitions команды и проверка artifacts
tests/e2e/                  # Playwright; migration + существующие gesture tests
shared/                     # Общие утилиты/типы
```

## Commands

```bash
pnpm dev                # Astro dev, http://localhost:8080
pnpm build              # Astro static build → dist/
pnpm preview            # Проверка собранного dist на localhost:8080
pnpm check              # astro check, включая TS и Astro
pnpm test               # Vitest (включая render/editor-isolation)
pnpm test:content       # Node24: locale, URL, seed/data invariants
pnpm test:artifacts     # После build: полный Conloca manifest и native ESM env
pnpm content:definitions # Обновить статические Puck defaults/fields (не CMS pages)
pnpm content:seed       # Только создать отсутствующие locale seed files
# Playwright против запущенного preview:
E2E_BASE_URL=http://localhost:8080 timeout 300 pnpm exec playwright test tests/e2e/astro-cms-migration.spec.ts --reporter=line
```

## Key files

- `content/default/pages/*.vxjson` — актуальный редактируемый контент; локали одного документа имеют общий content `id`.
- `client/lib/translations.ts` — системные UI-строки и источник исходных defaults. Правка здесь не должна перезаписывать авторские CMS-правки.
- `docs/astro-conloca.md` — подключение, переменные окружения и проверка публикации.
- `client/components/Gallery.tsx` — GalleryProvider + GalleryImage + GalleryLightbox + PinchTransitionOverlay
- `client/pages/Index.tsx` — общий рендер отдельных секций на сайте и в CMS

## Path aliases

- `@/*` → `client/`
- `@shared/*` → `shared/`

## Conventions

- `cn()` из `@/lib/utils` для conditional classNames (clsx + tailwind-merge)
- Компоненты в `client/components/ui/` — shadcn/ui, не трогать без необходимости
- Новые цвета темы — в `client/global.css` (CSS vars) + `tailwind.config.ts`
- Контент страниц — в `.vxjson`; системные переводы — в `translations.ts`, не hardcode в JSX.
- Builds читают content, но никогда не запускают `content:seed --force`.
- Только `BulkaPage` включает `SiteRuntimeContext=true`: в hosted editor нельзя менять внешний document, URL, тему или открывать глобальные overlays.
- Декларации Puck должны оставаться читаемыми статически. После изменения схемы запусти `content:definitions`, build и `test:artifacts`.
- На сайте relative `/images/` остаются relative; в editor-render helper добавляет origin текущей сборки. `/assets/` принадлежит Conloca draft-media adapter.
