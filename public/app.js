const state = {
  token: localStorage.getItem("fixtureToken"),
  user: null,
  matches: [],
  predictions: [],
  ranking: [],
  settings: { rules: "", prizes: "", announcement: "" },
  pledges: [],
  adminBets: [],
  adminUsers: [],
  selectedGroup: null,
  groupView: "group",
  selectedDate: null
};

const $ = selector => document.querySelector(selector);
const authView = $("#authView");
const appView = $("#appView");
const authError = $("#authError");
const logoutBtn = $("#logoutBtn");

const COUNTRY_CODES = {
  "argentina": "ar", "brasil": "br", "uruguay": "uy", "chile": "cl", "paraguay": "py",
  "colombia": "co", "ecuador": "ec", "peru": "pe", "perú": "pe", "venezuela": "ve",
  "bolivia": "bo", "mexico": "mx", "méxico": "mx", "estados unidos": "us", "usa": "us",
  "canada": "ca", "canadá": "ca", "costa rica": "cr", "panama": "pa", "panamá": "pa",
  "honduras": "hn", "jamaica": "jm",
  "españa": "es", "espana": "es", "francia": "fr", "alemania": "de", "italia": "it",
  "inglaterra": "gb-eng", "escocia": "gb-sct", "gales": "gb-wls", "reino unido": "gb",
  "portugal": "pt", "paises bajos": "nl", "países bajos": "nl", "holanda": "nl",
  "belgica": "be", "bélgica": "be", "suiza": "ch", "austria": "at", "polonia": "pl",
  "croacia": "hr", "serbia": "rs", "dinamarca": "dk", "suecia": "se", "noruega": "no",
  "rusia": "ru", "ucrania": "ua", "turquia": "tr", "turquía": "tr", "grecia": "gr",
  "republica checa": "cz", "república checa": "cz", "hungria": "hu", "hungría": "hu",
  "marruecos": "ma", "egipto": "eg", "tunez": "tn", "túnez": "tn", "argelia": "dz",
  "senegal": "sn", "nigeria": "ng", "ghana": "gh", "camerun": "cm", "camerún": "cm",
  "costa de marfil": "ci", "sudafrica": "za", "sudáfrica": "za", "mali": "ml",
  "japon": "jp", "japón": "jp", "corea del sur": "kr", "corea": "kr",
  "australia": "au", "nueva zelanda": "nz", "qatar": "qa", "arabia saudita": "sa",
  "iran": "ir", "irán": "ir", "irak": "iq", "china": "cn", "india": "in"
};

function countryCode(name) {
  if (!name) return null;
  const key = name.toLowerCase().trim();
  return COUNTRY_CODES[key] || null;
}

