#!/usr/bin/env python3
"""
Generate sample CSV data for testing the Layer Values Dashboard
"""

import csv
import os
import time
import random
from datetime import datetime, timedelta

def create_sample_csv(filename, num_rows=1000):
    """Create a sample CSV file with realistic data"""
    
    # Sample data for variety
    query_types = ["SpotPrice", "CustomPrice", "TellorRNG", "AmpleforthCustom"]
    query_ids = [
        "0x83a3a8543b5e7fcbbedfc47f0e0f98c8bf7e1d0e067b5d1d1b1b4a6b8b3e9c2f",
        "0x23b67b7a4d6e9c1f2e3a5b7c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8",
        "0x83d3f8a2b5c7e9f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5",
    ]
    reporters = [
        "0x742d35cc6634c0532925a3b8d4f06f7e5a8b12c3e45f678901ab2cd34ef567890",
        "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
        "0x9876543210abcdef9876543210abcdef98765432109876543210abcdef987654",
    ]
    
    # Create directory if it doesn't exist
    os.makedirs("source_tables", exist_ok=True)
    
    filepath = os.path.join("source_tables", filename)
    
    with open(filepath, 'w', newline='') as csvfile:
        fieldnames = [
            'REPORTER', 'QUERY_TYPE', 'QUERY_ID', 'AGGREGATE_METHOD',
            'CYCLELIST', 'POWER', 'TIMESTAMP', 'TRUSTED_VALUE', 
            'TX_HASH', 'CURRENT_TIME', 'TIME_DIFF', 'VALUE', 'DISPUTABLE'
        ]
        
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        
        # Generate data over the past 7 days
        now = int(time.time() * 1000)  # Current time in milliseconds
        week_ago = now - (7 * 24 * 60 * 60 * 1000)  # 7 days ago
        
        for i in range(num_rows):
            # Random timestamp within the past week
            timestamp = random.randint(week_ago, now)
            current_time = timestamp + random.randint(0, 60000)  # Add up to 1 minute
            
            # Random values
            value = round(random.uniform(0.1, 10000), 6)
            trusted_value = value * random.uniform(0.95, 1.05)  # Close to actual value
            
            row = {
                'REPORTER': random.choice(reporters),
                'QUERY_TYPE': random.choice(query_types),
                'QUERY_ID': random.choice(query_ids),
                'AGGREGATE_METHOD': 'median',
                'CYCLELIST': random.choice([True, False]),
                'POWER': random.randint(100, 10000),
                'TIMESTAMP': timestamp,
                'TRUSTED_VALUE': round(trusted_value, 6),
                'TX_HASH': f"0x{''.join(random.choices('0123456789abcdef', k=64))}",
                'CURRENT_TIME': current_time,
                'TIME_DIFF': current_time - timestamp,
                'VALUE': value,
                'DISPUTABLE': random.choice([True, False])
            }
            writer.writerow(row)
    
    print(f"✅ Created {filepath} with {num_rows} rows")
    return filepath

def main():
    """Create sample data files"""
    print("🔄 Creating sample CSV data for Layer Values Dashboard...")
    
    # Create a few different timestamp files to simulate historical data
    timestamps = [
        int(time.time()) - 86400,  # 1 day ago
        int(time.time()) - 43200,  # 12 hours ago  
        int(time.time()),          # Current time
    ]
    
    for i, ts in enumerate(timestamps):
        filename = f"table_{ts}.csv"
        rows = 500 + (i * 200)  # Increasing number of rows for newer files
        create_sample_csv(filename, rows)
    
    print("🎉 Sample data created successfully!")
    print("💡 Now restart your dashboard to see the data:")
    print("   uv run python start_dashboard.py --port 8000")

if __name__ == "__main__":
    main() 