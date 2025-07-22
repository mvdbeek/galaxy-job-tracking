import {
  galaxyClient,
  type GalaxyJob,
  type GalaxyJobDetails,
} from './galaxy-client';
import { database } from './database';
import { config } from '../config';

export interface JobFetchResult {
  totalJobsFetched: number;
  errorJobsFound: number;
  newJobsProcessed: number;
  errors: Array<{ jobId: string; error: string }>;
}

export class JobFetcherService {
  async fetchJobsForTimeWindow(
    startTime: Date,
    endTime: Date
  ): Promise<JobFetchResult> {
    const result: JobFetchResult = {
      totalJobsFetched: 0,
      errorJobsFound: 0,
      newJobsProcessed: 0,
      errors: [],
    };

    try {
      const jobs = await galaxyClient.getTerminalJobsForTimeRange(
        startTime,
        endTime
      );

      result.totalJobsFetched = jobs.length;
      console.log(
        `Fetched ${jobs.length} terminal jobs for time window ${startTime.toISOString()} to ${endTime.toISOString()}`
      );

      for (const job of jobs) {
        try {
          await database.upsertJob(job);
          result.newJobsProcessed++;

          if (job.state === 'error') {
            result.errorJobsFound++;
            await this.processErrorJob(job);
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          result.errors.push({
            jobId: job.id,
            error: errorMessage,
          });
          console.error(`Error processing job ${job.id}:`, errorMessage);
        }
      }

      await database.updateLastProcessedTime('job-fetcher', endTime);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error('Error fetching jobs:', errorMessage);
      result.errors.push({ jobId: 'N/A', error: errorMessage });
    }

    return result;
  }

  private async processErrorJob(job: GalaxyJob): Promise<void> {
    try {
      const jobDetails = await galaxyClient.getJobDetails(job.id);
      await this.storeJobErrorData(jobDetails);

      if (jobDetails.job_metrics && jobDetails.job_metrics.length > 0) {
        await database.storeJobMetrics(job.id, jobDetails.job_metrics);
      }
    } catch (error) {
      console.error(`Failed to fetch details for error job ${job.id}:`, error);
    }
  }

  private async storeJobErrorData(jobDetails: GalaxyJobDetails): Promise<void> {
    const errorType = this.categorizeError(jobDetails);
    const errorMessage = this.extractErrorMessage(jobDetails);

    await database.storeJobError(
      jobDetails.id,
      jobDetails.job_stderr || jobDetails.tool_stderr,
      jobDetails.job_stdout || jobDetails.tool_stdout,
      errorType,
      errorMessage
    );
  }

  private categorizeError(jobDetails: GalaxyJobDetails): string {
    const stderr = jobDetails.job_stderr || jobDetails.tool_stderr || '';
    const traceback = jobDetails.traceback || '';
    const jobMessages = jobDetails.job_messages || [];

    if (traceback.includes('MemoryError') || stderr.includes('out of memory')) {
      return 'memory_error';
    }

    if (traceback.includes('TimeoutError') || stderr.includes('timeout')) {
      return 'timeout_error';
    }

    if (stderr.includes('No such file') || stderr.includes('File not found')) {
      return 'file_not_found';
    }

    if (jobDetails.exit_code && jobDetails.exit_code !== 0) {
      return `exit_code_${jobDetails.exit_code}`;
    }

    if (jobMessages.some((msg) => msg.error_level > 0)) {
      return 'job_message_error';
    }

    if (stderr.includes('Permission denied')) {
      return 'permission_error';
    }

    return 'unknown_error';
  }

  private extractErrorMessage(jobDetails: GalaxyJobDetails): string {
    const stderr = jobDetails.job_stderr || jobDetails.tool_stderr || '';
    const traceback = jobDetails.traceback || '';
    const jobMessages = jobDetails.job_messages || [];

    if (traceback) {
      const lines = traceback.split('\n');
      const lastLine = lines[lines.length - 1]?.trim();
      if (lastLine) return lastLine;
    }

    if (stderr) {
      const lines = stderr.split('\n').filter((line) => line.trim());
      const errorLines = lines.filter(
        (line) =>
          line.toLowerCase().includes('error') ||
          line.toLowerCase().includes('exception') ||
          line.toLowerCase().includes('failed')
      );
      if (errorLines.length > 0) return errorLines[0];
      if (lines.length > 0) return lines[lines.length - 1];
    }

    const errorMessages = jobMessages.filter((msg) => msg.error_level > 0);
    if (errorMessages.length > 0) {
      return errorMessages[0].desc;
    }

    return `Job failed with exit code ${jobDetails.exit_code || 'unknown'}`;
  }

  async fetchLastHourJobs(): Promise<JobFetchResult> {
    const endTime = new Date();
    const startTime = new Date(
      endTime.getTime() - config.polling.lookbackHours * 60 * 60 * 1000
    );

    return this.fetchJobsForTimeWindow(startTime, endTime);
  }

  async fetchJobsSince(since: Date): Promise<JobFetchResult> {
    const endTime = new Date();
    return this.fetchJobsForTimeWindow(since, endTime);
  }

  async backfillJobs(
    startTime: Date,
    endTime: Date
  ): Promise<JobFetchResult[]> {
    const results: JobFetchResult[] = [];
    const windowSize = config.polling.lookbackHours * 60 * 60 * 1000;

    let currentStart = new Date(startTime);

    while (currentStart < endTime) {
      const currentEnd = new Date(
        Math.min(currentStart.getTime() + windowSize, endTime.getTime())
      );

      console.log(
        `Backfilling jobs from ${currentStart.toISOString()} to ${currentEnd.toISOString()}`
      );
      const result = await this.fetchJobsForTimeWindow(
        currentStart,
        currentEnd
      );
      results.push(result);

      await new Promise((resolve) => setTimeout(resolve, 1000));

      currentStart = new Date(currentEnd);
    }

    return results;
  }
}

export const jobFetcher = new JobFetcherService();
