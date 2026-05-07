/**
 * api.js – Thin wrapper around all backend endpoints
 * All calls route through Nginx proxies (/api/server/, /api/client/<id>/)
 */

const NODES = {
  twitter:   { name: "Twitter",   color: "#1DA1F2", icon: "🐦", path: "twitter"   },
  reddit:    { name: "Reddit",    color: "#FF4500", icon: "🤖", path: "reddit"    },
  facebook:  { name: "Facebook",  color: "#4267B2", icon: "📘", path: "facebook"  },
  instagram: { name: "Instagram", color: "#C13584", icon: "📸", path: "instagram" },
  linkedin:  { name: "LinkedIn",  color: "#0077B5", icon: "💼", path: "linkedin"  },
};

// ── Base request helper ───────────────────────────────────────────────────────
async function apiFetch(url, options = {}) {
  try {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json", ...options.headers },
      ...options,
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: { error: err.message }, networkError: true };
  }
}

// ── Server API ────────────────────────────────────────────────────────────────
const SERVER_URL = "http://localhost:5000";

const Server = {
  health:         () => apiFetch(`${SERVER_URL}/health`),
  status:         () => apiFetch(`${SERVER_URL}/status`),
  clients:        () => apiFetch(`${SERVER_URL}/clients`),
  globalModel:    () => apiFetch(`${SERVER_URL}/global_model`),
  metrics:        () => apiFetch(`${SERVER_URL}/metrics`),
  history:        () => apiFetch(`${SERVER_URL}/history`),
  privacyReport:  () => apiFetch(`${SERVER_URL}/privacy_report`),
  aggregationLog: () => apiFetch(`${SERVER_URL}/aggregation_log`),
  aggregate:      () => apiFetch(`${SERVER_URL}/aggregate`, { method: "POST" }),
};

const CLIENT_PORTS = {
  twitter: 5001, reddit: 5002, facebook: 5003, instagram: 5004, linkedin: 5005
};

// ── Client API ────────────────────────────────────────────────────────────────
const Client = {
  health:  (id) => apiFetch(`http://localhost:${CLIENT_PORTS[id]}/health`),
  status:  (id) => apiFetch(`http://localhost:${CLIENT_PORTS[id]}/status`),
  metrics: (id) => apiFetch(`http://localhost:${CLIENT_PORTS[id]}/metrics`),
  weights: (id) => apiFetch(`http://localhost:${CLIENT_PORTS[id]}/weights`),
  trainingLog: (id) => apiFetch(`http://localhost:${CLIENT_PORTS[id]}/training_log`),

  upload(id, file) {
    const fd = new FormData();
    fd.append("file", file);
    return fetch(`http://localhost:${CLIENT_PORTS[id]}/upload`, { method: "POST", body: fd })
      .then(r => r.json().then(d => ({ ok: r.ok, data: d })))
      .catch(e => ({ ok: false, data: { error: e.message } }));
  },

  train(id, epochs = 5) {
    return apiFetch(`http://localhost:${CLIENT_PORTS[id]}/train`, {
      method: "POST",
      body: JSON.stringify({ epochs }),
    });
  },

  predict(id, texts) {
    return apiFetch(`http://localhost:${CLIENT_PORTS[id]}/predict`, {
      method: "POST",
      body: JSON.stringify({ texts }),
    });
  },

  // Predict using the first available trained node
  async predictAny(texts) {
    for (const id of Object.keys(NODES)) {
      const st = await Client.status(id);
      if (st.ok && st.data.trained) {
        return Client.predict(id, texts);
      }
    }
    return { ok: false, data: { error: "No trained node available" } };
  },
};

// ── Aggregate status across all nodes ─────────────────────────────────────────
async function fetchAllStatuses() {
  const results = {};
  await Promise.all(
    Object.keys(NODES).map(async (id) => {
      const r = await Client.status(id);
      results[id] = r.ok ? { ...r.data, online: true } : { online: false, trained: false, node_id: id };
    })
  );
  return results;
}

async function fetchAllMetrics() {
  const results = {};
  await Promise.all(
    Object.keys(NODES).map(async (id) => {
      const r = await Client.metrics(id);
      if (r.ok) results[id] = r.data;
    })
  );
  return results;
}
