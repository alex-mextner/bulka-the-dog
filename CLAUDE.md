# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

# Bulka the Dog

Одностраничный сайт-объявление об удочерении собаки Булки в Белграде. Три языка: `ru` (canonical), `rs` (Serbian), `en` (English). Актуальный контент хранится в `content/default/pages/*.vxjson`; системные переводы и исходный migration seed — в `client/lib/translations.ts`. Технический контракт CMS описан в `docs/astro-conloca.md`.

## Commands

```bash
pnpm dev           # Dev-сервер на http://localhost:8080
pnpm build         # Astro static build, вывод в dist/
pnpm preview       # Проверить собранный сайт на localhost:8080
pnpm check         # astro check
pnpm test:content  # Node24 data invariants
pnpm test:artifacts # После build: Conloca manifest + editor bundle
pnpm test          # Vitest unit-тесты
pnpm test:e2e      # Playwright e2e (автозапускает dev-сервер если не запущен)
pnpm test:e2e:prod # Playwright против https://www.bulka.rs
```

Запустить один e2e-тест:
```bash
timeout 90 npx playwright test tests/e2e/gallery-lightbox-fixes.spec.ts --reporter=line
```

**Таймауты обязательны.** Playwright-команды без `timeout N` висят вечно при зависшем dev-сервере:
```bash
# Правильно
timeout 90 npx playwright test <file> --reporter=line
# Bash tool — всегда передавай timeout: 100000
```

Vercel читает `vercel.json`: `buildCommand: pnpm build`, `outputDirectory: dist`. Статические Astro-страницы и реальные 404. Не добавляй SPA rewrite: он ломает загрузку `/_conloca/` и маскирует отсутствующие страницы. Для cloud editor assets обязательны публичный доступ и CORS.

## Architecture

**Главные файлы:**
- `content/default/pages/*.vxjson` — редактируемый текст, фотографии, повторяющиеся списки; ru/rs/en одного документа делят content ID.
- `src/puck.config.tsx` и `src/puck.definitions.ts` — девять блоков и статический словарь их полей.
- `src/pages/[...slug].astro` — SSR и маршруты; `src/lib/pages.ts` читает только опубликованную collection.
- `client/pages/Index.tsx` — рендер отдельной секции с CMS props.
- `client/cms/BulkaPage.tsx`, `PageFrame.tsx`, `AppProviders.tsx` — общий shell, providers и GalleryLightbox.
- `client/lib/translations.ts` — системные UI-строки и исходные defaults, не источник текущих авторских правок.

`SiteRuntimeContext` по умолчанию false: hosted Puck canvas не владеет внешним document/window. Эффекты метаданных, темы, навигации, viewport и lightbox включаются только публичной Astro island. Root-relative фотографии в canvas разрешаются относительно публичного origin этой сборки; сохранённый content не мутируется.

**Ключевые компоненты:**

`Gallery.tsx` — самый сложный файл (~37 KB). Содержит:
- `GalleryProvider` — React Context с реестром фото, состоянием открытия лайтбокса, и несколькими `MutableRefObject` для imperative pinch-to-open координации
- `GalleryImage` — thumbnail-кнопка с нативным (non-passive) `touchstart` обработчиком для pinch-to-open
- `GalleryLightbox` — yarl `<Lightbox>` с Zoom/Captions/Counter плагинами; содержит rAF-цикл seed-zoom и `theme-color` meta swap
- `PinchTransitionOverlay` — fixed-position клон фото во время pinch-жеста (imperative API через `useImperativeHandle`)

Три ref-а координируют жест между компонентами:
- `pendingZoomRef` — масштаб который накопил pinch
- `pendingPanRef` — фокальная точка (смещение от центра экрана) для `changeZoom`
- `pinchActiveRef` — флаг "жест ещё в процессе" (600ms grace после отпускания)

`PhotoStrip.tsx` — горизонтальная лента поляроидов (~29 KB). `overflow-x: hidden` + rAF-цикл (НЕ native scroll). Автодрифт + инерция + scroll-boost (ускорение от вертикального скролла страницы) + IntersectionObserver для паузы вне viewport.

`Header.tsx` (~21 KB) — sticky header с IntersectionObserver-навигацией: подсвечивает активную секцию, трёхфазный smooth-scroll (instant jump → smooth decel → settle correction).

**Язык:**
`LanguageProvider` → `useLanguage()` hook → `t("key.path")` во всех компонентах. HTML `/` по умолчанию `ru`, `/rs/` — `sr`, `/en/` — `en`. Detect из `localStorage` + `navigator.language` после mount включён только для главной `/`. Явный locale URL сохраняет выбранный язык. Кнопки языков показывают только существующие переводы страницы. HTML lang, title, SEO и aria обновляются вместе с контентом.

