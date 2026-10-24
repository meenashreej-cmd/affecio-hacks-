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
│   ├── aggregator.py      # Pure trust-scoring, decay, threshold adjustment, and reason extraction
│   ├── pipeline.py        # Message ingestion, rule scoring, async background LLM scorer dispatch
│   ├── seed.py            # Demo database seed script (Asha, Ravi, Sam)
│   └── routes/
│       ├── users.py           # GET /users
│       ├── conversations.py   # GET/POST /conversations, messages, and /risk
│       ├── media.py           # POST /conversations/{id}/media (403 on restricted)
│       └── reports.py         # POST /reports
├── rules/
│   └── engine.py          # Rule engine stub (contract-compliant)
├── llm/
│   ├── scorer.py          # Async Anthropic-backed LLM scorer
│   ├── schema.py
│   ├── redact.py
│   └── prompt.py
└── tests/
    ├── test_aggregator.py # Unit tests for boundaries, decay, vulnerability adjustments, stickiness
    └── test_api.py        # Integration tests with FastAPI TestClient (media restriction & WS)
.env.example               # Environment variable templates
requirements.txt           # Python dependencies
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

`.env` configuration keys:
```ini
ANTHROPIC_API_KEY=
LLM_MODEL=claude-3-haiku-20240307
LLM_TIMEOUT_SECONDS=8
THRESHOLD_CAUTION=40
THRESHOLD_RESTRICT=70
DATABASE_URL=sqlite:///./chat.db
CORS_ORIGINS=http://localhost:5173
```

---

## Database Seeding

Populate the database with the initial demo data:
- **Asha** (ID 1, verified, not new)
- **Ravi** (ID 2, verified, not new)
- **Sam** (ID 3, unverified, new - demo scammer)
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
- Interactive API Docs: [http://localhost:8000/docs](http://localhost:8000/docs)
- Health check: [http://localhost:8000/health](http://localhost:8000/health)

---

## Running Tests

Run the full test suite with pytest:
```bash
pytest -v
```

Run specific test modules:
```bash
pytest backend/tests/test_aggregator.py -v
pytest backend/tests/test_api.py -v
```

---
### 3. LLM Behavioral Scorer

The LLM scorer evaluates recent conversation messages to identify potential scam-related behavioral patterns. It uses the Anthropic API and returns a structured assessment compatible with the backend's LLM scorer contract.

**Output fields**
- `risk_score`: Integer from 0 to 100.
- `scam_type`: `romance`, `phishing`, `impersonation`, `sextortion`, or `none`.
- `signals`: A list of behavioral indicators with supporting evidence.
- `confidence`: Confidence value between 0 and 1.
- `recommended_action`: `allow`, `warn`, `restrict_media`, or `block`.

**Safety and privacy**
- Redacts supported sensitive identifiers before submitting conversation data to the model.
- Uses explicit instructions to treat conversation content as untrusted input and resist prompt injection.
- Validates model output against a strict schema before returning it.
- Returns `None` when scoring fails, the API key is missing, or the response cannot be validated.
- Does not treat a model-generated score as proof of fraudulent behavior.

**Configuration**

Copy `.env.example` to `.env` and configure your Anthropic API key:

```bash
cp .env.example .env
```

Set `ANTHROPIC_API_KEY` to your own key and configure `LLM_MODEL` to a model available to your Anthropic account. Never commit `.env` or expose API keys in source code, logs, screenshots, or pull requests.

**Testing**

Run the full test suite:

```bash
pytest -v
```

Run the LLM scorer tests:

```bash
pytest backend/tests/test_llm_schema.py backend/tests/test_llm_redact.py backend/tests/test_llm_prompt.py backend/tests/test_llm_scorer.py -v
```

The scorer tests validate schema constraints, redaction behavior, prompt construction, and mocked API responses. Passing mocked tests does not by itself verify a live Anthropic API call.

**Integration note:** The team should agree on numeric risk thresholds and action-mapping policy before relying on scores for enforcement decisions.
## Team Integration Contracts

### 1. Rule Engine Contract (`backend/rules/engine.py`)
```python
def rule_score(window: list[dict], recipient: dict) -> dict:
    """
    Args:
        window: Up to last 12 messages, oldest first:
                [{"id": int, "sender_id": int, "text": str, "created_at": str}]
        recipient: {"id": int, "name": str, "is_new": bool, "verified": bool}
    Returns:
        {
            "score": int (0-100),
            "signals": [{"label": str, "evidence_msg_id": int}]
        }
    """
```

### 2. LLM Scorer Contract (`backend/llm/scorer.py`)
```python
async def llm_score(window: list[dict]) -> dict | None:
    """
    Args:
        window: Up to last 12 messages, oldest first:
                [{"id": int, "sender_id": int, "text": str, "created_at": str}]
    Returns:
        {
            "risk_score": int (0-100),
            "scam_type": "romance" | "phishing" | "impersonation" | "sextortion" | "none",
            "signals": [{"label": str, "evidence": str}],
            "confidence": float,
            "recommended_action": "allow" | "warn" | "restrict_media" | "block"
        }
    """
```

---

## Triggering the "Restricted" Flow (Demo & Verification)

### Step 1: Check initial risk for Conversation 1
```bash
curl -X GET http://localhost:8000/conversations/1/risk
```
Response:
```json
{"risk":0,"state":"normal","scam_type":"none","reasons":[]}
```

### Step 2: Post suspicious message triggering high risk
Sam or Asha sends an off-platform payment message:
```bash
curl -X POST http://localhost:8000/conversations/1/messages \
  -H "Content-Type: application/json" \
  -d '{"sender_id": 1, "text": "Please send the gift card code on whatsapp"}'
```
Because recipient Sam is unverified and new, the restriction threshold drops to 60. The rule engine detects "whatsapp" / "gift card" and assigns score 60, immediately transitioning the conversation into `restricted` state!

### Step 3: Verify the state is now `restricted`
```bash
curl -X GET http://localhost:8000/conversations/1/risk
```
Response:
```json
{
  "risk": 60,
  "state": "restricted",
  "scam_type": "phishing",
  "reasons": ["suspicious_keyword:whatsapp"]
}
```

### Step 4: Confirm media sharing is blocked (HTTP 403)
Attempt to upload an image to Conversation 1:
```bash
curl -X POST http://localhost:8000/conversations/1/media \
  -F "sender_id=1" \
  -F "file=@test_image.png"
```
Response (`403 Forbidden`):
```json
{
  "detail": "Media sharing is restricted due to high risk behavior",
  "reasons": ["suspicious_keyword:whatsapp"]
}
```

---

## Real-time WebSocket Protocol

Connect to `/ws/{conversation_id}?user_id={id}`:

### Client -> Server
Send message:
```json
{
  "type": "message",
  "sender_id": 1,
  "text": "Hello there"
}
```

### Server -> Client Broadcasts
1. **New Message**:
   ```json
   {
     "type": "message",
     "message": {
       "id": 12,
       "conversation_id": 1,
       "sender_id": 1,
       "text": "Hello there",
       "created_at": "2026-10-23T11:00:00"
     }
   }
   ```
2. **Risk Update**:
   ```json
   {
     "type": "risk_update",
     "conversation_id": 1,
     "risk": 72,
     "state": "restricted",
     "scam_type": "romance",
     "reasons": ["suspicious_keyword:whatsapp", "financial_solicitation"]
   }
   ```
3. **Media Blocked Event**:
   ```json
   {
     "type": "media_blocked",
     "conversation_id": 1,
     "reasons": ["suspicious_keyword:whatsapp"]
   }
   ```
