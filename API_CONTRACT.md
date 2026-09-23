# API Contract v0.1

Префикс: `/api`. Формат: JSON. Ошибки имеют единую форму:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Описание ошибки",
    "details": {}
  }
}
```

## Health

### `GET /api/health`

```json
{"status":"ok"}
```

## Анализ черновика

### `POST /api/task-drafts/analyze`

Запрос:

```json
{
  "draft": "Хотим сократить очереди в корпоративной столовой с помощью AI.",
  "language": "ru"
}
```

Ответ:

```json
{
  "analysisId": "analysis_123",
  "extractedFields": {
    "title": "Сокращение очередей в корпоративной столовой",
    "context": "В корпоративной столовой возникают очереди",
    "need": "Сократить время ожидания",
    "users": "",
    "data": "",
    "constraints": "",
    "expectedResult": "",
    "successCriteria": "",
    "contact": "",
    "interactionFormat": ""
  },
  "missingFields": ["users", "data", "successCriteria"],
  "questions": [
    {"id":"q1","field":"users","text":"Кто является основным пользователем решения?"},
    {"id":"q2","field":"data","text":"Какие данные об очередях уже доступны?"},
    {"id":"q3","field":"successCriteria","text":"Как измерить успешное сокращение очередей?"}
  ],
  "fallbackUsed": false
}
```

## Формирование карточки

### `POST /api/task-drafts/compose`

Запрос:

```json
{
  "analysisId": "analysis_123",
  "draft": "...",
  "answers": [
    {"questionId":"q1","field":"users","answer":"Сотрудники офиса"}
  ],
  "currentFields": {}
}
```

Ответ:

```json
{
  "fields": {},
  "score": 55,
  "level": "working",
  "scoreBreakdown": [
    {"key":"users","label":"Пользователи","earned":10,"max":10,"confirmed":false,"recommendation":null}
  ],
  "missingFields": []
}
```

`compose` не подтверждает поля автоматически. Frontend показывает результат в редакторе.

## Задачи

### `POST /api/tasks`

Создаёт карточку в статусе `draft`.

```json
{
  "fields": {},
  "confirmedFields": []
}
```

### `PATCH /api/tasks/:taskId`

Обновляет поля и пересчитывает рейтинг.

```json
{
  "fields": {},
  "confirmedFields": ["context", "need", "users"]
}
```

### `POST /api/tasks/:taskId/publish`

Публикует подтверждённую карточку. Низкий рейтинг публикацию не блокирует.

### `GET /api/tasks`

Параметры:

- `theme` — фильтр темы;
- `level` — `draft|working|ready|priority`;
- `sort` — по умолчанию `score_desc`.

### `GET /api/tasks/:taskId`

Возвращает карточку, рейтинг и расшифровку.

Базовая форма задачи:

```json
{
  "id":"task_1",
  "status":"published",
  "fields":{},
  "confirmedFields":[],
  "score":75,
  "level":"ready",
  "scoreBreakdown":[],
  "createdAt":"2026-09-23T00:00:00Z",
  "updatedAt":"2026-09-23T00:00:00Z"
}
```

## Отклики

### `POST /api/tasks/:taskId/proposals`

```json
{
  "teamId":"team_1",
  "solutionIdea":"...",
  "plan":"...",
  "estimatedTime":"2 недели",
  "prototypeUrl":"https://example.com"
}
```

### `GET /api/tasks/:taskId/proposals`

Возвращает все отклики задачи.

### `PATCH /api/proposals/:proposalId/status`

```json
{"status":"selected"}
```

Допустимые значения: `pending`, `selected`, `rejected`. Можно выбрать несколько команд. Решение всегда инициируется бизнес-пользователем.

## Правила изменения контракта

1. Не менять существующее поле молча.
2. Сначала описать изменение в progress-файле.
3. Согласовать frontend и backend.
4. Обновить контракт во время интеграционного окна.
5. После изменения проверить mock adapter и реальный API.

