import { taskFieldNames, taskThemes } from './task-schema.js';

const error = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object', required: ['code', 'message', 'details'],
      properties: { code: { type: 'string' }, message: { type: 'string' }, details: { type: 'object' } },
    },
  },
};

const taskFields = {
  type: 'object', additionalProperties: false,
  properties: Object.fromEntries(taskFieldNames.map(key => [key, { type: 'string' }])),
  example: { title: 'Умная очередь в столовой', context: 'В часы пик образуются очереди.', need: 'Снизить время ожидания.', users: 'Сотрудники офиса', data: 'Обезличенные чеки', expectedResult: 'Рабочий прототип', successCriteria: 'Сократить ожидание на 20%', constraints: 'Без персональных данных', contact: 'Операционный менеджер', interactionFormat: 'Еженедельный созвон и обратная связь по демо' },
};

const themeInput = { type: 'string', enum: taskThemes, description: 'Необязательно. При создании без темы возвращается null; PATCH без theme сохраняет прежнюю тему.' };
const taskInput = {
  type: 'object', required: ['fields'],
  properties: {
    theme: themeInput, fields: taskFields,
    confirmedFields: { type: 'array', items: { type: 'string', enum: taskFieldNames }, description: 'Полный актуальный список подтверждений. Для PATCH обязателен; [] снимает все подтверждения.' },
  },
};

