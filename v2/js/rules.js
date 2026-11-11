// Penalty Kings v2 — shootout rules (best of 5, then sudden death).

export function newShootout() {
  return { kicks: [[], []] }; // kicks[team] = array of true (scored) / false
}

const goals = (arr) => arr.filter(Boolean).length;

/** Team (0 or 1) to kick next. Team 0 always starts. */
export const nextTeam = (s) => (s.kicks[0].length > s.kicks[1].length ? 1 : 0);

export function record(s, team, scored) {
  s.kicks[team].push(scored);
  return s;
}

/** @returns {null | 0 | 1} the winning team once it's decided */
export function winner(s) {
  const [a, b] = s.kicks;
  const ga = goals(a);
  const gb = goals(b);
  if (a.length <= 5 && b.length <= 5) {
    const leftA = 5 - a.length;
    const leftB = 5 - b.length;
    if (ga > gb + leftB) return 0;
    if (gb > ga + leftA) return 1;
    if (a.length === 5 && b.length === 5 && ga !== gb) return ga > gb ? 0 : 1;
    return null;
  }
  // sudden death: decided after each completed pair
  if (a.length === b.length && ga !== gb) return ga > gb ? 0 : 1;
  return null;
}

export const score = (s) => [goals(s.kicks[0]), goals(s.kicks[1])];
export const isSuddenDeath = (s) => s.kicks[0].length >= 5 && s.kicks[1].length >= 5;
