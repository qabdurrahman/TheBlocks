"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

/**
 * @title DisputeInterface
 * @author TheBlocks Team - TriHacker Tournament 2025
 * @notice Interface for submitting and viewing disputes
 *
 * FEATURES:
 * - Submit disputes with evidence
 * - View dispute window countdown
 * - Dispute reason categories
 */

const DISPUTE_REASONS = [
  { id: "oracle_manipulation", label: "Oracle Price Manipulation", description: "Detected abnormal price deviation" },
  { id: "frontrunning", label: "Frontrunning Detected", description: "Transaction ordering was manipulated" },
  { id: "incorrect_amount", label: "Incorrect Amount", description: "Transfer amounts don't match agreement" },
  { id: "unauthorized", label: "Unauthorized Settlement", description: "Settlement was not authorized by parties" },
  { id: "other", label: "Other", description: "Other dispute reason" },
];

export const DisputeInterface = () => {
  const { isConnected } = useAccount();
  const [settlementId, setSettlementId] = useState<string>("1");
  const [selectedReason, setSelectedReason] = useState<string>("");
  const [customReason, setCustomReason] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Read settlement data
  const { data: settlementData } = useScaffoldReadContract({
    contractName: "SettlementProtocol",
    functionName: "getSettlement",
    args: [BigInt(settlementId || "0")],
  });

  // Read dispute period constant
  const { data: disputePeriod } = useScaffoldReadContract({
    contractName: "SettlementProtocol",
    functionName: "DISPUTE_PERIOD",
  });

  // Contract write
  const { writeContractAsync: disputeSettlement } = useScaffoldWriteContract("SettlementProtocol");

  // Check if settlement exists and is disputable
  const settlement = settlementData;
  const isDisputable = settlement && (settlement.state === 1n || settlement.state === 2n);

  // Get remaining blocks for dispute
  const getRemainingBlocks = () => {
    if (!disputePeriod) return 50; // Default
    return Number(disputePeriod);
  };

  const handleSubmitDispute = async () => {
    if (!isConnected) {
      notification.error("Please connect your wallet");
      return;
    }

    const reason =
      selectedReason === "other" ? customReason : DISPUTE_REASONS.find(r => r.id === selectedReason)?.label || "";

    if (!reason) {
      notification.error("Please select or enter a dispute reason");
      return;
    }

    setIsSubmitting(true);

    try {
      await disputeSettlement({
        functionName: "disputeSettlement",
        args: [BigInt(settlementId), reason],
      });
      notification.success("Dispute submitted successfully!");
      setSelectedReason("");
      setCustomReason("");
    } catch (error: any) {
      console.error("Dispute submission failed:", error);
      notification.error(error?.message || "Failed to submit dispute");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-base-100 rounded-3xl shadow-lg p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-2 text-center">⚠️ Dispute Center</h2>
      <p className="text-center text-sm opacity-70 mb-6">Submit disputes for settlements with suspicious activity</p>

      {/* Settlement Selector */}
      <div className="form-control mb-6">
        <label className="label">
          <span className="label-text font-semibold">Settlement ID</span>
        </label>
        <input
          type="number"
          min="1"
          className="input input-bordered"
          value={settlementId}
          onChange={e => setSettlementId(e.target.value)}
        />
      </div>

      {/* Settlement Status */}
      {settlement && settlement.id > 0n ? (
        <div className="bg-base-200 rounded-xl p-4 mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="font-semibold">Settlement #{settlement.id.toString()}</span>
            <span
              className={`badge ${
                settlement.state === 0n
                  ? "badge-warning"
                  : settlement.state === 1n
                    ? "badge-info"
                    : settlement.state === 4n
                      ? "badge-error"
                      : "badge-ghost"
              }`}
            >
              {settlement.state === 0n
                ? "PENDING"
                : settlement.state === 1n
                  ? "INITIATED"
                  : settlement.state === 2n
                    ? "EXECUTING"
                    : settlement.state === 3n
                      ? "FINALIZED"
                      : settlement.state === 4n
                        ? "DISPUTED"
                        : "FAILED"}
            </span>
          </div>
          <div className="text-sm opacity-70">
            <p>
              Initiator:{" "}
              <code className="text-xs">
                {settlement.initiator.slice(0, 6)}...{settlement.initiator.slice(-4)}
              </code>
            </p>
            <p>Dispute Period: {getRemainingBlocks()} blocks</p>
          </div>
        </div>
      ) : (
        <div className="bg-base-200 rounded-xl p-4 mb-6 text-center opacity-70">Settlement not found</div>
      )}

      {/* Dispute Form */}
      {isDisputable ? (
        <div className="space-y-6">
          {/* Reason Selection */}
          <div>
            <h3 className="font-semibold mb-3">Select Dispute Reason</h3>
            <div className="space-y-2">
              {DISPUTE_REASONS.map(reason => (
                <label
                  key={reason.id}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    selectedReason === reason.id ? "border-error bg-error/10" : "border-base-300 hover:border-error/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="dispute-reason"
                    className="radio radio-error mt-1"
                    checked={selectedReason === reason.id}
                    onChange={() => setSelectedReason(reason.id)}
                  />
                  <div>
                    <span className="font-medium">{reason.label}</span>
                    <p className="text-sm opacity-70">{reason.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Custom Reason Input */}
          {selectedReason === "other" && (
            <div className="form-control">
              <label className="label">
                <span className="label-text">Describe Your Dispute</span>
              </label>
              <textarea
                className="textarea textarea-bordered h-24"
                placeholder="Provide detailed reason for the dispute..."
                value={customReason}
                onChange={e => setCustomReason(e.target.value)}
              />
            </div>
          )}

          {/* Warning Box */}
          <div className="bg-warning/10 border border-warning/30 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <h4 className="font-semibold text-warning">Important Notice</h4>
                <p className="text-sm opacity-80">
                  Disputes are recorded on-chain and visible to all parties. Submitting a dispute will pause the
                  settlement until resolution.
                </p>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-center">
            <button
              className={`btn btn-error btn-lg ${isSubmitting ? "loading" : ""}`}
              onClick={handleSubmitDispute}
              disabled={!isConnected || isSubmitting || !selectedReason}
            >
              {isSubmitting ? "Submitting..." : "🚨 Submit Dispute"}
            </button>
          </div>
        </div>
      ) : settlement?.state === 4n ? (
        <div className="bg-error/10 rounded-xl p-6 text-center">
          <span className="text-4xl">⚠️</span>
          <h3 className="font-bold text-lg mt-2">Already Disputed</h3>
          <p className="opacity-70">This settlement is currently under dispute review.</p>
        </div>
      ) : settlement?.state === 3n ? (
        <div className="bg-base-200 rounded-xl p-6 text-center">
          <span className="text-4xl">✅</span>
          <h3 className="font-bold text-lg mt-2">Settlement Finalized</h3>
          <p className="opacity-70">This settlement has been finalized and cannot be disputed.</p>
        </div>
      ) : (
        <div className="bg-base-200 rounded-xl p-6 text-center">
          <span className="text-4xl">ℹ️</span>
          <h3 className="font-bold text-lg mt-2">Not Disputable</h3>
          <p className="opacity-70">Settlements can only be disputed during INITIATED or EXECUTING states.</p>
        </div>
      )}

      {!isConnected && <p className="text-center text-error mt-4">Please connect your wallet to submit a dispute</p>}
    </div>
  );
};

export default DisputeInterface;
