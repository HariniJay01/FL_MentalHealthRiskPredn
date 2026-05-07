# 🧠 Federated Learning–based Mental Health Risk Detection

> **Privacy-preserving detection of mental health risk signals in social media text,
> without raw data ever leaving client nodes.**

![FL Dashboard](https://img.shields.io/badge/Federated%20Learning-FedAvg-00d4ff?style=flat-square)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker)
![Python](https://img.shields.io/badge/Python-3.10-3776AB?style=flat-square&logo=python)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

---

## 📌 Project Overview

This system implements a **Federated Learning (FL)** pipeline for mental health risk
detection across five simulated social-media nodes:

| Node | Platform | Port |
|------|----------|------|
| 🐦 | Twitter | 5001 |
| 🤖 | Reddit | 5002 |
| 📘 | Facebook | 5003 |
| 📸 | Instagram | 5004 |
| 💼 | LinkedIn | 5005 |

Each node trains a local model on its own uploaded data. **Only model weights** — not
raw text — are transmitted to the central FL server for aggregation using the
**FedAvg** algorithm. The resulting global model is then pushed back to every node.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (Port 80)                        │
│                     Nginx Reverse Proxy                          │
└──────────┬──────────────────────────────────────────────────────┘
           │
    ┌──────┴──────────────────────┐
    │      FL Server (Port 5000)  │  ← FedAvg Aggregation
    │      /api/server/*          │
    └──────┬──────────────────────┘
           │ weights only (no raw data)
    ┌──────┴─────────────────────────────────────────┐
    │                                                │
  Twitter   Reddit   Facebook  Instagram  LinkedIn
  :5001     :5002    :5003      :5004      :5005
  (local    (local   (local     (local     (local
   data)     data)    data)      data)      data)
```

**ML Stack:**
- `HashingVectorizer` (n_features=65536, bigrams) — no vocabulary sharing needed
- `SGDClassifier` (log-loss) — supports incremental weight updates
- **FedAvg** — weighted average of coefficients by sample count

**Label Mapping:**
- Sentiment `0` (negative) → **At Risk** (`1`)
- Sentiment `4` (positive) → **Safe** (`0`)

---

## 🗂️ Project Structure

```
proj_14/
├── docker-compose.yml          # Orchestrates all 7 services
├── README.md
│
├── server/                     # FL Aggregation Server
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app.py                  # FedAvg, metrics, privacy report
│
├── client/                     # FL Client (shared image, 5 instances)
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app.py                  # Upload, train, weights, predict
│
└── frontend/                   # Nginx + Dashboard SPA
    ├── Dockerfile
    ├── nginx.conf               # Reverse-proxy to all services
    └── src/
        ├── index.html           # Full dashboard (6 pages)
        ├── css/style.css        # Dark futuristic theme
        └── js/
            ├── api.js           # API wrappers
            ├── charts.js        # Chart.js factories (9 charts)
            └── main.js          # Dashboard controller
```

---

## 📋 Dataset Format

The system expects a **CSV file** with at minimum two columns:

| Column | Description |
|--------|-------------|
| `text` | Social media post / tweet / comment |
| `target` | Sentiment label: `0` = negative (risk), `4` = positive (safe) |

> **Tip:** The Sentiment140 dataset (1.6M tweets) works out of the box.
> Download from: https://www.kaggle.com/datasets/kazanova/sentiment140

Columns are **auto-detected** — alternate names like `tweet`, `content`, `label`,
`sentiment` are also recognised.

---

## 🚀 Quick Start

### Prerequisites

- Python 3.10+ installed
- A CSV dataset with `text` and `target` columns
- Install dependencies:
  ```powershell
  pip install -r server/requirements.txt
  pip install -r client/requirements.txt
  ```

---

### 1. Start the System Locally

```powershell
# Navigate to project root
cd D:\NIT_DA\Assignments\FL\proj_14

# Run the master python script
python run_local.py
```

This will concurrently run:
- The FL global server on port `5000`
- 5 mock social media clients on ports `5001` - `5005`
- The frontend dashboard mapped to `http://localhost:8000`

---

### 2. Use the Dashboard

Wait a few seconds for all models to boot up, then open:

```
http://localhost:8000
```

#### Step 1 – Upload Data to Each Node
1. Click **"Client Nodes"** in the sidebar
2. For each node card, drag-drop or browse to select your CSV file
3. Click **📤 Upload** — the node vectorises data locally

#### Step 2 – Train Each Node
1. After uploading, click **⚡ Train (5ep)** on each node card
   — OR —
   Click **"⚡ Train All Nodes"** at the top of the Nodes page
2. Watch Accuracy, F1, Precision, Recall populate per node

#### Step 3 – Run a Federated Round
1. Click **"Training Control"** in the sidebar
2. Click **🚀 Run FL Round (FedAvg)**
3. The server collects weights, averages them, and pushes the global model back
4. Metrics update across all pages

#### Step 4 – View Analytics
- **Overview** — Global KPIs, network topology, accuracy over rounds
- **Analytics** — Per-node bar/radar/polar charts, full metrics table
- **Privacy** — Data vs weights transmitted, privacy guarantee report
- **Risk Predictor** — Enter any text to classify mental health risk

---

### 3. Stop the System

Simply press `CTRL+C` in the terminal where `run_local.py` is executing. It will automatically terminate the background Python processes.

---

## 📊 Dashboard Pages

| Page | Contents |
|------|----------|
| **Overview** | 7 KPI stats, FL network topology, accuracy/F1 chart, risk gauge, sample distribution |
| **Client Nodes** | Upload zones, per-node metrics, confusion matrices, risk bars |
| **Training Control** | FedAvg trigger, per-node train controls, divergence chart, round history table |
| **Analytics** | 4 Chart.js charts (bar, radar, polar, communication), full metrics comparison table |
| **Privacy** | Privacy stats, data flow diagram, per-node privacy audit table |
| **Risk Predictor** | Free-text classification, risk probability with progress bars |

---

## 🔌 API Reference

### FL Server (via `/api/server/`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/status` | GET | Round count, initialization state |
| `/clients` | GET | Live status of all 5 client nodes |
| `/aggregate` | POST | Run one FedAvg round |
| `/metrics` | GET | Best accuracy/F1, all round history |
| `/history` | GET | Full round-by-round records |
| `/privacy_report` | GET | Data sizes vs transmitted weights |

### FL Client (via `/api/client/<id>/`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/status` | GET | Node state, sample count, metrics |
| `/upload` | POST | Upload CSV (multipart/form-data) |
| `/train` | POST | Train locally (`{"epochs": 5}`) |
| `/weights` | GET | Get model weights for aggregation |
| `/set_weights` | POST | Receive global weights |
| `/metrics` | GET | Full metrics (acc, f1, auc, cm, …) |
| `/predict` | POST | Classify text (`{"texts": […]}`) |

---

## 🧪 Testing Individual Nodes Directly

```powershell
# Check Twitter node health
curl http://localhost:5001/health

# Get Reddit node status
curl http://localhost:5002/status

# Classify text via Facebook node
curl -X POST http://localhost:5003/predict `
  -H "Content-Type: application/json" `
  -d '{"texts": ["I feel really depressed lately", "Had a wonderful day!"]}'
```

---

## 🐳 Docker Commands Reference

```powershell
# View running containers
docker compose ps

# View logs for all services
docker compose logs -f

# View logs for a specific service
docker compose logs -f fl-server
docker compose logs -f fl-client-twitter

# Restart a single service
docker compose restart fl-client-reddit

# Rebuild a single service after code changes
docker compose build fl-server
docker compose up -d fl-server

# Scale (add more clients) — advanced
docker compose up -d --scale fl-client-twitter=2
```

---

## 🔒 Privacy Guarantees

| Property | Guarantee |
|----------|-----------|
| Raw data transmission | ❌ Never transmitted |
| Text stored centrally | ❌ No central storage |
| Model weights shared | ✅ Only mechanism of sharing |
| Data reconstruction possible | ❌ HashingVectorizer is one-way |
| Differential Privacy | 🔄 Extendable (add Gaussian noise to weights) |

---

## 🛠️ Troubleshooting

| Issue | Fix |
|-------|-----|
| Port 80 already in use | Change `"80:80"` to `"8080:80"` in docker-compose.yml |
| Upload fails (413 error) | Increase nginx client_max_body_size in nginx.conf |
| "No trained clients" error | Upload data and train each node before clicking Run FL Round |
| Containers restart repeatedly | Run `docker compose logs fl-server` to check for errors |
| CSV auto-detection fails | Rename columns to exactly `text` and `target` |

---

## 📖 References

1. McMahan et al., *Communication-Efficient Learning of Deep Networks from Decentralized Data* (FedAvg), 2017
2. Go et al., *Twitter Sentiment Classification using Distant Supervision* (Sentiment140), 2009
3. Scikit-learn: `HashingVectorizer`, `SGDClassifier` documentation

---

*Project for NIT Federated Learning Course — 2024*
