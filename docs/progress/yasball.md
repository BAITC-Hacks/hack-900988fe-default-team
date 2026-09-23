# Состояние frontend — yasball

## Роль

- Владелец: Sariyev (yasball) Yesbol
- Email: defaul7btw@gmail.com
- Рабочая зона: `frontend/**`

## Текущая цель

Создать работающий frontend сквозного сценария от черновика до ручного выбора команды.

## Статус

- [x] Каркас приложения
- [x] Роутинг и layout
  - Нативные URL `/`, `/catalog` и `/tasks/:taskId` работают без новой зависимости; Nginx поддерживает прямое открытие маршрутов.
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

### 2026-09-23 — переключаемый API-адаптер

- Добавлен `httpAdapter`, реализующий все frontend-операции из `API_CONTRACT.md`: анализ/сборка черновика, создание и обновление задачи, публикация, каталог, детализация, отклики и ручная смена статуса.
- `adapter.js` переключает приложение между HTTP API и существующим mock adapter одной переменной `VITE_API_BASE_URL`; пустое значение безопасно оставляет демо-режим.
- Редактор теперь повторно сохраняет существующий черновик через `PATCH /tasks/:taskId`; текст контрактной ошибки API показывается пользователю.
- Обновлены безопасный `.env.example`, локальный README и тесты HTTP-адаптера.
- Изменённые файлы: `frontend/src/App.jsx`, `frontend/src/api/adapter.js`, `frontend/src/api/httpAdapter.js`, `frontend/src/api/httpAdapter.test.js`, `frontend/.env.example`, `frontend/README.md`, `docs/progress/yasball.md`.
- Проверки: `npm run lint`, `npm run test` (6 тестов), `npm run build` — успешно; Vite dev-сервер отвечает на `http://127.0.0.1:5173` (HTTP 200).

### 2026-09-23 — защита локальной конфигурации

- В `frontend/.gitignore` добавлен `.env`; безопасный `frontend/.env.example` остаётся в репозитории.

### 2026-09-23 — самостоятельный Compose frontend

- Добавлен `frontend/compose.yaml`: самостоятельная production-сборка и запуск frontend на хост-порту `5380` без изменения общего корневого Compose-файла.
- `VITE_API_BASE_URL` передаётся в Vite как build-argument, поэтому серверный деплой может собрать frontend с адресом реального API; пустое значение сохраняет mock-режим.
- Обновлён `frontend/README.md` с командами `docker compose up --build -d` и остановки сервиса.
- Проверки: `docker compose -f compose.yaml config`, `npm run lint`, `npm run build` — успешно.

### 2026-09-23 — выравнивание подтверждений с API

- Редактор карточки теперь требует явного ручного подтверждения каждого учитываемого поля. Пока поле не подтверждено, оно не добавляет баллы; изменение ранее подтверждённого значения снимает его подтверждение.
- Добавлено поле `businessLink` («Связь с бизнесом») — седьмая категория реального scoring backend. Mock adapter приведён к той же модели `confirmedFields`, что и API.
- Изменённые файлы: `frontend/src/App.jsx`, `frontend/src/main.jsx`, `frontend/src/confirmation.css`, `frontend/src/api/mockAdapter.js`, `frontend/src/api/mockAdapter.test.js`, `docs/progress/yasball.md`.
- Проверки: `npm run lint`, `npm run test` (6 тестов), `npm run build` — успешно.

### 2026-09-23 — URL-маршруты каталога

- Добавлена нативная маршрутизация без новой зависимости: `/` — конструктор, `/catalog` — каталог, `/tasks/:taskId` — детальная карточка. Кнопки навигации и browser back/forward синхронизируются с URL.
- Добавлен Nginx fallback на `index.html`, поэтому прямые ссылки на каталог и карточки корректно работают в Docker/Compose-развёртывании.
- Изменённые файлы: `frontend/src/App.jsx`, `frontend/Dockerfile`, `frontend/nginx.conf`, `frontend/README.md`, `docs/progress/yasball.md`.
- Проверки: `docker compose build`, `docker compose config`, `npm run lint`, `npm run test` (6 тестов), `npm run build` — успешно; в тестовом Compose-контейнере прямые `/catalog` и `/tasks/task_canteen` вернули HTTP 200.

## Следующий шаг

После готовности backend задать `VITE_API_BASE_URL` и провести сквозной сценарий с реальными endpoint'ами.

## Блокеры

Для API-режима нужен доступный backend с CORS для frontend origin и согласованные endpoint'ы по контракту; HTTP adapter уже готов.

## Предложения для интеграции

- Выполнено: `frontend/.gitignore` исключает `node_modules/` и `dist/`.
- Для production Compose frontend на `http://<host>:5380` backend должен получить `FRONTEND_ORIGIN` с этим origin (либо проксироваться через один origin), иначе браузер заблокирует API-запросы по CORS. Это изменение относится к backend/интеграционному окну.
