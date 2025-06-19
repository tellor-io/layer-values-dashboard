#!/usr/bin/env python3
"""
Test script to verify POWER_OF_AGGR calculation with example_table.csv
"""

import duckdb
import pandas as pd
from pathlib import Path
import sys

def create_test_connection():
    """Create a test DuckDB connection"""
    conn = duckdb.connect(":memory:")
    
    # Create the same table schema as the main application
    conn.execute("""
        CREATE TABLE layer_data (
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
            source_file VARCHAR,
            POWER_OF_AGGR BIGINT
        )
    """)
    
    return conn

def calculate_power_of_aggr_test(conn, source_file=None):
    """
    Calculate and update POWER_OF_AGGR for all rows.
    Same logic as in the main application.
    """
    print("🔄 Calculating POWER_OF_AGGR values...")
    
    # Build WHERE clause for source file filtering
    where_clause = ""
    params = []
    if source_file:
        where_clause = "WHERE source_file = ?"
        params = [source_file]
    
    # Update POWER_OF_AGGR for all rows by calculating the sum of POWER for each TIMESTAMP
    update_query = f"""
        UPDATE layer_data 
        SET POWER_OF_AGGR = (
            SELECT SUM(POWER) 
            FROM layer_data ld2 
            WHERE ld2.TIMESTAMP = layer_data.TIMESTAMP
        )
        {where_clause}
    """
    
    conn.execute(update_query, params)
    
    # Get statistics about the calculation
    if source_file:
        stats_query = """
            SELECT 
                COUNT(DISTINCT TIMESTAMP) as unique_timestamps,
                COUNT(*) as total_rows,
                MIN(POWER_OF_AGGR) as min_power_of_aggr,
                MAX(POWER_OF_AGGR) as max_power_of_aggr
            FROM layer_data 
            WHERE source_file = ? AND POWER_OF_AGGR IS NOT NULL
        """
        stats = conn.execute(stats_query, [source_file]).fetchone()
    else:
        stats_query = """
            SELECT 
                COUNT(DISTINCT TIMESTAMP) as unique_timestamps,
                COUNT(*) as total_rows,
                MIN(POWER_OF_AGGR) as min_power_of_aggr,
                MAX(POWER_OF_AGGR) as max_power_of_aggr
            FROM layer_data 
            WHERE POWER_OF_AGGR IS NOT NULL
        """
        stats = conn.execute(stats_query).fetchone()
    
    if stats:
        print(f"✅ POWER_OF_AGGR calculation complete:")
        print(f"   - Unique timestamps: {stats[0]}")
        print(f"   - Total rows updated: {stats[1]}")
        print(f"   - POWER_OF_AGGR range: {stats[2]} - {stats[3]}")

