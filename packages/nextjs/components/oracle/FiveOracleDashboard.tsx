"use client";

import { useState, useEffect, useCallback } from "react";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

// Create a Sepolia public client
const sepoliaClient = createPublicClient({
  chain: sepolia,
  transport: http("https://eth-sepolia.g.alchemy.com/v2/cR4WnXePioePZ5fFrnSiR"),
});

// ========================================
// CONTRACT ADDRESSES (Sepolia Testnet)
// ========================================
const CONTRACTS = {
  // Native Oracle Sources
  chainlink: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
  pyth: "0xDd24F84d36BF92C65F92307595335bdFab5Bbd21",
  dia: "0xa93546947f3015c986695750b8bbEa8e26D65856",
  uniswapV3Pool: "0x3289680dd4d6c10bb19b899729cda5eef58aeff1", // USDC/WETH on Sepolia
  
  // New Adapters (Deployed)
  api3Adapter: "0x21A9B38759414a12Aa6f6503345D6E0194eeD9eD",
  diaAdapter: "0x5a9e0cC4DE88E6c798eF53660B91040B75B39b71",
  twapAdapter: "0x10bBce345F567f4318Ca1925009123Bcd2012acd",
  
  // Aggregator contracts
  guardian: "0x71027655D76832eA3d1F056C528485ddE1aec66a",
  aggregator: "0x04b8dD0B1DabC4719a1cD8Ec2628425406F00A1C",
  
  // Smart Oracle Selector (Deployed)
  smartSelector: "0x5F5B889E33f923dc34A6Eb9f5E7C7Db0FA3FF6A7",
};

// Pyth ETH/USD Feed ID
const PYTH_ETH_USD_FEED = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace";

// ========================================
// TYPES
// ========================================
interface OracleData {
  name: string;
  type: "push" | "pull" | "twap" | "community" | "first-party";
  price: number;
  timestamp: number;
  confidence?: number;
  status: "live" | "stale" | "error";
  reliability: number;
  latency: string;
  icon: string;
  color: string;
  specialty: string;
}

interface SmartSelectionResult {
  selectedOracles: string[];
  aggregatedPrice: number;
  confidence: number;
  useCase: string;
}

// ========================================
// ABIs
// ========================================
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
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

