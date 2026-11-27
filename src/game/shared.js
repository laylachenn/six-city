// State shared between the game modules (src/game/):
// __gs holds the few variables that more than one module assigns to (an imported binding can't be assigned to).
// __late reads names from modules that load later, for code in earlier modules that only runs once everything has loaded.
export const __gs = {};
export const __late = {};
export function later(getters) { for (const k in getters) Object.defineProperty(__late, k, { get: getters[k], enumerable: true }); }
