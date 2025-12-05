"use client";

import { useState, useEffect, useCallback } from "react";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import {
  CONTRACTS,
  CHAINLINK_FEEDS,
  PYTH_FEED_IDS,
  ASSET_CATEGORIES,
  CHAINLINK_ABI,
  PYTH_ABI,
  SMART_ORACLE_SELECTOR_ABI,
  GUARDIAN_ORACLE_V2_ABI,
  API3_ADAPTER_ABI,
  type ChainlinkFeedKey,
  type PythFeedKey,
} from "~~/config/priceFeeds";

// Create Sepolia public client
const sepoliaClient = createPublicClient({
  chain: sepolia,
  transport: http("https://eth-sepolia.g.alchemy.com/v2/cR4WnXePioePZ5fFrnSiR"),
});

// ========================================
// TYPES
// ========================================
interface OracleData {
  name: string;
  type: "push" | "pull" | "first-party";
  price: number;
  timestamp: number;
  confidence?: number;
  status: "live" | "stale" | "error";
  reliability: number;
  latency: string;
  icon: string;
  color: string;
  specialty: string;
  score?: number;
}

interface SmartSelectionResult {
  selectedOracles: string[];
  scores: number[];
  aggregatedPrice: number;
  confidence: number;
  useCase: string;
}

interface GuardianStatus {
  price: number;
  twapPrice: number;
  confidence: number;
  isSecure: boolean;
  circuitBreakerTripped: boolean;
  anomalyCount: number;
  volatilityIndex: number;
}

interface MultiAssetPrice {
  symbol: string;
  chainlinkPrice?: number;
  pythPrice?: number;
  chainlinkTimestamp?: number;
  pythTimestamp?: number;
  deviation?: number;
  status: "live" | "stale" | "error";
}

