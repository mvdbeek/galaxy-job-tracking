import * as cron from 'node-cron';
import { jobFetcher } from './job-fetcher';
import { aggregator } from './aggregator';
import { database } from './database';
import { config } from '../config';

export class SchedulerService {
  private isRunning = false;

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Scheduler is already running');
      return;
    }

    console.log('Starting Galaxy job tracking scheduler...');

    await database.connect();
    this.isRunning = true;

    this.scheduleJobFetching();
    this.scheduleAggregation();

    const lastProcessed = await database.getLastProcessedTime('job-fetcher');
    if (!lastProcessed) {
      console.log(
        'No previous processing time found, running initial fetch...'
      );
      await this.runJobFetching();
    }

    console.log('Scheduler started successfully');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('Scheduler is not running');
      return;
    }

    console.log('Stopping scheduler...');
    await database.disconnect();
    this.isRunning = false;
    console.log('Scheduler stopped');
  }

  private scheduleJobFetching(): void {
    const cronExpression = `0 */${config.polling.intervalHours} * * *`;

    cron.schedule(cronExpression, async () => {
      console.log('Running scheduled job fetching...');
      await this.runJobFetching();
    });

    console.log(
      `Job fetching scheduled every ${config.polling.intervalHours} hour(s)`
    );
  }

  private scheduleAggregation(): void {
    cron.schedule('5 * * * *', async () => {
      console.log('Running scheduled aggregation...');
      await this.runAggregation();
    });

    console.log('Aggregation scheduled every hour at 5 minutes past');
  }

  private async runJobFetching(): Promise<void> {
    try {
      const lastProcessed = await database.getLastProcessedTime('job-fetcher');

      let result;
      if (lastProcessed) {
        result = await jobFetcher.fetchJobsSince(lastProcessed);
      } else {
        result = await jobFetcher.fetchLastHourJobs();
      }

      console.log('Job fetching completed:', {
        totalFetched: result.totalJobsFetched,
        errorJobs: result.errorJobsFound,
        newJobs: result.newJobsProcessed,
        errors: result.errors.length,
      });

      if (result.errors.length > 0) {
        console.error('Errors during job fetching:', result.errors);
      }
    } catch (error) {
      console.error('Failed to run job fetching:', error);
    }
  }

  private async runAggregation(): Promise<void> {
    try {
      await aggregator.aggregateHourlyData();
      console.log('Aggregation completed successfully');
    } catch (error) {
      console.error('Failed to run aggregation:', error);
    }
  }

  async runOnce(): Promise<void> {
    await database.connect();

    console.log('Running one-time job fetch and aggregation...');

    await this.runJobFetching();
    await this.runAggregation();

    await database.disconnect();
    console.log('One-time run completed');
  }

  async backfill(startDate: string, endDate: string): Promise<void> {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error('Invalid date format. Use YYYY-MM-DD format.');
    }

    if (start >= end) {
      throw new Error('Start date must be before end date');
    }

    await database.connect();

    console.log(
      `Starting backfill from ${start.toISOString()} to ${end.toISOString()}`
    );

    const results = await jobFetcher.backfillJobs(start, end);

    const totals = results.reduce(
      (acc, result) => ({
        totalFetched: acc.totalFetched + result.totalJobsFetched,
        errorJobs: acc.errorJobs + result.errorJobsFound,
        newJobs: acc.newJobs + result.newJobsProcessed,
        errors: acc.errors + result.errors.length,
      }),
      { totalFetched: 0, errorJobs: 0, newJobs: 0, errors: 0 }
    );

    console.log('Backfill completed:', totals);

    console.log('Running aggregation for backfilled data...');
    let current = new Date(start);
    while (current < end) {
      const windowEnd = new Date(
        Math.min(
          current.getTime() + config.polling.lookbackHours * 60 * 60 * 1000,
          end.getTime()
        )
      );

      await aggregator.aggregateJobsForTimeWindow(current, windowEnd);
      current = new Date(windowEnd);
    }

    await database.disconnect();
    console.log('Backfill and aggregation completed');
  }
}

export const scheduler = new SchedulerService();
