# Tellor Reporter Data Fetcher

This directory contains the implementation for fetching and storing Tellor reporter metadata from the blockchain using RPC queries.

## Files

- **`reporter_fetcher.py`** - Main reporter fetcher class that handles RPC queries, YAML parsing, and database storage
- **`example_output.yaml`** - Example output from the `layerd query reporter reporters` command for testing and reference
- **`test_integration.py`** - Integration tests to verify the functionality works correctly
- **`README.md`** - This documentation file

## Features

### ✅ Implemented Features

1. **Automatic RPC Queries**: Fetches reporter data every 60 seconds using the `layerd` binary
2. **YAML Parsing**: Parses the output from `layerd query reporter reporters` into structured data
3. **Database Integration**: Stores reporter metadata in a separate `reporters` table in DuckDB
4. **Unknown Reporter Handling**: Creates placeholder entries for reporters found in transaction data but not yet in the reporters table
5. **API Endpoints**: New REST API endpoints for accessing reporter data
6. **Frontend Page**: Separate reporters page at `/dashboard-palmito/reporters`
7. **Background Processing**: Runs in a separate thread without blocking the main dashboard

### 📊 Database Schema

The `reporters` table contains:

```sql
CREATE TABLE reporters (
    address VARCHAR PRIMARY KEY,
    moniker VARCHAR,
    commission_rate VARCHAR,
    jailed BOOLEAN DEFAULT FALSE,
    jailed_until TIMESTAMP,
    last_updated TIMESTAMP,
    min_tokens_required BIGINT,
    power INTEGER,
    fetched_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 🚀 How It Works

1. **Startup**: When the dashboard starts, the reporter fetcher initializes and performs an initial data fetch
2. **Periodic Updates**: Every 60 seconds, the fetcher runs `./layerd query reporter reporters` to get fresh data
3. **Data Processing**: The YAML output is parsed and stored/updated in the `reporters` table
4. **Unknown Reporter Detection**: The system checks for reporter addresses in transaction data that aren't in the reporters table
5. **Placeholder Creation**: Unknown reporters get placeholder entries until the next RPC update includes them

### 🔧 Configuration

The reporter fetcher is configured in the main backend startup:

- **Binary Path**: `../layerd` (relative to backend directory)
- **Update Interval**: 60 seconds
- **Database**: Shared DuckDB connection with the main dashboard

### 📡 API Endpoints

New endpoints available at `/dashboard-palmito/api/`:

- **`GET /reporters`** - Paginated list of reporters with filtering/sorting
- **`GET /reporters/{address}`** - Detailed information about a specific reporter
- **`GET /reporters-summary`** - Summary statistics about all reporters
- **`GET /reporter-fetcher-status`** - Status of the fetcher service

### 🌐 Frontend

- **Reporters Page**: Available at `/dashboard-palmito/reporters`
- **Features**: Search, filter, sort, pagination
- **Real-time**: Auto-refreshes every 5 minutes
- **Mobile-friendly**: Responsive design

## Usage

### Running Tests

```bash
# Run integration tests
python chain_queries/test_integration.py
```

### Starting the Dashboard

```bash
# Start with reporter fetcher enabled
python start_dashboard.py --source-dir /path/to/csv/files
```

The reporter fetcher will automatically start if the `layerd` binary is found at `../layerd`.

### Accessing Reporter Data

1. **Web Interface**: Visit `http://localhost:8001/dashboard-palmito/reporters`
2. **API**: Use the REST endpoints at `http://localhost:8001/dashboard-palmito/api/reporters*`
3. **Database**: Query the `reporters` table directly

## Requirements

- **Binary**: The `layerd` binary must be present at `../layerd` (relative to the backend directory)
- **Network**: The binary must be able to connect to the Tellor network for RPC queries
- **Dependencies**: PyYAML is required and automatically installed

## Error Handling

- **RPC Failures**: Logged and retried on the next interval
- **Parse Errors**: Logged with details about the problematic data
- **Database Errors**: Logged and gracefully handled without crashing the main dashboard
- **Unknown Reporters**: Automatically handled with placeholder entries

## Performance

- **Lightweight**: Runs in a background thread
- **Efficient**: Only updates changed data
- **Scalable**: Handles large numbers of reporters efficiently
- **Non-blocking**: Doesn't impact dashboard performance

## Monitoring

Check the fetcher status:

```bash
curl http://localhost:8001/dashboard-palmito/api/reporter-fetcher-status
```

Response includes:
- Service availability
- Last fetch time
- Update interval
- Binary path
- Running status

## Example Data

The example data includes 36 reporters with various states:
- 21 active reporters (with power > 0)
- 2 jailed reporters
- Various commission rates and monikers

This provides a good baseline for testing and development. 