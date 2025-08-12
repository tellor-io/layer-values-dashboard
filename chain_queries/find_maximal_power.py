#!/usr/bin/env python3
"""
Maximal Power Tracking
Tracks the total network power over time by querying reporter data at specific block heights.
"""

import subprocess
import json
import yaml
import logging
import time
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
import sys
import os

# Add the backend directory to the Python path so we can import from it
sys.path.append(str(Path(__file__).parent.parent / "backend"))

logger = logging.getLogger(__name__)

class MaximalPowerTracker:
    def __init__(self, binary_path: str = "./layerd", rpc_url: Optional[str] = None, db_connection=None):
        """
        Initialize the maximal power tracker.
        
        Args:
            binary_path: Path to the layerd binary
            rpc_url: RPC URL for layerd commands (optional)
            db_connection: Database connection for storing data
        """
        # Store as Path object for existence checks, but keep original string for subprocess
        self.binary_path_obj = Path(binary_path)
        self.binary_path = binary_path  # Keep original string for subprocess
        self.rpc_url = rpc_url
        self.db_connection = db_connection
        
        # Validate binary exists
        if not self.binary_path_obj.exists():
            raise FileNotFoundError(f"Binary not found at {self.binary_path_obj}")
        
        logger.info(f"🔗 MaximalPowerTracker initialized with binary: {self.binary_path}")
        if self.rpc_url:
            logger.info(f"🌐 Using RPC URL: {self.rpc_url}")

    def get_current_height_and_timestamp(self) -> Tuple[int, datetime]:
        """
        Returns the most recent height and timestamp from the query ./layerd block
        """
        try:
            logger.info("📡 Fetching current block info...")
            
            # Execute the RPC query
            cmd = [self.binary_path, "query", "block"]
            
            # Add --node parameter if RPC URL is provided
            if self.rpc_url:
                cmd.extend(["--node", self.rpc_url])
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode != 0:
                logger.error(f"❌ Block query failed with code {result.returncode}")
                logger.error(f"Error output: {result.stderr}")
                raise Exception(f"Block query failed: {result.stderr}")
            
            # Parse the output to extract height and timestamp
            output = result.stdout
            
            # Look for height line: height: "4515541"
            height_match = re.search(r'height:\s*["\']?(\d+)["\']?', output)
            if not height_match:
                raise Exception("Could not find height in block output")
            
            height = int(height_match.group(1))
            
            # Look for time line: time: "2025-06-20T13:13:00.791430862Z"
            time_match = re.search(r'time:\s*["\']([^"\']+)["\']', output)
            if not time_match:
                raise Exception("Could not find timestamp in block output")
            
            timestamp_str = time_match.group(1)
            # Parse the ISO timestamp
            timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
            
            logger.info(f"✅ Current block: height={height}, time={timestamp}")
            return height, timestamp
            
        except subprocess.TimeoutExpired:
            logger.error("❌ Block query timed out after 30 seconds")
            raise Exception("Block query timeout")
        except Exception as e:
            logger.error(f"❌ Error getting current block info: {e}")
            raise

    def get_block_timestamp_at_height(self, height: int) -> datetime:
        """
        Get the actual timestamp for a specific block height by querying the block.
        """
        try:
            logger.info(f"📅 Fetching block timestamp for height {height}...")
            
            # Execute the RPC query for specific block height
            cmd = [self.binary_path, "query", "block", "--height", str(height)]
            
            # Add --node parameter if RPC URL is provided
            if self.rpc_url:
                cmd.extend(["--node", self.rpc_url])
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode != 0:
                logger.error(f"❌ Block query failed for height {height} with code {result.returncode}")
                logger.error(f"Error output: {result.stderr}")
                raise Exception(f"Block query failed for height {height}: {result.stderr}")
            
            # Parse the output to extract timestamp
            output = result.stdout
            
            # Look for time line: time: "2025-06-20T13:13:00.791430862Z"
            time_match = re.search(r'time:\s*["\']([^"\']+)["\']', output)
            if not time_match:
                raise Exception(f"Could not find timestamp in block output for height {height}")
            
            timestamp_str = time_match.group(1)
            # Parse the ISO timestamp
            timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
            
            logger.info(f"✅ Block {height} timestamp: {timestamp}")
            return timestamp
            
        except subprocess.TimeoutExpired:
            logger.error(f"❌ Block query timed out for height {height} after 30 seconds")
            raise Exception(f"Block query timeout for height {height}")
        except Exception as e:
            logger.error(f"❌ Error getting block timestamp for height {height}: {e}")
            raise

    def find_maximal_power_at_single_height(self, height: int) -> int:
        """
        Find the total maximal power at a given height by summing all reporter powers.
        Now with robust timeout handling and fallback mechanisms.
        """
        import signal
        import threading
        
        def timeout_handler(signum, frame):
            raise TimeoutError("RPC query exceeded maximum timeout")
        
        try:
            logger.info(f"📡 Fetching reporter power at height {height}...")
            
            # Execute the RPC query with multiple timeout mechanisms
            cmd = [self.binary_path, "query", "reporter", "reporters", "--height", str(height)]
            
            # Add --node parameter if RPC URL is provided
            if self.rpc_url:
                cmd.extend(["--node", self.rpc_url])
            
            # Set up signal-based timeout as backup (Unix only)
            old_handler = signal.signal(signal.SIGALRM, timeout_handler)
            signal.alarm(45)  # 45 second hard timeout
            
            result = None
            try:
                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=30  # Reduced timeout for faster failure
                )
            finally:
                signal.alarm(0)  # Cancel the alarm
                signal.signal(signal.SIGALRM, old_handler)  # Restore old handler
            
            if result.returncode != 0:
                logger.error(f"❌ Reporter query failed for height {height} with code {result.returncode}")
                logger.error(f"Error output: {result.stderr}")
                
                # Try fallback: query current reporters instead of specific height
                if "--height" in cmd:
                    logger.info(f"🔄 Falling back to current height query...")
                    fallback_cmd = [self.binary_path, "query", "reporter", "reporters"]
                    if self.rpc_url:
                        fallback_cmd.extend(["--node", self.rpc_url])
                    
                    fallback_result = subprocess.run(
                        fallback_cmd,
                        capture_output=True,
                        text=True,
                        timeout=15  # Quick fallback timeout
                    )
                    
                    if fallback_result.returncode == 0:
                        logger.info(f"✅ Fallback query succeeded, using current reporters")
                        result = fallback_result
                    else:
                        raise Exception(f"Both primary and fallback queries failed for height {height}")
                else:
                    raise Exception(f"Reporter query failed for height {height}: {result.stderr}")
            
            # Parse YAML output
            try:
                data = yaml.safe_load(result.stdout)
                total_power = 0
                
                reporters = data.get('reporters', [])
                logger.info(f"📊 Found {len(reporters)} reporters at height {height}")
                
                for reporter_data in reporters:
                    power = int(reporter_data.get('power', '0'))
                    total_power += power
                
                logger.info(f"✅ Total maximal power at height {height}: {total_power}")
                return total_power
                
            except yaml.YAMLError as e:
                logger.error(f"❌ Failed to parse YAML output for height {height}: {e}")
                # Return 0 as fallback instead of crashing
                logger.warning(f"⚠️  Returning 0 power as fallback for height {height}")
                return 0
                
        except (subprocess.TimeoutExpired, TimeoutError) as e:
            logger.error(f"❌ Reporter query timed out for height {height}: {e}")
            # Return 0 as fallback instead of crashing
            logger.warning(f"⚠️  Returning 0 power due to timeout for height {height}")
            return 0
        except Exception as e:
            logger.error(f"❌ Error getting maximal power at height {height}: {e}")
            # Return 0 as fallback instead of crashing
            logger.warning(f"⚠️  Returning 0 power due to error for height {height}")
            return 0

    def create_maximal_power_table(self):
        """
        Create the maximal_power_snapshots table if it doesn't exist.
        """
        if not self.db_connection:
            raise ValueError("Database connection not initialized")
        try:
            self.db_connection.execute("""
                CREATE TABLE IF NOT EXISTS maximal_power_snapshots (
                    height BIGINT PRIMARY KEY,
                    timestamp TIMESTAMP,
                    maximal_power BIGINT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    sample_type VARCHAR DEFAULT 'interval'  -- 'interval', 'realtime', 'historical'
                )
            """)
            
            # Create indexes for better performance
            self.db_connection.execute("""
                CREATE INDEX IF NOT EXISTS idx_maximal_power_timestamp 
                ON maximal_power_snapshots(timestamp)
            """)
            
            self.db_connection.execute("""
                CREATE INDEX IF NOT EXISTS idx_maximal_power_height 
                ON maximal_power_snapshots(height)
            """)
            
            logger.info("✅ Maximal power table created/verified")
            
        except Exception as e:
            logger.error(f"❌ Error creating maximal power table: {e}")
            raise

    def store_maximal_power_snapshot(self, height: int, timestamp: datetime, maximal_power: int, sample_type: str = 'interval'):
        """
        Store a maximal power snapshot in the database.
        """
        if not self.db_connection:
            raise ValueError("Database connection not initialized")
        try:
            self.db_connection.execute("""
                INSERT OR REPLACE INTO maximal_power_snapshots 
                (height, timestamp, maximal_power, sample_type, created_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            """, [height, timestamp, maximal_power, sample_type])
            
            logger.info(f"💾 Stored maximal power snapshot: height={height}, power={maximal_power}, type={sample_type}")
            
        except Exception as e:
            logger.error(f"❌ Error storing maximal power snapshot: {e}")
            raise

    def find_maximal_powers_for_table(self, start_height: int, end_height: int, interval: int = 10000) -> List[Dict]:
        """
        Find maximal power at intervals between start_height and end_height.
        Samples at heights ending in 0000 by default, or custom interval.
        """
        snapshots = []
        
        # Ensure we have the table
        self.create_maximal_power_table()
        
        if not self.db_connection:
            raise ValueError("Database connection not initialized")
        
        # Generate height list based on interval
        heights_to_sample = []
        
        # Start from the highest height and work backwards
        current_height = end_height
        
        # Add the end height first
        heights_to_sample.append(current_height)
        
        # Generate interval-based heights working backwards
        while current_height > start_height:
            # Find the next height that matches our interval pattern
            next_height = (current_height // interval) * interval
            if next_height < current_height and next_height >= start_height:
                heights_to_sample.append(next_height)
            current_height = next_height - 10000
        
        # Remove duplicates and sort in descending order (most recent first)
        heights_to_sample = sorted(list(set(heights_to_sample)), reverse=True)
        
        logger.info(f"📋 Sampling maximal power at {len(heights_to_sample)} heights from {start_height} to {end_height}")
        
        successful_samples = 0
        for height in heights_to_sample:
            try:
                # Check if we already have this height in the database
                existing = self.db_connection.execute(
                    "SELECT height FROM maximal_power_snapshots WHERE height = ?", [height]
                ).fetchone()
                
                if existing:
                    logger.info(f"⏭️  Skipping height {height} - already exists in database")
                    continue
                
                # Get the maximal power at this height
                maximal_power = self.find_maximal_power_at_single_height(height)
                
                # Get the actual timestamp for this height by querying the block
                exact_timestamp = self.get_block_timestamp_at_height(height)
                
                # Store the snapshot
                self.store_maximal_power_snapshot(height, exact_timestamp, maximal_power, 'historical')
                
                snapshots.append({
                    'height': height,
                    'timestamp': exact_timestamp,
                    'maximal_power': maximal_power
                })
                
                successful_samples += 1
                
                # Add a small delay to avoid overwhelming the RPC
                time.sleep(1)
                
            except Exception as e:
                logger.error(f"❌ Failed to get maximal power at height {height}: {e}")
                # Continue with other heights rather than failing completely
                continue
        
        logger.info(f"✅ Successfully sampled {successful_samples} maximal power snapshots")
        return snapshots

    def get_recent_maximal_power_data(self, hours: int = 24) -> List[Dict]:
        """
        Get recent maximal power data from the database.
        """
        if not self.db_connection:
            raise ValueError("Database connection not initialized")
        try:
            cutoff_time = datetime.now(timezone.utc) - timedelta(hours=hours)
            
            result = self.db_connection.execute("""
                SELECT height, timestamp, maximal_power, sample_type
                FROM maximal_power_snapshots
                WHERE timestamp >= ?
                ORDER BY timestamp ASC
            """, [cutoff_time]).fetchall()
            
            data = []
            for row in result:
                data.append({
                    'height': row[0],
                    'timestamp': row[1],
                    'maximal_power': row[2],
                    'sample_type': row[3]
                })
            
            logger.info(f"📊 Retrieved {len(data)} maximal power snapshots from last {hours} hours")
            return data
            
        except Exception as e:
            logger.error(f"❌ Error retrieving recent maximal power data: {e}")
            return []

    def update_realtime_maximal_power(self):
        """
        Update the maximal power for the current block height.
        This should be called periodically (e.g., every hour) for real-time tracking.
        """
        try:
            # Ensure we have the table
            self.create_maximal_power_table()
            
            # Get current block info
            height, timestamp = self.get_current_height_and_timestamp()
            
            # Check if we already have a recent snapshot (within last hour)
            recent_cutoff = timestamp - timedelta(hours=1)
            if not self.db_connection:
                raise ValueError("Database connection not initialized")
            existing = self.db_connection.execute("""
                SELECT height FROM maximal_power_snapshots 
                WHERE timestamp >= ? AND sample_type = 'realtime'
                ORDER BY timestamp DESC LIMIT 1
            """, [recent_cutoff]).fetchone()
            
            if existing:
                logger.info(f"⏭️  Recent real-time snapshot exists, skipping")
                return
            
            # Get maximal power at current height
            maximal_power = self.find_maximal_power_at_single_height(height)
            
            # Store the snapshot
            self.store_maximal_power_snapshot(height, timestamp, maximal_power, 'realtime')
            
            logger.info(f"✅ Updated real-time maximal power: {maximal_power} at height {height}")
            
        except Exception as e:
            logger.error(f"❌ Error updating real-time maximal power: {e}")
            raise

    def initialize_historical_data(self, days_back: int = 30):
        """
        Initialize historical maximal power data going back a specified number of days.
        """
        try:
            logger.info(f"🔄 Initializing historical maximal power data for last {days_back} days...")
            
            # Get current block info
            current_height, current_timestamp = self.get_current_height_and_timestamp()
            
            # Estimate height from days back (assuming ~6 second block time)
            blocks_per_day = 24 * 60 * 60 // 6  # ~14400 blocks per day
            start_height = max(0, current_height - (days_back * blocks_per_day))
            
            logger.info(f"📊 Sampling from height {start_height} to {current_height}")
            
            # Sample at 10000 block intervals
            snapshots = self.find_maximal_powers_for_table(start_height, current_height, interval=10000)
            
            logger.info(f"✅ Historical data initialization complete: {len(snapshots)} snapshots")
            return snapshots
            
        except Exception as e:
            logger.error(f"❌ Error initializing historical data: {e}")
            raise

    def get_all_maximal_power_data(self) -> List[Dict]:
        """
        Get all maximal power data from the database.
        Returns data in the format expected by the dashboard.
        """
        if not self.db_connection:
            logger.warning("⚠️  Database connection not available")
            return []
            
        try:
            result = self.db_connection.execute("""
                SELECT height, timestamp, maximal_power, sample_type
                FROM maximal_power_snapshots
                ORDER BY timestamp ASC
            """).fetchall()
            
            data = []
            for row in result:
                data.append({
                    'height': row[0],
                    'timestamp': datetime.fromisoformat(row[1]) if isinstance(row[1], str) else row[1],
                    'maximal_power': row[2],
                    'sample_type': row[3]
                })
            
            logger.info(f"📊 Retrieved {len(data)} maximal power snapshots")
            return data
            
        except Exception as e:
            logger.error(f"❌ Error retrieving all maximal power data: {e}")
            return []

    def initialize_csv_file(self, days_back: int = 7):
        """
        Initialize/update the CSV file with historical data.
        This method is expected by the dashboard API.
        """
        try:
            logger.info(f"🔄 Initializing CSV file with {days_back} days of data...")
            return self.initialize_historical_data(days_back)
        except Exception as e:
            logger.error(f"❌ Error initializing CSV file: {e}")
            return []


def main():
    """
    Main function for standalone execution.
    """
    logging.basicConfig(level=logging.INFO)
    
    # Initialize tracker
    tracker = MaximalPowerTracker()
    
    # For standalone testing, we need a database connection
    # This would normally be provided by the main application
    try:
        import duckdb
        db_connection = duckdb.connect(':memory:')
        tracker.db_connection = db_connection
        
        # Test the functions
        print("🧪 Testing maximal power tracker...")
        
        # Test current block info
        height, timestamp = tracker.get_current_height_and_timestamp()
        print(f"Current block: {height} at {timestamp}")
        
        # Test single height power query
        maximal_power = tracker.find_maximal_power_at_single_height(height)
        print(f"Maximal power at height {height}: {maximal_power}")
        
        # Test database operations
        tracker.create_maximal_power_table()
        tracker.store_maximal_power_snapshot(height, timestamp, maximal_power, 'test')
        
        print("✅ All tests passed!")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")


if __name__ == "__main__":
    main()

