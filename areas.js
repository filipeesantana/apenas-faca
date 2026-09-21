/** Áreas da vida: estrutura de apoio, não uma página que exige configuração. */
import { state, commit } from '../core/store.js';
import { makeEvent } from '../core/events.js';
import { uid } from '../utils/helpers.js';

export const AREA_COLORS = ['blue', 'violet', 'green', 'rose', 'amber', 'teal', 'slate', 'orange'];

const DEFAULT_AREAS = [
  ['Estudos', 'blue'],
  ['Trabalho', 'violet'],
  ['Dinheiro', 'green'],
  ['Saúde', 'rose'],
  ['Pessoal', 'amber'],
  ['Casa', 'teal'],
];

export const listAreas = () =>
  [...state.areas.values()].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);

export const getArea = (id) => (id ? state.areas.get(id) || null : null);
export const areaName = (id) => getArea(id)?.name || 'Sem área';

export function buildDefaultAreas(now = Date.now()) {
  return DEFAULT_AREAS.map(([name, color], i) => ({ id: uid(), name, color, order: i, createdAt: now }));
}

/** Primeiro uso: cria as áreas padrão sem perguntar nada ao usuário. */
export async function ensureInitialized() {
  if (state.settings.initialized) return;
  const areas = state.areas.size ? [] : buildDefaultAreas();
  await commit({
    put: { areas },
    settings: { initialized: true, firstRunAt: Date.now(), theme: state.settings.theme || 'system' },
  });
}

export async function createArea(name) {
  const clean = name.trim().slice(0, 40);
  if (!clean) return null;
  if (listAreas().some((a) => a.name.toLowerCase() === clean.toLowerCase())) {
    throw new Error('Já existe uma área com esse nome.');
  }
  const used = new Set(listAreas().map((a) => a.color));
  const color = AREA_COLORS.find((c) => !used.has(c)) || AREA_COLORS[state.areas.size % AREA_COLORS.length];
  const order = Math.max(-1, ...listAreas().map((a) => a.order)) + 1;
  const area = { id: uid(), name: clean, color, order, createdAt: Date.now() };
  await commit({ put: { areas: [area] }, events: [makeEvent('area.created', { ...area, areaId: area.id })] });
  return area;
}

export async function renameArea(id, name) {
  const area = getArea(id);
  const clean = name.trim().slice(0, 40);
  if (!area || !clean || clean === area.name) return null;
  if (listAreas().some((a) => a.id !== id && a.name.toLowerCase() === clean.toLowerCase())) {
    throw new Error('Já existe uma área com esse nome.');
  }
  const next = { ...area, name: clean };
  return commit({ put: { areas: [next] }, events: [makeEvent('area.renamed', { ...next, areaId: id }, { from: area.name })] });
}

export function cycleAreaColor(id) {
  const area = getArea(id);
  if (!area) return null;
  const color = AREA_COLORS[(AREA_COLORS.indexOf(area.color) + 1) % AREA_COLORS.length];
  return commit({ put: { areas: [{ ...area, color }] } });
}

/** Remove a área; tarefas e metas continuam existindo, apenas sem área. */
export function deleteArea(id) {
  const area = getArea(id);
  if (!area) return null;
  const now = Date.now();
  const tasks = [...state.tasks.values()].filter((t) => t.areaId === id).map((t) => ({ ...t, areaId: null, updatedAt: now }));
  const goals = [...state.goals.values()].filter((g) => g.areaId === id).map((g) => ({ ...g, areaId: null, updatedAt: now }));
  return commit({
    put: { tasks, goals },
    del: { areas: [id] },
    events: [makeEvent('area.deleted', { ...area, areaId: id }, { name: area.name })],
  });
}

export function areaUsage(id) {
  const tasks = [...state.tasks.values()].filter((t) => t.areaId === id).length;
  const goals = [...state.goals.values()].filter((g) => g.areaId === id).length;
  return { tasks, goals };
}
