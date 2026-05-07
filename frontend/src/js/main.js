/**
 * main.js – Dashboard controller
 * Handles navigation, polling, uploads, training, aggregation, and UI updates
 */

// ── State ─────────────────────────────────────────────────────────────────────
const AppState = {
  currentPage:   "overview",
  statuses:      {},
  clientMetrics: {},
  serverMetrics: {},
  rounds:        [],
  pollTimer:     null,
  networkTimer:  null,
  isAggregating: false,
};

// ── Charts (lazy initialized) ─────────────────────────────────────────────────
const Charts = {};

// ── DOM Helpers ────────────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
function el(id) { return document.getElementById(id); }
function setText(id, val) { const e = el(id); if (e) e.textContent = val; }
function html_(id, val)  { const e = el(id); if (e) e.innerHTML  = val; }
function pct(v) { return (v * 100).toFixed(1) + "%"; }
function fmt(v)  { return typeof v === "number" ? v.toFixed(4) : v ?? "—"; }
function fmtN(v) { return typeof v === "number" ? v.toLocaleString() : (v ?? "—"); }

// ── Toast Notifications ────────────────────────────────────────────────────────
function toast(type, title, msg) {
  const icons = { success:"✅", error:"❌", info:"ℹ️", warning:"⚠️" };
  const div = document.createElement("div");
  div.className = `toast ${type}`;
  div.innerHTML = `
    <span class="toast-icon">${icons[type]||"ℹ️"}</span>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      ${msg ? `<div class="toast-msg">${msg}</div>` : ""}
    </div>`;
  el("toast-container").appendChild(div);
  setTimeout(() => div.remove(), 5000);
}

// ── Navigation ─────────────────────────────────────────────────────────────────
function navigateTo(pageId) {
  $$(".page").forEach(p => p.classList.remove("active"));
  $$(".nav-item").forEach(n => n.classList.remove("active"));
  const page = el(`page-${pageId}`);
  if (page) { page.classList.add("active"); page.classList.add("fade-in"); }
  const nav = el(`nav-${pageId}`);
  if (nav) nav.classList.add("active");
  AppState.currentPage = pageId;
  el("topbar-title").textContent = {
    overview:   "🧠 Overview",
    nodes:      "🌐 Client Nodes",
    training:   "⚡ Training Control",
    analytics:  "📊 Analytics",
    privacy:    "🔒 Privacy & Security",
    predict:    "🔍 Mental Health Predictor",
  }[pageId] || "Dashboard";

  // Lazy-init charts
  if (pageId === "overview"  && !Charts.accuracy)      initOverviewCharts();
  if (pageId === "analytics" && !Charts.nodeBar)        initAnalyticsCharts();
  if (pageId === "training"  && !Charts.divergence)     initTrainingCharts();
}

$$(".nav-item").forEach(item => {
  item.addEventListener("click", () => navigateTo(item.dataset.page));
});

// ── Chart Initialization ───────────────────────────────────────────────────────
function initOverviewCharts() {
  Charts.accuracy = createAccuracyChart("chart-accuracy");
  Charts.riskDonut = createRiskDonut("chart-risk-donut");
  Charts.samples   = createSamplesChart("chart-samples");
}

function initAnalyticsCharts() {
  Charts.nodeBar      = createNodeBarChart("chart-node-bar");
  Charts.riskRadar    = createRiskRadar("chart-risk-radar");
  Charts.auc          = createAucChart("chart-auc");
  Charts.communication = createCommChart("chart-comm");
}

function initTrainingCharts() {
  Charts.divergence    = createDivergenceChart("chart-divergence");
  Charts.participation = createParticipationChart("chart-participation");
}

// ── Polling ────────────────────────────────────────────────────────────────────
async function pollAll() {
  await Promise.all([
    pollServerStatus(),
    pollClientStatuses(),
  ]);
  renderTopbar();
  renderOverview();
  if (AppState.currentPage === "nodes")     renderNodes();
  if (AppState.currentPage === "analytics") updateAnalyticsPage();
  if (AppState.currentPage === "training")  updateTrainingPage();
  if (AppState.currentPage === "privacy")   updatePrivacyPage();
}