// ========================================
// MAIN COMPONENT
// ========================================
export function ThreeOracleDashboard() {
  const [oracles, setOracles] = useState<OracleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [selectedUseCase, setSelectedUseCase] = useState<string>("BALANCED");
  const [smartSelection, setSmartSelection] = useState<SmartSelectionResult | null>(null);
  const [guardianStatus, setGuardianStatus] = useState<GuardianStatus | null>(null);
  const [multiAssetPrices, setMultiAssetPrices] = useState<MultiAssetPrice[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("crypto");
  const [isLive, setIsLive] = useState(true);

  // Fetch all 3 oracle prices for ETH/USD
  const fetchOraclePrices = useCallback(async () => {
    const now = Math.floor(Date.now() / 1000);
    const oracleData: OracleData[] = [];

    // 1. Chainlink ETH/USD
    try {
      const data = await sepoliaClient.readContract({
        address: CONTRACTS.chainlinkETHUSD as `0x${string}`,
        abi: CHAINLINK_ABI,
        functionName: "latestRoundData",
      });
      
      const price = Number(data[1]) / 1e8;
      const updatedAt = Number(data[3]);
      const age = now - updatedAt;
      
      oracleData.push({
        name: "Chainlink",
        type: "push",
        price,
        timestamp: updatedAt,
        status: age < 3600 ? "live" : age < 7200 ? "stale" : "error",
        reliability: 99,
        latency: "~1 block",
        icon: "🔗",
        color: "blue",
        specialty: "Industry Standard • High Reliability",
      });
    } catch {
      oracleData.push({
        name: "Chainlink",
        type: "push",
        price: 0,
        timestamp: 0,
        status: "error",
        reliability: 0,
        latency: "--",
        icon: "🔗",
        color: "blue",
        specialty: "Industry Standard",
      });
    }

    // 2. Pyth ETH/USD
    try {
      const data = await sepoliaClient.readContract({
        address: CONTRACTS.pythOracle as `0x${string}`,
        abi: PYTH_ABI,
        functionName: "getPriceUnsafe",
        args: [PYTH_FEED_IDS["ETH/USD"] as `0x${string}`],
      });
      
      const expo = Number(data.expo);
      const price = Number(data.price) * Math.pow(10, expo);
      const conf = Number(data.conf) * Math.pow(10, expo);
      const updatedAt = Number(data.publishTime);
      const age = now - updatedAt;
      
      oracleData.push({
        name: "Pyth Network",
        type: "pull",
        price,
        timestamp: updatedAt,
        confidence: conf,
        status: age < 300 ? "live" : age < 600 ? "stale" : "error",
        reliability: 97,
        latency: "~400ms",
        icon: "🔮",
        color: "purple",
        specialty: "Sub-second Updates • Trading",
      });
    } catch {
      oracleData.push({
        name: "Pyth Network",
        type: "pull",
        price: 0,
        timestamp: 0,
        status: "error",
        reliability: 0,
        latency: "--",
        icon: "🔮",
        color: "purple",
        specialty: "Sub-second Updates",
      });
    }

    // 3. API3 via our adapter
    try {
      const data = await sepoliaClient.readContract({
        address: CONTRACTS.api3Adapter as `0x${string}`,
        abi: API3_ADAPTER_ABI,
        functionName: "latestRoundData",
      });
      
      const price = Number(data[1]) / 1e8;
      const updatedAt = Number(data[3]);
      const age = now - updatedAt;
      const hoursStale = age / 3600;
      
      oracleData.push({
        name: "API3",
        type: "first-party",
        price,
        timestamp: updatedAt,
        status: age < 3600 ? "live" : age < 86400 ? "stale" : "error",
        reliability: hoursStale > 24 ? 50 : hoursStale > 1 ? 70 : 95,
        latency: "~1 block",
        icon: "🌐",
        color: "orange",
        specialty: `First-Party Data • ${hoursStale > 1 ? `${hoursStale.toFixed(1)}h stale` : "Live"}`,
      });
    } catch {
      oracleData.push({
        name: "API3",
        type: "first-party",
        price: 0,
        timestamp: 0,
        status: "error",
        reliability: 0,
        latency: "--",
        icon: "🌐",
        color: "orange",
        specialty: "First-Party Data",
      });
    }

    setOracles(oracleData);
    setLastUpdate(new Date());
    setLoading(false);
    
    // Calculate smart selection locally
    calculateSmartSelection(oracleData);
  }, []);

  // Fetch Guardian Oracle V2 status
  const fetchGuardianStatus = useCallback(async () => {
    try {
      const [securedPrice, circuitBreaker, metrics] = await Promise.all([
        sepoliaClient.readContract({
          address: CONTRACTS.guardianOracleV2 as `0x${string}`,
          abi: GUARDIAN_ORACLE_V2_ABI,
          functionName: "getSecuredPrice",
        }),
        sepoliaClient.readContract({
          address: CONTRACTS.guardianOracleV2 as `0x${string}`,
          abi: GUARDIAN_ORACLE_V2_ABI,
          functionName: "circuitBreakerTripped",
        }),
        sepoliaClient.readContract({
          address: CONTRACTS.guardianOracleV2 as `0x${string}`,
          abi: GUARDIAN_ORACLE_V2_ABI,
          functionName: "metrics",
        }),
      ]);

      setGuardianStatus({
        price: Number(securedPrice[0]) / 1e8,
        twapPrice: Number(securedPrice[1]) / 1e8,
        confidence: Number(securedPrice[2]),
        isSecure: securedPrice[3] as boolean,
        circuitBreakerTripped: circuitBreaker as boolean,
        anomalyCount: Number(metrics[4]),
        volatilityIndex: Number(metrics[3]),
      });
    } catch (e) {
      console.error("Failed to fetch guardian status:", e);
    }
  }, []);

  // Fetch multi-asset prices (comprehensive)
  const fetchMultiAssetPrices = useCallback(async () => {
    const assets = ASSET_CATEGORIES[selectedCategory as keyof typeof ASSET_CATEGORIES]?.assets || [];
    const prices: MultiAssetPrice[] = [];

    for (const symbol of assets) {
      const chainlinkAddr = CHAINLINK_FEEDS[symbol as ChainlinkFeedKey];
      const pythFeedId = PYTH_FEED_IDS[symbol as PythFeedKey];
      
      let chainlinkPrice: number | undefined;
      let chainlinkTimestamp: number | undefined;
      let pythPrice: number | undefined;
      let pythTimestamp: number | undefined;

      // Fetch Chainlink
      if (chainlinkAddr) {
        try {
          const data = await sepoliaClient.readContract({
            address: chainlinkAddr as `0x${string}`,
            abi: CHAINLINK_ABI,
            functionName: "latestRoundData",
          });
          chainlinkPrice = Number(data[1]) / 1e8;
          chainlinkTimestamp = Number(data[3]);
        } catch { /* ignore */ }
      }

      // Fetch Pyth
      if (pythFeedId) {
        try {
          const data = await sepoliaClient.readContract({
            address: CONTRACTS.pythOracle as `0x${string}`,
            abi: PYTH_ABI,
            functionName: "getPriceUnsafe",
            args: [pythFeedId as `0x${string}`],
          });
          const expo = Number(data.expo);
          pythPrice = Number(data.price) * Math.pow(10, expo);
          pythTimestamp = Number(data.publishTime);
        } catch { /* ignore */ }
      }

      // Calculate deviation
      let deviation: number | undefined;
      if (chainlinkPrice && pythPrice) {
        const avg = (chainlinkPrice + pythPrice) / 2;
        deviation = Math.abs(chainlinkPrice - pythPrice) / avg * 100;
      }

      const now = Math.floor(Date.now() / 1000);
      const hasLiveData = 
        (chainlinkTimestamp && now - chainlinkTimestamp < 3600) ||
        (pythTimestamp && now - pythTimestamp < 600);

      prices.push({
        symbol,
        chainlinkPrice,
        pythPrice,
        chainlinkTimestamp,
        pythTimestamp,
        deviation,
        status: hasLiveData ? "live" : chainlinkPrice || pythPrice ? "stale" : "error",
      });
    }

    setMultiAssetPrices(prices);
  }, [selectedCategory]);

  // Calculate smart selection based on use case
  const calculateSmartSelection = (oracleData: OracleData[]) => {
    const liveOracles = oracleData.filter(o => o.status !== "error" && o.price > 0);
    
    if (liveOracles.length < 2) {
      setSmartSelection(null);
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    
    // Score oracles
    const scored = liveOracles.map(oracle => {
      let score = 0;
      
      // Freshness (0-25)
      const age = now - oracle.timestamp;
      score += Math.max(0, 25 - age / 60);
      
      // Reliability (0-25)
      score += oracle.reliability * 0.25;
      
      // Consensus (0-25) - how close to median
      const prices = liveOracles.map(o => o.price);
      const median = prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)];
      const deviation = Math.abs(oracle.price - median) / median * 100;
      score += Math.max(0, 25 - deviation * 10);
      
      // Specialization (0-25)
      switch (selectedUseCase) {
        case "SETTLEMENT":
          if (oracle.type === "push") score += 25;
          else score += 10;
          break;
        case "TRADING":
          if (oracle.type === "pull") score += 25;
          else if (oracle.type === "push") score += 15;
          else score += 5;
          break;
        case "SECURITY":
          if (oracle.type === "push") score += 20;
          else score += 15;
          break;
        default: // BALANCED
          score += 15;
      }
      
      return { oracle, score: Math.round(score) };
    });

    scored.sort((a, b) => b.score - a.score);
    const selected = scored.slice(0, 3);
    
    // BFT median price
    const prices = selected.map(s => s.oracle.price).sort((a, b) => a - b);
    const medianPrice = prices[Math.floor(prices.length / 2)];
    
    // Confidence
    const maxDeviation = Math.max(...prices.map(p => Math.abs(p - medianPrice) / medianPrice * 100));
    const confidence = Math.max(0, Math.min(100, 100 - maxDeviation * 5));
    
    setSmartSelection({
      selectedOracles: selected.map(s => s.oracle.name),
      scores: selected.map(s => s.score),
      aggregatedPrice: medianPrice,
      confidence: Math.round(confidence),
      useCase: selectedUseCase,
    });
  };

  // Effects
  useEffect(() => {
    fetchOraclePrices();
    fetchGuardianStatus();
    const interval = setInterval(() => {
      if (isLive) {
        fetchOraclePrices();
        fetchGuardianStatus();
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchOraclePrices, fetchGuardianStatus, isLive]);

  useEffect(() => {
    fetchMultiAssetPrices();
  }, [selectedCategory, fetchMultiAssetPrices]);

  useEffect(() => {
    if (oracles.length > 0) {
      calculateSmartSelection(oracles);
    }
  }, [selectedUseCase, oracles]);

  const formatPrice = (price: number | undefined) => {
    if (!price || price === 0) return "--";
    if (price >= 1000) return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (price >= 1) return `$${price.toFixed(2)}`;
    if (price >= 0.0001) return `$${price.toFixed(6)}`;
    return `$${price.toExponential(4)}`;
  };

  const liveCount = oracles.filter(o => o.status === "live").length;

  return (
    <div className="space-y-8">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatsCard
          title="Active Oracles"
          value={`${liveCount}/3`}
          subtitle="Chainlink • Pyth • API3"
          icon="📡"
          color="cyan"
        />
        <StatsCard
          title="Smart Selection"
          value={selectedUseCase}
          subtitle="AI-powered oracle ranking"
          icon="🧠"
          color="purple"
        />
        <StatsCard
          title="Guardian Security"
          value={guardianStatus?.isSecure ? "SECURE" : "CHECK"}
          subtitle={`Confidence: ${guardianStatus?.confidence || "--"}%`}
          icon="🛡️"
          color="green"
        />
        <StatsCard
          title="BFT Price"
          value={smartSelection ? formatPrice(smartSelection.aggregatedPrice) : "--"}
          subtitle={`${smartSelection?.confidence || "--"}% consensus`}
          icon="💰"
          color="orange"
        />
      </div>

      {/* Live Toggle */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <span>🔴</span> Live Oracle Feed
        </h2>
        <button
          onClick={() => setIsLive(!isLive)}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            isLive 
              ? "bg-green-500/20 text-green-300 border border-green-500/30" 
              : "bg-gray-500/20 text-gray-300 border border-gray-500/30"
          }`}
        >
          {isLive ? "🟢 LIVE" : "⏸️ PAUSED"}
        </button>
      </div>

      {/* Use Case Selector */}
      <div className="relative group">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-600 via-purple-600 to-pink-600 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-300" />
        <div className="relative bg-gray-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <span>🧠</span> Smart Oracle Selection Mode (3-Oracle BFT)
          </h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { id: "SETTLEMENT", label: "Settlement", icon: "⚖️", desc: "Chainlink Priority" },
              { id: "TRADING", label: "Trading", icon: "📈", desc: "Pyth Priority" },
              { id: "SECURITY", label: "Security", icon: "🔒", desc: "Cross-validation" },
              { id: "BALANCED", label: "Balanced", icon: "⚡", desc: "All Factors Equal" },
            ].map(useCase => (
              <button
                key={useCase.id}
                onClick={() => setSelectedUseCase(useCase.id)}
                className={`p-4 rounded-xl text-left transition-all ${
                  selectedUseCase === useCase.id
                    ? "bg-gradient-to-br from-cyan-500/30 to-purple-500/30 border-2 border-cyan-500/50"
                    : "bg-white/5 border border-white/10 hover:bg-white/10"
                }`}
              >
                <span className="text-2xl">{useCase.icon}</span>
                <p className="font-semibold mt-2">{useCase.label}</p>
                <p className="text-xs text-gray-400">{useCase.desc}</p>
              </button>
            ))}
          </div>

          {/* Smart Selection Result */}
          {smartSelection && (
            <div className="mt-6 p-4 bg-gradient-to-r from-green-500/10 to-cyan-500/10 border border-green-500/30 rounded-xl">
              <div className="flex items-center justify-between mb-3">
                <span className="text-green-300 font-semibold">✨ BFT Consensus Price</span>
                <span className="text-2xl font-bold text-white">{formatPrice(smartSelection.aggregatedPrice)}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {smartSelection.selectedOracles.map((name, idx) => (
                  <span key={idx} className="px-3 py-1 bg-white/10 rounded-full text-sm flex items-center gap-2">
                    {oracles.find(o => o.name === name)?.icon} {name}
                    <span className="text-xs text-gray-400">({smartSelection.scores[idx]})</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Three Oracle Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <OracleCardSkeleton key={i} />)
        ) : (
          oracles.map((oracle, idx) => (
            <OracleCard 
              key={idx} 
              oracle={oracle} 
              isSelected={smartSelection?.selectedOracles.includes(oracle.name)}
              rank={smartSelection?.selectedOracles.indexOf(oracle.name)}
              score={smartSelection?.scores[smartSelection.selectedOracles.indexOf(oracle.name)]}
            />
          ))
        )}
      </div>

      {/* Guardian Oracle Security Panel */}
      {guardianStatus && (
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-300" />
          <div className="relative bg-gray-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <span>🛡️</span> Guardian Oracle V2 - AI Security Layer
            </h3>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white/5 rounded-xl p-4">
                <p className="text-gray-400 text-sm">Current Price</p>
                <p className="text-xl font-bold">{formatPrice(guardianStatus.price)}</p>
              </div>
              <div className="bg-white/5 rounded-xl p-4">
                <p className="text-gray-400 text-sm">TWAP Price</p>
                <p className="text-xl font-bold">{formatPrice(guardianStatus.twapPrice)}</p>
              </div>
              <div className="bg-white/5 rounded-xl p-4">
                <p className="text-gray-400 text-sm">Confidence</p>
                <p className="text-xl font-bold">{guardianStatus.confidence}%</p>
              </div>
              <div className="bg-white/5 rounded-xl p-4">
                <p className="text-gray-400 text-sm">Status</p>
                <p className={`text-xl font-bold ${guardianStatus.isSecure ? "text-green-400" : "text-red-400"}`}>
                  {guardianStatus.isSecure ? "🟢 SECURE" : "🔴 ALERT"}
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-4">
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-xs text-gray-500">Circuit Breaker</p>
                <p className={guardianStatus.circuitBreakerTripped ? "text-red-400" : "text-green-400"}>
                  {guardianStatus.circuitBreakerTripped ? "⚠️ TRIPPED" : "✅ OK"}
                </p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-xs text-gray-500">Anomaly Count</p>
                <p>{guardianStatus.anomalyCount}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-xs text-gray-500">Volatility Index</p>
                <p>{guardianStatus.volatilityIndex}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Multi-Asset Price Explorer */}
      <div className="relative group">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-600 via-orange-600 to-red-600 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-300" />
        <div className="relative bg-gray-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <span>📊</span> Multi-Asset Price Explorer
          </h3>

          {/* Category Tabs */}
          <div className="flex flex-wrap gap-2 mb-6">
            {Object.entries(ASSET_CATEGORIES).map(([key, cat]) => (
              <button
                key={key}
                onClick={() => setSelectedCategory(key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  selectedCategory === key
                    ? "bg-gradient-to-r from-amber-500/30 to-orange-500/30 border border-amber-500/50"
                    : "bg-white/5 border border-white/10 hover:bg-white/10"
                }`}
              >
                {cat.icon} {cat.label}
              </button>
            ))}
          </div>

          {/* Price Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Asset</th>
                  <th className="text-right py-3 px-4 text-gray-400 font-medium">Chainlink</th>
                  <th className="text-right py-3 px-4 text-gray-400 font-medium">Pyth</th>
                  <th className="text-right py-3 px-4 text-gray-400 font-medium">Deviation</th>
                  <th className="text-right py-3 px-4 text-gray-400 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {multiAssetPrices.map((asset, idx) => (
                  <tr key={idx} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-3 px-4 font-medium">{asset.symbol}</td>
                    <td className="text-right py-3 px-4 font-mono text-blue-300">
                      {formatPrice(asset.chainlinkPrice)}
                    </td>
                    <td className="text-right py-3 px-4 font-mono text-purple-300">
                      {formatPrice(asset.pythPrice)}
                    </td>
                    <td className={`text-right py-3 px-4 font-mono ${
                      !asset.deviation ? "text-gray-500" :
                      asset.deviation < 0.1 ? "text-green-400" :
                      asset.deviation < 0.5 ? "text-yellow-400" : "text-red-400"
                    }`}>
                      {asset.deviation ? `${asset.deviation.toFixed(3)}%` : "--"}
                    </td>
                    <td className="text-right py-3 px-4">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        asset.status === "live" ? "bg-green-500/20 text-green-300" :
                        asset.status === "stale" ? "bg-yellow-500/20 text-yellow-300" :
                        "bg-red-500/20 text-red-300"
                      }`}>
                        {asset.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-500 mt-4">
            📡 {Object.keys(CHAINLINK_FEEDS).length} Chainlink feeds • 
            🔮 {Object.keys(PYTH_FEED_IDS).length} Pyth feeds available
          </p>
        </div>
      </div>

      {/* Deployed Contracts */}
      <div className="relative group">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-300" />
        <div className="relative bg-gray-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <span>📜</span> Deployed Contracts (Sepolia)
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(CONTRACTS).map(([name, addr]) => (
              <div key={name} className="bg-white/5 rounded-lg p-3 flex items-center justify-between">
                <span className="text-gray-300 capitalize">{name.replace(/([A-Z])/g, ' $1')}</span>
                <a 
                  href={`https://sepolia.etherscan.io/address/${addr}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:text-cyan-300 text-sm font-mono"
                >
                  {addr.slice(0, 6)}...{addr.slice(-4)} ↗
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ========================================
// SUB-COMPONENTS
// ========================================

function StatsCard({ title, value, subtitle, icon, color }: {
  title: string;
  value: string;
  subtitle: string;
  icon: string;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    cyan: "from-cyan-500/20 to-blue-500/20 border-cyan-500/30",
    purple: "from-purple-500/20 to-pink-500/20 border-purple-500/30",
    green: "from-green-500/20 to-emerald-500/20 border-green-500/30",
    orange: "from-orange-500/20 to-yellow-500/20 border-orange-500/30",
  };

  return (
    <div className={`bg-gradient-to-br ${colorClasses[color]} border rounded-2xl p-5 backdrop-blur-xl`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-gray-400 text-sm">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
        </div>
        <span className="text-3xl">{icon}</span>
      </div>
    </div>
  );
}

function OracleCard({ oracle, isSelected, rank, score }: { 
  oracle: OracleData; 
  isSelected?: boolean;
  rank?: number;
  score?: number;
}) {
  const colorClasses: Record<string, { bg: string; border: string; glow: string }> = {
    blue: { bg: "from-blue-500/20 to-cyan-500/20", border: "border-blue-500/30", glow: "from-blue-600 to-cyan-600" },
    purple: { bg: "from-purple-500/20 to-pink-500/20", border: "border-purple-500/30", glow: "from-purple-600 to-pink-600" },
    orange: { bg: "from-orange-500/20 to-amber-500/20", border: "border-orange-500/30", glow: "from-orange-600 to-amber-600" },
  };

  const colors = colorClasses[oracle.color] || colorClasses.blue;
  const age = Math.floor(Date.now() / 1000) - oracle.timestamp;
  const ageStr = age < 60 ? `${age}s` : age < 3600 ? `${Math.floor(age / 60)}m` : `${(age / 3600).toFixed(1)}h`;

  const formatPrice = (price: number) => {
    if (price === 0) return "--";
    return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="relative group">
      <div className={`absolute -inset-0.5 bg-gradient-to-r ${colors.glow} rounded-2xl blur ${isSelected ? 'opacity-60' : 'opacity-30'} group-hover:opacity-50 transition duration-300`} />
      <div className={`relative bg-gradient-to-br ${colors.bg} ${colors.border} border rounded-2xl p-5 backdrop-blur-xl ${isSelected ? 'ring-2 ring-green-500/50' : ''}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center">
              <span className="text-2xl">{oracle.icon}</span>
            </div>
            <div>
              <h3 className="font-bold text-lg">{oracle.name}</h3>
              <p className="text-xs text-gray-400">{oracle.specialty}</p>
            </div>
          </div>
          {isSelected && rank !== undefined && (
            <div className="flex flex-col items-end">
              <span className="px-2 py-1 bg-green-500/20 text-green-300 rounded-full text-xs">
                #{rank + 1} Selected
              </span>
              {score && <span className="text-xs text-gray-400 mt-1">Score: {score}</span>}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">ETH/USD</span>
            <span className="text-2xl font-bold">{formatPrice(oracle.price)}</span>
          </div>
          
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-white/5 rounded-lg p-2">
              <p className="text-gray-500 text-xs">Reliability</p>
              <p className="font-semibold">{oracle.reliability}%</p>
            </div>
            <div className="bg-white/5 rounded-lg p-2">
              <p className="text-gray-500 text-xs">Latency</p>
              <p className="font-semibold">{oracle.latency}</p>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className={`px-2 py-1 rounded-full text-xs ${
              oracle.status === "live" ? "bg-green-500/20 text-green-300" :
              oracle.status === "stale" ? "bg-yellow-500/20 text-yellow-300" :
              "bg-red-500/20 text-red-300"
            }`}>
              {oracle.status === "live" ? "🟢 LIVE" : oracle.status === "stale" ? "🟡 STALE" : "🔴 ERROR"}
            </span>
            <span className="text-gray-400">
              {oracle.status !== "error" ? `${ageStr} ago` : "--"}
            </span>
          </div>

          {oracle.confidence !== undefined && oracle.confidence > 0 && (
            <div className="text-xs text-gray-400">
              ±${oracle.confidence.toFixed(2)} confidence interval
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OracleCardSkeleton() {
  return (
    <div className="bg-gray-800/50 rounded-2xl p-5 animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 bg-gray-700 rounded-xl" />
        <div>
          <div className="h-5 w-32 bg-gray-700 rounded mb-2" />
          <div className="h-3 w-24 bg-gray-700 rounded" />
        </div>
      </div>
      <div className="space-y-3">
        <div className="h-8 w-full bg-gray-700 rounded" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-12 bg-gray-700 rounded-lg" />
          <div className="h-12 bg-gray-700 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
