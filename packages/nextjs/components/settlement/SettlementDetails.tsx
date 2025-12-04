"use client";

import { useState } from "react";
import { formatEther } from "viem";
import { useSettlements } from "~~/hooks/settlement";
import { notification } from "~~/utils/scaffold-eth";

/**
 * @title SettlementDetails
 * @author TheBlocks Team - TriHacker Tournament 2025
 * @notice Detailed view of a single settlement
 *
 * FEATURES:
 * - Full settlement information
 * - Transfer list with execution status
 * - Action buttons based on state
 * - Timeline view
 */

const STATE_NAMES = ["PENDING", "INITIATED", "EXECUTING", "FINALIZED", "DISPUTED", "FAILED"];
const STATE_COLORS: Record<number, string> = {
  0: "badge-warning",
  1: "badge-info",
  2: "badge-accent",
  3: "badge-success",
  4: "badge-error",
  5: "badge-ghost",
};
const STATE_ICONS: Record<number, string> = {
  0: "⏳",
  1: "🔄",
  2: "⚡",
  3: "✅",
  4: "⚠️",
  5: "❌",
};

interface SettlementDetailsProps {
  settlementId: bigint;
  onClose?: () => void;
}

export const SettlementDetails = ({ settlementId, onClose }: SettlementDetailsProps) => {
  const {
    settlement,
    transfers,
    canInitiate,
    initiateReason,
    isEligibleForRefund,
    deposit,
    initiateSettlement,
    executeSettlement,
    refundSettlement,
    disputeSettlement,
    isConnected,
    isDepositing,
    isInitiating,
    isExecuting,
    isRefunding,
    isDisputing,
    formatAmount,
    getProgress,
    getDepositProgress,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    refetchSettlement,
  } = useSettlements(settlementId);

  const [depositAmount, setDepositAmount] = useState("");
  const [executeCount, setExecuteCount] = useState("1");
  const [disputeReason, setDisputeReason] = useState("");
  const [showDisputeForm, setShowDisputeForm] = useState(false);

  if (!settlement || settlement.id === 0n) {
    return (
      <div className="bg-base-100 rounded-3xl shadow-lg p-6">
        <div className="text-center py-10">
          <span className="text-5xl mb-4 block">🔍</span>
          <p className="text-lg opacity-70">Settlement #{settlementId.toString()} not found</p>
        </div>
      </div>
    );
  }

  const handleDeposit = async () => {
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      notification.error("Enter a valid amount");
      return;
    }
    try {
      await deposit(settlementId, depositAmount);
      notification.success("Deposit successful!");
      setDepositAmount("");
    } catch (error: any) {
      notification.error(error?.message || "Deposit failed");
    }
  };

  const handleInitiate = async () => {
    try {
      await initiateSettlement(settlementId);
      notification.success("Settlement initiated!");
    } catch (error: any) {
      notification.error(error?.message || "Initiation failed");
    }
  };

  const handleExecute = async () => {
    try {
      await executeSettlement(settlementId, parseInt(executeCount));
      notification.success("Transfers executed!");
    } catch (error: any) {
      notification.error(error?.message || "Execution failed");
    }
  };

  const handleRefund = async () => {
    try {
      await refundSettlement(settlementId);
      notification.success("Refund processed!");
    } catch (error: any) {
      notification.error(error?.message || "Refund failed");
    }
  };

  const handleDispute = async () => {
    if (!disputeReason) {
      notification.error("Enter a dispute reason");
      return;
    }
    try {
      await disputeSettlement(settlementId, disputeReason);
      notification.success("Dispute submitted!");
      setDisputeReason("");
      setShowDisputeForm(false);
    } catch (error: any) {
      notification.error(error?.message || "Dispute failed");
    }
  };

  return (
    <div className="bg-base-100 rounded-3xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary/20 to-secondary/20 p-6">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold">Settlement #{settlement.id.toString()}</h2>
              <span className={`badge ${STATE_COLORS[settlement.state]} badge-lg`}>
                {STATE_ICONS[settlement.state]} {STATE_NAMES[settlement.state]}
              </span>
            </div>
            <p className="text-sm opacity-70 mt-1">
              Initiator:{" "}
              <code className="font-mono">
                {settlement.initiator.slice(0, 10)}...{settlement.initiator.slice(-8)}
              </code>
            </p>
          </div>
          {onClose && (
            <button className="btn btn-circle btn-ghost" onClick={onClose}>
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Progress Bars */}
      <div className="p-6 border-b border-base-300">
        <div className="grid gap-4">
          {/* Deposit Progress */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="font-semibold">💰 Deposits</span>
              <span className="font-mono">
                {formatAmount(settlement.totalDeposited)} / {formatAmount(settlement.totalAmount)} ETH
              </span>
            </div>
            <progress
              className="progress progress-primary w-full h-3"
              value={getDepositProgress()}
              max={100}
            ></progress>
          </div>

          {/* Execution Progress */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="font-semibold">⚡ Execution</span>
              <span className="font-mono">
                {settlement.executedTransfers.toString()} / {settlement.totalTransfers.toString()} transfers
              </span>
            </div>
            <progress className="progress progress-success w-full h-3" value={getProgress()} max={100}></progress>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="p-6 border-b border-base-300">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-base-200 rounded-xl p-4 text-center">
            <p className="text-xs opacity-60">Queue Position</p>
            <p className="text-2xl font-bold">#{settlement.queuePosition.toString()}</p>
          </div>
          <div className="bg-base-200 rounded-xl p-4 text-center">
            <p className="text-xs opacity-60">Total Transfers</p>
            <p className="text-2xl font-bold">{settlement.totalTransfers.toString()}</p>
          </div>
          <div className="bg-base-200 rounded-xl p-4 text-center">
            <p className="text-xs opacity-60">Created Block</p>
            <p className="text-2xl font-bold">{settlement.createdAt.toString()}</p>
          </div>
          <div className="bg-base-200 rounded-xl p-4 text-center">
            <p className="text-xs opacity-60">Timeout Block</p>
            <p className="text-2xl font-bold">{settlement.timeout.toString()}</p>
          </div>
        </div>
      </div>

      {/* Transfer List */}
      <div className="p-6 border-b border-base-300">
        <h3 className="font-bold mb-4">📋 Transfers ({transfers.length})</h3>
        <div className="overflow-x-auto max-h-64">
          <table className="table table-sm table-zebra">
            <thead>
              <tr>
                <th>#</th>
                <th>From</th>
                <th>To</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((transfer, idx) => (
                <tr key={idx} className={transfer.executed ? "opacity-60" : ""}>
                  <td>{idx + 1}</td>
                  <td>
                    <code className="text-xs">
                      {transfer.from.slice(0, 6)}...{transfer.from.slice(-4)}
                    </code>
                  </td>
                  <td>
                    <code className="text-xs">
                      {transfer.to.slice(0, 6)}...{transfer.to.slice(-4)}
                    </code>
                  </td>
                  <td className="font-mono">{formatEther(transfer.amount)} ETH</td>
                  <td>
                    <span className={`badge badge-sm ${transfer.executed ? "badge-success" : "badge-warning"}`}>
                      {transfer.executed ? "✓ Done" : "Pending"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Action Panel */}
      <div className="p-6">
        {/* PENDING State Actions */}
        {settlement.state === 0 && (
          <div className="space-y-4">
            {/* Deposit */}
            <div className="bg-base-200 rounded-xl p-4">
              <h4 className="font-semibold mb-2">💰 Deposit Funds</h4>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.001"
                  placeholder="Amount in ETH"
                  className="input input-bordered flex-1"
                  value={depositAmount}
                  onChange={e => setDepositAmount(e.target.value)}
                />
                <button className="btn btn-primary" onClick={handleDeposit} disabled={!isConnected || isDepositing}>
                  {isDepositing ? <span className="loading loading-spinner loading-sm"></span> : "Deposit"}
                </button>
              </div>
            </div>

            {/* Initiate */}
            <div className="bg-base-200 rounded-xl p-4">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="font-semibold">🚀 Initiate Settlement</h4>
                  <p className="text-sm opacity-70">
                    {canInitiate ? "Ready to initiate!" : initiateReason || "Cannot initiate yet"}
                  </p>
                </div>
                <button
                  className="btn btn-success"
                  onClick={handleInitiate}
                  disabled={!isConnected || !canInitiate || isInitiating}
                >
                  {isInitiating ? <span className="loading loading-spinner loading-sm"></span> : "Initiate"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* INITIATED/EXECUTING State Actions */}
        {(settlement.state === 1 || settlement.state === 2) && (
          <div className="space-y-4">
            <div className="bg-base-200 rounded-xl p-4">
              <h4 className="font-semibold mb-2">⚡ Execute Transfers</h4>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  placeholder="Number of transfers"
                  className="input input-bordered flex-1"
                  value={executeCount}
                  onChange={e => setExecuteCount(e.target.value)}
                />
                <button className="btn btn-accent" onClick={handleExecute} disabled={!isConnected || isExecuting}>
                  {isExecuting ? <span className="loading loading-spinner loading-sm"></span> : "Execute"}
                </button>
              </div>
            </div>

            {/* Dispute Option */}
            <div className="bg-warning/10 rounded-xl p-4">
              <button className="btn btn-warning btn-sm" onClick={() => setShowDisputeForm(!showDisputeForm)}>
                ⚠️ Raise Dispute
              </button>
              {showDisputeForm && (
                <div className="mt-4 flex gap-2">
                  <input
                    type="text"
                    placeholder="Dispute reason"
                    className="input input-bordered flex-1"
                    value={disputeReason}
                    onChange={e => setDisputeReason(e.target.value)}
                  />
                  <button className="btn btn-error" onClick={handleDispute} disabled={!isConnected || isDisputing}>
                    {isDisputing ? <span className="loading loading-spinner loading-sm"></span> : "Submit"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* FINALIZED State */}
        {settlement.state === 3 && (
          <div className="bg-success/20 rounded-xl p-6 text-center">
            <span className="text-5xl">✅</span>
            <h3 className="font-bold text-xl mt-4">Settlement Complete!</h3>
            <p className="opacity-70">All {settlement.totalTransfers.toString()} transfers executed successfully.</p>
          </div>
        )}

        {/* DISPUTED State */}
        {settlement.state === 4 && (
          <div className="bg-error/20 rounded-xl p-6 text-center">
            <span className="text-5xl">⚠️</span>
            <h3 className="font-bold text-xl mt-4">Under Dispute</h3>
            <p className="opacity-70">This settlement is awaiting dispute resolution.</p>
          </div>
        )}

        {/* FAILED State */}
        {settlement.state === 5 && (
          <div className="bg-base-200 rounded-xl p-6 text-center">
            <span className="text-5xl">❌</span>
            <h3 className="font-bold text-xl mt-4">Settlement Failed</h3>
            {isEligibleForRefund && (
              <button className="btn btn-warning mt-4" onClick={handleRefund} disabled={!isConnected || isRefunding}>
                {isRefunding ? <span className="loading loading-spinner loading-sm"></span> : "Request Refund"}
              </button>
            )}
          </div>
        )}

        {/* Timeout Refund (for PENDING/INITIATED) */}
        {(settlement.state === 0 || settlement.state === 1) && isEligibleForRefund && (
          <div className="mt-4 pt-4 border-t border-base-300">
            <button
              className="btn btn-ghost btn-sm text-warning"
              onClick={handleRefund}
              disabled={!isConnected || isRefunding}
            >
              ⏰ Request Timeout Refund
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SettlementDetails;
