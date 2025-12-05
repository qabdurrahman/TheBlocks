"use client";

import { useState } from "react";
import type { NextPage } from "next";
import { AdminPanel, DisputeInterface, SettlementInitiator, SettlementMonitor } from "~~/components/settlement";

/**
 * @title TheBlocks - Adversarial-Resilient Settlement Protocol
 * @author TheBlocks Team - TriHacker Tournament 2025
 *
 * Main application page with tabbed navigation for:
 * 1. Create Settlement
 * 2. Monitor Settlements
 * 3. Dispute Center
 * 4. Admin Panel
 */

type TabType = "create" | "monitor" | "dispute" | "admin";

const tabs: { id: TabType; label: string; icon: string }[] = [
  { id: "create", label: "Create", icon: "⚡" },
  { id: "monitor", label: "Monitor", icon: "📊" },
  { id: "dispute", label: "Dispute", icon: "⚠️" },
  { id: "admin", label: "Admin", icon: "🛡️" },
];

const Home: NextPage = () => {
  const [activeTab, setActiveTab] = useState<TabType>("create");

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-primary/20 via-secondary/20 to-accent/20 py-12">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">🔗 TheBlocks</h1>
          <p className="text-xl opacity-80 max-w-2xl mx-auto">Adversarial-Resilient Settlement Protocol</p>
          <div className="flex flex-wrap justify-center gap-3 mt-6">
            <span className="badge badge-lg badge-primary">Fair Ordering</span>
            <span className="badge badge-lg badge-secondary">5 Invariants</span>
            <span className="badge badge-lg badge-accent">Triple Oracle + AI</span>
            <span className="badge badge-lg badge-info">Partial Finality</span>
            <span className="badge badge-lg badge-warning">MEV Resistant</span>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="container mx-auto px-4 -mt-6">
        <div className="tabs tabs-boxed justify-center bg-base-100 shadow-lg rounded-full p-2 max-w-2xl mx-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`tab tab-lg flex-1 ${activeTab === tab.id ? "tab-active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-10 flex-1">
        {activeTab === "create" && <SettlementInitiator />}
        {activeTab === "monitor" && <SettlementMonitor />}
        {activeTab === "dispute" && <DisputeInterface />}
        {activeTab === "admin" && <AdminPanel />}
      </div>

      {/* Features Section */}
      <div className="bg-base-200 py-12">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl font-bold text-center mb-8">🛡️ Security Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <div className="card bg-base-100 shadow-lg">
              <div className="card-body text-center">
                <span className="text-4xl mb-2">🔒</span>
                <h3 className="card-title justify-center">FIFO Queue</h3>
                <p className="text-sm opacity-70">Fair ordering prevents frontrunning and MEV extraction</p>
              </div>
            </div>
            <div className="card bg-base-100 shadow-lg">
              <div className="card-body text-center">
                <span className="text-4xl mb-2">🔮</span>
                <h3 className="card-title justify-center">Triple Oracle + AI</h3>
                <p className="text-sm opacity-70">Chainlink + Pyth + SyncedFeed with AI-powered manipulation detection</p>
              </div>
            </div>
            <div className="card bg-base-100 shadow-lg">
              <div className="card-body text-center">
                <span className="text-4xl mb-2">✅</span>
                <h3 className="card-title justify-center">5 Invariants</h3>
                <p className="text-sm opacity-70">
                  Conservation, No Double Settlement, Freshness, Timeout, Partial Finality
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tech Stack Footer */}
      <div className="bg-base-300 py-6">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm opacity-70">
            Built for TriHacker Tournament 2025 | Scaffold-ETH 2 • Solidity • Next.js
          </p>
        </div>
      </div>
    </div>
  );
};

export default Home;
