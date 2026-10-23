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

    this.resetState();
  }

  resetState() {
    this.stopDemo();
    this.messages = [];
    this.risk = 10;
    this.state = "normal"; // 'normal' | 'caution' | 'restricted'
    this.scamType = null;
    this.reasons = [];
    this.blockedNotice = null;
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
    return Promise.resolve([...this.messages]);
  }

  async getRisk(conversationId = 1) {
    return Promise.resolve({
      conversation_id: Number(conversationId),
      risk: this.risk,
      state: this.state,
      scam_type: this.scamType,
      reasons: [...this.reasons],
    });
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
      if (lower.includes("money") || lower.includes("gift card") || lower.includes("wire") || lower.includes("dollars") || lower.includes("crypto")) {
        this.risk = Math.max(this.risk, 82);
        this.state = "restricted";
        this.scamType = "romance";
        if (!this.reasons.includes("Urgent money request")) {
          this.reasons.unshift("Urgent money request");
        }
        manualRiskBump = true;
        flagged = "restricted";
      } else if (lower.includes("whatsapp") || lower.includes("telegram") || lower.includes("off-app") || lower.includes("number")) {
        this.risk = Math.max(this.risk, 54);
        this.state = "caution";
        this.scamType = "romance";
        if (!this.reasons.includes("Asked to move off-app by message 3")) {
          this.reasons.unshift("Asked to move off-app by message 3");
        }
        manualRiskBump = true;
        flagged = "caution";
      } else if (lower.includes("soulmate") || lower.includes("love") || lower.includes("destiny")) {
        this.risk = Math.max(this.risk, 44);
        this.state = "caution";
        this.scamType = "romance";
        if (!this.reasons.includes("Fast emotional escalation")) {
          this.reasons.unshift("Fast emotional escalation");
        }
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
      });
    }

    return message;
  }

  // Paperclip click / media attempt
  trySendMedia(conversationId, senderId) {
    if (this.state === "restricted") {
      const reasons = [
        "Media attachments blocked in restricted state to prevent malware, explicit extortion, or malicious QR codes.",
      ];
      this.broadcast({
        type: "media_blocked",
        conversation_id: Number(conversationId),
        reasons,
      });
      return { allowed: false, reasons };
    }

    // Normal or caution allows attachment simulation
    const msg = {
      id: this.messageIdCounter++,
      sender_id: Number(senderId),
      text: "📎 [Shared attachment: image_receipt.png (Day 2 preview)]",
      created_at: new Date().toISOString(),
      flagged: undefined,
    };
    this.messages.push(msg);
    this.broadcast({
      type: "message",
      message: msg,
    });
    return { allowed: true };
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
          this.reasons = step.riskUpdate.reasons;

          this.broadcast({
            type: "risk_update",
            conversation_id: this.conversationId,
            risk: this.risk,
            state: this.state,
            scam_type: this.scamType,
            reasons: [...this.reasons],
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
