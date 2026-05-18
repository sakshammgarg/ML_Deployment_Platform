# ML Platform — Frontend

A full-featured Next.js 14 frontend for the **Self-Optimizing ML Deployment Platform**.

## Features

| Page | What it does |
|---|---|
| **Dashboard** | Live stats, latency & accuracy charts, active deployments at a glance |
| **Models** | Upload, activate, deactivate and delete model versions |
| **Model Detail** | Per-model latency, request volume charts, full metadata |
| **Deployments** | Create deployments, adjust traffic %, activate/deactivate, rollback |
| **A/B Testing** | Design experiments with custom traffic splits, compare model metrics side-by-side |
| **Metrics** | Full analytics — accuracy, latency percentiles, error rate, throughput, radar health chart |
| **Predict** | Live inference UI with JSON editor, confidence display, and request history |

---

## Step-by-Step Setup (from scratch)

### 1. Prerequisites

Make sure these are installed on your machine:

- **Node.js 18 or higher** → https://nodejs.org
  - Check: `node -v`
- **npm** (comes with Node) or **yarn**
  - Check: `npm -v`
- Your **FastAPI backend** running (default: `http://localhost:8000`)

---

### 2. Get the frontend folder

If you downloaded the zip, extract it. Then open a terminal and navigate into the folder:

```bash
cd ml-platform-frontend
```

---

### 3. Install dependencies

```bash
npm install
```

This downloads all libraries (Next.js, Recharts, etc.) into the `node_modules/` folder.
It takes 1–3 minutes the first time.

---

### 4. Set up environment variables

Copy the example env file:

```bash
cp .env.local.example .env.local
```

Open `.env.local` and set your backend URL:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

> If your FastAPI backend runs on a different port or host, change this accordingly.

---

### 5. Run in development mode

```bash
npm run dev
```

Open your browser at → **http://localhost:3000**

The frontend auto-refreshes whenever you edit a file.

---

### 6. Build for production

When you're ready to deploy:

```bash
npm run build
npm start
```

`npm run build` compiles and optimizes the app.
`npm start` serves the production build on port 3000.

---

## Connecting to Your FastAPI Backend

The frontend expects the following REST API endpoints:

### Models
| Method | Path | Description |
|--------|------|-------------|
| GET | `/models` | List all models |
| POST | `/models` | Upload a model (multipart/form-data) |
| GET | `/models/{id}` | Get model by ID |
| PATCH | `/models/{id}` | Update model metadata |
| DELETE | `/models/{id}` | Delete a model |
| POST | `/models/{id}/activate` | Set model to active |
| POST | `/models/{id}/deactivate` | Set model to inactive |

### Deployments
| Method | Path | Description |
|--------|------|-------------|
| GET | `/deployments` | List all deployments |
| POST | `/deployments` | Create a deployment |
| PUT | `/deployments/{id}` | Update deployment (status, traffic %) |
| DELETE | `/deployments/{id}` | Delete deployment |
| POST | `/deployments/{id}/rollback` | Rollback to a previous model |

### A/B Tests
| Method | Path | Description |
|--------|------|-------------|
| GET | `/ab-tests` | List all tests |
| POST | `/ab-tests` | Create a new test |
| PUT | `/ab-tests/{id}` | Update test |
| DELETE | `/ab-tests/{id}` | Delete test |
| POST | `/ab-tests/{id}/stop` | Stop a running test |
| GET | `/ab-tests/{id}/comparison` | Get comparison metrics |

### Metrics
| Method | Path | Description |
|--------|------|-------------|
| GET | `/metrics/summary` | Dashboard summary |
| GET | `/metrics` | All snapshots (query: `?hours=24`) |
| GET | `/metrics/model/{id}` | Per-model metrics |

### Inference
| Method | Path | Description |
|--------|------|-------------|
| POST | `/predict` | Run inference |

---

## CORS Setup (FastAPI)

Add this to your FastAPI `main.py` so the frontend can call your backend:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # or ["*"] for all
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## Project Structure

```
src/
├── app/                    # Next.js pages (App Router)
│   ├── page.tsx            # Dashboard
│   ├── models/page.tsx     # Models list
│   ├── models/[id]/page.tsx # Model detail
│   ├── deployments/page.tsx
│   ├── ab-testing/page.tsx
│   ├── metrics/page.tsx
│   └── predict/page.tsx
├── components/
│   ├── layout/             # Sidebar, Header
│   └── ui/                 # Badge, Button, Card, Modal, etc.
├── hooks/                  # React Query data hooks
│   ├── useModels.ts
│   ├── useDeployments.ts
│   ├── useABTests.ts
│   └── useMetrics.ts
└── lib/
    ├── api.ts              # Axios API client
    ├── types.ts            # TypeScript types
    ├── utils.ts            # Helpers
    └── providers.tsx       # React Query + Toast providers
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `npm install` fails | Make sure Node ≥ 18: `node -v` |
| "Network Error" on all API calls | Your backend is not running, or CORS is not configured |
| Port 3000 already in use | Run `npm run dev -- -p 3001` |
| White screen / hydration errors | Run `npm run build && npm start` to check for errors |
