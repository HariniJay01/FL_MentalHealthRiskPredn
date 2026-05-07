"""
Federated Learning Client Node
--------------------------------
Each client represents one social-media platform (Twitter, Reddit, …).
Local training uses HashingVectorizer + SGDClassifier (log-loss).
Only model WEIGHTS are shared with the server – raw data never leaves.
"""

import io
import os
import json
import time
import logging
from datetime import datetime

import numpy as np
import pandas as pd
from flask import Flask, jsonify, request
from flask_cors import CORS
from sklearn.feature_extraction.text import HashingVectorizer
from sklearn.linear_model import SGDClassifier
from sklearn.metrics import (
    accuracy_score, f1_score, precision_score, recall_score,
    roc_auc_score, confusion_matrix, log_loss,
)
from sklearn.model_selection import train_test_split
from sklearn.utils.class_weight import compute_sample_weight

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(NODE_NAME)s] %(levelname)s %(message)s".replace("%(NODE_NAME)s", os.getenv("NODE_NAME", "CLIENT")),
)
logger = logging.getLogger(__name__)

# ── Node Identity (set via docker-compose environment) ────────────────────────
NODE_NAME  = os.getenv("NODE_NAME",  "Client")
NODE_ID    = os.getenv("NODE_ID",    "client")
NODE_COLOR = os.getenv("NODE_COLOR", "#00d4ff")
NODE_ICON  = os.getenv("NODE_ICON",  "🌐")
FL_SERVER  = os.getenv("FL_SERVER_URL", "http://localhost:5000")

# ── ML Components ──────────────────────────────────────────────────────────────
# HashingVectorizer: no vocabulary learned → no vocab needs to be shared
VECTORIZER = HashingVectorizer(
    n_features=2**16,     # 65 536 – compact yet expressive
    ngram_range=(1, 2),
    norm="l2",
    alternate_sign=False,
    lowercase=True,
    strip_accents="unicode",
    analyzer="word",
)

CLASSIFIER = SGDClassifier(
    loss="log_loss",       # probabilistic output
    alpha=1e-4,
    max_iter=1,            # 1 pass per partial_fit call
    tol=None,
    random_state=42,
    warm_start=True,
    class_weight=None,
)

# ── Client State ───────────────────────────────────────────────────────────────
state = {
    "trained":          False,
    "n_samples":        0,
    "n_classes":        2,
    "global_round":     0,
    "local_epochs":     0,
    "data_size_kb":     0.0,
    "training_time_s":  0.0,
    "last_trained":     None,
    "metrics":          {},
    "training_log":     [],
    "classes_":         np.array([0, 1]),
}

# Local data storage (never transmitted)
local_X = None   # feature matrix
local_y = None   # labels (0=risk, 1=safe)

DATA_DIR = "/app/data"
os.makedirs(DATA_DIR, exist_ok=True)

# ─────────────────────────────────────────────────────────────────────────────
# Text pre-processing
# ─────────────────────────────────────────────────────────────────────────────

import re

def preprocess_text(texts: pd.Series) -> pd.Series:
    """Basic social-media text cleaning."""
    def clean(t):
        if not isinstance(t, str):
            t = str(t)
        t = t.lower()
        t = re.sub(r"http\S+|www\S+", " ", t)          # remove URLs
        t = re.sub(r"@\w+", " ", t)                     # remove @mentions
        t = re.sub(r"#(\w+)", r"\1 ", t)                # keep hashtag words
        t = re.sub(r"[^\w\s']", " ", t)                 # remove punctuation
        t = re.sub(r"\s+", " ", t).strip()
        return t
    return texts.apply(clean)


def map_labels(series: pd.Series) -> np.ndarray:
    """
    Dataset convention: 0 = negative (risk), 4 = positive (safe).
    We map to binary 0/1: 0→1 (at-risk), 4→0 (safe).
    """
    return series.map({0: 1, 4: 0}).fillna(0).astype(int).values


