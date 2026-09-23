import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { tasks, teams, proposals, analyses, initializeStore, persist, closeStore, makeId, timestamp } from './store.js';
import { scoreTask } from './scoring.js';
import { analyzeDraft } from './ai.js';
import { buildOpenapi } from './openapi.js';
import { taskFieldNames, taskThemes, isRecord, isFilled } from './task-schema.js';

initializeStore();
const port = Number(process.env.PORT || 3388);
const send = (res, status, body) => { res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Access-Control-Allow-Origin':process.env.FRONTEND_ORIGIN || 'http://localhost:5173', 'Access-Control-Allow-Headers':'Content-Type', 'Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS', 'Access-Control-Expose-Headers':'X-Request-Id' }); res.end(JSON.stringify(body)); };
const error = (res,status,code,message,details={}) => send(res,status,{error:{code,message,details}});
const sendAsset = (res, type, contents) => { res.writeHead(200, { 'Content-Type': type }); res.end(contents); };
const require = createRequire(import.meta.url);
const swaggerUiPath = dirname(require.resolve('swagger-ui-dist/swagger-ui.css'));
const swaggerAssets = {
  '/api/docs/swagger-ui.css': ['text/css; charset=utf-8', 'swagger-ui.css'],
  '/api/docs/swagger-ui-bundle.js': ['application/javascript; charset=utf-8', 'swagger-ui-bundle.js'],
  '/api/docs/swagger-ui-standalone-preset.js': ['application/javascript; charset=utf-8', 'swagger-ui-standalone-preset.js'],
};
const swaggerPage = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HackAlem AI API</title><link rel="stylesheet" href="/api/docs/swagger-ui.css"></head><body><div id="swagger-ui"></div><script src="/api/docs/swagger-ui-bundle.js"></script><script src="/api/docs/swagger-ui-standalone-preset.js"></script><script>SwaggerUIBundle({url:'/api/openapi.json',dom_id:'#swagger-ui',presets:[SwaggerUIBundle.presets.apis,SwaggerUIStandalonePreset],layout:'StandaloneLayout'});</script></body></html>`;
async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= 1024 * 1024) chunks.push(chunk);
  }
  if (size > 1024 * 1024) throw Object.assign(new Error('Тело запроса превышает 1 МБ.'), { status: 413, code: 'PAYLOAD_TOO_LARGE' });
  if (!size) return {};
  let parsed;
  try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Некорректный JSON'), { status: 400, code: 'INVALID_JSON' }); }
  if (!isRecord(parsed)) throw Object.assign(new Error('Тело запроса должно быть JSON-объектом.'), { status: 400, code: 'VALIDATION_ERROR' });
  return parsed;
}
function validFields(fields) { return isRecord(fields) && Object.entries(fields).every(([key, value]) => taskFieldKeys.has(key) && typeof value === 'string'); }
const taskFieldKeys = new Set(taskFieldNames);
function validConfirmedFields(value) { return Array.isArray(value) && value.every(key => typeof key === 'string' && taskFieldKeys.has(key)); }
function validAnswers(value) { return Array.isArray(value) && value.every(answer => isRecord(answer) && isFilled(answer.questionId) && taskFieldKeys.has(answer.field) && typeof answer.answer === 'string'); }
function validHttpUrl(value) { try { const url = new URL(value); return url.protocol === 'http:' || url.protocol === 'https:'; } catch { return false; } }
async function route(req,res) {
  if (req.method==='OPTIONS') return send(res,204,{});
  const url=new URL(req.url,'http://localhost'), path=url.pathname, data=await body(req);
  if (req.method === 'GET' && path === '/api/openapi.json') return send(res,200,buildOpenapi(process.env.API_BASE_URL));
  if (req.method === 'GET' && (path === '/api/docs' || path === '/api/docs/')) return sendAsset(res, 'text/html; charset=utf-8', swaggerPage);
  if (req.method === 'GET' && swaggerAssets[path]) {
    const [type, filename] = swaggerAssets[path];
    return sendAsset(res, type, readFileSync(join(swaggerUiPath, filename)));
  }
  if (req.method==='GET' && path==='/api/health') return send(res,200,{status:'ok'});
  if (req.method==='GET' && path==='/api/teams') return send(res,200,[...teams.values()]);
  if (req.method==='POST' && path==='/api/task-drafts/analyze') {
    if (typeof data.draft!=='string' || !data.draft.trim()) return error(res,400,'VALIDATION_ERROR','Поле draft обязательно и должно быть строкой.');
    if (data.language !== undefined && typeof data.language !== 'string') return error(res,400,'VALIDATION_ERROR','Поле language должно быть строкой.');
    const result=await analyzeDraft(data.draft,data.language);
    const analysisId=`analysis_${randomUUID()}`; analyses.set(analysisId,{draft:data.draft,...result}); return send(res,200,{analysisId,...result});
  }
  if (req.method==='POST' && path==='/api/task-drafts/compose') {
    if (!isFilled(data.analysisId)) return error(res,400,'VALIDATION_ERROR','Укажите строковый analysisId.');
    if (!data.analysisId || !analyses.has(data.analysisId)) return error(res,404,'NOT_FOUND','Анализ не найден.');
    if (data.draft !== undefined && typeof data.draft !== 'string') return error(res,400,'VALIDATION_ERROR','draft должен быть строкой.');
    if (data.answers !== undefined && !validAnswers(data.answers)) return error(res,400,'VALIDATION_ERROR','answers должен быть массивом ответов questionId, field и answer.');
    if (data.currentFields !== undefined && !validFields(data.currentFields)) return error(res,400,'VALIDATION_ERROR','currentFields должен быть объектом строк.');
    const analysis=analyses.get(data.analysisId), fields={...analysis.extractedFields,...(data.currentFields||{})};
    const answeredIds = new Set();
    for (const answer of data.answers || []) {
      if (answeredIds.has(answer.questionId) || !analysis.questions.some(q => q.id === answer.questionId && q.field === answer.field)) {
        return error(res,400,'VALIDATION_ERROR','Ответ должен соответствовать вопросу анализа и передаваться один раз.');
      }
      answeredIds.add(answer.questionId);
      fields[answer.field] = answer.answer;
    }
    if (data.confirmedFields !== undefined && !validConfirmedFields(data.confirmedFields)) return error(res,400,'VALIDATION_ERROR','confirmedFields должен содержать допустимые имена полей.');
    return send(res,200,{fields,...scoreTask(fields,[])});
  }
  if (req.method==='POST' && path==='/api/tasks') {
    if (!validFields(data.fields)) return error(res,400,'VALIDATION_ERROR','fields должен быть объектом строк.');
    if (data.confirmedFields !== undefined && !validConfirmedFields(data.confirmedFields)) return error(res,400,'VALIDATION_ERROR','confirmedFields должен содержать допустимые имена полей.');
    if (data.theme !== undefined && !taskThemes.includes(data.theme)) return error(res,400,'VALIDATION_ERROR','Недопустимая тема задачи.',{allowedThemes:taskThemes});
    const confirmedFields=data.confirmedFields||[];
    const id=makeId('task'), time=timestamp(), task={id,status:'draft',theme:data.theme ?? null,fields:data.fields,confirmedFields:[...new Set(confirmedFields)],...scoreTask(data.fields,confirmedFields),createdAt:time,updatedAt:time}; tasks.set(id,task); persist(); return send(res,201,task);
  }
  if (req.method==='GET' && path==='/api/tasks') {
    if (url.searchParams.has('theme') && !taskThemes.includes(url.searchParams.get('theme'))) return error(res,400,'VALIDATION_ERROR','Недопустимая тема задачи.',{allowedThemes:taskThemes});
    if (url.searchParams.has('level') && !['draft','working','ready','priority'].includes(url.searchParams.get('level'))) return error(res,400,'VALIDATION_ERROR','Недопустимый уровень готовности.');
    if (url.searchParams.has('sort') && !['score_desc','score_asc'].includes(url.searchParams.get('sort'))) return error(res,400,'VALIDATION_ERROR','Недопустимый вариант сортировки.');
    let list=[...tasks.values()].filter(t=>t.status==='published');
    if (url.searchParams.has('theme')) list=list.filter(t=>t.theme===url.searchParams.get('theme'));
    if (url.searchParams.has('level')) list=list.filter(t=>t.level===url.searchParams.get('level'));
    list.sort((a,b)=>url.searchParams.get('sort')==='score_asc'?a.score-b.score:b.score-a.score); return send(res,200,list);
  }
  let m=path.match(/^\/api\/tasks\/([^/]+)(?:\/(publish|proposals))?$/);
  if (m) {
    const [,id,action]=m, task=tasks.get(id); if (!task) return error(res,404,'NOT_FOUND','Задача не найдена.');
    if (req.method==='GET' && !action) return send(res,200,task);
    if (req.method==='PATCH' && !action) {
      if (!validFields(data.fields)) return error(res,400,'VALIDATION_ERROR','fields должен быть объектом строк.');
      if (!validConfirmedFields(data.confirmedFields)) return error(res,400,'VALIDATION_ERROR','Передайте полный актуальный список confirmedFields (допустим пустой массив).');
      if (data.theme !== undefined && !taskThemes.includes(data.theme)) return error(res,400,'VALIDATION_ERROR','Недопустимая тема задачи.',{allowedThemes:taskThemes});
      task.fields={...task.fields,...data.fields}; task.confirmedFields=[...new Set(data.confirmedFields)];
      if (data.theme !== undefined) task.theme = data.theme;
      Object.assign(task,scoreTask(task.fields,task.confirmedFields),{updatedAt:timestamp()}); persist(); return send(res,200,task);
    }
    if (req.method==='POST' && action==='publish') {
      if (!task.confirmedFields.some(key => taskFieldKeys.has(key) && isFilled(task.fields[key]))) {
        return error(res,409,'UNCONFIRMED_TASK','Перед публикацией подтвердите хотя бы одно заполненное поле карточки.');
      }
      task.status='published'; task.updatedAt=timestamp(); persist(); return send(res,200,task);
    }
    if (req.method==='POST' && action==='proposals') {
      if (task.status!=='published') return error(res,409,'TASK_NOT_PUBLISHED','Отклик возможен только на опубликованную задачу.');
      if (!teams.has(data.teamId) || !['solutionIdea','plan','estimatedTime','prototypeUrl'].every(k=>typeof data[k]==='string'&&data[k].trim()) || !validHttpUrl(data.prototypeUrl)) return error(res,400,'VALIDATION_ERROR','Укажите существующую команду, идею, план, срок и корректную HTTP(S)-ссылку.');
      const proposal={id:makeId('proposal'),taskId:id,teamId:data.teamId,solutionIdea:data.solutionIdea,plan:data.plan,estimatedTime:data.estimatedTime,prototypeUrl:data.prototypeUrl,status:'pending',createdAt:timestamp()}; proposals.set(proposal.id,proposal); persist(); return send(res,201,proposal);
    }
    if (req.method==='GET' && action==='proposals') return send(res,200,[...proposals.values()].filter(p=>p.taskId===id));
  }
  m=path.match(/^\/api\/proposals\/([^/]+)\/status$/);
  if (req.method==='PATCH'&&m) { const p=proposals.get(m[1]); if (!p) return error(res,404,'NOT_FOUND','Отклик не найден.'); if (!['pending','selected','rejected'].includes(data.status)) return error(res,400,'VALIDATION_ERROR','Недопустимый статус.'); p.status=data.status; persist(); return send(res,200,p); }
  return error(res,404,'NOT_FOUND','Маршрут не найден.');
}
export function createServer({ logger = console, logRequests = process.env.REQUEST_LOGGING !== 'false' } = {}) {
  return http.createServer((req, res) => {
    const requestId = randomUUID();
    const startedAt = performance.now();
    let requestUrl;
    try { requestUrl = new URL(req.url, 'http://localhost'); }
    catch { return error(res, 400, 'INVALID_URL', 'Некорректный адрес запроса.'); }
    res.setHeader('X-Request-Id', requestId);
    if (logRequests) {
      res.once('finish', () => logger.info(JSON.stringify({
        event: 'http_request', requestId, method: req.method, path: requestUrl.pathname,
        status: res.statusCode, durationMs: Math.round(performance.now() - startedAt),
      })));
    }
    route(req, res).catch((exception) => {
      if (res.destroyed || res.writableEnded) return;
      error(res, exception.status || 500, exception.status ? exception.code || 'VALIDATION_ERROR' : 'INTERNAL_ERROR', exception.status ? exception.message : 'Внутренняя ошибка сервера.');
    });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const server = createServer();
  let stopping = false;
  const shutdown = (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(`Received ${signal}; closing HackAlem API.`);
    server.close((serverError) => {
      try { closeStore(); } catch (storeError) { console.error(storeError); }
      process.exit(serverError ? 1 : 0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  server.listen(port, () => console.log(`HackAlem API listening on ${port}`));
}
