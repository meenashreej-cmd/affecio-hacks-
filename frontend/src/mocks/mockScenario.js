/**
 * Scripted scenarios for BehavioralTrust Scorer demo.
 * Rahul (id 2) acts as the scammer or genuine contact.
 * Priya (id 1) acts as the recipient/victim.
 */

export const SCAM_SCENARIO = [
  {
    sender_id: 2,
    text: "Hey Priya! I came across your profile and had to say hello. How is your day going?",
    delayMs: 1200,
    riskUpdate: {
      risk: 15,
      state: "normal",
      scam_type: "none",
      reasons: [],
      signals: [],
    },
    flagged: null,
  },
  {
    sender_id: 1,
    text: "Hi Rahul! Going alright, just wrapping up some client design work. How about you?",
    delayMs: 2200,
    riskUpdate: null,
    flagged: null,
  },
  {
    sender_id: 2,
    text: "Honestly, talking to you is the highlight of my whole week. I know this sounds crazy, but I feel like you might be my soulmate. I've never felt this kind of instant spark with anyone.",
    delayMs: 2800,
    riskUpdate: {
      risk: 45,
      state: "caution",
      scam_type: "romance",
      reasons: [
        "Fast emotional escalation (intense romantic claims within first 3 messages)",
      ],
      signals: [
        {
          label: "Fast emotional escalation (intense romantic claims within first 3 messages)",
          evidence_msg_id: 3,
        },
      ],
    },
    flagged: "caution",
  },
  {
    sender_id: 1,
    text: "Oh wow, that's really flattering haha! But we literally just started chatting ten minutes ago.",
    delayMs: 2500,
    riskUpdate: null,
    flagged: null,
  },
  {
    sender_id: 2,
    text: "I know, but life is too short to hide feelings! Look, my connection on this app keeps dropping and I rarely check it anyway. Add me on WhatsApp right now so we don't lose touch: +1 (555) 019-8422",
    delayMs: 2900,
    riskUpdate: {
      risk: 58,
      state: "caution",
      scam_type: "romance",
      reasons: [
        "Fast emotional escalation",
        "Asked to move off-app by message 3",
      ],
      signals: [
        {
          label: "Asked to move off-app by message 3",
          evidence_msg_id: 5,
        },
        {
          label: "Fast emotional escalation",
          evidence_msg_id: 3,
        },
      ],
    },
    flagged: "caution",
  },
  {
    sender_id: 2,
    text: "Priya please, something urgent just happened... I'm currently stuck at an overseas transit hub on a project contract and my corporate card got locked. I desperately need $450 via Apple gift cards or emergency transfer to clear customs and get my hotel. I'll pay you back double first thing tomorrow morning, please help!",
    delayMs: 3200,
    riskUpdate: {
      risk: 78,
      state: "restricted",
      scam_type: "romance",
      reasons: [
        "Urgent money request",
        "Asked to move off-app by message 3",
        "Fast emotional escalation",
      ],
      signals: [
        {
          label: "Urgent money request",
          evidence_msg_id: 6,
        },
        {
          label: "Asked to move off-app by message 3",
          evidence_msg_id: 5,
        },
        {
          label: "Fast emotional escalation",
          evidence_msg_id: 3,
        },
      ],
    },
    flagged: "restricted",
  },
];

export const GENUINE_SCENARIO = [
  {
    sender_id: 2,
    text: "Hi Priya! I noticed from your profile that you're into weekend hiking and landscape photography. Any favorite trails around the bay?",
    delayMs: 1200,
    riskUpdate: {
      risk: 12,
      state: "normal",
      scam_type: "none",
      reasons: [],
      signals: [],
    },
    flagged: null,
  },
  {
    sender_id: 1,
    text: "Hey Rahul! Yes! Tennessee Valley and the Matt Davis trail near Mt. Tam are incredible this time of year.",
    delayMs: 2200,
    riskUpdate: null,
    flagged: null,
  },
  {
    sender_id: 2,
    text: "Awesome, I've been wanting to try Steep Ravine loop for a while. Are the trailheads usually packed by 9 AM on Saturdays?",
    delayMs: 2500,
    riskUpdate: {
      risk: 18,
      state: "normal",
      scam_type: "none",
      reasons: [],
      signals: [],
    },
    flagged: null,
  },
  {
    sender_id: 1,
    text: "Yeah, parking gets tough after 8:30 AM at Pantoll, so definitely aim to arrive early or park down at Stinson and hike up!",
    delayMs: 2400,
    riskUpdate: null,
    flagged: null,
  },
  {
    sender_id: 2,
    text: "Great tip, thanks so much! Appreciate the recommendation.",
    delayMs: 2200,
    riskUpdate: {
      risk: 20,
      state: "normal",
      scam_type: "none",
      reasons: [],
      signals: [],
    },
    flagged: null,
  },
];
