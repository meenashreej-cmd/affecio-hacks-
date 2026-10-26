# Behavioral Trust Scorer - FastAPI Backend

Real-time trust scoring and scam detection backend for chat platforms. Flags romance-scam and phishing conversations, calculates behavioral risk dynamically, and automatically restricts media uploads when risk exceeds safety thresholds.

---

## Architecture & Folder Structure

```
backend/
├── app/
│   ├── main.py            # FastAPI entrypoint, lifespan, CORS, and routing
│   ├── db.py              # SQLAlchemy 2.x engine and session dependency
│   ├── models.py          # SQLAlchemy models (User, Conversation, Message, RiskEvent, Media, Report)
│   ├── schemas.py         # Pydantic v2 schemas for REST payloads and WebSockets
│   ├── ws.py              # WebSocket connection manager & /ws/{conv_id} handler
│   ├── aggregator.py      # Pure trust-scoring, decay, threshold adjustment, and reason humanization
│   ├── pipeline.py        # Message ingestion, rule scoring, async background LLM scorer dispatch
│   ├── rate_limiter.py    # In-memory sliding-window rate limiter per user
│   ├── seed.py            # Demo database seed script (Asha, Ravi, Sam)
│   └── routes/
│       ├── users.py           # GET /users
│       ├── conversations.py   # GET/POST /conversations, messages, and /risk
│       ├── media.py           # POST /conversations/{id}/media (403 on restricted, upload hardening)
│       └── reports.py         # POST /reports
├── rules/
│   └── engine.py          # Rule engine (heuristics and keyword detection)
├── llm/
│   ├── scorer.py          # Async Anthropic-backed LLM scorer with guardrails
│   ├── schema.py          # Strict Pydantic schemas for LLM responses
│   ├── redact.py          # PII and sensitive token redaction before LLM inference
│   ├── prompt.py          # Prompt engineering with untrusted content delimiters
│   └── guard.py           # Prompt injection detection and safety guards
└── tests/
    ├── test_aggregator.py     # Unit tests for scoring, decay, and threshold adjustments
    ├── test_api.py            # Integration tests (users, conversations, media, WS, rate limiting)
    ├── test_demo_flow.py      # End-to-end scenario test (Sam -> Asha: normal -> caution -> restricted)
    ├── test_pipeline_safety.py# LLM timeout safety and lock release tests
    ├── test_rate_limit.py     # REST and WebSocket rate-limiting tests
    ├── test_llm_guard.py      # LLM guardrail tests
    ├── test_llm_prompt.py     # LLM prompt construction tests
    ├── test_llm_redact.py     # Redaction unit tests
    ├── test_llm_schema.py     # Schema validation tests
    └── test_llm_scorer.py     # Mocked LLM scorer tests
.env.example                   # Environment variable template
requirements.txt               # Python dependencies
```

---

## Getting Started

### 1. Prerequisites
- Python 3.11 or 3.12
- Git

### 2. Environment Setup

Create and activate a virtual environment:
```bash
# Windows (PowerShell)
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Linux / macOS
python3 -m venv .venv
source .venv/bin/activate
```

Install dependencies:
```bash
pip install -r requirements.txt
```

Set up your `.env` configuration:
```bash
cp .env.example .env
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | *(empty)* | Anthropic API key for live LLM scoring (Claude). Leave empty if offline or using stubs. |
| `USE_STUBS` | `false` | When `true`, uses deterministic offline stub scorers for rules and LLM (ideal for local testing and CI). |
| `LLM_MODEL` | `claude-3-haiku-20240307` | Anthropic model identifier used for behavioral trust scoring. |
| `LLM_TIMEOUT_SECONDS` | `8` | Maximum seconds to wait for LLM completion before falling back to rule scoring. |
| `THRESHOLD_CAUTION` | `40` | Base risk score threshold (0-100) to transition conversation into `caution` state. |
| `THRESHOLD_RESTRICT` | `70` | Base risk score threshold (0-100) to transition conversation into `restricted` state. |
| `RATE_LIMIT_MESSAGES` | `20` | Maximum messages allowed per user within the sliding window. |
| `RATE_LIMIT_WINDOW_SECONDS` | `60` | Duration of the sliding rate-limit window in seconds. |
| `DATABASE_URL` | `sqlite:///./chat.db` | SQLAlchemy connection string (defaults to local SQLite database). |
| `CORS_ORIGINS` | `http://localhost:5173` | Allowed CORS origins for the frontend application. |

---

## Database Seeding

Populate the database with the demo users and conversations:
- **Asha** (ID 1, verified, not new)
- **Ravi** (ID 2, verified, not new)
- **Sam** (ID 3, unverified, new - demo scammer profile)
- **Conversation 1**: Asha <-> Sam
- **Conversation 2**: Asha <-> Ravi

Run:
```bash
python -m backend.app.seed
```

---

## Running the Application

