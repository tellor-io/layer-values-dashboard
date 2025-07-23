# Running Multiple Layer Values Dashboard Instances

This guide explains how to run multiple Layer Values Dashboard instances on the same host machine for different chains, with each instance having its own isolated data sources and configuration.

## Problem Solved

Previously, multiple dashboard instances would share the same data sources, causing both dashboards to show identical information regardless of which chain they were supposed to monitor. This has been fixed with instance-specific configuration.

## Instance-Specific Configuration

Each dashboard instance now uses:

- **Instance Name**: Unique identifier for the instance (e.g., `palmito`, `mainnet`)
- **Source Directory**: Instance-specific CSV data directory (`source_tables_{instance_name}`)
- **Mount Path**: Instance-specific URL path (`/dashboard-{instance_name}`)
- **Log File**: Instance-specific log file (`dashboard_{instance_name}.log`)
- **Binary Path**: Instance-specific layerd binary (`layerd_{instance_name}` with fallback to `layerd`)

## Configuration Options

### Command Line Arguments

```bash
python -m uvicorn main:app --host 0.0.0.0 --port 8001 --instance-name palmito --source-dir source_tables_palmito --layer-rpc-url http://localhost:26657
```

### Environment Variables

```bash
export LAYER_INSTANCE_NAME="palmito"
export LAYER_SOURCE_DIR="source_tables_palmito"
export LAYER_RPC_URL="ws://localhost:26657"
```

## Running Multiple Instances

### Example Setup for Two Chains

#### Instance 1: Palmito Testnet
```bash
# Terminal 1 - Palmito instance
cd backend

# Option 1: Using command line arguments
python -m uvicorn main:app \
    --host 0.0.0.0 \
    --port 8001 \
    --instance-name palmito \
    --source-dir source_tables_palmito \
    --layer-rpc-url http://localhost:26657

# Option 2: Using environment variables
export LAYER_INSTANCE_NAME="palmito"
export LAYER_SOURCE_DIR="source_tables_palmito" 
export LAYER_RPC_URL="http://localhost:26657"
python -m uvicorn main:app --host 0.0.0.0 --port 8001
```

#### Instance 2: Mainnet
```bash
# Terminal 2 - Mainnet instance
cd backend

# Option 1: Using command line arguments
python -m uvicorn main:app \
    --host 0.0.0.0 \
    --port 8002 \
    --instance-name mainnet \
    --source-dir source_tables_mainnet \
    --layer-rpc-url http://localhost:26658

# Option 2: Using environment variables
export LAYER_INSTANCE_NAME="mainnet"
export LAYER_SOURCE_DIR="source_tables_mainnet"
export LAYER_RPC_URL="http://localhost:26658"
python -m uvicorn main:app --host 0.0.0.0 --port 8002
```

## Directory Structure

After running multiple instances, your directory structure should look like:

```
layer-values-dashboard/
├── backend/
│   ├── main.py
│   ├── dashboard_palmito.log      # Instance-specific log
│   └── dashboard_mainnet.log      # Instance-specific log
├── source_tables_palmito/         # Palmito CSV data
│   ├── table_1234567890.csv
│   └── table_1234567891.csv
├── source_tables_mainnet/         # Mainnet CSV data
│   ├── table_2345678901.csv
│   └── table_2345678902.csv
├── layerd_palmito                 # Instance-specific binary (optional)
├── layerd_mainnet                 # Instance-specific binary (optional)
└── layerd                         # Fallback binary
```

## Accessing Dashboard Instances

Once running, access your dashboards at:

- **Palmito**: http://localhost:8001/dashboard-palmito/
- **Mainnet**: http://localhost:8002/dashboard-mainnet/

## Data Isolation

Each instance maintains completely separate:

### CSV Data Sources
- Palmito reads from: `source_tables_palmito/`
- Mainnet reads from: `source_tables_mainnet/`

