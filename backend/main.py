import duckdb
import pandas as pd
import os
import glob
import argparse
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import uvicorn
from typing import Optional, List
import threading
import time
from pathlib import Path
import re

# Configuration
SOURCE_DIR = os.getenv('LAYER_SOURCE_DIR', 'source_tables')

app = FastAPI(title="Layer Values Dashboard", version="1.0.0")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global DuckDB connection
conn = duckdb.connect(":memory:")

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
        print(f"Loading historical table: {table_info['filename']} ({table_info['size'] / 1024 / 1024:.1f} MB)")
        
        # Check if file exists and is readable
        if not table_info['path'].exists():
            print(f"Error: File {table_info['path']} does not exist")
            return None
            
        # For very large files, add a warning
        if table_info['size'] > 50 * 1024 * 1024:  # 50MB
            print(f"Warning: Large file detected ({table_info['size'] / 1024 / 1024:.1f} MB), this may take some time...")
        
        # Read with DuckDB for performance
        print(f"Reading CSV file: {table_info['path']}")
        df = conn.execute(f"""
            SELECT *, '{table_info['filename']}' as source_file 
            FROM read_csv_auto('{table_info['path']}')
        """).df()
        
        print(f"Read {len(df)} rows from {table_info['filename']}")
        
        # Insert into unified table
        print(f"Inserting {len(df)} rows into database...")
        conn.execute("INSERT INTO layer_data SELECT * FROM df")
        
        rows = len(df)
        data_info["loaded_historical_tables"].add(table_info['filename'])
        
        print(f"Successfully loaded {table_info['filename']} with {rows} rows")
        
        return {
            "filename": table_info['filename'],
            "rows": rows,
            "size_mb": round(table_info['size'] / 1024 / 1024, 2),
            "timestamp": table_info['timestamp'],
            "type": "historical"
        }
        
    except Exception as e:
        print(f"Error loading historical table {table_info['filename']}: {e}")
        import traceback
        traceback.print_exc()
        return None

def load_active_table(table_info, is_reload=False):
    """Load or reload the active table"""
    try:
        if is_reload:
            print(f"Reloading active table: {table_info['filename']} ({table_info['size'] / 1024 / 1024:.1f} MB)")
            # Remove existing data for this file
            print(f"Removing existing data for {table_info['filename']}")
            conn.execute("DELETE FROM layer_data WHERE source_file = ?", [table_info['filename']])
        else:
            print(f"Loading active table: {table_info['filename']} ({table_info['size'] / 1024 / 1024:.1f} MB)")
        
        # Check if file exists and is readable
        if not table_info['path'].exists():
            print(f"Error: File {table_info['path']} does not exist")
            return None
            
        # For very large files, add a warning
        if table_info['size'] > 500 * 1024 * 1024:  # 500MB
            print(f"Warning: Large file detected ({table_info['size'] / 1024 / 1024:.1f} MB), this may take some time...")
        
        # Read with DuckDB for performance
        print(f"Reading CSV file: {table_info['path']}")
        df = conn.execute(f"""
            SELECT *, '{table_info['filename']}' as source_file 
            FROM read_csv_auto('{table_info['path']}')
        """).df()
        
        print(f"Read {len(df)} rows from {table_info['filename']}")
        
        # Insert into unified table
        print(f"Inserting {len(df)} rows into database...")
        conn.execute("INSERT INTO layer_data SELECT * FROM df")
        
        rows = len(df)
        data_info["active_table"] = table_info
        data_info["active_table_last_size"] = table_info['size']
        
        print(f"Successfully loaded {table_info['filename']} with {rows} rows")
        
        return {
            "filename": table_info['filename'],
            "rows": rows,
            "size_mb": round(table_info['size'] / 1024 / 1024, 2),
            "timestamp": table_info['timestamp'],
            "type": "active"
        }
        
    except Exception as e:
        print(f"Error loading active table {table_info['filename']}: {e}")
        import traceback
        traceback.print_exc()
        return None

