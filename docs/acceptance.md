# Acceptance status

Срез на 2026-09-20. Локальные сценарии и live acceptance в Chromium/Firefox проверены; GitHub OAuth и полные CRUD/доступностные сценарии остаются открытыми.

| Область | Доказательство | Статус |
|---|---|---|
| Workspace/API | `pnpm --dir apps/api run typecheck`, build, 18 API Vitest tests на отдельной PostgreSQL-БД | passed |
| Extension adapter/messages | 8 Vitest tests, включая DOM-like fixtures и sender validation | passed |
| Chromium/Firefox packaging | WXT `chrome-mv3` и `firefox-mv3`, оба manifest_version 3 | passed |
| Prisma 8 contract | `prisma contract emit`, `prisma migration check` | passed |
| PostgreSQL migration/read/write | OrbStack PostgreSQL: Prisma migration status up to date; API integration tests покрывают CRUD, concurrency, cursor, 401, moderation и 429 | passed |
| Real browser loading/content/background | Chrome Canary: MV3-сборка загружена, кнопки видны на обычных и company-карточках Хабра, Shadow DOM-панель и popup проверены. Zen 1.22.2b: временная Firefox MV3-сборка загружена, background отмечен как выполняющийся, после reload видны метки на обычных и company-карточках, локализованная панель открывается и закрывается через `×` и `Escape` без остаточной тени; боковой блок «Читают сейчас» остаётся без меток | passed (Chrome + Firefox) |
| GitHub OAuth live flow | требует OAuth application, HTTPS callback и реального браузера | open |

Незакрытые live-сценарии остаются незакрытыми в `tasks.md`; моки не используются как замена browser acceptance.
