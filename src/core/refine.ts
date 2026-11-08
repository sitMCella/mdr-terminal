import type { Rng } from './rng';
import type { Point, SimState } from './types';

/**
 * Refine a group: count it in its bin and launch its cells toward the bin.
 * Returns false when the group cannot be refined (unknown or not active).
 */
export function refineGroup(state: SimState, groupId: number, startPositions: ReadonlyMap<number, Point>): boolean {
  const group = state.groups.get(groupId);
  if (!group || group.state !== 'active') return false;

  group.state = 'refining';
  group.superActive = false;
  state.bins[group.binIndex]!.refined++;

  for (const cellId of group.cellIds) {
    const cell = state.cells[cellId]!;
    const start = startPositions.get(cellId) ?? { x: 0, y: 0 };
    cell.flight = { x: start.x, y: start.y };
    state.flying.add(cellId);
  }
  return true;
}

/**
 * Move flying cells toward their bins by `speed` px. Cells that arrive get a
 * new digit, leave their group and fade back in.
 */
export function advanceFlights(state: SimState, binPositions: readonly Point[], speed: number, rng: Rng): void {
  for (const cellId of state.flying) {
    const cell = state.cells[cellId]!;
    const group = cell.groupId === null ? undefined : state.groups.get(cell.groupId);
    if (!cell.flight || !group) {
      state.flying.delete(cellId);
      continue;
    }
    const target = binPositions[group.binIndex] ?? binPositions[binPositions.length - 1];
    if (!target) continue;

    const dx = target.x - cell.flight.x;
    const dy = target.y - cell.flight.y;
    const distance = Math.hypot(dx, dy);

    if (distance > speed) {
      cell.flight.x += (dx / distance) * speed;
      cell.flight.y += (dy / distance) * speed;
    } else {
      cell.flight = null;
      cell.groupId = null;
      cell.value = rng.int(0, 9);
      cell.regen = 0;
      state.flying.delete(cellId);
      if (group.cellIds.every((id) => state.cells[id]!.groupId !== group.id)) {
        group.state = 'done';
      }
    }
  }
}

/** Bins that currently have digits flying into them (their lid is open). */
export function openBins(state: SimState): Set<number> {
  const open = new Set<number>();
  for (const cellId of state.flying) {
    const groupId = state.cells[cellId]!.groupId;
    const group = groupId === null ? undefined : state.groups.get(groupId);
    if (group) open.add(group.binIndex);
  }
  return open;
}

/** Restore saved progress: mark groups as already refined without animation. */
export function applyRefined(state: SimState, groupIds: Iterable<number>): void {
  for (const id of groupIds) {
    const group = state.groups.get(id);
    if (!group || group.state === 'refining' || group.state === 'done') continue;
    group.state = 'done';
    state.bins[group.binIndex]!.refined++;
    for (const cellId of group.cellIds) {
      state.cells[cellId]!.groupId = null;
    }
  }
}

/** Ids of groups refined so far (for persistence). */
export function refinedGroupIds(state: SimState): number[] {
  const ids: number[] = [];
  for (const group of state.groups.values()) {
    if (group.state === 'refining' || group.state === 'done') ids.push(group.id);
  }
  return ids;
}
