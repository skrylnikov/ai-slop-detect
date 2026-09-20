# AI Slop Labels

Расширение Chromium/Firefox показывает коллективные метки признаков AI-generated контента в поддерживаемых источниках. Сейчас подключён Хабр. Метка — мнение сообщества, не доказательство происхождения или качества материала.

## Локальный запуск

Требуются Node.js 26+, pnpm 12 и Docker/OrbStack с PostgreSQL.

```sh
pnpm install
cp apps/api/.env.example apps/api/.env
docker compose up -d postgres
pnpm --dir apps/api contract:emit
pnpm dev
```

Секреты GitHub OAuth и `OPERATOR_TOKEN` задаются только в `apps/api/.env`. Callback backend должен быть HTTPS и совпадать с `PUBLIC_API_ORIGIN`; оба extension redirect URL перечисляются в `OAUTH_REDIRECT_URIS`.

## Проверки и сборки

```sh
pnpm typecheck
pnpm test
pnpm --dir apps/api build
pnpm --dir apps/extension build
pnpm --dir apps/extension build:firefox
```

Для загрузки расширения откройте `apps/extension/.output/chrome-mv3` в `chrome://extensions` или `apps/extension/.output/firefox-mv3` через временную загрузку Firefox. Настоящий GitHub-вход и acceptance-сценарии требуют настроенного OAuth приложения и реальных браузеров.

Операторские команды: `pnpm --dir apps/api exec tsx src/operator.ts hide-comment <vote-id>` и `block-user <user-id>`. Схема создаётся bootstrap SQL при первом создании PostgreSQL; rollback — остановить API/вернуть предыдущую сборку, сохранив PostgreSQL.