function setFlag(img, teamName) {
  const code = countryCode(teamName);
  if (code) {
    img.src = `https://flagcdn.com/24x18/${code}.png`;
    img.srcset = `https://flagcdn.com/48x36/${code}.png 2x`;
    img.alt = teamName;
    img.style.display = "";
  } else {
    img.removeAttribute("src");
    img.style.display = "none";
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Error inesperado");
  return data;
}

function setSession(payload) {
  state.token = payload.token;
  state.user = payload.user;
  localStorage.setItem("fixtureToken", state.token);
}

function clearSession() {
  state.token = null;
  state.user = null;
  localStorage.removeItem("fixtureToken");
  renderAuth();
}

function renderAuth() {
  authView.classList.remove("hidden");
  appView.classList.add("hidden");
  logoutBtn.classList.add("hidden");
}

function renderApp() {
  authView.classList.add("hidden");
  appView.classList.remove("hidden");
  logoutBtn.classList.remove("hidden");
  $("#welcomeTitle").textContent = `Hola, ${state.user.name}`;
  $("#adminPanel").classList.toggle("hidden", !state.user.isAdmin);
  renderGroups();
  renderBracket();
  renderRanking();
  renderSummary();
  renderAdminOptions();
}

function predictionFor(matchId) {
  return state.predictions.find(prediction => prediction.matchId === matchId);
}

function matchLocked(match) {
  return new Date(match.kickoff).getTime() <= Date.now() || match.status !== "scheduled";
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function createMatchNode(match, mode = "full") {
  const template = $("#matchTemplate");
  const node = template.content.cloneNode(true);
  const article = node.querySelector(".match");
  const form = node.querySelector(".prediction-form");
  const prediction = predictionFor(match.id);
  const locked = matchLocked(match);

  article.classList.add(`match-${mode}`);
  article.querySelector(".match-meta").textContent = `${match.stage}${match.group ? ` · Grupo ${match.group}` : ""}`;
  article.querySelector(".home").textContent = match.homeTeam;
  article.querySelector(".away").textContent = match.awayTeam;
  setFlag(article.querySelector(".flag-home"), match.homeTeam);
  setFlag(article.querySelector(".flag-away"), match.awayTeam);
  const venueEl = article.querySelector(".venue");
  if (venueEl) {
    venueEl.textContent = match.venue ? `📍 ${match.venue}` : "";
  }
  article.querySelector(".kickoff").textContent = formatDate(match.kickoff);

  if (mode === "bracket") {
    const parts = [`🕒 ${formatDate(match.kickoff)}`];
    if (match.venue) parts.push(`📍 ${match.venue}`);
    article.title = parts.join("\n");
    article.dataset.tooltip = parts.join(" · ");
  }

  form.dataset.matchId = match.id;
  form.homeScore.value = prediction?.homeScore ?? "";
  form.awayScore.value = prediction?.awayScore ?? "";
  form.homeScore.disabled = locked;
  form.awayScore.disabled = locked;
  form.querySelector("button").disabled = locked;
  form.querySelector("button").textContent = locked ? "Cerrado" : prediction ? "Actualizar" : "Apostar";

  const result = article.querySelector(".result");
  if (match.status === "finished") {
    result.textContent = `Resultado oficial: ${match.homeScore} - ${match.awayScore}`;
  } else if (prediction) {
    result.textContent = `Tu apuesta: ${prediction.homeScore} - ${prediction.awayScore}`;
  } else {
    result.textContent = locked ? "Apuesta cerrada" : "Sin apuesta cargada";
  }

  return node;
}

function renderMatches() {
  const list = $("#matchesList");
  list.innerHTML = "";
  state.matches.forEach(match => list.appendChild(createMatchNode(match, "full")));
}

function renderGroups() {
  const list = $("#groupsList");
  const groupSelect = $("#groupSelect");
  const dateSelect = $("#dateSelect");
  const groupPickerLabel = $("#groupPickerLabel");
  const datePickerLabel = $("#datePickerLabel");
  list.innerHTML = "";
  const groupMatches = state.matches.filter(match => match.group);
  if (!groupMatches.length) return;

  // Toggle picker visibility
  if (state.groupView === "date") {
    groupPickerLabel?.classList.add("hidden");
    datePickerLabel?.classList.remove("hidden");
  } else {
    groupPickerLabel?.classList.remove("hidden");
    datePickerLabel?.classList.add("hidden");
  }

  if (state.groupView === "group") {
    const groups = [...new Set(groupMatches.map(m => m.group))].sort();
    if (!state.selectedGroup || !groups.includes(state.selectedGroup)) {
      state.selectedGroup = groups[0];
    }
    if (groupSelect.options.length !== groups.length) {
      groupSelect.innerHTML = groups.map(g => `<option value="${g}">Grupo ${g}</option>`).join("");
    }
    groupSelect.value = state.selectedGroup;

    const card = document.createElement("section");
    card.className = "group-card";
    card.innerHTML = `<h3>Grupo ${escapeHtml(state.selectedGroup)}</h3><div class="group-matches"></div>`;
    const matchesContainer = card.querySelector(".group-matches");
    groupMatches
      .filter(m => m.group === state.selectedGroup)
      .forEach(m => matchesContainer.appendChild(createMatchNode(m, "compact")));
    list.appendChild(card);
  } else {
    // Group by date (yyyy-mm-dd)
    const byDate = new Map();
    groupMatches.forEach(m => {
      const key = new Date(m.kickoff).toISOString().slice(0, 10);
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key).push(m);
    });
    const dates = [...byDate.keys()].sort();
    if (!state.selectedDate || !dates.includes(state.selectedDate)) {
      state.selectedDate = dates[0];
    }
    const dateLabels = dates.map(d => {
      const dt = new Date(d + "T12:00:00");
      const label = new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "2-digit", month: "short" }).format(dt);
      return `<option value="${d}">${label}</option>`;
    });
    if (dateSelect.options.length !== dates.length) {
      dateSelect.innerHTML = dateLabels.join("");
    }
    dateSelect.value = state.selectedDate;

    const dayMatches = (byDate.get(state.selectedDate) || []).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
    const dt = new Date(state.selectedDate + "T12:00:00");
    const heading = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "2-digit", month: "long" }).format(dt);
    const card = document.createElement("section");
    card.className = "group-card";
    card.innerHTML = `<h3>${escapeHtml(heading.charAt(0).toUpperCase() + heading.slice(1))}</h3><div class="group-matches"></div>`;
    const matchesContainer = card.querySelector(".group-matches");
    dayMatches.forEach(m => matchesContainer.appendChild(createMatchNode(m, "compact")));
    list.appendChild(card);
  }
}

