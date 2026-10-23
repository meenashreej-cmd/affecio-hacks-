import { SCAM_SCENARIO, GENUINE_SCENARIO } from './mockScenario';

export const SEED_USERS = [
  { id: 1, name: "Priya", is_new: true, role: "Recipient (Target)", avatar: "👩🏽" },
  { id: 2, name: "Rahul", is_new: false, role: "Contact (Sender)", avatar: "👨🏻" },
];

class MockServer {
  constructor() {
    this.conversationId = 1;
    this.subscribers = new Set();
    this.activeTimers = [];
    this.isPlaying = false;
    this.currentDemoType = null; // 'scam' | 'genuine' | null
    this.messageIdCounter = 1;
    this.simulateHistoryError = false;

    this.resetState();
  }

  resetState() {
    this.stopDemo();
    this.messages = [];
    this.risk = 10;
    this.state = "normal"; // 'normal' | 'caution' | 'restricted'
    this.scamType = null;
    this.reasons = [];
    this.signals = [];
    this.blockedNotice = null;
    this.reports = [];
  }

  // Subscription mechanism mimicking WebSocket connections
  subscribe(callback) {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  broadcast(event) {
    for (const callback of this.subscribers) {
      try {
        callback(event);
      } catch (err) {
        console.error("MockServer broadcast error:", err);
      }
    }
  }

  // REST Mocks
  async getMessages(conversationId = 1) {
    if (this.simulateHistoryError) {
      return Promise.reject(new Error("Simulated network failure loading messages (503 Service Unavailable)"));
    }
    return Promise.resolve([...this.messages]);
  }

  async getRisk(conversationId = 1) {
    if (this.simulateHistoryError) {
      return Promise.reject(new Error("Simulated network failure loading risk score (503 Service Unavailable)"));
    }
    return Promise.resolve({
      conversation_id: Number(conversationId),
      risk: this.risk,
      state: this.state,
      scam_type: this.scamType,
      reasons: [...this.reasons],
      signals: [...this.signals],
    });
  }

  async getUsers() {
    return Promise.resolve([...SEED_USERS]);
  }

  async getConversations(userId) {
    return Promise.resolve([
      {
        id: 1,
        user_a: 1,
        user_b: 2,
        risk: this.risk,
        state: this.state,
      },
    ]);
  }

  // Submit report mock (POST /reports)
  async submitReport({ conversationId = 1, reporterId, reason }) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    const reportRecord = {
      id: Date.now(),
      conversation_id: Number(conversationId),
      reporter_id: Number(reporterId),
      reason,
      created_at: new Date().toISOString(),
    };
    this.reports.push(reportRecord);
    return Promise.resolve(reportRecord);
  }

  // Upload media mock (POST /conversations/{id}/media)
  async uploadMedia({ conversationId = 1, senderId, file, bypassCheck = false }) {
    await new Promise((resolve) => setTimeout(resolve, 500));

    // If state is restricted and not explicitly bypassing, or testing 403 response
    if (this.state === "restricted" || bypassCheck) {
      if (this.state === "restricted") {
        const reasons =
          this.reasons.length > 0
            ? [...this.reasons]
            : [
                "Urgent money request detected",
                "Asked to move off-app by message 3",
                "Fast emotional escalation",
              ];

        // Broadcast media_blocked event on websocket
        this.broadcast({
          type: "media_blocked",
          conversation_id: Number(conversationId),
          reasons,
        });

        return {
          ok: false,
          status: 403,
          data: {
            detail: "Media sharing is restricted due to high risk behavior",
            reasons,
          },
        };
      }
    }

    // Normal or caution upload success
    const fileName = file?.name || "image_share.png";
    const msg = {
      id: this.messageIdCounter++,
      sender_id: Number(senderId),
      text: `📎 [Shared Attachment: ${fileName}]`,
      created_at: new Date().toISOString(),
      flagged: undefined,
    };
    this.messages.push(msg);

    this.broadcast({
      type: "message",
      message: msg,
    });

    return {
      ok: true,
      status: 201,
      data: {
        id: Date.now(),
        conversation_id: Number(conversationId),
        sender_id: Number(senderId),
        path: `./uploads/${fileName}`,
        created_at: new Date().toISOString(),
      },
    };
  }

