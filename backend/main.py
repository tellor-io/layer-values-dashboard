import duckdb
import pandas as pd
import os
import glob
import argparse
import sys
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
import uvicorn
from typing import Optional, List
import threading
import time
from pathlib import Path
import re
import psutil
import gc
import asyncio
import logging
from contextlib import asynccontextmanager

# Configure logging for better error tracking
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('dashboard.log')
    ]
)
logger = logging.getLogger(__name__)

# Add this helper function FIRST
def formatNumber(num):
    """Format numbers with commas for readability"""
    if num is None:
        return "0"
    return f"{num:,}"

# Parse command line arguments for direct uvicorn usage
def parse_args():
    parser = argparse.ArgumentParser(add_help=False)  # Don't interfere with uvicorn's help
    parser.add_argument('--source-dir', '-s', 
                       default=os.getenv('LAYER_SOURCE_DIR', 'source_tables'),
                       help='Directory containing CSV files (default: source_tables)')
    
    # Only parse known args to avoid conflicts with uvicorn
    args, unknown = parser.parse_known_args()
    return args

# Get configuration
config = parse_args()
SOURCE_DIR = config.source_dir

logger.info(f"📊 Using source directory: {SOURCE_DIR}")

# Create main app
app = FastAPI(title="Layer Values Dashboard", version="1.0.0")

# Create dashboard sub-application
dashboard_app = FastAPI(title="Dashboard API", version="1.0.0")

# Enable CORS for both apps
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

dashboard_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Improved DuckDB configuration with memory limits and better connection management
def create_duckdb_connection():
    """Create a DuckDB connection with optimized settings"""
    try:
        # Create connection with valid global options
        conn = duckdb.connect(":memory:")
        
        # Set memory and thread configuration
        conn.execute("SET memory_limit='10GB'")
        conn.execute("SET threads=3")
        conn.execute("SET temp_directory='/tmp/duckdb'")
        
        # Performance optimizations
        conn.execute("SET preserve_insertion_order=false")
        conn.execute("SET enable_progress_bar=false")
        
        logger.info("✅ Created DuckDB connection with optimized settings")
        return conn
    except Exception as e:
        logger.error(f"❌ Error creating DuckDB connection: {str(e)}")
        raise

# Global DuckDB connection with improved configuration
conn = create_duckdb_connection()
db_lock = threading.RLock()  # Use RLock instead of Lock for better thread safety

# Data storage
data_info = {
    "tables": [],
    "last_updated": None,
    "total_rows": 0,
    "loaded_historical_tables": set(),  # Track which historical tables we've loaded
    "active_table": None,  # Current active table info
    "active_table_last_size": 0  # Track size of active table to detect changes
}

def parse_table_timestamp(filename):
    """Extract timestamp from table_<timestamp>.csv filename"""
    match = re.match(r'table_(\d+)\.csv$', filename)
    if match:
        return int(match.group(1))
    return None

def get_table_files():
    """Get all table CSV files and categorize them by timestamp"""
    source_dir = Path(SOURCE_DIR)
    if not source_dir.exists():
        source_dir = Path("source_tables")
    
    table_files = []
    for csv_file in source_dir.glob("table_*.csv"):
        timestamp = parse_table_timestamp(csv_file.name)
        if timestamp is not None:
            table_files.append({
                'path': csv_file,
                'filename': csv_file.name,
                'timestamp': timestamp,
                'size': csv_file.stat().st_size,
                'mtime': csv_file.stat().st_mtime
            })
    
    # Sort by timestamp (most recent last)
    table_files.sort(key=lambda x: x['timestamp'])
    return table_files

def load_historical_table(table_info):
    """Load a historical table that will never change"""
    try:
        # Add memory monitoring
        process = psutil.Process()
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB
        
        logger.info(f"💾 Loading historical table: {table_info['filename']} ({table_info['size'] / 1024 / 1024:.1f} MB)")
        logger.info(f"📊 Initial memory: {initial_memory:.1f} MB")
        
        # Check if file exists and is readable
        if not table_info['path'].exists():
            logger.error(f"❌ Error: File {table_info['path']} does not exist")
            return None
            
        # For very large files, add a warning and skip if too large
        if table_info['size'] > 500 * 1024 * 1024:  # 500MB limit
            logger.warning(f"⚠️  Skipping very large file ({table_info['size'] / 1024 / 1024:.1f} MB) to prevent memory issues")
            return None
        
        # Use thread-safe database access
        with db_lock:
            logger.info(f"📖 Reading CSV file: {table_info['path']}")
            
            try:
                # First, inspect the CSV to understand its structure
                logger.info("🔍 Inspecting CSV structure...")
                csv_info = conn.execute(f"""
                    SELECT * FROM read_csv_auto('{table_info['path']}', sample_size=100)
                    LIMIT 3
                """).fetchall()
                
                if not csv_info:
                    logger.error(f"❌ CSV file appears to be empty: {table_info['filename']}")
                    return None
                
                # Get column information
                csv_columns = conn.execute(f"""
                    DESCRIBE SELECT * FROM read_csv_auto('{table_info['path']}', sample_size=100)
                """).fetchall()
                
                logger.info(f"📋 Found {len(csv_columns)} columns in CSV:")
                for col in csv_columns:
                    logger.info(f"   - {col[0]}: {col[1]}")
                
                # Load data directly with proper error handling
                conn.execute(f"""
                    INSERT OR IGNORE INTO layer_data 
                    SELECT 
                        REPORTER,
                        QUERY_TYPE,
                        QUERY_ID,
                        AGGREGATE_METHOD,
                        CYCLELIST,
                        POWER,
                        TIMESTAMP,
                        TRUSTED_VALUE,
                        TX_HASH,
                        CURRENT_TIME,
                        TIME_DIFF,
                        VALUE,
                        DISPUTABLE,
                        '{table_info['filename']}' as source_file
                    FROM read_csv_auto('{table_info['path']}', 
                        header=true,
                        sample_size=10000,
                        ignore_errors=true
                    )
                """)
                
                # Get the count of rows actually inserted
                total_rows = conn.execute("""
                    SELECT COUNT(*) FROM layer_data WHERE source_file = ?
                """, [table_info['filename']]).fetchone()[0]
                
                logger.info(f"✅ Successfully inserted {total_rows} rows from {table_info['filename']}")
                
            except Exception as db_error:
                logger.error(f"❌ Database error loading {table_info['filename']}: {db_error}")
                
                # Try a more permissive approach
                try:
                    logger.info("🔄 Trying fallback approach with all_varchar...")
                    conn.execute(f"""
                        INSERT OR IGNORE INTO layer_data 
                        SELECT 
                            CAST(REPORTER AS VARCHAR),
                            CAST(QUERY_TYPE AS VARCHAR),
                            CAST(QUERY_ID AS VARCHAR),
                            CAST(AGGREGATE_METHOD AS VARCHAR),
                            TRY_CAST(CYCLELIST AS BOOLEAN),
                            TRY_CAST(POWER AS INTEGER),
                            TRY_CAST(TIMESTAMP AS BIGINT),
                            TRY_CAST(TRUSTED_VALUE AS DOUBLE),
                            CAST(TX_HASH AS VARCHAR),
                            TRY_CAST(CURRENT_TIME AS BIGINT),
                            TRY_CAST(TIME_DIFF AS INTEGER),
                            TRY_CAST(VALUE AS DOUBLE),
                            TRY_CAST(DISPUTABLE AS BOOLEAN),
                            '{table_info['filename']}' as source_file
                        FROM read_csv_auto('{table_info['path']}', 
                            header=true,
                            all_varchar=true,
                            sample_size=10000,
                            ignore_errors=true
                        )
                    """)
                    
                    total_rows = conn.execute("""
                        SELECT COUNT(*) FROM layer_data WHERE source_file = ?
                    """, [table_info['filename']]).fetchone()[0]
                    
                    logger.info(f"✅ Fallback successful: inserted {total_rows} rows from {table_info['filename']}")
                    
                except Exception as fallback_error:
                    logger.error(f"❌ Fallback also failed: {fallback_error}")
                    return None
        
        # Check memory after read
        after_read_memory = process.memory_info().rss / 1024 / 1024
        logger.info(f"📊 Memory after read: {after_read_memory:.1f} MB (delta: +{after_read_memory - initial_memory:.1f} MB)")
        
        data_info["loaded_historical_tables"].add(table_info['filename'])
        
        # Force garbage collection
        gc.collect()
        
        # Final memory check
        final_memory = process.memory_info().rss / 1024 / 1024  # MB
        logger.info(f"✅ Successfully loaded {table_info['filename']} with {total_rows} rows")
        logger.info(f"📊 Final memory: {final_memory:.1f} MB (total delta: +{final_memory - initial_memory:.1f} MB)")
        
        return {
            "filename": table_info['filename'],
            "rows": total_rows,
            "size_mb": round(table_info['size'] / 1024 / 1024, 2),
            "timestamp": table_info['timestamp'],
            "type": "historical"
        }
        
    except Exception as e:
        logger.error(f"❌ Error loading historical table {table_info['filename']}: {e}")
        import traceback
        traceback.print_exc()
        return None

