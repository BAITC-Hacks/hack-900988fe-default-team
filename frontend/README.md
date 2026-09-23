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

Собрать образ из корня репозитория:

```bash
docker build -t hackalem-frontend ./frontend
docker run --rm -p 8080:80 hackalem-frontend
```

После запуска приложение доступно по адресу `http://localhost:8080`. Сборка не содержит секретов и использует mock adapter, пока не подключён backend.

## Переменные окружения

`VITE_API_BASE_URL` — адрес API с префиксом `/api`. Пустое значение означает работу через mock adapter. Секреты не требуются.

## Структура

- `src/App.jsx` — UI и состояние сквозного сценария.
- `src/api/mockAdapter.js` — mock-реализация контрактных операций анализа, формирования карточки, публикации и откликов.
- `src/styles.css` — адаптивные стили интерфейса.