function bracketStage(match) {
  const normalized = match.stage.toLowerCase();
  if (normalized.includes("tercer")) return "tercer";
  if (normalized.includes("final") && !normalized.includes("semi")) return "final";
  if (normalized.includes("semi")) return "semis";
  if (normalized.includes("cuarto")) return "cuartos";
  if (normalized.includes("octavo")) return "octavos";
  if (normalized.includes("dieciseis") || normalized.includes("dieciséis") || normalized.includes("16avos") || normalized.includes("treintaidos")) return "r32";
  return null;
}

function renderBracket() {
  const list = $("#bracketList");
  list.innerHTML = "";
  const stages = {
    r32:      state.matches.filter(m => bracketStage(m) === "r32"),
    octavos:  state.matches.filter(m => bracketStage(m) === "octavos"),
    cuartos:  state.matches.filter(m => bracketStage(m) === "cuartos"),
    semis:    state.matches.filter(m => bracketStage(m) === "semis"),
    final:    state.matches.filter(m => bracketStage(m) === "final"),
    tercer:   state.matches.filter(m => bracketStage(m) === "tercer")
  };
  const half = arr => ({
    left:  arr.filter((_, i) => i < Math.ceil(arr.length / 2)),
    right: arr.filter((_, i) => i >= Math.ceil(arr.length / 2))
  });
  const r32 = half(stages.r32);
  const r16 = half(stages.octavos);
  const qf  = half(stages.cuartos);
  const sf  = half(stages.semis);

  const columns = [
    { title: "16avos",  matches: r32.left },
    { title: "Octavos", matches: r16.left },
    { title: "Cuartos", matches: qf.left },
    { title: "Semis",   matches: sf.left },
    { title: "Final",   matches: stages.final, final: true, extra: stages.tercer },
    { title: "Semis",   matches: sf.right },
    { title: "Cuartos", matches: qf.right },
    { title: "Octavos", matches: r16.right },
    { title: "16avos",  matches: r32.right }
  ];

  columns.forEach(column => {
    const col = document.createElement("section");
    col.className = "bracket-column" + (column.final ? " bracket-final" : "");
    col.innerHTML = `<h3>${column.title}</h3><div class="bracket-stack"></div>`;
    const stack = col.querySelector(".bracket-stack");
    if (column.matches.length === 0) {
      const empty = document.createElement("div");
      empty.className = "bracket-empty";
      empty.textContent = "Por definir";
      stack.appendChild(empty);
    } else {
      column.matches.forEach(match => stack.appendChild(createMatchNode(match, "bracket")));
    }
    if (column.extra && column.extra.length) {
      const label = document.createElement("h4");
      label.className = "bracket-third-title";
      label.textContent = "3er puesto";
      stack.appendChild(label);
      column.extra.forEach(match => stack.appendChild(createMatchNode(match, "bracket")));
    }
    list.appendChild(col);
  });
}

function renderRanking() {
  const list = $("#rankingList");
  list.innerHTML = "";

  if (state.ranking.length === 0) {
    list.innerHTML = `<p class="muted">Todavía no hay participantes.</p>`;
    return;
  }

  state.ranking.forEach(entry => {
    const row = document.createElement("div");
    row.className = "rank-row";
    if (entry.userId === state.user?.id) row.classList.add("rank-row-me");
    row.innerHTML = `
      <span class="pos">${entry.position}</span>
      <div>
        <strong>${escapeHtml(entry.name)}${entry.userId === state.user?.id ? ' <span class="rank-tag">vos</span>' : ''}</strong>
        <small>${entry.exacts} exactos · ${entry.predictions} apuestas</small>
      </div>
      <strong>${entry.points} pts</strong>
    `;
    list.appendChild(row);
  });
}

