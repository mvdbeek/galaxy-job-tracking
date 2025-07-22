import { PrismaClient } from '@prisma/client';
import type { GalaxyJob } from './galaxy-client';

export class DatabaseService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async connect(): Promise<void> {
    await this.prisma.$connect();
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }

  async upsertJob(job: GalaxyJob): Promise<void> {
    await this.prisma.job.upsert({
      where: { id: job.id },
      update: {
        state: job.state,
        updatedTime: new Date(job.update_time),
        exitCode: job.exit_code || null,
        traceback: job.traceback || null,
        commandLine: job.command_line || null,
        handler: job.handler || null,
        destination: job.destination_id || null,
      },
      create: {
        id: job.id,
        toolId: job.tool_id,
        state: job.state,
        createdTime: new Date(job.create_time),
        updatedTime: new Date(job.update_time),
        historyId: job.history_id,
        userId: job.user_id || null,
        commandLine: job.command_line || null,
        exitCode: job.exit_code || null,
        traceback: job.traceback || null,
        handler: job.handler || null,
        destination: job.destination_id || null,
      },
    });
  }

  async storeJobError(
    jobId: string,
    stderr?: string,
    stdout?: string,
    errorType?: string,
    errorMessage?: string
  ): Promise<void> {
    await this.prisma.jobError.create({
      data: {
        jobId,
        stderr: stderr || null,
        stdout: stdout || null,
        errorType: errorType || null,
        errorMessage: errorMessage || null,
      },
    });
  }

  async storeJobMetrics(
    jobId: string,
    metrics: Array<{
      name: string;
      plugin: string;
      raw_value: string;
      title: string;
      value: string;
    }>
  ): Promise<void> {
    const metricData = metrics.map((metric) => ({
      jobId,
      metricType: metric.plugin,
      metricName: metric.name,
      metricValue: metric.raw_value,
      metricUnit: this.extractUnit(metric.value) || null,
    }));

    await this.prisma.jobMetric.createMany({
      data: metricData,
    });
  }

  private extractUnit(valueString: string): string | undefined {
    const unitMatch = valueString.match(/([a-zA-Z%]+)$/);
    return unitMatch ? unitMatch[1] : undefined;
  }

  async getLastProcessedTime(processingType: string): Promise<Date | null> {
    const status = await this.prisma.processingStatus.findUnique({
      where: { processingType },
    });
    return status?.lastProcessedTime || null;
  }

  async updateLastProcessedTime(
    processingType: string,
    time: Date
  ): Promise<void> {
    await this.prisma.processingStatus.upsert({
      where: { processingType },
      update: { lastProcessedTime: time },
      create: {
        processingType,
        lastProcessedTime: time,
      },
    });
  }

  async getJobErrorStatistics(
    startTime: Date,
    endTime: Date,
    toolId?: string
  ): Promise<{
    totalJobs: number;
    errorJobs: number;
    errorRate: number;
    topErrors: Array<{ errorType: string; count: number }>;
  }> {
    const whereClause = {
      createdTime: {
        gte: startTime,
        lte: endTime,
      },
      ...(toolId && { toolId }),
    };

    const [totalJobs, errorJobs, topErrors] = await Promise.all([
      this.prisma.job.count({ where: whereClause }),
      this.prisma.job.count({
        where: { ...whereClause, state: 'error' },
      }),
      this.prisma.jobError.groupBy({
        by: ['errorType'],
        where: {
          job: whereClause,
        },
        _count: { errorType: true },
        orderBy: { _count: { errorType: 'desc' } },
        take: 10,
      }),
    ]);

    const errorRate = totalJobs > 0 ? errorJobs / totalJobs : 0;

    return {
      totalJobs,
      errorJobs,
      errorRate,
      topErrors: topErrors.map((error) => ({
        errorType: error.errorType || 'Unknown',
        count: error._count.errorType,
      })),
    };
  }

  async storeJobAggregate(
    timeWindow: Date,
    toolId: string,
    handler: string | null,
    destination: string | null,
    successCount: number,
    errorCount: number
  ): Promise<void> {
    const totalCount = successCount + errorCount;
    const errorRate = totalCount > 0 ? errorCount / totalCount : 0;

    await this.prisma.jobAggregate.upsert({
      where: {
        unique_aggregate: {
          timeWindow,
          toolId,
          handler: handler || 'unknown',
          destination: destination || 'unknown',
        },
      },
      update: {
        successCount,
        errorCount,
        totalCount,
        errorRate,
      },
      create: {
        timeWindow,
        toolId,
        handler: handler || 'unknown',
        destination: destination || 'unknown',
        successCount,
        errorCount,
        totalCount,
        errorRate,
      },
    });
  }
}

export const database = new DatabaseService();
