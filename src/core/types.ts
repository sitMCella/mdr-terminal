export type DriftAxis = 'x' | 'y';

export interface Point {
  x: number;
  y: number;
}

export interface NumberCell {
  id: number;
  gx: number;
  gy: number;
  /** Displayed digit, 0..9. */
  value: number;
  /** Axis the ambient drift moves this cell along. */
  driftAxis: DriftAxis;
  /** Bad group membership, null when the cell is a normal number. */
  groupId: number | null;
  /** Fade-in progress, 0..1. */
  regen: number;
  /** Screen position while flying to a bin after being refined. */
  flight: Point | null;
}

export type GroupState = 'dormant' | 'active' | 'refining' | 'done';

export interface BadGroup {
  id: number;
  cellIds: number[];
  binIndex: number;
  state: GroupState;
  superActive: boolean;
  /** Extra scale added to the group's digits while active, 0..superActiveMax. */
  scale: number;
  reachedMax: boolean;
}

export interface Bin {
  index: number;
  refined: number;
  total: number;
}

export interface GridParams {
  size: number;
  seed: number;
  badNoiseScale: number;
  badThreshold: number;
  binCount: number;
}

export interface SimState {
  params: GridParams;
  cells: NumberCell[];
  groups: Map<number, BadGroup>;
  bins: Bin[];
  activeGroupId: number | null;
  countdownTicks: number;
  /** Cells currently flying to a bin. */
  flying: Set<number>;
}

export function cellIndex(size: number, gx: number, gy: number): number {
  return gy * size + gx;
}