def load_test_data(conn, csv_path):
    """Load data from CSV file using the same logic as the main application"""
    print(f"📖 Loading test data from: {csv_path}")
    
    try:
        # First, inspect the CSV structure with more permissive settings
        csv_info = conn.execute(f"""
            SELECT * FROM read_csv_auto('{csv_path}', 
                sample_size=100,
                delim=',',
                header=true,
                ignore_errors=true,
                null_padding=true,
                strict_mode=false
            )
            LIMIT 3
        """).fetchall()
        
        if not csv_info:
            print(f"❌ CSV file appears to be empty: {csv_path}")
            return None
        
        # Get column information with permissive settings
        csv_columns = conn.execute(f"""
            DESCRIBE SELECT * FROM read_csv_auto('{csv_path}', 
                sample_size=100,
                delim=',',
                header=true,
                ignore_errors=true,
                null_padding=true,
                strict_mode=false
            )
        """).fetchall()
        
        print(f"📋 Found {len(csv_columns)} columns in CSV:")
        actual_columns = {}
        for col in csv_columns:
            col_name = col[0]
            col_type = col[1]
            # Handle URL-encoded column names and clean up column names
            clean_name = col_name.replace('+AF8-', '_').replace('%5F', '_').strip()
            actual_columns[clean_name] = col_name
            print(f"   - '{col_name}' ({clean_name}): {col_type}")
        
        # Build the SELECT statement with actual column names
        def map_column(expected_name):
            """Return a quoted column name if present, otherwise SQL NULL."""
            if expected_name in actual_columns:
                return f'"{actual_columns[expected_name]}"'

            # Try common variations (URL-encoded or case variations)
            for actual_name in actual_columns.values():
                clean_actual = actual_name.replace('+AF8-', '_').replace('%5F', '_').strip()
                if clean_actual == expected_name:
                    return f'"{actual_name}"'

            # Column truly not present – use SQL NULL literal
            print(f"🕳️  Column '{expected_name}' not found in CSV. Inserting NULL for it.")
            return 'NULL'
        
        # Check what columns we actually have
        print(f"\n🔍 Available columns: {list(actual_columns.keys())}")
        
        # Load data with POWER_OF_AGGR set to NULL initially, using very permissive settings
        conn.execute(f"""
            INSERT OR IGNORE INTO layer_data 
            SELECT 
                {map_column('REPORTER')} as REPORTER,
                {map_column('QUERY_TYPE')} as QUERY_TYPE,
                {map_column('QUERY_ID')} as QUERY_ID,
                {map_column('AGGREGATE_METHOD')} as AGGREGATE_METHOD,
                TRY_CAST({map_column('CYCLELIST')} AS BOOLEAN) as CYCLELIST,
                TRY_CAST({map_column('POWER')} AS INTEGER) as POWER,
                TRY_CAST({map_column('TIMESTAMP')} AS BIGINT) as TIMESTAMP,
                TRY_CAST({map_column('TRUSTED_VALUE')} AS DOUBLE) as TRUSTED_VALUE,
                {map_column('TX_HASH')} as TX_HASH,
                TRY_CAST({map_column('CURRENT_TIME')} AS BIGINT) as CURRENT_TIME,
                TRY_CAST({map_column('TIME_DIFF')} AS INTEGER) as TIME_DIFF,
                TRY_CAST({map_column('VALUE')} AS DOUBLE) as VALUE,
                TRY_CAST({map_column('DISPUTABLE')} AS BOOLEAN) as DISPUTABLE,
                'example_table.csv' as source_file,
                NULL as POWER_OF_AGGR
            FROM read_csv_auto('{csv_path}', 
                header=true,
                delim=',',
                sample_size=10000,
                ignore_errors=true,
                null_padding=true,
                strict_mode=false,
                all_varchar=true
            )
        """)
        
        # Get the count of rows actually inserted
        total_rows = conn.execute("""
            SELECT COUNT(*) FROM layer_data WHERE source_file = 'example_table.csv'
        """).fetchone()[0]
        
        print(f"✅ Successfully inserted {total_rows} rows from example_table.csv")
        
        # Show a sample of the loaded data
        sample_rows = conn.execute("""
            SELECT REPORTER, POWER, TIMESTAMP, TX_HASH 
            FROM layer_data 
            WHERE source_file = 'example_table.csv'
            ORDER BY TIMESTAMP
            LIMIT 5
        """).fetchall()
        
        print(f"\n📋 Sample loaded data:")
        for row in sample_rows:
            print(f"   REPORTER: {row[0][:20]}... | POWER: {row[1]} | TIMESTAMP: {row[2]} | TX_HASH: {row[3][:10]}...")
        
        # Calculate POWER_OF_AGGR for the newly loaded data
        calculate_power_of_aggr_test(conn, 'example_table.csv')
        
        return total_rows
        
    except Exception as e:
        print(f"❌ Error loading test data: {e}")
        import traceback
        traceback.print_exc()
        return None

