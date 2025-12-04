"use client";

import { useEffect, useState } from "react";
import { useOracle } from "~~/hooks/settlement";

/**
 * @title OraclePriceDisplay
 * @author TheBlocks Team - TriHacker Tournament 2025
 * @notice Real-time oracle price display with health indicators
 *
 * FEATURES:
 * - Live ETH/USD price
 * - Price change indicator
 * - Oracle health status
 * - Manipulation alerts
 * - Auto-refresh
 */

export const OraclePriceDisplay = () => {
  const {
    formattedPrice,
    priceChange,
    oracleHealth,
    healthScore,
    healthStatus,
    manipulationStatus,
    isManipulated,
    refreshAll,
    isLoading,
    lastRefresh,
  } = useOracle();

  const [autoRefresh, setAutoRefresh] = useState(true);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      refreshAll();
    }, 30000);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshAll]);

  // Format last refresh time
  const getLastRefreshText = () => {
    const seconds = Math.floor((Date.now() - lastRefresh) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.floor(seconds / 60)}m ago`;
  };

  return (
    <div className="bg-base-100 rounded-3xl shadow-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">🔮 Oracle Status</h2>
        <div className="flex items-center gap-2">
          <label className="label cursor-pointer gap-2">
            <span className="label-text text-xs">Auto</span>
            <input
              type="checkbox"
              className="toggle toggle-sm toggle-primary"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
            />
          </label>
          <button className="btn btn-circle btn-sm btn-ghost" onClick={refreshAll} disabled={isLoading}>
            {isLoading ? <span className="loading loading-spinner loading-xs"></span> : "🔄"}
          </button>
        </div>
      </div>

      {/* Price Display */}
      <div className="bg-gradient-to-r from-primary/10 to-secondary/10 rounded-2xl p-6 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm opacity-60">ETH/USD</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold font-mono">${formattedPrice}</span>
              <span
                className={`text-sm font-semibold ${
                  priceChange > 0 ? "text-success" : priceChange < 0 ? "text-error" : "opacity-50"
                }`}
              >
                {priceChange > 0 ? "+" : ""}
                {priceChange.toFixed(2)}%
              </span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs opacity-50">Updated</p>
            <p className="text-sm">{getLastRefreshText()}</p>
          </div>
        </div>
      </div>

      {/* Health Score */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-semibold">Health Score</span>
          <span className={`badge badge-${healthStatus.color} badge-sm`}>{healthStatus.label}</span>
        </div>
        <progress
          className={`progress progress-${healthStatus.color} w-full h-3`}
          value={healthScore}
          max={100}
        ></progress>
        <div className="flex justify-between text-xs opacity-60 mt-1">
          <span>0</span>
          <span>{healthScore}%</span>
          <span>100</span>
        </div>
      </div>

      {/* Manipulation Alert */}
      {isManipulated && (
        <div className="alert alert-error mb-4">
          <span className="text-xl">⚠️</span>
          <div>
            <h3 className="font-bold">Manipulation Detected!</h3>
            <p className="text-sm">{manipulationStatus.reason}</p>
          </div>
        </div>
      )}

      {/* Oracle Sources */}
      <div className="grid grid-cols-2 gap-3">
        {/* Chainlink Status */}
        <div
          className={`p-4 rounded-xl border-2 ${
            oracleHealth.chainlinkHealthy ? "border-success/30 bg-success/5" : "border-error/30 bg-error/5"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🔗</span>
            <span className="font-semibold text-sm">Chainlink</span>
          </div>
          <div className="flex items-center justify-between">
            <span className={`badge badge-sm ${oracleHealth.chainlinkHealthy ? "badge-success" : "badge-error"}`}>
              {oracleHealth.chainlinkHealthy ? "Active" : "Failed"}
            </span>
            <span className="text-xs opacity-60">Fails: {oracleHealth.chainlinkFailures}</span>
          </div>
        </div>

        {/* Band Protocol Status */}
        <div
          className={`p-4 rounded-xl border-2 ${
            oracleHealth.bandHealthy ? "border-success/30 bg-success/5" : "border-error/30 bg-error/5"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">📊</span>
            <span className="font-semibold text-sm">Band</span>
          </div>
          <div className="flex items-center justify-between">
            <span className={`badge badge-sm ${oracleHealth.bandHealthy ? "badge-success" : "badge-error"}`}>
              {oracleHealth.bandHealthy ? "Active" : "Failed"}
            </span>
            <span className="text-xs opacity-60">Fails: {oracleHealth.bandFailures}</span>
          </div>
        </div>
      </div>

      {/* Info Footer */}
      <div className="mt-4 pt-4 border-t border-base-300">
        <div className="flex justify-between text-xs opacity-60">
          <span>Deviation Threshold: 5%</span>
          <span>Max Failures: 5</span>
        </div>
      </div>
    </div>
  );
};

export default OraclePriceDisplay;
