"use client";

import { useState } from "react";
import { formatEther } from "viem";
import { useAccount } from "wagmi";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

/**
 * @title SettlementMonitor
 * @author TheBlocks Team - TriHacker Tournament 2025
 * @notice Real-time monitoring dashboard for settlement status
 *
 * FEATURES:
 * - Live settlement status tracking
 * - State machine visualization
 * - Deposit & execution controls
 * - Progress tracking for partial finality
 */

// State enum mapping
const STATE_NAMES = ["PENDING", "INITIATED", "EXECUTING", "FINALIZED", "DISPUTED", "FAILED"];
const STATE_COLORS: Record<number, string> = {
  0: "badge-warning", // PENDING
  1: "badge-info", // INITIATED
  2: "badge-accent", // EXECUTING
  3: "badge-success", // FINALIZED
  4: "badge-error", // DISPUTED
  5: "badge-ghost", // FAILED
};

const STATE_ICONS: Record<number, string> = {
  0: "⏳", // PENDING
  1: "🔄", // INITIATED
  2: "⚡", // EXECUTING
  3: "✅", // FINALIZED
  4: "⚠️", // DISPUTED
  5: "❌", // FAILED
};

interface Settlement {
  id: bigint;
  initiator: string;
  totalAmount: bigint;
  totalDeposited: bigint;
  state: number;
  createdAt: bigint;
  timeout: bigint;
  queuePosition: bigint;
  totalTransfers: bigint;
  executedTransfers: bigint;
}

