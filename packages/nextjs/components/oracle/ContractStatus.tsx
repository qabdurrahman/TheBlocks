"use client";

import { useState } from "react";

const CONTRACTS = {
  multiOracle: {
    name: "MultiOracleAggregator",
    address: "0x04b8dD0B1DabC4719a1cD8Ec2628425406F00A1C",
    description: "BFT 3/5 consensus oracle aggregator",
    features: ["Chainlink", "Pyth", "SyncedPriceFeed", "Outlier Detection"],
  },
  guardian: {
    name: "GuardianOracleV2",
    address: "0x71027655D76832eA3d1F056C528485ddE1aec66a",
    description: "AI-powered security layer with TWAP",
    features: ["Flash Loan Guard", "TWAP Oracle", "Circuit Breaker", "Confidence Scoring"],
  },
  synced: {
    name: "SyncedPriceFeed",
    address: "0xa372663b57Ea5FA52c911FE81aa4B54b87AB6c96",
    description: "Cross-chain synchronized price feed",
    features: ["Multi-Chain", "Low Latency", "Aggregated Feed"],
  },
  attackSim: {
    name: "AttackSimulator",
    address: "0x5FFFeAf6B0b4d1685809959cA4B16E374827a8e2",
    description: "Security testing and demonstration",
    features: ["Flash Loan Sim", "Manipulation Test", "Defense Demo"],
  },
  chainlink: {
    name: "Chainlink ETH/USD",
    address: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
    description: "Official Chainlink price feed",
    features: ["Push Oracle", "Decentralized", "Industry Standard"],
  },
  pyth: {
    name: "Pyth Network",
    address: "0xDd24F84d36BF92C65F92307595335bdFab5Bbd21",
    description: "High-frequency pull oracle",
    features: ["Sub-second Updates", "Confidence Intervals", "450+ Assets"],
  },
};

