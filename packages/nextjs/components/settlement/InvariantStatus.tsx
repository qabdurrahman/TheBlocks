"use client";

import { useState } from "react";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

/**
 * @title InvariantStatus
 * @author TheBlocks Team - TriHacker Tournament 2025
 * @notice Display and verify the 5 settlement invariants
 *
 * INVARIANTS:
 * 1. Conservation - Total in = Total out + fees
 * 2. No Double Settlement - Each settlement finalized once
 * 3. Freshness - Oracle prices within threshold
 * 4. Timeout Guarantee - Refunds after timeout
 * 5. Partial Finality - Executed transfers remain settled
 */

interface InvariantCheck {
  id: number;
  name: string;
  description: string;
  icon: string;
  status: "passed" | "failed" | "checking" | "unknown";
  details?: string;
}

const INVARIANT_DEFINITIONS: Omit<InvariantCheck, "status" | "details">[] = [
  {
    id: 1,
    name: "Conservation",
    description: "Total deposits equal total transfers + fees",
    icon: "⚖️",
  },
  {
    id: 2,
    name: "No Double Settlement",
    description: "Each settlement finalized exactly once",
    icon: "🔒",
  },
  {
    id: 3,
    name: "Price Freshness",
    description: "Oracle prices within staleness threshold",
    icon: "⏱️",
  },
  {
    id: 4,
    name: "Timeout Guarantee",
    description: "Refunds available after timeout period",
    icon: "⏰",
  },
  {
    id: 5,
    name: "Partial Finality",
    description: "Executed transfers cannot be reversed",
    icon: "✅",
  },
];

interface InvariantStatusProps {
  settlementId?: bigint;
}

export const InvariantStatus = ({ settlementId }: InvariantStatusProps) => {
  const [isCheckingAll, setIsCheckingAll] = useState(false);

  // Read invariant check results
  const {
    data: invariantResults,
    refetch: refetchInvariants,
    isLoading,
  } = useScaffoldReadContract({
    contractName: "SettlementProtocol",
    functionName: "checkAllInvariants",
    args: settlementId ? [settlementId] : undefined,
  });

  // Read individual invariant for specific settlement (available for future use)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: conservationResult } = useScaffoldReadContract({
    contractName: "SettlementProtocol",
    functionName: "verifyConservation",
    args: settlementId ? [settlementId] : undefined,
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: freshnessResult } = useScaffoldReadContract({
    contractName: "SettlementProtocol",
    functionName: "verifyFreshness",
  });

  // Parse results
  const parseInvariantResults = (): InvariantCheck[] => {
    if (isLoading) {
      return INVARIANT_DEFINITIONS.map(inv => ({
        ...inv,
        status: "checking" as const,
      }));
    }

    if (!invariantResults) {
      return INVARIANT_DEFINITIONS.map(inv => ({
        ...inv,
        status: "unknown" as const,
      }));
    }

    // Parse array of results [bool, bool, bool, bool, bool, string[]]
    const [conservation, noDouble, freshness, timeout, partial, reasons] = invariantResults as [
      boolean,
      boolean,
      boolean,
      boolean,
      boolean,
      string[],
    ];

    return [
      {
        ...INVARIANT_DEFINITIONS[0],
        status: conservation ? "passed" : "failed",
        details: reasons?.[0] || undefined,
      },
      {
        ...INVARIANT_DEFINITIONS[1],
        status: noDouble ? "passed" : "failed",
        details: reasons?.[1] || undefined,
      },
      {
        ...INVARIANT_DEFINITIONS[2],
        status: freshness ? "passed" : "failed",
        details: reasons?.[2] || undefined,
      },
      {
        ...INVARIANT_DEFINITIONS[3],
        status: timeout ? "passed" : "failed",
        details: reasons?.[3] || undefined,
      },
      {
        ...INVARIANT_DEFINITIONS[4],
        status: partial ? "passed" : "failed",
        details: reasons?.[4] || undefined,
      },
    ];
  };

  const invariants = parseInvariantResults();
  const passedCount = invariants.filter(i => i.status === "passed").length;
  const failedCount = invariants.filter(i => i.status === "failed").length;
  const allPassed = passedCount === 5;

  const handleCheckAll = async () => {
    setIsCheckingAll(true);
    await refetchInvariants();
    setIsCheckingAll(false);
  };

  const getStatusBadge = (status: InvariantCheck["status"]) => {
    switch (status) {
      case "passed":
        return <span className="badge badge-success badge-sm">✓ Passed</span>;
      case "failed":
        return <span className="badge badge-error badge-sm">✗ Failed</span>;
      case "checking":
        return (
          <span className="badge badge-ghost badge-sm">
            <span className="loading loading-spinner loading-xs mr-1"></span>
            Checking
          </span>
        );
      default:
        return <span className="badge badge-ghost badge-sm">? Unknown</span>;
    }
  };

  return (
    <div className="bg-base-100 rounded-3xl shadow-lg p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold">🛡️ Invariant Checker</h2>
          <p className="text-sm opacity-70">
            {settlementId ? `Settlement #${settlementId.toString()}` : "Protocol-wide checks"}
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={handleCheckAll} disabled={isCheckingAll || isLoading}>
          {isCheckingAll || isLoading ? <span className="loading loading-spinner loading-sm"></span> : "🔍 Verify All"}
        </button>
      </div>

      {/* Summary */}
      <div
        className={`rounded-2xl p-4 mb-6 ${
          allPassed ? "bg-success/20" : failedCount > 0 ? "bg-error/20" : "bg-base-200"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{allPassed ? "✅" : failedCount > 0 ? "⚠️" : "🔍"}</span>
            <div>
              <h3 className="font-bold">
                {allPassed
                  ? "All Invariants Valid"
                  : failedCount > 0
                    ? `${failedCount} Invariant${failedCount > 1 ? "s" : ""} Failed`
                    : "Verification Pending"}
              </h3>
              <p className="text-sm opacity-70">{passedCount}/5 checks passed</p>
            </div>
          </div>
          <div className="radial-progress text-primary" style={{ "--value": (passedCount / 5) * 100 } as any}>
            {passedCount}/5
          </div>
        </div>
      </div>

      {/* Invariant List */}
      <div className="space-y-3">
        {invariants.map(invariant => (
          <div
            key={invariant.id}
            className={`rounded-xl p-4 border-2 transition-all ${
              invariant.status === "passed"
                ? "border-success/30 bg-success/5"
                : invariant.status === "failed"
                  ? "border-error/30 bg-error/5"
                  : "border-base-300 bg-base-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{invariant.icon}</span>
                <div>
                  <h4 className="font-semibold">
                    {invariant.id}. {invariant.name}
                  </h4>
                  <p className="text-sm opacity-70">{invariant.description}</p>
                </div>
              </div>
              {getStatusBadge(invariant.status)}
            </div>
            {invariant.details && invariant.status === "failed" && (
              <div className="mt-2 p-2 bg-error/10 rounded-lg">
                <p className="text-sm text-error">⚠️ {invariant.details}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Documentation Link */}
      <div className="mt-6 pt-4 border-t border-base-300">
        <div className="flex items-center gap-2 text-sm opacity-60">
          <span>📚</span>
          <span>
            These invariants ensure adversarial resilience as described in{" "}
            <code className="text-primary">INVARIANTS_PROOF.md</code>
          </span>
        </div>
      </div>
    </div>
  );
};

export default InvariantStatus;