def load_active_table(table_info, is_reload=False):
    """Load or reload the active table"""
    try:
        # Add memory monitoring
        process = psutil.Process()
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB
        
        if is_reload:
            logger.info(f"💾 Reloading active table: {table_info['filename']} ({table_info['size'] / 1024 / 1024:.1f} MB)")
            logger.info(f"📊 Initial memory: {initial_memory:.1f} MB")
            
            # Remove existing data for this file with thread safety
            with db_lock:
                logger.info(f"🗑️  Removing existing data for {table_info['filename']}")
                conn.execute("DELETE FROM layer_data WHERE source_file = ?", [table_info['filename']])
        else:
            logger.info(f"💾 Loading active table: {table_info['filename']} ({table_info['size'] / 1024 / 1024:.1f} MB)")
            logger.info(f"📊 Initial memory: {initial_memory:.1f} MB")
        
        # Check if file exists and is readable
        if not table_info['path'].exists():
            logger.error(f"❌ Error: File {table_info['path']} does not exist")
            return None
            
        # For very large files, add a warning but still try to load (active table is important)
        if table_info['size'] > 1024 * 1024 * 1024:  # 1GB warning
            logger.warning(f"⚠️  Very large active table detected ({table_info['size'] / 1024 / 1024:.1f} MB), loading carefully...")
        
        # Use thread-safe database access
        with db_lock:
            logger.info(f"📖 Reading CSV file: {table_info['path']}")
            
            try:
                # First, inspect the CSV to understand its structure
                logger.info("🔍 Inspecting CSV structure...")
                csv_info = conn.execute(f"""
                    SELECT * FROM read_csv_auto('{table_info['path']}', sample_size=100)
                    LIMIT 3
                """).fetchall()
                
                if not csv_info:
                    logger.error(f"❌ CSV file appears to be empty: {table_info['filename']}")
                    return None
                
                # Get column information
                csv_columns = conn.execute(f"""
                    DESCRIBE SELECT * FROM read_csv_auto('{table_info['path']}', sample_size=100)
                """).fetchall()
                
                logger.info(f"📋 Found {len(csv_columns)} columns in CSV:")
                for col in csv_columns:
                    logger.info(f"   - {col[0]}: {col[1]}")
                
                # Load data directly with proper error handling
                conn.execute(f"""
                    INSERT OR IGNORE INTO layer_data 
                    SELECT 
                        REPORTER,
                        QUERY_TYPE,
                        QUERY_ID,
                        AGGREGATE_METHOD,
                        CYCLELIST,
                        POWER,
                        TIMESTAMP,
                        TRUSTED_VALUE,
                        TX_HASH,
                        CURRENT_TIME,
                        TIME_DIFF,
                        VALUE,
                        DISPUTABLE,
                        '{table_info['filename']}' as source_file
                    FROM read_csv_auto('{table_info['path']}', 
                        header=true,
                        sample_size=10000,
                        ignore_errors=true
                    )
                """)
                
                # Get the count of rows actually inserted
                total_rows = conn.execute("""
                    SELECT COUNT(*) FROM layer_data WHERE source_file = ?
                """, [table_info['filename']]).fetchone()[0]
                
                logger.info(f"✅ Successfully inserted {total_rows} rows from {table_info['filename']}")
                
            except Exception as db_error:
                logger.error(f"❌ Database error loading {table_info['filename']}: {db_error}")
                
                # Try a more permissive approach
                try:
                    logger.info("🔄 Trying fallback approach with all_varchar...")
                    conn.execute(f"""
                        INSERT OR IGNORE INTO layer_data 
                        SELECT 
                            CAST(REPORTER AS VARCHAR),
                            CAST(QUERY_TYPE AS VARCHAR),
                            CAST(QUERY_ID AS VARCHAR),
                            CAST(AGGREGATE_METHOD AS VARCHAR),
                            TRY_CAST(CYCLELIST AS BOOLEAN),
                            TRY_CAST(POWER AS INTEGER),
                            TRY_CAST(TIMESTAMP AS BIGINT),
                            TRY_CAST(TRUSTED_VALUE AS DOUBLE),
                            CAST(TX_HASH AS VARCHAR),
                            TRY_CAST(CURRENT_TIME AS BIGINT),
                            TRY_CAST(TIME_DIFF AS INTEGER),
                            TRY_CAST(VALUE AS DOUBLE),
                            TRY_CAST(DISPUTABLE AS BOOLEAN),
                            '{table_info['filename']}' as source_file
                        FROM read_csv_auto('{table_info['path']}', 
                            header=true,
                            all_varchar=true,
                            sample_size=10000,
                            ignore_errors=true
                        )
                    """)
                    
                    total_rows = conn.execute("""
                        SELECT COUNT(*) FROM layer_data WHERE source_file = ?
                    """, [table_info['filename']]).fetchone()[0]
                    
                    logger.info(f"✅ Fallback successful: inserted {total_rows} rows from {table_info['filename']}")
                    
                except Exception as fallback_error:
                    logger.error(f"❌ Fallback also failed: {fallback_error}")
                    return None
        
        logger.info(f"✅ Read {total_rows} rows from {table_info['filename']}")
        
        data_info["active_table"] = table_info
        data_info["active_table_last_size"] = table_info['size']
        
        # Force garbage collection
        gc.collect()
        
        # Final memory check
        final_memory = process.memory_info().rss / 1024 / 1024  # MB
        logger.info(f"✅ Successfully loaded {table_info['filename']} with {total_rows} rows")
        logger.info(f"📊 Final memory: {final_memory:.1f} MB (total delta: +{final_memory - initial_memory:.1f} MB)")
        
        return {
            "filename": table_info['filename'],
            "rows": total_rows,
            "size_mb": round(table_info['size'] / 1024 / 1024, 2),
            "timestamp": table_info['timestamp'],
            "type": "active"
        }
        
    except Exception as e:
        logger.error(f"❌ Error loading active table {table_info['filename']}: {e}")
        import traceback
        traceback.print_exc()
        return None

