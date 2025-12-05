"use client";

import { useCallback, useState } from "react";
import { formatEther, parseEther } from "viem";
import { useAccount } from "wagmi";
import {
  useScaffoldReadContract,
  useScaffoldWatchContractEvent,
  useScaffoldWriteContract,
} from "~~/hooks/scaffold-eth";

/**
 * @title useSettlements Hook
 * @author TheBlocks Team - TriHacker Tournament 2025
 * @notice Comprehensive settlement state management hook
 *
 * FEATURES:
 * - Full CRUD for settlements
 * - Real-time state updates via events
 * - Queue management
 * - User settlement tracking
 */

export interface Settlement {
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

export interface Transfer {
  from: string;
  to: string;
  amount: bigint;
  executed: boolean;
}

export interface SettlementDetails {
  settlement: Settlement | null;
  transfers: Transfer[];
  canInitiate: boolean;
  initiateReason: string;
  isEligibleForRefund: boolean;
}

const STATE_NAMES = ["PENDING", "INITIATED", "EXECUTING", "FINALIZED", "DISPUTED", "FAILED"];

export const useSettlements = (settlementId?: bigint) => {
  const { address: connectedAddress, isConnected } = useAccount();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [userSettlements, setUserSettlements] = useState<bigint[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isLoading, setIsLoading] = useState(false);

  // Read single settlement
  const {
    data: settlementData,
    refetch: refetchSettlement,
    isLoading: isLoadingSettlement,
  } = useScaffoldReadContract({
    contractName: "SettlementProtocol",
    functionName: "getSettlement",
    args: settlementId ? [settlementId] : undefined,
  });

  // Read settlement details (with transfers)
  const { data: settlementDetails, refetch: refetchDetails } = useScaffoldReadContract({
    contractName: "SettlementProtocol",
    functionName: "getSettlementDetails",
    args: settlementId ? [settlementId] : undefined,
  });

  // Read can initiate status
  const { data: canInitiateData } = useScaffoldReadContract({
    contractName: "SettlementProtocol",
    functionName: "canInitiate",
    args: settlementId ? [settlementId] : undefined,
  });

  // Read refund eligibility
  const { data: isEligibleForRefund } = useScaffoldReadContract({
    contractName: "SettlementProtocol",
    functionName: "isEligibleForRefund",
    args: settlementId ? [settlementId] : undefined,
  });

  // Queue data
  const { data: queueHead, refetch: refetchQueueHead } = useScaffoldReadContract({
    contractName: "SettlementProtocol",
    functionName: "queueHead",
  });

  const { data: queueLength, refetch: refetchQueueLength } = useScaffoldReadContract({
    contractName: "SettlementProtocol",
    functionName: "getQueueLength",
  });

  const { data: nextSettlementId, refetch: refetchNextId } = useScaffoldReadContract({
    contractName: "SettlementProtocol",
    functionName: "nextSettlementId",
  });

  // Contract writes
  const { writeContractAsync: createSettlementFn, isPending: isCreating } =
    useScaffoldWriteContract("SettlementProtocol");
  const { writeContractAsync: depositFn, isPending: isDepositing } = useScaffoldWriteContract("SettlementProtocol");
  const { writeContractAsync: initiateFn, isPending: isInitiating } = useScaffoldWriteContract("SettlementProtocol");
  const { writeContractAsync: executeFn, isPending: isExecuting } = useScaffoldWriteContract("SettlementProtocol");
  const { writeContractAsync: refundFn, isPending: isRefunding } = useScaffoldWriteContract("SettlementProtocol");
  const { writeContractAsync: disputeFn, isPending: isDisputing } = useScaffoldWriteContract("SettlementProtocol");

  // Watch settlement events
  useScaffoldWatchContractEvent({
    contractName: "SettlementProtocol",
    eventName: "SettlementCreated",
    onLogs: logs => {
      console.log("Settlement created:", logs);
      refetchQueueLength();
      refetchNextId();
      if (settlementId) refetchSettlement();
    },
  });

  useScaffoldWatchContractEvent({
    contractName: "SettlementProtocol",
    eventName: "SettlementInitiated",
    onLogs: logs => {
      console.log("Settlement initiated:", logs);
      refetchQueueHead();
      if (settlementId) refetchSettlement();
    },
  });

  useScaffoldWatchContractEvent({
    contractName: "SettlementProtocol",
    eventName: "SettlementExecuted",
    onLogs: logs => {
      console.log("Settlement executed:", logs);
      refetchQueueHead();
      refetchQueueLength();
      if (settlementId) refetchSettlement();
    },
  });

  useScaffoldWatchContractEvent({
    contractName: "SettlementProtocol",
    eventName: "DepositMade",
    onLogs: logs => {
      console.log("Deposit made:", logs);
      if (settlementId) refetchSettlement();
    },
  });

  useScaffoldWatchContractEvent({
    contractName: "SettlementProtocol",
    eventName: "DisputeRaised",
    onLogs: logs => {
      console.log("Dispute raised:", logs);
      if (settlementId) refetchSettlement();
    },
  });

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

  // Parse transfers from details
  const transfers: Transfer[] = settlementDetails
    ? settlementDetails.transfers?.map((t: any) => ({
        from: t.from,
        to: t.to,
        amount: t.amount,
        executed: t.executed,
      })) || []
    : [];

  // CRUD Operations
  const createSettlement = useCallback(
    async (transfersList: { from: string; to: string; amount: string }[], customTimeout?: number) => {
      if (!isConnected) throw new Error("Wallet not connected");

      const formattedTransfers = transfersList.map(t => ({
        from: t.from as `0x${string}`,
        to: t.to as `0x${string}`,
        amount: parseEther(t.amount),
        executed: false,
      }));

      const timeout = customTimeout ? BigInt(customTimeout) : 0n;

      const result = await createSettlementFn({
        functionName: "createSettlement",
        args: [formattedTransfers, timeout],
      });

      return result;
    },
    [isConnected, createSettlementFn],
  );

  const deposit = useCallback(
    async (id: bigint, amountEth: string) => {
      if (!isConnected) throw new Error("Wallet not connected");

      const result = await depositFn({
        functionName: "deposit",
        args: [id],
        value: parseEther(amountEth),
      });

      refetchSettlement();
      return result;
    },
    [isConnected, depositFn, refetchSettlement],
  );

  const initiateSettlement = useCallback(
    async (id: bigint) => {
      if (!isConnected) throw new Error("Wallet not connected");

      const result = await initiateFn({
        functionName: "initiateSettlement",
        args: [id],
      });

      refetchSettlement();
      return result;
    },
    [isConnected, initiateFn, refetchSettlement],
  );

  const executeSettlement = useCallback(
    async (id: bigint, transferCount: number) => {
      if (!isConnected) throw new Error("Wallet not connected");

      const result = await executeFn({
        functionName: "executeSettlement",
        args: [id, BigInt(transferCount)],
      });

      refetchSettlement();
      return result;
    },
    [isConnected, executeFn, refetchSettlement],
  );

  const refundSettlement = useCallback(
    async (id: bigint) => {
      if (!isConnected) throw new Error("Wallet not connected");

      const result = await refundFn({
        functionName: "refundSettlement",
        args: [id],
      });

      refetchSettlement();
      return result;
    },
    [isConnected, refundFn, refetchSettlement],
  );

  const disputeSettlement = useCallback(
    async (id: bigint, reason: string) => {
      if (!isConnected) throw new Error("Wallet not connected");

      const result = await disputeFn({
        functionName: "disputeSettlement",
        args: [id, reason],
      });

      refetchSettlement();
      return result;
    },
    [isConnected, disputeFn, refetchSettlement],
  );

  // Utility functions
  const getStateName = (state: number) => STATE_NAMES[state] || "UNKNOWN";

  const getProgress = () => {
    if (!settlement || settlement.totalTransfers === 0n) return 0;
    return Number((settlement.executedTransfers * 100n) / settlement.totalTransfers);
  };

  const getDepositProgress = () => {
    if (!settlement || settlement.totalAmount === 0n) return 0;
    return Math.min(Number((settlement.totalDeposited * 100n) / settlement.totalAmount), 100);
  };

  const formatAmount = (amount: bigint) => formatEther(amount);

  const refetchAll = useCallback(() => {
    refetchSettlement();
    refetchDetails();
    refetchQueueHead();
    refetchQueueLength();
    refetchNextId();
  }, [refetchSettlement, refetchDetails, refetchQueueHead, refetchQueueLength, refetchNextId]);

  return {
    // Settlement data
    settlement,
    transfers,
    canInitiate: canInitiateData?.[0] ?? false,
    initiateReason: canInitiateData?.[1] ?? "",
    isEligibleForRefund: isEligibleForRefund ?? false,

    // Queue data
    queueHead,
    queueLength,
    nextSettlementId,

    // User data
    userSettlements,
    connectedAddress,
    isConnected,

    // Actions
    createSettlement,
    deposit,
    initiateSettlement,
    executeSettlement,
    refundSettlement,
    disputeSettlement,
    refetchAll,
    refetchSettlement,

    // Loading states
    isLoading: isLoadingSettlement || isLoading,
    isCreating,
    isDepositing,
    isInitiating,
    isExecuting,
    isRefunding,
    isDisputing,

    // Utilities
    getStateName,
    getProgress,
    getDepositProgress,
    formatAmount,
  };
};

export default useSettlements;