### In-Memory Databases
- Each instance has its own DuckDB in-memory database
- No data sharing between instances

### Reporter Data
- Each instance can connect to different RPC endpoints
- Separate reporter fetcher processes
- Instance-specific layerd binaries supported

## Configuration Files

### Using start_dashboard.py
```bash
# Palmito instance
python start_dashboard.py \
    --port 8001 \
    --instance-name palmito \
    --source-dir source_tables_palmito \
    --layer-rpc-url http://localhost:26657

# Mainnet instance  
python start_dashboard.py \
    --port 8002 \
    --instance-name mainnet \
    --source-dir source_tables_mainnet \
    --layer-rpc-url http://localhost:26658
```

### Using Environment Variables

Copy the environment template:
```bash
cp env.example .env
```

Edit `.env` with your configuration:
```bash
LAYER_INSTANCE_NAME=palmito
LAYER_SOURCE_DIR=source_tables_palmito
LAYER_RPC_URL=http://localhost:26657
```

Then run:
```bash
python start_dashboard.py --port 8001
```

### Multiple Environment Files

For multiple instances, create separate environment files:

**`.env.palmito`:**
```bash
LAYER_INSTANCE_NAME=palmito
LAYER_SOURCE_DIR=source_tables_palmito
LAYER_RPC_URL=http://localhost:26657
```

**`.env.mainnet`:**
```bash
LAYER_INSTANCE_NAME=mainnet
LAYER_SOURCE_DIR=source_tables_mainnet
LAYER_RPC_URL=http://localhost:26658
```

Then run each instance:
```bash
# Terminal 1 - Palmito
source .env.palmito && python start_dashboard.py --port 8001

# Terminal 2 - Mainnet  
source .env.mainnet && python start_dashboard.py --port 8002
```

## API Endpoints

Each instance exposes the same API endpoints but with instance-specific data:

- `GET /` - Instance-specific root info
- `GET /dashboard-{instance}/api/info` - Instance configuration and data info
- `GET /dashboard-{instance}/api/data` - Instance-specific transaction data
- `GET /dashboard-{instance}/api/stats` - Instance-specific statistics

## Troubleshooting

### Problem: Instances showing same data
**Solution**: Ensure each instance has a different `--source-dir` and `--instance-name`

### Problem: Cannot access dashboard
**Solution**: Check the correct URL format: `http://localhost:{port}/dashboard-{instance_name}/`

### Problem: Shared log files
**Solution**: Each instance now creates its own log file: `dashboard_{instance_name}.log`

### Problem: Port conflicts
**Solution**: Use different ports for each instance (8001, 8002, etc.)

## Monitoring Multiple Instances

### Check Running Instances
```bash
ps aux | grep uvicorn
```

### View Instance Logs
```bash
# Palmito logs
tail -f backend/dashboard_palmito.log

# Mainnet logs  
tail -f backend/dashboard_mainnet.log
```

### Check Instance Status
```bash
# Check Palmito instance
curl http://localhost:8001/dashboard-palmito/api/info

# Check Mainnet instance
curl http://localhost:8002/dashboard-mainnet/api/info
```

## Instance Information

Each instance now includes its configuration in the API response:

```json
{
  "instance_name": "palmito",
  "mount_path": "/dashboard-palmito", 
  "source_directory": "source_tables_palmito",
  "total_rows": 1234,
  "last_updated": 1234567890
}
```

## Security Considerations

When running multiple instances:

1. **Firewall**: Ensure only necessary ports are exposed
2. **Data Isolation**: Verify CSV data directories are separate
3. **Resource Limits**: Monitor memory usage with multiple instances
4. **Log Rotation**: Set up log rotation for instance-specific log files

## Performance Tips

1. **Memory**: Each instance uses its own in-memory database
2. **CPU**: Stagger instance startup to reduce initial load
3. **Disk I/O**: Use separate disks for different instance data if possible
4. **Ports**: Use non-consecutive ports to avoid conflicts during restarts 