export function ContractStatus() {
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const copyToClipboard = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const openEtherscan = (address: string) => {
    window.open(`https://sepolia.etherscan.io/address/${address}`, "_blank");
  };

  return (
    <div className="space-y-8">
      {/* Network Info */}
      <div className="relative group">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-600 via-blue-600 to-purple-600 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-300" />
        <div className="relative bg-gray-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-2xl flex items-center justify-center">
                <span className="text-3xl">⟠</span>
              </div>
              <div>
                <h3 className="font-bold text-xl">Ethereum Sepolia Testnet</h3>
                <p className="text-gray-400 text-sm">Chain ID: 11155111</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-4 py-2 bg-green-500/20 rounded-xl">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span className="text-green-400 font-medium">Connected</span>
              </div>
              <a
                href="https://sepolia.etherscan.io"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors flex items-center gap-2"
              >
                <span>🔍</span>
                Etherscan
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Core Contracts */}
      <div>
        <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
          <span>📜</span> Core Smart Contracts
        </h3>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Object.entries(CONTRACTS).slice(0, 4).map(([key, contract]) => (
            <ContractCard
              key={key}
              {...contract}
              onCopy={() => copyToClipboard(contract.address)}
              onEtherscan={() => openEtherscan(contract.address)}
              isCopied={copiedAddress === contract.address}
              variant={key === "guardian" ? "featured" : "default"}
            />
          ))}
        </div>
      </div>

      {/* Oracle Providers */}
      <div>
        <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
          <span>🔗</span> Oracle Providers
        </h3>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Object.entries(CONTRACTS).slice(4).map(([key, contract]) => (
            <ContractCard
              key={key}
              {...contract}
              onCopy={() => copyToClipboard(contract.address)}
              onEtherscan={() => openEtherscan(contract.address)}
              isCopied={copiedAddress === contract.address}
              variant="oracle"
            />
          ))}
        </div>
      </div>

      {/* Architecture Diagram */}
      <div className="relative group">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 via-pink-600 to-orange-600 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-300" />
        <div className="relative bg-gray-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
          <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
            <span>🏗️</span> System Architecture
          </h3>
          
          <div className="relative">
            {/* Data Flow Diagram */}
            <div className="flex flex-col items-center gap-4">
              {/* Oracle Layer */}
              <div className="flex items-center gap-4 flex-wrap justify-center">
                <OracleNode name="Chainlink" icon="🔗" color="blue" />
                <OracleNode name="Pyth" icon="🔮" color="purple" />
                <OracleNode name="Synced" icon="🔄" color="cyan" />
              </div>
              
              {/* Arrow */}
              <div className="h-8 w-px bg-gradient-to-b from-gray-500 to-cyan-500" />
              <span className="text-2xl">⬇️</span>
              
              {/* Layer 1 */}
              <div className="w-full max-w-md p-4 bg-blue-500/10 border border-blue-500/30 rounded-2xl text-center">
                <span className="text-2xl mb-2 block">⚖️</span>
                <p className="font-bold">Layer 1: BFT Aggregator</p>
                <p className="text-xs text-gray-400">3/5 Consensus • Outlier Detection</p>
              </div>
              
              {/* Arrow */}
              <div className="h-8 w-px bg-gradient-to-b from-blue-500 to-purple-500" />
              <span className="text-2xl">⬇️</span>
              
              {/* Layer 2 */}
              <div className="w-full max-w-md p-4 bg-purple-500/10 border border-purple-500/30 rounded-2xl text-center">
                <span className="text-2xl mb-2 block">🤖</span>
                <p className="font-bold">Layer 2: AI Guardian</p>
                <p className="text-xs text-gray-400">Flash Loan Guard • TWAP • Circuit Breaker</p>
              </div>
              
              {/* Arrow */}
              <div className="h-8 w-px bg-gradient-to-b from-purple-500 to-green-500" />
              <span className="text-2xl">⬇️</span>
              
              {/* Output */}
              <div className="w-full max-w-md p-4 bg-green-500/10 border border-green-500/30 rounded-2xl text-center">
                <span className="text-2xl mb-2 block">✅</span>
                <p className="font-bold">Secured Price Feed</p>
                <p className="text-xs text-gray-400">Manipulation-Resistant • High Confidence</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Deployment Info */}
      <div className="relative group">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-gray-600 to-gray-700 rounded-2xl blur opacity-20 group-hover:opacity-30 transition duration-300" />
        <div className="relative bg-gray-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <span>📊</span> Deployment Statistics
          </h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatBox label="Contracts" value="6" icon="📜" />
            <StatBox label="Price Feeds" value="24" icon="📡" />
            <StatBox label="Total Gas" value="2.29M" icon="⛽" />
            <StatBox label="Cost (USD)" value="~$0.01" icon="💰" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ContractCard({
  name,
  address,
  description,
  features,
  onCopy,
  onEtherscan,
  isCopied,
  variant = "default",
}: {
  name: string;
  address: string;
  description: string;
  features: string[];
  onCopy: () => void;
  onEtherscan: () => void;
  isCopied: boolean;
  variant?: "default" | "featured" | "oracle";
}) {
  const gradients: Record<string, string> = {
    default: "from-gray-600 to-gray-700",
    featured: "from-purple-600 to-pink-600",
    oracle: "from-blue-600 to-cyan-600",
  };

  return (
    <div className="relative group">
      <div className={`absolute -inset-0.5 bg-gradient-to-r ${gradients[variant]} rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-300`} />
      <div className="relative bg-gray-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-5 h-full">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h4 className="font-bold">{name}</h4>
            <p className="text-xs text-gray-400">{description}</p>
          </div>
          {variant === "featured" && (
            <span className="px-2 py-1 bg-purple-500/20 text-purple-300 text-xs rounded-full">Core</span>
          )}
        </div>
        
        {/* Address */}
        <div className="flex items-center gap-2 mb-4 p-3 bg-white/5 rounded-xl">
          <code className="text-xs font-mono text-gray-300 flex-1 truncate">
            {address}
          </code>
          <button
            onClick={onCopy}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            title="Copy address"
          >
            {isCopied ? "✅" : "📋"}
          </button>
          <button
            onClick={onEtherscan}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            title="View on Etherscan"
          >
            🔍
          </button>
        </div>
        
        {/* Features */}
        <div className="flex flex-wrap gap-2">
          {features.map((feature, idx) => (
            <span
              key={idx}
              className="px-2 py-1 bg-white/5 text-xs text-gray-400 rounded-lg"
            >
              {feature}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function OracleNode({ name, icon, color }: { name: string; icon: string; color: string }) {
  const colors: Record<string, string> = {
    blue: "from-blue-500/20 to-blue-500/10 border-blue-500/30",
    purple: "from-purple-500/20 to-purple-500/10 border-purple-500/30",
    cyan: "from-cyan-500/20 to-cyan-500/10 border-cyan-500/30",
  };

  return (
    <div className={`p-4 bg-gradient-to-br ${colors[color]} border rounded-2xl text-center min-w-[100px]`}>
      <span className="text-2xl">{icon}</span>
      <p className="text-sm font-medium mt-1">{name}</p>
    </div>
  );
}

function StatBox({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="p-4 bg-white/5 rounded-xl text-center">
      <span className="text-2xl">{icon}</span>
      <p className="text-xl font-bold mt-2">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  );
}