def detect_columns(df: pd.DataFrame):
    """Auto-detect text and target columns."""
    text_col   = None
    target_col = None

    text_candidates   = ["text", "tweet", "content", "message", "post", "comment", "body"]
    target_candidates = ["target", "label", "sentiment", "class", "output", "y"]

    cols_lower = {c.lower(): c for c in df.columns}

    for c in text_candidates:
        if c in cols_lower:
            text_col = cols_lower[c]
            break

    for c in target_candidates:
        if c in cols_lower:
            target_col = cols_lower[c]
            break

    # fallback: first string column, first numeric column
    if not text_col:
        for c in df.columns:
            if df[c].dtype == object:
                text_col = c
                break
    if not target_col:
        for c in df.columns:
            if df[c].dtype in [np.int64, np.float64, int, float] and c != text_col:
                target_col = c
                break

    if not text_col or not target_col:
        raise ValueError("Could not auto-detect text/target columns. Expected columns: 'text', 'target'")

    return text_col, target_col


def compute_metrics(y_true, y_pred, y_prob=None):
    """Compute all metrics for a prediction."""
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1]).tolist()

    metrics = {
        "accuracy":  round(float(accuracy_score(y_true, y_pred)),                    4),
        "f1":        round(float(f1_score(y_true, y_pred, average="binary",
                                          zero_division=0)),                          4),
        "precision": round(float(precision_score(y_true, y_pred, average="binary",
                                                 zero_division=0)),                   4),
        "recall":    round(float(recall_score(y_true, y_pred, average="binary",
                                              zero_division=0)),                      4),
        "f1_macro":  round(float(f1_score(y_true, y_pred, average="macro",
                                          zero_division=0)),                          4),
        "confusion_matrix": cm,
        "risk_ratio": round(float(np.mean(y_pred == 1)), 4),   # fraction predicted "at risk"
        "n_at_risk":  int(np.sum(y_pred == 1)),
        "n_safe":     int(np.sum(y_pred == 0)),
    }

    if y_prob is not None:
        try:
            metrics["auc_roc"] = round(float(roc_auc_score(y_true, y_prob)), 4)
            metrics["log_loss_val"] = round(float(log_loss(y_true, y_prob)), 4)
        except Exception:
            pass

    return metrics


# ─────────────────────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/health")
def health():
    return jsonify({
        "status": "ok",
        "node":   NODE_NAME,
        "id":     NODE_ID,
    })


@app.route("/status")
def status():
    return jsonify({
        "node":           NODE_NAME,
        "node_id":        NODE_ID,
        "color":          NODE_COLOR,
        "icon":           NODE_ICON,
        "online":         True,
        "trained":        state["trained"],
        "n_samples":      state["n_samples"],
        "global_round":   state["global_round"],
        "local_epochs":   state["local_epochs"],
        "data_size_kb":   state["data_size_kb"],
        "training_time_s": state["training_time_s"],
        "last_trained":   state["last_trained"],
        "metrics":        state["metrics"],
    })


