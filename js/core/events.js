/**
 * Histórico de eventos: a base das análises.
 * Cada evento guarda uma "foto" mínima (label e área) para continuar legível
 * mesmo que a tarefa ou meta seja apagada depois.
 */
import { uid } from '../utils/helpers.js';
import { state } from './store.js';

export function makeEvent(type, entity = null, metadata = {}, createdAt = Date.now()) {
  return {
    id: uid(),
    type,
    entityType: type.split('.')[0],
    entityId: entity?.id ?? null,
    areaId: entity?.areaId ?? null,
    label: entity?.title ?? entity?.text ?? entity?.name ?? null,
    metadata,
    createdAt,
  };
}

/** Eventos que contam como "movimento" numa área da vida. */
export const ACTIVITY_TYPES = new Set([
  'task.created', 'task.started', 'task.completed',
  'goal.created', 'goal.progress', 'goal.step', 'goal.completed',
]);

export const eventsOf = (entityId) => state.events.filter((e) => e.entityId === entityId);

export const eventsBetween = (from, to = Infinity) =>
  state.events.filter((e) => e.createdAt >= from && e.createdAt < to);

export function lastActivityByArea() {
  const map = new Map();
  for (const e of state.events) {
    if (!e.areaId || !ACTIVITY_TYPES.has(e.type)) continue;
    if (e.createdAt > (map.get(e.areaId) || 0)) map.set(e.areaId, e.createdAt);
  }
  return map;
}
