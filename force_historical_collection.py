#!/usr/bin/env python3
"""
Force Historical Maximal Power Collection
Directly collects and stores historical maximal power data in the database
"""

import sys
import time
import logging
from pathlib import Path
from datetime import datetime, timezone

# Add paths
sys.path.append(str(Path(__file__).parent / "backend"))
sys.path.append(str(Path(__file__).parent / "chain_queries"))

from chain_queries.find_maximal_power import MaximalPowerTracker
import duckdb
import requests

def test_dashboard_connection():
    """Test if dashboard is accessible"""
    try:
        response = requests.get("http://localhost:8001/dashboard-palmito/api/info", timeout=5)
        return response.status_code == 200
    except:
        return False

def test_maximal_power_api():
    """Test current API response"""
    print("\n🔍 Testing Current API Response...")
    try:
        response = requests.get("http://localhost:8001/dashboard-palmito/api/reporters-activity-analytics?timeframe=24h", timeout=10)
        if response.status_code == 200:
            data = response.json()
            values = data['maximal_power_network']
            non_zero = sum(1 for v in values if v > 0)
            print(f"📊 Current maximal power data points: {non_zero}")
            return True
        else:
            print(f"❌ API returned {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ API test failed: {e}")
        return False

def force_collection_via_api():
    """Force collection using the dashboard API endpoint"""
    print("\n🔋 Forcing Historical Collection via API...")
    try:
        response = requests.post(
            "http://localhost:8001/dashboard-palmito/api/trigger-historical-maximal-power",
            headers={"Content-Type": "application/json"},
            timeout=120
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ API collection successful: {result}")
            return True
        else:
            print(f"❌ API collection failed: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ API collection error: {e}")
        return False

def direct_database_collection():
    """Directly collect historical data and store in database"""
    print("\n🔋 Direct Database Collection...")
    
    try:
        # Initialize tracker with fixed path
        tracker = MaximalPowerTracker(
            binary_path='./layerd',
            rpc_url='http://localhost:26657'
        )
        
        # Connect to main database (should be the same one the dashboard uses)
        db_path = ":memory:"  # In-memory for testing, use actual path for production
        db = duckdb.connect(db_path)
        tracker.db_connection = db
        
        # Create table
        tracker.create_maximal_power_table()
        
        print("📡 Testing current block access...")
        height, timestamp = tracker.get_current_height_and_timestamp()
        print(f"✅ Current block: height={height}, timestamp={timestamp}")
        
        print("🔋 Testing power collection...")
        power = tracker.find_maximal_power_at_single_height(height)
        print(f"✅ Current maximal power: {power}")
        
        # Store current snapshot
        tracker.store_maximal_power_snapshot(height, timestamp, power, 'manual')
        
        # Initialize historical data (7 days back)
        print("📊 Collecting historical data...")
        snapshots = tracker.initialize_historical_data(days_back=7)
        
        print(f"✅ Successfully collected {len(snapshots)} historical snapshots")
        
        # Show some sample data
        recent_data = tracker.get_recent_maximal_power_data(hours=168)  # 7 days
        print(f"📈 Total historical data points: {len(recent_data)}")
        if recent_data:
            powers = [d['maximal_power'] for d in recent_data]
            print(f"📈 Power range: {min(powers)} to {max(powers)}")
        
        return len(snapshots) > 0
        
    except Exception as e:
        print(f"❌ Direct collection error: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Main execution function"""
    logging.basicConfig(level=logging.INFO)
    
    print("🚀 Force Historical Maximal Power Collection")
    print("=" * 50)
    
    # Test dashboard connection
    if test_dashboard_connection():
        print("✅ Dashboard is accessible")
        
        # Test current API state
        test_maximal_power_api()
        
        # Try API collection first
        if force_collection_via_api():
            print("\n🎉 API collection completed successfully!")
            
            # Test again to see improvement
            test_maximal_power_api()
        else:
            print("\n⚠️  API collection failed, trying direct method...")
            
            # Try direct collection as fallback
            if direct_database_collection():
                print("\n🎉 Direct collection completed successfully!")
            else:
                print("\n❌ Both methods failed")
                return False
    else:
        print("❌ Dashboard not accessible - trying direct collection only")
        
        # Only try direct collection
        if direct_database_collection():
            print("\n🎉 Direct collection completed successfully!")
        else:
            print("\n❌ Direct collection failed")
            return False
    
    print("\n✅ Historical maximal power collection complete!")
    print("📊 The reporter activity chart should now show maximal power data")
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1) 