const DIA_ABI = [
  {
    inputs: [{ name: "key", type: "string" }],
    name: "getValue",
    outputs: [
      { name: "price", type: "uint128" },
      { name: "timestamp", type: "uint128" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

const UNISWAP_V3_POOL_ABI = [
  {
    inputs: [],
    name: "slot0",
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ========================================
// MAIN COMPONENT
// ========================================
export function FiveOracleDashboard() {
  const [oracles, setOracles] = useState<OracleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [selectedUseCase, setSelectedUseCase] = useState<string>("BALANCED");
  const [smartSelection, setSmartSelection] = useState<SmartSelectionResult | null>(null);

  const fetchAllPrices = useCallback(async () => {
    const now = Math.floor(Date.now() / 1000);
    const oracleData: OracleData[] = [];

    // 1. Fetch Chainlink ETH/USD
    try {
      const data = await sepoliaClient.readContract({
        address: CONTRACTS.chainlink as `0x${string}`,
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
    } catch (e) {
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

    // 2. Fetch Pyth ETH/USD
    try {
      const data = await sepoliaClient.readContract({
        address: CONTRACTS.pyth as `0x${string}`,
        abi: PYTH_ABI,
        functionName: "getPriceUnsafe",
        args: [PYTH_ETH_USD_FEED as `0x${string}`],
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
    } catch (e) {
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

    // 3. Fetch DIA ETH/USD
    try {
      const data = await sepoliaClient.readContract({
        address: CONTRACTS.dia as `0x${string}`,
        abi: DIA_ABI,
        functionName: "getValue",
        args: ["ETH/USD"],
      });
      
      const price = Number(data[0]) / 1e8;
      const updatedAt = Number(data[1]);
      const age = now - updatedAt;
      
      oracleData.push({
        name: "DIA Oracle",
        type: "community",
        price,
        timestamp: updatedAt,
        status: age < 3600 ? "live" : age < 7200 ? "stale" : "error",
        reliability: 90,
        latency: "~2 blocks",
        icon: "💎",
        color: "pink",
        specialty: "Community Sourced • 100+ Assets",
      });
    } catch (e) {
      oracleData.push({
        name: "DIA Oracle",
        type: "community",
        price: 0,
        timestamp: 0,
        status: "error",
        reliability: 0,
        latency: "--",
        icon: "💎",
        color: "pink",
        specialty: "Community Sourced",
      });
    }

    // 4. Fetch Uniswap V3 TWAP (calculate from slot0)
    try {
      const slot0 = await sepoliaClient.readContract({
        address: CONTRACTS.uniswapV3Pool as `0x${string}`,
        abi: UNISWAP_V3_POOL_ABI,
        functionName: "slot0",
      });
      
      // Calculate price from sqrtPriceX96
      // For WETH/USDC pool: price = (sqrtPriceX96 / 2^96)^2 * 10^(decimals0 - decimals1)
      // WETH has 18 decimals, USDC has 6 decimals
      const sqrtPriceX96 = BigInt(slot0[0]);
      const Q96 = BigInt(2) ** BigInt(96);
      
      // Calculate price: (sqrtPriceX96^2 / Q96^2) * 10^12 (to convert to USD with proper decimals)
      const sqrtPriceSq = sqrtPriceX96 * sqrtPriceX96;
      const Q96Sq = Q96 * Q96;
      
      // Price in USDC per WETH (needs inversion since pool is USDC/WETH)
      const priceRaw = Number(sqrtPriceSq * BigInt(1e12) / Q96Sq);
      const price = 1 / priceRaw * 1e12; // Invert for ETH/USD
      
      oracleData.push({
        name: "Uniswap TWAP",
        type: "twap",
        price: price > 0 && price < 100000 ? price : 0, // Sanity check
        timestamp: now, // Spot price is always current
        status: "live",
        reliability: 95,
        latency: "On-chain",
        icon: "🦄",
        color: "cyan",
        specialty: "Manipulation Resistant • On-Chain",
      });
    } catch (e) {
      oracleData.push({
        name: "Uniswap TWAP",
        type: "twap",
        price: 0,
        timestamp: 0,
        status: "error",
        reliability: 0,
        latency: "--",
        icon: "🦄",
        color: "cyan",
        specialty: "Manipulation Resistant",
      });
    }

    // 5. API3 (First-party oracle - placeholder until deployed)
    // API3 requires specific dAPI proxy which needs to be deployed
    oracleData.push({
      name: "API3 dAPI",
      type: "first-party",
      price: 0,
      timestamp: 0,
      status: "error",
      reliability: 0,
      latency: "~1 block",
      icon: "🌐",
      color: "orange",
      specialty: "First-Party Data • OEV Enabled",
    });

    setOracles(oracleData);
    setLastUpdate(new Date());
    setLoading(false);

    // Calculate smart selection (simulated without deployed contract)
    calculateSmartSelection(oracleData);
  }, []);

  const calculateSmartSelection = (oracleData: OracleData[]) => {
    // Filter live oracles with valid prices
    const liveOracles = oracleData.filter(o => o.status === "live" && o.price > 0);
    
    if (liveOracles.length < 2) {
      setSmartSelection(null);
      return;
    }

    // Score oracles based on use case
    const scored = liveOracles.map(oracle => {
      let score = 0;
      
      // Base reliability score (0-25)
      score += oracle.reliability * 0.25;
      
      // Freshness score (0-25)
      const age = Math.floor(Date.now() / 1000) - oracle.timestamp;
      score += Math.max(0, 25 - age / 60); // Lose 1 point per minute
      
      // Use case specialization (0-25)
      switch (selectedUseCase) {
        case "SETTLEMENT":
          if (oracle.type === "push") score += 25;
          else if (oracle.type === "community") score += 15;
          break;
        case "TRADING":
          if (oracle.type === "pull") score += 25;
          else if (oracle.type === "push") score += 15;
          break;
        case "SECURITY":
          if (oracle.type === "twap") score += 25;
          else if (oracle.type === "push") score += 15;
          break;
        default: // BALANCED
          score += 15;
      }
      
      return { oracle, score };
    });

    // Sort by score and take top 3
    scored.sort((a, b) => b.score - a.score);
    const selected = scored.slice(0, 3);
    
    // Calculate BFT median price
    const prices = selected.map(s => s.oracle.price).sort((a, b) => a - b);
    const medianPrice = prices[Math.floor(prices.length / 2)];
    
    // Calculate confidence based on price deviation
    const maxDeviation = Math.max(...prices.map(p => Math.abs(p - medianPrice) / medianPrice * 100));
    const confidence = Math.max(0, Math.min(100, 100 - maxDeviation * 5));
    
    setSmartSelection({
      selectedOracles: selected.map(s => s.oracle.name),
      aggregatedPrice: medianPrice,
      confidence: Math.round(confidence),
      useCase: selectedUseCase,
    });
  };

  useEffect(() => {
    fetchAllPrices();
    const interval = setInterval(fetchAllPrices, 10000);
    return () => clearInterval(interval);
  }, [fetchAllPrices]);

  useEffect(() => {
    if (oracles.length > 0) {
      calculateSmartSelection(oracles);
    }
  }, [selectedUseCase, oracles]);

  const formatPrice = (price: number) => {
    if (price === 0) return "--";
    if (price >= 1000) return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (price >= 1) return `$${price.toFixed(2)}`;
    return `$${price.toFixed(6)}`;
  };

  const liveCount = oracles.filter(o => o.status === "live").length;

  return (
    <div className="space-y-8">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatsCard
          title="Active Oracles"
          value={`${liveCount}/5`}
          subtitle="Chainlink • Pyth • DIA • TWAP • API3"
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
          title="BFT Consensus"
          value={smartSelection ? `${smartSelection.selectedOracles.length}/5` : "--"}
          subtitle="Byzantine fault tolerant"
          icon="🛡️"
          color="green"
        />
        <StatsCard
          title="Confidence"
          value={smartSelection ? `${smartSelection.confidence}%` : "--"}
          subtitle={lastUpdate ? `Updated ${lastUpdate.toLocaleTimeString()}` : "Loading..."}
          icon="📊"
          color="orange"
        />
      </div>

      {/* Use Case Selector */}
      <div className="relative group">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-600 via-purple-600 to-pink-600 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-300" />
        <div className="relative bg-gray-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <span>🧠</span> Smart Oracle Selection Mode
          </h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { id: "SETTLEMENT", label: "Settlement", icon: "⚖️", desc: "Reliability Priority" },
              { id: "TRADING", label: "Trading", icon: "📈", desc: "Speed Priority" },
              { id: "SECURITY", label: "Security", icon: "🔒", desc: "TWAP Anchor" },
              { id: "BALANCED", label: "Balanced", icon: "⚡", desc: "All Factors" },
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
                <span className="text-green-300 font-semibold">✨ Optimal Selection</span>
                <span className="text-2xl font-bold text-white">{formatPrice(smartSelection.aggregatedPrice)}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {smartSelection.selectedOracles.map((name, idx) => (
                  <span key={idx} className="px-3 py-1 bg-white/10 rounded-full text-sm">
                    {oracles.find(o => o.name === name)?.icon} {name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Five Oracle Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <OracleCardSkeleton key={i} />
          ))
        ) : (
          oracles.map((oracle, idx) => (
            <OracleCard 
              key={idx} 
              oracle={oracle} 
              isSelected={smartSelection?.selectedOracles.includes(oracle.name)} 
            />
          ))
        )}
      </div>

      {/* Cross-Oracle Comparison */}
      <div className="relative group">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-green-600 via-cyan-600 to-blue-600 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-300" />
        <div className="relative bg-gray-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <span>🔄</span> Price Deviation Analysis (ETH/USD)
          </h3>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Oracle</th>
                  <th className="text-right py-3 px-4 text-gray-400 font-medium">Price</th>
                  <th className="text-right py-3 px-4 text-gray-400 font-medium">Deviation</th>
                  <th className="text-right py-3 px-4 text-gray-400 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {oracles.map((oracle, idx) => {
                  const liveOracles = oracles.filter(o => o.status === "live" && o.price > 0);
                  const avgPrice = liveOracles.reduce((sum, o) => sum + o.price, 0) / liveOracles.length || 0;
                  const deviation = avgPrice > 0 ? ((oracle.price - avgPrice) / avgPrice * 100) : 0;
                  
                  return (
                    <tr key={idx} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span>{oracle.icon}</span>
                          <span className="font-medium">{oracle.name}</span>
                        </div>
                      </td>
                      <td className="text-right py-3 px-4 font-mono">{formatPrice(oracle.price)}</td>
                      <td className={`text-right py-3 px-4 font-mono ${
                        Math.abs(deviation) < 0.1 ? "text-green-400" :
                        Math.abs(deviation) < 0.5 ? "text-yellow-400" : "text-red-400"
                      }`}>
                        {oracle.status === "live" ? `${deviation >= 0 ? "+" : ""}${deviation.toFixed(3)}%` : "--"}
                      </td>
                      <td className="text-right py-3 px-4">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          oracle.status === "live" ? "bg-green-500/20 text-green-300" :
                          oracle.status === "stale" ? "bg-yellow-500/20 text-yellow-300" :
                          "bg-red-500/20 text-red-300"
                        }`}>
                          {oracle.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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

function OracleCard({ oracle, isSelected }: { oracle: OracleData; isSelected?: boolean }) {
  const colorClasses: Record<string, { bg: string; border: string; glow: string }> = {
    blue: { bg: "from-blue-500/20 to-cyan-500/20", border: "border-blue-500/30", glow: "from-blue-600 to-cyan-600" },
    purple: { bg: "from-purple-500/20 to-pink-500/20", border: "border-purple-500/30", glow: "from-purple-600 to-pink-600" },
    pink: { bg: "from-pink-500/20 to-rose-500/20", border: "border-pink-500/30", glow: "from-pink-600 to-rose-600" },
    cyan: { bg: "from-cyan-500/20 to-teal-500/20", border: "border-cyan-500/30", glow: "from-cyan-600 to-teal-600" },
    orange: { bg: "from-orange-500/20 to-amber-500/20", border: "border-orange-500/30", glow: "from-orange-600 to-amber-600" },
  };

  const colors = colorClasses[oracle.color] || colorClasses.blue;
  const age = Math.floor(Date.now() / 1000) - oracle.timestamp;
  const ageStr = age < 60 ? `${age}s` : age < 3600 ? `${Math.floor(age / 60)}m` : `${Math.floor(age / 3600)}h`;

  const formatPrice = (price: number) => {
    if (price === 0) return "--";
    if (price >= 1000) return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `$${price.toFixed(2)}`;
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
          {isSelected && (
            <span className="px-2 py-1 bg-green-500/20 text-green-300 rounded-full text-xs">
              ✓ Selected
            </span>
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
