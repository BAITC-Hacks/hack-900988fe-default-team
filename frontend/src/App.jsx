import { useEffect, useMemo, useState } from 'react';
import { apiAdapter, apiMode } from './api/adapter';
import { calculateScore } from './api/mockAdapter';

const initialDraft = 'Хотим сократить очереди в корпоративной столовой с помощью AI.';
const labels = { draft: 'Черновик', working: 'Рабочая', ready: 'Готовая', priority: 'Приоритетная' };
const editable = ['title', 'context', 'need', 'users', 'data', 'expectedResult', 'successCriteria', 'constraints', 'businessLink', 'contact', 'interactionFormat'];
const fieldLabels = { title: 'Название', context: 'Контекст', need: 'Потребность бизнеса', users: 'Пользователи', data: 'Данные и материалы', expectedResult: 'Ожидаемый результат', successCriteria: 'Критерии успеха', constraints: 'Ограничения', businessLink: 'Связь с бизнесом', contact: 'Контакт', interactionFormat: 'Формат взаимодействия' };
const themes = ['AI и данные', 'Экология', 'Сервис', 'Логистика', 'Образование'];

function readRoute() {
  const taskMatch = window.location.pathname.match(/^\/tasks\/([^/]+)$/);
  if (taskMatch) return { page: 'detail', taskId: decodeURIComponent(taskMatch[1]) };
  return { page: window.location.pathname === '/catalog' ? 'catalog' : 'constructor' };
}

