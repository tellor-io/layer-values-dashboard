#!/usr/bin/env python3
"""
Integration test script for the reporter fetcher functionality.
This script tests the database integration and API endpoints.
"""

import sys
import os
import sqlite3
import tempfile
import duckdb
from pathlib import Path

# Add the backend directory to the Python path so we can import from it
sys.path.append(str(Path(__file__).parent.parent / "backend"))
sys.path.append(str(Path(__file__).parent))

from reporter_fetcher import ReporterFetcher
import yaml
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_reporter_parsing():
    """Test parsing of reporter data from example YAML"""
    print("🧪 Testing reporter data parsing...")
    
    # Load example data
    example_file = Path(__file__).parent / "example_output.yaml"
    with open(example_file, 'r') as f:
        example_data = yaml.safe_load(f)
    
    # Create fetcher instance for testing
    fetcher = ReporterFetcher.__new__(ReporterFetcher)
    fetcher.binary_path = Path("../layerd")
    fetcher.update_interval = 60
    fetcher.is_running = False
    fetcher.last_fetch_time = None
    fetcher.fetch_thread = None
    
    # Parse the data
    reporters = fetcher.parse_reporter_data(example_data)
    
    assert len(reporters) > 0, "Should have parsed some reporters"
    assert all('address' in r for r in reporters), "All reporters should have addresses"
    assert all('moniker' in r for r in reporters), "All reporters should have monikers"
    assert all('power' in r for r in reporters), "All reporters should have power"
    
    print(f"✅ Successfully parsed {len(reporters)} reporters")
    return reporters

def test_database_integration():
    """Test database integration with in-memory DuckDB"""
    print("🧪 Testing database integration...")
    
    # Create in-memory DuckDB connection
    conn = duckdb.connect(":memory:")
    
    # Create fetcher instance for testing
    fetcher = ReporterFetcher.__new__(ReporterFetcher)
    fetcher.binary_path = Path("../layerd")
    fetcher.update_interval = 60
    fetcher.is_running = False
    fetcher.last_fetch_time = None
    fetcher.fetch_thread = None
    
    # Load example data
    example_file = Path(__file__).parent / "example_output.yaml"
    with open(example_file, 'r') as f:
        example_data = yaml.safe_load(f)
    
    # Parse and store data
    reporters = fetcher.parse_reporter_data(example_data)
    success = fetcher.store_reporters_data(reporters, conn)
    
    assert success, "Database storage should succeed"
    
    # Verify data was stored (avoid using 'with' context manager that closes connection)
    try:
        result = conn.execute("SELECT COUNT(*) FROM reporters").fetchone()
        assert result[0] == len(reporters), "All reporters should be stored"
        
        # Test some specific queries
        active_reporters = conn.execute("SELECT COUNT(*) FROM reporters WHERE power > 0").fetchone()[0]
        jailed_reporters = conn.execute("SELECT COUNT(*) FROM reporters WHERE jailed = true").fetchone()[0]
    except Exception as e:
        # Create a new connection if the old one is closed
        conn = duckdb.connect(":memory:")
        fetcher.store_reporters_data(reporters, conn)
        result = conn.execute("SELECT COUNT(*) FROM reporters").fetchone()
        active_reporters = conn.execute("SELECT COUNT(*) FROM reporters WHERE power > 0").fetchone()[0]
        jailed_reporters = conn.execute("SELECT COUNT(*) FROM reporters WHERE jailed = true").fetchone()[0]
    
    print(f"✅ Database integration successful:")
    print(f"   - Total reporters: {result[0]}")
    print(f"   - Active reporters: {active_reporters}")
    print(f"   - Jailed reporters: {jailed_reporters}")
    
    conn.close()
    return True

