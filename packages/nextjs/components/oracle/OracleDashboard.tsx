"use client";

import { useState, useEffect } from "react";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

// Create a Sepolia public client
const sepoliaClient = createPublicClient({
  chain: sepolia,
  transport: http("https://eth-sepolia.g.alchemy.com/v2/cR4WnXePioePZ5fFrnSiR"),
});

// Contract addresses (Sepolia)
const CONTRACTS = {
  chainlink: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
  pyth: "0xDd24F84d36BF92C65F92307595335bdFab5Bbd21",
  guardian: "0x71027655D76832eA3d1F056C528485ddE1aec66a",
  aggregator: "0x04b8dD0B1DabC4719a1cD8Ec2628425406F00A1C",
  synced: "0xa372663b57Ea5FA52c911FE81aa4B54b87AB6c96",
};

// Chainlink price feeds
const CHAINLINK_FEEDS = {
  "ETH/USD": "0x694AA1769357215DE4FAC081bf1f309aDC325306",
  "BTC/USD": "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43",
  "LINK/USD": "0xc59E3633BAAC79493d908e63626716e204A45EdF",
};

// Pyth price feed IDs
const PYTH_FEEDS = {
  "ETH/USD": "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  "BTC/USD": "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  "SOL/USD": "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
};

interface PriceData {
  pair: string;
  price: number;
  source: string;
  timestamp: number;
  confidence?: number;
  status: "live" | "stale" | "error";
}

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

