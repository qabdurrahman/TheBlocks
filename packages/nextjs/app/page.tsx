"use client";

import { useCallback, useEffect, useState } from "react";
import type { NextPage } from "next";
import { usePublicClient } from "wagmi";
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

// Oracle addresses on Sepolia
const CHAINLINK_ETH_USD = "0x694AA1769357215DE4FAC081bf1f309aDC325306";
const PYTH_CONTRACT = "0xDd24F84d36BF92C65F92307595335bdFab5Bbd21";
const PYTH_ETH_USD_ID = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace";

const CHAINLINK_ABI = [
  {
    inputs: [],
    name: "latestRoundData",
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

const PYTH_ABI = [
  {
    inputs: [{ name: "id", type: "bytes32" }],
    name: "getPriceUnsafe",
    outputs: [
      {
        components: [
          { name: "price", type: "int64" },
          { name: "conf", type: "uint64" },
          { name: "expo", type: "int32" },
          { name: "publishTime", type: "uint256" },
        ],
        name: "price",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

type TabType = "trade" | "monitor" | "dispute" | "admin";

const tabs: { id: TabType; label: string; icon: string }[] = [
  { id: "trade", label: "Trade", icon: "💹" },
  { id: "monitor", label: "Monitor", icon: "📊" },
  { id: "dispute", label: "Dispute", icon: "⚠️" },
  { id: "admin", label: "Admin", icon: "🛡️" },
];

interface OraclePrice {
  name: string;
  price: number;
  timestamp: Date;
  status: "live" | "stale" | "error";
}

const Home: NextPage = () => {
  const [activeTab, setActiveTab] = useState<TabType>("trade");
  const [oraclePrices, setOraclePrices] = useState<OraclePrice[]>([]);
  const [priceLoading, setPriceLoading] = useState(true);
  const publicClient = usePublicClient();

  // Fetch oracle prices
  const fetchPrices = useCallback(async () => {
    if (!publicClient) return;

    try {
      const prices: OraclePrice[] = [];

      // Chainlink
      try {
        const chainlinkData = await publicClient.readContract({
          address: CHAINLINK_ETH_USD,
          abi: CHAINLINK_ABI,
          functionName: "latestRoundData",
        });
        const price = Number(chainlinkData[1]) / 1e8;
        const timestamp = new Date(Number(chainlinkData[3]) * 1000);
        const isStale = Date.now() - timestamp.getTime() > 3600000; // 1 hour
        prices.push({
          name: "Chainlink",
          price,
          timestamp,
          status: isStale ? "stale" : "live",
        });
      } catch {
        prices.push({ name: "Chainlink", price: 0, timestamp: new Date(), status: "error" });
      }

      // Pyth
      try {
        const pythData = await publicClient.readContract({
          address: PYTH_CONTRACT,
          abi: PYTH_ABI,
          functionName: "getPriceUnsafe",
          args: [PYTH_ETH_USD_ID as `0x${string}`],
        });
        const price = Number(pythData.price) * Math.pow(10, pythData.expo);
        const timestamp = new Date(Number(pythData.publishTime) * 1000);
        const isStale = Date.now() - timestamp.getTime() > 3600000;
        prices.push({
          name: "Pyth",
          price,
          timestamp,
          status: isStale ? "stale" : "live",
        });
      } catch {
        prices.push({ name: "Pyth", price: 0, timestamp: new Date(), status: "error" });
      }

      setOraclePrices(prices);
    } catch (error) {
      console.error("Failed to fetch prices:", error);
    } finally {
      setPriceLoading(false);
    }
  }, [publicClient]);

  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, 30000);
    return () => clearInterval(interval);
  }, [fetchPrices]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  };

  const avgPrice = oraclePrices.filter(p => p.status !== "error").reduce((sum, p) => sum + p.price, 0) / 
    Math.max(1, oraclePrices.filter(p => p.status !== "error").length);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section with Live Prices */}
      <div className="bg-gradient-to-r from-primary/20 via-secondary/20 to-accent/20 py-8">
        <div className="container mx-auto px-4">
          <div className="text-center mb-6">
            <h1 className="text-4xl md:text-5xl font-bold mb-2">🔗 TheBlocks</h1>
            <p className="text-xl opacity-80">Trade & Settle with Oracle-Validated Prices</p>
          </div>

          {/* Live Price Ticker */}
          <div className="bg-base-100/80 backdrop-blur rounded-2xl shadow-xl p-4 max-w-4xl mx-auto">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl">⟠</span>
                <div>
                  <div className="text-sm opacity-70">ETH/USD</div>
                  <div className="text-2xl font-bold text-primary">
                    {priceLoading ? (
                      <span className="loading loading-dots loading-sm"></span>
                    ) : (
                      formatPrice(avgPrice)
                    )}
                  </div>
                </div>
              </div>

              {/* Oracle Sources */}
              <div className="flex gap-4">
                {oraclePrices.map((oracle, idx) => (
                  <div key={idx} className="text-center">
                    <div className="text-xs opacity-60">{oracle.name}</div>
                    <div className={`font-mono text-sm ${
                      oracle.status === "live" ? "text-success" : 
                      oracle.status === "stale" ? "text-warning" : "text-error"
                    }`}>
                      {oracle.status === "error" ? "Error" : formatPrice(oracle.price)}
                    </div>
                    <div className={`badge badge-xs ${
                      oracle.status === "live" ? "badge-success" : 
                      oracle.status === "stale" ? "badge-warning" : "badge-error"
                    }`}>
                      {oracle.status === "live" ? "● LIVE" : oracle.status.toUpperCase()}
                    </div>
                  </div>
                ))}
              </div>

              <button 
                className="btn btn-sm btn-ghost" 
                onClick={fetchPrices}
                disabled={priceLoading}
              >
                🔄 Refresh
              </button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="flex flex-wrap justify-center gap-3 mt-4">
            <span className="badge badge-lg badge-primary">Triple Oracle Validation</span>
            <span className="badge badge-lg badge-secondary">MEV Resistant</span>
            <span className="badge badge-lg badge-accent">Fair FIFO Ordering</span>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="container mx-auto px-4 -mt-4">
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
      <div className="container mx-auto px-4 py-8 flex-1">
        {activeTab === "trade" && <SettlementInitiator />}
        {activeTab === "monitor" && <SettlementMonitor />}
        {activeTab === "dispute" && <DisputeInterface />}
        {activeTab === "admin" && <AdminPanel />}
      </div>

      {/* How It Works Section */}
      <div className="bg-base-200 py-10">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl font-bold text-center mb-8">💹 How Trading Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 max-w-5xl mx-auto">
            <div className="card bg-base-100 shadow-lg">
              <div className="card-body text-center">
                <span className="text-3xl mb-2">1️⃣</span>
                <h3 className="font-bold">Create Trade</h3>
                <p className="text-sm opacity-70">Define transfers with sender, recipient, and ETH amount</p>
              </div>
            </div>
            <div className="card bg-base-100 shadow-lg">
              <div className="card-body text-center">
                <span className="text-3xl mb-2">2️⃣</span>
                <h3 className="font-bold">Oracle Validation</h3>
                <p className="text-sm opacity-70">Price validated by Chainlink + Pyth + SyncedFeed</p>
              </div>
            </div>
            <div className="card bg-base-100 shadow-lg">
              <div className="card-body text-center">
                <span className="text-3xl mb-2">3️⃣</span>
                <h3 className="font-bold">FIFO Queue</h3>
                <p className="text-sm opacity-70">Fair ordering prevents frontrunning & MEV</p>
              </div>
            </div>
            <div className="card bg-base-100 shadow-lg">
              <div className="card-body text-center">
                <span className="text-3xl mb-2">4️⃣</span>
                <h3 className="font-bold">Settlement</h3>
                <p className="text-sm opacity-70">Secure execution with dispute protection</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 🏆 HACKATHON REQUIREMENTS - 5 Required System Behaviors */}
      <div className="bg-gradient-to-r from-warning/20 via-primary/20 to-success/20 py-12">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <span className="badge badge-lg badge-warning mb-3">🏆 TriHacker Tournament 2025</span>
            <h2 className="text-3xl font-bold">5 Required System Behaviors</h2>
            <p className="opacity-70 mt-2">All behaviors implemented and demonstrated on Sepolia Testnet</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 max-w-7xl mx-auto">
            {/* 1. Fair Ordering */}
            <div className="card bg-base-100 shadow-xl border-2 border-success">
              <div className="card-body p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="badge badge-success badge-sm">✓ IMPLEMENTED</span>
                  <span className="text-2xl">⚖️</span>
                </div>
                <h3 className="font-bold text-primary">1. Fair Ordering</h3>
                <p className="text-xs opacity-70 mb-2">Settlement cannot depend on validator ordering</p>
                <div className="bg-base-200 rounded p-2 text-xs">
                  <strong>Solution:</strong> FIFO Queue with on-chain timestamp. Trades processed in order of creation, not block inclusion.
                </div>
              </div>
            </div>

            {/* 2. Invariant Enforcement */}
            <div className="card bg-base-100 shadow-xl border-2 border-success">
              <div className="card-body p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="badge badge-success badge-sm">✓ IMPLEMENTED</span>
                  <span className="text-2xl">🔒</span>
                </div>
                <h3 className="font-bold text-primary">2. Invariant Enforcement</h3>
                <p className="text-xs opacity-70 mb-2">Define & prove 3-5 core invariants</p>
                <div className="bg-base-200 rounded p-2 text-xs">
                  <strong>5 Invariants:</strong> Conservation, No Double Settlement, Price Freshness, Timeout Safety, State Machine
                </div>
              </div>
            </div>

            {/* 3. Partial Finality */}
            <div className="card bg-base-100 shadow-xl border-2 border-success">
              <div className="card-body p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="badge badge-success badge-sm">✓ IMPLEMENTED</span>
                  <span className="text-2xl">⏳</span>
                </div>
                <h3 className="font-bold text-primary">3. Partial Finality</h3>
                <p className="text-xs opacity-70 mb-2">Settlement occurs across multiple blocks</p>
                <div className="bg-base-200 rounded p-2 text-xs">
                  <strong>Solution:</strong> 7-state FSM (Pending→Validated→Confirmed→Executed) with BFT consensus across blocks
                </div>
              </div>
            </div>

            {/* 4. Oracle Manipulation Resistance */}
            <div className="card bg-base-100 shadow-xl border-2 border-success">
              <div className="card-body p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="badge badge-success badge-sm">✓ IMPLEMENTED</span>
                  <span className="text-2xl">🛡️</span>
                </div>
                <h3 className="font-bold text-primary">4. Oracle Resistance</h3>
                <p className="text-xs opacity-70 mb-2">Dispute and correction mechanic</p>
                <div className="bg-base-200 rounded p-2 text-xs">
                  <strong>Solution:</strong> Triple Oracle (Chainlink + Pyth + SyncedFeed), 2-of-3 consensus, AI Guardian fallback
                </div>
              </div>
            </div>

            {/* 5. Attack Model Clarity */}
            <div className="card bg-base-100 shadow-xl border-2 border-success">
              <div className="card-body p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="badge badge-success badge-sm">✓ IMPLEMENTED</span>
                  <span className="text-2xl">🎯</span>
                </div>
                <h3 className="font-bold text-primary">5. Attack Model</h3>
                <p className="text-xs opacity-70 mb-2">Define adversary capabilities & defend</p>
                <div className="bg-base-200 rounded p-2 text-xs">
                  <strong>Attacks Defended:</strong> Flash Loan, Sandwich, Oracle Manipulation, Front-running, Reentrancy
                </div>
              </div>
            </div>
          </div>

          {/* Architecture Summary */}
          <div className="mt-8 bg-base-100 rounded-2xl p-6 max-w-4xl mx-auto shadow-xl">
            <h3 className="font-bold text-xl text-center mb-4">🏗️ Architecture Overview</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="bg-primary/10 rounded-lg p-3">
                <div className="text-2xl mb-1">📡</div>
                <div className="font-bold text-sm">Triple Oracle</div>
                <div className="text-xs opacity-70">Chainlink + Pyth + Synced</div>
              </div>
              <div className="bg-secondary/10 rounded-lg p-3">
                <div className="text-2xl mb-1">🔄</div>
                <div className="font-bold text-sm">7-State FSM</div>
                <div className="text-xs opacity-70">BFT Consensus Flow</div>
              </div>
              <div className="bg-accent/10 rounded-lg p-3">
                <div className="text-2xl mb-1">📋</div>
                <div className="font-bold text-sm">FIFO Queue</div>
                <div className="text-xs opacity-70">MEV-Resistant</div>
              </div>
              <div className="bg-success/10 rounded-lg p-3">
                <div className="text-2xl mb-1">🤖</div>
                <div className="font-bold text-sm">AI Guardian</div>
                <div className="text-xs opacity-70">Anomaly Detection</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 🚨 NEW ADVERSARIAL ORACLE CONDITION */}
      <div className="bg-gradient-to-r from-error/20 via-warning/20 to-error/20 py-12">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <span className="badge badge-lg badge-error mb-3">⚠️ ADVERSARIAL CONDITION</span>
            <h2 className="text-3xl font-bold">Unreliable Oracle / External Data Feed</h2>
            <p className="opacity-70 mt-2">Your protocol&apos;s oracle may behave adversarially. Here&apos;s how we defend:</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 max-w-6xl mx-auto">
            {/* Condition 1: Incorrect Values */}
            <div className="card bg-base-100 shadow-xl border-2 border-success">
              <div className="card-body p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="badge badge-error badge-sm">ATTACK</span>
                  <span className="text-2xl">❌</span>
                </div>
                <h3 className="font-bold text-error">1. Incorrect Values</h3>
                <p className="text-xs opacity-70 mb-2">Oracle reports values 30% off</p>
                <div className="bg-success/20 rounded p-2 text-xs border border-success/50">
                  <strong className="text-success">✓ Defense:</strong> Byzantine median rejects &gt;5% deviation. Outlier detection excludes corrupt sources.
                </div>
                <div className="text-xs mt-2 font-mono bg-base-200 p-1 rounded">
                  MAX_DEVIATION = 5%
                </div>
              </div>
            </div>

            {/* Condition 2: Outdated Data */}
            <div className="card bg-base-100 shadow-xl border-2 border-success">
              <div className="card-body p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="badge badge-error badge-sm">ATTACK</span>
                  <span className="text-2xl">⏰</span>
                </div>
                <h3 className="font-bold text-error">2. Outdated Data</h3>
                <p className="text-xs opacity-70 mb-2">Oracle provides stale prices</p>
                <div className="bg-success/20 rounded p-2 text-xs border border-success/50">
                  <strong className="text-success">✓ Defense:</strong> Per-oracle staleness thresholds. Chainlink: 1hr, Pyth: 60s, DIA: 2min.
                </div>
                <div className="text-xs mt-2 font-mono bg-base-200 p-1 rounded">
                  MAX_STALENESS = 60-3600s
                </div>
              </div>
            </div>

            {/* Condition 3: Missed Updates */}
            <div className="card bg-base-100 shadow-xl border-2 border-success">
              <div className="card-body p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="badge badge-error badge-sm">ATTACK</span>
                  <span className="text-2xl">🚫</span>
                </div>
                <h3 className="font-bold text-error">3. Missed Updates</h3>
                <p className="text-xs opacity-70 mb-2">Oracle fails to update entirely</p>
                <div className="bg-success/20 rounded p-2 text-xs border border-success/50">
                  <strong className="text-success">✓ Defense:</strong> Fail tracking (3 fails = disabled). Fallback cascade to backup oracles.
                </div>
                <div className="text-xs mt-2 font-mono bg-base-200 p-1 rounded">
                  MAX_FAIL_COUNT = 3
                </div>
              </div>
            </div>

            {/* Condition 4: Conflicting Values */}
            <div className="card bg-base-100 shadow-xl border-2 border-success">
              <div className="card-body p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="badge badge-error badge-sm">ATTACK</span>
                  <span className="text-2xl">🔀</span>
                </div>
                <h3 className="font-bold text-error">4. Conflicting Values</h3>
                <p className="text-xs opacity-70 mb-2">Multiple oracles disagree</p>
                <div className="bg-success/20 rounded p-2 text-xs border border-success/50">
                  <strong className="text-success">✓ Defense:</strong> Byzantine median from 5 oracles (tolerates 2 corrupt). Confidence weighting.
                </div>
                <div className="text-xs mt-2 font-mono bg-base-200 p-1 rounded">
                  BFT: 3/5 consensus
                </div>
              </div>
            </div>
          </div>

          {/* Adversarial Summary */}
          <div className="mt-8 bg-base-100 rounded-2xl p-6 max-w-4xl mx-auto shadow-xl border-2 border-success">
            <div className="flex items-center justify-center gap-3 mb-4">
              <span className="text-4xl">🛡️</span>
              <h3 className="font-bold text-xl text-success">All 4 Adversarial Conditions Defended</h3>
            </div>
            <div className="text-center text-sm opacity-80">
              Our multi-oracle BFT aggregation system handles all adversarial oracle scenarios through:
              <br/>
              <strong>Byzantine Median + Staleness Checks + Fail Tracking + Confidence Weighting</strong>
            </div>
            <div className="mt-4 flex justify-center">
              <a href="/oracle" className="btn btn-success btn-sm gap-2">
                <span>🧪</span> Run Attack Simulator
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-base-100 py-6">
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
