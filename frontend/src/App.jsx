import React, { useState, useEffect } from 'react';
import ChatWindow from './components/ChatWindow';
import { mockServer, SEED_USERS } from './mocks/mockServer';
import {
  ShieldCheck,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  Bug,
  Activity,
  Layers,
  ShieldAlert,
  AlertTriangle,
} from 'lucide-react';

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const SHOW_DEV_TOOLS = import.meta.env.VITE_SHOW_DEV_TOOLS === 'true';

export function App() {
  const [users, setUsers] = useState(SEED_USERS);
  const [leftUserId, setLeftUserId] = useState(1);
  const [rightUserId, setRightUserId] = useState(2);
  const [activeDemo, setActiveDemo] = useState(null); // 'scam' | 'genuine' | null
  const [showDebugStrip, setShowDebugStrip] = useState(false);

  // Load real users if running in real backend mode
  useEffect(() => {
    if (USE_MOCK) return;

    fetch(`${API_URL}/users`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data) && data.length >= 2) {
          const mapped = data.map((u, i) => ({
            id: u.id,
            name: u.name,
            is_new: Boolean(u.is_new),
            role: i === 0 ? 'Recipient (Target)' : 'Sender (Contact)',
            avatar: i === 0 ? '👩🏽' : '👨🏻',
          }));
          setUsers(mapped);
          setLeftUserId(mapped[0].id);
          setRightUserId(mapped[1].id);
        }
      })
      .catch((err) => {
        console.warn('Could not load real users from backend, defaulting to seed list:', err);
      });
  }, []);

  const handlePlayScamDemo = () => {
    setActiveDemo('scam');
    mockServer.playScamDemo();
  };

  const handlePlayGenuineDemo = () => {
    setActiveDemo('genuine');
    mockServer.playGenuineDemo();
  };

  const handleReset = () => {
    setActiveDemo(null);
    mockServer.reset();
  };

  // Dev simulation helpers
  const handleSimulateDisconnect = () => {
    mockServer.simulateDisconnect();
  };

  const handleToggleHistoryError = () => {
    mockServer.setSimulateHistoryError(!mockServer.simulateHistoryError);
    // Trigger reset to see error
    mockServer.reset();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navigation / Brand Header */}
      <header className="w-full bg-slate-900 border-b border-slate-800 shadow-xl px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-4">
          {/* Logo & Hackathon Badge */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-600/30 flex-shrink-0">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white m-0">
                  BehavioralTrust
                </h1>
                <span className="text-[10px] uppercase font-mono font-bold tracking-widest px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                  Affecio Hacks &apos;26
                </span>
              </div>
              <p className="text-xs text-slate-400 m-0">
                AI Romance-Scam &amp; Phishing Detection Engine &bull; Day 2 Deliverable
              </p>
            </div>
          </div>

          {/* Center: Three-State Legend for Projector Clarity */}
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-mono">
            <span className="text-[11px] text-slate-500 uppercase font-semibold mr-1">States:</span>
            <div className="flex items-center gap-1 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Normal &lt;40</span>
            </div>
            <span className="text-slate-700">&bull;</span>
            <div className="flex items-center gap-1 text-amber-400">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>Caution 40-69</span>
            </div>
            <span className="text-slate-700">&bull;</span>
            <div className="flex items-center gap-1 text-rose-400">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>Restricted 70+</span>
            </div>
          </div>

          {/* Mode & Demo Controls */}
          <div className="flex items-center flex-wrap gap-2.5">
            {/* Environment status indicator */}
            <div
              id="mode-indicator"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700/60 text-xs font-mono text-slate-300"
            >
              <span
                className={`w-2 h-2 rounded-full ${USE_MOCK ? 'bg-amber-400' : 'bg-emerald-400'}`}
              />
              <span>{USE_MOCK ? 'MOCK ENGINE' : `BACKEND: ${API_URL}`}</span>
            </div>

            {/* Mock Demo Buttons */}
            {USE_MOCK && (
              <>
                <button
                  id="btn-play-scam"
                  onClick={handlePlayScamDemo}
                  type="button"
                  className={`px-3.5 py-1.5 rounded-xl font-semibold text-xs transition-all shadow-md flex items-center gap-1.5 cursor-pointer ${
                    activeDemo === 'scam'
                      ? 'bg-rose-600 text-white shadow-rose-900/50 ring-2 ring-rose-400 ring-offset-2 ring-offset-slate-900'
                      : 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40'
                  }`}
                  title="Run scripted romance scam scenario (triggers Caution -> Restricted)"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Play scam demo
                </button>

                <button
                  id="btn-play-genuine"
                  onClick={handlePlayGenuineDemo}
                  type="button"
                  className={`px-3.5 py-1.5 rounded-xl font-semibold text-xs transition-all shadow-md flex items-center gap-1.5 cursor-pointer ${
                    activeDemo === 'genuine'
                      ? 'bg-emerald-600 text-white shadow-emerald-900/50 ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-900'
                      : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40'
                  }`}
                  title="Run normal genuine conversation (risk remains safe < 40)"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Play genuine demo
                </button>

                <button
                  id="btn-reset"
                  onClick={handleReset}
                  type="button"
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
                  title="Reset conversation state and score"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>
              </>
            )}

            {/* Dev Tools Toggle Button (Visible only when VITE_SHOW_DEV_TOOLS=true) */}
            {SHOW_DEV_TOOLS && (
              <button
                onClick={() => setShowDebugStrip((v) => !v)}
                type="button"
                className={`p-1.5 rounded-xl border text-xs font-mono transition-all cursor-pointer ${
                  showDebugStrip
                    ? 'bg-purple-600 text-white border-purple-400'
                    : 'bg-slate-800 text-purple-300 border-purple-700/60 hover:bg-purple-950'
                }`}
                title="Toggle Dev Debug Events Strip"
              >
                <Bug className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Dev Tools Debug Strip */}
      {SHOW_DEV_TOOLS && showDebugStrip && (
        <aside aria-label="Developer Debug Console" className="bg-purple-950/70 border-b border-purple-800/80 px-4 py-2 text-xs font-mono text-purple-200">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-purple-400" />
              <span className="font-bold uppercase tracking-wider text-purple-300">
                Dev Stage Tools Active:
              </span>
              <span>Showing server-side test helpers &amp; raw events</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSimulateDisconnect}
                type="button"
                className="px-2.5 py-1 rounded bg-purple-900/90 hover:bg-purple-800 border border-purple-600 text-purple-100 font-bold text-[11px] cursor-pointer"
              >
                Simulate Socket Drop
              </button>
              <button
                onClick={handleToggleHistoryError}
                type="button"
                className="px-2.5 py-1 rounded bg-purple-900/90 hover:bg-purple-800 border border-purple-600 text-purple-100 font-bold text-[11px] cursor-pointer"
              >
                Toggle 503 History Error
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* Main Dual-Pane Chat Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {/* Verification banner */}
        <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-2.5 bg-slate-900/80 border border-slate-800 rounded-xl text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-indigo-300">Dual-Pane Synchronization:</span>
            <span>
              Left pane simulates recipient view (<strong className="text-slate-200">{users[0]?.name || 'Priya'}</strong>), right pane simulates contact view (<strong className="text-slate-200">{users[1]?.name || 'Rahul'}</strong>).
            </span>
          </div>
          <span className="font-mono text-slate-500 text-[11px] flex-shrink-0">
            Day 2 Architecture &bull; ExplainPanel &bull; Media Gate &bull; Report Flow
          </span>
        </div>

        {/* Dual Pane Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Pane: User A (Recipient / Priya) */}
          <ChatWindow
            conversationId={1}
            userId={leftUserId}
            onSelectUser={setLeftUserId}
            paneRole="Pane A • Recipient View"
            paneId="pane-a"
            userList={users}
          />

          {/* Right Pane: User B (Sender / Rahul) */}
          <ChatWindow
            conversationId={1}
            userId={rightUserId}
            onSelectUser={setRightUserId}
            paneRole="Pane B • Sender View"
            paneId="pane-b"
            userList={users}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="py-3 px-6 text-center text-xs text-slate-600 border-t border-slate-900">
        BehavioralTrust Scorer &bull; Affecio Hacks &apos;26 &bull; Frontend Day 2 Deliverable
      </footer>
    </div>
  );
}

export default App;
