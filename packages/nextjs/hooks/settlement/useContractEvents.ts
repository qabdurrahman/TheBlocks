"use client";

import { useCallback, useRef, useState } from "react";
import { formatEther } from "viem";
import { useScaffoldEventHistory, useScaffoldWatchContractEvent } from "~~/hooks/scaffold-eth";

/**
 * @title useContractEvents Hook
 * @author TheBlocks Team - TriHacker Tournament 2025
 * @notice Real-time contract event monitoring hook
 *
 * FEATURES:
 * - Live event subscription
 * - Event history retrieval
 * - Event filtering
 * - Event aggregation for statistics
 */

export interface ContractEvent {
  id: string;
  eventName: string;
  blockNumber: bigint;
  transactionHash: string;
  timestamp: number;
  args: Record<string, any>;
  formatted: string;
}

export interface EventStats {
  totalSettlementsCreated: number;
  totalDeposits: number;
  totalExecutions: number;
  totalDisputes: number;
  totalVolume: bigint;
  last24hEvents: number;
}

const MAX_EVENTS = 100;

export const useContractEvents = () => {
  const [events, setEvents] = useState<ContractEvent[]>([]);
  const [isSubscribed, setIsSubscribed] = useState(true);
  const eventIdCounter = useRef(0);

  // Track stats
  const [stats, setStats] = useState<EventStats>({
    totalSettlementsCreated: 0,
    totalDeposits: 0,
    totalExecutions: 0,
    totalDisputes: 0,
    totalVolume: 0n,
    last24hEvents: 0,
  });

  // Format event for display (before addEvent since it's used in addEvent)
  const formatEventLog = (eventName: string, args: any): string => {
    switch (eventName) {
      case "SettlementCreated":
        return `Settlement #${args.settlementId} created by ${args.initiator?.slice(0, 8)}... (${args.transferCount} transfers)`;
      case "SettlementInitiated":
        return `Settlement #${args.settlementId} initiated at block ${args.blockNumber}`;
      case "SettlementExecuted":
        return `Settlement #${args.settlementId} executed ${args.executedTransfers}/${args.totalTransfers} transfers`;
      case "SettlementFinalized":
        return `Settlement #${args.settlementId} finalized - ${formatEther(args.totalAmount || 0n)} ETH settled`;
      case "DepositMade":
        return `Deposit of ${formatEther(args.amount || 0n)} ETH to Settlement #${args.settlementId}`;
      case "DisputeRaised":
        return `Dispute raised on Settlement #${args.settlementId}: "${args.reason}"`;
      case "DisputeResolved":
        return `Dispute resolved on Settlement #${args.settlementId} - Favor: ${args.favorDefendant ? "Defendant" : "Plaintiff"}`;
      case "RefundIssued":
        return `Refund of ${formatEther(args.amount || 0n)} ETH issued for Settlement #${args.settlementId}`;
      case "MEVPreventionEnforced":
        return `MEV Prevention: Settlement #${args.settlementId} - "${args.reason}"`;
      case "OracleUpdated":
        return `Oracle updated: ${formatEther(args.price || 0n)} (source: ${args.source})`;
      default:
        return `${eventName}: ${JSON.stringify(args)}`;
    }
  };

  // Update statistics based on event (before addEvent since it's used in addEvent)
  const updateStats = useCallback((eventName: string, args: any) => {
    setStats(prev => {
      const updated = { ...prev };
      updated.last24hEvents++;

      switch (eventName) {
        case "SettlementCreated":
          updated.totalSettlementsCreated++;
          break;
        case "DepositMade":
          updated.totalDeposits++;
          updated.totalVolume += args.amount || 0n;
          break;
        case "SettlementExecuted":
        case "SettlementFinalized":
          updated.totalExecutions++;
          break;
        case "DisputeRaised":
          updated.totalDisputes++;
          break;
      }

      return updated;
    });
  }, []);

  // Helper to add event
  const addEvent = useCallback(
    (eventName: string, log: any) => {
      if (!isSubscribed) return;

      const newEvent: ContractEvent = {
        id: `${eventName}-${eventIdCounter.current++}`,
        eventName,
        blockNumber: log.blockNumber || 0n,
        transactionHash: log.transactionHash || "",
        timestamp: Date.now(),
        args: log.args || {},
        formatted: formatEventLog(eventName, log.args),
      };

      setEvents(prev => {
        const updated = [newEvent, ...prev];
        return updated.slice(0, MAX_EVENTS);
      });

      // Update stats
      updateStats(eventName, log.args);
    },
    [isSubscribed, updateStats, formatEventLog],
  );

  // Watch Settlement Events
  useScaffoldWatchContractEvent({
    contractName: "SettlementProtocol",
    eventName: "SettlementCreated",
    onLogs: logs => {
      logs.forEach(log => addEvent("SettlementCreated", log));
    },
  });

  useScaffoldWatchContractEvent({
    contractName: "SettlementProtocol",
    eventName: "SettlementInitiated",
    onLogs: logs => {
      logs.forEach(log => addEvent("SettlementInitiated", log));
    },
  });

  useScaffoldWatchContractEvent({
    contractName: "SettlementProtocol",
    eventName: "SettlementExecuted",
    onLogs: logs => {
      logs.forEach(log => addEvent("SettlementExecuted", log));
    },
  });

  useScaffoldWatchContractEvent({
    contractName: "SettlementProtocol",
    eventName: "SettlementFinalized",
    onLogs: logs => {
      logs.forEach(log => addEvent("SettlementFinalized", log));
    },
  });

  useScaffoldWatchContractEvent({
    contractName: "SettlementProtocol",
    eventName: "DepositMade",
    onLogs: logs => {
      logs.forEach(log => addEvent("DepositMade", log));
    },
  });

  useScaffoldWatchContractEvent({
    contractName: "SettlementProtocol",
    eventName: "DisputeRaised",
    onLogs: logs => {
      logs.forEach(log => addEvent("DisputeRaised", log));
    },
  });

  useScaffoldWatchContractEvent({
    contractName: "SettlementProtocol",
    eventName: "DisputeResolved",
    onLogs: logs => {
      logs.forEach(log => addEvent("DisputeResolved", log));
    },
  });

  useScaffoldWatchContractEvent({
    contractName: "SettlementProtocol",
    eventName: "RefundIssued",
    onLogs: logs => {
      logs.forEach(log => addEvent("RefundIssued", log));
    },
  });

  // Event history (past events)
  const { data: settlementCreatedHistory } = useScaffoldEventHistory({
    contractName: "SettlementProtocol",
    eventName: "SettlementCreated",
    fromBlock: 0n,
    blockData: true,
  });

  const { data: depositHistory } = useScaffoldEventHistory({
    contractName: "SettlementProtocol",
    eventName: "DepositMade",
    fromBlock: 0n,
    blockData: true,
  });

  // Filter functions
  const filterByEventName = useCallback((eventName: string) => events.filter(e => e.eventName === eventName), [events]);

  const filterBySettlement = useCallback(
    (settlementId: bigint) => events.filter(e => e.args.settlementId === settlementId),
    [events],
  );

  const filterByTimeRange = useCallback(
    (startTime: number, endTime: number = Date.now()) =>
      events.filter(e => e.timestamp >= startTime && e.timestamp <= endTime),
    [events],
  );

  // Get recent events
  const getRecentEvents = useCallback((count: number = 10) => events.slice(0, count), [events]);

  // Clear events
  const clearEvents = useCallback(() => {
    setEvents([]);
    setStats({
      totalSettlementsCreated: 0,
      totalDeposits: 0,
      totalExecutions: 0,
      totalDisputes: 0,
      totalVolume: 0n,
      last24hEvents: 0,
    });
  }, []);

  // Toggle subscription
  const toggleSubscription = useCallback(() => {
    setIsSubscribed(prev => !prev);
  }, []);

  // Get event color based on type
  const getEventColor = useCallback((eventName: string): string => {
    const colors: Record<string, string> = {
      SettlementCreated: "badge-primary",
      SettlementInitiated: "badge-info",
      SettlementExecuted: "badge-accent",
      SettlementFinalized: "badge-success",
      DepositMade: "badge-secondary",
      DisputeRaised: "badge-error",
      DisputeResolved: "badge-warning",
      RefundIssued: "badge-ghost",
      MEVPreventionEnforced: "badge-warning",
      OracleUpdated: "badge-info",
    };
    return colors[eventName] || "badge-ghost";
  }, []);

  // Get event icon
  const getEventIcon = useCallback((eventName: string): string => {
    const icons: Record<string, string> = {
      SettlementCreated: "📝",
      SettlementInitiated: "🚀",
      SettlementExecuted: "⚡",
      SettlementFinalized: "✅",
      DepositMade: "💰",
      DisputeRaised: "⚠️",
      DisputeResolved: "⚖️",
      RefundIssued: "↩️",
      MEVPreventionEnforced: "🛡️",
      OracleUpdated: "🔮",
    };
    return icons[eventName] || "📌";
  }, []);

  return {
    // Event data
    events,
    stats,
    eventCount: events.length,

    // Historical data
    settlementCreatedHistory,
    depositHistory,

    // Subscription
    isSubscribed,
    toggleSubscription,

    // Filters
    filterByEventName,
    filterBySettlement,
    filterByTimeRange,
    getRecentEvents,

    // Actions
    clearEvents,

    // Utilities
    getEventColor,
    getEventIcon,
  };
};

export default useContractEvents;
