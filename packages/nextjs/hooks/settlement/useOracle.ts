"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

/**
 * @title useOracle Hook
 * @author TheBlocks Team - TriHacker Tournament 2025
 * @notice Oracle price management and health monitoring hook
 *
 * FEATURES:
 * - Dual oracle price fetching (Chainlink + Band)
 * - Price deviation detection
 * - Oracle health status
 * - Manipulation alerts
 * - Admin controls
 */

export interface OraclePrice {
  price: bigint;
  timestamp: number;
  isStale: boolean;
  source: "chainlink" | "band" | "fallback";
}

export interface OracleHealth {
  chainlinkHealthy: boolean;
  bandHealthy: boolean;
  chainlinkFailures: number;
  bandFailures: number;
  lastUpdateBlock: bigint;
}

export interface ManipulationStatus {
  isManipulated: boolean;
  reason: string;
  deviation: number;
}

export const useOracle = () => {
  const [priceHistory, setPriceHistory] = useState<OraclePrice[]>([]);
  const [lastRefresh, setLastRefresh] = useState<number>(Date.now());

  // Read current ETH/USD price
  const {
    data: currentPrice,
    refetch: refetchPrice,
    isLoading: isLoadingPrice,
  } = useScaffoldReadContract({
    contractName: "SettlementProtocol",
    functionName: "getEthUsdPrice",
  });

  // Read oracle health
  const {
    data: oracleHealthData,
    refetch: refetchHealth,
    isLoading: isLoadingHealth,
  } = useScaffoldReadContract({
    contractName: "SettlementProtocol",
    functionName: "getOracleHealth",
  });

  // Read manipulation check
  const {
    data: manipulationData,
    refetch: refetchManipulation,
    isLoading: isLoadingManipulation,
  } = useScaffoldReadContract({
    contractName: "SettlementProtocol",
    functionName: "checkManipulation",
  });

  // Read price deviation threshold
  const { data: deviationThreshold } = useScaffoldReadContract({
    contractName: "SettlementProtocol",
    functionName: "PRICE_DEVIATION_THRESHOLD",
  });

  // Read max oracle failures
  const { data: maxOracleFailures } = useScaffoldReadContract({
    contractName: "SettlementProtocol",
    functionName: "MAX_ORACLE_FAILURES",
  });

  // Read staleness threshold
  const { data: stalenessThreshold } = useScaffoldReadContract({
    contractName: "SettlementProtocol",
    functionName: "STALENESS_THRESHOLD",
  });

  // Admin write functions
  const { writeContractAsync: resetOracleFn, isPending: isResetting } = useScaffoldWriteContract("SettlementProtocol");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { writeContractAsync: forceOracleRefreshFn, isPending: isForcing } =
    useScaffoldWriteContract("SettlementProtocol");

  // Parse oracle health - memoize to prevent re-render dependency issues
  const oracleHealth: OracleHealth = useMemo(
    () => ({
      chainlinkHealthy: oracleHealthData?.[0] ?? true,
      bandHealthy: oracleHealthData?.[1] ?? true,
      chainlinkFailures: Number(oracleHealthData?.[2] ?? 0),
      bandFailures: Number(oracleHealthData?.[3] ?? 0),
      lastUpdateBlock: oracleHealthData?.[4] ?? 0n,
    }),
    [oracleHealthData],
  );

  // Parse manipulation status - memoize to prevent re-render dependency issues
  const manipulationStatus: ManipulationStatus = useMemo(
    () => ({
      isManipulated: manipulationData?.[0] ?? false,
      reason: manipulationData?.[1] ?? "",
      deviation: 0, // Calculate from prices if available
    }),
    [manipulationData],
  );

  // Format price for display (8 decimals for Chainlink)
  const formatPrice = useCallback((price: bigint, decimals = 8) => {
    return parseFloat(formatUnits(price, decimals)).toFixed(2);
  }, []);

  // Get formatted current price
  const formattedPrice = currentPrice ? formatPrice(currentPrice) : "0.00";

  // Calculate health score (0-100)
  const getHealthScore = useCallback(() => {
    let score = 100;
    if (!oracleHealth.chainlinkHealthy) score -= 40;
    if (!oracleHealth.bandHealthy) score -= 40;
    score -= oracleHealth.chainlinkFailures * 5;
    score -= oracleHealth.bandFailures * 5;
    if (manipulationStatus.isManipulated) score -= 20;
    return Math.max(0, score);
  }, [oracleHealth, manipulationStatus]);

  // Get health status label
  const getHealthLabel = useCallback(() => {
    const score = getHealthScore();
    if (score >= 80) return { label: "Healthy", color: "success" };
    if (score >= 50) return { label: "Degraded", color: "warning" };
    return { label: "Critical", color: "error" };
  }, [getHealthScore]);

  // Admin: Reset oracle status
  const resetOracleStatus = useCallback(async () => {
    const result = await resetOracleFn({
      functionName: "resetOracleStatus",
    });
    refetchHealth();
    return result;
  }, [resetOracleFn, refetchHealth]);

  // Refresh all oracle data
  const refreshAll = useCallback(() => {
    refetchPrice();
    refetchHealth();
    refetchManipulation();
    setLastRefresh(Date.now());
  }, [refetchPrice, refetchHealth, refetchManipulation]);

  // Add price to history on update
  useEffect(() => {
    if (currentPrice) {
      const newPrice: OraclePrice = {
        price: currentPrice,
        timestamp: Date.now(),
        isStale: false,
        source: "chainlink", // Default assumption
      };

      setPriceHistory(prev => {
        const updated = [...prev, newPrice];
        // Keep last 100 prices
        return updated.slice(-100);
      });
    }
  }, [currentPrice]);

  // Calculate price change percentage
  const getPriceChange = useCallback(() => {
    if (priceHistory.length < 2) return 0;
    const current = priceHistory[priceHistory.length - 1].price;
    const previous = priceHistory[priceHistory.length - 2].price;
    if (previous === 0n) return 0;
    return Number(((current - previous) * 10000n) / previous) / 100;
  }, [priceHistory]);

  return {
    // Price data
    currentPrice,
    formattedPrice,
    priceHistory,
    priceChange: getPriceChange(),

    // Oracle health
    oracleHealth,
    healthScore: getHealthScore(),
    healthStatus: getHealthLabel(),

    // Manipulation status
    manipulationStatus,
    isManipulated: manipulationStatus.isManipulated,

    // Configuration
    deviationThreshold: deviationThreshold ? Number(deviationThreshold) : 500, // Default 5%
    maxOracleFailures: maxOracleFailures ? Number(maxOracleFailures) : 5,
    stalenessThreshold: stalenessThreshold ? Number(stalenessThreshold) : 3600,

    // Actions
    resetOracleStatus,
    refreshAll,

    // Loading states
    isLoading: isLoadingPrice || isLoadingHealth || isLoadingManipulation,
    isResetting,
    isForcing,

    // Utilities
    formatPrice,
    lastRefresh,
  };
};

export default useOracle;