function renderSummary() {
  const me = state.ranking.find(entry => entry.userId === state.user.id);
  $("#myPoints").textContent = me?.points ?? 0;
  $("#myPredictions").textContent = state.predictions.length;
  $("#myPosition").textContent = me?.position ? `#${me.position}` : "-";
}

function renderAdminOptions() {
  const select = $("#resultForm select[name='matchId']");
  select.innerHTML = "";
  state.matches.forEach(match => {
    const option = document.createElement("option");
    option.value = match.id;
    option.textContent = `${match.stage}: ${match.homeTeam} vs ${match.awayTeam}`;
    select.appendChild(option);
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

async function loadState() {
  const data = await api("/api/state");
  state.user = data.user;
  state.matches = data.matches;
  state.predictions = data.predictions;
  state.ranking = data.ranking;
  state.settings = data.settings || state.settings;
  state.pledges = Array.isArray(data.pledges) ? data.pledges : [];
  renderApp();
  applySettingsToUI();
  renderPledges();
}

function applySettingsToUI() {
  $("#rulesContent").textContent = state.settings.rules || "";
  $("#prizesContent").textContent = state.settings.prizes || "";
  const settingsForm = $("#settingsForm");
  if (settingsForm) {
    settingsForm.rules.value = state.settings.rules || "";
    settingsForm.prizes.value = state.settings.prizes || "";
  }
  const annForm = $("#announcementForm");
  if (annForm) annForm.announcement.value = state.settings.announcement || "";
  const banner = $("#announcementBanner");
  if (state.settings.announcement) {
    banner.textContent = `📣 ${state.settings.announcement}`;
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }
}

/* ============== Ranking TV (vista pantalla completa) ============== */
const TV_PAGE_SIZE = 18;
const TV_ROTATE_MS = 10000;
let rtvTimer = null;
let rtvPageTimer = null;
let rtvPage = 0;

async function openRankingTV() {
  const tv = $("#rankingTV");
  tv.classList.remove("hidden");
  if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
  rtvPage = 0;
  renderRankingTV();
  rtvTimer = setInterval(refreshRankingTV, 30000);
  startRtvPageRotation();
}

function closeRankingTV() {
  $("#rankingTV").classList.add("hidden");
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
  clearInterval(rtvTimer);
  rtvTimer = null;
  clearInterval(rtvPageTimer);
  rtvPageTimer = null;
}

function startRtvPageRotation() {
  clearInterval(rtvPageTimer);
  const total = state.ranking.length;
  const pages = Math.ceil(total / TV_PAGE_SIZE);
  if (pages <= 1) return;
  rtvPageTimer = setInterval(() => {
    rtvPage = (rtvPage + 1) % pages;
    renderRankingTV();
  }, TV_ROTATE_MS);
}

function updateRtvSync() {
  const last = state.settings?.lastSync;
  const el = $("#rtvSync");
  if (!last) {
    el.textContent = "Sin sync de API deportiva";
    return;
  }
  const formatted = new Intl.DateTimeFormat("es-AR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
  }).format(new Date(last));
  el.textContent = `🔄 Última sync: ${formatted}`;
}

async function refreshRankingTV() {
  try {
    const data = await api("/api/state");
    state.ranking = data.ranking;
    state.matches = data.matches;
    state.predictions = data.predictions;
    state.settings = data.settings || state.settings;
    renderRanking();
    renderRankingTV();
    startRtvPageRotation();
  } catch {}
}

function pickGrid(n) {
  return [3, 6];
}

function renderRankingTV() {
  const list = $("#rtvList");
  const pageInfo = $("#rtvPageInfo");
  list.innerHTML = "";
  updateRtvSync();

  if (state.ranking.length === 0) {
    const empty = document.createElement("div");
    empty.className = "rtv-empty";
    empty.textContent = "Todavía no hay participantes.";
    list.appendChild(empty);
    pageInfo?.classList.add("hidden");
    return;
  }

  const total = state.ranking.length;
  const totalPages = Math.max(1, Math.ceil(total / TV_PAGE_SIZE));
  if (rtvPage >= totalPages) rtvPage = 0;
  const start = rtvPage * TV_PAGE_SIZE;
  const slice = state.ranking.slice(start, start + TV_PAGE_SIZE);
  const [cols, rows] = pickGrid(slice.length);
  list.style.setProperty("--cols", cols);
  list.style.setProperty("--rows", rows);

  if (totalPages > 1) {
    pageInfo.textContent = `Página ${rtvPage + 1} / ${totalPages}`;
    pageInfo.classList.remove("hidden");
  } else {
    pageInfo.classList.add("hidden");
  }

  slice.forEach(entry => {
    const card = document.createElement("div");
    card.className = "rtv-card";
    if (entry.position === 1) card.classList.add("is-first");
    else if (entry.position === 2) card.classList.add("is-second");
    else if (entry.position === 3) card.classList.add("is-third");
    if (entry.userId === state.user?.id) card.classList.add("is-me");
    const medal = entry.position === 1 ? "🥇 " : entry.position === 2 ? "🥈 " : entry.position === 3 ? "🥉 " : "";
    card.innerHTML = `
      <span class="rtv-pos">${entry.position}</span>
      <div class="rtv-name">
        <strong>${medal}${escapeHtml(entry.name)}</strong>
        <small>${entry.exacts} exactos · ${entry.predictions} apuestas</small>
      </div>
      <span class="rtv-points">${entry.points}<small>pts</small></span>
    `;
    list.appendChild(card);
  });
}

$("#rankingFullscreenBtn").addEventListener("click", openRankingTV);
$("#rtvCloseBtn").addEventListener("click", closeRankingTV);
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !$("#rankingTV").classList.contains("hidden")) closeRankingTV();
});
$("#rulesBtn").addEventListener("click", () => $("#rulesModal").classList.remove("hidden"));
$("#rulesModal").addEventListener("click", event => {
  if (event.target.dataset.close === "1") $("#rulesModal").classList.add("hidden");
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") $("#rulesModal").classList.add("hidden");
});