**Тестирование:**
Существующие gesture e2e используют mobile Chromium с iPhone 13 UA, viewport 390×844. `astro-cms-migration.spec.ts` отдельно проверяет 360/390/768/1440 px, desktop, три языка, SSR без JS, FAQ, lightbox, контакты и 404. Playwright автостартует dev-сервер. Тесты используют `window.__bulkaTest` — hook, который GalleryProvider пишет в `window` и который позволяет управлять `pendingZoomRef/pendingPanRef/pinchActiveRef` без реального multi-touch.

**iOS-специфика:**
- `viewport-fit=cover` в `src/layouts/PageLayout.astro` — разблокирует `env(safe-area-inset-*)` на notch/Dynamic Island
- `--safe-area-top/bottom` CSS vars в `:root` — используются в Header и footer
- `gesturestart`/`gesturechange` preventDefault в gallery runtime — блокирует page-zoom при pinch (надёжнее чем `maximum-scale=1.0`)
- `theme-color` meta свитчится в `#000000` при открытии лайтбокса
- `body.yarl__no_scroll #root { visibility: hidden }` в `client/global.css` — изолирует страницу при открытии лайтбокса. `visibility:hidden` (НЕ `opacity:0`): iOS Safari compositing обходит opacity, но не рисует элементы с visibility:hidden. Правило на `#root`, а не `body` — потому что lightbox portal, backdrop и pinch overlay маунтятся в `document.body` и должны оставаться видимыми. `html:has(body.yarl__no_scroll)` — дополнительный слой против compositing через html canvas; требует Safari 15.4+.
- `body.yarl__no_scroll { background-color: #000 !important }` — второй обязательный слой: без него Safari chrome compositing показывает кремовый фон страницы (`#f9f5f0`) сквозь нижний address bar и top notch. `visibility:hidden` убирает `#root` из paint tree, но не меняет цвет canvas `body`. Оба правила нужны: одно скрывает контент, второе делает canvas чёрным.

---

## Tone of voice

Это главное. Сайт работает не потому что хорошо свёрстан, а потому что Булка пишет от первого лица и звучит как живая собака с характером.

### Narrator and POV

- Повествование всегда от первого лица. Рассказчик — сама Булка.
- Булка — сука, ~1–2 года. Грамматический род женский во всех формулировках на русском и сербском.
- Никогда не переключайся на третье лицо ("Bulka is a friendly dog…"). Даже в alt-тексте картинок — от её лица.
- Лена и подруга Ира упоминаются как реальные люди, не как "волонтёры приюта".

**Жёсткое правило: КАЖДАЯ user-visible строка на сайте — от первого лица Булки. Без исключений.**

Это включает: все вопросы/ответы FAQ, лейблы кнопок, alt-тексты картинок, empty states, тосты, тултипы, заголовки секций, баннеры, метатеги (title, description, og:*).

Третье лицо о себе, пассив ("депозит будет возвращён"), нейтральные ad-copy формулировки — поломка.

**Smell test: прочитай вслух — если звучит как приютский клерк или пресс-релиз, переписывай как Булка.**

### Register

- Разговорный, как умный друг за кухонным столом. Не маркетинг, не корпоратив.
- Лёгкая дерзость и сухой юмор. Self-aware: Булка знает что она собака.
- Тёплый, но не слащавый. Прошлые невзгоды — буднично, без надрыва.

### Avoid

- "очень милая собачка", "идеальный друг", "верный компаньон"
- "несмотря на все трудности, я не теряю надежды"
- Любые клише с сайтов приютов: "подарите дом", "ждёт своего человека"
- Жалобный тон. Булка не выпрашивает, она представляется.

### Emojis

Только как маркеры секций (📏 внешность, 🚽 туалет и т.п.). Никогда внутри предложений. Один на секцию максимум.

### Three-language parity

- Русский — canonical. Сначала пиши/правь там, потом переноси.
- Сербский и английский — перевод голоса, не подстрочник. Идиомы адаптируй, не переводи дословно.
- Имена и топонимы — в местной транслитерации (Vukov Spomenik / Вуков споменик).

### When adding new copy

1. Открой соседний текст в CMS `.vxjson` (для системного UI — `translations.ts`) и прочитай вслух. Поймай ритм.
2. Напиши на русском от лица Булки. Звучит как живой человек (то есть собака)? Если как пресс-релиз — переписывай.
3. Перенеси в `rs` и `en`, адаптируя шутки, не переводя их.
4. Медицинский факт — спрячь внутри ремарки от Булки, не оставляй голую справку.
5. Новый тип секции — добавь ключ в `nav` во всех трёх языках и явную Puck definition. Навигация страницы строится из реально присутствующих блоков.