export default function App() {
  const [role, setRole] = useState('business');
  const [draft, setDraft] = useState(initialDraft);
  const [analysis, setAnalysis] = useState(null);
  const [answers, setAnswers] = useState({});
  const [card, setCard] = useState(null);
  const [task, setTask] = useState(null);
  const [proposal, setProposal] = useState(null);
  const [page, setPage] = useState(() => readRoute().page);
  const [catalog, setCatalog] = useState([]);
  const [filters, setFilters] = useState({ theme: '', level: '', sort: 'score_desc' });
  const [selectedTask, setSelectedTask] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [proposalForm, setProposalForm] = useState({ teamId: 'team_1', solutionIdea: '', plan: '', estimatedTime: '', prototypeUrl: '' });
  const score = useMemo(() => card?.score ?? 0, [card]);

  useEffect(() => {
    if (page !== 'catalog') return;
    request(async () => setCatalog(await apiAdapter.listTasks(filters)));
  }, [page, filters]);

  useEffect(() => {
    function handlePopState() {
      const route = readRoute();
      if (route.page === 'detail') openTask(route.taskId, false);
      else setPage(route.page);
    }
    handlePopState();
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  async function request(action) {
    setLoading(true); setError(''); setNotice('');
    try { await action(); } catch (requestError) { setError(requestError.message || 'Не удалось выполнить запрос. Проверьте соединение и повторите попытку.'); } finally { setLoading(false); }
  }
  function updateCard(key, value) {
    setCard((current) => {
      const fields = { ...current.fields, [key]: value };
      const confirmedFields = current.confirmedFields.filter((field) => field !== key);
      return { ...current, fields, confirmedFields, ...calculateScore(fields, confirmedFields) };
    });
  }
  function toggleConfirmed(key) {
    setCard((current) => {
      const confirmedFields = current.confirmedFields.includes(key) ? current.confirmedFields.filter((field) => field !== key) : [...current.confirmedFields, key];
      return { ...current, confirmedFields, ...calculateScore(current.fields, confirmedFields) };
    });
  }
  function navigate(nextPage, taskId) {
    const path = nextPage === 'detail' ? `/tasks/${encodeURIComponent(taskId)}` : nextPage === 'catalog' ? '/catalog' : '/';
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    setPage(nextPage);
  }
  async function analyze() { await request(async () => setAnalysis(await apiAdapter.analyze(draft))); }
  async function compose() { await request(async () => { const composed = await apiAdapter.compose({ analysisId: analysis.analysisId, draft, answers: analysis.questions.map((q) => ({ questionId: q.id, field: q.field, answer: answers[q.id] || '' })), currentFields: analysis.extractedFields }); setCard({ ...composed, confirmedFields: [] }); }); }
  async function saveDraft() { await request(async () => { const { confirmedFields } = card; const saved = task ? await apiAdapter.updateTask(task.id, { fields: card.fields, confirmedFields }) : await apiAdapter.createTask({ fields: card.fields, confirmedFields }); setTask(saved); setCard({ ...card, ...saved, confirmedFields: saved.confirmedFields || confirmedFields }); setNotice('Карточка сохранена как черновик.'); }); }
  async function publish() { await request(async () => { const published = await apiAdapter.publish(task); setTask(published); setNotice('Задача опубликована в каталоге.'); }); }
  async function sendProposal(event) { event.preventDefault(); await request(async () => { setProposal(await apiAdapter.createProposal({ taskId: task.id, ...proposalForm })); setNotice('Отклик команды отправлен бизнесу.'); }); }
  async function choose(status) { await request(async () => { setProposal(await apiAdapter.setProposalStatus(proposal, status)); setNotice(status === 'selected' ? 'Команда выбрана вручную.' : 'Отклик отклонён.'); }); }
  async function openTask(taskId, addToHistory = true) {
    await request(async () => {
      const detail = await apiAdapter.getTask(taskId);
      setSelectedTask(detail);
      setProposals(await apiAdapter.getProposals(taskId));
      if (addToHistory) navigate('detail', taskId);
      else setPage('detail');
    });
  }
  async function sendDetailProposal(event) {
    event.preventDefault();
    await request(async () => {
      const created = await apiAdapter.createProposal({ taskId: selectedTask.id, ...proposalForm });
      setProposals((current) => [created, ...current]);
      setProposalForm({ teamId: 'team_1', solutionIdea: '', plan: '', estimatedTime: '', prototypeUrl: '' });
      setNotice('Отклик команды отправлен бизнесу.');
    });
  }
  async function setDetailProposalStatus(item, status) {
    await request(async () => {
      const updated = await apiAdapter.setProposalStatus(item, status);
      setProposals((current) => current.map((proposalItem) => proposalItem.id === updated.id ? updated : proposalItem));
      setNotice(status === 'selected' ? 'Команда выбрана вручную.' : 'Отклик отклонён.');
    });
  }

  if (page === 'catalog') return <CatalogPage role={role} setRole={setRole} filters={filters} setFilters={setFilters} catalog={catalog} loading={loading} openTask={openTask} goConstructor={() => navigate('constructor')} />;
  if (page === 'detail' && selectedTask) return <DetailPage task={selectedTask} role={role} setRole={setRole} proposals={proposals} proposalForm={proposalForm} setProposalForm={setProposalForm} loading={loading} sendProposal={sendDetailProposal} choose={setDetailProposalStatus} back={() => navigate('catalog')} notice={notice} error={error} />;

  return <main>
    <header><div><span className="brand">HackAlem AI</span><span className="subtitle">каталог бизнес-задач для студенческих команд</span></div><nav className="navigation" aria-label="Основная навигация"><button onClick={() => navigate('catalog')}>Каталог задач</button>{role === 'business' && <button className="active" onClick={() => navigate('constructor')}>Создать задачу</button>}</nav><div className="roles"><button className={role === 'business' ? 'active' : ''} onClick={() => { setRole('business'); navigate('constructor'); }}>Бизнес</button><button className={role === 'team' ? 'active' : ''} onClick={() => { setRole('team'); navigate('catalog'); }}>Команда</button></div></header>
    <section className="hero"><p className="eyebrow">{role === 'business' ? 'AI-конструктор задачи' : 'Каталог возможностей'} · {apiMode === 'api' ? 'API подключён' : 'демо-данные'}</p><h1>{role === 'business' ? 'Превратите идею в понятную задачу' : 'Найдите задачу для вашей команды'}</h1><p>AI помогает собрать недостающий контекст, а решение о публикации и выборе команды остаётся за человеком.</p></section>
    {error && <p className="message error">{error}</p>}{notice && <p className="message">{notice}</p>}
    {role === 'business' && <section className="grid">
      <article className="panel"><h2>1. Черновик</h2><label>Опишите бизнес-задачу<textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows="5" /></label><button disabled={loading || !draft.trim()} onClick={analyze}>{loading ? 'Анализируем…' : 'Найти пробелы'}</button></article>
      <article className="panel"><h2>2. Уточняющие вопросы</h2>{analysis ? <><p>Нужно уточнить {analysis.missingFields.length} поля. {analysis.fallbackUsed && 'Используется надёжный fallback-сценарий.'}</p>{analysis.questions.map((q) => <label key={q.id}>{q.text}<input value={answers[q.id] || ''} onChange={(event) => setAnswers({ ...answers, [q.id]: event.target.value })} /></label>)}<button disabled={loading} onClick={compose}>Собрать карточку</button></> : <p className="muted">После анализа здесь появятся минимум три вопроса.</p>}</article>
      <article className="panel wide"><h2>3. Редактор карточки и рейтинг</h2>{card ? <div className="editor"><div className="score"><strong>{score}</strong><span>из 100</span><b>{labels[card.level]}</b></div><div className="fields">{editable.map((key) => <div className="field-editor" key={key}><label>{fieldLabels[key]}<input value={card.fields[key] || ''} onChange={(event) => updateCard(key, event.target.value)} /></label>{key !== 'title' && <label className="confirmation"><input type="checkbox" checked={card.confirmedFields.includes(key)} disabled={!card.fields[key]?.trim()} onChange={() => toggleConfirmed(key)} />Подтверждено вручную</label>}</div>)}</div><div className="breakdown">{card.scoreBreakdown.map((item) => <div key={item.key}><span>{item.label}</span><b>{item.earned}/{item.max}</b></div>)}</div><div className="actions"><button disabled={loading} onClick={saveDraft}>Сохранить черновик</button><button className="primary" disabled={loading || !task} onClick={publish}>Опубликовать</button></div></div> : <p className="muted">Ответьте на вопросы, затем подтвердите поля, которые готовы опубликовать.</p>}</article>
    </section>}
    {task?.status === 'published' && <section className="catalog"><h2>Опубликовано в каталоге</h2><article className="task-card"><span className="badge">{labels[task.level]}</span><h3>{task.fields.title}</h3><p>{task.fields.need || task.fields.context}</p><strong>{task.score}/100</strong></article></section>}
    {(role === 'team' || task?.status === 'published') && <section className="panel proposal"><h2>Отклик команды</h2>{!task ? <p className="muted">Опубликованные задачи появятся здесь.</p> : <form onSubmit={sendProposal}>{[['solutionIdea','Идея решения'],['plan','План работы'],['estimatedTime','Срок'],['prototypeUrl','Ссылка на прототип']].map(([key, label]) => <label key={key}>{label}<input required value={proposalForm[key]} onChange={(event) => setProposalForm({ ...proposalForm, [key]: event.target.value })} /></label>)}<button disabled={loading}>Отправить отклик</button></form>}{proposal && <div className="proposal-status"><p>Статус: <b>{proposal.status === 'pending' ? 'на рассмотрении' : proposal.status === 'selected' ? 'выбрана' : 'отклонена'}</b></p>{role === 'business' && proposal.status === 'pending' && <div className="actions"><button className="primary" onClick={() => choose('selected')}>Выбрать команду</button><button onClick={() => choose('rejected')}>Отклонить</button></div>}</div>}</section>}
  </main>;
}

function CatalogPage({ role, setRole, filters, setFilters, catalog, loading, openTask, goConstructor }) {
  return <main>
    <header><div><span className="brand">HackAlem AI</span><span className="subtitle">каталог бизнес-задач для студенческих команд</span></div><nav className="navigation" aria-label="Основная навигация"><button className="active">Каталог задач</button>{role === 'business' && <button onClick={goConstructor}>Создать задачу</button>}</nav><div className="roles"><button className={role === 'business' ? 'active' : ''} onClick={() => { setRole('business'); goConstructor(); }}>Бизнес</button><button className={role === 'team' ? 'active' : ''} onClick={() => setRole('team')}>Команда</button></div></header>
    <section className="hero compact"><p className="eyebrow">Опубликованные задачи</p><h1>Каталог возможностей</h1><p>Выберите задачу по теме и уровню готовности. Самые высоко оценённые задачи показаны первыми.</p></section>
    <section className="panel filters" aria-label="Фильтры каталога"><label>Тема<select value={filters.theme} onChange={(event) => setFilters({ ...filters, theme: event.target.value })}><option value="">Все темы</option>{themes.map((theme) => <option key={theme} value={theme}>{theme}</option>)}</select></label><label>Готовность<select value={filters.level} onChange={(event) => setFilters({ ...filters, level: event.target.value })}><option value="">Все уровни</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Сортировка<select value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value })}><option value="score_desc">Сначала высокий рейтинг</option><option value="score_asc">Сначала низкий рейтинг</option></select></label></section>
    <section className="catalog-grid" aria-live="polite">{catalog.length ? catalog.map((item) => <button className="task-card task-link" key={item.id} onClick={() => openTask(item.id)} disabled={loading}><span className="badge">{labels[item.level]}</span><span className="theme">{item.theme}</span><h2>{item.fields.title}</h2><p>{item.fields.need || item.fields.context}</p><strong>{item.score}/100</strong><span className="open-link">Открыть задачу →</span></button>) : <p className="panel muted">По этим фильтрам опубликованных задач пока нет.</p>}</section>
  </main>;
}