export const SettlementMonitor = () => {
  const { isConnected } = useAccount();
  const [selectedId, setSelectedId] = useState<string>("1");
  const [depositAmount, setDepositAmount] = useState<string>("");
  const [executeCount, setExecuteCount] = useState<string>("1");

  // Read settlement data
  const { data: settlementData, refetch: refetchSettlement } = useScaffoldReadContract({
    contractName: "SettlementProtocol",
    functionName: "getSettlement",
    args: [BigInt(selectedId || "0")],
  });

  // Read can initiate status
  const { data: canInitiateData } = useScaffoldReadContract({
    contractName: "SettlementProtocol",
    functionName: "canInitiate",
    args: [BigInt(selectedId || "0")],
  });

  // Read queue info
  const { data: queueHead } = useScaffoldReadContract({
    contractName: "SettlementProtocol",
    functionName: "queueHead",
  });

  const { data: queueLength } = useScaffoldReadContract({
    contractName: "SettlementProtocol",
    functionName: "getQueueLength",
  });

  // Contract writes
  const { writeContractAsync: deposit } = useScaffoldWriteContract("SettlementProtocol");
  const { writeContractAsync: initiateSettlement } = useScaffoldWriteContract("SettlementProtocol");
  const { writeContractAsync: executeSettlement } = useScaffoldWriteContract("SettlementProtocol");
  const { writeContractAsync: refundSettlement } = useScaffoldWriteContract("SettlementProtocol");

  // Parse settlement data
  const settlement: Settlement | null = settlementData
    ? {
        id: settlementData.id,
        initiator: settlementData.initiator,
        totalAmount: settlementData.totalAmount,
        totalDeposited: settlementData.totalDeposited,
        state: Number(settlementData.state),
        createdAt: settlementData.createdAt,
        timeout: settlementData.timeout,
        queuePosition: settlementData.queuePosition,
        totalTransfers: settlementData.totalTransfers,
        executedTransfers: settlementData.executedTransfers,
      }
    : null;

  // Handle deposit
  const handleDeposit = async () => {
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      notification.error("Enter a valid deposit amount");
      return;
    }

    try {
      await deposit({
        functionName: "deposit",
        args: [BigInt(selectedId)],
        value: BigInt(parseFloat(depositAmount) * 1e18),
      });
      notification.success("Deposit successful!");
      setDepositAmount("");
      refetchSettlement();
    } catch (error: any) {
      notification.error(error?.message || "Deposit failed");
    }
  };

  // Handle initiate
  const handleInitiate = async () => {
    try {
      await initiateSettlement({
        functionName: "initiateSettlement",
        args: [BigInt(selectedId)],
      });
      notification.success("Settlement initiated!");
      refetchSettlement();
    } catch (error: any) {
      notification.error(error?.message || "Initiation failed");
    }
  };

  // Handle execute
  const handleExecute = async () => {
    try {
      await executeSettlement({
        functionName: "executeSettlement",
        args: [BigInt(selectedId), BigInt(executeCount)],
      });
      notification.success("Transfers executed!");
      refetchSettlement();
    } catch (error: any) {
      notification.error(error?.message || "Execution failed");
    }
  };

  // Handle refund
  const handleRefund = async () => {
    try {
      await refundSettlement({
        functionName: "refundSettlement",
        args: [BigInt(selectedId)],
      });
      notification.success("Refund processed!");
      refetchSettlement();
    } catch (error: any) {
      notification.error(error?.message || "Refund failed");
    }
  };

  // Calculate progress percentage
  const getProgress = () => {
    if (!settlement || settlement.totalTransfers === 0n) return 0;
    return Number((settlement.executedTransfers * 100n) / settlement.totalTransfers);
  };

  // Calculate deposit percentage
  const getDepositProgress = () => {
    if (!settlement || settlement.totalAmount === 0n) return 0;
    const progress = Number((settlement.totalDeposited * 100n) / settlement.totalAmount);
    return Math.min(progress, 100);
  };

  // Check if settlement exists
  const settlementExists = settlement && settlement.id > 0n;

  return (
    <div className="bg-base-100 rounded-3xl shadow-lg p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6 text-center">📊 Settlement Monitor</h2>

      {/* Settlement ID Selector */}
      <div className="flex gap-4 items-end mb-6">
        <div className="form-control flex-1">
          <label className="label">
            <span className="label-text">Settlement ID</span>
          </label>
          <input
            type="number"
            min="1"
            className="input input-bordered"
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
          />
        </div>
        <button className="btn btn-secondary" onClick={() => refetchSettlement()}>
          🔄 Refresh
        </button>
      </div>

      {/* Queue Status */}
      <div className="bg-base-200 rounded-xl p-4 mb-6">
        <h3 className="font-semibold mb-2">📋 Queue Status</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="opacity-70">Queue Head:</span>
            <span className="font-bold ml-2">{queueHead?.toString() || "0"}</span>
          </div>
          <div>
            <span className="opacity-70">Pending Settlements:</span>
            <span className="font-bold ml-2">{queueLength?.toString() || "0"}</span>
          </div>
        </div>
      </div>

      {!settlementExists ? (
        <div className="text-center py-10 bg-base-200 rounded-xl">
          <p className="text-lg opacity-70">No settlement found with ID #{selectedId}</p>
        </div>
      ) : (
        <>
          {/* Settlement Status Card */}
          <div className="bg-gradient-to-r from-primary/10 to-secondary/10 rounded-xl p-6 mb-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-bold">Settlement #{settlement.id.toString()}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <code className="text-xs">
                    {settlement.initiator.slice(0, 6)}...{settlement.initiator.slice(-4)}
                  </code>
                </div>
              </div>
              <div className={`badge ${STATE_COLORS[settlement.state]} badge-lg`}>
                {STATE_ICONS[settlement.state]} {STATE_NAMES[settlement.state]}
              </div>
            </div>

            {/* Progress Bars */}
            <div className="space-y-4">
              {/* Deposit Progress */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Deposits</span>
                  <span>
                    {formatEther(settlement.totalDeposited)} / {formatEther(settlement.totalAmount)} ETH
                  </span>
                </div>
                <progress
                  className="progress progress-primary w-full"
                  value={getDepositProgress()}
                  max="100"
                ></progress>
              </div>

              {/* Execution Progress */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Execution</span>
                  <span>
                    {settlement.executedTransfers.toString()} / {settlement.totalTransfers.toString()} transfers
                  </span>
                </div>
                <progress className="progress progress-success w-full" value={getProgress()} max="100"></progress>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              <div className="stat bg-base-100 rounded-lg p-3">
                <div className="stat-title text-xs">Queue Position</div>
                <div className="stat-value text-lg">#{settlement.queuePosition.toString()}</div>
              </div>
              <div className="stat bg-base-100 rounded-lg p-3">
                <div className="stat-title text-xs">Transfers</div>
                <div className="stat-value text-lg">{settlement.totalTransfers.toString()}</div>
              </div>
              <div className="stat bg-base-100 rounded-lg p-3">
                <div className="stat-title text-xs">Created Block</div>
                <div className="stat-value text-lg">{settlement.createdAt.toString()}</div>
              </div>
              <div className="stat bg-base-100 rounded-lg p-3">
                <div className="stat-title text-xs">Timeout</div>
                <div className="stat-value text-lg">{settlement.timeout.toString()}</div>
              </div>
            </div>
          </div>

          {/* Action Panels Based on State */}
          {settlement.state === 0 && (
            <div className="bg-base-200 rounded-xl p-4 space-y-4">
              <h3 className="font-semibold">💰 Deposit Funds</h3>
              <div className="flex gap-4">
                <input
                  type="number"
                  step="0.001"
                  placeholder="Amount in ETH"
                  className="input input-bordered flex-1"
                  value={depositAmount}
                  onChange={e => setDepositAmount(e.target.value)}
                />
                <button className="btn btn-primary" onClick={handleDeposit} disabled={!isConnected}>
                  Deposit
                </button>
              </div>

              {/* Initiate Section */}
              <div className="divider"></div>
              <div className="flex justify-between items-center">
                <div>
                  <span className="font-semibold">🚀 Initiate Settlement</span>
                  <p className="text-sm opacity-70">
                    {canInitiateData?.[0]
                      ? "Ready to initiate!"
                      : `Cannot initiate: ${canInitiateData?.[1] || "Unknown reason"}`}
                  </p>
                </div>
                <button
                  className="btn btn-success"
                  onClick={handleInitiate}
                  disabled={!isConnected || !canInitiateData?.[0]}
                >
                  Initiate
                </button>
              </div>
            </div>
          )}

          {settlement.state === 1 && (
            <div className="bg-base-200 rounded-xl p-4 space-y-4">
              <h3 className="font-semibold">⚡ Execute Transfers</h3>
              <p className="text-sm opacity-70">
                Settlement is initiated. Wait for confirmation blocks, then execute transfers.
              </p>
              <div className="flex gap-4">
                <input
                  type="number"
                  min="1"
                  placeholder="Number of transfers"
                  className="input input-bordered flex-1"
                  value={executeCount}
                  onChange={e => setExecuteCount(e.target.value)}
                />
                <button className="btn btn-accent" onClick={handleExecute} disabled={!isConnected}>
                  Execute
                </button>
              </div>
            </div>
          )}

          {settlement.state === 2 && (
            <div className="bg-base-200 rounded-xl p-4 space-y-4">
              <h3 className="font-semibold">⚡ Continue Execution</h3>
              <p className="text-sm opacity-70">
                Partial finality in progress: {settlement.executedTransfers.toString()}/
                {settlement.totalTransfers.toString()} transfers executed.
              </p>
              <div className="flex gap-4">
                <input
                  type="number"
                  min="1"
                  placeholder="Number of transfers"
                  className="input input-bordered flex-1"
                  value={executeCount}
                  onChange={e => setExecuteCount(e.target.value)}
                />
                <button className="btn btn-accent" onClick={handleExecute} disabled={!isConnected}>
                  Continue
                </button>
              </div>
            </div>
          )}

          {settlement.state === 3 && (
            <div className="bg-success/20 rounded-xl p-4 text-center">
              <span className="text-4xl">✅</span>
              <h3 className="font-bold text-lg mt-2">Settlement Finalized</h3>
              <p className="opacity-70">All transfers have been executed successfully.</p>
            </div>
          )}

          {settlement.state === 4 && (
            <div className="bg-error/20 rounded-xl p-4 text-center">
              <span className="text-4xl">⚠️</span>
              <h3 className="font-bold text-lg mt-2">Settlement Disputed</h3>
              <p className="opacity-70">This settlement is under dispute review.</p>
            </div>
          )}

          {settlement.state === 5 && (
            <div className="bg-base-200 rounded-xl p-4 space-y-4">
              <div className="text-center">
                <span className="text-4xl">❌</span>
                <h3 className="font-bold text-lg mt-2">Settlement Failed</h3>
              </div>
              <div className="flex justify-center">
                <button className="btn btn-warning" onClick={handleRefund} disabled={!isConnected}>
                  Request Refund
                </button>
              </div>
            </div>
          )}

          {/* Timeout Refund Option */}
          {(settlement.state === 0 || settlement.state === 1) && (
            <div className="mt-4 border-t pt-4">
              <button className="btn btn-ghost btn-sm text-warning" onClick={handleRefund}>
                ⏰ Request Timeout Refund
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SettlementMonitor;
