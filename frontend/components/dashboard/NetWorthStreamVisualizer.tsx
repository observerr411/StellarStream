"use client";

import React, { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

/**
 * Stream data structure from get_streams_batch API
 */
export interface StreamData {
  id: string;
  sender: string;
  receiver: string;
  totalAmount: string;
  startTime: number;
  endTime: number;
  withdrawn: string;
  token: string;
  status: "active" | "completed" | "cancelled";
}

/**
 * Processed chart data point
 */
export interface ChartDataPoint {
  date: string;
  timestamp: number;
  inbound: number;
  outbound: number;
  netFlow: number;
}

/**
 * Props for NetWorthStreamVisualizer
 */
export interface NetWorthStreamVisualizerProps {
  streams: StreamData[];
  /** Time range for aggregation: 'day' | 'week' | 'month' */
  timeRange?: "day" | "week" | "month";
  /** Height of the chart container */
  height?: number;
  /** Whether to show loading state */
  isLoading?: boolean;
}

/**
 * Stellar Blue gradient color for income (inbound)
 */
const STELLAR_BLUE = "#3B82F6";
const STELLAR_BLUE_LIGHT = "rgba(59, 130, 246, 0.3)";

/**
 * Cosmic Purple gradient color for expenses (outbound)
 */
const COSMIC_PURPLE = "#8B5CF6";
const COSMIC_PURPLE_LIGHT = "rgba(139, 92, 246, 0.3)";

/**
 * Format number with commas
 */
function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toFixed(0);
}

/**
 * Format date based on time range
 */
function formatDate(timestamp: number, timeRange: string): string {
  const date = new Date(timestamp);
  switch (timeRange) {
    case "day":
      return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    case "week":
      return date.toLocaleDateString("en-US", { weekday: "short" });
    case "month":
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    default:
      return date.toLocaleDateString();
  }
}

/**
 * Convert wei/smallest unit to display amount (assuming 7 decimals like USDC)
 */
function parseAmount(amount: string | number, decimals: number = 7): number {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return num / Math.pow(10, decimals);
}

/**
 * Aggregate streams by time period
 */
function aggregateByTime(
  streams: StreamData[],
  timeRange: "day" | "week" | "month"
): ChartDataPoint[] {
  const now = Date.now();
  const userAddress = ""; // Would come from wallet context
  
  // Initialize time buckets
  const buckets: Map<number, { inbound: number; outbound: number }> = new Map();
  
  // Determine bucket size and count based on time range
  let bucketSize: number;
  let bucketCount: number;
  
  switch (timeRange) {
    case "day":
      bucketSize = 60 * 60 * 1000; // 1 hour
      bucketCount = 24;
      break;
    case "week":
      bucketSize = 24 * 60 * 60 * 1000; // 1 day
      bucketCount = 7;
      break;
    case "month":
      bucketSize = 24 * 60 * 60 * 1000; // 1 day
      bucketCount = 30;
      break;
    default:
      bucketSize = 24 * 60 * 60 * 1000;
      bucketCount = 30;
  }
  
  // Create time buckets
  for (let i = 0; i < bucketCount; i++) {
    const bucketStart = now - (bucketCount - i) * bucketSize;
    buckets.set(bucketStart, { inbound: 0, outbound: 0 });
  }
  
  // Process each stream
  streams.forEach((stream) => {
    const startTime = stream.startTime * 1000; // Convert to ms
    const endTime = stream.endTime * 1000;
    const totalAmount = parseAmount(stream.totalAmount);
    
    // Find which buckets this stream affects
    buckets.forEach((value, bucketStart) => {
      const bucketEnd = bucketStart + bucketSize;
      
      // Check if stream is active during this bucket
      if (startTime <= bucketEnd && endTime >= bucketStart) {
        // Calculate proportional amount for this time period
        const streamDuration = endTime - startTime;
        const effectiveDuration = Math.min(endTime, bucketEnd) - Math.max(startTime, bucketStart);
        const proportion = effectiveDuration / streamDuration;
        const amount = totalAmount * proportion;
        
        // Check if user is sender (outbound) or receiver (inbound)
        if (stream.sender.toLowerCase() === userAddress.toLowerCase()) {
          value.outbound += amount;
        } else if (stream.receiver.toLowerCase() === userAddress.toLowerCase()) {
          value.inbound += amount;
        } else {
          // For demo purposes, treat as inbound if user is neither
          value.inbound += amount * 0.5;
          value.outbound += amount * 0.5;
        }
      }
    });
  });
  
  // Convert to chart data
  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([timestamp, { inbound, outbound }]) => ({
      date: formatDate(timestamp, timeRange),
      timestamp,
      inbound,
      outbound,
      netFlow: inbound - outbound,
    }));
}

/**
 * Custom tooltip component
 */
