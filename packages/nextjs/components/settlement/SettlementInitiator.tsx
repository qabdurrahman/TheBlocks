"use client";

import { useCallback, useEffect, useState } from "react";
import { formatEther, parseEther } from "viem";
import { useAccount, useBalance, usePublicClient } from "wagmi";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

/**
 * @title SettlementInitiator
 * @author TheBlocks Team - TriHacker Tournament 2025
 * @notice UI component to create new settlements with multi-transfer support
 *
 * FEATURES:
 * - Dynamic transfer list (add/remove transfers)
 * - Live USD value from oracle prices
 * - Optional timeout configuration
 * - Real-time validation
 * - Transaction status feedback
 */

// Chainlink ETH/USD on Sepolia
const CHAINLINK_ETH_USD = "0x694AA1769357215DE4FAC081bf1f309aDC325306";
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

interface Transfer {
  from: string;
  to: string;
  amount: string;
}

export const SettlementInitiator = () => {
  const { address: connectedAddress, isConnected } = useAccount();
  const { data: balanceData } = useBalance({ address: connectedAddress });
  const publicClient = usePublicClient();
  const [transfers, setTransfers] = useState<Transfer[]>([{ from: "", to: "", amount: "" }]);
  const [customTimeout, setCustomTimeout] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [ethPrice, setEthPrice] = useState<number>(0);

  // Fetch ETH price from Chainlink
  const fetchPrice = useCallback(async () => {
    if (!publicClient) return;
    try {
      const data = await publicClient.readContract({
        address: CHAINLINK_ETH_USD,
        abi: CHAINLINK_ABI,
        functionName: "latestRoundData",
      });
      setEthPrice(Number(data[1]) / 1e8);
    } catch (error) {
      console.error("Failed to fetch price:", error);
    }
  }, [publicClient]);

  useEffect(() => {
    fetchPrice();
    const interval = setInterval(fetchPrice, 30000);
    return () => clearInterval(interval);
  }, [fetchPrice]);

  // Contract read for queue position
  const { data: queueLength } = useScaffoldReadContract({
    contractName: "SettlementProtocol",
    functionName: "getQueueLength",
  });

  const { data: nextSettlementId } = useScaffoldReadContract({
    contractName: "SettlementProtocol",
    functionName: "nextSettlementId",
  });

  // Contract write for creating settlement
  const { writeContractAsync: createSettlement } = useScaffoldWriteContract("SettlementProtocol");

  // Add a new transfer row
  const addTransfer = useCallback(() => {
    if (transfers.length >= 100) {
      notification.error("Maximum 100 transfers per settlement");
      return;
    }
    setTransfers(prev => [...prev, { from: connectedAddress || "", to: "", amount: "" }]);
  }, [transfers.length, connectedAddress]);

  // Remove a transfer row
  const removeTransfer = useCallback(
    (index: number) => {
      if (transfers.length <= 1) {
        notification.error("At least one transfer required");
        return;
      }
      setTransfers(prev => prev.filter((_, i) => i !== index));
    },
    [transfers.length],
  );

  // Update a transfer field
  const updateTransfer = useCallback((index: number, field: keyof Transfer, value: string) => {
    setTransfers(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }, []);

  // Calculate total amount needed
  const calculateTotal = useCallback(() => {
    return transfers.reduce((sum, t) => {
      const amount = parseFloat(t.amount) || 0;
      return sum + amount;
    }, 0);
  }, [transfers]);

  // Validate transfers
  const validateTransfers = useCallback(() => {
    for (const transfer of transfers) {
      if (!transfer.from || transfer.from.length !== 42) {
        notification.error("Invalid sender address");
        return false;
      }
      if (!transfer.to || transfer.to.length !== 42) {
        notification.error("Invalid recipient address");
        return false;
      }
      if (!transfer.amount || parseFloat(transfer.amount) <= 0) {
        notification.error("Amount must be greater than 0");
        return false;
      }
    }
    return true;
  }, [transfers]);

  // Handle settlement creation
  const handleCreateSettlement = async () => {
    if (!isConnected) {
      notification.error("Please connect your wallet");
      return;
    }

    if (!validateTransfers()) {
      return;
    }

    setIsCreating(true);

    try {
      const formattedTransfers = transfers.map(t => ({
        from: t.from as `0x${string}`,
        to: t.to as `0x${string}`,
        amount: parseEther(t.amount),
        executed: false,
      }));

      const timeout = customTimeout ? BigInt(customTimeout) : 0n;

      await createSettlement({
        functionName: "createSettlement",
        args: [formattedTransfers, timeout],
      });

      notification.success("Settlement created successfully!");

      // Reset form
      setTransfers([{ from: connectedAddress || "", to: "", amount: "" }]);
      setCustomTimeout("");
    } catch (error: any) {
      console.error("Settlement creation failed:", error);
      notification.error(error?.message || "Failed to create settlement");
    } finally {
      setIsCreating(false);
    }
  };

  // Set sender address to connected wallet for all transfers
  const fillSenderAddresses = () => {
    if (connectedAddress) {
      setTransfers(prev => prev.map(t => ({ ...t, from: connectedAddress })));
    }
  };

  return (
    <div className="bg-base-100 rounded-3xl shadow-lg p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-2 text-center">💹 Create Trade / Transfer Rights</h2>
      <p className="text-center text-sm opacity-70 mb-6">
        Oracle-validated transfers with FIFO ordering | Queue: #{queueLength?.toString() || "0"} | Next ID: {nextSettlementId?.toString() || "1"}
      </p>

      {/* Transfer List */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Transfers ({transfers.length}/100)</h3>
          <div className="flex gap-2">
            <button className="btn btn-sm btn-secondary" onClick={fillSenderAddresses} disabled={!isConnected}>
              Use My Address
            </button>
            <button className="btn btn-sm btn-primary" onClick={addTransfer} disabled={transfers.length >= 100}>
              + Add Transfer
            </button>
          </div>
        </div>

        {transfers.map((transfer, index) => (
          <div key={index} className="bg-base-200 rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="badge badge-ghost">Transfer #{index + 1}</span>
              {transfers.length > 1 && (
                <button className="btn btn-sm btn-circle btn-ghost text-error" onClick={() => removeTransfer(index)}>
                  ✕
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="form-control">
                <label className="label">
                  <span className="label-text">From</span>
                </label>
                <input
                  type="text"
                  placeholder="0x..."
                  className="input input-bordered w-full font-mono text-sm"
                  value={transfer.from}
                  onChange={e => updateTransfer(index, "from", e.target.value)}
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">To</span>
                </label>
                <input
                  type="text"
                  placeholder="0x..."
                  className="input input-bordered w-full font-mono text-sm"
                  value={transfer.to}
                  onChange={e => updateTransfer(index, "to", e.target.value)}
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Amount (ETH)</span>
                </label>
                <input
                  type="number"
                  step="0.001"
                  placeholder="0.0"
                  className="input input-bordered w-full"
                  value={transfer.amount}
                  onChange={e => updateTransfer(index, "amount", e.target.value)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Timeout Configuration */}
      <div className="mt-6 bg-base-200 rounded-xl p-4">
        <h3 className="font-semibold mb-2">⏱️ Optional Timeout</h3>
        <div className="form-control">
          <label className="label">
            <span className="label-text">Custom timeout (blocks, 0 = default 1000 blocks)</span>
          </label>
          <input
            type="number"
            placeholder="0"
            className="input input-bordered w-full max-w-xs"
            value={customTimeout}
            onChange={e => setCustomTimeout(e.target.value)}
          />
        </div>
      </div>

      {/* Wallet Balance */}
      {isConnected && balanceData && (
        <div className="mt-6 bg-gradient-to-r from-success/10 to-primary/10 rounded-xl p-4">
          <h3 className="font-semibold mb-3">💰 Your Wallet Balance</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-base-100 rounded-lg p-3 text-center">
              <div className="text-xs opacity-60 mb-1">ETH Balance</div>
              <div className="text-xl font-bold text-primary">
                {parseFloat(formatEther(balanceData.value)).toFixed(4)} ETH
              </div>
            </div>
            <div className="bg-base-100 rounded-lg p-3 text-center">
              <div className="text-xs opacity-60 mb-1">USD Value</div>
              <div className="text-xl font-bold text-success">
                ${(parseFloat(formatEther(balanceData.value)) * ethPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary with Live USD Value */}
      <div className="mt-6 bg-gradient-to-r from-primary/10 to-secondary/10 rounded-xl p-4">
        <h3 className="font-semibold mb-3">📊 Trade Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-base-100 rounded-lg p-3 text-center">
            <div className="text-xs opacity-60 mb-1">Total ETH</div>
            <div className="text-xl font-bold text-primary">{calculateTotal().toFixed(4)}</div>
          </div>
          <div className="bg-base-100 rounded-lg p-3 text-center">
            <div className="text-xs opacity-60 mb-1">USD Value</div>
            <div className="text-xl font-bold text-success">
              ${(calculateTotal() * ethPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-base-100 rounded-lg p-3 text-center">
            <div className="text-xs opacity-60 mb-1">ETH/USD Rate</div>
            <div className="text-lg font-mono">
              ${ethPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-base-100 rounded-lg p-3 text-center">
            <div className="text-xs opacity-60 mb-1">Transfers</div>
            <div className="text-xl font-bold">{transfers.length}</div>
          </div>
        </div>
        <div className="mt-3 text-center">
          <span className="badge badge-success badge-sm">📡 Live Chainlink Price</span>
        </div>
      </div>

      {/* Create Button */}
      <div className="mt-6 flex justify-center">
        <button
          className={`btn btn-primary btn-lg ${isCreating ? "loading" : ""}`}
          onClick={handleCreateSettlement}
          disabled={!isConnected || isCreating}
        >
          {isCreating ? "Creating..." : "💹 Create Trade"}
        </button>
      </div>

      {!isConnected && <p className="text-center text-error mt-4">Please connect your wallet to create a trade</p>}
    </div>
  );
};

export default SettlementInitiator;
