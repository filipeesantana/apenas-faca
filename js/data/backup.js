/** Exportar/importar backup em JSON versionado. */
import { state, commit, replaceAll } from '../core/store.js';
import { DB_VERSION } from '../core/db.js';
import { today, isValidISODate } from '../utils/dates.js';

export const BACKUP_FORMAT = 1;
const APP_ID = 'apenas-faca';

export function buildBackup() {
  return {
    app: APP_ID,
    format: BACKUP_FORMAT,
    schemaVersion: DB_VERSION,
    exportedAt: new Date().toISOString(),
    counts: { tasks: state.tasks.size, goals: state.goals.size, areas: state.areas.size, inbox: state.inbox.size, events: state.events.length },
    data: {
      tasks: [...state.tasks.values()],
      goals: [...state.goals.values()],
      areas: [...state.areas.values()],
      inbox: [...state.inbox.values()],
      events: state.events,
      settings: { ...state.settings },
    },
  };
}

export async function exportBackup() {
  const json = JSON.stringify(buildBackup(), null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `apenas-faca-backup-${today()}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  await commit({ settings: { lastExportAt: Date.now() } });
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.length > 0;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Normaliza registros, preenchendo campos que versões futuras/antigas possam não ter. */
function normalizeTask(t) {
  return {
    notes: '', areaId: null, goalId: null, importance: 'normal', dueDate: null, startedAt: null,
    completedAt: null, droppedAt: null, postponedCount: 0, source: 'direct', updatedAt: t.createdAt, ...t,
    dueDate: isValidISODate(t.dueDate) ? t.dueDate : null,
  };
}
function normalizeGoal(g) {
  return { notes: '', areaId: null, unit: '', steps: [], targetDate: null, milestonesReached: [], completedAt: null, updatedAt: g.createdAt, currentValue: 0, ...g,
    targetDate: isValidISODate(g.targetDate) ? g.targetDate : null };
}

/** Migração entre formatos de backup (hoje só existe o formato 1). */
function migrate(obj) {
  // if (obj.format === 1) { ...converter para 2...; obj.format = 2; }
  return obj;
}

export function validateBackup(raw) {
  if (!isObj(raw) || raw.app !== APP_ID) return { ok: false, error: 'Este arquivo não parece ser um backup do Apenas, Faça.' };
  if (!isNum(raw.format)) return { ok: false, error: 'O arquivo não informa a versão do backup.' };
  if (raw.format > BACKUP_FORMAT) return { ok: false, error: 'Este backup foi criado por uma versão mais nova do aplicativo.' };
  const obj = migrate(raw);
  const d = obj.data;
  if (!isObj(d)) return { ok: false, error: 'O backup está incompleto (sem dados).' };
  for (const key of ['tasks', 'goals', 'areas', 'inbox', 'events']) {
    if (!Array.isArray(d[key])) return { ok: false, error: `O backup está incompleto (faltam “${key}”).` };
  }
  const bad = (list, test) => list.findIndex((r) => !isObj(r) || !test(r));
  const checks = [
    ['tarefas', d.tasks, (t) => isStr(t.id) && typeof t.title === 'string' && ['pending', 'doing', 'done', 'dropped'].includes(t.status) && isNum(t.createdAt)],
    ['metas', d.goals, (g) => isStr(g.id) && typeof g.title === 'string' && ['money', 'count', 'steps'].includes(g.type) && ['active', 'done', 'archived'].includes(g.status) && isNum(g.createdAt)],
    ['áreas', d.areas, (a) => isStr(a.id) && isStr(a.name)],
    ['caixa de entrada', d.inbox, (i) => isStr(i.id) && typeof i.text === 'string' && isNum(i.createdAt)],
    ['histórico', d.events, (e) => isStr(e.id) && isStr(e.type) && isNum(e.createdAt)],
  ];
  for (const [label, list, test] of checks) {
    const i = bad(list, test);
    if (i >= 0) return { ok: false, error: `Um registro de ${label} está em formato inválido (posição ${i + 1}).` };
  }
  return {
    ok: true,
    exportedAt: obj.exportedAt,
    counts: { tasks: d.tasks.length, goals: d.goals.length, areas: d.areas.length, inbox: d.inbox.length, events: d.events.length },
    data: {
      tasks: d.tasks.map(normalizeTask),
      goals: d.goals.map(normalizeGoal),
      areas: d.areas.map((a, i) => ({ color: 'slate', order: i, createdAt: Date.now(), ...a })),
      inbox: d.inbox.map((i) => ({ status: 'open', updatedAt: i.createdAt, ...i })),
      events: d.events.map((e) => ({ metadata: {}, entityId: null, areaId: null, label: null, entityType: e.type.split('.')[0], ...e })),
      settings: isObj(d.settings) ? { ...d.settings, initialized: true } : { initialized: true, firstRunAt: Date.now() },
    },
  };
}

export async function readBackupFile(file) {
  if (file.size > 50 * 1024 * 1024) throw new Error('Arquivo grande demais para ser um backup.');
  const text = await file.text();
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error('O arquivo não é um JSON válido.'); }
  const res = validateBackup(raw);
  if (!res.ok) throw new Error(res.error);
  return res;
}

export async function applyBackup(res) {
  const theme = state.settings.theme;
  await replaceAll({ ...res.data, settings: { theme, ...res.data.settings, demo: false } });
}