function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload || !payload.length) return null;
  
  const inbound = payload.find((p) => p.name === "Inbound")?.value || 0;
  const outbound = payload.find((p) => p.name === "Outbound")?.value || 0;
  const netFlow = inbound - outbound;
  
  return (
    <div className="bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg p-3 shadow-xl">
      <p className="text-gray-400 text-xs mb-2">{label}</p>
      <div className="space-y-1">
        <p className="text-sm flex justify-between gap-4">
          <span className="text-blue-400">Inbound:</span>
          <span className="text-white font-medium">{formatNumber(inbound)}</span>
        </p>
        <p className="text-sm flex justify-between gap-4">
          <span className="text-purple-400">Outbound:</span>
          <span className="text-white font-medium">{formatNumber(outbound)}</span>
        </p>
        <div className="border-t border-gray-700 pt-1 mt-1">
          <p className="text-sm flex justify-between gap-4">
            <span className="text-gray-400">Net Flow:</span>
            <span className={`font-medium ${netFlow >= 0 ? "text-green-400" : "text-red-400"}`}>
              {netFlow >= 0 ? "+" : ""}{formatNumber(netFlow)}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * NetWorthStreamVisualizer Component
 * 
 * Area chart showing inbound vs outbound stream volume with:
 * - Stellar Blue gradient for income (inbound)
 * - Cosmic Purple gradient for expenses (outbound)
 * 
 * @example
 * ```tsx
 * <NetWorthStreamVisualizer 
 *   streams={streams} 
 *   timeRange="month" 
 *   height={300}
 * />
 * ```
 */
export function NetWorthStreamVisualizer({
  streams,
  timeRange = "month",
  height = 300,
  isLoading = false,
}: NetWorthStreamVisualizerProps) {
  // Process streams into chart data
  const chartData = useMemo(() => {
    return aggregateByTime(streams, timeRange);
  }, [streams, timeRange]);
  
  // Calculate totals
  const totals = useMemo(() => {
    return chartData.reduce(
      (acc, curr) => ({
        inbound: acc.inbound + curr.inbound,
        outbound: acc.outbound + curr.outbound,
      }),
      { inbound: 0, outbound: 0 }
    );
  }, [chartData]);
  
  if (isLoading) {
    return (
      <div 
        className="bg-gray-800/50 rounded-xl border border-gray-700 p-6"
        style={{ height }}
      >
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-700 rounded w-1/3"></div>
          <div className="h-full bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Net Worth Stream Flow</h3>
          <p className="text-sm text-gray-400">Inbound vs Outbound Volume</p>
        </div>
        
        {/* Summary Stats */}
        <div className="flex gap-6">
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Inbound</p>
            <p className="text-lg font-semibold text-blue-400">
              +{formatNumber(totals.inbound)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Outbound</p>
            <p className="text-lg font-semibold text-purple-400">
              -{formatNumber(totals.outbound)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Net</p>
            <p className={`text-lg font-semibold ${
              totals.inbound - totals.outbound >= 0 
                ? "text-green-400" 
                : "text-red-400"
            }`}>
              {totals.inbound - totals.outbound >= 0 ? "+" : ""}
              {formatNumber(totals.inbound - totals.outbound)}
            </p>
          </div>
        </div>
      </div>
      
      {/* Chart */}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              {/* Stellar Blue gradient for inbound */}
              <linearGradient id="inboundGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={STELLAR_BLUE} stopOpacity={0.8} />
                <stop offset="100%" stopColor={STELLAR_BLUE} stopOpacity={0.1} />
              </linearGradient>
              
              {/* Cosmic Purple gradient for outbound */}
              <linearGradient id="outboundGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COSMIC_PURPLE} stopOpacity={0.8} />
                <stop offset="100%" stopColor={COSMIC_PURPLE} stopOpacity={0.1} />
              </linearGradient>
              
              {/* Glow effect for Stellar Blue */}
              <filter id="glowBlue" height="300%">
                <feGaussianMatrix stdDeviation="4" values="0 0 0 0 59  0 0 0 0 130  0 0 0 0 246  0 0 0 0.6 0" />
                <feMerge>
                  <feMergeNode />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              
              {/* Glow effect for Cosmic Purple */}
              <filter id="glowPurple" height="300%">
                <feGaussianMatrix stdDeviation="4" values="0 0 0 0 139  0 0 0 0 92  0 0 0 0 246  0 0 0 0.6 0" />
                <feMerge>
                  <feMergeNode />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="#374151" 
              vertical={false}
            />
            
            <XAxis
              dataKey="date"
              stroke="#9CA3AF"
              tick={{ fill: "#9CA3AF", fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: "#374151" }}
            />
            
            <YAxis
              stroke="#9CA3AF"
              tick={{ fill: "#9CA3AF", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatNumber}
              width={50}
            />
            
            <Tooltip content={<CustomTooltip />} />
            
            <Legend
              wrapperStyle={{ paddingTop: "20px" }}
              formatter={(value) => (
                <span className="text-gray-300 text-sm">{value}</span>
              )}
            />
            
            {/* Inbound Area (Stellar Blue) */}
            <Area
              type="monotone"
              dataKey="inbound"
              name="Inbound"
              stroke={STELLAR_BLUE}
              strokeWidth={2}
              fill="url(#inboundGradient)"
              filter="url(#glowBlue)"
              animationDuration={1000}
              animationEasing="ease-out"
            />
            
            {/* Outbound Area (Cosmic Purple) */}
            <Area
              type="monotone"
              dataKey="outbound"
              name="Outbound"
              stroke={COSMIC_PURPLE}
              strokeWidth={2}
              fill="url(#outboundGradient)"
              filter="url(#glowPurple)"
              animationDuration={1000}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      
      {/* Time Range Selector */}
      <div className="flex justify-center gap-2 mt-4">
        {(["day", "week", "month"] as const).map((range) => (
          <button
            key={range}
            onClick={() => {/* Would call onTimeRangeChange callback */}}
            className={`px-3 py-1 text-sm rounded-full transition-colors ${
              timeRange === range
                ? "bg-blue-500/20 text-blue-400 border border-blue-500/50"
                : "bg-gray-700/50 text-gray-400 border border-transparent hover:bg-gray-700"
            }`}
          >
            {range.charAt(0).toUpperCase() + range.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}

export default NetWorthStreamVisualizer;
