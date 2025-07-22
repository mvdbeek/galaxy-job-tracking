import dotenv from 'dotenv';

dotenv.config();

export const config = {
  galaxy: {
    url: process.env.GALAXY_URL || 'https://usegalaxy.org',
    apiKey: process.env.GALAXY_API_KEY || '',
  },
  database: {
    url:
      process.env.DATABASE_URL ||
      'postgresql://localhost:5432/galaxy_job_tracking',
  },
  app: {
    nodeEnv: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
  },
  polling: {
    intervalHours: parseInt(process.env.POLL_INTERVAL_HOURS || '1', 10),
    lookbackHours: parseInt(process.env.LOOKBACK_HOURS || '1', 10),
  },
};

export function validateConfig(): void {
  const requiredFields = [
    { field: config.galaxy.url, name: 'GALAXY_URL' },
    { field: config.galaxy.apiKey, name: 'GALAXY_API_KEY' },
    { field: config.database.url, name: 'DATABASE_URL' },
  ];

  const missingFields = requiredFields.filter(({ field }) => !field);

  if (missingFields.length > 0) {
    const missing = missingFields.map(({ name }) => name).join(', ');
    throw new Error(`Missing required configuration: ${missing}`);
  }

  try {
    new URL(config.galaxy.url);
  } catch {
    throw new Error('Invalid GALAXY_URL format');
  }
}
