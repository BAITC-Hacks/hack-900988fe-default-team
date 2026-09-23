# Состояние frontend — yasball

## Роль

- Владелец: Sariyev (yasball) Yesbol
- Email: defaul7btw@gmail.com
- Рабочая зона: `frontend/**`

## Текущая цель

Создать работающий frontend сквозного сценария от черновика до ручного выбора команды.

## Статус

- [x] Каркас приложения
- [ ] Роутинг и layout
  - Отдельные экраны каталога и детальной задачи реализованы без новой зависимости для роутинга.
- [x] Переключатель роли Бизнес/Команда
- [x] AI-конструктор задачи
- [x] Экран вопросов и ответов
- [x] Редактор карточки
- [x] Визуализация рейтинга и рекомендаций
- [x] Каталог, сортировка и фильтры
- [x] Страница задачи
- [x] Форма отклика команды
- [x] Выбор/отклонение отклика бизнесом
- [x] Mock adapter
- [ ] Подключение реального API
- [x] Loading/error/empty состояния
- [x] `frontend/README.md`
- [x] `frontend/.env.example`

## Журнал

### 2026-09-23 — каркас и mock-сквозной сценарий

- Создан Vite/React frontend с адаптивным UI и переключателем ролей «Бизнес»/«Команда».
- Реализован сценарий по API-контракту через `mockAdapter`: анализ черновика, три уточняющих вопроса, редактируемая карточка, детерминированный пересчёт рейтинга, сохранение черновика, публикация, отклик команды и ручной выбор либо отклонение отклика.
- Добавлены понятные loading, error и empty состояния. Mock adapter и его тесты покрывают вопросы и расчёт рейтинга.
- Изменённые файлы: `frontend/package.json`, `frontend/package-lock.json`, `frontend/index.html`, `frontend/eslint.config.js`, `frontend/src/main.jsx`, `frontend/src/App.jsx`, `frontend/src/styles.css`, `frontend/src/api/mockAdapter.js`, `frontend/src/api/mockAdapter.test.js`, `frontend/.env.example`, `frontend/README.md`.
- Проверки: `npm run lint`, `npm run test` (2 теста), `npm run build` — успешно.

### 2026-09-23 — правило игнорирования frontend

- По явному запросу добавлен `frontend/.gitignore`, исключающий `node_modules/` и `dist/` из Git.

### 2026-09-23 — каталог опубликованных задач и детальная страница

- В `mockAdapter` добавлены пять синтетических опубликованных задач, методы `listTasks`, `getTask` и `getProposals`; каталог принимает параметры контракта `theme`, `level`, `sort` и по умолчанию сортирует по `score_desc`.
- Добавлены отдельные экран каталога с фильтрами темы/готовности и сортировкой рейтинга, а также страница конкретной задачи с полями, расшифровкой рейтинга и действиями роли.
- Команда отправляет отклик со страницы задачи; бизнес там же вручную выбирает либо отклоняет отклик. Публикация созданной карточки добавляет её в mock-каталог.
- Изменённые файлы: `frontend/src/App.jsx`, `frontend/src/styles.css`, `frontend/src/api/mockAdapter.js`, `frontend/src/api/mockAdapter.test.js`, `docs/progress/yasball.md`.
- Проверки: `npm run lint`, `npm run test` (4 теста), `npm run build` — успешно.

### 2026-09-23 — Docker-сборка frontend

- Добавлены `frontend/Dockerfile` с multi-stage сборкой Vite в Node 22 и раздачей статики через Nginx, а также `frontend/.dockerignore` без зависимостей, сборочных артефактов и `.env`.
- В `frontend/README.md` добавлены команды самостоятельной сборки и запуска образа. Общий `docker-compose.yaml` не изменялся.
- Проверка: `docker build -t hackalem-frontend:local ./frontend` — успешно.

## Следующий шаг

После готовности backend переключить adapter на `VITE_API_BASE_URL` и провести интеграционный сценарий.

## Блокеры

Реальный backend API пока не подключён: текущий сквозной сценарий использует mock adapter. Для API-режима нужен согласованный HTTP adapter после готовности endpoints.

## Предложения для интеграции

- Выполнено: `frontend/.gitignore` исключает `node_modules/` и `dist/`.
