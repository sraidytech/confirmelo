import { Injectable, Logger } from '@nestjs/common';

interface PerformanceMetric {
  operation: string;
  duration: number;
  timestamp: Date;
  success: boolean;
  metadata?: any;
}

interface PerformanceStats {
  operation: string;
  count: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  successRate: number;
  lastExecuted: Date;
}

@Injectable()
export class PerformanceMonitorService {
  private readonly logger = new Logger(PerformanceMonitorService.name);
  private readonly metrics: PerformanceMetric[] = [];
  private readonly maxMetrics = 10000; // Keep last 10k metrics

  /**
   * Start timing an operation
   */
  startTimer(operation: string, metadata?: any): () => void {
    const startTime = Date.now();
    
    return (success: boolean = true) => {
      const duration = Date.now() - startTime;
      this.recordMetric({
        operation,
        duration,
        timestamp: new Date(),
        success,
        metadata,
      });
    };
  }

  /**
   * Record a performance metric
   */
  private recordMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric);
    
    // Keep only the most recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.splice(0, this.metrics.length - this.maxMetrics);
    }

    // Log slow operations
    if (metric.duration > 5000) { // 5 seconds
      this.logger.warn('Slow operation detected', {
        operation: metric.operation,
        duration: metric.duration,
        success: metric.success,
        metadata: metric.metadata,
      });
    }

    // Log failed operations
    if (!metric.success) {
      this.logger.error('Operation failed', {
        operation: metric.operation,
        duration: metric.duration,
        metadata: metric.metadata,
      });
    }
  }

  /**
   * Get performance statistics for an operation
   */
  getOperationStats(operation: string, timeWindowMs: number = 60 * 60 * 1000): PerformanceStats | null {
    const cutoffTime = new Date(Date.now() - timeWindowMs);
    const operationMetrics = this.metrics.filter(
      m => m.operation === operation && m.timestamp >= cutoffTime
    );

    if (operationMetrics.length === 0) {
      return null;
    }

    const durations = operationMetrics.map(m => m.duration);
    const successCount = operationMetrics.filter(m => m.success).length;

    return {
      operation,
      count: operationMetrics.length,
      averageDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      successRate: successCount / operationMetrics.length,
      lastExecuted: operationMetrics[operationMetrics.length - 1].timestamp,
    };
  }

  /**
   * Get all operation statistics
   */
  getAllStats(timeWindowMs: number = 60 * 60 * 1000): PerformanceStats[] {
    const cutoffTime = new Date(Date.now() - timeWindowMs);
    const recentMetrics = this.metrics.filter(m => m.timestamp >= cutoffTime);
    
    const operationGroups = recentMetrics.reduce((groups, metric) => {
      if (!groups[metric.operation]) {
        groups[metric.operation] = [];
      }
      groups[metric.operation].push(metric);
      return groups;
    }, {} as Record<string, PerformanceMetric[]>);

    return Object.entries(operationGroups).map(([operation, metrics]) => {
      const durations = metrics.map(m => m.duration);
      const successCount = metrics.filter(m => m.success).length;

      return {
        operation,
        count: metrics.length,
        averageDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
        minDuration: Math.min(...durations),
        maxDuration: Math.max(...durations),
        successRate: successCount / metrics.length,
        lastExecuted: metrics[metrics.length - 1].timestamp,
      };
    }).sort((a, b) => b.count - a.count); // Sort by frequency
  }

  /**
   * Get performance health summary
   */
  getHealthSummary(): {
    totalOperations: number;
    averageResponseTime: number;
    overallSuccessRate: number;
    slowOperations: number;
    failedOperations: number;
    topOperations: Array<{ operation: string; count: number; avgDuration: number }>;
  } {
    const recentMetrics = this.metrics.filter(
      m => m.timestamp >= new Date(Date.now() - 60 * 60 * 1000) // Last hour
    );

    if (recentMetrics.length === 0) {
      return {
        totalOperations: 0,
        averageResponseTime: 0,
        overallSuccessRate: 1,
        slowOperations: 0,
        failedOperations: 0,
        topOperations: [],
      };
    }

    const durations = recentMetrics.map(m => m.duration);
    const successCount = recentMetrics.filter(m => m.success).length;
    const slowCount = recentMetrics.filter(m => m.duration > 5000).length;
    const failedCount = recentMetrics.filter(m => !m.success).length;

    // Get top operations by frequency
    const operationCounts = recentMetrics.reduce((counts, metric) => {
      if (!counts[metric.operation]) {
        counts[metric.operation] = { count: 0, totalDuration: 0 };
      }
      counts[metric.operation].count++;
      counts[metric.operation].totalDuration += metric.duration;
      return counts;
    }, {} as Record<string, { count: number; totalDuration: number }>);

    const topOperations = Object.entries(operationCounts)
      .map(([operation, data]) => ({
        operation,
        count: data.count,
        avgDuration: data.totalDuration / data.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalOperations: recentMetrics.length,
      averageResponseTime: durations.reduce((a, b) => a + b, 0) / durations.length,
      overallSuccessRate: successCount / recentMetrics.length,
      slowOperations: slowCount,
      failedOperations: failedCount,
      topOperations,
    };
  }

  /**
   * Clear old metrics to free memory
   */
  clearOldMetrics(olderThanMs: number = 24 * 60 * 60 * 1000): number {
    const cutoffTime = new Date(Date.now() - olderThanMs);
    const initialLength = this.metrics.length;
    
    // Remove old metrics
    for (let i = this.metrics.length - 1; i >= 0; i--) {
      if (this.metrics[i].timestamp < cutoffTime) {
        this.metrics.splice(i, 1);
      }
    }

    const removedCount = initialLength - this.metrics.length;
    
    if (removedCount > 0) {
      this.logger.log('Cleared old performance metrics', {
        removed: removedCount,
        remaining: this.metrics.length,
        cutoffTime: cutoffTime.toISOString(),
      });
    }

    return removedCount;
  }

  /**
   * Get metrics for a specific time range
   */
  getMetricsInRange(
    startTime: Date,
    endTime: Date,
    operation?: string,
  ): PerformanceMetric[] {
    return this.metrics.filter(metric => {
      const inTimeRange = metric.timestamp >= startTime && metric.timestamp <= endTime;
      const matchesOperation = !operation || metric.operation === operation;
      return inTimeRange && matchesOperation;
    });
  }

  /**
   * Export metrics for analysis
   */
  exportMetrics(
    operation?: string,
    timeWindowMs: number = 24 * 60 * 60 * 1000,
  ): PerformanceMetric[] {
    const cutoffTime = new Date(Date.now() - timeWindowMs);
    return this.metrics.filter(metric => {
      const inTimeRange = metric.timestamp >= cutoffTime;
      const matchesOperation = !operation || metric.operation === operation;
      return inTimeRange && matchesOperation;
    });
  }
}