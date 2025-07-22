import { database } from './database';

export interface ToolErrorSummary {
  toolId: string;
  handler: string | null;
  destination: string | null;
  successCount: number;
  errorCount: number;
  totalCount: number;
  errorRate: number;
}

export interface TimeWindowStats {
  timeWindow: Date;
  totalJobs: number;
  errorJobs: number;
  errorRate: number;
  toolBreakdown: ToolErrorSummary[];
}

export class AggregatorService {
  async aggregateJobsForTimeWindow(
    startTime: Date,
    endTime: Date
  ): Promise<TimeWindowStats> {
    const prisma = (database as any).prisma;

    const jobs = await prisma.job.findMany({
      where: {
        createdTime: {
          gte: startTime,
          lte: endTime,
        },
      },
      select: {
        toolId: true,
        state: true,
        handler: true,
        destination: true,
      },
    });

    const totalJobs = jobs.length;
    const errorJobs = jobs.filter((job) => job.state === 'error').length;
    const errorRate = totalJobs > 0 ? errorJobs / totalJobs : 0;

    const toolBreakdown = this.calculateToolBreakdown(jobs);

    await this.storeAggregatedData(startTime, toolBreakdown);

    return {
      timeWindow: startTime,
      totalJobs,
      errorJobs,
      errorRate,
      toolBreakdown,
    };
  }

  private calculateToolBreakdown(
    jobs: Array<{
      toolId: string;
      state: string;
      handler: string | null;
      destination: string | null;
    }>
  ): ToolErrorSummary[] {
    const breakdown = new Map<string, ToolErrorSummary>();

    // @ts-ignore - Prisma type compatibility
    for (const job of jobs) {
      const key = `${job.toolId}|${job.handler || 'null'}|${job.destination || 'null'}`;

      if (!breakdown.has(key)) {
        breakdown.set(key, {
          toolId: job.toolId,
          handler: job.handler,
          destination: job.destination,
          successCount: 0,
          errorCount: 0,
          totalCount: 0,
          errorRate: 0,
        });
      }

      const entry = breakdown.get(key)!;
      entry.totalCount++;

      if (job.state === 'error') {
        entry.errorCount++;
      } else if (job.state === 'ok') {
        entry.successCount++;
      }

      entry.errorRate =
        entry.totalCount > 0 ? entry.errorCount / entry.totalCount : 0;
    }

    return Array.from(breakdown.values()).sort(
      (a, b) => b.errorRate - a.errorRate
    );
  }

  private async storeAggregatedData(
    timeWindow: Date,
    toolBreakdown: ToolErrorSummary[]
  ): Promise<void> {
    for (const tool of toolBreakdown) {
      await database.storeJobAggregate(
        timeWindow,
        tool.toolId,
        tool.handler,
        tool.destination,
        tool.successCount,
        tool.errorCount
      );
    }
  }

  async getTopFailingTools(
    startTime: Date,
    endTime: Date,
    limit = 10
  ): Promise<
    Array<{
      toolId: string;
      totalErrors: number;
      avgErrorRate: number;
      occurrences: number;
    }>
  > {
    const prisma = (database as any).prisma;

    const results = await prisma.jobAggregate.groupBy({
      by: ['toolId'],
      where: {
        timeWindow: {
          gte: startTime,
          lte: endTime,
        },
      },
      _sum: {
        errorCount: true,
        totalCount: true,
      },
      _count: {
        toolId: true,
      },
      orderBy: {
        _sum: {
          errorCount: 'desc',
        },
      },
      take: limit,
    });

    return results.map((result: any) => ({
      toolId: result.toolId,
      totalErrors: result._sum.errorCount || 0,
      avgErrorRate: result._sum.totalCount
        ? (result._sum.errorCount || 0) / (result._sum.totalCount || 1)
        : 0,
      occurrences: result._count.toolId,
    }));
  }

  async getHandlerPerformance(
    startTime: Date,
    endTime: Date
  ): Promise<
    Array<{
      handler: string;
      totalJobs: number;
      errorJobs: number;
      errorRate: number;
    }>
  > {
    const prisma = (database as any).prisma;

    const results = await prisma.jobAggregate.groupBy({
      by: ['handler'],
      where: {
        timeWindow: {
          gte: startTime,
          lte: endTime,
        },
        handler: {
          not: null,
        },
      },
      _sum: {
        errorCount: true,
        totalCount: true,
      },
      orderBy: {
        _sum: {
          totalCount: 'desc',
        },
      },
    });

    return results.map((result: any) => ({
      handler: result.handler || 'unknown',
      totalJobs: result._sum.totalCount || 0,
      errorJobs: result._sum.errorCount || 0,
      errorRate: result._sum.totalCount
        ? (result._sum.errorCount || 0) / (result._sum.totalCount || 1)
        : 0,
    }));
  }

  async getDestinationPerformance(
    startTime: Date,
    endTime: Date
  ): Promise<
    Array<{
      destination: string;
      totalJobs: number;
      errorJobs: number;
      errorRate: number;
    }>
  > {
    const prisma = (database as any).prisma;

    const results = await prisma.jobAggregate.groupBy({
      by: ['destination'],
      where: {
        timeWindow: {
          gte: startTime,
          lte: endTime,
        },
        destination: {
          not: null,
        },
      },
      _sum: {
        errorCount: true,
        totalCount: true,
      },
      orderBy: {
        _sum: {
          totalCount: 'desc',
        },
      },
    });

    return results.map((result: any) => ({
      destination: result.destination || 'unknown',
      totalJobs: result._sum.totalCount || 0,
      errorJobs: result._sum.errorCount || 0,
      errorRate: result._sum.totalCount
        ? (result._sum.errorCount || 0) / (result._sum.totalCount || 1)
        : 0,
    }));
  }

  async aggregateHourlyData(): Promise<void> {
    const endTime = new Date();
    endTime.setMinutes(0, 0, 0);

    const startTime = new Date(endTime.getTime() - 60 * 60 * 1000);

    console.log(
      `Aggregating data for ${startTime.toISOString()} to ${endTime.toISOString()}`
    );

    const stats = await this.aggregateJobsForTimeWindow(startTime, endTime);

    console.log(
      `Aggregated ${stats.totalJobs} jobs, ${stats.errorJobs} errors (${(stats.errorRate * 100).toFixed(2)}% error rate)`
    );
  }
}

export const aggregator = new AggregatorService();
