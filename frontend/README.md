# BehavioralTrust Scorer — Frontend (Day 2)

**Affecio Hacks '26 Hackathon Project**  
*Real-time chat platform with background behavioral risk scoring detecting romance scam & phishing patterns.*

---

## 🚀 Quickstart (Zero-Backend Mock Mode)

From a clean clone:
```bash
cd frontend
npm install
npm run dev
```
Open **`http://127.0.0.1:5173/`** in your browser. The mock server will run immediately with seed users and automated scenarios.

---

## 🛠️ Environment Configuration (`.env`)

Copy `.env.example` to `.env`:
```env
# Point to your running FastAPI backend
VITE_API_URL=http://localhost:8000

# Set to "true" for zero-backend mock mode, or "false" to connect to real FastAPI/WebSocket
VITE_USE_MOCK=true

# Set to "true" to enable stage demo tools ("Try upload anyway" 403 bypass & event debug strip)
VITE_SHOW_DEV_TOOLS=false
```

---

## 🌟 Day 2 Architecture & Features

### 1. ExplainPanel (Slide-in Drawer)
- **Entry points**: Click **"Why?"** on the Caution Banner or click **"Explain"** in the risk header.
- **Threat Assessment**: Displays score, color-coded status, and detected scam pattern badge (e.g., `ROMANCE`).
- **Evidence Linking**: Each reason links to its triggering message (e.g., *"Triggered by message #6"*). Clicking a reason automatically scrolls the message into view, applies a pulse highlight, and closes the drawer.
- **Educational Guide**: Explains the 4 core behavioural heuristics (fast emotional escalation, off-app diversion, urgent money requests, secrecy).
- **Safety Escalation**: Direct button to launch the `ReportDialog`.
- Renders **exclusively in the recipient's pane** (Priya).

### 2. Gated MediaButton & Server 403 Interception
- **Normal & Caution States**: Enables file attachments with client-side 5 MB file size validation.
- **Restricted State**: Disables uploads with a lock icon and tooltip (*"Media sharing is disabled because this conversation looks risky"*).
- **Server 403 Enforcement**: Defensively parses reasons from the response (`body.reasons`, `body.detail.reasons`, or `body.detail`), displays an error toast, and injects a distinct in-chat system message (`Media blocked: <reasons>`).
- **Stage Dev Bypass**: When `VITE_SHOW_DEV_TOOLS=true`, reveals a purple **"Try upload anyway"** button in the header to demonstrate live 403 rejection on stage.

### 3. ReportDialog (Safety Moderation Modal)
- Categorized dropdown (*Suspected romance scam, Asking for money, Phishing link, Impersonation, Harassment or sextortion, Other*).
- Context note input field appended to the report payload.
- Submits to `POST /reports` with `{ conversation_id, reporter_id, reason }`.
- Animated loading spinner followed by a **"Report Received"** confirmation checkmark.
- Pulsing red outline on the header Report button when the thread is in `restricted` state.

### 4. Connection Resilience & Error Recovery
- **Connection Pill**: Header indicator displaying `Connected` (green), `Reconnecting...` (amber with pulse), or `Offline` (rose).
- **Exponential Backoff**: Reconnects on socket drop (1s, 2s, 4s, up to 10s), then re-fetches history and risk so no updates are missed.
- **Optimistic Send & Retry**: If a message fails delivery, displays an inline failed notice with a **"Retry"** action instead of silently dropping it. Input draft is preserved.
- **History Load Failure**: Displays an inline error card with a **"Retry Load"** button if `GET /messages` or `GET /risk` fails.

---

## 📸 Presentation & Pitch Screenshots

High-resolution pitch screenshots are located in `/docs/screenshots/`:

| Screenshot | Description | Path |
| :--- | :--- | :--- |
| **01. Normal State** | Safe chat state (<40) with active paperclip | [`/docs/screenshots/01_normal_state.png`](file:///c:/Users/ajiav/Downloads/affecio-hacks-/docs/screenshots/01_normal_state.png) |
| **02. Caution State** | Amber banner with detection reasons in Priya's pane | [`/docs/screenshots/02_caution_state_banner.png`](file:///c:/Users/ajiav/Downloads/affecio-hacks-/docs/screenshots/02_caution_state_banner.png) |
| **03. Restricted State** | Red gauge (78/100), locked media button, pulsed alert | [`/docs/screenshots/03_restricted_state_locked_media.png`](file:///c:/Users/ajiav/Downloads/affecio-hacks-/docs/screenshots/03_restricted_state_locked_media.png) |
| **04. ExplainPanel Drawer** | Safety breakdown, evidence jump links, and heuristic guide | [`/docs/screenshots/04_explain_panel_open.png`](file:///c:/Users/ajiav/Downloads/affecio-hacks-/docs/screenshots/04_explain_panel_open.png) |
| **05. Report Dialog** | Reason category selection and context submission modal | [`/docs/screenshots/05_report_dialog.png`](file:///c:/Users/ajiav/Downloads/affecio-hacks-/docs/screenshots/05_report_dialog.png) |
| **06. Media Blocked 403** | Red 403 notification toast and in-chat system notice | [`/docs/screenshots/06_media_blocked_toast_and_notice.png`](file:///c:/Users/ajiav/Downloads/affecio-hacks-/docs/screenshots/06_media_blocked_toast_and_notice.png) |

### Manual Reproduction Steps:
1. **Normal State**: Run app, observe initial state.
2. **Caution State**: Click **"Play scam demo"**, wait 4–6s.
3. **Restricted State**: Wait until demo completes (10–12s), observe locked media button.
4. **ExplainPanel**: Click **"Why?"** on the Caution Banner.
5. **Report Dialog**: Click **"Report"** in the chat header.
6. **Media Blocked**: In `.env`, set `VITE_SHOW_DEV_TOOLS=true`, click **"Try upload anyway"**.
