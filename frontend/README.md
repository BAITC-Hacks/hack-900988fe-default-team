# HackAlem AI frontend

React-приложение для сквозного сценария: бизнес описывает задачу, отвечает на вопросы, редактирует и публикует карточку; команда откликается, а бизнес вручную выбирает или отклоняет отклик.

## Требования

Node.js 20+ и npm 10+.

## Настройка и запуск

```bash
cp .env.example .env
npm install
npm run dev
```

## Проверки

```bash
npm run lint
npm run build
npm run test
```

## Docker

Из каталога `frontend/` запустите отдельный Compose-проект. Он не использует и не изменяет общий корневой `docker-compose.yaml`, а приложение будет доступно на порту `5380`:

```bash
docker compose up --build -d
```

Остановить его:

```bash
docker compose down
```

После запуска приложение доступно по адресу `http://localhost:5380`. По умолчанию оно использует mock adapter. Чтобы встроить адрес API в production-сборку, укажите `VITE_API_BASE_URL` перед запуском Compose (например, `VITE_API_BASE_URL=https://api.example.com docker compose up --build -d`).

Каталог доступен по пути `/catalog`, а карточки — по `/tasks/<taskId>`; Nginx настроен так, чтобы эти прямые ссылки открывались после перезагрузки страницы.

Также образ можно собрать вручную из корня репозитория:

```bash
docker build -t hackalem-frontend ./frontend
docker run --rm -p 8080:80 hackalem-frontend
```

Сборка не содержит секретов и использует mock adapter, пока не задан адрес backend.

## Переменные окружения

`VITE_API_BASE_URL` — адрес backend (например, `http://localhost:3000` или `http://localhost:3000/api`). Пустое значение означает работу через mock adapter. Переменная считывается Vite при запуске/сборке, поэтому после изменения перезапустите `npm run dev`. Секреты не требуются.

## Структура

- `src/App.jsx` — UI и состояние сквозного сценария.
- `src/api/mockAdapter.js` — mock-реализация контрактных операций анализа, формирования карточки, публикации и откликов.
- `src/api/httpAdapter.js` — HTTP-реализация тех же контрактных операций; ошибки API выводятся в интерфейсе.
- `src/api/adapter.js` — единственная точка переключения между mock и API по `VITE_API_BASE_URL`.
- `src/styles.css` — адаптивные стили интерфейса.