/* ============== Pledges ============== */
const PLEDGES_VISIBLE = 6;
let pledgesExpanded = false;

function renderPledges() {
  const list = $("#pledgesList");
  const empty = $("#pledgesEmpty");
  const toggle = $("#pledgesToggle");
  if (!list) return;
  list.innerHTML = "";
  if (!state.pledges.length) {
    empty?.classList.remove("hidden");
    if (toggle) toggle.classList.add("hidden");
    return;
  }
  empty?.classList.add("hidden");

  const visible = pledgesExpanded ? state.pledges : state.pledges.slice(0, PLEDGES_VISIBLE);
  visible.forEach(p => {
    const canDelete = state.user && (state.user.id === p.userId || state.user.isAdmin);
    const promiseText = p.promise ? p.promise.charAt(0).toLowerCase() + p.promise.slice(1) : "";
    const li = document.createElement("li");
    li.className = "pledge-item";
    li.innerHTML = `
      <div class="pledge-author">${escapeHtml(p.userName)}</div>
      <div class="pledge-text">${escapeHtml(p.condition)}, ${escapeHtml(promiseText)}.</div>
      ${canDelete ? `<button type="button" class="btn-sm pledge-delete" data-id="${p.id}" title="Borrar">✕</button>` : ""}
    `;
    list.appendChild(li);
  });

  if (toggle) {
    if (state.pledges.length > PLEDGES_VISIBLE) {
      toggle.classList.remove("hidden");
      const hidden = state.pledges.length - PLEDGES_VISIBLE;
      toggle.textContent = pledgesExpanded
        ? "▲ Ver menos"
        : `▼ Ver todas (${hidden} más)`;
    } else {
      toggle.classList.add("hidden");
    }
  }

  list.querySelectorAll(".pledge-delete").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Borrar esta promesa?")) return;
      try {
        await api(`/api/pledges/${btn.dataset.id}`, { method: "DELETE" });
        await loadState();
      } catch (err) {
        alert(err.message || "No se pudo borrar");
      }
    });
  });
}

$("#pledgesToggle")?.addEventListener("click", () => {
  pledgesExpanded = !pledgesExpanded;
  renderPledges();
});

$("#pledgeBtn").addEventListener("click", () => {
  $("#pledgeError").textContent = "";
  $("#pledgeForm").reset();
  $("#pledgeModal").classList.remove("hidden");
});
$("#pledgeModal").addEventListener("click", event => {
  if (event.target.dataset.close === "1") $("#pledgeModal").classList.add("hidden");
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") $("#pledgeModal").classList.add("hidden");
});
$("#pledgeForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.target;
  const condition = form.condition.value.trim();
  const promise = form.promise.value.trim();
  const errorEl = $("#pledgeError");
  errorEl.textContent = "";
  if (!condition || !promise) {
    errorEl.textContent = "Completá ambos campos";
    return;
  }
  try {
    await api("/api/pledges", { method: "POST", body: JSON.stringify({ condition, promise }) });
    $("#pledgeModal").classList.add("hidden");
    await loadState();
  } catch (err) {
    errorEl.textContent = err.message || "No se pudo guardar";
  }
});