@app.route("/upload", methods=["POST"])
def upload():
    """
    Accept a CSV file. Validates columns, preprocesses, vectorises, and
    stores features in memory. Raw text is discarded after vectorisation.
    """
    global local_X, local_y

    if "file" not in request.files:
        return jsonify({"error": "No file provided. Send multipart/form-data with key 'file'."}), 400

    f = request.files["file"]
    if not f.filename.endswith(".csv"):
        return jsonify({"error": "Only CSV files are supported."}), 400

    try:
        raw_bytes = f.read()
        data_kb   = round(len(raw_bytes) / 1024, 2)

        df = pd.read_csv(io.BytesIO(raw_bytes))
        logger.info(f"Loaded CSV: {df.shape[0]} rows, {df.shape[1]} cols")

        text_col, target_col = detect_columns(df)
        logger.info(f"Detected columns: text='{text_col}', target='{target_col}'")

        df = df[[text_col, target_col]].dropna()
        df[text_col] = preprocess_text(df[text_col])
        df = df[df[text_col].str.len() > 3]   # drop near-empty texts

        # Validate labels
        unique_vals = df[target_col].unique()
        if not any(v in [0, 4] for v in unique_vals):
            # Try to interpret numeric labels as binary
            mn, mx = df[target_col].min(), df[target_col].max()
            df[target_col] = ((df[target_col] - mn) / max(mx - mn, 1) > 0.5).astype(int) * 4

        y_raw = df[target_col].values.astype(int)
        # Normalise to {0, 4}
        y_raw = np.where(y_raw == 0, 0, 4)

        texts = df[text_col].tolist()
        local_X = VECTORIZER.transform(texts)   # sparse matrix; vocab NOT learned
        local_y = map_labels(pd.Series(y_raw))  # 0→1 (risk), 4→0 (safe)

        state["n_samples"]   = len(local_y)
        state["data_size_kb"] = data_kb
        state["trained"]     = False            # new data → needs retraining

        logger.info(f"Upload done: {state['n_samples']} samples, "
                    f"risk={np.mean(local_y == 1):.1%}")

        return jsonify({
            "success":    True,
            "n_samples":  state["n_samples"],
            "data_size_kb": data_kb,
            "risk_ratio": round(float(np.mean(local_y == 1)), 4),
            "text_col":   text_col,
            "target_col": target_col,
        })

    except Exception as e:
        logger.error(f"Upload error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/train", methods=["POST"])
def train():
    """Train the local SGDClassifier on the uploaded data."""
    global CLASSIFIER

    try:
        if local_X is None or local_y is None:
            return jsonify({"error": "No data uploaded yet. Call /upload first."}), 400

        body   = request.get_json(silent=True) or {}
        epochs = int(body.get("epochs", 5))

        t0 = time.time()

        try:
            X_train, X_val, y_train, y_val = train_test_split(
                local_X, local_y, test_size=0.2, random_state=42, stratify=local_y
            )
        except ValueError:
            X_train, X_val, y_train, y_val = local_X, local_X, local_y, local_y

        epoch_log = []
        for ep in range(epochs):
            # Shuffle manually (SGD benefits from shuffled mini-batches)
            idx = np.random.permutation(X_train.shape[0])
            
            # Calculate sample weights for class balancing (replaces class_weight='balanced')
            sw = compute_sample_weight('balanced', y=y_train[idx])
            
            CLASSIFIER.partial_fit(X_train[idx], y_train[idx], classes=state["classes_"], sample_weight=sw)

            y_pred_val = CLASSIFIER.predict(X_val)
            ep_acc = accuracy_score(y_val, y_pred_val)
            epoch_log.append({"epoch": ep + 1, "val_accuracy": round(ep_acc, 4)})
            logger.info(f"Epoch {ep+1}/{epochs} – val_acc={ep_acc:.4f}")

        elapsed = round(time.time() - t0, 3)

        # ── Final metrics ─────────────────────────────────────────────────────────
        y_pred_all = CLASSIFIER.predict(local_X)
        try:
            y_prob_all = CLASSIFIER.predict_proba(local_X)[:, 1]
        except Exception:
            y_prob_all = None

        metrics = compute_metrics(local_y, y_pred_all, y_prob_all)
        metrics["epochs"]          = epochs
        metrics["training_time_s"] = elapsed
        metrics["n_samples"]       = state["n_samples"]
        metrics["n_features"]      = local_X.shape[1]
        metrics["val_accuracy"]    = epoch_log[-1]["val_accuracy"] if epoch_log else 0
        metrics["epoch_log"]       = epoch_log

        state["trained"]       = True
        state["local_epochs"] += epochs
        state["training_time_s"] = elapsed
        state["last_trained"]  = datetime.now().isoformat()
        state["metrics"]       = metrics
        state["training_log"].append({
            "timestamp": state["last_trained"],
            "epochs":    epochs,
            **{k: v for k, v in metrics.items() if k not in ("confusion_matrix", "epoch_log")},
        })

        logger.info(f"Training done: acc={metrics['accuracy']:.4f}, "
                    f"f1={metrics['f1']:.4f}, risk={metrics['risk_ratio']:.1%}, "
                    f"time={elapsed}s")

        return jsonify({"success": True, **metrics})

    except Exception as e:
        import traceback
        err_msg = str(e)
        tbl = traceback.format_exc()
        logger.error(f"Training runtime error: {err_msg}\n{tbl}")
        return jsonify({
            "success": False,
            "error": err_msg,
            "traceback": tbl
        }), 500