def load_csv_files():
    """Load CSV files with smart handling of historical vs active tables"""
    global data_info
    
    try:
        # Use thread-safe database access
        with db_lock:
            # Create unified table schema with TX_HASH as primary key to prevent duplicates
            conn.execute("""
                CREATE TABLE IF NOT EXISTS layer_data (
                    REPORTER VARCHAR,
                    QUERY_TYPE VARCHAR,
                    QUERY_ID VARCHAR,
                    AGGREGATE_METHOD VARCHAR,
                    CYCLELIST BOOLEAN,
                    POWER INTEGER,
                    TIMESTAMP BIGINT,
                    TRUSTED_VALUE DOUBLE,
                    TX_HASH VARCHAR PRIMARY KEY,
                    CURRENT_TIME BIGINT,
                    TIME_DIFF INTEGER,
                    VALUE DOUBLE,
                    DISPUTABLE BOOLEAN,
                    source_file VARCHAR
                )
            """)
            
            # Add indexes for better performance on common queries
            try:
                conn.execute("CREATE INDEX IF NOT EXISTS idx_timestamp ON layer_data(TIMESTAMP)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_current_time ON layer_data(CURRENT_TIME)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_reporter ON layer_data(REPORTER)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_query_id ON layer_data(QUERY_ID)")
                logger.info("✅ Created database indexes for better performance")
            except Exception as idx_error:
                logger.warning(f"⚠️  Warning: Could not create some indexes: {idx_error}")
        
        table_files = get_table_files()
        
        if not table_files:
            logger.warning("⚠️  No table CSV files found in source_tables directory")
            return
        
        logger.info(f"📂 Found {len(table_files)} table files...")
        
        # Limit historical tables to prevent memory issues
        max_historical_tables = 5  # Only keep last 5 historical tables
        
        tables_info = []
        total_rows = 0
        
        # The most recent timestamp file is the active one
        active_table = table_files[-1] if table_files else None
        # Limit historical tables
        historical_tables = table_files[:-1] if len(table_files) > 1 else []
        historical_tables = historical_tables[-max_historical_tables:]  # Only last N historical
        
        logger.info(f"📚 Will load {len(historical_tables)} historical tables (limited for stability)")
        
        # Load historical tables (only if not already loaded)
        for table_info in historical_tables:
            if table_info['filename'] not in data_info["loaded_historical_tables"]:
                result = load_historical_table(table_info)
                if result:
                    tables_info.append(result)
                    total_rows += result["rows"]
            else:
                logger.info(f"⏭️  Skipping already loaded historical table: {table_info['filename']}")
        
        # Load active table
        if active_table:
            # Check if we have a different active table than before
            current_active = data_info.get("active_table")
            if current_active and current_active['filename'] != active_table['filename']:
                # The previously active table is now historical, mark it as loaded
                data_info["loaded_historical_tables"].add(current_active['filename'])
                logger.info(f"📦 Previous active table {current_active['filename']} is now historical")
            
            result = load_active_table(active_table)
            if result:
                tables_info.append(result)
                total_rows += result["rows"]
        
        # Get current total from database with thread safety
        with db_lock:
            actual_total = conn.execute("SELECT COUNT(*) FROM layer_data").fetchone()[0]
        
        data_info.update({
            "tables": tables_info,
            "last_updated": time.time(),
            "total_rows": actual_total
        })
        
        logger.info(f"📊 Database now contains {formatNumber(actual_total)} total rows")
        if active_table:
            logger.info(f"📋 Active table: {active_table['filename']}")
        logger.info(f"📚 Historical tables loaded: {len(data_info['loaded_historical_tables'])}")
        
        # Force garbage collection after loading
        gc.collect()
        
    except Exception as e:
        logger.error(f"❌ Error in load_csv_files: {e}")
        import traceback
        traceback.print_exc()

def periodic_reload():
    """Periodically check for updates in the active CSV file or new files"""
    while True:
        try:
            time.sleep(10)  # Check every 10 seconds
            
            table_files = get_table_files()
            if not table_files:
                continue
            
            # Get the most recent table (should be active)
            newest_table = table_files[-1]
            current_active = data_info.get("active_table")
            
            # Check if we have a new active table (newer timestamp)
            if not current_active or newest_table['timestamp'] > current_active['timestamp']:
                logger.info("📥 Detected new active table, reloading data...")
                load_csv_files()
                continue
            
            # Check if the current active table has grown
            if (current_active and 
                newest_table['filename'] == current_active['filename'] and
                newest_table['size'] != data_info["active_table_last_size"]):
                
                logger.info(f"📈 Active table {newest_table['filename']} has grown, reloading...")
                result = load_active_table(newest_table, is_reload=True)
                if result:
                    # Update total count with thread safety
                    with db_lock:
                        actual_total = conn.execute("SELECT COUNT(*) FROM layer_data").fetchone()[0]
                    data_info["total_rows"] = actual_total
                    data_info["last_updated"] = time.time()
                    logger.info(f"🔄 Reloaded active table, database now has {formatNumber(actual_total)} rows")
                
        except Exception as e:
            logger.error(f"❌ Error in periodic reload: {e}")
            import traceback
            traceback.print_exc()

# Revert to the original startup event pattern
@app.on_event("startup")
async def startup_event():
    """Initialize data on startup"""
    logger.info("🚀 Starting Layer Values Dashboard")
    # Load data on startup
    load_csv_files()
    # Start periodic reload thread
    reload_thread = threading.Thread(target=periodic_reload, daemon=True)
    reload_thread.start()

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("🛑 Shutting down Layer Values Dashboard")

@app.get("/")
async def root_redirect():
    """Redirect root to dashboard"""
    return {"message": "Layer Values Dashboard API", "dashboard_url": "/dashboard/"}

# Dashboard sub-application routes
@dashboard_app.get("/")
async def serve_frontend():
    """Serve the main frontend page"""
    html_path = Path("../frontend/index.html")
    if not html_path.exists():
        raise HTTPException(status_code=404, detail="Frontend not found")
    
    # Read the HTML content and update asset paths
    with open(html_path, 'r', encoding='utf-8') as f:
        html_content = f.read()
    
    # Update static asset paths to be relative to /dashboard/
    html_content = html_content.replace('href="./static/', 'href="/dashboard/static/')
    html_content = html_content.replace('src="./static/', 'src="/dashboard/static/')
    
    return HTMLResponse(content=html_content)

# API routes for dashboard
@dashboard_app.get("/api/info")
async def get_info():
    """Get information about loaded data"""
    info = data_info.copy()
    
    # Add more detailed information
    if data_info.get("active_table"):
        info["active_table_info"] = {
            "filename": data_info["active_table"]["filename"],
            "timestamp": data_info["active_table"]["timestamp"],
            "size_mb": round(data_info["active_table"]["size"] / 1024 / 1024, 2)
        }
    
    info["historical_tables_count"] = len(data_info["loaded_historical_tables"])
    info["historical_tables"] = list(data_info["loaded_historical_tables"])
    
    return info

