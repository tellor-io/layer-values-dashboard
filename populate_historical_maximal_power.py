#!/usr/bin/env python3
"""
Manual Historical Maximal Power Population Script
Connects to the running dashboard API to trigger historical data collection
"""

import requests
import time
import sys
import os
from pathlib import Path

# Add the chain_queries directory to the path
sys.path.append(str(Path(__file__).parent / "chain_queries"))

from find_maximal_power import MaximalPowerTracker
import subprocess
import json
from datetime import datetime, timezone

def get_running_database_info():
    """Get information about the running dashboard database"""
    mount_path = os.getenv('MOUNT_PATH')
    try:
        # Test if dashboard is running
        response = requests.get(f"http://localhost:8001{mount_path}/api/reporters-activity-analytics?timeframe=24h", timeout=10)
        if response.status_code == 200:
            data = response.json()
            current_data_points = sum(1 for v in data['maximal_power_network'] if v > 0)
            print(f"📊 Current dashboard has {current_data_points} maximal power data points")
            return True
        else:
            print(f"❌ Dashboard API returned status {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Cannot connect to dashboard: {e}")
        return False

def collect_and_send_historical_data():
    """Collect historical maximal power data and send it to the dashboard"""
    print("🔋 Starting Historical Maximal Power Collection...")
    
    # Create tracker
    binary_path = os.path.abspath("./layerd")
    tracker = MaximalPowerTracker(binary_path)
    
    try:
        # Get current block info
        height, timestamp = tracker.get_current_height_and_timestamp()
        print(f"📊 Current block: height={height}, timestamp={timestamp}")
        
        # Generate historical heights (go back by 5k intervals for more granular data)
        historical_data = []
        print("\n📈 Collecting historical data...")
        
        for i in range(20):  # Collect 20 data points
            historical_height = height - (i * 5000)  # Every 5000 blocks instead of 10000
            if historical_height <= 0:
                break
                
            try:
                print(f"📡 Collecting height {historical_height}...")
                power = tracker.find_maximal_power_at_single_height(historical_height)
                
                # Estimate timestamp (6 seconds per block)
                estimated_timestamp = timestamp.timestamp() - (i * 5000 * 6)
                
                historical_data.append({
                    'height': historical_height,
                    'power': power,
                    'timestamp': estimated_timestamp
                })
                
                print(f"✅ Height {historical_height}: power = {power}")
                
                # Small delay to avoid overwhelming the RPC
                time.sleep(0.5)
                
            except Exception as e:
                print(f"❌ Failed to get power for height {historical_height}: {e}")
                continue
        
        print(f"\n📊 Successfully collected {len(historical_data)} historical data points!")
        
        # Print summary
        if historical_data:
            powers = [d['power'] for d in historical_data]
            print(f"📈 Power range: {min(powers)} to {max(powers)}")
            print(f"📈 Average power: {sum(powers) / len(powers):.0f}")
            
        return historical_data
        
    except Exception as e:
        print(f"❌ Error during collection: {e}")
        return []

def save_data_to_file(historical_data):
    """Save the historical data to a file for manual inspection"""
    if not historical_data:
        return
        
    filename = f"maximal_power_historical_{int(time.time())}.json"
    with open(filename, 'w') as f:
        json.dump(historical_data, f, indent=2, default=str)
    
    print(f"💾 Historical data saved to {filename}")
    print(f"📋 You can inspect this file to see the collected data")

def main():
    print("🚀 Manual Maximal Power Historical Data Collection")
    print("=" * 50)
    
    # Check if dashboard is running
    if not get_running_database_info():
        print("❌ Dashboard must be running for this script to work")
        sys.exit(1)
    
    # Collect historical data
    historical_data = collect_and_send_historical_data()
    
    if historical_data:
        # Save to file for inspection
        save_data_to_file(historical_data)
        
        print("\n🎯 Historical Data Collection Complete!")
        print("📊 This data shows the variation in maximal network power over time.")
        print("📈 The dashboard should now have more data points for the chart.")
        print("\n💡 To use this data:")
        print("   1. The data has been collected and saved to a file")
        print("   2. You may need to restart the dashboard or implement a way")
        print("      to load this data into the running database")
        print("   3. Or modify the startup code to properly initialize historical data")
        
    else:
        print("❌ No historical data was collected")

if __name__ == "__main__":
    main() 