/* ============== Admin tabs ============== */
const ADMIN_PANES = {
  results: "#adminPaneResults",
  content: "#adminPaneContent",
  bets: "#adminPaneBets",
  users: "#adminPaneUsers",
  broadcast: "#adminPaneBroadcast"
};

document.querySelectorAll(".admin-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".admin-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.adminTab;
    Object.entries(ADMIN_PANES).forEach(([key, sel]) => {
      $(sel).classList.toggle("hidden", key !== target);
    });
    if (target === "bets") loadAdminBets();
    if (target === "users") loadAdminUsers();
  });
});

/* ============== Admin: Apuestas ============== */
async function loadAdminBets() {
  try {
    const data = await api("/api/admin/predictions");
    state.adminBets = data.predictions || [];
    renderBetsTable();
  } catch (error) {
    $("#betsMessage").textContent = error.message;
  }
}

function renderBetsTable() {
  const filter = $("#betsFilter").value.toLowerCase().trim();
  const tbody = $("#betsTableBody");
  tbody.innerHTML = "";
  const items = state.adminBets.filter(b =>
    !filter ||
    b.userName.toLowerCase().includes(filter) ||
    b.username.toLowerCase().includes(filter) ||
    b.matchLabel.toLowerCase().includes(filter)
  );
  items.forEach(b => {
    const tr = document.createElement("tr");
    const official = b.officialHome !== null && b.officialAway !== null
      ? `${b.officialHome} - ${b.officialAway}`
      : "—";
    tr.innerHTML = `
      <td><strong>${escapeHtml(b.userName)}</strong><br><small class="muted">@${escapeHtml(b.username)}</small></td>
      <td>${escapeHtml(b.matchLabel)}</td>
      <td><strong>${b.homeScore} - ${b.awayScore}</strong></td>
      <td>${official}</td>
      <td><strong>${b.points}</strong></td>
      <td><button class="ghost btn-sm" data-bet-delete="${b.id}">🗑</button></td>
    `;
    tbody.appendChild(tr);
  });
  $("#betsMessage").textContent = items.length === 0 ? "Sin apuestas." : `${items.length} apuesta(s) · ${state.adminBets.length} total`;
}

$("#betsFilter").addEventListener("input", renderBetsTable);

$("#betsTableBody").addEventListener("click", async event => {
  const btn = event.target.closest("[data-bet-delete]");
  if (!btn) return;
  if (!confirm("¿Eliminar esta apuesta?")) return;
  try {
    await api(`/api/admin/predictions/${btn.dataset.betDelete}`, { method: "DELETE" });
    await loadAdminBets();
  } catch (error) {
    $("#betsMessage").textContent = error.message;
  }
});

/* ============== Admin: Settings ============== */
$("#settingsForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const data = await api("/api/admin/settings", {
      method: "POST",
      body: JSON.stringify({ rules: form.get("rules"), prizes: form.get("prizes") })
    });
    state.settings = data.settings;
    applySettingsToUI();
    $("#settingsMessage").textContent = "✅ Contenido actualizado.";
  } catch (error) {
    $("#settingsMessage").textContent = error.message;
  }
});

/* ============== Admin: Anuncios ============== */
$("#announcementForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const data = await api("/api/admin/settings", {
      method: "POST",
      body: JSON.stringify({ announcement: form.get("announcement") })
    });
    state.settings = data.settings;
    applySettingsToUI();
    $("#broadcastMessage").textContent = "✅ Anuncio publicado.";
  } catch (error) {
    $("#broadcastMessage").textContent = error.message;
  }
});

/* ============== Admin: Usuarios ============== */
async function loadAdminUsers() {
  try {
    const data = await api("/api/admin/users");
    state.adminUsers = data.users || [];
    renderUsersTable();
  } catch (error) {
    $("#usersMessage").textContent = error.message;
  }
}