@app.route("/weights")
def get_weights():
    """Return current model weights for FedAvg aggregation."""
    if not state["trained"]:
        return jsonify({"trained": False, "error": "Model not trained yet"}), 400

    return jsonify({
        "trained":    True,
        "node":       NODE_ID,
        "n_samples":  state["n_samples"],
        "coef":       CLASSIFIER.coef_.tolist(),
        "intercept":  CLASSIFIER.intercept_.tolist(),
        "data_size_kb": state["data_size_kb"],
    })


@app.route("/set_weights", methods=["POST"])
def set_weights():
    """Receive aggregated global weights from the FL server."""
    body = request.get_json()
    if not body or "coef" not in body:
        return jsonify({"error": "Missing 'coef' in request body"}), 400

    try:
        CLASSIFIER.coef_      = np.array(body["coef"],      dtype=np.float64)
        CLASSIFIER.intercept_ = np.array(body["intercept"], dtype=np.float64)
        CLASSIFIER.classes_   = state["classes_"]

        state["global_round"] = body.get("round", state["global_round"] + 1)
        logger.info(f"Received global weights – round {state['global_round']}")

        # Re-evaluate with global weights if we have local data
        if local_X is not None:
            y_pred = CLASSIFIER.predict(local_X)
            try:
                y_prob = CLASSIFIER.predict_proba(local_X)[:, 1]
            except Exception:
                y_prob = None
            new_metrics = compute_metrics(local_y, y_pred, y_prob)
            state["metrics"].update({
                f"post_round_{state['global_round']}_{k}": v
                for k, v in new_metrics.items()
                if not isinstance(v, list)
            })
            state["metrics"]["accuracy"] = new_metrics["accuracy"]
            state["metrics"]["f1"]       = new_metrics["f1"]

        return jsonify({
            "success":      True,
            "global_round": state["global_round"],
            "new_accuracy": state["metrics"].get("accuracy", 0),
        })

    except Exception as e:
        logger.error(f"set_weights error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/metrics")
def get_metrics():
    if not state["trained"]:
        return jsonify({"error": "Not trained yet"}), 400
    return jsonify({
        "node":       NODE_NAME,
        "node_id":    NODE_ID,
        **state["metrics"],
        "n_samples":  state["n_samples"],
        "global_round": state["global_round"],
    })


@app.route("/training_log")
def training_log():
    return jsonify(state["training_log"])


@app.route("/predict", methods=["POST"])
def predict():
    """Predict mental-health risk for a list of text inputs."""
    if not state["trained"]:
        return jsonify({"error": "Model not trained. Upload data and train first."}), 400

    body  = request.get_json(silent=True) or {}
    texts = body.get("texts", [])
    if isinstance(texts, str):
        texts = [texts]
    if not texts:
        return jsonify({"error": "Provide 'texts' field with a list of strings"}), 400

    cleaned = preprocess_text(pd.Series(texts)).tolist()
    X       = VECTORIZER.transform(cleaned)
    preds   = CLASSIFIER.predict(X)
    try:
        probs = CLASSIFIER.predict_proba(X)[:, 1].tolist()
    except Exception:
        probs = [float(int(p)) for p in preds]

    results = []
    for txt, pred, prob in zip(texts, preds, probs):
        risk_level = (
            "High Risk"   if prob >= 0.70 else
            "Medium Risk" if prob >= 0.40 else
            "Low Risk"
        )
        results.append({
            "text":       txt,
            "risk_label": int(pred),        # 1 = at risk, 0 = safe
            "risk_prob":  round(prob, 4),
            "risk_level": risk_level,
            "at_risk":    bool(pred == 1),
        })

    return jsonify({"results": results, "node": NODE_NAME})


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
