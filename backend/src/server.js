import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { tasks, teams, proposals, analyses, seed, makeId, timestamp } from './store.js';
import { scoreTask } from './scoring.js';
import { analyzeDraft, fallbackAnalysis } from './ai.js';

seed();
const port = Number(process.env.PORT || 3000);
const send = (res, status, body) => { res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Access-Control-Allow-Origin':process.env.FRONTEND_ORIGIN || 'http://localhost:5173', 'Access-Control-Allow-Headers':'Content-Type', 'Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS' }); res.end(JSON.stringify(body)); };
const error = (res,status,code,message,details={}) => send(res,status,{error:{code,message,details}});
async function body(req) { let raw=''; for await (const chunk of req) raw += chunk; if (!raw) return {}; try { return JSON.parse(raw); } catch { throw Object.assign(new Error('Некорректный JSON'),{status:400,code:'INVALID_JSON'}); } }
function validFields(fields) { return fields && typeof fields === 'object' && !Array.isArray(fields) && Object.values(fields).every(v=>typeof v==='string'); }
const json = value => JSON.stringify(value);
async function route(req,res) {
  if (req.method==='OPTIONS') return send(res,204,{});
  const url=new URL(req.url,'http://localhost'), path=url.pathname, data=await body(req);
  if (req.method==='GET' && path==='/api/health') return send(res,200,{status:'ok'});
  if (req.method==='POST' && path==='/api/task-drafts/analyze') {
    if (typeof data.draft!=='string' || !data.draft.trim()) return error(res,400,'VALIDATION_ERROR','Поле draft обязательно и должно быть строкой.');
    const result=process.env.OPENAI_API_KEY ? await analyzeDraft(data.draft,data.language) : fallbackAnalysis(data.draft);
    const analysisId=`analysis_${randomUUID()}`; analyses.set(analysisId,{draft:data.draft,...result}); return send(res,200,{analysisId,...result});
  }
  if (req.method==='POST' && path==='/api/task-drafts/compose') {
    if (!data.analysisId || !analyses.has(data.analysisId)) return error(res,404,'NOT_FOUND','Анализ не найден.');
    const analysis=analyses.get(data.analysisId), fields={...analysis.extractedFields,...(data.currentFields||{})};
    for (const answer of (Array.isArray(data.answers)?data.answers:[])) if (answer && analysis.questions.some(q=>q.id===answer.questionId && q.field===answer.field) && typeof answer.answer==='string') fields[answer.field]=answer.answer;
    const confirmedFields=Array.isArray(data.confirmedFields)?data.confirmedFields:[];
    return send(res,200,{fields,...scoreTask(fields,confirmedFields)});
  }
  if (req.method==='POST' && path==='/api/tasks') {
    if (!validFields(data.fields)) return error(res,400,'VALIDATION_ERROR','fields должен быть объектом строк.');
    const id=makeId('task'), time=timestamp(), task={id,status:'draft',fields:data.fields,confirmedFields:Array.isArray(data.confirmedFields)?data.confirmedFields:[],...scoreTask(data.fields,data.confirmedFields),createdAt:time,updatedAt:time}; tasks.set(id,task); return send(res,201,task);
  }
  if (req.method==='GET' && path==='/api/tasks') {
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
      task.fields={...task.fields,...data.fields}; task.confirmedFields=Array.isArray(data.confirmedFields)?[...new Set(data.confirmedFields)]:task.confirmedFields; Object.assign(task,scoreTask(task.fields,task.confirmedFields),{updatedAt:timestamp()}); return send(res,200,task);
    }
    if (req.method==='POST' && action==='publish') { task.status='published'; task.updatedAt=timestamp(); return send(res,200,task); }
    if (req.method==='POST' && action==='proposals') {
      if (task.status!=='published') return error(res,409,'TASK_NOT_PUBLISHED','Отклик возможен только на опубликованную задачу.');
      if (!teams.has(data.teamId) || !['solutionIdea','plan','estimatedTime','prototypeUrl'].every(k=>typeof data[k]==='string'&&data[k].trim())) return error(res,400,'VALIDATION_ERROR','Укажите существующую команду, идею, план, срок и ссылку.');
      const proposal={id:makeId('proposal'),taskId:id,teamId:data.teamId,solutionIdea:data.solutionIdea,plan:data.plan,estimatedTime:data.estimatedTime,prototypeUrl:data.prototypeUrl,status:'pending',createdAt:timestamp()}; proposals.set(proposal.id,proposal); return send(res,201,proposal);
    }
    if (req.method==='GET' && action==='proposals') return send(res,200,[...proposals.values()].filter(p=>p.taskId===id));
  }
  m=path.match(/^\/api\/proposals\/([^/]+)\/status$/);
  if (req.method==='PATCH'&&m) { const p=proposals.get(m[1]); if (!p) return error(res,404,'NOT_FOUND','Отклик не найден.'); if (!['pending','selected','rejected'].includes(data.status)) return error(res,400,'VALIDATION_ERROR','Недопустимый статус.'); p.status=data.status; return send(res,200,p); }
  return error(res,404,'NOT_FOUND','Маршрут не найден.');
}
http.createServer((req,res)=>route(req,res).catch(e=>error(res,e.status||500,e.code||'INTERNAL_ERROR',e.status?e.message:'Внутренняя ошибка сервера.'))).listen(port,()=>console.log(`HackAlem API listening on ${port}`));
