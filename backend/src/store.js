import { randomUUID } from 'node:crypto';
import { scoreTask } from './scoring.js';
export const tasks = new Map();
export const teams = new Map();
export const proposals = new Map();
export const analyses = new Map();
const now = () => new Date().toISOString();
const sampleFields = (n) => ({ title: `Демонстрационная бизнес-задача ${n}`, context: `Синтетическая задача ${n}: требуется улучшить бизнес-процесс.`, need: 'Снизить трудозатраты сотрудников.', users: 'Сотрудники компании', data: n % 2 ? 'Доступны обезличенные CSV-отчёты' : '', expectedResult: 'Рабочий прототип решения', successCriteria: n < 4 ? '' : 'Сократить время операции на 20%', constraints: 'Без обработки персональных данных', businessLink: 'Операционная эффективность', contact: '', interactionFormat: '' });
export function seed() {
  if (tasks.size) return;
  for (let i=1;i<=5;i++) teams.set(`team_${i}`, { id:`team_${i}`, name:`Демо-команда ${i}`, university:`Университет ${i}` });
  for (let i=1;i<=5;i++) {
    const id=`task_${i}`, fields=sampleFields(i), confirmedFields=Object.keys(fields).filter(k=>fields[k]);
    const createdAt=now(); tasks.set(id,{ id,status:'published',fields,confirmedFields,...scoreTask(fields,confirmedFields),createdAt,updatedAt:createdAt,theme:'operations' });
    const proposalId=`proposal_${i}`; proposals.set(proposalId,{ id:proposalId,taskId:id,teamId:`team_${i}`,solutionIdea:'Синтетическая идея решения',plan:'Исследование, прототипирование и проверка',estimatedTime:'2 недели',prototypeUrl:'https://example.com',status:'pending',createdAt });
  }
}
export const makeId = prefix => `${prefix}_${randomUUID()}`;
export const timestamp = now;