def analyze_results(conn):
    """Analyze and display the results"""
    print("\n" + "="*80)
    print("📊 ANALYSIS OF LOADED DATA")
    print("="*80)
    
    # Get summary by timestamp
    timestamp_summary = conn.execute("""
        SELECT 
            TIMESTAMP,
            COUNT(*) as row_count,
            SUM(POWER) as total_power,
            MIN(POWER_OF_AGGR) as min_power_of_aggr,
            MAX(POWER_OF_AGGR) as max_power_of_aggr,
            CASE 
                WHEN MIN(POWER_OF_AGGR) = MAX(POWER_OF_AGGR) THEN 'CONSISTENT'
                ELSE 'INCONSISTENT'
            END as consistency
        FROM layer_data 
        GROUP BY TIMESTAMP 
        ORDER BY TIMESTAMP
    """).fetchall()
    
    print("\n📈 Summary by TIMESTAMP:")
    print("TIMESTAMP          | Rows | Total POWER | POWER_OF_AGGR | Consistency")
    print("-" * 75)
    for row in timestamp_summary:
        timestamp, row_count, total_power, min_aggr, max_aggr, consistency = row
        print(f"{timestamp} | {row_count:4d} | {total_power:11d} | {min_aggr:13d} | {consistency}")
    
    # Verify that POWER_OF_AGGR equals SUM(POWER) for each timestamp
    print("\n🔍 VERIFICATION: Does POWER_OF_AGGR = SUM(POWER) for each timestamp?")
    verification = conn.execute("""
        SELECT 
            TIMESTAMP,
            SUM(POWER) as calculated_sum,
            MIN(POWER_OF_AGGR) as stored_power_of_aggr,
            CASE 
                WHEN SUM(POWER) = MIN(POWER_OF_AGGR) THEN '✅ CORRECT'
                ELSE '❌ INCORRECT'
            END as verification
        FROM layer_data 
        GROUP BY TIMESTAMP 
        ORDER BY TIMESTAMP
    """).fetchall()
    
    for row in verification:
        timestamp, calc_sum, stored_aggr, status = row
        print(f"Timestamp {timestamp}: Calculated={calc_sum}, Stored={stored_aggr} {status}")
    
    # Show some sample rows for each timestamp
    print("\n📋 SAMPLE ROWS (first 3 rows per timestamp):")
    sample_data = conn.execute("""
        WITH ranked_data AS (
            SELECT *,
                   ROW_NUMBER() OVER (PARTITION BY TIMESTAMP ORDER BY REPORTER) as rn
            FROM layer_data
        )
        SELECT TIMESTAMP, REPORTER, POWER, POWER_OF_AGGR
        FROM ranked_data 
        WHERE rn <= 3
        ORDER BY TIMESTAMP, rn
    """).fetchall()
    
    current_timestamp = None
    for row in sample_data:
        timestamp, reporter, power, power_of_aggr = row
        if timestamp != current_timestamp:
            print(f"\nTimestamp {timestamp}:")
            current_timestamp = timestamp
        print(f"  {reporter[:20]:<20} | POWER: {power:4d} | POWER_OF_AGGR: {power_of_aggr}")

def main():
    """Main test function"""
    print("🚀 Starting POWER_OF_AGGR Test")
    print("="*50)
    
    # Check if example_table.csv exists
    csv_path = Path("example_table.csv")
    if not csv_path.exists():
        print(f"❌ Error: {csv_path} not found!")
        print("Please ensure example_table.csv is in the current directory.")
        sys.exit(1)
    
    # Create test database connection
    conn = create_test_connection()
    
    # Load test data
    total_rows = load_test_data(conn, str(csv_path))
    
    if total_rows is None:
        print("❌ Failed to load test data")
        sys.exit(1)
    
    # Analyze results
    analyze_results(conn)
    
    print(f"\n✅ Test completed successfully! Loaded {total_rows} rows.")
    print("🔍 Check the analysis above to verify POWER_OF_AGGR calculations.")

if __name__ == "__main__":
    main() 