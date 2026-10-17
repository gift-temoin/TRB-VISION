# Trading Robot Guider (TRB)

A modern, responsive prediction-focused web application for Forex, Gold, Crypto and Binary Options.

## Stack
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Python 3.13 + FastAPI + SQLAlchemy 2.0 + PostgreSQL/SQLite
- **Auth**: JWT (HS256), bcrypt password hashing
- **Database**: PostgreSQL (production), SQLite (dev)

---

## Quick Start (Local Development)

### 1. Backend
```bash
cd backend

# Create virtual environment and install deps
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Copy env file (uses SQLite by default, demo mode ON)
cp .env.example .env

# Run DB migrations (or use auto-create on startup)
alembic upgrade head

# Seed admin user + demo passcode
python seed.py

# Start API server
uvicorn app.main:app --reload --port 8000
```

**Admin credentials** (from .env.example):
- Email: `admin@trb.local`
- Password: `ChangeMe123!`
- Demo verification passcode: `TRB-DEMO-2026`

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:5173 (proxies `/api` to backend on port 8000).

---

## Key Features

### Authentication
- **Signup**: Full name, email, **country (Rwanda/Burundi/Uganda/Tanzania/Kenya with flags)**, password, confirm password
- **Login**: Email + password with show/hide toggle, forgot password link
- **Verification**: Admin-issued passcodes (hashed, rate-limited, expiring, revocable)
- **Password reset**: Email-based with time-limited codes

### User Dashboard
- Dark navy fintech UI with green/red/amber indicators
- Left sidebar navigation (Dashboard, Forex, Gold, Crypto, Binary Options, Settings)
- Top header with user avatar + **country flag from saved profile**
- Floating "Speak to Admin" chat (WhatsApp-style green button)
- Market snapshot cards with genuine data when provider configured, else clearly-labelled sample data
- Directional predictions: BULLISH/BEARISH/NEUTRAL with evidence, horizon, model status
- No candlestick charts, no fabricated accuracy percentages

### Admin Dashboard (protected)
- User list with active/verified status, enable/disable, reset verification
- Passcode management: create (with expiry/max-uses), revoke, view usage
- Messaging inbox: read/reply to user conversations
- Verification history: success/failed attempts with IPs
- Model health: provider status, prediction count, recent errors

### Market Data
- Abstraction layer for Twelve Data, Alpha Vantage, Finnhub
- **Demo mode**: deterministic sample data (seeded by symbol+date) clearly labelled
- **Production**: real prices only when API key configured; otherwise UNAVAILABLE
- Prediction engine: transparent EMA-momentum baseline, probabilities only when calibrated

---

## Project Structure

```
TRB/
├── frontend/                 # React + Vite + TS + Tailwind
│   ├── src/
│   │   ├── components/       # UI, layout, market, chat, admin
│   │   ├── context/          # AuthContext
│   │   ├── hooks/            # useMarket
│   │   ├── lib/              # api, utils, validation, countries
│   │   ├── pages/            # Login, Signup, Verify, Dashboard, MarketPage, Settings, AdminDashboard, NotFound
│   │   └── types.ts
│   └── package.json
├── backend/                  # FastAPI
│   ├── app/
│   │   ├── config.py         # Settings from .env
│   │   ├── countries.py      # East African countries + flag generator
│   │   ├── database.py       # SQLAlchemy engine/session
│   │   ├── models.py         # User, Passcode, Conversation, Message, etc.
│   │   ├── schemas.py        # Pydantic request/response models
│   │   ├── security.py       # bcrypt, JWT
│   │   ├── deps.py           # FastAPI dependencies (auth, admin, rate limit)
│   │   ├── routers/          # auth, verification, predictions, messages, admin
│   │   ├── services/         # market_data, prediction, rate_limit
│   │   └── main.py           # FastAPI app + CORS + routers
│   ├── alembic/              # Migrations
│   ├── seed.py               # Admin bootstrap
│   └── requirements.txt
├── database/                 # (reserved for SQL files)
├── docs/                     # (reserved)
├── tests/                    # (reserved for frontend tests)
└── scripts/                  # (reserved)
```

---

## Configuration

### Backend (.env)
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL DSN or `sqlite:///./trb.db` |
| `SECRET_KEY` | JWT signing secret |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | First admin account |
| `ADMIN_COUNTRY` | Admin's country code (RW/BI/UG/TZ/KE) |
| `MARKET_DATA_PROVIDER` | `none` \| `twelvedata` \| `alphavantage` \| `finnhub` |
| `MARKET_DATA_API_KEY` | Provider API key |
| `DEMO_MODE` | `true` = show labelled sample data when no provider |
| `WHATSAPP_ENABLED` | `true` if WhatsApp Business actually integrated |

### Frontend (.env)
| Variable | Description |
|----------|-------------|
| `VITE_API_BASE_URL` | `/api` (proxied by Vite) |
| `VITE_WHATSAPP_ENABLED` | `true` only when WhatsApp actually configured on backend |

---

## Run Production Build

```bash
# Frontend
cd frontend && npm run build   # outputs to dist/

# Backend
cd backend
# Set DATABASE_URL to PostgreSQL, SECRET_KEY to strong random string
# DEMO_MODE=false
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

---

## Notes

- **No automatic trading or broker execution** — predictions are informational only.
- Probabilities appear **only** when a calibrated, validated model is configured.
- All passcodes stored as bcrypt hashes; plaintext shown once at creation.
- Verification enforced server-side on every prediction endpoint.
- Country validated server-side against the 5 East African Community members.