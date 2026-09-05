// ============================================================
// Python → Open Source Roadmap Tracker — app logic
// ============================================================

const STATUS = {
  not_started: { label: "Not started", color: "var(--st-0)" },
  learning: { label: "Learning", color: "var(--st-1)" },
  independent: { label: "Can use independently", color: "var(--st-2)" },
  comfortable: { label: "Comfortable", color: "var(--st-3)" },
  can_teach: { label: "Can teach / explain", color: "var(--st-4)" },
};
const STATUS_ORDER = ["not_started", "learning", "independent", "comfortable", "can_teach"];
const STATUS_WEIGHT = { not_started: 0, learning: 0.25, independent: 0.5, comfortable: 0.75, can_teach: 1 };
const DONE_STATES = new Set(["comfortable", "can_teach"]);

const AUTH_STORAGE_KEY = "roadmap_auth_v1";

let supabaseClient = null;
let configOk = false;

let state = {
  hash: null,
  progress: {}, // topic_key -> status
  filter: "all", // all | not_started | learning | independent | comfortable | can_teach
  search: "",
};

// ---------------- Supabase setup ----------------

function initSupabase() {
  configOk =
    typeof SUPABASE_URL === "string" &&
    typeof SUPABASE_ANON_KEY === "string" &&
    SUPABASE_URL.startsWith("http") &&
    !SUPABASE_ANON_KEY.startsWith("YOUR_");

  if (configOk && window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  if (!configOk) {
    document.getElementById("configWarning").style.display = "block";
  }
}

async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------- Auth ----------------

function readStoredAuth() {
  try {
    const local = localStorage.getItem(AUTH_STORAGE_KEY);
    if (local) return JSON.parse(local);
  } catch (e) {}
  try {
    const sess = sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (sess) return JSON.parse(sess);
  } catch (e) {}
  return null;
}

function storeAuth(hash, remember) {
  const payload = JSON.stringify({ hash });
  try {
    if (remember) {
      localStorage.setItem(AUTH_STORAGE_KEY, payload);
      sessionStorage.removeItem(AUTH_STORAGE_KEY);
    } else {
      sessionStorage.setItem(AUTH_STORAGE_KEY, payload);
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  } catch (e) {
    // storage unavailable (private mode etc) — session just won't persist
  }
}

function clearStoredAuth() {
  try { localStorage.removeItem(AUTH_STORAGE_KEY); } catch (e) {}
  try { sessionStorage.removeItem(AUTH_STORAGE_KEY); } catch (e) {}
}

async function loginWithHash(hash) {
  if (!supabaseClient) throw new Error("Supabase isn't configured yet — see config.js");

  const { error: loginErr } = await supabaseClient.rpc("app_login", { p_hash: hash });
  if (loginErr) throw loginErr;

  const { data, error: progErr } = await supabaseClient.rpc("app_get_progress", { p_hash: hash });
  if (progErr) throw progErr;

  const progress = {};
  (data || []).forEach((row) => { progress[row.topic_key] = row.status; });

  state.hash = hash;
  state.progress = progress;
}

async function tryAutoLogin() {
  const stored = readStoredAuth();
  if (!stored || !stored.hash || !configOk) return false;
  try {
    await loginWithHash(stored.hash);
    enterApp();
    return true;
  } catch (e) {
    console.error("Auto-login failed:", e);
    clearStoredAuth();
    return false;
  }
}

// ---------------- Login screen wiring ----------------

let rememberOn = false;

function setupLoginScreen() {
  const digits = Array.from(document.querySelectorAll(".code-digit"));
  const hint = document.getElementById("loginHint");
  const submitBtn = document.getElementById("loginSubmit");
  const rememberToggle = document.getElementById("rememberToggle");

  function currentCode() {
    return digits.map((d) => d.value).join("");
  }

  function refreshSubmitState() {
    const code = currentCode();
    submitBtn.disabled = !/^\d{8}$/.test(code);
  }

  digits.forEach((input, idx) => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/[^0-9]/g, "").slice(0, 1);
      input.classList.toggle("filled", input.value !== "");
      if (input.value && idx < digits.length - 1) digits[idx + 1].focus();
      hint.textContent = "";
      hint.classList.remove("error");
      refreshSubmitState();
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !input.value && idx > 0) {
        digits[idx - 1].focus();
      }
      if (e.key === "Enter") {
        submitBtn.click();
      }
    });

    input.addEventListener("paste", (e) => {
      const text = (e.clipboardData || window.clipboardData).getData("text").replace(/[^0-9]/g, "");
      if (text.length) {
        e.preventDefault();
        text.slice(0, 8).split("").forEach((ch, i) => {
          if (digits[i]) {
            digits[i].value = ch;
            digits[i].classList.add("filled");
          }
        });
        const nextIdx = Math.min(text.length, digits.length - 1);
        digits[nextIdx].focus();
        refreshSubmitState();
      }
    });
  });

  rememberToggle.addEventListener("click", () => {
    rememberOn = !rememberOn;
    rememberToggle.classList.toggle("on", rememberOn);
  });

  submitBtn.addEventListener("click", async () => {
    const code = currentCode();
    if (!/^\d{8}$/.test(code)) {
      hint.textContent = "Enter all 8 digits.";
      hint.classList.add("error");
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = "Signing in…";
    hint.textContent = "";
    hint.classList.remove("error");

    try {
      const hash = await sha256Hex(code);
      await loginWithHash(hash);
      storeAuth(hash, rememberOn);
      enterApp();
    } catch (e) {
      console.error(e);
      hint.textContent = "Couldn't reach the server. Check your Supabase setup in config.js.";
      hint.classList.add("error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Continue";
    }
  });

  digits[0].focus();
}

function logout() {
  clearStoredAuth();
  state = { hash: null, progress: {}, filter: "all", search: "" };
  document.getElementById("appShell").classList.remove("active");
  document.getElementById("loginScreen").style.display = "flex";
  document.querySelectorAll(".code-digit").forEach((d) => { d.value = ""; d.classList.remove("filled"); });
  document.getElementById("loginSubmit").disabled = true;
  document.getElementById("loginSubmit").textContent = "Continue";
}

// ---------------- Rendering ----------------

function statusOfTopic(key) {
  return state.progress[key] || "not_started";
}

function computeLevelPct(level) {
  const total = level.topics.length;
  if (!total) return 0;
  let sum = 0;
  level.topics.forEach((t) => { sum += STATUS_WEIGHT[statusOfTopic(`topic-${t.num}`)]; });
  return Math.round((sum / total) * 100);
}

function computeOverallPct() {
  let sum = 0, total = 0;
  ROADMAP_DATA.levels.forEach((level) => {
    level.topics.forEach((t) => {
      total++;
      sum += STATUS_WEIGHT[statusOfTopic(`topic-${t.num}`)];
    });
  });
  return total ? Math.round((sum / total) * 100) : 0;
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function buildSidebar() {
  const nav = document.getElementById("levelNav");
  nav.innerHTML = "";

  ROADMAP_DATA.levels.forEach((level) => {
    const btn = document.createElement("button");
    btn.className = "level-nav-item";
    btn.dataset.target = `level-${level.id}`;
    btn.innerHTML = `
      <span class="level-nav-dot"></span>
      <span class="level-nav-label">${escapeHtml(level.title)}</span>
      <span class="level-nav-pct">${computeLevelPct(level)}%</span>
    `;
    btn.addEventListener("click", () => scrollToSection(`level-${level.id}`, true));
    nav.appendChild(btn);
  });

  [
    ["Milestones", "milestones"],
    ["Parallel tracks", "parallel-tracks"],
    ["Core principle", "core-principle"],
  ].forEach(([label, id]) => {
    const btn = document.createElement("button");
    btn.className = "level-nav-item";
    btn.dataset.target = id;
    btn.innerHTML = `<span class="level-nav-dot"></span><span class="level-nav-label">${label}</span>`;
    btn.addEventListener("click", () => scrollToSection(id, true));
    nav.appendChild(btn);
  });
}

function refreshSidebarProgress() {
  document.getElementById("overallPct").textContent = computeOverallPct() + "%";
  document.getElementById("overallBarFill").style.width = computeOverallPct() + "%";

  const doneCount = Object.values(state.progress).filter((s) => DONE_STATES.has(s)).length;
  document.getElementById("overallCaption").textContent =
    `${doneCount} of 305 topics comfortable or better`;

  document.querySelectorAll(".level-nav-item[data-target^='level-']").forEach((btn) => {
    const levelId = parseInt(btn.dataset.target.replace("level-", ""), 10);
    const level = ROADMAP_DATA.levels.find((l) => l.id === levelId);
    if (!level) return;
    btn.querySelector(".level-nav-pct").textContent = computeLevelPct(level) + "%";
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function buildTopicRow(topic) {
  const key = `topic-${topic.num}`;
  const status = statusOfTopic(key);
  const row = document.createElement("div");
  row.className = "topic-row";
  row.dataset.key = key;
  row.dataset.title = topic.title.toLowerCase();

  row.innerHTML = `
    <div class="topic-main">
      <button class="topic-check ${DONE_STATES.has(status) ? "checked" : ""}" title="Mark comfortable / not started" aria-label="Toggle done">
        <svg viewBox="0 0 24 24" fill="none" stroke="#0b0d12" stroke-width="3"><path d="M4 12l5 5L20 7"/></svg>
      </button>
      <span class="status-dot" style="background:${STATUS[status].color}"></span>
      <span class="topic-num">${topic.num}.</span>
      <button class="topic-title-btn">
        <span class="chevron">▸</span>
        <span>${escapeHtml(topic.title)}</span>
      </button>
      <select class="status-select">
        ${STATUS_ORDER.map((s) => `<option value="${s}" ${s === status ? "selected" : ""}>${STATUS[s].label}</option>`).join("")}
      </select>
    </div>
    <div class="topic-sub">
      <ul>
        ${topic.items.map((it) => `<li>${formatItem(it)}</li>`).join("")}
      </ul>
    </div>
  `;

  row.querySelector(".topic-title-btn").addEventListener("click", () => {
    row.classList.toggle("expanded");
  });

  row.querySelector(".topic-check").addEventListener("click", () => {
    const isDone = DONE_STATES.has(statusOfTopic(key));
    const newStatus = isDone ? "not_started" : "comfortable";
    setTopicStatus(key, newStatus, row);
  });

  row.querySelector(".status-select").addEventListener("change", (e) => {
    setTopicStatus(key, e.target.value, row);
  });

  return row;
}

function formatItem(text) {
  // render `code` spans as styled inline code
  return escapeHtml(text).replace(/`([^`]+)`/g, "<code>$1</code>");
}

function setTopicStatus(key, status, row) {
  state.progress[key] = status;

  const dot = row.querySelector(".status-dot");
  dot.style.background = STATUS[status].color;
  row.querySelector(".status-select").value = status;
  row.querySelector(".topic-check").classList.toggle("checked", DONE_STATES.has(status));

  refreshSidebarProgress();
  applyFilters();
  saveProgress(key, status);
}

let saveQueue = Promise.resolve();
function saveProgress(key, status) {
  setSaveIndicator("saving");
  saveQueue = saveQueue
    .then(() => supabaseClient.rpc("app_set_progress", { p_hash: state.hash, p_topic_key: key, p_status: status }))
    .then(({ error }) => {
      if (error) throw error;
      setSaveIndicator("saved");
    })
    .catch((e) => {
      console.error("Save failed:", e);
      setSaveIndicator("error");
    });
}

let saveIndicatorTimer = null;
function setSaveIndicator(kind) {
  const dot = document.getElementById("saveDot");
  const label = document.getElementById("saveLabel");
  dot.className = "save-dot " + kind;
  if (kind === "saving") label.textContent = "Saving…";
  if (kind === "saved") {
    label.textContent = "Saved";
    clearTimeout(saveIndicatorTimer);
    saveIndicatorTimer = setTimeout(() => { label.textContent = "All changes saved"; }, 1200);
  }
  if (kind === "error") label.textContent = "Couldn't save — check connection";
}

function buildMainContent() {
  const main = document.getElementById("levelsContainer");
  main.innerHTML = "";

  ROADMAP_DATA.levels.forEach((level) => {
    const section = document.createElement("section");
    section.className = "level-section";
    section.id = `level-${level.id}`;

    const header = document.createElement("div");
    header.className = "level-header";
    header.innerHTML = `
      <span class="level-num">L${level.id}</span>
      <h2 class="level-title">${escapeHtml(level.title.replace(/^LEVEL\s+\d+\s*—\s*/, ""))}</h2>
      <span class="level-pct">${computeLevelPct(level)}%</span>
    `;
    section.appendChild(header);

    const list = document.createElement("div");
    list.className = "topic-list";
    level.topics.forEach((topic) => list.appendChild(buildTopicRow(topic)));
    section.appendChild(list);

    main.appendChild(section);
  });

  buildReferenceSections();
}

function buildReferenceSections() {
  const container = document.getElementById("referenceContainer");
  container.innerHTML = "";

  // Milestones
  const msSection = document.createElement("section");
  msSection.className = "ref-section";
  msSection.id = "milestones";
  msSection.innerHTML = `<div class="level-header"><h2 class="level-title">Recommended project milestones</h2></div>`;
  const msGrid = document.createElement("div");
  msGrid.className = "ref-grid";
  ROADMAP_DATA.milestones.forEach((m) => {
    if (!m.projects.length && !m.note.length) return;
    const card = document.createElement("div");
    card.className = "ref-card";
    const body = m.projects.length
      ? `<ul>${m.projects.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>`
      : `<p style="color:var(--text-mid);font-size:12.5px;line-height:1.6;margin:0">${m.note.map(escapeHtml).join("<br>")}</p>`;
    card.innerHTML = `<h3>${escapeHtml(m.title)}</h3>${body}`;
    msGrid.appendChild(card);
  });
  msSection.appendChild(msGrid);
  container.appendChild(msSection);

  // Parallel tracks
  const ptSection = document.createElement("section");
  ptSection.className = "ref-section";
  ptSection.id = "parallel-tracks";
  ptSection.innerHTML = `<div class="level-header"><h2 class="level-title">Parallel tracks</h2></div>`;
  const ptGrid = document.createElement("div");
  ptGrid.className = "ref-grid";
  ROADMAP_DATA.parallelTracks.forEach((track) => {
    const card = document.createElement("div");
    card.className = "ref-card track-card";
    let inner = `<h3>${escapeHtml(track.name)}</h3>`;
    track.subsections.forEach((sub) => {
      if (sub.name !== "_flat") inner += `<div class="track-sub-title">${escapeHtml(sub.name)}</div>`;
      inner += `<ul>${sub.items.map((it) => `<li>${escapeHtml(it)}</li>`).join("")}</ul>`;
    });
    card.innerHTML = inner;
    ptGrid.appendChild(card);
  });
  ptSection.appendChild(ptGrid);
  container.appendChild(ptSection);

  // Core principle
  const cpSection = document.createElement("section");
  cpSection.className = "ref-section";
  cpSection.id = "core-principle";
  cpSection.innerHTML = `<div class="level-header"><h2 class="level-title">Core principle</h2></div>`;
  const block = document.createElement("div");
  block.className = "principle-block";
  ROADMAP_DATA.corePrinciple.forEach((line) => {
    if (line.includes("→")) {
      block.innerHTML += `<div class="principle-flow">${escapeHtml(line.replace(/\*\*/g, ""))}</div>`;
    } else {
      const withStrong = escapeHtml(line).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      block.innerHTML += `<p>${withStrong}</p>`;
    }
  });
  cpSection.appendChild(block);
  container.appendChild(cpSection);
}

// ---------------- Filters / search ----------------

function applyFilters() {
  const q = state.search.trim().toLowerCase();
  document.querySelectorAll(".topic-row").forEach((row) => {
    const status = statusOfTopic(row.dataset.key);
    const matchesFilter = state.filter === "all" || status === state.filter;
    const matchesSearch = !q || row.dataset.title.includes(q);
    row.classList.toggle("hidden-by-filter", !(matchesFilter && matchesSearch));
  });
}

function setupFilters() {
  document.getElementById("searchInput").addEventListener("input", (e) => {
    state.search = e.target.value;
    applyFilters();
  });

  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      state.filter = chip.dataset.filter;
      applyFilters();
    });
  });
}

// ---------------- Nav scroll / mobile sidebar ----------------

function scrollToSection(id, closeMobile) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  if (closeMobile) closeMobileSidebar();
}

function setupMobileSidebar() {
  const sidebar = document.getElementById("sidebar");
  const scrim = document.getElementById("sidebarScrim");
  document.getElementById("mobileMenuBtn").addEventListener("click", () => {
    sidebar.classList.add("open");
    scrim.classList.add("open");
  });
  scrim.addEventListener("click", closeMobileSidebar);
}

function closeMobileSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebarScrim").classList.remove("open");
}

function setupIntersectionHighlight() {
  const sections = document.querySelectorAll(".level-section, .ref-section");
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          document.querySelectorAll(".level-nav-item").forEach((btn) => {
            btn.classList.toggle("current", btn.dataset.target === entry.target.id);
          });
        }
      });
    },
    { rootMargin: "-10% 0px -75% 0px" }
  );
  sections.forEach((s) => observer.observe(s));
}

// ---------------- App entry ----------------

function enterApp() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("appShell").classList.add("active");
  document.getElementById("codeBadge").textContent = "•••• •••• (signed in)";

  buildSidebar();
  buildMainContent();
  refreshSidebarProgress();
  setupFilters();
  setupIntersectionHighlight();
}

function setupLogout() {
  document.getElementById("logoutBtn").addEventListener("click", logout);
}

async function main() {
  initSupabase();
  setupLoginScreen();
  setupMobileSidebar();
  setupLogout();
  await tryAutoLogin();
}

document.addEventListener("DOMContentLoaded", main);