async function pollServerStatus() {
  const [status, metrics, history] = await Promise.all([
    Server.status(),
    Server.metrics(),
    Server.history(),
  ]);
  if (status.ok) AppState.serverStatus = status.data;
  if (metrics.ok) { AppState.serverMetrics = metrics.data; AppState.rounds = metrics.data.rounds || []; }
  if (history.ok) AppState.rounds = history.data;
}

async function pollClientStatuses() {
  AppState.statuses = await fetchAllStatuses();

  // Fetch metrics for trained clients
  await Promise.all(
    Object.keys(NODES).map(async (id) => {
      if (AppState.statuses[id]?.trained) {
        const r = await Client.metrics(id);
        if (r.ok) AppState.clientMetrics[id] = r.data;
      }
    })
  );
}

// ── Topbar updates ────────────────────────────────────────────────────────────
function renderTopbar() {
  const round = AppState.serverStatus?.round ?? 0;
  setText("topbar-round", `Round ${round}`);
  el("clock").textContent = new Date().toLocaleTimeString();

  const allOnline = Object.values(AppState.statuses).some(s => s.online);
  el("server-dot").style.display    = allOnline ? "" : "none";
  el("server-status-text").textContent = allOnline ? "System Online" : "Connecting…";
}

// ── Overview Page ─────────────────────────────────────────────────────────────
function renderOverview() {
  const ss = AppState.serverStatus   || {};
  const sm = AppState.serverMetrics  || {};
  const statuses = AppState.statuses;
  const rounds   = AppState.rounds;

  // Stat cards
  setText("stat-round",     ss.round              ?? 0);
  setText("stat-nodes",     Object.keys(NODES).length);
  setText("stat-samples",   fmtN(ss.total_samples ?? 0));
  setText("stat-accuracy",  sm.best_accuracy ? pct(sm.best_accuracy) : "—");
  setText("stat-f1",        sm.best_f1        ? pct(sm.best_f1)       : "—");

  const trained = Object.values(statuses).filter(s => s.trained).length;
  setText("stat-trained",   `${trained}/${Object.keys(NODES).length}`);

  // Global risk ratio
  const riskRatios = Object.values(AppState.clientMetrics)
    .map(m => m.risk_ratio).filter(v => v !== undefined);
  const avgRisk = riskRatios.length ? riskRatios.reduce((a,b)=>a+b,0)/riskRatios.length : 0;
  setText("stat-risk",  pct(avgRisk));
  updateRiskGauge(avgRisk);

  // Charts
  if (Charts.accuracy  && rounds.length)           updateAccuracyChart(Charts.accuracy, rounds);
  if (Charts.riskDonut && riskRatios.length)        updateRiskDonut(Charts.riskDonut, avgRisk);
  if (Charts.samples)                               updateSamplesChart(Charts.samples, statuses);

  // FL Network
  drawFLNetwork("network-canvas", statuses);

  // Mini node status list
  renderNodeStatusList();

  // Latest round info
  if (rounds.length) {
    const last = rounds[rounds.length - 1];
    setText("latest-round",   last.round);
    setText("latest-clients", last.n_clients);
    setText("latest-samples", fmtN(last.total_samples));
    setText("latest-acc",     pct(last.avg_accuracy));
    setText("latest-f1",      pct(last.avg_f1));
    setText("latest-time",    last.aggregation_time_s + "s");
  }
}

function renderNodeStatusList() {
  const wrap = el("node-status-list");
  if (!wrap) return;
  wrap.innerHTML = Object.entries(NODES).map(([id, info]) => {
    const s = AppState.statuses[id] || {};
    const m = AppState.clientMetrics[id] || {};
    const statusClass = s.trained ? "badge-cyan" : s.online ? "badge-green" : "badge-red";
    const statusText  = s.trained ? "Trained" : s.online ? "Online" : "Offline";
    return `
    <div class="flex items-center justify-between" style="padding:10px 0;border-bottom:1px solid var(--border)">
      <div class="flex items-center gap-12">
        <span style="font-size:18px">${info.icon}</span>
        <div>
          <div style="font-size:13px;font-weight:600">${info.name}</div>
          <div class="text-sm text-muted">${fmtN(s.n_samples||0)} samples</div>
        </div>
      </div>
      <div class="flex items-center gap-12">
        ${m.accuracy ? `<span class="text-cyan" style="font-size:13px;font-weight:700">${pct(m.accuracy)}</span>` : ""}
        <span class="badge ${statusClass}">${statusText}</span>
      </div>
    </div>`;
  }).join("");
}

