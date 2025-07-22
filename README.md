# Galaxy Job Tracking System

A TypeScript application for tracking Galaxy job errors over time, analyzing failure patterns, and monitoring job performance across tools, handlers, and destinations.

## Features

- **Automated Job Fetching**: Periodically fetches terminal jobs from Galaxy API
- **Error Analysis**: Categorizes and stores stderr/stdout for failed jobs
- **Metrics Collection**: Tracks cgroup metrics and job performance data
- **Aggregation**: Calculates error rates by tool, handler, and destination
- **Historical Analysis**: Backfill capability for analyzing past job data
- **CLI Interface**: Command-line tools for stats and reporting

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL database
- Galaxy instance with API access
- Galaxy API key

## Setup

1. **Clone and install dependencies**:
   ```bash
   cd galaxy_job_tracking
   npm install
   ```

2. **Set up environment variables**:
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   GALAXY_URL=https://your-galaxy-instance.org
   GALAXY_API_KEY=your_api_key_here
   DATABASE_URL=postgresql://username:password@localhost:5432/galaxy_job_tracking
   NODE_ENV=production
   POLL_INTERVAL_HOURS=1
   LOOKBACK_HOURS=1
   ```

3. **Set up the database**:
   ```bash
   # Create the database
   createdb galaxy_job_tracking
   
   # Run migrations
   npx prisma db push
   ```

4. **Build the application**:
   ```bash
   npm run build
   ```

## Usage

### Start Continuous Monitoring

Start the service to continuously fetch and analyze Galaxy jobs:

```bash
npm start
```

This will:
- Fetch terminal jobs every hour (configurable)
- Process error jobs and extract stderr/stdout
- Collect job metrics and cgroup data
- Store aggregated statistics

### One-time Run

Fetch and process jobs once without continuous monitoring:

```bash
npm run dev run-once
```

### Backfill Historical Data

Process historical job data for a specific date range:

```bash
npm run dev backfill 2024-01-01 2024-01-31
```

### View Statistics

#### Job Statistics
```bash
# Last 24 hours
npm run dev stats

# Specific date range
npm run dev stats 2024-01-01 2024-01-31
```

#### Top Failing Tools
```bash
# Last 24 hours
npm run dev top-errors

# Specific date range  
npm run dev top-errors 2024-01-01 2024-01-31
```

#### Handler Performance
```bash
npm run dev handlers 2024-01-01 2024-01-31
```

#### Destination Performance
```bash
npm run dev destinations 2024-01-01 2024-01-31
```

## Database Schema

The system uses the following main tables:

- **jobs**: Core job information (ID, tool, state, timestamps, handler, destination)
- **job_errors**: Error details (stderr, stdout, error types, messages)
- **job_metrics**: Performance metrics and cgroup data
- **job_aggregates**: Pre-calculated statistics by time window
- **processing_status**: Tracking of last processed timestamps

## Error Categorization

Jobs are automatically categorized into error types:

- `memory_error`: Out of memory errors
- `timeout_error`: Job timeouts
- `file_not_found`: Missing input files
- `permission_error`: File permission issues
- `exit_code_N`: Non-zero exit codes
- `job_message_error`: Galaxy job message errors
- `unknown_error`: Uncategorized failures

## API Structure

The system uses Galaxy's OpenAPI schema with `openapi-fetch` for type-safe API interactions. Key endpoints used:

- `GET /api/jobs`: Fetch jobs with filters
- `GET /api/jobs/{job_id}?full=true`: Get detailed job information including metrics

## Development

### Run in Development Mode
```bash
npm run dev start
```

### Type Checking
```bash
npx tsc --noEmit
```

### Code Formatting
```bash
npm run format
npm run lint
```

### Update Galaxy API Types
```bash
npx openapi-typescript https://your-galaxy-instance.org/openapi.json -o ./src/types/galaxy-api.ts
```

## Configuration Options

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `GALAXY_URL` | Galaxy instance URL | `https://usegalaxy.org` |
| `GALAXY_API_KEY` | Galaxy API key | Required |
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `POLL_INTERVAL_HOURS` | Job fetching interval | `1` |
| `LOOKBACK_HOURS` | Time window for fetching | `1` |
| `NODE_ENV` | Environment mode | `development` |
| `LOG_LEVEL` | Logging level | `info` |

## Troubleshooting

### Database Connection Issues
- Ensure PostgreSQL is running
- Verify DATABASE_URL format: `postgresql://user:pass@host:port/db`
- Check database permissions

### API Authentication Issues  
- Verify GALAXY_API_KEY is valid
- Check Galaxy instance accessibility
- Ensure API key has sufficient permissions

### Memory Issues with Large Datasets
- Reduce LOOKBACK_HOURS for smaller batches
- Use backfill command for large historical imports
- Monitor PostgreSQL memory usage

## License

MIT