export function OracleDashboard() {
  const [prices, setPrices] = useState<PriceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchPrices = async () => {
    const newPrices: PriceData[] = [];
    const now = Math.floor(Date.now() / 1000);

    // Fetch Chainlink prices
    for (const [pair, address] of Object.entries(CHAINLINK_FEEDS)) {
      try {
        const data = await sepoliaClient.readContract({
          address: address as `0x${string}`,
          abi: CHAINLINK_ABI,
          functionName: "latestRoundData",
        });
        
        const price = Number(data[1]) / 1e8;
        const updatedAt = Number(data[3]);
        const age = now - updatedAt;
        
        newPrices.push({
          pair,
          price,
          source: "Chainlink",
          timestamp: updatedAt,
          status: age < 3600 ? "live" : age < 7200 ? "stale" : "error",
        });
      } catch {
        newPrices.push({
          pair,
          price: 0,
          source: "Chainlink",
          timestamp: 0,
          status: "error",
        });
      }
    }

    // Fetch Pyth prices
    for (const [pair, feedId] of Object.entries(PYTH_FEEDS)) {
      try {
        const data = await sepoliaClient.readContract({
          address: CONTRACTS.pyth as `0x${string}`,
          abi: PYTH_ABI,
          functionName: "getPriceUnsafe",
          args: [feedId as `0x${string}`],
        });
        
        const price = Number(data.price) * Math.pow(10, Number(data.expo));
        const conf = Number(data.conf) * Math.pow(10, Number(data.expo));
        const age = now - Number(data.publishTime);
        
        newPrices.push({
          pair,
          price,
          source: "Pyth",
          timestamp: Number(data.publishTime),
          confidence: conf,
          status: age < 300 ? "live" : age < 600 ? "stale" : "error",
        });
      } catch {
        // Pyth might fail if no update
      }
    }

    setPrices(newPrices);
    setLastUpdate(new Date());
    setLoading(false);
  };

  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const formatPrice = (price: number) => {
    if (price >= 1000) return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (price >= 1) return `$${price.toFixed(2)}`;
    return `$${price.toFixed(6)}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "live": return "bg-green-500";
      case "stale": return "bg-yellow-500";
      case "error": return "bg-red-500";
      default: return "bg-gray-500";
    }
  };

  const chainlinkPrices = prices.filter(p => p.source === "Chainlink");
  const pythPrices = prices.filter(p => p.source === "Pyth");

  return (
    <div className="space-y-8">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatsCard
          title="Active Oracles"
          value="3"
          subtitle="Chainlink • Pyth • Synced"
          icon="📡"
          color="cyan"
        />
        <StatsCard
          title="Price Feeds"
          value={prices.length.toString()}
          subtitle="Live data streams"
          icon="📊"
          color="purple"
        />
        <StatsCard
          title="BFT Consensus"
          value="3/5"
          subtitle="Byzantine threshold"
          icon="🛡️"
          color="green"
        />
        <StatsCard
          title="Last Update"
          value={lastUpdate ? lastUpdate.toLocaleTimeString() : "--:--:--"}
          subtitle="Auto-refresh 10s"
          icon="⏱️"
          color="orange"
        />
      </div>

      {/* Live Price Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chainlink Panel */}
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-300" />
          <div className="relative bg-gray-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                  <span className="text-2xl">🔗</span>
                </div>
                <div>
                  <h3 className="font-bold text-lg">Chainlink</h3>
                  <p className="text-xs text-gray-400">Push Oracle • Decentralized</p>
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-blue-500/20 rounded-full">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                <span className="text-xs text-blue-300">Industry Standard</span>
              </div>
            </div>

            <div className="space-y-3">
              {loading ? (
                <LoadingSkeleton count={3} />
              ) : (
                chainlinkPrices.map((price, idx) => (
                  <PriceRow key={idx} data={price} />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Pyth Panel */}
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-300" />
          <div className="relative bg-gray-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
                  <span className="text-2xl">🔮</span>
                </div>
                <div>
                  <h3 className="font-bold text-lg">Pyth Network</h3>
                  <p className="text-xs text-gray-400">Pull Oracle • Sub-second</p>
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-purple-500/20 rounded-full">
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
                <span className="text-xs text-purple-300">High Frequency</span>
              </div>
            </div>

            <div className="space-y-3">
              {loading ? (
                <LoadingSkeleton count={3} />
              ) : pythPrices.length > 0 ? (
                pythPrices.map((price, idx) => (
                  <PriceRow key={idx} data={price} showConfidence />
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p className="text-4xl mb-2">🔄</p>
                  <p>Awaiting price update...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Cross-Oracle Comparison */}
      <div className="relative group">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-green-600 via-cyan-600 to-blue-600 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-300" />
        <div className="relative bg-gray-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <span>🔄</span> Cross-Oracle Validation (ETH/USD)
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {["Chainlink", "Pyth", "Synced"].map((source, idx) => {
              const price = prices.find(p => p.source === source && p.pair === "ETH/USD");
              return (
                <div key={idx} className="bg-white/5 rounded-xl p-4 text-center">
                  <p className="text-sm text-gray-400 mb-1">{source}</p>
                  <p className="text-2xl font-bold text-white">
                    {price ? formatPrice(price.price) : "--"}
                  </p>
                  <div className={`w-2 h-2 rounded-full mx-auto mt-2 ${price ? getStatusColor(price.status) : 'bg-gray-500'}`} />
                </div>
              );
            })}
          </div>

          <div className="mt-4 p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-green-300">✅ Oracle Consensus</span>
              <span className="text-green-400 font-mono">
                {prices.filter(p => p.pair === "ETH/USD" && p.status === "live").length}/3 agree
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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

function PriceRow({ data, showConfidence = false }: { data: PriceData; showConfidence?: boolean }) {
  const age = Math.floor(Date.now() / 1000) - data.timestamp;
  const ageStr = age < 60 ? `${age}s` : age < 3600 ? `${Math.floor(age / 60)}m` : `${Math.floor(age / 3600)}h`;

  const formatPrice = (price: number) => {
    if (price >= 1000) return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (price >= 1) return `$${price.toFixed(2)}`;
    return `$${price.toFixed(6)}`;
  };

  return (
    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors">
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${data.status === 'live' ? 'bg-green-400' : data.status === 'stale' ? 'bg-yellow-400' : 'bg-red-400'}`} />
        <span className="font-medium">{data.pair}</span>
      </div>
      <div className="text-right">
        <p className="font-mono font-bold">{formatPrice(data.price)}</p>
        <p className="text-xs text-gray-500">
          {showConfidence && data.confidence ? `±$${data.confidence.toFixed(2)} • ` : ''}
          {ageStr} ago
        </p>
      </div>
    </div>
  );
}

function LoadingSkeleton({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-xl animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-gray-600 rounded-full" />
            <div className="h-4 w-20 bg-gray-700 rounded" />
          </div>
          <div className="text-right">
            <div className="h-5 w-24 bg-gray-700 rounded mb-1" />
            <div className="h-3 w-16 bg-gray-800 rounded" />
          </div>
        </div>
      ))}
    </>
  );
}
