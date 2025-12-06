"use client";

import { useAccount } from "wagmi";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

/**
 * @title AdminPanel
 * @author TheBlocks Team - TriHacker Tournament 2025
 * @notice Admin controls for protocol management
 *
 * FEATURES:
 * - Protocol pause/unpause
 * - Oracle health monitoring
 * - System statistics dashboard
 *
 * NOTE: In demo mode (contracts not deployed), connected wallet is treated as admin
 */

export const AdminPanel = () => {
  const { address: connectedAddress } = useAccount();

  // Read admin address from contract (may be undefined if not deployed)
  const { data: adminAddress } = useScaffoldReadContract({
    contractName: "SettlementProtocol",
    functionName: "admin",
  });

  // Read pause status
  const { data: isPaused, refetch: refetchPaused } = useScaffoldReadContract({
    contractName: "SettlementProtocol",
    functionName: "paused",
  });

  // Read oracle health
  const { data: oracleHealth, refetch: refetchOracle } = useScaffoldReadContract({
    contractName: "SettlementProtocol",
    functionName: "getOracleHealth",
  });

  // Read manipulation status
  const { data: manipulationCheck } = useScaffoldReadContract({
    contractName: "SettlementProtocol",
    functionName: "checkManipulation",
  });

  // Read queue stats
  const { data: queueLength } = useScaffoldReadContract({
    contractName: "SettlementProtocol",
    functionName: "getQueueLength",
  });

  const { data: nextSettlementId } = useScaffoldReadContract({
    contractName: "SettlementProtocol",
    functionName: "nextSettlementId",
  });

  const { data: totalSettled } = useScaffoldReadContract({
    contractName: "SettlementProtocol",
    functionName: "totalSettledVolume",
  });

  // Contract writes
  const { writeContractAsync: pause } = useScaffoldWriteContract("SettlementProtocol");
  const { writeContractAsync: unpause } = useScaffoldWriteContract("SettlementProtocol");
  const { writeContractAsync: resetOracleStatus } = useScaffoldWriteContract("SettlementProtocol");

  // Demo mode: If contract not deployed, connected wallet is admin
  // In production: Use admin from contract
  const DEMO_ADMIN = "0x74dDa086DefBFE113E387e70f0304631972525E5".toLowerCase();
  const isContractDeployed = !!adminAddress;
  const isAdmin =
    connectedAddress &&
    (isContractDeployed
      ? connectedAddress.toLowerCase() === adminAddress?.toLowerCase()
      : connectedAddress.toLowerCase() === DEMO_ADMIN); // Demo: your wallet is admin

  // Oracle health parsing
  const chainlinkHealthy = oracleHealth?.[0] ?? false;
  const bandHealthy = oracleHealth?.[1] ?? false;
  const chainlinkConsecutiveFails = Number(oracleHealth?.[2] ?? 0);
  const bandConsecutiveFails = Number(oracleHealth?.[3] ?? 0);

  // Manipulation check parsing
  const isManipulated = manipulationCheck?.[0] ?? false;
  const manipulationReason = manipulationCheck?.[1] ?? "";

  const handlePause = async () => {
    try {
      await pause({ functionName: "pause" });
      notification.success("Protocol paused");
      refetchPaused();
    } catch (error: any) {
      notification.error(error?.message || "Failed to pause");
    }
  };

  const handleUnpause = async () => {
    try {
      await unpause({ functionName: "unpause" });
      notification.success("Protocol unpaused");
      refetchPaused();
    } catch (error: any) {
      notification.error(error?.message || "Failed to unpause");
    }
  };

  const handleResetOracle = async () => {
    try {
      await resetOracleStatus({ functionName: "resetOracleStatus" });
      notification.success("Oracle status reset");
      refetchOracle();
    } catch (error: any) {
      notification.error(error?.message || "Failed to reset oracle");
    }
  };

  return (
    <div className="bg-base-100 rounded-3xl shadow-lg p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-2 text-center">🛡️ Admin Panel</h2>
      <p className="text-center text-sm opacity-70 mb-6">Protocol management and monitoring</p>

      {/* Admin Status */}
      <div className={`alert ${isAdmin ? "alert-success" : "alert-warning"} mb-6`}>
        {isAdmin ? (
          <span>✅ You are the admin. Full access granted.</span>
        ) : (
          <span>⚠️ You are not the admin. View-only access.</span>
        )}
      </div>

      {/* System Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="stat bg-base-200 rounded-xl">
          <div className="stat-title">Total Settlements</div>
          <div className="stat-value">{((nextSettlementId ?? 1n) - 1n).toString()}</div>
          <div className="stat-desc">Created so far</div>
        </div>
        <div className="stat bg-base-200 rounded-xl">
          <div className="stat-title">Queue Length</div>
          <div className="stat-value">{queueLength?.toString() ?? "0"}</div>
          <div className="stat-desc">Pending settlements</div>
        </div>
        <div className="stat bg-base-200 rounded-xl">
          <div className="stat-title">Total Volume</div>
          <div className="stat-value text-lg">{totalSettled ? (Number(totalSettled) / 1e18).toFixed(2) : "0"} ETH</div>
          <div className="stat-desc">Successfully settled</div>
        </div>
      </div>

      {/* Protocol Status */}
      <div className="bg-base-200 rounded-xl p-4 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="font-semibold">Protocol Status</h3>
            <div className="flex items-center gap-2 mt-1">
              <div className={`badge ${isPaused ? "badge-error" : "badge-success"} badge-lg`}>
                {isPaused ? "🔴 PAUSED" : "🟢 ACTIVE"}
              </div>
            </div>
          </div>
          {isAdmin && (
            <div className="space-x-2">
              {isPaused ? (
                <button className="btn btn-success" onClick={handleUnpause}>
                  ▶️ Unpause
                </button>
              ) : (
                <button className="btn btn-error" onClick={handlePause}>
                  ⏸️ Pause
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Oracle Health Dashboard */}
      <div className="bg-base-200 rounded-xl p-4 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold">🔮 Oracle Health</h3>
          {isAdmin && (
            <button className="btn btn-sm btn-ghost" onClick={handleResetOracle}>
              🔄 Reset
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Chainlink Status */}
          <div
            className={`p-4 rounded-lg border ${chainlinkHealthy ? "border-success bg-success/10" : "border-error bg-error/10"}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">🔗</span>
              <span className="font-semibold">Chainlink</span>
              <span className={`badge ${chainlinkHealthy ? "badge-success" : "badge-error"} badge-sm`}>
                {chainlinkHealthy ? "Healthy" : "Unhealthy"}
              </span>
            </div>
            <p className="text-sm opacity-70">Consecutive Failures: {chainlinkConsecutiveFails}</p>
          </div>

          {/* Band Protocol Status */}
          <div
            className={`p-4 rounded-lg border ${bandHealthy ? "border-success bg-success/10" : "border-error bg-error/10"}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">📊</span>
              <span className="font-semibold">Band Protocol</span>
              <span className={`badge ${bandHealthy ? "badge-success" : "badge-error"} badge-sm`}>
                {bandHealthy ? "Healthy" : "Unhealthy"}
              </span>
            </div>
            <p className="text-sm opacity-70">Consecutive Failures: {bandConsecutiveFails}</p>
          </div>
        </div>

        {/* Manipulation Alert */}
        {isManipulated && (
          <div className="mt-4 alert alert-error">
            <span>🚨 Manipulation Detected: {manipulationReason}</span>
          </div>
        )}
      </div>

      {/* Invariants Status */}
      <div className="bg-base-200 rounded-xl p-4">
        <h3 className="font-semibold mb-4">📋 Active Invariants</h3>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="badge badge-success">✓</span>
            <span>Conservation of Value</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="badge badge-success">✓</span>
            <span>No Double Settlement</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="badge badge-success">✓</span>
            <span>Oracle Freshness (60s max staleness)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="badge badge-success">✓</span>
            <span>Timeout & Liveness</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="badge badge-success">✓</span>
            <span>Partial Finality Continuity</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
