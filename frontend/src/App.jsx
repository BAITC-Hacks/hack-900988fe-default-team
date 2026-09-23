import { useMemo, useState } from 'react';
import { calculateScore, mockAdapter } from './api/mockAdapter';

const initialDraft = 'Хотим сократить очереди в корпоративной столовой с помощью AI.';
const labels = { draft: 'Черновик', working: 'Рабочая', ready: 'Готовая', priority: 'Приоритетная' };
const editable = ['title', 'context', 'need', 'users', 'data', 'expectedResult', 'successCriteria', 'constraints', 'contact', 'interactionFormat'];

export default function App() {
  const [role, setRole] = useState('business');
  const [draft, setDraft] = useState(initialDraft);
  const [analysis, setAnalysis] = useState(null);
  const [answers, setAnswers] = useState({});
  const [card, setCard] = useState(null);
  const [task, setTask] = useState(null);
  const [proposal, setProposal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [proposalForm, setProposalForm] = useState({ teamId: 'team_1', solutionIdea: '', plan: '', estimatedTime: '', prototypeUrl: '' });
  const score = useMemo(() => card?.score ?? 0, [card]);

  async function request(action) {
    setLoading(true); setError(''); setNotice('');
    try { await action(); } catch { setError('Не удалось выполнить запрос. Проверьте соединение и повторите попытку.'); } finally { setLoading(false); }
  }
  function updateCard(key, value) {
    setCard((current) => {
      const fields = { ...current.fields, [key]: value };
      return { ...current, fields, ...calculateScore(fields) };
    });
  }
  async function analyze() { await request(async () => setAnalysis(await mockAdapter.analyze(draft))); }
  async function compose() { await request(async () => setCard(await mockAdapter.compose({ draft, answers: analysis.questions.map((q) => ({ questionId: q.id, field: q.field, answer: answers[q.id] || '' })), currentFields: analysis.extractedFields }))); }
  async function saveDraft() { await request(async () => { const saved = await mockAdapter.createTask({ fields: card.fields, confirmedFields: editable.filter((key) => card.fields[key]?.trim()) }); setTask(saved); setCard({ ...card, ...saved }); setNotice('Карточка сохранена как черновик.'); }); }
  async function publish() { await request(async () => { const published = await mockAdapter.publish(task || { ...card, id: 'task_demo' }); setTask(published); setNotice('Задача опубликована в каталоге.'); }); }
  async function sendProposal(event) { event.preventDefault(); await request(async () => { setProposal(await mockAdapter.createProposal(proposalForm)); setNotice('Отклик команды отправлен бизнесу.'); }); }
  async function choose(status) { await request(async () => { setProposal(await mockAdapter.setProposalStatus(proposal, status)); setNotice(status === 'selected' ? 'Команда выбрана вручную.' : 'Отклик отклонён.'); }); }

  return <main>
    <header><div><span className="brand">HackAlem AI</span><span className="subtitle">каталог бизнес-задач для студенческих команд</span></div><div className="roles"><button className={role === 'business' ? 'active' : ''} onClick={() => setRole('business')}>Бизнес</button><button className={role === 'team' ? 'active' : ''} onClick={() => setRole('team')}>Команда</button></div></header>
    <section className="hero"><p className="eyebrow">{role === 'business' ? 'AI-конструктор задачи' : 'Каталог возможностей'}</p><h1>{role === 'business' ? 'Превратите идею в понятную задачу' : 'Найдите задачу для вашей команды'}</h1><p>AI помогает собрать недостающий контекст, а решение о публикации и выборе команды остаётся за человеком.</p></section>
    {error && <p className="message error">{error}</p>}{notice && <p className="message">{notice}</p>}
    {role === 'business' && <section className="grid">
      <article className="panel"><h2>1. Черновик</h2><label>Опишите бизнес-задачу<textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows="5" /></label><button disabled={loading || !draft.trim()} onClick={analyze}>{loading ? 'Анализируем…' : 'Найти пробелы'}</button></article>
      <article className="panel"><h2>2. Уточняющие вопросы</h2>{analysis ? <><p>Нужно уточнить {analysis.missingFields.length} поля. {analysis.fallbackUsed && 'Используется надёжный fallback-сценарий.'}</p>{analysis.questions.map((q) => <label key={q.id}>{q.text}<input value={answers[q.id] || ''} onChange={(event) => setAnswers({ ...answers, [q.id]: event.target.value })} /></label>)}<button disabled={loading} onClick={compose}>Собрать карточку</button></> : <p className="muted">После анализа здесь появятся минимум три вопроса.</p>}</article>
      <article className="panel wide"><h2>3. Редактор карточки и рейтинг</h2>{card ? <div className="editor"><div className="score"><strong>{score}</strong><span>из 100</span><b>{labels[card.level]}</b></div><div className="fields">{editable.map((key) => <label key={key}>{key}<input value={card.fields[key] || ''} onChange={(event) => updateCard(key, event.target.value)} /></label>)}</div><div className="breakdown">{card.scoreBreakdown.map((item) => <div key={item.key}><span>{item.label}</span><b>{item.earned}/{item.max}</b></div>)}</div><div className="actions"><button disabled={loading} onClick={saveDraft}>Сохранить черновик</button><button className="primary" disabled={loading || !task} onClick={publish}>Опубликовать</button></div></div> : <p className="muted">Ответьте на вопросы, чтобы открыть редактор.</p>}</article>
    </section>}
    {task?.status === 'published' && <section className="catalog"><h2>Опубликовано в каталоге</h2><article className="task-card"><span className="badge">{labels[task.level]}</span><h3>{task.fields.title}</h3><p>{task.fields.need || task.fields.context}</p><strong>{task.score}/100</strong></article></section>}
    {(role === 'team' || task?.status === 'published') && <section className="panel proposal"><h2>Отклик команды</h2>{!task ? <p className="muted">Опубликованные задачи появятся здесь.</p> : <form onSubmit={sendProposal}>{[['solutionIdea','Идея решения'],['plan','План работы'],['estimatedTime','Срок'],['prototypeUrl','Ссылка на прототип']].map(([key, label]) => <label key={key}>{label}<input required value={proposalForm[key]} onChange={(event) => setProposalForm({ ...proposalForm, [key]: event.target.value })} /></label>)}<button disabled={loading}>Отправить отклик</button></form>}{proposal && <div className="proposal-status"><p>Статус: <b>{proposal.status === 'pending' ? 'на рассмотрении' : proposal.status === 'selected' ? 'выбрана' : 'отклонена'}</b></p>{role === 'business' && proposal.status === 'pending' && <div className="actions"><button className="primary" onClick={() => choose('selected')}>Выбрать команду</button><button onClick={() => choose('rejected')}>Отклонить</button></div>}</div>}</section>}
  </main>;
}
