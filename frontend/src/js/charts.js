/**
 * charts.js – Chart.js chart factories for the FL Dashboard
 */

Chart.defaults.color = "#94a3b8";
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.font.size   = 12;

const CHART_COLORS = {
  cyan:   "#00d4ff",
  violet: "#8b5cf6",
  green:  "#10b981",
  orange: "#f59e0b",
  red:    "#ef4444",
  pink:   "#ec4899",
  twitter:   "#1DA1F2",
  reddit:    "#FF4500",
  facebook:  "#4267B2",
  instagram: "#C13584",
  linkedin:  "#0077B5",
};

function makeGradient(ctx, color) {
  const grad = ctx.createLinearGradient(0, 0, 0, 280);
  const c = hexToRgb(color);
  if (c) {
    grad.addColorStop(0, `rgba(${c.r},${c.g},${c.b},0.3)`);
    grad.addColorStop(1, `rgba(${c.r},${c.g},${c.b},0)`);
  }
  return grad;
}

function hexToRgb(hex) {
  const m = hex.replace("#","").match(/.{2}/g);
  if (!m) return null;
  return { r: parseInt(m[0],16), g: parseInt(m[1],16), b: parseInt(m[2],16) };
}

const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: "#94a3b8", boxWidth: 12, padding: 16 } },
    tooltip: {
      backgroundColor: "#111827",
      borderColor: "rgba(255,255,255,0.08)",
      borderWidth: 1,
      padding: 10,
    },
  },
  scales: {
    x: {
      grid:  { color: "rgba(255,255,255,0.04)" },
      ticks: { color: "#64748b" },
    },
    y: {
      grid:  { color: "rgba(255,255,255,0.04)" },
      ticks: { color: "#64748b" },
    },
  },
};

// ── 1. Global Accuracy over Rounds ────────────────────────────────────────────
function createAccuracyChart(canvasId) {
  const existing = Chart.getChart(document.getElementById(canvasId));
  if (existing) existing.destroy();
  const ctx = document.getElementById(canvasId).getContext("2d");
  return new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Avg Accuracy",
          data: [],
          borderColor: CHART_COLORS.cyan,
          backgroundColor: makeGradient(ctx, CHART_COLORS.cyan),
          fill: true,
          tension: 0.4,
          pointRadius: 5,
          pointHoverRadius: 7,
        },
        {
          label: "Avg F1 Score",
          data: [],
          borderColor: CHART_COLORS.violet,
          backgroundColor: makeGradient(ctx, CHART_COLORS.violet),
          fill: true,
          tension: 0.4,
          pointRadius: 5,
          pointHoverRadius: 7,
        },
      ],
    },
    options: {
      ...baseOptions,
      plugins: {
        ...baseOptions.plugins,
        title: { display: false },
        legend: { display: true, labels: { color: "#94a3b8" } },
      },
      scales: {
        ...baseOptions.scales,
        y: { ...baseOptions.scales.y, min: 0, max: 1, ticks: { color: "#64748b", callback: v => (v*100).toFixed(0)+"%" } },
        x: { ...baseOptions.scales.x, title: { display: true, text: "FL Round", color: "#64748b" } },
      },
    },
  });
}

// ── 2. Per-node performance bar chart ─────────────────────────────────────────
function createNodeBarChart(canvasId) {
  const existing = Chart.getChart(document.getElementById(canvasId));
  if (existing) existing.destroy();
  const ctx = document.getElementById(canvasId).getContext("2d");
  return new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Twitter", "Reddit", "Facebook", "Instagram", "LinkedIn"],
      datasets: [
        { label: "Accuracy",  data: [0,0,0,0,0], backgroundColor: "rgba(0,212,255,.7)",   borderRadius: 6 },
        { label: "F1 Score",  data: [0,0,0,0,0], backgroundColor: "rgba(139,92,246,.7)",  borderRadius: 6 },
        { label: "Precision",data: [0,0,0,0,0],  backgroundColor: "rgba(16,185,129,.7)",  borderRadius: 6 },
        { label: "Recall",    data: [0,0,0,0,0], backgroundColor: "rgba(245,158,11,.7)",  borderRadius: 6 },
      ],
    },
    options: {
      ...baseOptions,
      scales: {
        ...baseOptions.scales,
        y: { ...baseOptions.scales.y, min: 0, max: 1, ticks: { color: "#64748b", callback: v => (v*100).toFixed(0)+"%" } },
      },
    },
  });
}

