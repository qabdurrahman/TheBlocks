"use client";

import { useEffect, useRef, useState } from "react";
import { useContractEvents } from "~~/hooks/settlement";

/**
 * @title EventFeed
 * @author TheBlocks Team - TriHacker Tournament 2025
 * @notice Real-time event feed with filtering
 *
 * FEATURES:
 * - Live event streaming
 * - Event type filtering
 * - Auto-scroll to latest
 * - Event details expansion
 */

interface EventFeedProps {
  maxEvents?: number;
  showFilters?: boolean;
  compact?: boolean;
}

export const EventFeed = ({ maxEvents = 20, showFilters = true, compact = false }: EventFeedProps) => {
  const {
    events,
    stats,
    isSubscribed,
    toggleSubscription,
    filterByEventName,
    getEventColor,
    getEventIcon,
    clearEvents,
  } = useContractEvents();

  const [filter, setFilter] = useState<string>("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const feedRef = useRef<HTMLDivElement>(null);

  const eventTypes = [
    "all",
    "SettlementCreated",
    "SettlementInitiated",
    "SettlementExecuted",
    "SettlementFinalized",
    "DepositMade",
    "DisputeRaised",
    "RefundIssued",
  ];

  const filteredEvents = filter === "all" ? events : filterByEventName(filter);
  const displayEvents = filteredEvents.slice(0, maxEvents);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (autoScroll && feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
  }, [events, autoScroll]);

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <div className="bg-base-100 rounded-2xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-base-200 px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h3 className="font-bold">📡 Live Events</h3>
          <span className={`badge ${isSubscribed ? "badge-success" : "badge-ghost"} badge-sm`}>
            {isSubscribed ? "● Live" : "○ Paused"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn btn-ghost btn-xs"
            onClick={toggleSubscription}
            title={isSubscribed ? "Pause" : "Resume"}
          >
            {isSubscribed ? "⏸️" : "▶️"}
          </button>
          <button className="btn btn-ghost btn-xs" onClick={clearEvents} title="Clear events">
            🗑️
          </button>
          <label className="label cursor-pointer gap-1" title="Auto-scroll to latest">
            <input
              type="checkbox"
              className="checkbox checkbox-xs"
              checked={autoScroll}
              onChange={e => setAutoScroll(e.target.checked)}
            />
            <span className="label-text text-xs">Auto</span>
          </label>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="px-4 py-2 bg-base-200/50 flex gap-2 flex-wrap">
          {eventTypes.map(type => (
            <button
              key={type}
              className={`btn btn-xs ${filter === type ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setFilter(type)}
            >
              {type === "all" ? "All" : type.replace("Settlement", "")}
            </button>
          ))}
        </div>
      )}

      {/* Event List */}
      <div ref={feedRef} className={`overflow-y-auto ${compact ? "max-h-48" : "max-h-96"}`}>
        {displayEvents.length === 0 ? (
          <div className="text-center py-8 opacity-60">
            <span className="text-3xl block mb-2">📭</span>
            <p className="text-sm">Waiting for events...</p>
            <p className="text-xs mt-1">{isSubscribed ? "Listening for activity" : "Subscription paused"}</p>
          </div>
        ) : (
          <div className="divide-y divide-base-200">
            {displayEvents.map(event => (
              <div key={event.id} className="px-4 py-3 hover:bg-base-200/50 transition-colors">
                <div className="flex items-start gap-3">
                  <span className={`text-xl ${compact ? "text-base" : ""}`}>{getEventIcon(event.eventName)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`badge ${getEventColor(event.eventName)} badge-sm`}>
                        {event.eventName.replace("Settlement", "")}
                      </span>
                      {!compact && (
                        <>
                          <span className="text-xs opacity-50">Block #{event.blockNumber.toString()}</span>
                          <span className="text-xs opacity-50">{formatTime(event.timestamp)}</span>
                        </>
                      )}
                    </div>
                    <p className={`${compact ? "text-xs" : "text-sm"} opacity-70 truncate mt-1`}>{event.formatted}</p>
                    {!compact && event.transactionHash && (
                      <p className="text-xs opacity-40 font-mono truncate mt-1">
                        tx: {event.transactionHash.slice(0, 16)}...
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="bg-base-200 px-4 py-2 flex justify-between text-xs opacity-60">
        <span>
          Showing {displayEvents.length} of {filteredEvents.length} events
        </span>
        <span>
          Session: {stats.totalSettlementsCreated} created, {stats.totalExecutions} executed
        </span>
      </div>
    </div>
  );
};

export default EventFeed;