Start the FastAPI development server:
```bash
uvicorn backend.app.main:app --reload --port 8000
```
- Interactive API Docs (Swagger UI): [http://localhost:8000/docs](http://localhost:8000/docs)
- Alternative API Docs (ReDoc): [http://localhost:8000/redoc](http://localhost:8000/redoc)
- Health Check: [http://localhost:8000/health](http://localhost:8000/health)

---

## Running Tests

Run the entire test suite (all unit, integration, safety, and demo tests):
```bash
pytest -v
```

Run specific test suites:
```bash
# End-to-end demo flow
pytest backend/tests/test_demo_flow.py -v

# Core REST and WebSocket integration tests
pytest backend/tests/test_api.py -v

# Rate limiting tests
pytest backend/tests/test_rate_limit.py -v

# Pipeline safety and timeout tests
pytest backend/tests/test_pipeline_safety.py -v

# Pure trust aggregator unit tests
pytest backend/tests/test_aggregator.py -v

# LLM guardrails, redaction, and schema tests
pytest backend/tests/test_llm_schema.py backend/tests/test_llm_redact.py backend/tests/test_llm_prompt.py backend/tests/test_llm_scorer.py backend/tests/test_llm_guard.py -v
```

---

## End-to-End Demo Flow

The system demonstrates real-time behavioural trust scoring and enforcement across four sequential stages:

### Scenario: Sam (User 3) -> Asha (User 1) in Conversation 1

1. **Friendly Greeting**
   - Sam sends: `"Hello Asha, nice to meet you!"`
   - State remains: **`normal`** (risk = 10, baseline).
   - WebSocket emits `message` and initial `risk_update` (suspect_id = 3).

2. **Romantic Message**
   - Sam sends: `"You look beautiful, I feel a deep connection with you."`
   - State remains: **`normal`** (risk = 10).
   - No unnecessary risk updates broadcast.

3. **Moving Off-Platform**
   - Sam sends: `"Can you please add me on whatsapp? Let's talk there."`
   - Rule engine detects off-platform solicitation (`score = 60`).
   - For recipient Asha (caution threshold 40, restrict threshold 70), risk moves to 60.
   - State moves to: **`caution`**.
   - `suspect_id` is identified as `3` (Sam).
   - Humanized plain English reason: `"Asked to move the chat off the app"`.

4. **Financial Urgency & Exploitation**
   - Sam sends: `"Please send a gift card urgently, I need your help!"`
   - Scorer identifies financial solicitation (`score = 85`).
   - Combined risk jumps to `75`, exceeding the restriction threshold (`70`).
   - State moves to: **`restricted`**.
   - Reasons merged: `["Asked to move the chat off the app", "Asked for money or gift cards"]`.
   - `risk_events` records exactly one row per update.

5. **Media Gate Enforcement**
   - Any attempt to upload media (`POST /conversations/1/media`) is rejected with **HTTP 403 Forbidden**.
   - WebSocket broadcasts a `media_blocked` event with clear user-facing reasons.

---

## Real-time WebSocket Protocol

Connect to `/ws/{conversation_id}?user_id={id}`:

> **Validation Note:** Only verified participants (`user_a` or `user_b`) can connect. Attempting to connect as a non-participant immediately closes the socket with close code `4403`. Client-supplied `sender_id` values are ignored; messages are always attributed to the connection's authenticated `user_id`.

### Client -> Server: Send Message
```json
{
  "type": "message",
  "text": "Can you add me on whatsapp?"
}
```

### Server -> Client Broadcasts

1. **Message Broadcast**:
   ```json
   {
     "type": "message",
     "message": {
       "id": 12,
       "conversation_id": 1,
       "sender_id": 3,
       "text": "Can you add me on whatsapp?",
       "created_at": "2026-10-24T12:00:00"
     }
   }
   ```

2. **Risk Update (`risk_update`)**:
   Sent whenever the risk score or state changes. Contains `suspect_id` so the frontend displays warnings only to the recipient.
   ```json
   {
     "type": "risk_update",
     "conversation_id": 1,
     "risk": 60,
     "state": "caution",
     "scam_type": "romance",
     "reasons": [
       "Asked to move the chat off the app"
     ],
     "suspect_id": 3
   }
   ```

3. **Media Blocked Event (`media_blocked`)**:
   Sent in real time whenever an upload is **refused** due to the conversation being in the `restricted` state:
   ```json
   {
     "type": "media_blocked",
     "conversation_id": 1,
     "reasons": [
       "Asked to move the chat off the app",
       "Asked for money or gift cards"
     ]
   }
   ```

4. **Rate Limit Error**:
   Sent directly to the user when message rate limit is exceeded:
   ```json
   {
     "type": "error",
     "detail": "rate_limited"
   }
   ```

---

## Media Upload Hardening

Media uploads (`POST /conversations/{id}/media`) enforce robust security measures:
- **State Check**: Blocked with HTTP 403 when the conversation state is `restricted`.
- **Extension & MIME Validation**: Only allowed image formats (`png`, `jpg`, `jpeg`, `gif`, `webp`) are permitted by both file extension and `Content-Type` header (HTTP 400 on mismatch).
- **Size Limit**: Capped at 5 MB (HTTP 413 if exceeded).
- **Random UUID Filenames**: Files are saved under random UUID names (e.g., `d41d8cd98f00b204e9800998ecf8427e.png`), preventing path traversal, name collision, or leaking client-side filenames.

---

## Known Limitations

1. **Authentication & Authorization**:
   - There is no real JWT or session-based authentication in this demo build.
   - Users are selected / picked directly by `user_id`. Participant checks enforce that only assigned conversation members can view or post in a chat, but in production, this must be backed by an authentication provider (e.g., OAuth2 / JWT tokens).
2. **In-Memory Rate Limiting**:
   - The rate limiter (`InMemoryRateLimiter`) tracks message timestamps in application memory per user. In a multi-worker or distributed environment, this should be backed by a shared Redis store using sliding-window rate limiting.
3. **Database Concurrency (SQLite)**:
   - SQLite is used for lightweight demo and offline testing. For high-throughput production workloads, migrate to PostgreSQL or MySQL with connection pooling.
