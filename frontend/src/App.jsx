import React, { useState } from 'react';
import ChatWindow from './components/ChatWindow';
import { mockServer } from './mocks/mockServer';
import { ShieldCheck, Play, RotateCcw, Sparkles, CheckCircle2 } from 'lucide-react';

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export function App() {
  // Left pane defaults to User 1 (Priya - Recipient), Right pane defaults to User 2 (Rahul - Scammer/Contact)
  const [leftUserId, setLeftUserId] = useState(1);
  const [rightUserId, setRightUserId] = useState(2);
  const [activeDemo, setActiveDemo] = useState(null); // 'scam' | 'genuine' | null

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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navigation / Brand Header */}
      <header className="w-full bg-slate-900 border-b border-slate-800 shadow-lg px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Logo & Hackathon Badge */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-600/30">
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
                AI Romance-Scam &amp; Phishing Detection Engine
              </p>
            </div>
          </div>

          {/* Mode & Demo Controls */}
          <div className="flex items-center flex-wrap gap-2.5">
            {/* Environment status indicator */}
            <div
              id="mode-indicator"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700/60 text-xs font-mono text-slate-300 mr-1"
            >
              <span className={`w-2 h-2 rounded-full ${USE_MOCK ? 'bg-amber-400' : 'bg-emerald-400'}`} />
              <span>{USE_MOCK ? 'MOCK ENGINE' : `BACKEND: ${API_URL}`}</span>
            </div>

            {/* Play Scam Demo Button */}
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

            {/* Play Genuine Demo Button */}
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

            {/* Reset Button */}
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
          </div>
        </div>
      </header>

      {/* Main Dual-Pane Chat Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {/* Verification banner */}
        <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-2.5 bg-slate-900/80 border border-slate-800 rounded-xl text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-indigo-300">Dual-Pane Verification:</span>
            <span>
              Both panes are synchronised in real time. Left pane shows recipient view (<strong className="text-slate-200">Priya</strong>), right pane shows contact view (<strong className="text-slate-200">Rahul</strong>).
            </span>
          </div>
          <span className="font-mono text-slate-500 text-[11px] flex-shrink-0">
            Day 1 Architecture &bull; Shared Socket Stream
          </span>
        </div>

        {/* Dual Pane Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Pane: User A (Priya - Recipient) */}
          <ChatWindow
            conversationId={1}
            userId={leftUserId}
            onSelectUser={setLeftUserId}
            paneRole="Pane A • Recipient View"
            paneId="pane-a"
          />

          {/* Right Pane: User B (Rahul - Sender / Scammer) */}
          <ChatWindow
            conversationId={1}
            userId={rightUserId}
            onSelectUser={setRightUserId}
            paneRole="Pane B • Sender View"
            paneId="pane-b"
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="py-3 px-6 text-center text-xs text-slate-600 border-t border-slate-900">
        BehavioralTrust Scorer &bull; Affecio Hacks &apos;26 &bull; Frontend Day 1 Deliverable
      </footer>
    </div>
  );
}

export default App;
