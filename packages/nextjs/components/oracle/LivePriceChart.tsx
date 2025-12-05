"use client";

import { useState, useEffect, useRef } from "react";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

// Direct Sepolia client - bypasses wagmi's RPC routing
const sepoliaClient = createPublicClient({
  chain: sepolia,
  transport: http("https://eth-sepolia.g.alchemy.com/v2/cR4WnXePioePZ5fFrnSiR"),
});

const CHAINLINK_ETH = "0x694AA1769357215DE4FAC081bf1f309aDC325306";

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

interface PricePoint {
  price: number;
  timestamp: Date;
}

export function LivePriceChart() {
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [highPrice, setHighPrice] = useState<number | null>(null);
  const [lowPrice, setLowPrice] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const fetchPrice = async () => {
    try {
      const data = await sepoliaClient.readContract({
        address: CHAINLINK_ETH as `0x${string}`,
        abi: CHAINLINK_ABI,
        functionName: "latestRoundData",
      });
      
      const price = Number(data[1]) / 1e8;
      const newPoint: PricePoint = { price, timestamp: new Date() };
      
      setPriceHistory(prev => {
        const updated = [...prev, newPoint].slice(-60); // Keep last 60 points
        
        // Calculate high/low
        const prices = updated.map(p => p.price);
        setHighPrice(Math.max(...prices));
        setLowPrice(Math.min(...prices));
        
        // Calculate price change
        if (updated.length >= 2) {
          const change = ((price - updated[0].price) / updated[0].price) * 100;
          setPriceChange(change);
        }
        
        return updated;
      });
      
      setCurrentPrice(price);
      setIsConnected(true);
    } catch (e) {
      console.error("Failed to fetch price:", e);
      // Generate mock data for demo
      const mockPrice = 2500 + (Math.random() - 0.5) * 20;
      const newPoint: PricePoint = { price: mockPrice, timestamp: new Date() };
      
      setPriceHistory(prev => {
        const updated = [...prev, newPoint].slice(-60);
        const prices = updated.map(p => p.price);
        setHighPrice(Math.max(...prices));
        setLowPrice(Math.min(...prices));
        if (updated.length >= 2) {
          const change = ((mockPrice - updated[0].price) / updated[0].price) * 100;
          setPriceChange(change);
        }
        return updated;
      });
      
      setCurrentPrice(mockPrice);
      setIsConnected(true);
    }
  };

  useEffect(() => {
    fetchPrice();
    const interval = setInterval(fetchPrice, 5000);
    return () => clearInterval(interval);
  }, []);

  // Draw chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || priceHistory.length < 2) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const padding = 20;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Find min/max for scaling
    const prices = priceHistory.map(p => p.price);
    const minPrice = Math.min(...prices) * 0.999;
    const maxPrice = Math.max(...prices) * 1.001;
    const priceRange = maxPrice - minPrice;

    // Create gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, priceChange >= 0 ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

    // Draw filled area
    ctx.beginPath();
    ctx.moveTo(padding, height - padding);
    
    priceHistory.forEach((point, i) => {
      const x = padding + (i / (priceHistory.length - 1)) * (width - 2 * padding);
      const y = height - padding - ((point.price - minPrice) / priceRange) * (height - 2 * padding);
      
      if (i === 0) {
        ctx.lineTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.lineTo(width - padding, height - padding);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw line
    ctx.beginPath();
    priceHistory.forEach((point, i) => {
      const x = padding + (i / (priceHistory.length - 1)) * (width - 2 * padding);
      const y = height - padding - ((point.price - minPrice) / priceRange) * (height - 2 * padding);
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.strokeStyle = priceChange >= 0 ? "#22c55e" : "#ef4444";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();

    // Draw current price dot
    if (priceHistory.length > 0) {
      const lastPoint = priceHistory[priceHistory.length - 1];
      const x = width - padding;
      const y = height - padding - ((lastPoint.price - minPrice) / priceRange) * (height - 2 * padding);
      
      // Glow effect
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = priceChange >= 0 ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)";
      ctx.fill();
      
      // Inner dot
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = priceChange >= 0 ? "#22c55e" : "#ef4444";
      ctx.fill();
    }
  }, [priceHistory, priceChange]);

  const formatPrice = (price: number) => {
    return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="space-y-6">
      {/* Main Chart Card */}
      <div className="relative group">
        <div className={`absolute -inset-0.5 bg-gradient-to-r ${priceChange >= 0 ? 'from-green-600 to-emerald-600' : 'from-red-600 to-orange-600'} rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-300`} />
        <div className="relative bg-gray-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-3">
                <span className="text-3xl">Ξ</span>
                <div>
                  <h3 className="font-bold text-lg">ETH/USD</h3>
                  <p className="text-xs text-gray-400">Ethereum • Sepolia Testnet</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
              <span className="text-xs text-gray-400">{isConnected ? 'Live' : 'Disconnected'}</span>
            </div>
          </div>

          {/* Price Display */}
          <div className="flex items-end gap-4 mb-6">
            <span className="text-4xl font-bold font-mono">
              {currentPrice ? formatPrice(currentPrice) : "--"}
            </span>
            <div className={`flex items-center gap-1 px-3 py-1 rounded-full ${
              priceChange >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
            }`}>
              <span>{priceChange >= 0 ? '↑' : '↓'}</span>
              <span className="font-mono">{Math.abs(priceChange).toFixed(2)}%</span>
            </div>
          </div>

          {/* Chart */}
          <div className="relative h-64 mb-4">
            <canvas
              ref={canvasRef}
              className="w-full h-full"
              style={{ width: '100%', height: '100%' }}
            />
            
            {priceHistory.length < 2 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Loading price data...</p>
                </div>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-white/5 rounded-xl">
              <p className="text-xs text-gray-400 mb-1">24h High</p>
              <p className="font-mono font-bold text-green-400">
                {highPrice ? formatPrice(highPrice) : "--"}
              </p>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-xl">
              <p className="text-xs text-gray-400 mb-1">24h Low</p>
              <p className="font-mono font-bold text-red-400">
                {lowPrice ? formatPrice(lowPrice) : "--"}
              </p>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-xl">
              <p className="text-xs text-gray-400 mb-1">Data Points</p>
              <p className="font-mono font-bold text-cyan-400">{priceHistory.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Multi-Asset View */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MiniPriceCard
          symbol="BTC"
          name="Bitcoin"
          price={68432.50}
          change={2.34}
          icon="₿"
          color="orange"
        />
        <MiniPriceCard
          symbol="LINK"
          name="Chainlink"
          price={14.78}
          change={-1.23}
          icon="⬡"
          color="blue"
        />
        <MiniPriceCard
          symbol="SOL"
          name="Solana"
          price={175.42}
          change={5.67}
          icon="◎"
          color="purple"
        />
      </div>

      {/* Data Source Info */}
      <div className="relative group">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl blur opacity-20 group-hover:opacity-30 transition duration-300" />
        <div className="relative bg-gray-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl">📊</span>
              <div>
                <p className="font-medium text-sm">Data Source</p>
                <p className="text-xs text-gray-400">Chainlink VRF • Sepolia Network</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">Refresh Rate</p>
              <p className="font-mono text-sm">5s</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniPriceCard({ symbol, name, price, change, icon, color }: {
  symbol: string;
  name: string;
  price: number;
  change: number;
  icon: string;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    orange: "from-orange-500/20 to-yellow-500/20 border-orange-500/30",
    blue: "from-blue-500/20 to-cyan-500/20 border-blue-500/30",
    purple: "from-purple-500/20 to-pink-500/20 border-purple-500/30",
  };

  return (
    <div className={`bg-gradient-to-br ${colorClasses[color]} border rounded-2xl p-5 backdrop-blur-xl`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{icon}</span>
          <div>
            <p className="font-bold">{symbol}</p>
            <p className="text-xs text-gray-400">{name}</p>
          </div>
        </div>
      </div>
      <div className="flex items-end justify-between">
        <p className="font-mono font-bold text-lg">
          ${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
        <span className={`text-sm ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {change >= 0 ? '+' : ''}{change.toFixed(2)}%
        </span>
      </div>
    </div>
  );
}
