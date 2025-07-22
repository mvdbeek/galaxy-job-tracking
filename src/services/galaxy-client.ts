import createClient from 'openapi-fetch';
import type { paths } from '../types/galaxy-api';
import { config } from '../config';

export interface GalaxyJobsQueryParams {
  state?: string[] | null;
  tool_id?: string[] | null;
  history_id?: string | null;
  date_range_min?: string | null;
  date_range_max?: string | null;
  limit?: number;
  offset?: number;
}

export interface GalaxyJob {
  id: string;
  tool_id: string;
  state: string;
  create_time: string;
  update_time: string;
  history_id: string;
  user_id?: string;
  command_line?: string;
  exit_code?: number;
  traceback?: string;
  job_stderr?: string;
  job_stdout?: string;
  handler?: string;
  job_runner_external_id?: string;
  destination_id?: string;
  destination_params?: Record<string, unknown>;
}

export interface GalaxyJobDetails extends GalaxyJob {
  tool_stderr?: string;
  tool_stdout?: string;
  job_messages?: Array<{
    desc: string;
    error_level: number;
  }>;
  job_metrics?: Array<{
    name: string;
    plugin: string;
    raw_value: string;
    title: string;
    value: string;
  }>;
}

export class GalaxyApiClient {
  private client: ReturnType<typeof createClient<paths>>;

  constructor() {
    this.client = createClient<paths>({
      baseUrl: config.galaxy.url,
      headers: {
        'X-API-KEY': config.galaxy.apiKey,
      },
    });
  }

  async getJobs(params: GalaxyJobsQueryParams = {}): Promise<GalaxyJob[]> {
    const { data, error } = await this.client.GET('/api/jobs', {
      params: {
        query: {
          ...params,
        },
      },
    });

    if (error) {
      throw new Error(`Failed to fetch jobs: ${JSON.stringify(error)}`);
    }

    return data as GalaxyJob[];
  }

  async getJobDetails(jobId: string): Promise<GalaxyJobDetails> {
    const { data, error } = await this.client.GET('/api/jobs/{job_id}', {
      params: {
        path: { job_id: jobId },
        query: { full: true },
      },
    });

    if (error) {
      throw new Error(
        `Failed to fetch job details for ${jobId}: ${JSON.stringify(error)}`
      );
    }

    return data as GalaxyJobDetails;
  }

  async getTerminalJobsForTimeRange(
    startTime: Date,
    endTime: Date
  ): Promise<GalaxyJob[]> {
    const terminalStates = ['ok', 'error', 'deleted', 'deleted_new'];

    return this.getJobs({
      state: terminalStates,
      date_range_min: startTime.toISOString(),
      date_range_max: endTime.toISOString(),
      limit: 1000,
    });
  }

  async getFailedJobsForTimeRange(
    startTime: Date,
    endTime: Date
  ): Promise<GalaxyJob[]> {
    return this.getJobs({
      state: ['error'],
      date_range_min: startTime.toISOString(),
      date_range_max: endTime.toISOString(),
      limit: 1000,
    });
  }
}

export const galaxyClient = new GalaxyApiClient();