// ── 3. Risk Distribution doughnut ─────────────────────────────────────────────
function createRiskDonut(canvasId) {
  const existing = Chart.getChart(document.getElementById(canvasId));
  if (existing) existing.destroy();
  const ctx = document.getElementById(canvasId).getContext("2d");
  return new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["At Risk", "Safe"],
      datasets: [{
        data: [0, 100],
        backgroundColor: [
          "rgba(239,68,68,0.8)",
          "rgba(16,185,129,0.8)",
        ],
        borderColor: ["#ef4444", "#10b981"],
        borderWidth: 2,
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%",
      plugins: {
        legend: { position: "bottom", labels: { color: "#94a3b8", boxWidth: 12 } },
        tooltip: baseOptions.plugins.tooltip,
      },
    },
  });
}

// ── 4. Per-node risk ratio radar chart ────────────────────────────────────────
function createRiskRadar(canvasId) {
  const existing = Chart.getChart(document.getElementById(canvasId));
  if (existing) existing.destroy();
  const ctx = document.getElementById(canvasId).getContext("2d");
  return new Chart(ctx, {
    type: "radar",
    data: {
      labels: ["Twitter", "Reddit", "Facebook", "Instagram", "LinkedIn"],
      datasets: [{
        label: "Risk Ratio",
        data: [0, 0, 0, 0, 0],
        borderColor: CHART_COLORS.red,
        backgroundColor: "rgba(239,68,68,0.15)",
        pointBackgroundColor: CHART_COLORS.red,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        r: {
          beginAtZero: true,
          max: 1,
          grid:        { color: "rgba(255,255,255,0.06)" },
          angleLines:  { color: "rgba(255,255,255,0.06)" },
          ticks:       { color: "#64748b", backdropColor: "transparent", callback: v => (v*100).toFixed(0)+"%" },
          pointLabels: { color: "#94a3b8", font: { size: 12 } },
        },
      },
    },
  });
}

// ── 5. Communication efficiency (data saved) line chart ───────────────────────
function createCommChart(canvasId) {
  const existing = Chart.getChart(document.getElementById(canvasId));
  if (existing) existing.destroy();
  const ctx = document.getElementById(canvasId).getContext("2d");
  return new Chart(ctx, {
    type: "bar",
    data: {
      labels: [],
      datasets: [
        { label: "Total Data (KB)", data: [], backgroundColor: "rgba(239,68,68,.5)", borderRadius: 4 },
        { label: "Weights Sent (KB)", data: [], backgroundColor: "rgba(0,212,255,.5)", borderRadius: 4 },
      ],
    },
    options: {
      ...baseOptions,
      plugins: {
        ...baseOptions.plugins,
        tooltip: {
          ...baseOptions.plugins.tooltip,
          callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)} KB` },
        },
      },
      scales: {
        ...baseOptions.scales,
        x: { ...baseOptions.scales.x, title: { display: true, text: "FL Round", color: "#64748b" } },
        y: { ...baseOptions.scales.y, title: { display: true, text: "Size (KB)", color: "#64748b" } },
      },
    },
  });
}

// ── 6. Samples per node (horizontal bar) ──────────────────────────────────────
function createSamplesChart(canvasId) {
  const existing = Chart.getChart(document.getElementById(canvasId));
  if (existing) existing.destroy();
  const ctx = document.getElementById(canvasId).getContext("2d");
  return new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Twitter", "Reddit", "Facebook", "Instagram", "LinkedIn"],
      datasets: [{
        label: "Samples",
        data: [0, 0, 0, 0, 0],
        backgroundColor: [
          "rgba(29,161,242,.7)",
          "rgba(255,69,0,.7)",
          "rgba(66,103,178,.7)",
          "rgba(193,53,132,.7)",
          "rgba(0,119,181,.7)",
        ],
        borderRadius: 6,
      }],
    },
    options: {
      ...baseOptions,
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: {
        x: { ...baseOptions.scales.x, title: { display: true, text: "Number of Samples", color: "#64748b" } },
        y: { ...baseOptions.scales.y, grid: { display: false } },
      },
    },
  });
}

// ── 7. AUC-ROC per node (polar area) ──────────────────────────────────────────
function createAucChart(canvasId) {
  const existing = Chart.getChart(document.getElementById(canvasId));
  if (existing) existing.destroy();
  const ctx = document.getElementById(canvasId).getContext("2d");
  return new Chart(ctx, {
    type: "polarArea",
    data: {
      labels: ["Twitter", "Reddit", "Facebook", "Instagram", "LinkedIn"],
      datasets: [{
        data: [0, 0, 0, 0, 0],
        backgroundColor: [
          "rgba(29,161,242,.6)",
          "rgba(255,69,0,.6)",
          "rgba(66,103,178,.6)",
          "rgba(193,53,132,.6)",
          "rgba(0,119,181,.6)",
        ],
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.1)",
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          beginAtZero: true,
          min: 0, max: 1,
          grid:  { color: "rgba(255,255,255,0.06)" },
          ticks: { color: "#64748b", backdropColor: "transparent", callback: v => v.toFixed(1) },
        },
      },
      plugins: { legend: { position: "bottom", labels: { color: "#94a3b8" } } },
    },
  });
}

// ── 8. Weight Divergence over rounds (area) ───────────────────────────────────
function createDivergenceChart(canvasId) {
  const existing = Chart.getChart(document.getElementById(canvasId));
  if (existing) existing.destroy();
  const ctx = document.getElementById(canvasId).getContext("2d");
  return new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [{
        label: "Weight Divergence (σ)",
        data: [],
        borderColor: CHART_COLORS.orange,
        backgroundColor: makeGradient(ctx, CHART_COLORS.orange),
        fill: true,
        tension: 0.4,
        pointRadius: 4,
      }],
    },
    options: {
      ...baseOptions,
      plugins: { ...baseOptions.plugins, legend: { display: false } },
      scales: {
        ...baseOptions.scales,
        x: { ...baseOptions.scales.x, title: { display: true, text: "FL Round", color: "#64748b" } },
        y: { ...baseOptions.scales.y, title: { display: true, text: "Std Dev of ‖w‖", color: "#64748b" } },
      },
    },
  });
}

// ── 9. Round participation stacked bar ────────────────────────────────────────
function createParticipationChart(canvasId) {
  const existing = Chart.getChart(document.getElementById(canvasId));
  if (existing) existing.destroy();
  const ctx = document.getElementById(canvasId).getContext("2d");
  return new Chart(ctx, {
    type: "bar",
    data: {
      labels: [],
      datasets: nodeNames.map((name, i) => ({
        label: name,
        data: [],
        backgroundColor: colors[i],
        borderRadius: 4,
      })),
    },
    options: {
      ...baseOptions,
      scales: {
        x: { ...baseOptions.scales.x, stacked: true, title: { display: true, text: "Round", color: "#64748b" } },
        y: { ...baseOptions.scales.y, stacked: true, max: 1, ticks: { color: "#64748b", callback: v => v === 0 || v === 1 ? ["❌","✓"][v] : "" } },
      },
    },
  });
}

// ── Update helpers ─────────────────────────────────────────────────────────────
function updateAccuracyChart(chart, rounds) {
  chart.data.labels = rounds.map(r => `R${r.round}`);
  chart.data.datasets[0].data = rounds.map(r => r.avg_accuracy);
  chart.data.datasets[1].data = rounds.map(r => r.avg_f1);
  chart.update("active");
}

function updateNodeBarChart(chart, metrics) {
  const ids = ["twitter","reddit","facebook","instagram","linkedin"];
  chart.data.datasets[0].data = ids.map(id => metrics[id]?.accuracy  ?? 0);
  chart.data.datasets[1].data = ids.map(id => metrics[id]?.f1        ?? 0);
  chart.data.datasets[2].data = ids.map(id => metrics[id]?.precision ?? 0);
  chart.data.datasets[3].data = ids.map(id => metrics[id]?.recall    ?? 0);
  chart.update("active");
}

function updateRiskDonut(chart, riskRatio) {
  chart.data.datasets[0].data = [
    +(riskRatio * 100).toFixed(1),
    +((1 - riskRatio) * 100).toFixed(1),
  ];
  chart.update("active");
}

function updateRiskRadar(chart, metrics) {
  const ids = ["twitter","reddit","facebook","instagram","linkedin"];
  chart.data.datasets[0].data = ids.map(id => metrics[id]?.risk_ratio ?? 0);
  chart.update("active");
}

function updateCommChart(chart, rounds) {
  chart.data.labels = rounds.map(r => `R${r.round}`);
  chart.data.datasets[0].data = rounds.map(r => r.total_samples * 0.5); // rough estimate
  chart.data.datasets[1].data = rounds.map(r => r.model_size_kb ?? 0);
  chart.update("active");
}

function updateSamplesChart(chart, statuses) {
  const ids = ["twitter","reddit","facebook","instagram","linkedin"];
  chart.data.datasets[0].data = ids.map(id => statuses[id]?.n_samples ?? 0);
  chart.update("active");
}

function updateAucChart(chart, metrics) {
  const ids = ["twitter","reddit","facebook","instagram","linkedin"];
  chart.data.datasets[0].data = ids.map(id => metrics[id]?.auc_roc ?? 0);
  chart.update("active");
}

function updateDivergenceChart(chart, rounds) {
  chart.data.labels = rounds.map(r => `R${r.round}`);
  chart.data.datasets[0].data = rounds.map(r => r.weight_divergence ?? 0);
  chart.update("active");
}

function updateParticipationChart(chart, rounds) {
  const ids = ["twitter","reddit","facebook","instagram","linkedin"];
  chart.data.labels = rounds.map(r => `R${r.round}`);
  ids.forEach((id, i) => {
    chart.data.datasets[i].data = rounds.map(r =>
      r.participating_clients?.includes(id) ? 1 : 0
    );
  });
  chart.update("active");
}

// ── FL Network Canvas ──────────────────────────────────────────────────────────
function drawFLNetwork(canvasId, statuses) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W   = canvas.offsetWidth  || canvas.width;
  const H   = canvas.offsetHeight || canvas.height;
  canvas.width  = W;
  canvas.height = H;
  ctx.clearRect(0, 0, W, H);

  const cx = W / 2, cy = H / 2;
  const r  = Math.min(W, H) * 0.32;

  const nodeIds = Object.keys(NODES);
  const angleStep = (2 * Math.PI) / nodeIds.length;

  // Draw edges first
  nodeIds.forEach((id, i) => {
    const angle = -Math.PI / 2 + i * angleStep;
    const nx = cx + r * Math.cos(angle);
    const ny = cy + r * Math.sin(angle);

    const online  = statuses[id]?.online !== false;
    const trained = statuses[id]?.trained;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(nx, ny);
    ctx.strokeStyle = trained ? "rgba(0,212,255,0.35)" : "rgba(255,255,255,0.06)";
    ctx.lineWidth   = trained ? 2 : 1;
    if (trained) {
      ctx.setLineDash([]);
    } else {
      ctx.setLineDash([4, 4]);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Animated data flow (dots)
    if (trained && online) {
      const t = (Date.now() / 1000) % 1;
      const dx = nx + (cx - nx) * t;
      const dy = ny + (cy - ny) * t;
      ctx.beginPath();
      ctx.arc(dx, dy, 4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,212,255,0.9)";
      ctx.fill();
    }
  });

  // Draw center server node
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 36);
  grad.addColorStop(0, "rgba(0,212,255,0.9)");
  grad.addColorStop(1, "rgba(139,92,246,0.5)");
  ctx.beginPath();
  ctx.arc(cx, cy, 34, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(13,19,34,0.9)";
  ctx.fill();
  ctx.strokeStyle = "rgba(0,212,255,0.8)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#f1f5f9";
  ctx.font = "22px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🧠", cx, cy);
  ctx.font = "bold 10px Inter, sans-serif";
  ctx.fillStyle = "rgba(0,212,255,0.9)";
  ctx.fillText("FL SERVER", cx, cy + 46);

  // Draw client nodes
  nodeIds.forEach((id, i) => {
    const angle = -Math.PI / 2 + i * angleStep;
    const nx = cx + r * Math.cos(angle);
    const ny = cy + r * Math.sin(angle);

    const info    = NODES[id];
    const online  = statuses[id]?.online !== false;
    const trained = statuses[id]?.trained;
    const col     = info.color;

    ctx.beginPath();
    ctx.arc(nx, ny, 26, 0, Math.PI * 2);
    ctx.fillStyle   = "rgba(13,19,34,0.95)";
    ctx.fill();
    ctx.strokeStyle = online ? (trained ? col : "rgba(255,255,255,0.2)") : "#ef4444";
    ctx.lineWidth   = 2;
    ctx.stroke();

    ctx.font = "16px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(info.icon, nx, ny);

    // status ring if trained
    if (trained) {
      ctx.beginPath();
      ctx.arc(nx, ny, 30, 0, Math.PI * 2);
      ctx.strokeStyle = col + "55";
      ctx.lineWidth   = 6;
      ctx.stroke();
    }

    ctx.font = "bold 10px Inter, sans-serif";
    ctx.fillStyle   = online ? "#f1f5f9" : "#ef4444";
    ctx.textAlign   = "center";
    ctx.textBaseline = "top";
    const labelY = ny + 34;
    ctx.fillText(info.name, nx, labelY);

    const samples = statuses[id]?.n_samples ?? 0;
    if (samples > 0) {
      ctx.font      = "9px Inter, sans-serif";
      ctx.fillStyle = "#64748b";
      ctx.fillText(`${samples.toLocaleString()} samples`, nx, labelY + 13);
    }
  });
}
