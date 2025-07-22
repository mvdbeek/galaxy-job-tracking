#!/usr/bin/env node

import { scheduler } from './services/scheduler';
import { aggregator } from './services/aggregator';
import { database } from './services/database';
import { validateConfig } from './config';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    validateConfig();
  } catch (error) {
    console.error('Configuration error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  try {
    switch (command) {
      case 'start':
        await scheduler.start();
        process.on('SIGINT', async () => {
          console.log('\nReceived SIGINT, shutting down gracefully...');
          await scheduler.stop();
          process.exit(0);
        });
        break;

      case 'run-once':
        await scheduler.runOnce();
        break;

      case 'backfill':
        const startDate = args[1];
        const endDate = args[2];
        if (!startDate || !endDate) {
          console.error('Usage: npm run dev backfill <start-date> <end-date>');
          console.error('Example: npm run dev backfill 2024-01-01 2024-01-02');
          process.exit(1);
        }
        await scheduler.backfill(startDate, endDate);
        break;

      case 'stats':
        await showStats(args[1], args[2]);
        break;

      case 'top-errors':
        await showTopErrors(args[1], args[2]);
        break;

      case 'handlers':
        await showHandlerStats(args[1], args[2]);
        break;

      case 'destinations':
        await showDestinationStats(args[1], args[2]);
        break;

      default:
        showUsage();
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function showStats(startDate?: string, endDate?: string): Promise<void> {
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date(end.getTime() - 24 * 60 * 60 * 1000);

  await database.connect();
  
  console.log(`\nJob Statistics from ${start.toISOString()} to ${end.toISOString()}`);
  console.log('='.repeat(80));

  const stats = await database.getJobErrorStatistics(start, end);
  
  console.log(`Total Jobs: ${stats.totalJobs}`);
  console.log(`Error Jobs: ${stats.errorJobs}`);
  console.log(`Error Rate: ${(stats.errorRate * 100).toFixed(2)}%`);
  
  console.log('\nTop Error Types:');
  stats.topErrors.forEach((error, index) => {
    console.log(`${index + 1}. ${error.errorType}: ${error.count} occurrences`);
  });

  await database.disconnect();
}

async function showTopErrors(startDate?: string, endDate?: string): Promise<void> {
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date(end.getTime() - 24 * 60 * 60 * 1000);

  await database.connect();
  
  console.log(`\nTop Failing Tools from ${start.toISOString()} to ${end.toISOString()}`);
  console.log('='.repeat(80));

  const topErrors = await aggregator.getTopFailingTools(start, end, 20);
  
  topErrors.forEach((tool, index) => {
    console.log(`${index + 1}. ${tool.toolId}`);
    console.log(`   Errors: ${tool.totalErrors}`);
    console.log(`   Error Rate: ${(tool.avgErrorRate * 100).toFixed(2)}%`);
    console.log(`   Occurrences: ${tool.occurrences}`);
    console.log('');
  });

  await database.disconnect();
}

async function showHandlerStats(startDate?: string, endDate?: string): Promise<void> {
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date(end.getTime() - 24 * 60 * 60 * 1000);

  await database.connect();
  
  console.log(`\nHandler Performance from ${start.toISOString()} to ${end.toISOString()}`);
  console.log('='.repeat(80));

  const handlers = await aggregator.getHandlerPerformance(start, end);
  
  handlers.forEach((handler, index) => {
    console.log(`${index + 1}. ${handler.handler}`);
    console.log(`   Total Jobs: ${handler.totalJobs}`);
    console.log(`   Error Jobs: ${handler.errorJobs}`);
    console.log(`   Error Rate: ${(handler.errorRate * 100).toFixed(2)}%`);
    console.log('');
  });

  await database.disconnect();
}

async function showDestinationStats(startDate?: string, endDate?: string): Promise<void> {
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date(end.getTime() - 24 * 60 * 60 * 1000);

  await database.connect();
  
  console.log(`\nDestination Performance from ${start.toISOString()} to ${end.toISOString()}`);
  console.log('='.repeat(80));

  const destinations = await aggregator.getDestinationPerformance(start, end);
  
  destinations.forEach((dest, index) => {
    console.log(`${index + 1}. ${dest.destination}`);
    console.log(`   Total Jobs: ${dest.totalJobs}`);
    console.log(`   Error Jobs: ${dest.errorJobs}`);
    console.log(`   Error Rate: ${(dest.errorRate * 100).toFixed(2)}%`);
    console.log('');
  });

  await database.disconnect();
}

function showUsage(): void {
  console.log(`
Galaxy Job Tracking System

Usage:
  npm run dev <command> [options]

Commands:
  start                           Start the continuous job tracking service
  run-once                        Run job fetching and aggregation once
  backfill <start> <end>         Backfill data for date range (YYYY-MM-DD format)
  stats [start] [end]            Show job statistics for date range
  top-errors [start] [end]       Show top failing tools
  handlers [start] [end]         Show handler performance statistics
  destinations [start] [end]     Show destination performance statistics

Examples:
  npm run dev start
  npm run dev run-once
  npm run dev backfill 2024-01-01 2024-01-02
  npm run dev stats 2024-01-01 2024-01-02
  npm run dev top-errors
  npm run dev handlers 2024-01-01
  npm run dev destinations

Environment Variables:
  GALAXY_URL                     Galaxy instance URL (required)
  GALAXY_API_KEY                 Galaxy API key (required)
  DATABASE_URL                   PostgreSQL connection string (required)
  POLL_INTERVAL_HOURS           Job polling interval in hours (default: 1)
  LOOKBACK_HOURS                Time window for job fetching (default: 1)
`);
}

if (require.main === module) {
  main().catch(console.error);
}

export { main };