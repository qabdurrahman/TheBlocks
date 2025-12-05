"use client";

import { useState, useEffect } from "react";
import type { NextPage } from "next";
import { ThreeOracleDashboard } from "~~/components/oracle/ThreeOracleDashboard";
import { OracleDashboard } from "~~/components/oracle/OracleDashboard";
import { AttackSimulator } from "~~/components/oracle/AttackSimulator";
import { SecurityMetrics } from "~~/components/oracle/SecurityMetrics";
import { ContractStatus } from "~~/components/oracle/ContractStatus";

/**
 * 🏆 THE BLOCKS - 3-ORACLE BFT SECURITY DASHBOARD
 * TriHacker Tournament 2025 - IIT Bombay
 * 
 * Real-time visualization of our 3-layer oracle security system with
 * AI-powered Smart Oracle Selection: Chainlink • Pyth • API3
 * 
 * Features:
 * - 3-Oracle BFT Consensus (Byzantine Fault Tolerant)
 * - GuardianOracleV2 Security Layer
 * - SmartOracleSelector AI Scoring
 * - Multi-Asset Price Explorer (50+ feeds)
 */

type ViewMode = "dashboard" | "attack" | "metrics" | "contracts";

const OraclePage: NextPage = () => {
  const [activeView, setActiveView] = useState<ViewMode>("dashboard");
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  const views = [
    { id: "dashboard" as ViewMode, label: "3-Oracle BFT + AI", icon: "🧠", color: "from-cyan-500 to-blue-500" },
    { id: "attack" as ViewMode, label: "Attack Sim", icon: "⚔️", color: "from-red-500 to-orange-500" },
    { id: "metrics" as ViewMode, label: "Security", icon: "🛡️", color: "from-green-500 to-emerald-500" },
    { id: "contracts" as ViewMode, label: "Contracts", icon: "📜", color: "from-pink-500 to-rose-500" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-black text-white overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-blue-500/5 rounded-full blur-2xl animate-bounce" style={{ animationDuration: '4s' }} />
        
        {/* Grid Pattern */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA2MCAwIEwgMCAwIDAgNjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-50" />
      </div>

      {/* Header */}
      <header className={`relative z-10 pt-8 pb-6 transition-all duration-1000 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-10'}`}>
        <div className="container mx-auto px-4">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
            {/* Logo & Title */}
            <div className="text-center lg:text-left">
              <div className="flex items-center justify-center lg:justify-start gap-3 mb-2">
                <div className="relative">
                  <div className="w-12 h-12 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-xl flex items-center justify-center text-2xl font-bold shadow-lg shadow-cyan-500/30">
                    ⬡
                  </div>
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-ping" />
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full" />
                </div>
                <div>
                  <h1 className="text-3xl font-black bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                    THE BLOCKS
                  </h1>
                  <p className="text-xs text-gray-400 tracking-widest uppercase">3-Oracle BFT Security System</p>
                </div>
              </div>
            </div>

            {/* Network Badge */}
            <div className="flex items-center gap-4">
              <div className="px-4 py-2 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 rounded-full flex items-center gap-2">
                <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                <span className="text-sm font-medium text-yellow-300">Sepolia Testnet</span>
              </div>
              <div className="px-4 py-2 bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 rounded-full flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span className="text-sm font-medium text-green-300">Live</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className={`relative z-10 py-4 transition-all duration-1000 delay-200 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap justify-center gap-3">
            {views.map((view) => (
              <button
                key={view.id}
                onClick={() => setActiveView(view.id)}
                className={`group relative px-6 py-3 rounded-xl font-medium transition-all duration-300 ${
                  activeView === view.id
                    ? `bg-gradient-to-r ${view.color} text-white shadow-lg scale-105`
                    : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:scale-102'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="text-xl">{view.icon}</span>
                  <span>{view.label}</span>
                </span>
                {activeView === view.id && (
                  <div className="absolute inset-0 rounded-xl bg-white/20 animate-pulse" />
                )}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className={`relative z-10 container mx-auto px-4 py-8 transition-all duration-1000 delay-400 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
        {activeView === "dashboard" && <ThreeOracleDashboard />}
        {activeView === "attack" && <AttackSimulator />}
        {activeView === "metrics" && <SecurityMetrics />}
        {activeView === "contracts" && <ContractStatus />}
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-6 border-t border-white/5">
        <div className="container mx-auto px-4 text-center">
          <p className="text-gray-500 text-sm">
            🏆 TriHacker Tournament 2025 - IIT Bombay • Built with ❤️ by TheBlocks Team
          </p>
        </div>
      </footer>
    </div>
  );
};

export default OraclePage;