  // Client sending message
  sendMessage(conversationId, senderId, text) {
    const trimmed = text?.trim();
    if (!trimmed) return null;

    let flagged = undefined;
    if (this.state === "restricted") {
      flagged = "restricted";
    } else if (this.state === "caution") {
      flagged = "caution";
    }

    // Dynamic heuristic detection for interactive demo typing
    const lower = trimmed.toLowerCase();
    let manualRiskBump = false;

    if (senderId === 2) {
      if (
        lower.includes("money") ||
        lower.includes("gift card") ||
        lower.includes("wire") ||
        lower.includes("dollars") ||
        lower.includes("crypto")
      ) {
        this.risk = Math.max(this.risk, 82);
        this.state = "restricted";
        this.scamType = "romance";
        if (!this.reasons.includes("Urgent money request")) {
          this.reasons.unshift("Urgent money request");
        }
        this.signals.unshift({
          label: "Urgent money request",
          evidence_msg_id: this.messageIdCounter,
        });
        manualRiskBump = true;
        flagged = "restricted";
      } else if (
        lower.includes("whatsapp") ||
        lower.includes("telegram") ||
        lower.includes("off-app") ||
        lower.includes("number")
      ) {
        this.risk = Math.max(this.risk, 54);
        this.state = "caution";
        this.scamType = "romance";
        if (!this.reasons.includes("Asked to move off-app by message 3")) {
          this.reasons.unshift("Asked to move off-app by message 3");
        }
        this.signals.unshift({
          label: "Asked to move off-app by message 3",
          evidence_msg_id: this.messageIdCounter,
        });
        manualRiskBump = true;
        flagged = "caution";
      } else if (
        lower.includes("soulmate") ||
        lower.includes("love") ||
        lower.includes("destiny")
      ) {
        this.risk = Math.max(this.risk, 44);
        this.state = "caution";
        this.scamType = "romance";
        if (!this.reasons.includes("Fast emotional escalation")) {
          this.reasons.unshift("Fast emotional escalation");
        }
        this.signals.unshift({
          label: "Fast emotional escalation",
          evidence_msg_id: this.messageIdCounter,
        });
        manualRiskBump = true;
        flagged = "caution";
      }
    }

    const message = {
      id: this.messageIdCounter++,
      sender_id: Number(senderId),
      text: trimmed,
      created_at: new Date().toISOString(),
      flagged,
    };

    this.messages.push(message);

    // Broadcast message to all connected panes
    this.broadcast({
      type: "message",
      message,
    });

    if (manualRiskBump) {
      this.broadcast({
        type: "risk_update",
        conversation_id: Number(conversationId),
        risk: this.risk,
        state: this.state,
        scam_type: this.scamType,
        reasons: [...this.reasons],
        signals: [...this.signals],
      });
    }

    return message;
  }

  // Simulation test utilities
  setSimulateHistoryError(val) {
    this.simulateHistoryError = Boolean(val);
  }

  simulateDisconnect() {
    this.broadcast({
      type: "__mock_disconnect__",
    });
  }

  stopDemo() {
    this.activeTimers.forEach((timer) => clearTimeout(timer));
    this.activeTimers = [];
    this.isPlaying = false;
    this.currentDemoType = null;
  }

  reset() {
    this.resetState();
    // Broadcast reset updates
    this.broadcast({
      type: "risk_update",
      conversation_id: this.conversationId,
      risk: this.risk,
      state: this.state,
      scam_type: null,
      reasons: [],
      signals: [],
    });
    // Broadcast empty/reset signal
    this.broadcast({
      type: "reset",
      conversation_id: this.conversationId,
    });
  }

  playScamDemo() {
    this.runScenario(SCAM_SCENARIO, "scam");
  }

  playGenuineDemo() {
    this.runScenario(GENUINE_SCENARIO, "genuine");
  }

  runScenario(steps, demoType) {
    this.reset();
    this.isPlaying = true;
    this.currentDemoType = demoType;

    let cumulativeDelay = 200;

    steps.forEach((step, index) => {
      cumulativeDelay += step.delayMs;

      const timer = setTimeout(() => {
        if (!this.isPlaying) return;

        // Apply risk update if defined for this step
        if (step.riskUpdate) {
          this.risk = step.riskUpdate.risk;
          this.state = step.riskUpdate.state;
          this.scamType = step.riskUpdate.scam_type;
          this.reasons = step.riskUpdate.reasons || [];
          this.signals = step.riskUpdate.signals || [];

          this.broadcast({
            type: "risk_update",
            conversation_id: this.conversationId,
            risk: this.risk,
            state: this.state,
            scam_type: this.scamType,
            reasons: [...this.reasons],
            signals: [...this.signals],
          });
        }

        // Create and broadcast message
        const message = {
          id: this.messageIdCounter++,
          sender_id: step.sender_id,
          text: step.text,
          created_at: new Date().toISOString(),
          flagged: step.flagged,
        };

        this.messages.push(message);

        this.broadcast({
          type: "message",
          message,
        });

        // If last step, mark playback finished
        if (index === steps.length - 1) {
          this.isPlaying = false;
        }
      }, cumulativeDelay);

      this.activeTimers.push(timer);
    });
  }
}

// Export singleton instance shared by both panes
export const mockServer = new MockServer();