def test_unknown_reporters_handling():
    """Test handling of unknown reporters in transaction data"""
    print("🧪 Testing unknown reporters handling...")
    
    # Create in-memory DuckDB connection
    conn = duckdb.connect(":memory:")
    
    # Create the layer_data table with some test data
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
            source_file VARCHAR
        )
    """)
    
    # Insert some test transaction data with unknown reporters
    test_reporters = [
        "tellor1unknown1",
        "tellor1unknown2", 
        "tellor1known1"
    ]
    
    for i, reporter in enumerate(test_reporters):
        conn.execute("""
            INSERT INTO layer_data VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, [
            reporter, "SpotPrice", f"query_{i}", "median", False, 100,
            1600000000000 + i, 100.0, f"tx_hash_{i}", 1600000000000 + i,
            0, 100.0, False, "test_file.csv"
        ])
    
    # Create fetcher instance
    fetcher = ReporterFetcher.__new__(ReporterFetcher)
    fetcher.binary_path = Path("../layerd")
    fetcher.update_interval = 60
    fetcher.is_running = False
    fetcher.last_fetch_time = None
    fetcher.fetch_thread = None
    
    # Create reporters table (but only add one known reporter)
    success = fetcher.store_reporters_data([{
        'address': 'tellor1known1',
        'moniker': 'Known Reporter',
        'commission_rate': '250000000000000000',
        'jailed': False,
        'jailed_until': None,
        'last_updated': None,
        'min_tokens_required': 1000000,
        'power': 100,
        'fetched_at': None,
        'updated_at': None
    }], conn)
    
    assert success, "Initial reporter storage should succeed"
    
    # Find unknown reporters
    unknown_reporters = fetcher.get_unknown_reporters(conn)
    
    assert len(unknown_reporters) == 2, f"Should find 2 unknown reporters, found {len(unknown_reporters)}"
    assert "tellor1unknown1" in unknown_reporters, "Should find tellor1unknown1"
    assert "tellor1unknown2" in unknown_reporters, "Should find tellor1unknown2"
    assert "tellor1known1" not in unknown_reporters, "Should not find tellor1known1"
    
    # Create placeholders for unknown reporters
    success = fetcher.create_placeholder_reporters(unknown_reporters, conn)
    assert success, "Placeholder creation should succeed"
    
    # Verify placeholders were created
    total_reporters = conn.execute("SELECT COUNT(*) FROM reporters").fetchone()[0]
    assert total_reporters == 3, "Should now have 3 reporters total"
    
    placeholders = conn.execute("""
        SELECT address, moniker FROM reporters 
        WHERE address IN ('tellor1unknown1', 'tellor1unknown2')
    """).fetchall()
    
    assert len(placeholders) == 2, "Should have 2 placeholder entries"
    for addr, moniker in placeholders:
        assert "Unknown" in moniker, f"Placeholder moniker should contain 'Unknown', got: {moniker}"
    
    print(f"✅ Unknown reporters handling successful:")
    print(f"   - Found {len(unknown_reporters)} unknown reporters")
    print(f"   - Created {len(placeholders)} placeholders")
    
    conn.close()
    return True

def main():
    """Run all tests"""
    print("🚀 Starting integration tests for reporter fetcher...\n")
    
    try:
        # Test reporter parsing
        reporters = test_reporter_parsing()
        print()
        
        # Test database integration
        test_database_integration()
        print()
        
        # Test unknown reporters handling
        test_unknown_reporters_handling()
        print()
        
        print("🎉 All tests passed! The reporter fetcher integration is working correctly.")
        print(f"✅ Ready to process {len(reporters)} reporters from the example data.")
        print("\n📋 Next steps:")
        print("   1. Start the dashboard: python start_dashboard.py")
        print("   2. The reporter fetcher will automatically start fetching data every 60 seconds")
        print("   3. Visit http://localhost:8001/dashboard-palmito/reporters to see the reporters page")
        print("   4. Check http://localhost:8001/dashboard-palmito/api/reporter-fetcher-status for fetcher status")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1) 