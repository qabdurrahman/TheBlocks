"use client";

import { useState } from "react";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import {
  AdminPanel,
  DisputeInterface,
  InvariantStatus,
  OraclePriceDisplay,
  ProtocolStats,
  SettlementDetails,
  SettlementInitiator,
  SettlementMonitor,
} from "~~/components/settlement";

/**
 * @title Dashboard - TheBlocks Protocol
 * @author TheBlocks Team - TriHacker Tournament 2025
 * @notice Main dashboard with comprehensive protocol views
 *
 * LAYOUT:
 * - Left Sidebar: Navigation & Quick Stats
 * - Main Area: Active panel (tabbed)
 * - Right Sidebar: Oracle & Invariants
 */

type TabType = "overview" | "create" | "monitor" | "details" | "dispute" | "admin";

const Dashboard: NextPage = () => {
  const { isConnected, address } = useAccount();
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [selectedSettlementId, setSelectedSettlementId] = useState<string>("1");

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: "overview", label: "Overview", icon: "📊" },
    { id: "create", label: "Create", icon: "⚡" },
    { id: "monitor", label: "Monitor", icon: "👁️" },
    { id: "details", label: "Details", icon: "📋" },
    { id: "dispute", label: "Dispute", icon: "⚠️" },
    { id: "admin", label: "Admin", icon: "🛡️" },
  ];

  return (
    <div className="min-h-screen bg-base-200">
      {/* Top Header */}
      <header className="bg-base-100 shadow-lg sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🔗</span>
              <div>
                <h1 className="text-xl font-bold">TheBlocks Dashboard</h1>
                <p className="text-xs opacity-60">Adversarial-Resilient Settlement Protocol</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {isConnected ? (
                <div className="flex items-center gap-2 bg-base-200 px-4 py-2 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-success animate-pulse"></span>
                  <code className="text-sm">
                    {address?.slice(0, 6)}...{address?.slice(-4)}
                  </code>
                </div>
              ) : (
                <span className="badge badge-warning">Connect Wallet</span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Navigation */}
          <aside className="lg:col-span-2">
            <div className="bg-base-100 rounded-2xl shadow-lg p-4 sticky top-24">
              <nav className="space-y-2">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                      activeTab === tab.id ? "bg-primary text-primary-content" : "hover:bg-base-200"
                    }`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <span className="text-lg">{tab.icon}</span>
                    <span className="font-medium">{tab.label}</span>
                  </button>
                ))}
              </nav>

              {/* Quick Settlement Selector */}
              <div className="mt-6 pt-4 border-t border-base-300">
                <label className="text-xs font-semibold opacity-60">Quick Jump</label>
                <div className="flex gap-2 mt-2">
                  <input
                    type="number"
                    min="1"
                    placeholder="ID"
                    className="input input-bordered input-sm flex-1"
                    value={selectedSettlementId}
                    onChange={e => setSelectedSettlementId(e.target.value)}
                  />
                  <button className="btn btn-sm btn-primary" onClick={() => setActiveTab("details")}>
                    Go
                  </button>
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content Area */}
          <main className="lg:col-span-7">
            {activeTab === "overview" && (
              <div className="space-y-6">
                <ProtocolStats />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <InvariantStatus />
                  <OraclePriceDisplay />
                </div>
              </div>
            )}

            {activeTab === "create" && <SettlementInitiator />}

            {activeTab === "monitor" && <SettlementMonitor />}

            {activeTab === "details" && <SettlementDetails settlementId={BigInt(selectedSettlementId || "1")} />}

            {activeTab === "dispute" && <DisputeInterface />}

            {activeTab === "admin" && <AdminPanel />}
          </main>

          {/* Right Sidebar */}
          <aside className="lg:col-span-3">
            <div className="space-y-6 sticky top-24">
              {/* Oracle Widget (compact) */}
              <div className="bg-base-100 rounded-2xl shadow-lg p-4">
                <OraclePriceDisplay />
              </div>

              {/* Quick Actions */}
              <div className="bg-base-100 rounded-2xl shadow-lg p-4">
                <h3 className="font-bold mb-4">⚡ Quick Actions</h3>
                <div className="space-y-2">
                  <button className="btn btn-primary btn-block" onClick={() => setActiveTab("create")}>
                    ➕ New Settlement
                  </button>
                  <button className="btn btn-secondary btn-block" onClick={() => setActiveTab("monitor")}>
                    📊 View Queue
                  </button>
                  <button className="btn btn-accent btn-block" onClick={() => setActiveTab("dispute")}>
                    ⚠️ Raise Dispute
                  </button>
                </div>
              </div>

              {/* Info Card */}
              <div className="bg-gradient-to-br from-primary/20 to-secondary/20 rounded-2xl p-4">
                <h3 className="font-bold mb-2">🏆 TriHacker 2025</h3>
                <p className="text-sm opacity-70">
                  TheBlocks is an adversarial-resilient settlement protocol featuring:
                </p>
                <ul className="text-xs opacity-60 mt-2 space-y-1">
                  <li>✓ FIFO Queue (Fair Ordering)</li>
                  <li>✓ Dual Oracle (Chainlink + Band)</li>
                  <li>✓ 5 Safety Invariants</li>
                  <li>✓ Partial Finality</li>
                  <li>✓ MEV Prevention</li>
                </ul>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-base-300 py-4 mt-8">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm opacity-60">
            TheBlocks Protocol • Built for TriHacker Tournament 2025 • Scaffold-ETH 2
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Dashboard;