def load_csv_files():
    """Load CSV files with smart handling of historical vs active tables"""
    global data_info
    
    # Create unified table schema
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
            TX_HASH VARCHAR,
            CURRENT_TIME BIGINT,
            TIME_DIFF INTEGER,
            VALUE DOUBLE,
            DISPUTABLE BOOLEAN,
            source_file VARCHAR
        )
    """)
    
    table_files = get_table_files()
    
    if not table_files:
        print("No table CSV files found in source_tables directory")
        return
    
    print(f"Found {len(table_files)} table files...")
    
    tables_info = []
    total_rows = 0
    
    # The most recent timestamp file is the active one
    active_table = table_files[-1] if table_files else None
    historical_tables = table_files[:-1] if len(table_files) > 1 else []
    
    # Load historical tables (only if not already loaded)
    for table_info in historical_tables:
        if table_info['filename'] not in data_info["loaded_historical_tables"]:
            result = load_historical_table(table_info)
            if result:
                tables_info.append(result)
                total_rows += result["rows"]
        else:
            print(f"Skipping already loaded historical table: {table_info['filename']}")
    
    # Load active table
    if active_table:
        # Check if we have a different active table than before
        current_active = data_info.get("active_table")
        if current_active and current_active['filename'] != active_table['filename']:
            # The previously active table is now historical, mark it as loaded
            data_info["loaded_historical_tables"].add(current_active['filename'])
            print(f"Previous active table {current_active['filename']} is now historical")
        
        result = load_active_table(active_table)
        if result:
            tables_info.append(result)
            total_rows += result["rows"]
    
    # Get current total from database
    actual_total = conn.execute("SELECT COUNT(*) FROM layer_data").fetchone()[0]
    
    data_info.update({
        "tables": tables_info,
        "last_updated": time.time(),
        "total_rows": actual_total
    })
    
    print(f"Database now contains {actual_total} total rows")
    if active_table:
        print(f"Active table: {active_table['filename']}")
    print(f"Historical tables loaded: {len(data_info['loaded_historical_tables'])}")

def periodic_reload():
    """Periodically check for updates in the active CSV file or new files"""
    while True:
        time.sleep(10)  # Check every 10 seconds
        try:
            table_files = get_table_files()
            if not table_files:
                continue
            
            # Get the most recent table (should be active)
            newest_table = table_files[-1]
            current_active = data_info.get("active_table")
            
            # Check if we have a new active table (newer timestamp)
            if not current_active or newest_table['timestamp'] > current_active['timestamp']:
                print("Detected new active table, reloading data...")
                load_csv_files()
                continue
            
            # Check if the current active table has grown
            if (current_active and 
                newest_table['filename'] == current_active['filename'] and
                newest_table['size'] != data_info["active_table_last_size"]):
                
                print(f"Active table {newest_table['filename']} has grown, reloading...")
                result = load_active_table(newest_table, is_reload=True)
                if result:
                    # Update total count
                    actual_total = conn.execute("SELECT COUNT(*) FROM layer_data").fetchone()[0]
                    data_info["total_rows"] = actual_total
                    data_info["last_updated"] = time.time()
                    print(f"Reloaded active table, database now has {actual_total} rows")
                
        except Exception as e:
            print(f"Error in periodic reload: {e}")

# Initialize data on startup
@app.on_event("startup")
async def startup_event():
    load_csv_files()
    # Start background thread for periodic updates
    reload_thread = threading.Thread(target=periodic_reload, daemon=True)
    reload_thread.start()

@app.get("/")
async def serve_frontend():
    """Serve the main frontend page"""
    return FileResponse("../frontend/index.html")

@app.get("/api/info")
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

@app.get("/api/data")
async def get_data(
    limit: int = Query(100, ge=1, le=10000),
    offset: int = Query(0, ge=0),
    reporter: Optional[str] = None,
    query_type: Optional[str] = None,
    query_id: Optional[str] = None,
    min_value: Optional[float] = None,
    max_value: Optional[float] = None,
    source_file: Optional[str] = None,
    questionable_only: Optional[bool] = None
):
    """Get paginated data with optional filters"""
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
        
        # Get total count
        count_query = f"SELECT COUNT(*) as total FROM layer_data WHERE {where_clause}"
        total = conn.execute(count_query, list(params.values())).fetchone()[0]
        
        # Get data
        data_query = f"""
            SELECT * FROM layer_data 
            WHERE {where_clause}
            ORDER BY CURRENT_TIME DESC, TIMESTAMP DESC
            LIMIT {limit} OFFSET {offset}
        """
        
        results = conn.execute(data_query, list(params.values())).df()
        
        return {
            "data": results.to_dict(orient="records"),
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": (offset + limit) < total
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/stats")
async def get_stats():
    """Get statistical information about the data"""
    try:
        stats = {}
        
        # Basic counts
        stats["total_rows"] = conn.execute("SELECT COUNT(*) FROM layer_data").fetchone()[0]
        stats["unique_reporters"] = conn.execute("SELECT COUNT(DISTINCT REPORTER) FROM layer_data").fetchone()[0]
        stats["unique_query_types"] = conn.execute("SELECT COUNT(DISTINCT QUERY_TYPE) FROM layer_data").fetchone()[0]
        
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
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/analytics")
async def get_analytics(
    timeframe: str = Query(..., regex="^(hourly|daily|weekly|yearly)$")
):
    """Get analytics data for different timeframes"""
    try:
        current_time_ms = int(time.time() * 1000)
        
        if timeframe == "hourly":
            # 30-minute intervals over past 24 hours
            hours_24_ms = 24 * 60 * 60 * 1000
            interval_ms = 30 * 60 * 1000  # 30 minutes
            
            # Generate time buckets for past 24 hours in 30-min intervals
            buckets = []
            start_time = current_time_ms - hours_24_ms
            
            for i in range(48):  # 24 hours * 2 (30-min intervals)
                bucket_start = start_time + (i * interval_ms)
                bucket_end = bucket_start + interval_ms
                
                count = conn.execute("""
                    SELECT COUNT(*) 
                    FROM layer_data 
                    WHERE TIMESTAMP >= ? AND TIMESTAMP < ?
                """, [bucket_start, bucket_end]).fetchone()[0]
                
                buckets.append({
                    "time": bucket_start,
                    "time_label": pd.to_datetime(bucket_start, unit='ms').strftime('%H:%M'),
                    "count": count
                })
            
            return {
                "timeframe": "hourly",
                "title": "Reports per 30 minutes (Past 24 hours)",
                "data": buckets
            }
            
        elif timeframe == "daily":
            # Daily counts over past 30 days
            days_30_ms = 30 * 24 * 60 * 60 * 1000
            day_ms = 24 * 60 * 60 * 1000
            
            buckets = []
            start_time = current_time_ms - days_30_ms
            
            for i in range(30):
                bucket_start = start_time + (i * day_ms)
                bucket_end = bucket_start + day_ms
                
                count = conn.execute("""
                    SELECT COUNT(*) 
                    FROM layer_data 
                    WHERE TIMESTAMP >= ? AND TIMESTAMP < ?
                """, [bucket_start, bucket_end]).fetchone()[0]
                
                buckets.append({
                    "time": bucket_start,
                    "time_label": pd.to_datetime(bucket_start, unit='ms').strftime('%m/%d'),
                    "count": count
                })
            
            return {
                "timeframe": "daily", 
                "title": "Reports per day (Past 30 days)",
                "data": buckets
            }
            
        elif timeframe == "weekly":
            # Hourly counts over past week
            week_ms = 7 * 24 * 60 * 60 * 1000
            hour_ms = 60 * 60 * 1000
            
            buckets = []
            start_time = current_time_ms - week_ms
            
            for i in range(168):  # 7 days * 24 hours
                bucket_start = start_time + (i * hour_ms)
                bucket_end = bucket_start + hour_ms
                
                count = conn.execute("""
                    SELECT COUNT(*) 
                    FROM layer_data 
                    WHERE TIMESTAMP >= ? AND TIMESTAMP < ?
                """, [bucket_start, bucket_end]).fetchone()[0]
                
                # Format as "Day HH:00"
                dt = pd.to_datetime(bucket_start, unit='ms')
                day_name = dt.strftime('%a')
                hour = dt.strftime('%H:00')
                
                buckets.append({
                    "time": bucket_start,
                    "time_label": f"{day_name} {hour}",
                    "count": count
                })
            
            return {
                "timeframe": "weekly",
                "title": "Reports per hour (Past 7 days)", 
                "data": buckets
            }
            
        elif timeframe == "yearly":
            # Daily counts over past year (365 days)
            year_ms = 365 * 24 * 60 * 60 * 1000
            day_ms = 24 * 60 * 60 * 1000
            
            buckets = []
            start_time = current_time_ms - year_ms
            
            for i in range(365):
                bucket_start = start_time + (i * day_ms)
                bucket_end = bucket_start + day_ms
                
                count = conn.execute("""
                    SELECT COUNT(*) 
                    FROM layer_data 
                    WHERE TIMESTAMP >= ? AND TIMESTAMP < ?
                """, [bucket_start, bucket_end]).fetchone()[0]
                
                buckets.append({
                    "time": bucket_start,
                    "time_label": pd.to_datetime(bucket_start, unit='ms').strftime('%m/%d'),
                    "count": count
                })
            
            return {
                "timeframe": "yearly",
                "title": "Reports per day (Past 365 days)", 
                "data": buckets
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/search")
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

# Mount static files
app.mount("/static", StaticFiles(directory="../frontend"), name="static")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True) 