/* Pure state and HHV scoring rules. No DOM, no network or storage dependency. */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HandballCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const SLOT_COUNT = 7; // 0 = goalkeeper, 1..6 = field players

  function id() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 11);
  }
  function team(name) {
    return { name: name, rosterSize: null, players: [], slots: Array(SLOT_COUNT).fill(null) };
  }
  function newGame() {
    return {
      version: 1,
      id: id(),
      ownHome: true,
      half: 1,
      status: "live",
      teams: { own: team("Unsere Mannschaft"), opponent: team("Gegner") },
      goals: []
    };
  }
  function assertTeam(state, teamId) {
    if (!state || !state.teams || !Object.prototype.hasOwnProperty.call(state.teams, teamId)) {
      throw new Error("Unbekannte Mannschaft.");
    }
    return state.teams[teamId];
  }
  function assertMutable(state) {
    if (state.status === "finished") throw new Error("Das Spiel ist beendet. Zum Bearbeiten wieder öffnen.");
  }
  function playerById(state, teamId, playerId) {
    return assertTeam(state, teamId).players.find(p => p.id === playerId) || null;
  }
  function validNumber(number) {
    const s = String(number).trim();
    if (!/^\d{1,2}$/.test(s)) throw new Error("Bitte eine Rückennummer von 0 bis 99 eingeben.");
    return String(Number(s));
  }
  function validSlot(slot) {
    const index = Number(slot);
    if (!Number.isInteger(index) || index < 0 || index >= SLOT_COUNT) throw new Error("Ungültige Spielerposition.");
    return index;
  }
  function lookupNumber(state, teamId, number) {
    const norm = validNumber(number);
    return assertTeam(state, teamId).players.find(p => p.number === norm) || null;
  }
  function ensurePlayer(state, teamId, number) {
    const t = assertTeam(state, teamId);
    const norm = validNumber(number);
    let p = t.players.find(player => player.number === norm);
    if (!p) {
      p = { id: id(), number: norm };
      t.players.push(p);
    }
    return p;
  }
  function activeSlot(t, playerId) {
    return t.slots.indexOf(playerId);
  }
  function putInEmptySlot(state, teamId, slot, number) {
    assertMutable(state);
    const t = assertTeam(state, teamId);
    const i = validSlot(slot);
    if (t.slots[i] !== null) throw new Error("Position ist bereits besetzt.");
    const existing = lookupNumber(state, teamId, number);
    if (existing && activeSlot(t, existing.id) !== -1) throw new Error("Diese Nummer ist bereits auf dem Feld.");
    const p = ensurePlayer(state, teamId, number);
    t.slots[i] = p.id;
    return p;
  }
  function substitute(state, teamId, slot, number) {
    assertMutable(state);
    const t = assertTeam(state, teamId);
    const i = validSlot(slot);
    if (t.slots[i] === null) throw new Error("Leere Position: direkt mit + besetzen.");
    const existing = lookupNumber(state, teamId, number);
    if (existing && activeSlot(t, existing.id) !== -1) throw new Error("Diese Nummer ist bereits auf dem Feld.");
    const p = ensurePlayer(state, teamId, number);
    t.slots[i] = p.id;
    return p;
  }
  function recordGoal(state, teamId, playerId, timestamp) {
    assertMutable(state);
    const t = assertTeam(state, teamId);
    if (!t.players.some(p => p.id === playerId)) throw new Error("Spieler nicht gefunden.");
    if (!t.slots.includes(playerId)) throw new Error("Nur ein aktiver Spieler kann ein Tor erzielen.");
    const stamp = timestamp === undefined ? new Date().toISOString() : timestamp;
    if (!Number.isFinite(Date.parse(stamp))) throw new Error("Ungültiger Zeitstempel.");
    const goal = { id: id(), teamId, playerId, timestamp: stamp, half: state.half };
    state.goals.push(goal);
    return goal;
  }
  function deleteGoal(state, goalId) {
    assertMutable(state);
    const index = state.goals.findIndex(g => g.id === goalId);
    if (index === -1) throw new Error("Torereignis nicht gefunden.");
    return state.goals.splice(index, 1)[0];
  }
  function undoLastGoal(state) {
    if (!state.goals.length) return null;
    return deleteGoal(state, state.goals[state.goals.length - 1].id);
  }
  function editGoal(state, goalId, teamId, playerId, half) {
    assertMutable(state);
    assertTeam(state, teamId);
    const h = Number(half);
    if (h !== 1 && h !== 2) throw new Error("Halbzeit muss 1 oder 2 sein.");
    if (!playerById(state, teamId, playerId)) throw new Error("Spieler nicht gefunden.");
    const goal = state.goals.find(g => g.id === goalId);
    if (!goal) throw new Error("Torereignis nicht gefunden.");
    goal.teamId = teamId;
    goal.playerId = playerId;
    goal.half = h;
    goal.editedAt = new Date().toISOString();
    return goal;
  }
  function setHalf(state, half) {
    assertMutable(state);
    const h = Number(half);
    if (h !== 1 && h !== 2) throw new Error("Ungültige Halbzeit.");
    state.half = h;
  }
  function setRosterSize(state, teamId, size) {
    const t = assertTeam(state, teamId);
    if (size === "" || size === null || size === undefined) {
      t.rosterSize = null;
      return;
    }
    const n = Number(size);
    if (!Number.isInteger(n) || n < 1 || n > 30) throw new Error("Mannschaftsstärke muss zwischen 1 und 30 liegen.");
    t.rosterSize = n;
  }
  function setTeamName(state, teamId, name) {
    const t = assertTeam(state, teamId);
    t.name = String(name).trim().slice(0, 50) || (teamId === "own" ? "Unsere Mannschaft" : "Gegner");
  }
  function renamePlayer(state, teamId, playerId, number) {
    assertMutable(state);
    const t = assertTeam(state, teamId);
    const p = playerById(state, teamId, playerId);
    if (!p) throw new Error("Spieler nicht gefunden.");
    const norm = validNumber(number);
    if (t.players.some(other => other.id !== playerId && other.number === norm)) throw new Error("Diese Nummer ist bereits vorhanden.");
    p.number = norm;
  }
  function multiplierLimit(state) {
    const a = state.teams.own.rosterSize;
    const b = state.teams.opponent.rosterSize;
    return a === null || b === null ? null : Math.max(6, Math.min(a, b));
  }
  function halfStats(state, teamId, half) {
    assertTeam(state, teamId);
    const rows = state.goals.filter(g => g.teamId === teamId && g.half === half);
    const shooters = new Set(rows.map(g => g.playerId)).size;
    const limit = multiplierLimit(state);
    const factor = limit === null ? shooters : Math.min(shooters, limit);
    return { goals: rows.length, shooters, factor, points: rows.length * factor, provisional: limit === null };
  }
  function totalStats(state, teamId) {
    const first = halfStats(state, teamId, 1);
    const second = halfStats(state, teamId, 2);
    const unique = new Set(state.goals.filter(g => g.teamId === teamId).map(g => g.playerId)).size;
    return { goals: first.goals + second.goals, shooters: unique, points: first.points + second.points,
      provisional: first.provisional, first, second };
  }
  function finishGame(state) { state.status = "finished"; }
  function reopenGame(state) { state.status = "live"; }
  function isSupportedGame(value) {
    return !!(value && value.version === 1 && (value.half === 1 || value.half === 2)
      && ["live", "finished"].includes(value.status)
      && value.teams && ["own", "opponent"].every(key => {
        const t = value.teams[key];
        return !!(t && Array.isArray(t.slots) && t.slots.length === SLOT_COUNT && Array.isArray(t.players));
      }) && Array.isArray(value.goals));
  }
  return {
    SLOT_COUNT, newGame, isSupportedGame, playerById, lookupNumber,
    putInEmptySlot, substitute, recordGoal, deleteGoal, undoLastGoal, editGoal,
    setHalf, setRosterSize, setTeamName, renamePlayer, halfStats, totalStats,
    multiplierLimit, finishGame, reopenGame
  };
});
