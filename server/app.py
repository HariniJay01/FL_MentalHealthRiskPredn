"""
Federated Learning Global Server
---------------------------------
Aggregates model weights from all client nodes using FedAvg algorithm.
Raw data NEVER leaves client nodes - only model weights are transmitted.
"""

import os
import json
import logging
import time
from datetime import datetime

import numpy as np
import requests
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

logging.basicConfig(level=logging.INFO, format="%(asctime)s [SERVER] %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# ── Global Model State ────────────────────────────────────────────────────────
global_model = {
    "coef": None,
    "intercept": None,
    "classes": [0, 1],
    "round": 0,
    "initialized": False,
    "last_updated": None,
    "total_samples_seen": 0,
    "participating_clients_history": [],
}

# ── Registered Client Nodes ───────────────────────────────────────────────────
CLIENTS = {
    "twitter":   {"url": "http://localhost:5001",   "color": "#1DA1F2", "icon": "🐦"},
    "reddit":    {"url": "http://localhost:5002",    "color": "#FF4500", "icon": "🤖"},
    "facebook":  {"url": "http://localhost:5003",  "color": "#4267B2", "icon": "📘"},
    "instagram": {"url": "http://localhost:5004", "color": "#C13584", "icon": "📸"},
    "linkedin":  {"url": "http://localhost:5005",  "color": "#0077B5", "icon": "💼"},
}

# ── Training History ──────────────────────────────────────────────────────────
training_history = []
aggregation_log  = []

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _client_url(name: str) -> str:
    return CLIENTS[name]["url"]


def _safe_get(url: str, timeout: int = 5):
    try:
        r = requests.get(url, timeout=timeout)
        if r.status_code == 200:
            return r.json()
    except Exception as e:
        logger.warning(f"GET {url} failed: {e}")
    return None


def _safe_post(url: str, payload: dict, timeout: int = 15):
    try:
        r = requests.post(url, json=payload, timeout=timeout)
        return r.status_code == 200, r.json() if r.status_code == 200 else {}
    except Exception as e:
        logger.warning(f"POST {url} failed: {e}")
        return False, {}


# ─────────────────────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/health")
def health():
    return jsonify({"status": "ok", "service": "fl-server", "timestamp": datetime.now().isoformat()})


@app.route("/status")
def status():
    return jsonify({
        "round":          global_model["round"],
        "initialized":    global_model["initialized"],
        "n_clients":      len(CLIENTS),
        "last_updated":   global_model["last_updated"],
        "total_samples":  global_model["total_samples_seen"],
    })


@app.route("/clients")
def get_clients():
    """Return live status of every registered client node."""
    results = {}
    for name, info in CLIENTS.items():
        data = _safe_get(f"{info['url']}/status")
        results[name] = {
            "color":  info["color"],
            "icon":   info["icon"],
            **(data if data else {"error": "unreachable", "online": False}),
        }
    return jsonify(results)


@app.route("/global_model")
def get_global_model():
    if not global_model["initialized"]:
        return jsonify({"error": "Global model not yet initialized. Run at least one FL round."}), 404
    return jsonify({
        "round":           global_model["round"],
        "initialized":     True,
        "last_updated":    global_model["last_updated"],
        "total_samples":   global_model["total_samples_seen"],
        "coef_shape":      list(np.array(global_model["coef"]).shape),
        "model_size_kb":   round(len(json.dumps(global_model["coef"])) / 1024, 2),
    })


@app.route("/aggregate", methods=["POST"])
def aggregate():
    """
    FedAvg Aggregation:
      1. Pull weights from each trained client
      2. Compute weighted average by sample count
      3. Push global weights back to all clients
      4. Record metrics for this round
    """
    t_start = time.time()
    trained_clients = []

    # ── Step 1: Collect weights ───────────────────────────────────────────────
    for name, info in CLIENTS.items():
        data = _safe_get(f"{info['url']}/weights", timeout=10)
        if data and data.get("trained", False):
            trained_clients.append({"name": name, **data})
            logger.info(f"  ✓ Collected weights from {name} ({data['n_samples']} samples)")
        else:
            logger.info(f"  ✗ {name} not ready (not trained or unreachable)")

    if not trained_clients:
        return jsonify({"error": "No trained clients available. Upload data and train each node first."}), 400

    # ── Step 2: FedAvg ────────────────────────────────────────────────────────
    total_samples = sum(c["n_samples"] for c in trained_clients)
    agg_coef      = np.zeros_like(np.array(trained_clients[0]["coef"]),      dtype=np.float64)
    agg_intercept = np.zeros_like(np.array(trained_clients[0]["intercept"]), dtype=np.float64)

    weight_divergence = []
    for c in trained_clients:
        w = c["n_samples"] / total_samples
        coef_arr = np.array(c["coef"])
        agg_coef      += w * coef_arr
        agg_intercept += w * np.array(c["intercept"])
        weight_divergence.append(float(np.linalg.norm(coef_arr)))

    global_model["coef"]       = agg_coef.tolist()
    global_model["intercept"]  = agg_intercept.tolist()
    global_model["round"]     += 1
    global_model["initialized"] = True
    global_model["last_updated"] = datetime.now().isoformat()
    global_model["total_samples_seen"] += total_samples
    global_model["participating_clients_history"].append([c["name"] for c in trained_clients])

    round_num = global_model["round"]

    # ── Step 3: Push global weights back ──────────────────────────────────────
    push_results = {}
    for name, info in CLIENTS.items():
        ok, _ = _safe_post(f"{info['url']}/set_weights", {
            "coef":      agg_coef.tolist(),
            "intercept": agg_intercept.tolist(),
            "round":     round_num,
        })
        push_results[name] = ok
        logger.info(f"  {'✓' if ok else '✗'} Pushed global weights to {name}")

    # ── Step 4: Collect per-client metrics ────────────────────────────────────
    client_metrics = {}
    accuracies, f1s, risks = [], [], []

    for c in trained_clients:
        name = c["name"]
        data = _safe_get(f"{CLIENTS[name]['url']}/metrics")
        if data:
            client_metrics[name] = data
            if "accuracy"   in data: accuracies.append(data["accuracy"])
            if "f1"         in data: f1s.append(data["f1"])
            if "risk_ratio" in data: risks.append(data["risk_ratio"])

    t_elapsed = round(time.time() - t_start, 3)

    record = {
        "round":                  round_num,
        "timestamp":              datetime.now().isoformat(),
        "n_clients":              len(trained_clients),
        "total_samples":          total_samples,
        "avg_accuracy":           round(float(np.mean(accuracies)), 4) if accuracies else 0,
        "avg_f1":                 round(float(np.mean(f1s)),        4) if f1s        else 0,
        "avg_risk_ratio":         round(float(np.mean(risks)),      4) if risks      else 0,
        "weight_divergence":      round(float(np.std(weight_divergence)), 4),
        "aggregation_time_s":     t_elapsed,
        "participating_clients":  [c["name"] for c in trained_clients],
        "client_metrics":         client_metrics,
        "push_results":           push_results,
        "model_size_kb":          round(len(json.dumps(global_model["coef"])) / 1024, 2),
        "communication_saved_kb": round(
            sum(c.get("data_size_kb", 0) for c in trained_clients)
            - len(json.dumps(global_model["coef"])) / 1024, 2
        ),
    }
    training_history.append(record)
    aggregation_log.append({
        "round": round_num,
        "timestamp": record["timestamp"],
        "clients": [c["name"] for c in trained_clients],
        "avg_accuracy": record["avg_accuracy"],
    })

    logger.info(f"Round {round_num} complete – avg_acc={record['avg_accuracy']:.3f}, time={t_elapsed}s")
    return jsonify({"success": True, **record})


@app.route("/history")
def get_history():
    return jsonify(training_history)


@app.route("/metrics")
def get_metrics():
    if not training_history:
        return jsonify({
            "rounds": [],
            "latest": None,
            "total_rounds": 0,
            "best_accuracy": 0,
            "best_f1": 0,
        })

    best_acc = max(r["avg_accuracy"] for r in training_history)
    best_f1  = max(r["avg_f1"]       for r in training_history)

    return jsonify({
        "rounds":        training_history,
        "latest":        training_history[-1],
        "total_rounds":  global_model["round"],
        "best_accuracy": round(best_acc, 4),
        "best_f1":       round(best_f1,  4),
        "total_samples": global_model["total_samples_seen"],
    })


@app.route("/aggregation_log")
def agg_log():
    return jsonify(aggregation_log)


@app.route("/privacy_report")
def privacy_report():
    """Demonstrates that raw data never leaves client nodes."""
    client_info = {}
    for name, info in CLIENTS.items():
        data = _safe_get(f"{info['url']}/status")
        client_info[name] = {
            "data_stays_local":   True,
            "weights_transmitted": data.get("trained", False) if data else False,
            "data_size_kb":       data.get("data_size_kb", 0) if data else 0,
            "n_samples":          data.get("n_samples", 0)    if data else 0,
        }

    transmitted_kb = sum(
        len(json.dumps(global_model["coef"])) / 1024
        for _ in training_history
    ) if training_history else 0

    total_data_kb = sum(v["data_size_kb"] for v in client_info.values())

    return jsonify({
        "privacy_guarantee":     "Raw data never transmitted to central server",
        "protocol":              "Federated Averaging (FedAvg)",
        "data_stays_at_nodes":   True,
        "total_data_kb":         round(total_data_kb, 2),
        "transmitted_weights_kb": round(transmitted_kb, 2),
        "privacy_ratio":         round(1 - transmitted_kb / max(total_data_kb, 1), 4),
        "clients":               client_info,
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