@dashboard_app.get("/api/data")
async def get_data(
    limit: int = Query(100, ge=1, le=1000),  # Reduced max limit
    offset: int = Query(0, ge=0),
    reporter: Optional[str] = None,
    query_type: Optional[str] = None,
    query_id: Optional[str] = None,
    min_value: Optional[float] = None,
    max_value: Optional[float] = None,
    source_file: Optional[str] = None,
    questionable_only: Optional[bool] = None
):
    """Get paginated data with optional filters - defaults to most recent 1000 records on first load"""
    try:
        # Build WHERE clause
        where_conditions = []
        params = {}
        
        if reporter:
            where_conditions.append("REPORTER LIKE ?")
            params['reporter'] = f"%{reporter}%"
        
        if query_type:
            where_conditions.append("QUERY_TYPE = ?")
            params['query_type'] = query_type
            
        if query_id:
            where_conditions.append("QUERY_ID LIKE ?")
            params['query_id'] = f"%{query_id}%"
            
        if min_value is not None:
            where_conditions.append("VALUE >= ?")
            params['min_value'] = min_value
            
        if max_value is not None:
            where_conditions.append("VALUE <= ?")
            params['max_value'] = max_value
            
        if source_file:
            where_conditions.append("source_file = ?")
            params['source_file'] = source_file
        
        # Add questionable filter
        if questionable_only:
            current_time_ms = int(time.time() * 1000)
            hours_72_ms = 72 * 60 * 60 * 1000  # 72 hours in milliseconds
            where_conditions.append("DISPUTABLE = true")
            where_conditions.append(f"({current_time_ms} - TIMESTAMP) < {hours_72_ms}")
        
        where_clause = " AND ".join(where_conditions) if where_conditions else "1=1"
        
        # Use thread-safe database access
        with db_lock:
            try:
                # First check if we have any data at all
                total_in_db = conn.execute("SELECT COUNT(*) FROM layer_data").fetchone()[0]
                logger.info(f"🔍 Debug: Total rows in database: {total_in_db}")
                
                if total_in_db == 0:
                    logger.warning("⚠️  No data found in database")
                    return {
                        "data": [],
                        "total": 0,
                        "limit": limit,
                        "offset": offset,
                        "debug_info": "No data in database"
                    }
                
                # Get total count using a simpler query
                count_query = f"""
                    SELECT COUNT(*) 
                    FROM layer_data 
                    WHERE {where_clause}
                """
                total = conn.execute(count_query, list(params.values())).fetchone()[0]
                logger.info(f"🔍 Debug: Filtered total: {total}")
                
                # Calculate actual limit and offset
                actual_limit = min(limit, 1000)  # Hard cap at 1000
                actual_offset = min(offset, max(0, total - actual_limit))
                
                # Create temporary table for the filtered data
                conn.execute("DROP TABLE IF EXISTS temp_filtered")
                conn.execute(f"""
                    CREATE TEMPORARY TABLE temp_filtered AS 
                    SELECT * FROM layer_data 
                    WHERE {where_clause}
                    ORDER BY TIMESTAMP DESC
                    LIMIT {actual_limit + actual_offset}
                """, list(params.values()))
                
                # Get the paginated data from the temp table
                result = conn.execute(f"""
                    SELECT * FROM temp_filtered 
                    ORDER BY TIMESTAMP DESC
                    LIMIT {actual_limit}
                    OFFSET {actual_offset}
                """).fetchall()
                
                logger.info(f"🔍 Debug: Query returned {len(result)} rows")
                
                # Clean up
                conn.execute("DROP TABLE IF EXISTS temp_filtered")
                
                # Convert to list of dicts with proper field mapping
                data = []
                chunk_size = 100  # Process results in smaller chunks
                for i in range(0, len(result), chunk_size):
                    chunk = result[i:i + chunk_size]
                    for row in chunk:
                        data.append({
                            'REPORTER': row[0] if row[0] is not None else '',
                            'QUERY_TYPE': row[1] if row[1] is not None else '',
                            'QUERY_ID': row[2] if row[2] is not None else '',
                            'AGGREGATE_METHOD': row[3] if row[3] is not None else '',
                            'CYCLELIST': bool(row[4]) if row[4] is not None else False,
                            'POWER': int(row[5]) if row[5] is not None else 0,
                            'TIMESTAMP': int(row[6]) if row[6] is not None else 0,
                            'TRUSTED_VALUE': float(row[7]) if row[7] is not None else 0.0,
                            'TX_HASH': row[8] if row[8] is not None else '',
                            'CURRENT_TIME': int(row[9]) if row[9] is not None else 0,
                            'TIME_DIFF': int(row[10]) if row[10] is not None else 0,
                            'VALUE': float(row[11]) if row[11] is not None else 0.0,
                            'DISPUTABLE': bool(row[12]) if row[12] is not None else False,
                            'source_file': row[13] if row[13] is not None else ''
                        })
                    
                    # Force garbage collection after each chunk
                    gc.collect()
                
                logger.info(f"🔍 Debug: Processed {len(data)} data rows")
                if data:
                    logger.info(f"🔍 Debug: First row keys: {list(data[0].keys())}")
                    logger.info(f"🔍 Debug: First row sample: {data[0]}")
                
                return {
                    "data": data,
                    "total": total,
                    "limit": actual_limit,
                    "offset": actual_offset
                }
                
            except Exception as db_error:
                logger.error(f"❌ Database error in get_data: {db_error}")
                import traceback
                traceback.print_exc()
                raise HTTPException(status_code=500, detail=str(db_error))
            
    except Exception as e:
        logger.error(f"❌ Error in get_data: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_app.get("/api/stats")
async def get_stats():
    """Get statistical information about the data"""
    try:
        stats = {}
        
        # Use thread-safe database access
        with db_lock:
            # Basic counts
            stats["total_rows"] = conn.execute("SELECT COUNT(*) FROM layer_data").fetchone()[0]
            stats["unique_reporters"] = conn.execute("SELECT COUNT(DISTINCT REPORTER) FROM layer_data").fetchone()[0]
            stats["unique_query_types"] = conn.execute("SELECT COUNT(DISTINCT QUERY_TYPE) FROM layer_data").fetchone()[0]
            
            # Unique query IDs in past 30 days
            days_30_ms = 30 * 24 * 60 * 60 * 1000  # 30 days in milliseconds
            current_time_ms = int(time.time() * 1000)
            start_time_30d = current_time_ms - days_30_ms
            
            unique_query_ids_30d = conn.execute("""
                SELECT COUNT(DISTINCT QUERY_ID) 
                FROM layer_data 
                WHERE TIMESTAMP >= ?
            """, [start_time_30d]).fetchone()[0]
            
            stats["unique_query_ids_30d"] = unique_query_ids_30d
            
            # Average agreement for most recent query ID
            recent_query_agreement = conn.execute("""
                WITH recent_query AS (
                    SELECT QUERY_ID
                    FROM layer_data
                    ORDER BY TIMESTAMP DESC
                    LIMIT 1
                ),
                recent_timestamp AS (
                    SELECT TIMESTAMP
                    FROM layer_data
                    ORDER BY TIMESTAMP DESC
                    LIMIT 1
                )
                SELECT 
                    AVG(CASE 
                        WHEN ld.TRUSTED_VALUE != 0 THEN 
                            (1 - ABS((ld.VALUE - ld.TRUSTED_VALUE) / ld.TRUSTED_VALUE)) * 100
                        ELSE NULL 
                    END) as avg_agreement
                FROM recent_query rq
                JOIN recent_timestamp rt ON 1=1
                JOIN layer_data ld ON rq.QUERY_ID = ld.QUERY_ID AND rt.TIMESTAMP = ld.TIMESTAMP
                WHERE ld.TRUSTED_VALUE != 0
            """).fetchone()
            
            if recent_query_agreement and recent_query_agreement[0] is not None:
                stats["average_agreement"] = round(recent_query_agreement[0], 2)
            else:
                stats["average_agreement"] = None
            
            # Value statistics
            value_stats = conn.execute("""
                SELECT 
                    MIN(VALUE) as min_value,
                    MAX(VALUE) as max_value,
                    MEDIAN(VALUE) as median_value
                FROM layer_data
            """).fetchone()
            
            stats["value_stats"] = {
                "min": value_stats[0],
                "max": value_stats[1],
                "median": value_stats[2]
            }
            
            # Total reporter power for the most recent timestamp
            recent_timestamp_power = conn.execute("""
                WITH recent_timestamp AS (
                    SELECT TIMESTAMP 
                    FROM layer_data 
                    ORDER BY TIMESTAMP DESC 
                    LIMIT 1
                )
                SELECT 
                    rt.TIMESTAMP,
                    SUM(ld.POWER) as total_power,
                    COUNT(*) as reporter_count
                FROM recent_timestamp rt
                JOIN layer_data ld ON rt.TIMESTAMP = ld.TIMESTAMP
                GROUP BY rt.TIMESTAMP
            """).fetchone()
            
            if recent_timestamp_power:
                stats["total_reporter_power"] = recent_timestamp_power[1]
                stats["recent_timestamp"] = recent_timestamp_power[0]
                stats["recent_reporter_count"] = recent_timestamp_power[2]
            else:
                stats["total_reporter_power"] = 0
                stats["recent_timestamp"] = None
                stats["recent_reporter_count"] = 0
            
            # Recent activity (last hour)
            recent_count = conn.execute("""
                SELECT COUNT(*) FROM layer_data 
                WHERE CURRENT_TIME > (SELECT MAX(CURRENT_TIME) - 3600000 FROM layer_data)
            """).fetchone()[0]
            
            stats["recent_activity"] = recent_count
            
            # Questionable values calculation
            # Get current time in milliseconds (since TIMESTAMP appears to be in milliseconds)
            current_time_ms = int(time.time() * 1000)
            hours_72_ms = 72 * 60 * 60 * 1000  # 72 hours in milliseconds
            hours_48_ms = 48 * 60 * 60 * 1000  # 48 hours in milliseconds
            
            # Count questionable values (DISPUTABLE = true AND within 72 hours)
            questionable_stats = conn.execute("""
                SELECT 
                    COUNT(*) as total_questionable,
                    COUNT(CASE WHEN (? - TIMESTAMP) < ? THEN 1 END) as urgent_questionable
                FROM layer_data 
                WHERE DISPUTABLE = true 
                AND (? - TIMESTAMP) < ?
            """, [current_time_ms, hours_48_ms, current_time_ms, hours_72_ms]).fetchone()
            
            stats["questionable_values"] = {
                "total": questionable_stats[0],
                "urgent": questionable_stats[1],  # Count within 48 hours
                "has_urgent": questionable_stats[1] > 0  # Boolean for urgent styling
            }
            
            # Top reporters
            top_reporters = conn.execute("""
                SELECT REPORTER, COUNT(*) as count 
                FROM layer_data 
                GROUP BY REPORTER 
                ORDER BY count DESC 
                LIMIT 50
            """).df().to_dict(orient="records")
            
            stats["top_reporters"] = top_reporters
            
            # Top query IDs
            top_query_ids = conn.execute("""
                SELECT QUERY_ID, COUNT(*) as count 
                FROM layer_data 
                GROUP BY QUERY_ID 
                ORDER BY count DESC 
                LIMIT 50
            """).df().to_dict(orient="records")
            
            stats["top_query_ids"] = top_query_ids
            
            # Query type distribution
            query_types = conn.execute("""
                SELECT QUERY_TYPE, COUNT(*) as count 
                FROM layer_data 
                GROUP BY QUERY_TYPE 
                ORDER BY count DESC
            """).df().to_dict(orient="records")
            
            stats["query_types"] = query_types
        
        return stats
        
    except Exception as e:
        logger.error(f"❌ Stats error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_app.get("/api/analytics")
async def get_analytics(
    timeframe: str = Query(..., regex="^(24h|7d|30d)$"),
    request: Request = None
):
    """Get analytics data with cellular optimization"""
    try:
        user_agent = request.headers.get("user-agent", "") if request else ""
        is_mobile = any(mobile in user_agent.lower() for mobile in ["mobile", "android", "iphone", "ipad"])
        is_cellular = any(carrier in user_agent.lower() for carrier in [
            "verizon", "att", "t-mobile", "sprint", "vodafone", "orange"
        ]) or request.headers.get("connection-type", "").lower() in ["cellular", "4g", "5g"]
        
        logger.info(f"🔄 Analytics request: timeframe={timeframe}, mobile={is_mobile}, cellular={is_cellular}")
        
        # Aggressive optimization for cellular
        if is_cellular:
            if timeframe == "24h":
                interval_ms = 2 * 60 * 60 * 1000  # 2 hours instead of 4
                num_buckets = 12
            elif timeframe == "7d":
                interval_ms = 12 * 60 * 60 * 1000  # 12 hours
                num_buckets = 14
            elif timeframe == "30d":
                interval_ms = 5 * 24 * 60 * 60 * 1000  # 5 days instead of 10
                num_buckets = 6
        elif is_mobile:
            # Standard mobile optimization
            if timeframe == "24h":
                interval_ms = 1 * 60 * 60 * 1000  # 1 hour
                num_buckets = 24
            elif timeframe == "7d":
                interval_ms = 12 * 60 * 60 * 1000  # 12 hours
                num_buckets = 14
            elif timeframe == "30d":
                interval_ms = 2 * 24 * 60 * 60 * 1000  # 2 days
                num_buckets = 15
        else:
            # Desktop gets higher resolution
            if timeframe == "24h":
                interval_ms = 30 * 60 * 1000  # 30 minutes
                num_buckets = 48
            elif timeframe == "7d":
                interval_ms = 6 * 60 * 60 * 1000  # 6 hours
                num_buckets = 28
            elif timeframe == "30d":
                interval_ms = 24 * 60 * 60 * 1000  # 1 day
                num_buckets = 30
        
        current_time_ms = int(time.time() * 1000)
        start_time = current_time_ms - (num_buckets * interval_ms)
        
        # Use optimized query with shorter timeout for cellular
        with db_lock:
            try:
                if is_cellular:
                    conn.execute("SET query_timeout = '5s'")  # Very short timeout
                elif is_mobile:
                    conn.execute("SET query_timeout = '10s'")
                
                # Simplified query for cellular
                results = conn.execute("""
                    SELECT 
                        FLOOR((TIMESTAMP - ?) / ?) as bucket_id,
                        COUNT(*) as count
                    FROM layer_data 
                    WHERE TIMESTAMP >= ? AND TIMESTAMP < ?
                    GROUP BY bucket_id
                    ORDER BY bucket_id
                """, [start_time, interval_ms, start_time, current_time_ms]).fetchall()
                
                if is_cellular or is_mobile:
                    conn.execute("RESET query_timeout")
                
            except Exception as db_error:
                logger.error(f"❌ Database error in analytics: {db_error}")
                if is_cellular or is_mobile:
                    conn.execute("RESET query_timeout")
                raise HTTPException(status_code=500, detail=f"Analytics query failed: {str(db_error)}")
        
        # Generate minimal response for cellular
        buckets = []
        for i in range(num_buckets):
            bucket_start = start_time + (i * interval_ms)
            
            count = 0
            for result in results:
                if result[0] == i:
                    count = result[1]
                    break
            
            time_label = pd.to_datetime(bucket_start, unit='ms').strftime('%H:%M' if timeframe == '24h' else '%m/%d')
            buckets.append({
                "time": bucket_start,
                "time_label": time_label,
                "count": count
            })
        
        optimization_note = ""
        if is_cellular:
            optimization_note = " (Cellular Optimized)"
        elif is_mobile:
            optimization_note = " (Mobile Optimized)"
        
        response_data = {
            "timeframe": timeframe,
            "title": f"Reports (Past {timeframe}){optimization_note}",
            "data": buckets,
            "cellular_optimized": is_cellular,
            "mobile_optimized": is_mobile
        }
        
        logger.info(f"✅ Analytics response ready: {len(buckets)} buckets, cellular={is_cellular}")
        return response_data
        
    except Exception as e:
        logger.error(f"❌ Analytics error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Analytics processing failed: {str(e)}")

@dashboard_app.get("/api/search")
async def search_data(
    q: str = Query(..., min_length=1),
    limit: int = Query(50, ge=1, le=1000)
):
    """Search across all text fields"""
    try:
        search_query = f"""
            SELECT * FROM layer_data 
            WHERE 
                REPORTER LIKE '%{q}%' OR
                QUERY_ID LIKE '%{q}%' OR
                TX_HASH LIKE '%{q}%' OR
                CAST(VALUE AS VARCHAR) LIKE '%{q}%'
            ORDER BY CURRENT_TIME DESC
            LIMIT {limit}
        """
        
        results = conn.execute(search_query).df()
        
        return {
            "results": results.to_dict(orient="records"),
            "count": len(results),
            "query": q
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@dashboard_app.get("/api/query-analytics")
async def get_query_analytics(
    timeframe: str = Query(..., regex="^(24h|7d|30d)$")
):
    """Get analytics data by query ID for different timeframes"""
    try:
        logger.info(f"🔄 Query analytics request: timeframe={timeframe}")
        current_time_ms = int(time.time() * 1000)
        
        # Add memory usage logging
        process = psutil.Process()
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB
        logger.info(f"📊 Initial memory usage: {initial_memory:.1f} MB")
        
        # Use thread-safe database access
        with db_lock:
            if timeframe == "24h":
                logger.info("🕒 Processing 24h query analytics...")
                # 30-minute intervals over past 24 hours
                hours_24_ms = 24 * 60 * 60 * 1000
                interval_ms = 30 * 60 * 1000  # 30 minutes
                num_buckets = 48
                start_time = current_time_ms - hours_24_ms
                
            elif timeframe == "7d":
                logger.info("📅 Processing 7d query analytics...")
                # 6-hour intervals over past 7 days
                days_7_ms = 7 * 24 * 60 * 60 * 1000
                interval_ms = 6 * 60 * 60 * 1000  # 6 hours
                num_buckets = 28
                start_time = current_time_ms - days_7_ms
                
            elif timeframe == "30d":
                logger.info("📊 Processing 30d query analytics...")
                # Daily intervals over past 30 days
                days_30_ms = 30 * 24 * 60 * 60 * 1000
                interval_ms = 24 * 60 * 60 * 1000  # 1 day
                num_buckets = 30
                start_time = current_time_ms - days_30_ms
            
            logger.info(f"📈 Querying query ID data from {start_time} to {current_time_ms}")
            
            # Get top query IDs in the timeframe
            top_query_ids = conn.execute("""
                SELECT QUERY_ID, COUNT(*) as count 
                FROM layer_data 
                WHERE TIMESTAMP >= ? AND TIMESTAMP < ?
                GROUP BY QUERY_ID 
                ORDER BY count DESC 
                LIMIT 10
            """, [start_time, current_time_ms]).fetchall()
            
            if not top_query_ids:
                return {
                    "timeframe": timeframe,
                    "title": f"Reports by Query ID (Past {timeframe})",
                    "data": [],
                    "query_ids": []
                }
            
            logger.info(f"🔍 Found {len(top_query_ids)} top query IDs")
            
            # Get time series data for each query ID
            query_data = {}
            query_id_list = []
            
            for query_id_row in top_query_ids:
                query_id = query_id_row[0]
                query_id_list.append({
                    "id": query_id,
                    "total_count": query_id_row[1],
                    "short_name": query_id[:12] + "..." if len(query_id) > 15 else query_id
                })
                
                # Get bucketed data for this query ID
                results = conn.execute("""
                    WITH time_buckets AS (
                        SELECT 
                            TIMESTAMP,
                            FLOOR((TIMESTAMP - ?) / ?) as bucket_id
                        FROM layer_data 
                        WHERE TIMESTAMP >= ? AND TIMESTAMP < ? 
                        AND QUERY_ID = ?
                    )
                    SELECT 
                        bucket_id,
                        COUNT(*) as count
                    FROM time_buckets
                    GROUP BY bucket_id
                    ORDER BY bucket_id
                """, [start_time, interval_ms, start_time, current_time_ms, query_id]).fetchall()
                
                # Create complete time series for this query ID
                buckets = []
                for i in range(num_buckets):
                    bucket_start = start_time + (i * interval_ms)
                    
                    # Find matching result
                    count = 0
                    for result in results:
                        if result[0] == i:
                            count = result[1]
                            break
                    
                    buckets.append(count)
                
                query_data[query_id] = buckets
            
            # Generate time labels
            time_labels = []
            for i in range(num_buckets):
                bucket_start = start_time + (i * interval_ms)
                dt = pd.to_datetime(bucket_start, unit='ms')
                
                if timeframe == "24h":
                    time_labels.append(dt.strftime('%H:%M'))
                elif timeframe == "7d":
                    time_labels.append(dt.strftime('%m/%d'))
                elif timeframe == "30d":
                    time_labels.append(dt.strftime('%m/%d'))
            
            return {
                "timeframe": timeframe,
                "title": f"Reports by Query ID (Past {timeframe})",
                "time_labels": time_labels,
                "query_ids": query_id_list,
                "data": query_data
            }
            
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        logger.error(f"❌ Query analytics error: {str(e)}")
        logger.error(f"📋 Full traceback:\n{error_details}")
        
        # Log memory state on error
        try:
            process = psutil.Process()
            current_memory = process.memory_info().rss / 1024 / 1024  # MB
            logger.info(f"📊 Memory usage at error: {current_memory:.1f} MB")
        except:
            pass
            
        raise HTTPException(status_code=500, detail=f"Query analytics processing failed: {str(e)}")

@dashboard_app.get("/api/reporter-analytics")
async def get_reporter_analytics(
    timeframe: str = Query(..., regex="^(24h|7d|30d)$")
):
    """Get analytics data by reporter for different timeframes"""
    try:
        logger.info(f"�� Reporter analytics request: timeframe={timeframe}")
        current_time_ms = int(time.time() * 1000)
        
        # Add memory usage logging
        process = psutil.Process()
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB
        logger.info(f"📊 Initial memory usage: {initial_memory:.1f} MB")
        
        # Use thread-safe database access
        with db_lock:
            if timeframe == "24h":
                logger.info("🕒 Processing 24h reporter analytics...")
                # 30-minute intervals over past 24 hours
                hours_24_ms = 24 * 60 * 60 * 1000
                interval_ms = 30 * 60 * 1000  # 30 minutes
                num_buckets = 48
                start_time = current_time_ms - hours_24_ms
                
            elif timeframe == "7d":
                logger.info("📅 Processing 7d reporter analytics...")
                # 6-hour intervals over past 7 days
                days_7_ms = 7 * 24 * 60 * 60 * 1000
                interval_ms = 6 * 60 * 60 * 1000  # 6 hours
                num_buckets = 28
                start_time = current_time_ms - days_7_ms
                
            elif timeframe == "30d":
                logger.info("📊 Processing 30d reporter analytics...")
                # Daily intervals over past 30 days
                days_30_ms = 30 * 24 * 60 * 60 * 1000
                interval_ms = 24 * 60 * 60 * 1000  # 1 day
                num_buckets = 30
                start_time = current_time_ms - days_30_ms
            
            logger.info(f"📈 Querying reporter data from {start_time} to {current_time_ms}")
            
            # Get top reporters in the timeframe
            top_reporters = conn.execute("""
                SELECT REPORTER, COUNT(*) as count 
                FROM layer_data 
                WHERE TIMESTAMP >= ? AND TIMESTAMP < ?
                GROUP BY REPORTER 
                ORDER BY count DESC 
                LIMIT 15
            """, [start_time, current_time_ms]).fetchall()
            
            if not top_reporters:
                return {
                    "timeframe": timeframe,
                    "title": f"Reports by Reporter (Past {timeframe})",
                    "data": [],
                    "reporters": []
                }
            
            logger.info(f"🔍 Found {len(top_reporters)} top reporters")
            
            # Get time series data for each reporter
            reporter_data = {}
            reporter_list = []
            
            for reporter_row in top_reporters:
                reporter = reporter_row[0]
                reporter_list.append({
                    "address": reporter,
                    "total_count": reporter_row[1],
                    "short_name": reporter[:8] + "..." + reporter[-6:] if len(reporter) > 20 else reporter
                })
                
                # Get bucketed data for this reporter
                results = conn.execute("""
                    WITH time_buckets AS (
                        SELECT 
                            TIMESTAMP,
                            FLOOR((TIMESTAMP - ?) / ?) as bucket_id
                        FROM layer_data 
                        WHERE TIMESTAMP >= ? AND TIMESTAMP < ? 
                        AND REPORTER = ?
                    )
                    SELECT 
                        bucket_id,
                        COUNT(*) as count
                    FROM time_buckets
                    GROUP BY bucket_id
                    ORDER BY bucket_id
                """, [start_time, interval_ms, start_time, current_time_ms, reporter]).fetchall()
                
                # Create complete time series for this reporter
                buckets = []
                for i in range(num_buckets):
                    bucket_start = start_time + (i * interval_ms)
                    
                    # Find matching result
                    count = 0
                    for result in results:
                        if result[0] == i:
                            count = result[1]
                            break
                    
                    buckets.append(count)
                
                reporter_data[reporter] = buckets
            
            # Generate time labels
            time_labels = []
            for i in range(num_buckets):
                bucket_start = start_time + (i * interval_ms)
                dt = pd.to_datetime(bucket_start, unit='ms')
                
                if timeframe == "24h":
                    time_labels.append(dt.strftime('%H:%M'))
                elif timeframe == "7d":
                    time_labels.append(dt.strftime('%m/%d'))
                elif timeframe == "30d":
                    time_labels.append(dt.strftime('%m/%d'))
            
            return {
                "timeframe": timeframe,
                "title": f"Reports by Reporter (Past {timeframe})",
                "time_labels": time_labels,
                "reporters": reporter_list,
                "data": reporter_data
            }
            
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        logger.error(f"❌ Reporter analytics error: {str(e)}")
        logger.error(f"📋 Full traceback:\n{error_details}")
        
        # Log memory state on error
        try:
            process = psutil.Process()
            current_memory = process.memory_info().rss / 1024 / 1024  # MB
            logger.info(f"📊 Memory usage at error: {current_memory:.1f} MB")
        except:
            pass
            
        raise HTTPException(status_code=500, detail=f"Reporter analytics processing failed: {str(e)}")

@dashboard_app.get("/api/reporter-power-analytics")
async def get_reporter_power_analytics(
    query_id: Optional[str] = Query(None, description="Filter by specific query ID")
):
    """Get reporter power distribution and absent reporters"""
    try:
        logger.info(f"🔄 Reporter power analytics request, query_id={query_id}")
        current_time_ms = int(time.time() * 1000)
        
        # Add memory usage logging
        process = psutil.Process()
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB
        logger.info(f"📊 Initial memory usage: {initial_memory:.1f} MB")
        
        # Use thread-safe database access
        with db_lock:
            # Get available query IDs from the past 24 hours for the selector
            hours_24_ms = 24 * 60 * 60 * 1000
            start_time_24h = current_time_ms - hours_24_ms
            
            query_ids_24h = conn.execute("""
                SELECT 
                    QUERY_ID,
                    COUNT(*) as report_count,
                    COUNT(DISTINCT REPORTER) as unique_reporters
                FROM layer_data 
                WHERE TIMESTAMP >= ?
                GROUP BY QUERY_ID 
                ORDER BY report_count DESC
                LIMIT 20
            """, [start_time_24h]).fetchall()
            
            query_ids_list = [{
                "id": row[0],
                "report_count": row[1],
                "unique_reporters": row[2],
                "short_name": row[0][:15] + "..." if len(row[0]) > 18 else row[0]
            } for row in query_ids_24h]
            
            # Build the main query based on whether we're filtering by query ID
            if query_id:
                logger.info(f"📊 Filtering by query ID: {query_id}")
                
                # Find recent timestamps where this specific query ID was reported
                recent_query_timestamps = conn.execute("""
                    SELECT DISTINCT TIMESTAMP 
                    FROM layer_data 
                    WHERE QUERY_ID = ?
                    ORDER BY TIMESTAMP DESC 
                    LIMIT 5
                """, [query_id]).fetchall()
                
                if not recent_query_timestamps:
                    return {
                        "title": f"Reporter Power Distribution - {query_id[:20]}{'...' if len(query_id) > 20 else ''}",
                        "power_data": [],
                        "absent_reporters": [],
                        "target_timestamp": None,
                        "total_power": 0,
                        "query_ids_24h": query_ids_list,
                        "selected_query_id": query_id,
                        "query_info": None,
                        "error": f"No recent data found for query ID: {query_id}"
                    }
                
                # Use the most recent timestamp for this specific query ID
                # (since we're looking at a specific query, we can use the most recent)
                target_timestamp = recent_query_timestamps[0][0]
                logger.info(f"📈 Using most recent timestamp for query {query_id}: {target_timestamp}")
                
                # Get power distribution for specific query ID at target timestamp
                power_data_query = """
                    SELECT 
                        ld.REPORTER,
                        ld.POWER,
                        ld.VALUE,
                        ld.TRUSTED_VALUE
                    FROM layer_data ld
                    WHERE ld.TIMESTAMP = ? AND ld.QUERY_ID = ?
                    ORDER BY ld.POWER DESC
                """
                power_results = conn.execute(power_data_query, [target_timestamp, query_id]).fetchall()
                
                # Get query info
                query_info = conn.execute("""
                    SELECT 
                        COUNT(*) as total_reports,
                        COUNT(DISTINCT REPORTER) as unique_reporters,
                        AVG(VALUE) as avg_value,
                        MIN(VALUE) as min_value,
                        MAX(VALUE) as max_value,
                        QUERY_TYPE
                    FROM layer_data 
                    WHERE TIMESTAMP = ? AND QUERY_ID = ?
                    GROUP BY QUERY_TYPE
                """, [target_timestamp, query_id]).fetchone()
                
                if query_info:
                    query_info_dict = {
                        "total_reports": query_info[0],
                        "unique_reporters": query_info[1],
                        "avg_value": query_info[2],
                        "min_value": query_info[3],
                        "max_value": query_info[4],
                        "query_type": query_info[5]
                    }
                else:
                    query_info_dict = None
                
                title = f"Reporter Power Distribution - {query_id[:20]}{'...' if len(query_id) > 20 else ''}"
            
            else:
                logger.info(f"📊 Getting overall power distribution")
                
                # For overall view, use second most recent timestamp to avoid incomplete blocks
                # Get the second most recent timestamp to avoid incomplete blocks
                recent_timestamps = conn.execute("""
                    SELECT DISTINCT TIMESTAMP 
                    FROM layer_data 
                    ORDER BY TIMESTAMP DESC 
                    LIMIT 2
                """).fetchall()
                
                if len(recent_timestamps) < 2:
                    # If we only have one timestamp, use it but warn
                    if len(recent_timestamps) == 1:
                        target_timestamp = recent_timestamps[0][0]
                        logger.warning(f"⚠️  Only one timestamp available for overall view, using: {target_timestamp}")
                    else:
                        return {
                            "title": "Reporter Power Distribution (Overall)",
                            "power_data": [],
                            "absent_reporters": [],
                            "target_timestamp": None,
                            "total_power": 0,
                            "query_ids_24h": query_ids_list,
                            "selected_query_id": query_id,
                            "query_info": None,
                            "error": "No timestamp data available"
                        }
                else:
                    # Use second most recent timestamp for stability
                    target_timestamp = recent_timestamps[1][0]
                    logger.info(f"📈 Using second most recent timestamp for overall view: {target_timestamp}")
                
                # Get overall power distribution at target timestamp
                power_data_query = """
                    SELECT 
                        ld.REPORTER,
                        ld.POWER
                    FROM layer_data ld
                    WHERE ld.TIMESTAMP = ?
                    ORDER BY ld.POWER DESC
                """
                power_results = conn.execute(power_data_query, [target_timestamp]).fetchall()
                query_info_dict = None
                title = "Reporter Power Distribution (Overall)"
            
            if not power_results:
                return {
                    "title": title,
                    "power_data": [],
                    "absent_reporters": [],
                    "target_timestamp": target_timestamp,
                    "total_power": 0,
                    "query_ids_24h": query_ids_list,
                    "selected_query_id": query_id,
                    "query_info": query_info_dict
                }
            
            # Process power distribution
            power_distribution = []
            total_power = 0
            
            for row in power_results:
                if query_id and len(row) >= 4:
                    # With query ID filtering, we have VALUE and TRUSTED_VALUE
                    reporter, power, value, trusted_value = row[:4]
                    power_distribution.append({
                        "reporter": reporter,
                        "power": power,
                        "value": value,
                        "trusted_value": trusted_value,
                        "short_name": reporter[:8] + "..." + reporter[-6:] if len(reporter) > 20 else reporter
                    })
                else:
                    # Overall view, just reporter and power
                    reporter, power = row[:2]
                    power_distribution.append({
                        "reporter": reporter,
                        "power": power,
                        "short_name": reporter[:8] + "..." + reporter[-6:] if len(reporter) > 20 else reporter
                    })
                total_power += power
            
            logger.info(f"🔍 Found {len(power_distribution)} reporters with total power: {total_power}")
            
            # Get reporters who reported in the past hour but are absent from target timestamp
            hour_ms = 60 * 60 * 1000
            hour_ago = current_time_ms - hour_ms
            
            recent_reporters = conn.execute("""
                SELECT DISTINCT REPORTER
                FROM layer_data 
                WHERE CURRENT_TIME >= ?
            """, [hour_ago]).fetchall()
            
            recent_reporter_addresses = {row[0] for row in recent_reporters}
            current_round_reporters = {item["reporter"] for item in power_distribution}
            
            # Find absent reporters
            absent_reporters = []
            for reporter_row in recent_reporters:
                reporter = reporter_row[0]
                if reporter not in current_round_reporters:
                    # Get their last report info
                    last_report = conn.execute("""
                        SELECT POWER, CURRENT_TIME
                        FROM layer_data 
                        WHERE REPORTER = ?
                        ORDER BY CURRENT_TIME DESC
                        LIMIT 1
                    """, [reporter]).fetchone()
                    
                    if last_report:
                        absent_reporters.append({
                            "reporter": reporter,
                            "short_name": reporter[:8] + "..." + reporter[-6:] if len(reporter) > 20 else reporter,
                            "last_power": last_report[0],
                            "last_report_time": last_report[1]
                        })
            
            logger.info(f"🚫 Found {len(absent_reporters)} absent reporters")
            
            return {
                "title": title,
                "power_data": power_distribution,
                "absent_reporters": absent_reporters,
                "target_timestamp": target_timestamp,
                "total_power": total_power,
                "query_ids_24h": query_ids_list,
                "selected_query_id": query_id,
                "query_info": query_info_dict
            }
            
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        logger.error(f"❌ Reporter power analytics error: {str(e)}")
        logger.error(f"📋 Full traceback:\n{error_details}")
        
        # Log memory state on error
        try:
            process = psutil.Process()
            current_memory = process.memory_info().rss / 1024 / 1024  # MB
            logger.info(f"📊 Memory usage at error: {current_memory:.1f} MB")
        except:
            pass
            
        raise HTTPException(status_code=500, detail=f"Reporter power analytics processing failed: {str(e)}")

@dashboard_app.get("/api/agreement-analytics")
async def get_agreement_analytics(
    timeframe: str = Query(..., regex="^(24h|7d|30d)$")
):
    """Get agreement analytics showing deviation from trusted values by query ID"""
    try:
        logger.info(f"🔄 Agreement analytics request: timeframe={timeframe}")
        current_time_ms = int(time.time() * 1000)
        
        # Add memory usage logging
        process = psutil.Process()
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB
        logger.info(f"📊 Initial memory usage: {initial_memory:.1f} MB")
        
        # Use thread-safe database access
        with db_lock:
            if timeframe == "24h":
                logger.info("🕒 Processing 24h agreement analytics...")
                # 30-minute intervals over past 24 hours
                hours_24_ms = 24 * 60 * 60 * 1000
                interval_ms = 30 * 60 * 1000  # 30 minutes
                num_buckets = 48
                start_time = current_time_ms - hours_24_ms
                
            elif timeframe == "7d":
                logger.info("📅 Processing 7d agreement analytics...")
                # 6-hour intervals over past 7 days
                days_7_ms = 7 * 24 * 60 * 60 * 1000
                interval_ms = 6 * 60 * 60 * 1000  # 6 hours
                num_buckets = 28
                start_time = current_time_ms - days_7_ms
                
            elif timeframe == "30d":
                logger.info("📊 Processing 30d agreement analytics...")
                # Daily intervals over past 30 days
                days_30_ms = 30 * 24 * 60 * 60 * 1000
                interval_ms = 24 * 60 * 60 * 1000  # 1 day
                num_buckets = 30
                start_time = current_time_ms - days_30_ms
            
            logger.info(f"📈 Querying agreement data from {start_time} to {current_time_ms}")
            
            # Get top query IDs in the timeframe
            top_query_ids = conn.execute("""
                SELECT QUERY_ID, COUNT(*) as count 
                FROM layer_data 
                WHERE TIMESTAMP >= ? AND TIMESTAMP < ?
                AND TRUSTED_VALUE != 0
                GROUP BY QUERY_ID 
                ORDER BY count DESC 
                LIMIT 10
            """, [start_time, current_time_ms]).fetchall()
            
            if not top_query_ids:
                return {
                    "timeframe": timeframe,
                    "title": f"Agreement Analytics (Past {timeframe})",
                    "data": [],
                    "query_ids": []
                }
            
            logger.info(f"🔍 Found {len(top_query_ids)} top query IDs")
            
            # Get deviation data for each query ID
            query_data = {}
            query_id_list = []
            
            for query_id_row in top_query_ids:
                query_id = query_id_row[0]
                query_id_list.append({
                    "id": query_id,
                    "total_count": query_id_row[1],
                    "short_name": query_id[:12] + "..." if len(query_id) > 15 else query_id
                })
                
                # Get bucketed deviation data for this query ID
                results = conn.execute("""
                    WITH time_buckets AS (
                        SELECT 
                            TIMESTAMP,
                            FLOOR((TIMESTAMP - ?) / ?) as bucket_id,
                            ABS((VALUE - TRUSTED_VALUE) / TRUSTED_VALUE) * 100 as deviation_percent
                        FROM layer_data 
                        WHERE TIMESTAMP >= ? AND TIMESTAMP < ? 
                        AND QUERY_ID = ?
                        AND TRUSTED_VALUE != 0
                    )
                    SELECT 
                        bucket_id,
                        AVG(deviation_percent) as avg_deviation
                    FROM time_buckets
                    GROUP BY bucket_id
                    ORDER BY bucket_id
                """, [start_time, interval_ms, start_time, current_time_ms, query_id]).fetchall()
                
                # Create complete time series for this query ID
                buckets = []
                for i in range(num_buckets):
                    bucket_start = start_time + (i * interval_ms)
                    
                    # Find matching result
                    avg_deviation = None
                    for result in results:
                        if result[0] == i:
                            avg_deviation = result[1]
                            break
                    
                    buckets.append(avg_deviation)
                
                query_data[query_id] = buckets
            
            # Generate time labels
            time_labels = []
            for i in range(num_buckets):
                bucket_start = start_time + (i * interval_ms)
                dt = pd.to_datetime(bucket_start, unit='ms')
                
                if timeframe == "24h":
                    time_labels.append(dt.strftime('%H:%M'))
                elif timeframe == "7d":
                    time_labels.append(dt.strftime('%m/%d'))
                elif timeframe == "30d":
                    time_labels.append(dt.strftime('%m/%d'))
            
            return {
                "timeframe": timeframe,
                "title": f"Agreement Analytics - Deviation from Trusted Values (Past {timeframe})",
                "time_labels": time_labels,
                "query_ids": query_id_list,
                "data": query_data
            }
            
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        logger.error(f"❌ Agreement analytics error: {str(e)}")
        logger.error(f"📋 Full traceback:\n{error_details}")
        
        # Log memory state on error
        try:
            process = psutil.Process()
            current_memory = process.memory_info().rss / 1024 / 1024  # MB
            logger.info(f"📊 Memory usage at error: {current_memory:.1f} MB")
        except:
            pass
            
        raise HTTPException(status_code=500, detail=f"Agreement analytics processing failed: {str(e)}")

# Mount static files for dashboard
dashboard_app.mount("/static", StaticFiles(directory="../frontend"), name="static")

# Mount dashboard sub-application
app.mount("/dashboard", dashboard_app)

# Add after existing middleware
@app.middleware("http")
async def cellular_optimization_middleware(request: Request, call_next):
    start_time = time.time()
    
    # Enhanced mobile/cellular detection
    user_agent = request.headers.get("user-agent", "")
    is_mobile = any(mobile in user_agent.lower() for mobile in ["mobile", "android", "iphone", "ipad"])
    
    # Detect cellular networks (this is approximate)
    is_cellular = any(carrier in user_agent.lower() for carrier in [
        "verizon", "att", "t-mobile", "sprint", "vodafone", "orange", "ee", "three"
    ])
    
    # Check for cellular network indicators
    x_forwarded_for = request.headers.get("x-forwarded-for", "")
    connection_type = request.headers.get("connection-type", "").lower()
    is_cellular = is_cellular or connection_type in ["cellular", "4g", "5g", "3g"]
    
    logger.info(f"📱 {'CELLULAR' if is_cellular else 'MOBILE' if is_mobile else 'DESKTOP'} Request: {request.method} {request.url.path} - UA: {user_agent[:50]}...")
    
    try:
        response = await call_next(request)
        process_time = time.time() - start_time
        
        # Add cellular-optimized headers
        if is_cellular:
            response.headers["Cache-Control"] = "public, max-age=60"  # Shorter cache
            response.headers["Connection"] = "keep-alive"
            response.headers["X-Cellular-Optimized"] = "true"
        elif is_mobile:
            response.headers["Cache-Control"] = "public, max-age=120"
            response.headers["X-Mobile-Optimized"] = "true"
        
        logger.info(f"✅ Response: {response.status_code} - Time: {process_time:.3f}s - Cellular: {is_cellular}")
        return response
        
    except Exception as e:
        process_time = time.time() - start_time
        logger.error(f"❌ Request failed: {request.method} {request.url.path} - Error: {str(e)} - Time: {process_time:.3f}s - Cellular: {is_cellular}")
        raise

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True) 
