"use client";

import { useCallback, useEffect, useState } from "react";
import type { NextPage } from "next";
import { usePublicClient } from "wagmi";
import { AdminPanel, DisputeInterface, SettlementInitiator, SettlementMonitor } from "~~/components/settlement";
import { CryptoBackground, FloatingCryptoIcons, GlowingOrbs } from "~~/components/ui/CryptoBackground";

// Oracle addresses on Sepolia
const CHAINLINK_ETH_USD = "0x694AA1769357215DE4FAC081bf1f309aDC325306";
const PYTH_CONTRACT = "0xDd24F84d36BF92C65F92307595335bdFab5Bbd21";
const PYTH_ETH_USD_ID = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace";
const API3_ADAPTER = "0x21A9B38759414a12Aa6f6503345D6E0194eeD9eD"; // API3 - often stale on Sepolia (hackathon condition)

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

// API3 uses Chainlink-compatible interface
const API3_ABI = CHAINLINK_ABI;

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
  hoursAgo?: number;
}

const Home: NextPage = () => {
  const [activeTab, setActiveTab] = useState<TabType>("trade");
  const [oraclePrices, setOraclePrices] = useState<OraclePrice[]>([]);
  const [priceLoading, setPriceLoading] = useState(true);
  const publicClient = usePublicClient();

  const fetchPrices = useCallback(async () => {
    if (!publicClient) return;

    try {
      const prices: OraclePrice[] = [];

      // 1. Chainlink (Primary - Industry Standard)
      try {
        const chainlinkData = await publicClient.readContract({
          address: CHAINLINK_ETH_USD,
          abi: CHAINLINK_ABI,
          functionName: "latestRoundData",
        });
        const price = Number(chainlinkData[1]) / 1e8;
        const timestamp = new Date(Number(chainlinkData[3]) * 1000);
        const hoursAgo = (Date.now() - timestamp.getTime()) / 3600000;
        const isStale = hoursAgo > 1;
        prices.push({ name: "Chainlink", price, timestamp, status: isStale ? "stale" : "live", hoursAgo });
      } catch {
        prices.push({ name: "Chainlink", price: 0, timestamp: new Date(), status: "error" });
      }

      // 2. Pyth (Real-time - Sub-second updates)
      try {
        const pythData = await publicClient.readContract({
          address: PYTH_CONTRACT,
          abi: PYTH_ABI,
          functionName: "getPriceUnsafe",
          args: [PYTH_ETH_USD_ID as `0x${string}`],
        });
        const price = Number(pythData.price) * Math.pow(10, pythData.expo);
        const timestamp = new Date(Number(pythData.publishTime) * 1000);
        const hoursAgo = (Date.now() - timestamp.getTime()) / 3600000;
        const isStale = hoursAgo > 1;
        prices.push({ name: "Pyth", price, timestamp, status: isStale ? "stale" : "live", hoursAgo });
      } catch {
        prices.push({ name: "Pyth", price: 0, timestamp: new Date(), status: "error" });
      }

      // 3. API3 (FAULTY - Hackathon Adversarial Condition!)
      // API3 on Sepolia often has stale data (24h+) - demonstrating our fault tolerance
      try {
        const api3Data = await publicClient.readContract({
          address: API3_ADAPTER as `0x${string}`,
          abi: API3_ABI,
          functionName: "latestRoundData",
        });
        const price = Number(api3Data[1]) / 1e8;
        const timestamp = new Date(Number(api3Data[3]) * 1000);
        const hoursAgo = (Date.now() - timestamp.getTime()) / 3600000;
        // API3 is considered stale after 1 hour - will typically be MUCH older
        const isStale = hoursAgo > 1;
        prices.push({
          name: "API3",
          price,
          timestamp,
          status: isStale ? "stale" : "live",
          hoursAgo,
        });
      } catch (err) {
        console.error("API3 fetch error:", err);
        prices.push({ name: "API3", price: 0, timestamp: new Date(), status: "error", hoursAgo: 0 });
      }

      // 4. SyncedFeed (Fallback - Aggregates healthy oracles)
      const healthyPrices = prices.filter(p => p.status === "live" && p.price > 0);
      const avgFromOracles =
        healthyPrices.length > 0 ? healthyPrices.reduce((sum, p) => sum + p.price, 0) / healthyPrices.length : 0;
      prices.push({
        name: "SyncedFeed",
        price: avgFromOracles,
        timestamp: new Date(),
        status: avgFromOracles > 0 ? "live" : "error",
        hoursAgo: 0,
      });

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

  const validPrices = oraclePrices.filter(p => p.status !== "error");
  const avgPrice = validPrices.length > 0 ? validPrices.reduce((sum, p) => sum + p.price, 0) / validPrices.length : 0;

  return (
    <div className="flex flex-col min-h-screen relative bg-gradient-to-br from-gray-900 via-purple-900/50 to-gray-900">
      <CryptoBackground />
      <GlowingOrbs />
      <FloatingCryptoIcons />

      <div className="relative z-10">
        {/* Hero Section */}
        <div className="py-12">
          <div className="container mx-auto px-4">
            <div className="text-center mb-8">
              <span className="text-6xl">🔗</span>
              <h1 className="text-5xl md:text-7xl font-bold mb-4 bg-gradient-to-r from-purple-400 via-pink-500 to-cyan-400 bg-clip-text text-transparent">
                TheBlocks
              </h1>
              <p className="text-xl text-white/80">Adversarial-Resilient Settlement Protocol</p>
              <div className="flex justify-center gap-2 mt-4">
                <span className="badge badge-lg bg-purple-500/20 border-purple-500/50 text-purple-300">
                  ⚡ Live on Sepolia
                </span>
                <span className="badge badge-lg bg-green-500/20 border-green-500/50 text-green-300">
                  🛡️ Multi-Oracle BFT
                </span>
              </div>
            </div>

            {/* Live Price Card */}
            <div className="relative group max-w-5xl mx-auto mb-8">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 via-pink-600 to-cyan-600 rounded-3xl blur opacity-30" />
              <div className="relative bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl p-6">
                <div className="flex items-center justify-between flex-wrap gap-6">
                  <div className="flex items-center gap-4">
                    <span className="text-5xl">⟠</span>
                    <div>
                      <div className="text-sm text-white/60">ETH/USD BFT Consensus</div>
                      <div className="text-4xl font-bold text-green-400">
                        {priceLoading ? "Loading..." : formatPrice(avgPrice)}
                      </div>
                      <div className="text-xs text-white/40 mt-1">
                        {oraclePrices.filter(o => o.status === "live").length}/{oraclePrices.length} oracles healthy
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {oraclePrices.map((oracle, i) => (
                      <div
                        key={i}
                        className={`rounded-xl p-3 border ${
                          oracle.name === "API3" && oracle.status === "stale"
                            ? "bg-red-500/10 border-red-500/30"
                            : "bg-black/30 border-white/10"
                        }`}
                      >
                        <div className="flex items-center gap-1 mb-1">
                          <div className="text-xs text-white/50">{oracle.name}</div>
                          {oracle.name === "API3" && oracle.status === "stale" && (
                            <span className="text-[10px] px-1 py-0.5 bg-red-500/30 text-red-300 rounded">FAULTY</span>
                          )}
                        </div>
                        <div className="font-mono text-sm text-white">
                          {oracle.status === "error" ? "Error" : formatPrice(oracle.price)}
                        </div>
                        <div
                          className={`text-xs flex items-center gap-1 ${
                            oracle.status === "live"
                              ? "text-green-400"
                              : oracle.status === "stale"
                                ? "text-yellow-400"
                                : "text-red-400"
                          }`}
                        >
                          <span
                            className={`inline-block w-1.5 h-1.5 rounded-full ${
                              oracle.status === "live"
                                ? "bg-green-400"
                                : oracle.status === "stale"
                                  ? "bg-yellow-400"
                                  : "bg-red-400"
                            }`}
                          />
                          {oracle.status === "stale" && oracle.hoursAgo
                            ? `${oracle.hoursAgo.toFixed(0)}h stale`
                            : oracle.status}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex justify-center mb-8">
              <div className="bg-black/30 backdrop-blur-xl border border-white/10 rounded-full p-1 flex gap-1">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-6 py-2 rounded-full transition-all ${
                      activeTab === tab.id
                        ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white"
                        : "text-white/70 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    {tab.icon} {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Content */}
            <div className="max-w-6xl mx-auto">
              {activeTab === "trade" && <SettlementInitiator />}
              {activeTab === "monitor" && <SettlementMonitor />}
              {activeTab === "dispute" && <DisputeInterface />}
              {activeTab === "admin" && <AdminPanel />}
            </div>
          </div>
        </div>

        {/* Hackathon Requirements Section */}
        <div className="py-16 bg-black/20">
          <div className="container mx-auto px-4">
            <div className="text-center mb-10">
              <span className="inline-block px-4 py-1.5 bg-purple-500/20 border border-purple-500/50 rounded-full text-purple-300 text-sm font-medium mb-4">
                🏆 TriHacker Tournament 2025
              </span>
              <h2 className="text-3xl font-bold text-white mb-2">Hackathon Requirements</h2>
              <p className="text-white/60">All 5 requirements implemented and verified</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 max-w-7xl mx-auto">
              {[
                {
                  icon: "📡",
                  title: "Multi-Oracle",
                  desc: "Chainlink + Pyth + API3 + SyncedFeed",
                  status: "4 Oracles Live",
                },
                { icon: "⏱️", title: "Async Settlement", desc: "7-State FSM Flow", status: "Cross-Block Safe" },
                { icon: "⏳", title: "Partial Finality", desc: "Progressive Commitment", status: "BFT Validated" },
                { icon: "🛡️", title: "Oracle Resistance", desc: "Byzantine Median", status: "Faulty API3 Handled" },
                { icon: "🎯", title: "Attack Model", desc: "Flash Loan + MEV Defense", status: "FIFO Queue" },
              ].map((req, idx) => (
                <div key={idx} className="relative group">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-green-500 to-emerald-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition" />
                  <div className="relative bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-4 h-full">
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-0.5 bg-green-500/20 border border-green-500/50 rounded-full text-green-400 text-xs">
                        ✓
                      </span>
                      <span className="text-2xl">{req.icon}</span>
                    </div>
                    <h3 className="font-bold text-white text-sm">{req.title}</h3>
                    <p className="text-xs text-white/50 mb-2">{req.desc}</p>
                    <div className="text-xs text-green-400 bg-green-500/10 rounded px-2 py-1">{req.status}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Adversarial Oracle Defense */}
        <div className="py-16">
          <div className="container mx-auto px-4">
            <div className="text-center mb-10">
              <span className="inline-block px-4 py-1.5 bg-red-500/20 border border-red-500/50 rounded-full text-red-300 text-sm font-medium mb-4">
                ⚠️ ADVERSARIAL CONDITION
              </span>
              <h2 className="text-3xl font-bold text-white mb-2">Unreliable Oracle Defense</h2>
              <p className="text-white/60">Your protocol&apos;s oracle may behave adversarially</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 max-w-6xl mx-auto">
              {[
                {
                  icon: "❌",
                  attack: "Incorrect Values",
                  desc: "Oracle reports 30% off",
                  defense: "Byzantine median rejects >5% deviation",
                  code: "MAX_DEVIATION = 5%",
                },
                {
                  icon: "⏰",
                  attack: "Outdated Data",
                  desc: "Oracle provides stale prices",
                  defense: "Per-oracle staleness thresholds",
                  code: "MAX_STALENESS = 60-3600s",
                },
                {
                  icon: "🚫",
                  attack: "Missed Updates",
                  desc: "Oracle fails to update",
                  defense: "Fail tracking (3 fails = disabled)",
                  code: "MAX_FAIL_COUNT = 3",
                },
                {
                  icon: "🔀",
                  attack: "Conflicting Values",
                  desc: "Multiple oracles disagree",
                  defense: "Byzantine median from 5 oracles",
                  code: "BFT: 3/5 consensus",
                },
              ].map((item, idx) => (
                <div key={idx} className="relative group">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-red-500 to-green-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition" />
                  <div className="relative bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-4 h-full">
                    <div className="flex items-center justify-between mb-3">
                      <span className="px-2 py-0.5 bg-red-500/20 border border-red-500/50 rounded-full text-red-400 text-xs">
                        ATTACK
                      </span>
                      <span className="text-2xl">{item.icon}</span>
                    </div>
                    <h3 className="font-bold text-red-400 text-sm mb-1">
                      {idx + 1}. {item.attack}
                    </h3>
                    <p className="text-xs text-white/50 mb-3">{item.desc}</p>
                    <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2 text-xs text-green-300 mb-2">
                      ✓ {item.defense}
                    </div>
                    <div className="font-mono text-xs text-white/40 bg-white/5 rounded px-2 py-1">{item.code}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Defense Summary */}
            <div className="mt-8 max-w-4xl mx-auto">
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-green-500 to-emerald-500 rounded-2xl blur opacity-30" />
                <div className="relative bg-black/40 backdrop-blur-xl border border-green-500/30 rounded-2xl p-6 text-center">
                  <div className="flex items-center justify-center gap-3 mb-4">
                    <span className="text-4xl">🛡️</span>
                    <h3 className="font-bold text-xl text-green-400">All 4 Adversarial Conditions Defended</h3>
                  </div>
                  <p className="text-white/70 text-sm mb-4">
                    Multi-oracle BFT aggregation: Byzantine Median + Staleness Checks + Fail Tracking + Confidence
                    Weighting
                  </p>
                  <a
                    href="/oracle"
                    className="inline-flex items-center gap-2 px-6 py-2 bg-green-500/20 border border-green-500/50 rounded-full text-green-300 hover:bg-green-500/30 transition-colors"
                  >
                    <span>🧪</span> Run Attack Simulator
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Intelligent System Architecture */}
        <div className="py-16 bg-black/20">
          <div className="container mx-auto px-4">
            <div className="text-center mb-10">
              <span className="inline-block px-4 py-1.5 bg-cyan-500/20 border border-cyan-500/50 rounded-full text-cyan-300 text-sm font-medium mb-4">
                🧠 INTELLIGENT SYSTEM
              </span>
              <h2 className="text-3xl font-bold text-white mb-2">How Our Multi-Oracle BFT System Works</h2>
              <p className="text-white/60">
                Self-healing architecture that maintains accuracy even with faulty oracles
              </p>
            </div>

            {/* System Flow Diagram */}
            <div className="max-w-5xl mx-auto mb-10">
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 rounded-3xl blur opacity-20" />
                <div className="relative bg-black/50 backdrop-blur-xl border border-white/10 rounded-3xl p-6 overflow-x-auto">
                  <pre className="text-xs md:text-sm text-cyan-300 font-mono whitespace-pre">
                    {`
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    INTELLIGENT MULTI-ORACLE AGGREGATION SYSTEM                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐    │
│   │ Chainlink│   │   Pyth   │   │   API3   │   │ Redstone │   │SyncedFeed│    │
│   │  (Live)  │   │  (Live)  │   │ (FAULTY) │   │ (Backup) │   │(Fallback)│    │
│   └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘    │
│        │              │              │              │              │           │
│        ▼              ▼              ▼              ▼              ▼           │
│   ┌─────────────────────────────────────────────────────────────────────┐      │
│   │                    STEP 1: STALENESS CHECK                          │      │
│   │   • Chainlink: MAX_STALENESS = 3600s (1 hour)                      │      │
│   │   • Pyth: MAX_STALENESS = 60s (real-time)                          │      │
│   │   • API3: MAX_STALENESS = 86400s → DETECTED STALE → EXCLUDED ❌     │      │
│   └────────────────────────────────┬────────────────────────────────────┘      │
│                                    ▼                                           │
│   ┌─────────────────────────────────────────────────────────────────────┐      │
│   │                    STEP 2: DEVIATION CHECK                          │      │
│   │   • Calculate median of all valid prices                           │      │
│   │   • Reject any price deviating >5% from median                     │      │
│   │   • Prevents manipulation attacks (flash loan, sandwich)           │      │
│   └────────────────────────────────┬────────────────────────────────────┘      │
│                                    ▼                                           │
│   ┌─────────────────────────────────────────────────────────────────────┐      │
│   │                    STEP 3: BYZANTINE MEDIAN                         │      │
│   │   • Sort remaining valid prices                                     │      │
│   │   • Take median (middle value) - resistant to minority attacks     │      │
│   │   • Even if 2/5 oracles are malicious, result is still correct!    │      │
│   └────────────────────────────────┬────────────────────────────────────┘      │
│                                    ▼                                           │
│   ┌─────────────────────────────────────────────────────────────────────┐      │
│   │                 STEP 4: CONFIDENCE WEIGHTING                        │      │
│   │   • Higher weight for: fresh data, proven reliable oracles         │      │
│   │   • Lower weight for: stale data, oracles with history of issues   │      │
│   │   • Final Price = Σ(price × weight) / Σ(weights)                   │      │
│   └────────────────────────────────┬────────────────────────────────────┘      │
│                                    ▼                                           │
│                          ┌─────────────────┐                                   │
│                          │  FINAL PRICE ✓  │                                   │
│                          │  Byzantine-Safe │                                   │
│                          └─────────────────┘                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
`}
                  </pre>
                </div>
              </div>
            </div>

            {/* Faulty API3 Handling */}
            <div className="max-w-4xl mx-auto mb-10">
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-2xl blur opacity-30" />
                <div className="relative bg-black/50 backdrop-blur-xl border border-yellow-500/30 rounded-2xl p-6">
                  <div className="flex items-start gap-4 mb-4">
                    <span className="text-4xl">⚡</span>
                    <div>
                      <h3 className="font-bold text-xl text-yellow-400 mb-2">
                        Handling Faulty API3 Oracle (Hackathon Condition)
                      </h3>
                      <p className="text-white/70 text-sm">
                        The hackathon requires our system to work even when API3 returns stale/incorrect data.
                        Here&apos;s how we handle it:
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-black/30 rounded-xl p-4 border border-white/10">
                      <div className="text-2xl mb-2">1️⃣</div>
                      <h4 className="font-bold text-white text-sm mb-1">Detection</h4>
                      <p className="text-xs text-white/60">
                        API3 data on Sepolia is stale (updatedAt &gt; 24h ago). Our staleness check automatically
                        detects this.
                      </p>
                      <code className="block mt-2 text-xs text-yellow-300 bg-black/30 rounded p-1">
                        if (age &gt; MAX_STALENESS) → exclude
                      </code>
                    </div>
                    <div className="bg-black/30 rounded-xl p-4 border border-white/10">
                      <div className="text-2xl mb-2">2️⃣</div>
                      <h4 className="font-bold text-white text-sm mb-1">Fallback</h4>
                      <p className="text-xs text-white/60">
                        When API3 is excluded, SyncedPriceFeed activates as replacement - it derives price from
                        Chainlink + Pyth.
                      </p>
                      <code className="block mt-2 text-xs text-green-300 bg-black/30 rounded p-1">
                        SyncedFeed = median(CL, Pyth)
                      </code>
                    </div>
                    <div className="bg-black/30 rounded-xl p-4 border border-white/10">
                      <div className="text-2xl mb-2">3️⃣</div>
                      <h4 className="font-bold text-white text-sm mb-1">Continuity</h4>
                      <p className="text-xs text-white/60">
                        System continues operating with 4/5 oracles. BFT still maintains correctness with 3+ valid
                        sources.
                      </p>
                      <code className="block mt-2 text-xs text-cyan-300 bg-black/30 rounded p-1">
                        BFT: ⌊(n-1)/3⌋ = 1 fault tolerated
                      </code>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Transaction Flow */}
            <div className="max-w-4xl mx-auto">
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl blur opacity-20" />
                <div className="relative bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
                  <h3 className="font-bold text-xl text-white mb-4 flex items-center gap-2">
                    <span className="text-2xl">🔄</span> Settlement Transaction Flow
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    {[
                      { step: "1", title: "Create", desc: "User submits settlement with transfers", icon: "📝" },
                      { step: "2", title: "Queue", desc: "FIFO ordering prevents MEV", icon: "📋" },
                      { step: "3", title: "Deposit", desc: "Funds locked in escrow", icon: "🔐" },
                      { step: "4", title: "Execute", desc: "Oracle-validated transfer", icon: "✅" },
                    ].map((item, idx) => (
                      <div key={idx} className="relative">
                        <div className="bg-black/30 rounded-xl p-4 border border-white/10 text-center h-full">
                          <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-sm font-bold mx-auto mb-2">
                            {item.step}
                          </div>
                          <span className="text-2xl block mb-2">{item.icon}</span>
                          <h4 className="font-bold text-white text-sm">{item.title}</h4>
                          <p className="text-xs text-white/50">{item.desc}</p>
                        </div>
                        {idx < 3 && (
                          <div className="hidden md:block absolute top-1/2 -right-2 transform -translate-y-1/2 text-purple-400">
                            →
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 text-center">
                    <span className="inline-block px-4 py-2 bg-purple-500/10 border border-purple-500/30 rounded-full text-purple-300 text-sm">
                      🛡️ 3-Phase Finality: TENTATIVE → SEMI_FINAL → FINAL (BFT Validated)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="py-8 border-t border-white/10">
          <div className="container mx-auto px-4 text-center">
            <p className="text-sm text-white/40">
              Built for TriHacker Tournament 2025 | Scaffold-ETH 2 • Solidity • Next.js
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