function DetailPage({ task, role, setRole, proposals, proposalForm, setProposalForm, loading, sendProposal, choose, back, notice, error }) {
  return <main>
    <header><button className="brand brand-button" onClick={back}>HackAlem AI</button><div className="roles"><button className={role === 'business' ? 'active' : ''} onClick={() => setRole('business')}>Бизнес</button><button className={role === 'team' ? 'active' : ''} onClick={() => setRole('team')}>Команда</button></div></header>
    {error && <p className="message error" role="alert">{error}</p>}{notice && <p className="message" role="status">{notice}</p>}
    <section className="detail-heading"><button className="back" onClick={back}>← К каталогу</button><p className="eyebrow">{task.theme}</p><div className="detail-title"><div><h1>{task.fields.title}</h1><p>{task.fields.need}</p></div><div className="score"><strong>{task.score}</strong><span>из 100</span><b>{labels[task.level]}</b></div></div></section>
    <section className="detail-grid"><article className="panel"><h2>О задаче</h2>{editable.filter((key) => key !== 'title' && task.fields[key]).map((key) => <div className="detail-field" key={key}><h3>{fieldLabels[key]}</h3><p>{task.fields[key]}</p></div>)}</article><article className="panel"><h2>Рейтинг готовности</h2><div className="breakdown">{task.scoreBreakdown.map((item) => <div key={item.key}><span>{item.label}</span><b>{item.earned}/{item.max}</b></div>)}</div></article></section>
    {role === 'team' ? <section className="panel proposal"><h2>Отклик команды</h2><form onSubmit={sendProposal}><label>ID команды<input required value={proposalForm.teamId} onChange={(event) => setProposalForm({ ...proposalForm, teamId: event.target.value })} /></label>{[['solutionIdea', 'Идея решения'], ['plan', 'План работы'], ['estimatedTime', 'Срок'], ['prototypeUrl', 'Ссылка на прототип']].map(([key, label]) => <label key={key}>{label}<input required value={proposalForm[key]} onChange={(event) => setProposalForm({ ...proposalForm, [key]: event.target.value })} /></label>)}<button className="primary" disabled={loading}>Отправить отклик</button></form></section> : <section className="panel proposal"><h2>Отклики команд</h2>{proposals.length ? proposals.map((item) => <article className="proposal-card" key={item.id}><h3>{item.teamId} · {item.estimatedTime}</h3><p><b>Идея:</b> {item.solutionIdea}</p><p><b>План:</b> {item.plan}</p><a href={item.prototypeUrl} target="_blank" rel="noreferrer">Открыть прототип</a><p>Статус: <b>{item.status === 'pending' ? 'на рассмотрении' : item.status === 'selected' ? 'выбрана' : 'отклонена'}</b></p>{item.status === 'pending' && <div className="actions"><button className="primary" onClick={() => choose(item, 'selected')}>Выбрать команду</button><button onClick={() => choose(item, 'rejected')}>Отклонить</button></div>}</article>) : <p className="muted">Откликов пока нет. Команды смогут отправить их с этой страницы.</p>}</section>}
  </main>;
}