function renderUsersTable() {
  const tbody = $("#usersTableBody");
  tbody.innerHTML = "";
  state.adminUsers.forEach(u => {
    const tr = document.createElement("tr");
    const isMe = u.id === state.user.id;
    tr.innerHTML = `
      <td><strong>${escapeHtml(u.name)}</strong><br><small class="muted">@${escapeHtml(u.username)}</small></td>
      <td>${u.predictionsCount}</td>
      <td>${u.isAdmin ? "👑 Admin" : "Jugador"}</td>
      <td class="user-actions">
        <button class="ghost btn-sm" data-user-toggle="${u.id}" ${isMe ? "disabled" : ""}>${u.isAdmin ? "Quitar admin" : "Hacer admin"}</button>
        <button class="ghost btn-sm" data-user-reset="${u.id}">🔑 Reset pass</button>
        <button class="ghost btn-sm danger" data-user-delete="${u.id}" ${isMe ? "disabled" : ""}>🗑</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  $("#usersMessage").textContent = `${state.adminUsers.length} usuario(s)`;
}

$("#usersTableBody").addEventListener("click", async event => {
  const btn = event.target.closest("button[data-user-toggle], button[data-user-reset], button[data-user-delete]");
  if (!btn) return;
  try {
    if (btn.dataset.userToggle) {
      await api(`/api/admin/users/${btn.dataset.userToggle}/toggle-admin`, { method: "POST", body: "{}" });
      await loadAdminUsers();
    } else if (btn.dataset.userReset) {
      const data = await api(`/api/admin/users/${btn.dataset.userReset}/reset-password`, { method: "POST", body: "{}" });
      alert(`Nueva contraseña temporal:\n\n${data.tempPassword}\n\nCompartila con el usuario para que la cambie luego.`);
    } else if (btn.dataset.userDelete) {
      if (!confirm("¿Eliminar este usuario y todas sus apuestas? Esta acción no se puede deshacer.")) return;
      await api(`/api/admin/users/${btn.dataset.userDelete}`, { method: "DELETE" });
      await loadAdminUsers();
      await loadState();
    }
  } catch (error) {
    $("#usersMessage").textContent = error.message;
  }
});

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(item => item.classList.remove("active"));
    tab.classList.add("active");
    const mode = tab.dataset.tab;
    $("#loginForm").classList.toggle("hidden", mode !== "login");
    $("#registerForm").classList.toggle("hidden", mode !== "register");
    authError.textContent = "";
  });
});

$("#loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  authError.textContent = "";
  const form = new FormData(event.currentTarget);
  try {
    const payload = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form))
    });
    setSession(payload);
    await loadState();
  } catch (error) {
    authError.textContent = error.message;
  }
});

$("#registerForm").addEventListener("submit", async event => {
  event.preventDefault();
  authError.textContent = "";
  const form = new FormData(event.currentTarget);
  try {
    const payload = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form))
    });
    setSession(payload);
    await loadState();
  } catch (error) {
    authError.textContent = error.message;
  }
});

appView.addEventListener("submit", async event => {
  if (!event.target.matches(".prediction-form")) return;
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    await api("/api/predictions", {
      method: "POST",
      body: JSON.stringify({
        matchId: event.target.dataset.matchId,
        homeScore: form.get("homeScore"),
        awayScore: form.get("awayScore")
      })
    });
    await loadState();
  } catch (error) {
    alert(error.message);
  }
});

$("#resultForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    await api("/api/admin/results", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form))
    });
    $("#adminMessage").textContent = "Resultado guardado.";
    event.currentTarget.reset();
    await loadState();
  } catch (error) {
    $("#adminMessage").textContent = error.message;
  }
});

$("#syncBtn").addEventListener("click", async () => {
  const data = await api("/api/admin/sync-placeholder", { method: "POST", body: "{}" });
  $("#adminMessage").textContent = data.message;
});

$("#refreshBtn").addEventListener("click", loadState);
$("#groupSelect").addEventListener("change", event => {
  state.selectedGroup = event.target.value;
  renderGroups();
});
$("#dateSelect").addEventListener("change", event => {
  state.selectedDate = event.target.value;
  renderGroups();
});
document.querySelectorAll(".view-toggle-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".view-toggle-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.groupView = btn.dataset.view;
    renderGroups();
  });
});
logoutBtn.addEventListener("click", clearSession);

if (state.token) {
  loadState().catch(() => clearSession());
} else {
  renderAuth();
}
