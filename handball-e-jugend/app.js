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
        if (Core.isSupportedGame(parsed)) return parsed;
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
    return player ? "#" + player.number : "#?";
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

  function slotHtml(teamId, slot) {
    const pId = game.teams[teamId].slots[slot];
    const p = pId ? Core.playerById(game, teamId, pId) : null;
    const halfGoals = pId ? game.goals.filter(g => g.teamId === teamId && g.playerId === pId && g.half === game.half).length : 0;
    const keeper = slot === 0;
    const empty = !p;
    const role = keeper ? "Torwart" : "Feldspieler";
    const label = empty
      ? teams[teamId] + ": " + role + " " + (keeper ? "" : slot) + " erfassen"
      : teams[teamId] + ": " + role + " Nummer " + p.number + ", " + halfGoals + " Tore in dieser Halbzeit. Tor buchen";
    const meta = keeper ? (empty ? "Torwart einsetzen" : "TW · " + halfGoals + " Tore / HZ")
      : (empty ? "belegen" : halfGoals + " Tore / HZ");
    return '<button type="button" class="player-slot' + (keeper ? " keeper" : "") + (empty ? " empty" : "") + '" ' +
      'data-action="slot" data-team="' + teamId + '" data-slot="' + slot + '" aria-label="' + escapeHtml(label) + '"' +
      (game.status === "finished" ? " disabled" : "") + '>' +
      '<span class="player-number">' + (empty ? "+" : escapeHtml(p.number)) + '</span>' +
      '<span class="player-meta">' + escapeHtml(meta) + '</span></button>';
  }
  function teamHtml(teamId) {
    const t = game.teams[teamId];
    const total = Core.totalStats(game, teamId);
    const current = Core.halfStats(game, teamId, game.half);
    const home = (teamId === "own") === game.ownHome;
    return '<section class="team-panel ' + (teamId === "opponent" ? "opponent" : "") + '" aria-label="' + escapeHtml(t.name) + '">' +
      '<header class="team-header">' +
      '<div class="team-tag">' + teams[teamId] + ' · ' + (home ? "Heim" : "Auswärts") + '</div>' +
      '<div class="team-name" title="' + escapeHtml(t.name) + '">' + escapeHtml(t.name) + '</div>' +
      '<div class="team-goals" aria-label="' + total.goals + ' Tore insgesamt">' + total.goals + '</div>' +
      '<div class="team-stats">' + current.shooters + ' Schützen / HZ · <strong>Σ ' + total.points + ' Pkt' + (total.provisional ? "*" : "") + '</strong></div>' +
      '</header><div class="team-fields"><div class="position-caption"><span>Torwart</span><span>+' + (t.players.length - t.slots.filter(Boolean).length) + ' Bank</span></div>' +
      slotHtml(teamId, 0) +
      '<div class="position-caption"><span>Feldspieler</span><span>6 Plätze</span></div>' +
      '<div class="field-grid">' + [1, 2, 3, 4, 5, 6].map(i => slotHtml(teamId, i)).join("") + '</div></div>' +
      '<div class="team-actions"><button type="button" class="lineup-button" data-action="lineup" data-team="' + teamId + '"' + (game.status === "finished" ? " disabled" : "") + '>≡ Aufstellung</button>' +
      '<button type="button" class="change-button" data-action="sub" data-team="' + teamId + '"' + (game.status === "finished" ? " disabled" : "") + '>⇄ Wechsel</button></div></section>';
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
      : "Noch keine Tore erfasst. Leeres Feld antippen und Rückennummer eingeben.";
    renderSummary();
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
  function benchOptions(teamId) {
    const t = game.teams[teamId];
    return t.players.filter(p => !t.slots.includes(p.id)).sort((a,b) => Number(a.number) - Number(b.number));
  }
  function renderAssign() {
    const { teamId, slot } = ui.sheet;
    const bank = benchOptions(teamId);
    wrapSheet(teams[teamId] + " · " + (slot === 0 ? "Torwart" : "Feldspieler") + " besetzen",
      '<p class="sheet-help">Neue Rückennummer eingeben oder einen bereits erfassten Bankspieler einsetzen. Das zählt noch kein Tor.</p>' +
      '<form data-form="assign"><label for="number">Rückennummer (0–99)</label><div class="form-row">' +
      '<input autofocus id="number" name="number" inputmode="numeric" pattern="[0-9]{1,2}" maxlength="2" autocomplete="off" required placeholder="Nr.">' +
      '<button class="primary-button" type="submit">Einsetzen</button></div></form>' +
      (bank.length ? '<h3>Bekannte Ersatzspieler</h3><div class="bench-list">' +
        bank.map(p => '<button type="button" class="bench-button" data-action="assign-bench" data-number="' + p.number + '">#' + p.number + '</button>').join("") + '</div>' : ""));
  }
  function renderLineup() {
    const { teamId } = ui.sheet;
    const t = game.teams[teamId];
    const rows = t.slots.map((pId, slot) => {
      const p = pId ? Core.playerById(game, teamId, pId) : null;
      const label = slot === 0 ? "Torwart" : "Feldspieler " + slot;
      return '<div class="lineup-row"><label for="lineup-' + slot + '">' + label + '</label>' +
        '<input id="lineup-' + slot + '" name="slot' + slot + '" inputmode="numeric" ' +
        'type="text" pattern="[0-9]{1,2}" maxlength="2" autocomplete="off" ' +
        (p ? 'value="' + escapeHtml(p.number) + '" readonly title="Bereits besetzt; Änderung über Wechsel oder Nummernkorrektur"' :
             'placeholder="Nr." ' + (t.slots.slice(0, slot).every(Boolean) ? 'autofocus ' : '')) +
        'enterkeyhint="next" aria-label="' + label + ' – Rückennummer"></div>';
    }).join("");
    wrapSheet(teams[teamId] + " · Erstaufstellung (6+1)",
      '<p class="sheet-help">Sieben Nummern direkt untereinander eingeben: Torwart + sechs Feldspieler. Mit „Weiter“ auf der Tastatur zum nächsten Feld. Leere Plätze sind erlaubt. Es werden noch keine Tore gezählt.</p>' +
      '<form data-form="lineup"><div class="lineup-grid">' + rows + '</div>' +
      '<button type="submit" class="primary-button full-button">Aufstellung übernehmen</button></form>' +
      '<p class="sheet-help lineup-footnote">Bereits belegte Positionen sind geschützt; Spielerwechsel bitte über „Wechsel“ erfassen.</p>');
    const firstEmpty = layer.querySelector('.lineup-grid input:not([readonly])');
    // Bei einem Tap direkt fokussieren, damit die mobile Zifferntastatur aufgeht.
    if (firstEmpty) firstEmpty.focus();
  }
  function renderSub() {
    const { teamId, slot } = ui.sheet;
    const t = game.teams[teamId], bank = benchOptions(teamId);
    wrapSheet(teams[teamId] + " · Spielerwechsel",
      '<p class="sheet-help">' + (slot === null ? "1. Spieler auswählen, der das Feld verlässt." :
        "2. Ersatzspieler von der Bank wählen oder neue Rückennummer eingeben. Der bisherige Spieler geht auf die Bank.") + '</p>' +
      '<div class="slot-list">' + t.slots.map((pId, i) => '<button class="slot-option ' + (slot === i ? "selected" : "") +
        '" type="button" data-action="outgoing" data-slot="' + i + '"' + (!pId ? " disabled" : "") + '>' +
        (pId ? numberOf(teamId, pId) : "–") + '<small>' + (i === 0 ? "Torwart" : "Feld " + i) + '</small></button>').join("") + '</div>' +
      (slot !== null ? '<h3>Bank (' + bank.length + ')</h3>' +
        (bank.length ? '<div class="bench-list">' + bank.map(p =>
          '<button class="bench-button" type="button" data-action="sub-bench" data-number="' + p.number + '">#' + p.number + '</button>').join("") + '</div>'
          : '<p class="empty-note">Noch keine Ersatzspieler bekannt.</p>') +
        '<h3>Neuen Spieler einwechseln</h3><form data-form="sub"><div class="form-row">' +
        '<input autofocus id="number" name="number" inputmode="numeric" pattern="[0-9]{1,2}" maxlength="2" autocomplete="off" required placeholder="Rückennummer" aria-label="Rückennummer">' +
        '<button type="submit" class="primary-button">Wechseln</button></div></form>' : ""));
  }
  function renderHistory() {
    const rows = game.goals.slice().reverse();
    wrapSheet("Torverlauf · " + rows.length + " Tore",
      '<p class="sheet-help">Neueste Tore zuerst. Über „Ändern“ lassen sich Schütze, Mannschaft oder Halbzeit korrigieren.</p>' +
      (rows.length ? rows.map(g => '<div class="goal-row"><div><div class="title">' +
        escapeHtml(teams[g.teamId]) + " " + escapeHtml(numberOf(g.teamId, g.playerId)) +
        '</div><div class="mini">' + g.half + '. Halbzeit · <time>' + niceTime(g.timestamp) +
        '</time></div></div><button type="button" data-action="edit-goal" data-goal="' + escapeHtml(g.id) + '"' + (game.status === "finished" ? " disabled" : "") + '>Ändern</button></div>').join("")
      : '<p class="empty-note">Noch keine Tore erfasst.</p>'));
  }
  function renderEdit() {
    const goal = game.goals.find(g => g.id === ui.sheet.goalId);
    if (!goal) { openSheet("history"); return; }
    const teamId = ui.sheet.teamId || goal.teamId;
    const playerId = ui.sheet.teamId && ui.sheet.teamId !== goal.teamId ? null : goal.playerId;
    const options = game.teams[teamId].players.map(p =>
      '<option value="' + escapeHtml(p.id) + '"' + (playerId === p.id ? " selected" : "") + '>#' + escapeHtml(p.number) + '</option>').join("");
    wrapSheet("Tor korrigieren",
      '<p class="sheet-help">Erfasst: ' + niceTime(goal.timestamp) + ' · Zeitstempel bleibt erhalten.</p>' +
      '<form data-form="edit-goal"><label for="edit-team">Mannschaft</label>' +
      '<select id="edit-team" name="teamId"><option value="own"' + (teamId === "own" ? " selected" : "") + '>Grün</option>' +
      '<option value="opponent"' + (teamId === "opponent" ? " selected" : "") + '>Rot</option></select>' +
      '<div class="spacer-10"></div><label for="edit-player">Schütze</label>' +
      '<select id="edit-player" name="playerId" required>' + options + '</select>' +
      '<div class="spacer-10"></div><label for="edit-half">Halbzeit</label>' +
      '<select id="edit-half" name="half"><option value="1"' + (goal.half === 1 ? " selected" : "") + '>1. Halbzeit</option>' +
      '<option value="2"' + (goal.half === 2 ? " selected" : "") + '>2. Halbzeit</option></select>' +
      '<button type="submit" class="primary-button full-button">Korrektur speichern</button></form>' +
      '<button type="button" class="danger-button full-button" data-action="delete-goal">Dieses Tor löschen</button>');
  }
  function renderSettings() {
    const own = game.teams.own, opp = game.teams.opponent;
    const teamFields = (tid, t) => '<div class="team-edit"><div><label for="team-' + tid + '">' + teams[tid] + ' · Mannschaftsname</label>' +
      '<input id="team-' + tid + '" name="' + tid + 'Name" maxlength="50" value="' + escapeHtml(t.name) + '"></div>' +
      '<div><label for="roster-' + tid + '">Kadergröße</label><input id="roster-' + tid +
      '" name="' + tid + 'Roster" type="number" min="1" max="30" placeholder="?" value="' + (t.rosterSize === null ? "" : t.rosterSize) + '"></div></div>';
    const rosterButtons = (tid, t) => '<h3>' + teams[tid] + ' · Rückennummern berichtigen</h3>' +
      (t.players.length ? '<div class="bench-list">' + t.players.slice().sort((a,b) => +a.number - +b.number).map(p =>
        '<button type="button" class="bench-button" data-action="rename" data-team="' + tid + '" data-player="' + escapeHtml(p.id) + '">#' + p.number + '</button>').join("") + '</div>'
        : '<p class="empty-note">Noch keine Spieler angelegt.</p>');
    wrapSheet("Spiel & Einstellungen",
      (game.status === "finished" ? '<div class="finished-banner">Das Spiel ist beendet.</div>' : "") +
      '<form data-form="settings">' + teamFields("own", own) + teamFields("opponent", opp) +
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
      case "assign": renderAssign(); break;
      case "lineup": renderLineup(); break;
      case "sub": renderSub(); break;
      case "history": renderHistory(); break;
      case "edit": renderEdit(); break;
      case "settings": renderSettings(); break;
      case "rename": renderRename(); break;
    }
  }
  function finishAndClose(fn, message) {
    const result = mutate(fn, message);
    if (result !== null) closeSheet();
  }
  function onAction(button) {
    const act = button.dataset.action;
    const teamId = button.dataset.team;
    const slot = Number(button.dataset.slot);
    if (act === "close") { closeSheet(); return; }
    if (act === "settings") { openSheet("settings"); return; }
    if (act === "history") { openSheet("history"); return; }
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
    if (act === "slot") {
      const pId = game.teams[teamId].slots[slot];
      if (!pId) openSheet("assign", { teamId, slot });
      else mutate(() => Core.recordGoal(game, teamId, pId), "Tor · " + teams[teamId] + " " + numberOf(teamId, pId));
      return;
    }
    if (act === "lineup") { openSheet("lineup", { teamId }); return; }
    if (act === "sub") { openSheet("sub", { teamId, slot: null }); return; }
    if (act === "outgoing") {
      ui.sheet.slot = slot; renderSheet();
      const numberInput = layer.querySelector('form[data-form="sub"] input[name="number"]');
      if (numberInput) numberInput.focus();
      return;
    }
    if (act === "assign-bench") {
      finishAndClose(() => Core.putInEmptySlot(game, ui.sheet.teamId, ui.sheet.slot, button.dataset.number), "#" + button.dataset.number + " eingesetzt"); return;
    }
    if (act === "sub-bench") {
      finishAndClose(() => Core.substitute(game, ui.sheet.teamId, ui.sheet.slot, button.dataset.number), "Wechsel: #" + button.dataset.number); return;
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
    if (type === "lineup") {
      const teamId = ui.sheet.teamId;
      const valuesBySlot = Array.from({ length: 7 }, (_, i) => String(values.get("slot" + i) || "").trim());
      finishAndClose(() => {
        // Zuerst auf einer Kopie prüfen: keine Teilbelegung bei ungültiger Nummer.
        const next = JSON.parse(JSON.stringify(game));
        valuesBySlot.forEach((number, slot) => {
          if (next.teams[teamId].slots[slot] !== null || !number) return;
          Core.putInEmptySlot(next, teamId, slot, number);
        });
        game = next;
        return true;
      }, "Aufstellung übernommen");
      return;
    }
    if (type === "assign") {
      finishAndClose(() => Core.putInEmptySlot(game, ui.sheet.teamId, ui.sheet.slot, values.get("number")), "Spieler eingesetzt"); return;
    }
    if (type === "sub") {
      finishAndClose(() => Core.substitute(game, ui.sheet.teamId, ui.sheet.slot, values.get("number")), "Spieler gewechselt"); return;
    }
    if (type === "rename") {
      if (mutate(() => { Core.renamePlayer(game, ui.sheet.teamId, ui.sheet.playerId, values.get("number")); return true; }, "Rückennummer geändert")) openSheet("settings");
      return;
    }
    if (type === "edit-goal") {
      const goalId = ui.sheet.goalId;
      if (mutate(() => Core.editGoal(game, goalId, values.get("teamId"), values.get("playerId"), values.get("half")), "Tor korrigiert")) openSheet("history");
      return;
    }
    if (type === "settings") {
      const data = {
        ownName: values.get("ownName"), opponentName: values.get("opponentName"),
        ownRoster: values.get("ownRoster"), opponentRoster: values.get("opponentRoster")
      };
      if (mutate(() => {
        // Check both sizes before applying anything, avoiding half-saved invalid forms.
        for (const value of [data.ownRoster, data.opponentRoster]) {
          if (value !== "" && (!Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > 30)) {
            throw new Error("Kadergröße muss zwischen 1 und 30 liegen.");
          }
        }
        Core.setTeamName(game, "own", data.ownName);
        Core.setTeamName(game, "opponent", data.opponentName);
        Core.setRosterSize(game, "own", data.ownRoster);
        Core.setRosterSize(game, "opponent", data.opponentRoster);
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
    if (event.key !== "Enter" || !ui.sheet || ui.sheet.type !== "lineup") return;
    const input = event.target;
    if (!input.matches || !input.matches('.lineup-grid input:not([readonly])')) return;
    const fields = [...layer.querySelectorAll('.lineup-grid input:not([readonly])')];
    const pos = fields.indexOf(input);
    if (pos !== -1 && pos < fields.length - 1) {
      event.preventDefault();
      fields[pos + 1].focus();
    }
  });
  render();
  if (ui.storageError) toast("Lokale Speicherung derzeit nicht verfügbar.");
  // Optional: offline reload after one successful HTTPS visit (not a native app).
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("./sw.js").catch(() => { /* No impact on the live counter. */ });
  }
})();
