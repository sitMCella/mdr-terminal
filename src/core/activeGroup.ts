import type { Rng } from './rng';
import type { BadGroup, SimState } from './types';

export interface ActiveGroupConfig {
  groupGrowMax: number;
  superActiveMax: number;
  /** Per-tick scale step is `groupScaleStep * rand(1..10)`. */
  groupScaleStep: number;
  /** Per-tick creep while super active between grow max and super max. */
  superActiveCreep: number;
  groupCooldownMinTicks: number;
  groupCooldownMaxTicks: number;
}

export const DEFAULT_ACTIVE_GROUP_CONFIG: ActiveGroupConfig = {
  groupGrowMax: 0.23,
  superActiveMax: 0.24,
  groupScaleStep: 0.0001,
  superActiveCreep: 0.00001,
  groupCooldownMinTicks: 500,
  groupCooldownMaxTicks: 1500,
};

/**
 * Advance the "one active group at a time" state machine by one tick.
 *
 * @param visibleGroupIds dormant groups with at least one cell fully in view.
 */
export function tickActiveGroup(
  state: SimState,
  visibleGroupIds: ReadonlySet<number>,
  rng: Rng,
  cfg: ActiveGroupConfig = DEFAULT_ACTIVE_GROUP_CONFIG,
): void {
  // Drop the active group if it was refined or scrolled out of view.
  if (state.activeGroupId !== null) {
    const group = state.groups.get(state.activeGroupId);
    if (!group || group.state !== 'active' || !visibleGroupIds.has(group.id)) {
      if (group?.state === 'active') resetGroup(group);
      endActive(state, rng, cfg);
    }
  }

  // Pick a new active group when the cooldown has elapsed.
  if (state.activeGroupId === null && state.countdownTicks === 0 && visibleGroupIds.size > 0) {
    const candidates = [...visibleGroupIds];
    const id = candidates[rng.int(0, candidates.length - 1)]!;
    const group = state.groups.get(id);
    if (group && group.state === 'dormant') {
      resetGroup(group);
      group.state = 'active';
      state.activeGroupId = id;
    }
  }

  // Grow / shrink the active group.
  if (state.activeGroupId !== null) {
    const group = state.groups.get(state.activeGroupId)!;
    const step = () => cfg.groupScaleStep * rng.int(1, 10);

    if (!group.reachedMax) {
      if (group.scale < cfg.groupGrowMax) group.scale += step();
    } else {
      group.scale -= step();
    }

    if (group.scale >= cfg.groupGrowMax) {
      if (!group.superActive || group.scale >= cfg.superActiveMax) {
        group.reachedMax = true;
      } else {
        group.scale += cfg.superActiveCreep;
      }
    } else if (group.scale <= 0) {
      resetGroup(group);
      group.state = 'dormant';
      endActive(state, rng, cfg);
    }
  }

  if (state.countdownTicks > 0) state.countdownTicks--;
}

function resetGroup(group: BadGroup): void {
  group.scale = 0;
  group.superActive = false;
  group.reachedMax = false;
  if (group.state === 'active') group.state = 'dormant';
}

function endActive(state: SimState, rng: Rng, cfg: ActiveGroupConfig): void {
  state.activeGroupId = null;
  state.countdownTicks = rng.int(cfg.groupCooldownMinTicks, cfg.groupCooldownMaxTicks);
}

/** Mark the active group as super active (cursor is hovering over it). */
export function setSuperActive(state: SimState, groupId: number): void {
  const group = state.groups.get(groupId);
  if (group && group.state === 'active') group.superActive = true;
}