export const openapi = {
  openapi: '3.0.3',
  info: { title: 'HackAlem AI API', version: '0.1.0', description: 'API конструктора и каталога бизнес-задач для студенческих команд.' },
  servers: [{ url: '/api', description: 'Текущий backend' }, { url: 'http://localhost:3388/api', description: 'Локальный backend' }],
  paths: {
    '/teams': { get: {
      summary: 'Список команд для выбора при отправке отклика',
      responses: { 200: { description: 'Все команды', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Team' } } } } } },
    } },
    '/health': { get: { summary: 'Проверка доступности', responses: { 200: { description: 'Сервер доступен', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', example: 'ok' } } } } } } } } },
    '/task-drafts/analyze': { post: { summary: 'Анализ черновика и вопросы', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['draft'], properties: { draft: { type: 'string' }, language: { type: 'string', example: 'ru' } } } } } }, responses: { 200: { description: 'Анализ', content: { 'application/json': { schema: { $ref: '#/components/schemas/Analysis' } } } }, 400: { $ref: '#/components/responses/ValidationError' } } } },
    '/task-drafts/compose': { post: { summary: 'Собрать редактируемую карточку', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['analysisId'], properties: { analysisId: { type: 'string' }, draft: { type: 'string' }, answers: { type: 'array', items: { type: 'object', required: ['questionId', 'field', 'answer'], properties: { questionId: { type: 'string' }, field: { type: 'string' }, answer: { type: 'string' } } } }, currentFields: taskFields } } } } }, responses: { 200: { description: 'Карточка и рейтинг', content: { 'application/json': { schema: { $ref: '#/components/schemas/ScoreResult' } } } }, 404: { $ref: '#/components/responses/NotFound' } } } },
    '/tasks': {
      get: { summary: 'Каталог опубликованных задач', parameters: [{ name: 'theme', in: 'query', schema: { type: 'string' } }, { name: 'level', in: 'query', schema: { type: 'string', enum: ['draft', 'working', 'ready', 'priority'] } }, { name: 'sort', in: 'query', schema: { type: 'string', enum: ['score_desc', 'score_asc'], default: 'score_desc' } }], responses: { 200: { description: 'Список задач', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Task' } } } } } } },
      post: { summary: 'Создать черновик задачи', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['fields', 'confirmedFields'], properties: { fields: taskFields, confirmedFields: { type: 'array', items: { type: 'string' } } } } } } }, responses: { 201: { description: 'Черновик создан', content: { 'application/json': { schema: { $ref: '#/components/schemas/Task' } } } }, 400: { $ref: '#/components/responses/ValidationError' } } },
    },
    '/tasks/{taskId}': {
      parameters: [{ name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }],
      get: { summary: 'Получить задачу', responses: { 200: { description: 'Задача', content: { 'application/json': { schema: { $ref: '#/components/schemas/Task' } } } }, 404: { $ref: '#/components/responses/NotFound' } } },
      patch: { summary: 'Обновить поля и подтверждения', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['fields', 'confirmedFields'], properties: { fields: taskFields, confirmedFields: { type: 'array', items: { type: 'string' } } } } } } }, responses: { 200: { description: 'Обновлённая задача', content: { 'application/json': { schema: { $ref: '#/components/schemas/Task' } } } }, 400: { $ref: '#/components/responses/ValidationError' }, 404: { $ref: '#/components/responses/NotFound' } } },
    },
    '/tasks/{taskId}/publish': { post: { summary: 'Опубликовать задачу', parameters: [{ name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Опубликованная задача', content: { 'application/json': { schema: { $ref: '#/components/schemas/Task' } } } }, 404: { $ref: '#/components/responses/NotFound' } } } },
    '/tasks/{taskId}/proposals': {
      parameters: [{ name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }],
      get: { summary: 'Список откликов задачи', responses: { 200: { description: 'Отклики', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Proposal' } } } } }, 404: { $ref: '#/components/responses/NotFound' } } },
      post: { summary: 'Отправить отклик команды', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ProposalInput' } } } }, responses: { 201: { description: 'Отклик создан', content: { 'application/json': { schema: { $ref: '#/components/schemas/Proposal' } } } }, 400: { $ref: '#/components/responses/ValidationError' }, 409: { description: 'Задача не опубликована', content: { 'application/json': { schema: error } } } } },
    },
    '/proposals/{proposalId}/status': { patch: { summary: 'Установить ручной статус отклика', parameters: [{ name: 'proposalId', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['pending', 'selected', 'rejected'] } } } } } }, responses: { 200: { description: 'Отклик с новым статусом', content: { 'application/json': { schema: { $ref: '#/components/schemas/Proposal' } } } }, 400: { $ref: '#/components/responses/ValidationError' }, 404: { $ref: '#/components/responses/NotFound' } } } },
  },
  components: {
    responses: { ValidationError: { description: 'Ошибка валидации', content: { 'application/json': { schema: error } } }, NotFound: { description: 'Ресурс не найден', content: { 'application/json': { schema: error } } } },
    schemas: {
      Team: {
        type: 'object', required: ['id', 'name', 'university', 'interests', 'skills', 'technologies'],
        properties: {
          id: { type: 'string', example: 'team_1' }, name: { type: 'string', example: 'Data Nomads' }, university: { type: 'string', example: 'Демо-университет 1' },
          interests: { type: 'array', items: { type: 'string' }, example: ['AI', 'логистика'] },
          skills: { type: 'array', items: { type: 'string' }, example: ['аналитика', 'UX'] },
          technologies: { type: 'array', items: { type: 'string' }, example: ['Python', 'React'] },
        },
      },
      ScoreResult: { type: 'object', properties: { fields: taskFields, score: { type: 'integer', minimum: 0, maximum: 100 }, level: { type: 'string', enum: ['draft', 'working', 'ready', 'priority'] }, scoreBreakdown: { type: 'array', items: { $ref: '#/components/schemas/ScoreBreakdown' } }, missingFields: { type: 'array', items: { type: 'string' } } } },
      ScoreBreakdown: { type: 'object', properties: { key: { type: 'string' }, label: { type: 'string' }, earned: { type: 'integer' }, max: { type: 'integer' }, confirmed: { type: 'boolean' }, recommendation: { type: 'string', nullable: true } } },
      Analysis: { type: 'object', properties: { analysisId: { type: 'string' }, extractedFields: taskFields, missingFields: { type: 'array', items: { type: 'string' } }, questions: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, field: { type: 'string' }, text: { type: 'string' } } } }, fallbackUsed: { type: 'boolean' } } },
      Task: { allOf: [{ $ref: '#/components/schemas/ScoreResult' }, { type: 'object', properties: { id: { type: 'string' }, status: { type: 'string', enum: ['draft', 'published'] }, confirmedFields: { type: 'array', items: { type: 'string' } }, createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' } } }] },
      ProposalInput: { type: 'object', required: ['teamId', 'solutionIdea', 'plan', 'estimatedTime', 'prototypeUrl'], properties: { teamId: { type: 'string', example: 'team_1' }, solutionIdea: { type: 'string' }, plan: { type: 'string' }, estimatedTime: { type: 'string' }, prototypeUrl: { type: 'string', format: 'uri' } } },
      Proposal: { allOf: [{ $ref: '#/components/schemas/ProposalInput' }, { type: 'object', properties: { id: { type: 'string' }, taskId: { type: 'string' }, status: { type: 'string', enum: ['pending', 'selected', 'rejected'] }, createdAt: { type: 'string', format: 'date-time' } } }] },
    },
  },
};

// Reuse the same field and theme lists as runtime validation.
openapi.paths['/tasks'].post.requestBody.content['application/json'].schema = taskInput;
openapi.paths['/tasks/{taskId}'].patch.requestBody.content['application/json'].schema = { ...taskInput, required: ['fields', 'confirmedFields'] };
openapi.components.schemas.Task.allOf[1].properties.theme = { type: 'string', nullable: true, enum: [...taskThemes, null] };
openapi.paths['/tasks'].get.parameters.find(parameter => parameter.name === 'theme').schema = themeInput;
openapi.paths['/tasks/{taskId}/publish'].post.description = 'Публикация разрешена при любом score, включая 0, если хотя бы одно допустимое поле заполнено и подтверждено.';
openapi.paths['/tasks/{taskId}/publish'].post.responses[409] = {
  description: 'UNCONFIRMED_TASK: подтвердите хотя бы одно заполненное поле.',
  content: { 'application/json': { schema: error, example: { error: { code: 'UNCONFIRMED_TASK', message: 'Перед публикацией подтвердите хотя бы одно заполненное поле карточки.', details: {} } } } },
};
for (const operation of [openapi.paths['/task-drafts/compose'].post, openapi.paths['/tasks'].get]) {
  operation.responses[400] = { $ref: '#/components/responses/ValidationError' };
}
openapi.paths['/task-drafts/compose'].post.description = 'Всегда возвращает неподтверждённую карточку со score 0. answers должны соответствовать questionId/field данного анализа, без повторов.';
openapi.paths['/tasks/{taskId}/proposals'].post.responses[404] = { $ref: '#/components/responses/NotFound' };

export function buildOpenapi(apiBaseUrl) {
  const configuredUrl = apiBaseUrl?.trim().replace(/\/$/, '');
  if (!configuredUrl) return openapi;
  return {
    ...openapi,
    servers: [
      { url: configuredUrl, description: 'URL из API_BASE_URL' },
      ...openapi.servers.filter((server) => server.url !== configuredUrl),
    ],
  };
}
