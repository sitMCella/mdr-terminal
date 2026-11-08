import { createNoise2D01 } from './noise';
import { createRng } from './rng';
import { cellIndex, type BadGroup, type Bin, type GridParams, type NumberCell, type SimState } from './types';

export const FIRST_GROUP_DELAY_TICKS = 500;

/**
 * Build a deterministic board for the given parameters.
 *
 * Mirrors the reference algorithm: random digits, a noise map above a threshold
 * marks "bad" cells, and a single pass over bad cells (in id order) joins each
 * one to the first already-grouped 8-neighbour or starts a new group with a
 * random bin.
 */
export function generateGrid(params: GridParams): SimState {
  const { size, seed, badNoiseScale, badThreshold, binCount } = params;
  const rng = createRng(seed);
  const badNoise = createNoise2D01(seed ^ 0x5bd1e995);

  const cells: NumberCell[] = new Array(size * size);
  const badIds: number[] = [];

  for (let gy = 0; gy < size; gy++) {
    for (let gx = 0; gx < size; gx++) {
      const id = cellIndex(size, gx, gy);
      cells[id] = {
        id,
        gx,
        gy,
        value: rng.int(0, 9),
        driftAxis: rng.bool() ? 'x' : 'y',
        groupId: null,
        regen: 0,
        flight: null,
      };
      if (badNoise(gx * badNoiseScale, gy * badNoiseScale) > badThreshold) {
        badIds.push(id);
      }
    }
  }

  const groups = new Map<number, BadGroup>();
  let nextGroupId = 0;

  for (const id of badIds) {
    const cell = cells[id]!;
    const neighbourGroup = findNeighbourGroup(cells, size, cell.gx, cell.gy);
    if (neighbourGroup !== null) {
      cell.groupId = neighbourGroup;
      groups.get(neighbourGroup)!.cellIds.push(id);
    } else {
      const group: BadGroup = {
        id: nextGroupId++,
        cellIds: [id],
        binIndex: rng.int(0, binCount - 1),
        state: 'dormant',
        superActive: false,
        scale: 0,
        reachedMax: false,
      };
      groups.set(group.id, group);
      cell.groupId = group.id;
    }
  }

  const bins: Bin[] = Array.from({ length: binCount }, (_, index) => ({ index, refined: 0, total: 0 }));
  for (const group of groups.values()) {
    bins[group.binIndex]!.total++;
  }

  return {
    params: { ...params },
    cells,
    groups,
    bins,
    activeGroupId: null,
    countdownTicks: FIRST_GROUP_DELAY_TICKS,
    flying: new Set(),
  };
}

function findNeighbourGroup(cells: NumberCell[], size: number, gx: number, gy: number): number | null {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const x = gx + dx;
      const y = gy + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const groupId = cells[cellIndex(size, x, y)]!.groupId;
      if (groupId !== null) return groupId;
    }
  }
  return null;
}
