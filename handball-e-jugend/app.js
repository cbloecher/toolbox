/* Browser UI: no frameworks, accounts or server calls. */
(function () {
  "use strict";
  const Core = window.HandballCore;
  const KEY = "handball-e-jugend-hhv-v1";
  const teams = { own: "Grün", opponent: "Rot" };
  const layer = document.getElementById("sheet-layer");
  const toastNode = document.getElementById("toast");
  const ui = { sheet: null, toastTimer: null, storageError: false };
  let game = loadGame();

  function loadGame() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Core.isSupportedGame(parsed)) { Core.ensureClock(parsed); return parsed; }
      }
    } catch (error) {
      ui.storageError = true;
    }
    return Core.newGame();
  }
  function saveGame() {
    try { localStorage.setItem(KEY, JSON.stringify(game)); }
    catch (error) {
      ui.storageError = true;
      toast("Speichern im Browser fehlgeschlagen – Daten nur im Arbeitsspeicher.");
    }
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[ch]);
  }
  function byId(id) { return document.getElementById(id); }
  function niceTime(timestamp) {
    const d = new Date(timestamp);
    return Number.isFinite(d.getTime()) ? d.toLocaleTimeString("de-DE", {
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    }) : "–";
  }
  function numberOf(teamId, playerId) {
    const player = Core.playerById(game, teamId, playerId);
    return player ? "#" + player.number : "Schütze offen";
  }
  function gameTime(ms) {
    const sec = Math.floor(Math.max(0, ms || 0) / 1000);
    return String(Math.floor(sec / 60)).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0");
  }
  function updateClockDisplay() {
    const view = Core.clockDisplay(game);
    byId("clock-time").textContent = view.text;
    const phases = {
      not_started: "Bereit",
      running: "Läuft",
      stopped: "Unterbrochen",
      ended: game.half === 1 ? "Halbzeitpause" : "Abgeschlossen"
    };
    byId("clock-phase").textContent = game.half + ". Halbzeit · " +
      (game.status === "finished" ? "Spielende" : phases[view.status]) +
      (view.direction === "down" ? " ↓" : " ↑");
    const toggle = byId("clock-toggle");
    toggle.disabled = game.status === "finished";
    toggle.textContent = view.status === "running" ? "Ⅱ Pause" :
      view.status === "ended" && game.half === 1 ? "▶ 2. HZ" : "▶ Play";
    byId("clock-sync").disabled = game.status === "finished" || view.status === "ended";
    byId("half-end").disabled = game.status === "finished" || view.status === "ended";
    byId("half-end").textContent = game.half === 1 ? "HZ beenden" : "Spielende";
    byId("first-half").disabled = game.status === "finished" || view.status === "running";
    byId("second-half").disabled = game.status === "finished" || view.status === "running";
  }
  function toast(message) {
    clearTimeout(ui.toastTimer);
    toastNode.textContent = message;
    toastNode.classList.add("show");
    ui.toastTimer = setTimeout(() => toastNode.classList.remove("show"), 2700);
  }
  function mutate(fn, message) {
    try {
      const result = fn();
      saveGame();
      render();
      if (message) toast(typeof message === "function" ? message(result) : message);
      return result;
    } catch (error) {
      toast(error.message || "Der Vorgang konnte nicht ausgeführt werden.");
      return null;
    }
  }
  function teamOrder() { return game.ownHome ? ["own", "opponent"] : ["opponent", "own"]; }

  function teamHtml(teamId) {
    const team = game.teams[teamId];
    const total = Core.totalStats(game, teamId);
    const current = Core.halfStats(game, teamId, game.half);
    const home = (teamId === "own") === game.ownHome;
    const scorers = new Map();
    let unknown = 0;
    for (const goal of game.goals) {
      if (goal.teamId !== teamId || goal.half !== game.half) continue;
      if (goal.playerId === null) { unknown++; continue; }
      scorers.set(goal.playerId, (scorers.get(goal.playerId) || 0) + 1);
    }
    const rows = [...scorers.entries()]
      .map(([pid, goals]) => ({ player: Core.playerById(game, teamId, pid), goals }))
      .filter(row => row.player)
      .sort((a,b) => b.goals - a.goals || Number(a.player.number) - Number(b.player.number));
    const chips = rows.map(row => '<span class="shooter-chip">#' +
      escapeHtml(row.player.number) + ' · ' + row.goals + '</span>').join("");
    const open = unknown ? '<span class="shooter-chip unknown-chip">? · ' + unknown + '</span>' : "";
    return '<section class="team-panel ' + (teamId === "opponent" ? "opponent" : "") + '">' +
      '<button type="button" class="team-tap" data-action="team-goal" data-team="' + teamId + '"' +
      (game.status === "finished" ? ' disabled' : '') +
      ' aria-label="Tor für ' + escapeHtml(team.name) + ' zählen und Schützen auswählen">' +
      '<div class="team-header"><div class="team-tag">' + teams[teamId] + ' · ' +
      (home ? "Heim" : "Auswärts") + '</div>' +
      '<div class="team-name">' + escapeHtml(team.name) + '</div>' +
      '<div class="team-goals" aria-label="' + total.goals + ' Tore">' + total.goals + '</div>' +
      '<div class="team-stats">' + current.shooters + ' Schützen / HZ · <strong>Σ ' +
      total.points + ' Pkt' + (total.provisional ? '*' : '') + '</strong></div></div>' +
      '<div class="team-bottom"><span class="team-tap-hint">＋ Tor erfassen</span>' +
      '<span class="team-scorer-caption">Torschützen · aktuelle Halbzeit</span>' +
      '<div class="team-scorers">' + (chips + open || '<span class="no-shooters">Noch keine Tore</span>') +
      '</div></div></button></section>';
  }
  function renderSummary() {
    const own1 = Core.halfStats(game, "own", 1), own2 = Core.halfStats(game, "own", 2);
    const red1 = Core.halfStats(game, "opponent", 1), red2 = Core.halfStats(game, "opponent", 2);
    const own = Core.totalStats(game, "own"), red = Core.totalStats(game, "opponent");
    const row = (name, a, b, suffix) => '<tr><td>' + name + '</td><td class="green">' + a + '</td><td class="red">' + b + '</td>' +
      (suffix ? '<td>' + suffix + '</td>' : "") + '</tr>';
    const limit = Core.multiplierLimit(game);
    byId("summary").innerHTML = '<h2>Auswertung · HHV-Multiplikator</h2>' +
      '<table><thead><tr><th>Zeitraum</th><th>Grün</th><th>Rot</th></tr></thead><tbody>' +
      row("1. HZ · Tore / Schützen", own1.goals + " / " + own1.shooters, red1.goals + " / " + red1.shooters) +
      row("1. HZ · Punkte", own1.points, red1.points) +
      row("2. HZ · Tore / Schützen", own2.goals + " / " + own2.shooters, red2.goals + " / " + red2.shooters) +
      row("2. HZ · Punkte", own2.points, red2.points) +
      row("Gesamt · Tore", own.goals, red.goals) +
      row("Σ Halbzeitpunkte", own.points, red.points) +
      '</tbody></table><small>' +
      (limit === null ? '* Wertung vorläufig: Mannschaftsstärken fehlen (Einstellungen). ' : 'Multiplikator auf maximal ' + limit + ' begrenzt. ') +
      'Punktesumme beider Halbzeiten als Arbeitswert; nicht das offizielle nuLiga-Ergebnis.</small>';
  }
  function render() {
    byId("board").innerHTML = teamOrder().map(teamHtml).join("");
    byId("home-btn").setAttribute("aria-pressed", String(game.ownHome));
    byId("away-btn").setAttribute("aria-pressed", String(!game.ownHome));
    byId("first-half").setAttribute("aria-pressed", String(game.half === 1));
    byId("second-half").setAttribute("aria-pressed", String(game.half === 2));
    byId("undo-button").disabled = !game.goals.length || game.status === "finished";
    const last = game.goals[game.goals.length - 1];
    byId("last-event").textContent = game.status === "finished" ? "Spiel beendet · Zum Ändern in den Einstellungen wieder öffnen."
      : last ? "Letztes Tor: " + teams[last.teamId] + " " + numberOf(last.teamId, last.playerId) +
        " · " + last.half + ". HZ · " + niceTime(last.timestamp)
      : "Noch keine Tore. Mannschaft antippen, um ein Tor zu erfassen.";
    renderSummary();
    updateClockDisplay();
    renderSheet();
  }

  function openSheet(type, extra) {
    ui.sheet = Object.assign({ type }, extra || {});
    renderSheet();
    const input = layer.querySelector("input[autofocus]");
    // Fokus unmittelbar aus dem Tap heraus setzen (wichtig für die iOS-Tastatur).
    if (input) input.focus();
  }
  function closeSheet() {
    ui.sheet = null;
    layer.replaceChildren();
    document.body.classList.remove("sheet-open");
  }
  function wrapSheet(title, body) {
    layer.innerHTML = '<div class="sheet-backdrop" data-action="backdrop">' +
      '<section class="sheet" role="dialog" aria-modal="true" aria-label="' + escapeHtml(title) + '">' +
      '<div class="sheet-head"><h2>' + escapeHtml(title) + '</h2><button type="button" class="close-button" data-action="close" aria-label="Schließen">×</button></div>' +
      body + '</section></div>';
    document.body.classList.add("sheet-open");
  }
  function renderHistory() {
    const rows = game.goals.slice().reverse();
    wrapSheet("Torverlauf · " + rows.length + " Tore",
      '<p class="sheet-help">Neueste Tore zuerst. Über „Ändern“ lassen sich Schütze, Mannschaft oder Halbzeit korrigieren.</p>' +
      (rows.length ? rows.map(g => '<div class="goal-row"><div><div class="title">' +
        escapeHtml(teams[g.teamId]) + " " + escapeHtml(numberOf(g.teamId, g.playerId)) +
        '</div><div class="mini">' + g.half + '. Halbzeit · Spielzeit ' + (Number.isFinite(g.gameElapsedMs) ? gameTime(g.gameElapsedMs) : 'nicht erfasst') + ' · <time>' + niceTime(g.timestamp) +
        '</time></div></div><button type="button" data-action="edit-goal" data-goal="' + escapeHtml(g.id) + '"' + (game.status === "finished" ? " disabled" : "") + '>Ändern</button></div>').join("")
      : '<p class="empty-note">Noch keine Tore erfasst.</p>'));
  }
  function renderEdit() {
    const goal = game.goals.find(g => g.id === ui.sheet.goalId);
    if (!goal) { openSheet("history"); return; }
    const teamId = ui.sheet.teamId || goal.teamId;
    const playerId = ui.sheet.teamId && ui.sheet.teamId !== goal.teamId ? null : goal.playerId;
    const options = '<option value=""' + (playerId === null ? " selected" : "") + '>Schütze unbekannt</option>' + game.teams[teamId].players.map(p =>
      '<option value="' + escapeHtml(p.id) + '"' + (playerId === p.id ? " selected" : "") + '>#' + escapeHtml(p.number) + '</option>').join("");
    wrapSheet("Tor korrigieren",
      '<p class="sheet-help">Erfasst: ' + niceTime(goal.timestamp) + ' · Spielzeit: ' + (Number.isFinite(goal.gameElapsedMs) ? gameTime(goal.gameElapsedMs) : 'nicht erfasst') + '. Beides bleibt bei Korrekturen erhalten.</p>' +
      '<form data-form="edit-goal"><label for="edit-team">Mannschaft</label>' +
      '<select id="edit-team" name="teamId"><option value="own"' + (teamId === "own" ? " selected" : "") + '>Grün</option>' +
      '<option value="opponent"' + (teamId === "opponent" ? " selected" : "") + '>Rot</option></select>' +
      '<div class="spacer-10"></div><label for="edit-player">Schütze</label>' +
      '<select id="edit-player" name="playerId">' + options + '</select>' +
      '<div class="spacer-10"></div><label for="edit-half">Halbzeit</label>' +
      '<select id="edit-half" name="half"><option value="1"' + (goal.half === 1 ? " selected" : "") + '>1. Halbzeit</option>' +
      '<option value="2"' + (goal.half === 2 ? " selected" : "") + '>2. Halbzeit</option></select>' +
      '<button type="submit" class="primary-button full-button">Korrektur speichern</button></form>' +
      '<button type="button" class="secondary-button full-button" data-action="edit-keypad" data-goal="' +
      escapeHtml(goal.id) + '"' + (game.status === "finished" ? " disabled" : "") +
      '>Schützennummer über Tastenfeld korrigieren</button>' +
      '<button type="button" class="danger-button full-button" data-action="delete-goal">Dieses Tor löschen</button>');
  }
  function renderSettings() {
    const own = game.teams.own, opp = game.teams.opponent;
    const clock = Core.ensureClock(game);
    const teamFields = (tid, t) => '<div class="team-edit"><div><label for="team-' + tid + '">' + teams[tid] + ' · Mannschaftsname</label>' +
      '<input id="team-' + tid + '" name="' + tid + 'Name" maxlength="50" value="' + escapeHtml(t.name) + '"></div>' +
      '<div><label for="roster-' + tid + '">Kadergröße</label><input id="roster-' + tid +
      '" name="' + tid + 'Roster" type="number" min="1" max="30" placeholder="?" value="' + (t.rosterSize === null ? "" : t.rosterSize) + '"></div></div>';
    const rosterButtons = (tid, t) => '<h3>' + teams[tid] + ' · Rückennummern korrigieren</h3>' +
      (t.players.length ? '<div class="bench-list">' + t.players.slice().sort((a,b) => +a.number - +b.number).map(p =>
        '<button type="button" class="bench-button" data-action="rename" data-team="' + tid + '" data-player="' + escapeHtml(p.id) + '">#' + p.number + '</button>').join("") + '</div>'
        : '<p class="empty-note">Noch keine Spieler angelegt.</p>');
    wrapSheet("Spiel & Einstellungen",
      (game.status === "finished" ? '<div class="finished-banner">Das Spiel ist beendet.</div>' : "") +
      '<form data-form="settings">' + teamFields("own", own) + teamFields("opponent", opp) +
      '<h3>Spieluhr</h3><label for="clock-direction">Zählrichtung der Hallenuhr</label>' +
      '<select id="clock-direction" name="clockDirection"><option value="up"' + (clock.direction === 'up' ? ' selected' : '') + '>Aufwärts · 00:00 → 20:00 (Standard)</option>' +
      '<option value="down"' + (clock.direction === 'down' ? ' selected' : '') + '>Abwärts · 20:00 → 00:00</option></select>' +
      '<p class="sheet-help">Eine Änderung betrifft nur die Anzeige und künftige Hallenuhr-Abgleiche, nie bereits gespeicherte Torzeiten.</p>' +
      '<p class="sheet-help">Die Kadergröße ist optional; erst mit beiden Angaben kann der HHV-Multiplikator begrenzt werden.</p>' +
      '<button class="primary-button full-button" type="submit">Einstellungen speichern</button></form>' +
      rosterButtons("own", own) + rosterButtons("opponent", opp) +
      '<h3>Spielverwaltung</h3>' +
      '<button type="button" class="secondary-button full-button" data-action="export">Spiel als JSON sichern</button>' +
      '<label class="secondary-button full-button import-button" for="import-file">JSON-Spielstand laden<input type="file" id="import-file" accept=".json,application/json" hidden></label>' +
      '<button type="button" class="secondary-button full-button" data-action="finish">' +
      (game.status === "finished" ? "Spiel wieder öffnen" : "Spiel beenden") + '</button>' +
      '<button type="button" class="danger-button full-button" data-action="new-game">Neues Spiel beginnen</button>');
  }

  function renderClockSync() {
    const view = Core.clockDisplay(game);
    const [minutes, seconds] = view.text.split(":");
    wrapSheet("Mit Hallenuhr synchronisieren",
      '<p class="sheet-help">Hallenuhr in Minuten und Sekunden eingeben (' +
      (view.direction === "up" ? "aufwärts" : "abwärts") +
      ' zählend). Nur der aktuelle Zeitanker wird geändert. Bereits erfasste Torzeiten und UTC-Zeitstempel bleiben unverändert.</p>' +
      '<form data-form="clock-sync">' +
      '<div class="clock-sync-fields"><label for="sync-clock-minutes">Minuten' +
      '<input id="sync-clock-minutes" name="clockMinutes" autofocus type="number" inputmode="numeric" min="0" max="20" required value="' + minutes + '"></label>' +
      '<span aria-hidden="true">:</span>' +
      '<label for="sync-clock-seconds">Sekunden' +
      '<input id="sync-clock-seconds" name="clockSeconds" type="number" inputmode="numeric" min="0" max="59" required value="' + seconds + '"></label></div>' +
      '<button type="submit" class="primary-button full-button">Hallenuhr abgleichen</button></form>');
  }
  function renderScorerSheet() {
    const { goalId, teamId } = ui.sheet;
    const goal = game.goals.find(g => g.id === goalId);
    if (!goal) { openSheet("history"); return; }
    const digits = ui.sheet.number || "";
    const keys = ["1","2","3","4","5","6","7","8","9","⌫","0","?"];
    const grid = keys.map(key => {
      const action = key === "⌫" ? "keypad-back" : key === "?" ? "keypad-unknown" : "keypad-digit";
      return '<button type="button" class="keypad-key' + (key === "?" ? ' keypad-unknown' : '') +
        '" data-action="' + action + '"' + (action === "keypad-digit" ? ' data-digit="' + key + '"' : '') +
        ' aria-label="' + (key === "⌫" ? "Letzte Ziffer löschen" : key === "?" ? "Schütze unbekannt" : "Ziffer " + key) +
        '">' + key + '</button>';
    }).join("");
    wrapSheet(teams[teamId] + " · Schütze",
      '<p class="sheet-help">Das Tor ist bereits gezählt. Nummer 0–99 eingeben und übernehmen. ' +
      '„?“ oder Schließen belässt den Schützen unbekannt.</p>' +
      '<div class="keypad-preview" aria-live="polite">' +
      '<span>Rückennummer</span><strong>' + (digits ? '#' + escapeHtml(digits) : '–') + '</strong></div>' +
      '<div class="number-keypad">' + grid + '</div>' +
      '<button type="button" class="primary-button full-button" data-action="keypad-apply"' +
      (digits ? '' : ' disabled') + '>Schütze übernehmen</button>' +
      '<button type="button" class="danger-button full-button" data-action="keypad-remove">Tor zurücknehmen</button>');
  }
  function renderRename() {
    const { teamId, playerId } = ui.sheet;
    const player = Core.playerById(game, teamId, playerId);
    if (!player) { openSheet("settings"); return; }
    wrapSheet(teams[teamId] + " · Nummer ändern",
      '<p class="sheet-help">Die bisher erfassten Tore bleiben demselben Spieler zugeordnet.</p>' +
      '<form data-form="rename"><label for="renumber">Neue Rückennummer</label><div class="form-row">' +
      '<input autofocus id="renumber" name="number" inputmode="numeric" pattern="[0-9]{1,2}" maxlength="2" required value="' + escapeHtml(player.number) + '">' +
      '<button class="primary-button" type="submit">Speichern</button></div></form>');
  }
  function renderSheet() {
    if (!ui.sheet) { document.body.classList.remove("sheet-open"); layer.replaceChildren(); return; }
    switch (ui.sheet.type) {
      case "history": renderHistory(); break;
      case "edit": renderEdit(); break;
      case "settings": renderSettings(); break;
      case "rename": renderRename(); break;
      case "clock-sync": renderClockSync(); break;
      case "scorer": renderScorerSheet(); break;
    }
  }
  function finishAndClose(fn, message) {
    const result = mutate(fn, message);
    if (result !== null) closeSheet();
  }
  function onAction(button) {
    const act = button.dataset.action;
    const teamId = button.dataset.team;
    if (act === "close") { closeSheet(); return; }
    if (act === "settings") { openSheet("settings"); return; }
    if (act === "history") { openSheet("history"); return; }
    if (act === "clock-toggle") {
      const view = Core.clockDisplay(game);
      mutate(() => view.status === "running" ? Core.pauseClock(game) : Core.playClock(game),
        view.status === "running" ? "Spieluhr angehalten" : "Spieluhr läuft");
      return;
    }
    if (act === "clock-sync") { openSheet("clock-sync"); return; }
    if (act === "half-end") {
      if (!confirm(game.half === 1 ? "1. Halbzeit beenden? Anschließend startet Play die 2. Halbzeit." :
        "2. Halbzeit und Spiel beenden?")) return;
      mutate(() => Core.endHalf(game), game.half === 1 ? "Halbzeit beendet" : "Spiel beendet");
      return;
    }
    if (act === "team-goal") {
      const goal = mutate(() => Core.recordGoal(game, teamId, null), "Tor · " + teams[teamId]);
      if (goal) openSheet("scorer", { teamId, goalId: goal.id, number: "" });
      return;
    }
    if (act === "keypad-digit") {
      const digit = button.dataset.digit;
      ui.sheet.number = (ui.sheet.number || "").length >= 2 ? digit : (ui.sheet.number || "") + digit;
      renderSheet(); return;
    }
    if (act === "keypad-back") {
      ui.sheet.number = (ui.sheet.number || "").slice(0, -1);
      renderSheet(); return;
    }
    if (act === "keypad-unknown") {
      const goal = game.goals.find(g => g.id === ui.sheet.goalId);
      if (!goal) { closeSheet(); return; }
      if (goal.playerId !== null) {
        const changed = mutate(() => Core.editGoal(game, goal.id, goal.teamId, null, goal.half),
          "Schütze als unbekannt erfasst");
        if (changed) closeSheet();
      } else {
        closeSheet(); toast("Schütze offen · später im Verlauf zuordnen");
      }
      return;
    }
    if (act === "keypad-apply") {
      const { goalId, number } = ui.sheet;
      if (!number) { toast("Rückennummer wählen oder ? antippen."); return; }
      const player = mutate(() => Core.assignGoalNumber(game, goalId, number), "Schütze #" + number + " gespeichert");
      if (player) closeSheet();
      return;
    }
    if (act === "keypad-remove") {
      const removed = mutate(() => Core.deleteGoal(game, ui.sheet.goalId), "Tor zurückgenommen");
      if (removed) closeSheet();
      return;
    }
    if (act === "edit-keypad") {
      const goal = game.goals.find(g => g.id === button.dataset.goal);
      if (goal) openSheet("scorer", { teamId: goal.teamId, goalId: goal.id, number: "" });
      return;
    }
    if (act === "home") {
      mutate(() => { game.ownHome = button.dataset.home === "true"; return true; }); return;
    }
    if (act === "half") {
      const h = Number(button.dataset.half);
      if (game.half !== h && confirm("Zu Halbzeit " + h + " wechseln? Alle weiteren Tore werden dieser Halbzeit zugeordnet.")) {
        mutate(() => { Core.setHalf(game, h); return true; }, "Halbzeit " + h + " aktiv");
      }
      return;
    }
    if (act === "undo") {
      if (!game.goals.length) return;
      mutate(() => Core.undoLastGoal(game), "Letztes Tor zurückgenommen"); return;
    }
    if (act === "edit-goal") { openSheet("edit", { goalId: button.dataset.goal }); return; }
    if (act === "delete-goal") {
      if (!confirm("Dieses Tor wirklich löschen?")) return;
      const goalId = ui.sheet.goalId;
      if (mutate(() => Core.deleteGoal(game, goalId), "Tor gelöscht")) openSheet("history");
      return;
    }
    if (act === "rename") { openSheet("rename", { teamId, playerId: button.dataset.player }); return; }
    if (act === "finish") {
      const finished = game.status === "finished";
      if (!finished && !confirm("Spiel beenden? Torerfassung wird bis zum Wiederöffnen gesperrt.")) return;
      mutate(() => { finished ? Core.reopenGame(game) : Core.finishGame(game); return true; },
        finished ? "Spiel wieder geöffnet" : "Spiel beendet");
      return;
    }
    if (act === "new-game") {
      if (!confirm("Neues Spiel beginnen? Alle aktuellen Daten werden überschrieben. Bei Bedarf vorher JSON sichern.")) return;
      game = Core.newGame(); saveGame(); closeSheet(); render(); toast("Neues Spiel gestartet"); return;
    }
    if (act === "export") {
      const blob = new Blob([JSON.stringify(game, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "handball-e-jugend-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500); toast("JSON-Sicherung erstellt");
    }
  }
  function onForm(form) {
    const values = new FormData(form);
    const type = form.dataset.form;
    if (type === "clock-sync") {
      const mm = String(values.get("clockMinutes") ?? "").trim();
      const ss = String(values.get("clockSeconds") ?? "").trim();
      if (!/^\d{1,2}$/.test(mm) || !/^\d{1,2}$/.test(ss)) {
        toast("Minuten und Sekunden als Zahlen von 0 bis 20 bzw. 59 eingeben.");
        return;
      }
      finishAndClose(() => Core.syncHallClock(game, mm + ":" + ss.padStart(2, "0")), "Hallenuhr abgeglichen");
      return;
    }
    if (type === "rename") {
      if (mutate(() => { Core.renamePlayer(game, ui.sheet.teamId, ui.sheet.playerId, values.get("number")); return true; }, "Rückennummer geändert")) openSheet("settings");
      return;
    }
    if (type === "edit-goal") {
      const goalId = ui.sheet.goalId;
      if (mutate(() => Core.editGoal(game, goalId, values.get("teamId"), values.get("playerId") || null, values.get("half")), "Tor korrigiert")) openSheet("history");
      return;
    }
    if (type === "settings") {
      const data = {
        ownName: values.get("ownName"), opponentName: values.get("opponentName"),
        ownRoster: values.get("ownRoster"), opponentRoster: values.get("opponentRoster"),
        clockDirection: values.get("clockDirection")
      };
      if (mutate(() => {
        // Check both sizes before applying anything, avoiding half-saved invalid forms.
        for (const value of [data.ownRoster, data.opponentRoster]) {
          if (value !== "" && (!Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > 30)) {
            throw new Error("Kadergröße muss zwischen 1 und 30 liegen.");
          }
        }
        const next = JSON.parse(JSON.stringify(game));
        Core.setTeamName(next, "own", data.ownName);
        Core.setTeamName(next, "opponent", data.opponentName);
        Core.setRosterSize(next, "own", data.ownRoster);
        Core.setRosterSize(next, "opponent", data.opponentRoster);
        Core.setClockDirection(next, data.clockDirection);
        game = next;
        return true;
      }, "Einstellungen gespeichert")) closeSheet();
    }
  }
  document.addEventListener("click", function (event) {
    const button = event.target.closest("[data-action]");
    if (!button || button.disabled) return;
    // Clicking the modal backdrop but not its dialog closes the sheet.
    if (button.dataset.action === "backdrop") {
      if (event.target === button) closeSheet();
      return;
    }
    try { onAction(button); }
    catch (error) { toast(error.message || "Vorgang fehlgeschlagen."); }
  });
  document.addEventListener("submit", function (event) {
    const form = event.target.closest("form[data-form]");
    if (!form) return;
    event.preventDefault();
    onForm(form);
  });
  document.addEventListener("change", function (event) {
    if (event.target.id === "import-file") {
      const input = event.target;
      const file = input.files && input.files[0];
      if (!file) return;
      file.text().then(text => {
        const data = JSON.parse(text);
        if (!Core.isSupportedGame(data)) throw new Error("Die Datei enthält keinen unterstützten Spielstand.");
        if (!confirm("Gespeicherten Spielstand laden? Die aktuelle Erfassung wird überschrieben.")) return;
        Core.ensureClock(data);
        game = data;
        saveGame(); closeSheet(); render(); toast("Spielstand geladen");
      }).catch(error => toast(error.message || "Spielstand konnte nicht geladen werden."));
      return;
    }
    if (event.target.id !== "edit-team" || !ui.sheet || ui.sheet.type !== "edit") return;
    ui.sheet.teamId = event.target.value;
    renderSheet();
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && ui.sheet) { closeSheet(); return; }
    if (!ui.sheet || ui.sheet.type !== "scorer") return;
    if (/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      ui.sheet.number = (ui.sheet.number || "").length >= 2 ? event.key : (ui.sheet.number || "") + event.key;
      renderSheet();
    } else if (event.key === "Backspace") {
      event.preventDefault();
      ui.sheet.number = (ui.sheet.number || "").slice(0, -1);
      renderSheet();
    } else if (event.key === "?") {
      event.preventDefault(); closeSheet();
    } else if (event.key === "Enter" && ui.sheet.number) {
      event.preventDefault();
      onAction({ dataset: { action: "keypad-apply" } });
    }
  });
  render();
  // Spielzeit aus UTC-Anker rekonstruieren, ohne die Tastatur/Sheets periodisch neu zu rendern.
  setInterval(updateClockDisplay, 500);
  if (ui.storageError) toast("Lokale Speicherung derzeit nicht verfügbar.");
  // Optional: offline reload after one successful HTTPS visit (not a native app).
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("./sw.js").catch(() => { /* No impact on the live counter. */ });
  }
})();