function updateRiskGauge(ratio) {
  const el_ = el("gauge-value");
  if (!el_) return;
  const pct_ = (ratio * 100).toFixed(1);
  el_.textContent = pct_ + "%";
  el_.style.color = ratio > 0.6 ? "var(--red)" : ratio > 0.35 ? "var(--orange)" : "var(--green)";

  // Draw gauge arc
  const canvas = el("gauge-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const cx = w/2, cy = h * 0.85;
  const R  = w * 0.42;

  // Background arc
  ctx.beginPath();
  ctx.arc(cx, cy, R, Math.PI, 0);
  ctx.lineWidth   = 14;
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.stroke();

  // Value arc
  const sweep = ratio * Math.PI;
  ctx.beginPath();
  ctx.arc(cx, cy, R, Math.PI, Math.PI + sweep);
  ctx.lineWidth = 14;
  const grd = ctx.createLinearGradient(cx-R, 0, cx+R, 0);
  grd.addColorStop(0, "#10b981");
  grd.addColorStop(0.5, "#f59e0b");
  grd.addColorStop(1,  "#ef4444");
  ctx.strokeStyle = grd;
  ctx.lineCap = "round";
  ctx.stroke();
}

// ── Nodes Page ────────────────────────────────────────────────────────────────
function renderNodes() {
  const wrap = el("nodes-grid");
  if (!wrap) return;
  wrap.innerHTML = Object.entries(NODES).map(([id, info]) => buildNodeCard(id, info)).join("");
  attachNodeHandlers();
}

function buildNodeCard(id, info) {
  const s = AppState.statuses[id] || {};
  const m = AppState.clientMetrics[id] || {};
  const online = s.online !== false;
  const trained = !!s.trained;

  const cm = m.confusion_matrix;
  const cmHTML = cm ? `
    <div class="mb-12">
      <div class="card-title"><span class="card-title-icon">🎯</span> Confusion Matrix</div>
      <div style="display:flex;gap:16px;align-items:flex-start">
        <div class="cm-grid">
          <div class="cm-cell cm-tn"><div>${cm[0][0]}</div><div class="cm-label">TN</div></div>
          <div class="cm-cell cm-fp"><div>${cm[0][1]}</div><div class="cm-label">FP</div></div>
          <div class="cm-cell cm-fn"><div>${cm[1][0]}</div><div class="cm-label">FN</div></div>
          <div class="cm-cell cm-tp"><div>${cm[1][1]}</div><div class="cm-label">TP</div></div>
        </div>
        <div style="font-size:11px;color:var(--text-muted);line-height:1.8">
          <div>Predicted Safe | At Risk</div>
          <div style="color:var(--green)">True Safe (TN / FP)</div>
          <div style="color:var(--red)">True Risk (FN / TP)</div>
        </div>
      </div>
    </div>` : "";

  const riskPct = m.risk_ratio != null ? (m.risk_ratio * 100).toFixed(1) : null;

  return `
  <div class="node-card" id="node-card-${id}">
    <div class="node-header">
      <div class="node-icon-wrap" style="--node-color-bg:${info.color}22;--node-color-border:${info.color}44">
        <span>${info.icon}</span>
      </div>
      <div style="flex:1">
        <div class="node-name">${info.name}</div>
        <div class="node-status-label ${trained?'trained':online?'online':'offline'}">
          ${trained ? "✓ Trained & Ready" : online ? "● Online – No Data" : "✗ Offline"}
        </div>
      </div>
      <div>
        <span class="badge ${trained?'badge-cyan':online?'badge-green':'badge-red'}" style="font-size:10px">
          R${s.global_round||0}
        </span>
      </div>
    </div>

    <div class="node-body">
      <!-- Metrics Grid -->
      <div class="node-metrics mb-16">
        <div class="node-metric">
          <div class="nm-label">Samples</div>
          <div class="nm-value">${fmtN(s.n_samples||0)}</div>
        </div>
        <div class="node-metric">
          <div class="nm-label">Accuracy</div>
          <div class="nm-value">${m.accuracy != null ? pct(m.accuracy) : "—"}</div>
        </div>
        <div class="node-metric">
          <div class="nm-label">F1 Score</div>
          <div class="nm-value" style="color:var(--violet)">${m.f1 != null ? pct(m.f1) : "—"}</div>
        </div>
        <div class="node-metric">
          <div class="nm-label">AUC-ROC</div>
          <div class="nm-value" style="color:var(--green)">${m.auc_roc != null ? fmt(m.auc_roc) : "—"}</div>
        </div>
        <div class="node-metric">
          <div class="nm-label">Precision</div>
          <div class="nm-value" style="color:var(--orange)">${m.precision != null ? pct(m.precision) : "—"}</div>
        </div>
        <div class="node-metric">
          <div class="nm-label">Recall</div>
          <div class="nm-value" style="color:var(--pink)">${m.recall != null ? pct(m.recall) : "—"}</div>
        </div>
      </div>

      <!-- Risk Bar -->
      ${riskPct != null ? `
      <div class="mb-16">
        <div class="flex justify-between mb-4">
          <span class="text-sm text-muted">Mental Health Risk Ratio</span>
          <span class="text-sm" style="color:${m.risk_ratio>0.6?'var(--red)':m.risk_ratio>0.35?'var(--orange)':'var(--green)'}">
            ${riskPct}%
          </span>
        </div>
        <div class="risk-bar-wrap">
          <div class="risk-bar-fill" style="width:${riskPct}%"></div>
        </div>
      </div>` : ""}

      <!-- Confusion Matrix -->
      ${cmHTML}

      <!-- Upload Zone -->
      <div class="upload-zone mb-12" id="zone-${id}">
        <input type="file" accept=".csv" id="file-${id}" onchange="handleFileSelect('${id}', this)">
        <div class="upload-icon">📂</div>
        <div class="upload-text">Drop CSV or click to browse</div>
        <div class="upload-sub">Columns: text, target (0/4)</div>
        <div class="upload-file-name" id="fname-${id}"></div>
      </div>

      <!-- Actions -->
      <div class="flex gap-12">
        <button class="btn btn-primary btn-sm" id="btn-upload-${id}" onclick="doUpload('${id}')" disabled>
          📤 Upload
        </button>
        <button class="btn btn-success btn-sm" ${!s.trained&&!s.n_samples?'disabled':''} id="btn-train-${id}" onclick="doTrain('${id}')">
          ⚡ Train (5ep)
        </button>
        <button class="btn btn-outline btn-sm" ${!trained?'disabled':''} onclick="showNodeMetrics('${id}')">
          📈 Details
        </button>
      </div>

      ${s.last_trained ? `
      <div class="text-sm text-muted mt-12 font-mono">
        Last trained: ${new Date(s.last_trained).toLocaleString()}
      </div>` : ""}
    </div>
  </div>`;
}

function attachNodeHandlers() {
  Object.keys(NODES).forEach(id => {
    const zone = el(`zone-${id}`);
    if (!zone) return;
    zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("dragging"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("dragging"));
    zone.addEventListener("drop", e => {
      e.preventDefault();
      zone.classList.remove("dragging");
      const file = e.dataTransfer.files[0];
      if (file) { AppState[`file_${id}`] = file; el(`fname-${id}`).textContent = "📄 " + file.name; el(`btn-upload-${id}`).disabled = false; }
    });
  });
}

function handleFileSelect(id, input) {
  const file = input.files[0];
  if (!file) return;
  AppState[`file_${id}`] = file;
  el(`fname-${id}`).textContent = "📄 " + file.name;
  el(`btn-upload-${id}`).disabled = false;
}

async function doUpload(id) {
  const file = AppState[`file_${id}`];
  if (!file) { toast("error", "No file selected", "Please browse or drop a CSV file first."); return; }

  const btn = el(`btn-upload-${id}`);
  btn.disabled = true;
  btn.innerHTML = `<span class="loader"></span> Uploading…`;

  const r = await Client.upload(id, file);
  btn.innerHTML = "📤 Upload";
  btn.disabled  = false;

  if (r.ok) {
    toast("success", `${NODES[id].name}: Data uploaded`, `${fmtN(r.data.n_samples)} samples | Risk: ${pct(r.data.risk_ratio)}`);
    el(`btn-train-${id}`).disabled = false;
    await pollAll();
    if (AppState.currentPage === "nodes") renderNodes();
  } else {
    toast("error", "Upload failed", r.data?.error || "Unknown error");
  }
}

async function doTrain(id, epochs = 5) {
  const btn = el(`btn-train-${id}`);
  if (btn) { btn.disabled = true; btn.innerHTML = `<span class="loader"></span> Training…`; }

  const r = await Client.train(id, epochs);

  if (btn) { btn.disabled = false; btn.innerHTML = "⚡ Train (5ep)"; }

  if (r.ok) {
    toast("success", `${NODES[id].name}: Training complete`,
      `Acc: ${pct(r.data.accuracy)} | F1: ${pct(r.data.f1)} | Risk: ${pct(r.data.risk_ratio)}`);
    await pollAll();
    if (AppState.currentPage === "nodes") renderNodes();
  } else {
    toast("error", "Training failed", r.data?.error || "Upload data first");
  }
}

function showNodeMetrics(id) {
  navigateTo("analytics");
}

// ── Training Control Page ─────────────────────────────────────────────────────
function buildTrainingPage() {
  const wrap = el("training-nodes-grid");
  if (!wrap) return;
  wrap.innerHTML = Object.entries(NODES).map(([id, info]) => {
    const s = AppState.statuses[id] || {};
    const m = AppState.clientMetrics[id] || {};
    return `
    <div style="background:var(--bg-surface);border-radius:var(--radius-md);padding:16px;border:1px solid var(--border)">
      <div class="flex items-center gap-12 mb-12">
        <span style="font-size:20px">${info.icon}</span>
        <div>
          <div style="font-weight:600;font-size:13px">${info.name}</div>
          <div class="text-sm text-muted">${fmtN(s.n_samples||0)} samples</div>
        </div>
        <div style="margin-left:auto">
          <span class="badge ${s.trained?'badge-cyan':s.n_samples?'badge-orange':'badge-red'}">
            ${s.trained?'Trained':s.n_samples?'Data Loaded':'No Data'}
          </span>
        </div>
      </div>
      ${m.accuracy ? `
      <div class="flex gap-12">
        <div style="flex:1;background:var(--bg-card);border-radius:6px;padding:8px;text-align:center">
          <div class="nm-label">Accuracy</div>
          <div style="font-size:16px;font-weight:700;color:var(--cyan)">${pct(m.accuracy)}</div>
        </div>
        <div style="flex:1;background:var(--bg-card);border-radius:6px;padding:8px;text-align:center">
          <div class="nm-label">F1</div>
          <div style="font-size:16px;font-weight:700;color:var(--violet)">${pct(m.f1)}</div>
        </div>
      </div>` : `<div class="text-sm text-muted" style="text-align:center;padding:12px">Not trained yet</div>`}
      <div class="flex gap-12 mt-12">
        <button class="btn btn-success btn-sm" style="flex:1" onclick="doTrain('${id}')"
          ${!s.n_samples?'disabled':''}>
          ⚡ Train
        </button>
        <select id="ep-${id}" style="background:var(--bg-card);border:1px solid var(--border);color:var(--text-primary);border-radius:6px;padding:6px;font-size:12px">
          <option value="3">3 ep</option>
          <option value="5" selected>5 ep</option>
          <option value="10">10 ep</option>
          <option value="20">20 ep</option>
        </select>
      </div>
    </div>`;
  }).join("");
}

async function runFLRound() {
  if (AppState.isAggregating) return;
  AppState.isAggregating = true;

  const btn = el("btn-aggregate");
  btn.disabled = true;
  btn.innerHTML = `<span class="loader"></span> Aggregating…`;

  const r = await Server.aggregate();

  btn.disabled = false;
  btn.innerHTML = "🚀 Run FL Round (FedAvg)";
  AppState.isAggregating = false;

  if (r.ok) {
    toast("success", `Round ${r.data.round} complete!`,
      `${r.data.n_clients} clients | Acc: ${pct(r.data.avg_accuracy)} | F1: ${pct(r.data.avg_f1)}`);
    await pollAll();
    renderOverview();
    updateTrainingPage();
  } else {
    toast("error", "Aggregation failed", r.data?.error || "Train at least one node first");
  }
}

function updateTrainingPage() {
  buildTrainingPage();
  const rounds = AppState.rounds;
  if (!rounds.length) return;

  if (Charts.divergence)    updateDivergenceChart(Charts.divergence, rounds);
  if (Charts.participation) updateParticipationChart(Charts.participation, rounds);

  // Round history table
  const tbody = el("round-history-tbody");
  if (tbody) {
    tbody.innerHTML = [...rounds].reverse().slice(0, 20).map(r => `
      <tr>
        <td class="td-mono">${r.round}</td>
        <td class="td-mono">${new Date(r.timestamp).toLocaleString()}</td>
        <td>${r.n_clients}</td>
        <td class="td-mono text-cyan">${pct(r.avg_accuracy)}</td>
        <td class="td-mono" style="color:var(--violet)">${pct(r.avg_f1)}</td>
        <td class="td-mono text-orange">${pct(r.avg_risk_ratio||0)}</td>
        <td class="td-mono">${fmtN(r.total_samples)}</td>
        <td class="td-mono">${r.aggregation_time_s}s</td>
        <td>${r.participating_clients?.map(c => NODES[c]?.icon || c).join(" ") || "—"}</td>
      </tr>`).join("");
  }
}

// ── Analytics Page ────────────────────────────────────────────────────────────
function updateAnalyticsPage() {
  const m  = AppState.clientMetrics;
  const r  = AppState.rounds;

  if (Charts.nodeBar)       updateNodeBarChart(Charts.nodeBar, m);
  if (Charts.riskRadar)     updateRiskRadar(Charts.riskRadar, m);
  if (Charts.auc)           updateAucChart(Charts.auc, m);
  if (Charts.communication) updateCommChart(Charts.communication, r);

  // Metrics table
  const tbody = el("metrics-table-tbody");
  if (!tbody) return;
  tbody.innerHTML = Object.entries(NODES).map(([id, info]) => {
    const s  = AppState.statuses[id] || {};
    const cm = m[id] || {};
    return `
      <tr>
        <td><span style="font-size:16px">${info.icon}</span> ${info.name}</td>
        <td class="td-mono">${fmtN(s.n_samples||0)}</td>
        <td class="td-mono text-cyan">${cm.accuracy  ? pct(cm.accuracy)  : "—"}</td>
        <td class="td-mono" style="color:var(--violet)">${cm.f1        ? pct(cm.f1)        : "—"}</td>
        <td class="td-mono text-orange">${cm.precision ? pct(cm.precision) : "—"}</td>
        <td class="td-mono" style="color:var(--pink)">${cm.recall    ? pct(cm.recall)    : "—"}</td>
        <td class="td-mono text-green">${cm.auc_roc  ? fmt(cm.auc_roc)  : "—"}</td>
        <td class="td-mono">${cm.log_loss_val != null ? fmt(cm.log_loss_val) : "—"}</td>
        <td class="td-mono">${cm.risk_ratio  != null ? pct(cm.risk_ratio)  : "—"}</td>
        <td class="td-mono">${cm.n_at_risk   != null ? fmtN(cm.n_at_risk)  : "—"}</td>
        <td><span class="badge ${s.trained?'badge-cyan':'badge-red'}">${s.trained?'✓':'✗'}</span></td>
      </tr>`;
  }).join("");
}

// ── Privacy Page ──────────────────────────────────────────────────────────────
async function updatePrivacyPage() {
  const r = await Server.privacyReport();
  if (!r.ok) return;
  const d = r.data;

  setText("priv-total-data",         (d.total_data_kb||0).toFixed(1) + " KB");
  setText("priv-transmitted",        (d.transmitted_weights_kb||0).toFixed(1) + " KB");
  setText("priv-ratio",              pct(d.privacy_ratio||0));
  setText("priv-protocol",           d.protocol || "FedAvg");
  setText("priv-guarantee",          d.privacy_guarantee || "—");

  const tbody = el("priv-table-tbody");
  if (!tbody) return;
  tbody.innerHTML = Object.entries(d.clients || {}).map(([id, c]) => `
    <tr>
      <td>${NODES[id]?.icon} ${NODES[id]?.name || id}</td>
      <td class="td-mono">${fmtN(c.n_samples||0)}</td>
      <td class="td-mono">${(c.data_size_kb||0).toFixed(1)} KB</td>
      <td><span class="badge badge-green">✓ Local Only</span></td>
      <td><span class="badge ${c.weights_transmitted?'badge-cyan':'badge-red'}">${c.weights_transmitted?'✓ Shared':'✗ Not yet'}</span></td>
      <td><span class="badge badge-green">✓ Never transmitted</span></td>
    </tr>`).join("");
}

// ── Predict Page ──────────────────────────────────────────────────────────────
async function runPredict() {
  const ta  = el("predict-textarea");
  const out = el("predict-results");
  if (!ta || !out) return;

  const lines = ta.value.split("\n").map(l=>l.trim()).filter(Boolean);
  if (!lines.length) { toast("warning", "No text", "Enter at least one text to classify."); return; }

  out.innerHTML = `<div class="text-muted" style="padding:20px;text-align:center"><span class="loader"></span> Predicting…</div>`;

  // Try each trained node
  let result = null;
  for (const id of Object.keys(NODES)) {
    if (AppState.statuses[id]?.trained) {
      const r = await Client.predict(id, lines);
      if (r.ok) { result = { ...r.data, node: id }; break; }
    }
  }

  if (!result) {
    out.innerHTML = `<div class="badge badge-red" style="padding:12px">No trained node available. Train at least one node first.</div>`;
    return;
  }

  out.innerHTML = result.results.map(res => {
    const cls  = res.risk_level === "High Risk" ? "at-risk" : res.risk_level === "Medium Risk" ? "medium" : "";
    const icon = res.risk_level === "High Risk" ? "🔴" : res.risk_level === "Medium Risk" ? "🟡" : "🟢";
    const riskColor = res.risk_level === "High Risk" ? "var(--red)" : res.risk_level === "Medium Risk" ? "var(--orange)" : "var(--green)";
    return `
    <div class="predict-result-card ${cls}">
      <div class="predict-text">"${res.text}"</div>
      <div class="flex items-center justify-between">
        <div class="predict-risk" style="color:${riskColor}">${icon} ${res.risk_level}</div>
        <div class="flex gap-12">
          <span class="badge ${res.at_risk?'badge-red':'badge-green'}">${res.at_risk ? 'AT RISK' : 'SAFE'}</span>
          <span class="text-sm text-muted font-mono">Prob: ${(res.risk_prob*100).toFixed(1)}%</span>
        </div>
      </div>
      <div style="margin-top:8px">
        <div class="progress-bar-wrap">
          <div class="progress-bar-fill" style="width:${(res.risk_prob*100).toFixed(1)}%;background:${riskColor}"></div>
        </div>
      </div>
    </div>`;
  }).join("") + `<div class="text-sm text-muted mt-12">Results from: ${NODES[result.node]?.icon} ${NODES[result.node]?.name}</div>`;
}

// ── Train All Nodes ──────────────────────────────────────────────────────────
async function trainAllNodes() {
  const btn = el("btn-train-all");
  btn.disabled = true;
  btn.innerHTML = `<span class="loader"></span> Training all…`;

  const dataLoaded = Object.keys(NODES).filter(id =>
    AppState.statuses[id]?.n_samples > 0 && !AppState.statuses[id]?.trained
  );

  if (!dataLoaded.length) {
    toast("warning", "Nothing to train", "Upload data to nodes first");
    btn.disabled = false;
    btn.innerHTML = "⚡ Train All Nodes";
    return;
  }

  for (const id of dataLoaded) {
    await doTrain(id, 5);
  }

  btn.disabled = false;
  btn.innerHTML = "⚡ Train All Nodes";
  toast("success", "All nodes trained", "You can now run the FL aggregation round.");
}

// ── Init ─────────────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", async () => {
  navigateTo("overview");

  // Initial poll
  await pollAll();

  // Periodic polling (every 8s)
  AppState.pollTimer = setInterval(pollAll, 8000);

  // Animate FL network continuously
  AppState.networkTimer = setInterval(() => {
    if (AppState.currentPage === "overview") {
      drawFLNetwork("network-canvas", AppState.statuses);
    }
  }, 1200);
});

// Expose for HTML onclick
window.doUpload     = doUpload;
window.doTrain      = doTrain;
window.handleFileSelect = handleFileSelect;
window.runFLRound   = runFLRound;
window.runPredict   = runPredict;
window.navigateTo   = navigateTo;
window.trainAllNodes = trainAllNodes;
window.showNodeMetrics = showNodeMetrics;
