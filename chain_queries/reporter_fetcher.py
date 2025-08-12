#!/usr/bin/env python3
"""
Reporter Data Fetcher
Fetches reporter information from the Tellor chain using RPC queries
and parses the YAML output for storage in the dashboard database.
"""

import subprocess
import yaml
import logging
import time
import threading
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any
import sys
import os

# Add the backend directory to the Python path so we can import from it
sys.path.append(str(Path(__file__).parent.parent / "backend"))

logger = logging.getLogger(__name__)

# Import the maximal power tracker
try:
    from .find_maximal_power import MaximalPowerTracker
except ImportError:
    # Fallback for different import paths
    try:
        from find_maximal_power import MaximalPowerTracker
    except ImportError:
        logger.warning("⚠️  Could not import MaximalPowerTracker - maximal power tracking disabled")
        MaximalPowerTracker = None

class ReporterFetcher:
    def __init__(self, binary_path: str = "./layerd", update_interval: int = 60, rpc_url: Optional[str] = None):
        """
        Initialize the reporter fetcher.
        
        Args:
            binary_path: Path to the layerd binary
            update_interval: How often to fetch data (in seconds)
            rpc_url: RPC URL for layerd commands (optional)
        """
        # Store as Path object for existence checks, but keep original string for subprocess
        self.binary_path_obj = Path(binary_path)
        self.binary_path = binary_path  # Keep original string for subprocess
        self.update_interval = update_interval
        self.rpc_url = rpc_url
        self.is_running = False
        self.last_fetch_time = None
        self.fetch_thread = None
        
        # Maximal power tracking
        self.maximal_power_tracker = None
        self.last_maximal_power_update = None
        self.maximal_power_interval = 3600  # Update maximal power every hour
        
        # Validate binary exists
        if not self.binary_path_obj.exists():
            raise FileNotFoundError(f"Binary not found at {self.binary_path_obj}")
        
        logger.info(f"🔗 ReporterFetcher initialized with binary: {self.binary_path}")
        if self.rpc_url:
            logger.info(f"🌐 Using RPC URL: {self.rpc_url}")
        logger.info(f"⏰ Update interval: {self.update_interval} seconds")

    def initialize_maximal_power_tracking(self, db_connection):
        """
        Initialize the maximal power tracker with database connection.
        """
        if MaximalPowerTracker is None:
            logger.warning("⚠️  MaximalPowerTracker not available - skipping initialization")
            self.maximal_power_tracker = None
            return
            
        try:
            self.maximal_power_tracker = MaximalPowerTracker(
                binary_path=self.binary_path,
                rpc_url=self.rpc_url,
                db_connection=db_connection
            )
            
            # Create the maximal power table
            self.maximal_power_tracker.create_maximal_power_table()
            
            logger.info("🔋 Maximal power tracking initialized")
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize maximal power tracking: {e}")
            self.maximal_power_tracker = None

    def fetch_reporters_data(self) -> Optional[Dict[str, Any]]:
        """
        Execute the RPC query to fetch reporter data.
        
        Returns:
            Parsed YAML data or None if failed
        """
        try:
            logger.info("📡 Fetching reporter data from chain...")
            
            # Execute the RPC query
            cmd = [self.binary_path, "query", "reporter", "reporters"]
            
            # Add --node parameter if RPC URL is provided
            if self.rpc_url:
                cmd.extend(["--node", self.rpc_url])
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30  # 30 second timeout
            )
            
            if result.returncode != 0:
                logger.error(f"❌ RPC query failed with code {result.returncode}")
                logger.error(f"Error output: {result.stderr}")
                return None
            
            # Parse YAML output
            try:
                data = yaml.safe_load(result.stdout)
                logger.info(f"✅ Successfully fetched data for {len(data.get('reporters', []))} reporters")
                return data
            except yaml.YAMLError as e:
                logger.error(f"❌ Failed to parse YAML output: {e}")
                return None
                
        except subprocess.TimeoutExpired:
            logger.error("❌ RPC query timed out after 30 seconds")
            return None
        except Exception as e:
            logger.error(f"❌ Unexpected error during RPC query: {e}")
            return None

    def parse_reporter_data(self, raw_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Parse the raw YAML data into a format suitable for database storage.
        
        Args:
            raw_data: Raw YAML data from the RPC query
            
        Returns:
            List of reporter records ready for database insertion
        """
        reporters = []
        fetched_at = datetime.now(timezone.utc)
        
        for reporter_data in raw_data.get('reporters', []):
            try:
                address = reporter_data.get('address')
                metadata = reporter_data.get('metadata', {})
                
                # Parse jailed_until timestamp
                jailed_until = None
                jailed_until_str = metadata.get('jailed_until')
                if jailed_until_str and jailed_until_str != "0001-01-01T00:00:00Z":
                    try:
                        jailed_until = datetime.fromisoformat(jailed_until_str.replace('Z', '+00:00'))
                    except ValueError:
                        logger.warning(f"⚠️  Could not parse jailed_until for {address}: {jailed_until_str}")
                
                # Parse last_updated timestamp
                last_updated = None
                last_updated_str = metadata.get('last_updated')
                if last_updated_str and last_updated_str != "0001-01-01T00:00:00Z":
                    try:
                        last_updated = datetime.fromisoformat(last_updated_str.replace('Z', '+00:00'))
                    except ValueError:
                        logger.warning(f"⚠️  Could not parse last_updated for {address}: {last_updated_str}")
                
                reporter_record = {
                    'address': address,
                    'moniker': metadata.get('moniker', ''),
                    'commission_rate': metadata.get('commission_rate', '0'),
                    'jailed': metadata.get('jailed', False),
                    'jailed_until': jailed_until,
                    'last_updated': last_updated,
                    'min_tokens_required': int(metadata.get('min_tokens_required', '0')),
                    'power': int(reporter_data.get('power', '0')),
                    'fetched_at': fetched_at,
                    'updated_at': fetched_at
                }
                
                reporters.append(reporter_record)
                
            except Exception as e:
                logger.error(f"❌ Error parsing reporter data for {reporter_data.get('address', 'unknown')}: {e}")
                continue
        
        logger.info(f"📋 Parsed {len(reporters)} reporter records")
        return reporters

    def store_reporters_data(self, reporters: List[Dict[str, Any]], db_connection) -> bool:
        """
        Store reporter data in the database.
        
        Args:
            reporters: List of reporter records
            db_connection: DuckDB connection
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Don't use context manager since it closes the connection
            # Create the reporters table if it doesn't exist
            db_connection.execute("""
                CREATE TABLE IF NOT EXISTS reporters (
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
                )
            """)
            
            # Create indexes for better performance
            db_connection.execute("CREATE INDEX IF NOT EXISTS idx_reporters_moniker ON reporters(moniker)")
            db_connection.execute("CREATE INDEX IF NOT EXISTS idx_reporters_power ON reporters(power)")
            db_connection.execute("CREATE INDEX IF NOT EXISTS idx_reporters_jailed ON reporters(jailed)")
            db_connection.execute("CREATE INDEX IF NOT EXISTS idx_reporters_fetched_at ON reporters(fetched_at)")
            
            # Insert or update reporter data
            for reporter in reporters:
                db_connection.execute("""
                    INSERT OR REPLACE INTO reporters (
                        address, moniker, commission_rate, jailed, jailed_until,
                        last_updated, min_tokens_required, power, fetched_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, [
                    reporter['address'],
                    reporter['moniker'],
                    reporter['commission_rate'],
                    reporter['jailed'],
                    reporter['jailed_until'],
                    reporter['last_updated'],
                    reporter['min_tokens_required'],
                    reporter['power'],
                    reporter['fetched_at'],
                    reporter['updated_at']
                ])
            
            logger.info(f"💾 Successfully stored {len(reporters)} reporters in database")
            return True
                
        except Exception as e:
            logger.error(f"❌ Error storing reporter data: {e}")
            return False

    def update_maximal_power_if_needed(self, db_connection):
        """
        Update maximal power data if enough time has passed since the last update.
        Now with robust error handling and configuration option.
        """
        # Configuration: Set to True to enable maximal power tracking
        ENABLE_MAXIMAL_POWER = os.getenv('ENABLE_MAXIMAL_POWER', 'false').lower() == 'true'
        
        if not ENABLE_MAXIMAL_POWER:
            logger.debug("🚫 Maximal power updates disabled (set ENABLE_MAXIMAL_POWER=true to enable)")
            return
        
        if not self.maximal_power_tracker:
            logger.warning("⚠️  Maximal power tracker not initialized, skipping update")
            return
        
        try:
            current_time = datetime.now(timezone.utc)
            
            # Check if we need to update maximal power
            if (self.last_maximal_power_update is None or 
                (current_time - self.last_maximal_power_update).total_seconds() >= self.maximal_power_interval):
                
                logger.info("🔋 Updating maximal power snapshot (with improved timeout handling)...")
                
                # Use a separate thread with timeout to prevent hanging the main process
                import threading
                result = [None]  # Use list to store result from thread
                exception = [None]
                
                def update_worker():
                    try:
                        self.maximal_power_tracker.update_realtime_maximal_power()
                        result[0] = True
                    except Exception as e:
                        exception[0] = e
                
                update_thread = threading.Thread(target=update_worker, daemon=True)
                update_thread.start()
                update_thread.join(timeout=120)  # 2 minute timeout for the entire operation
                
                if update_thread.is_alive():
                    logger.error("❌ Maximal power update timed out after 2 minutes, skipping")
                    return
                
                if exception[0]:
                    raise exception[0]
                
                if result[0]:
                    self.last_maximal_power_update = current_time
                    logger.info("✅ Maximal power snapshot updated successfully")
                else:
                    logger.warning("⚠️  Maximal power update completed but result unclear")
            
        except Exception as e:
            logger.error(f"❌ Error updating maximal power: {e}")
            # Don't re-raise the exception to prevent disrupting the main reporter fetch loop

    def fetch_and_store(self, db_connection) -> bool:
        """
        Fetch reporter data from chain and store in database.
        
        Args:
            db_connection: DuckDB connection
            
        Returns:
            True if successful, False otherwise
        """
        raw_data = self.fetch_reporters_data()
        if not raw_data:
            return False
        
        reporters = self.parse_reporter_data(raw_data)
        if not reporters:
            logger.warning("⚠️  No reporters parsed from data")
            return False
        
        success = self.store_reporters_data(reporters, db_connection)
        if success:
            self.last_fetch_time = datetime.now(timezone.utc)
            
            # Update maximal power if needed
            self.update_maximal_power_if_needed(db_connection)
        
        return success

    def start_periodic_updates(self, db_connection):
        """
        Start the periodic update thread.
        
        Args:
            db_connection: DuckDB connection to use for updates
        """
        if self.is_running:
            logger.warning("⚠️  Periodic updates already running")
            return
        
        # Initialize maximal power tracking
        self.initialize_maximal_power_tracking(db_connection)
        
        self.is_running = True
        
        def update_loop():
            logger.info(f"🔄 Starting periodic reporter updates every {self.update_interval} seconds")
            logger.info(f"🔋 Maximal power updates every {self.maximal_power_interval} seconds")
            
            consecutive_failures = 0
            max_consecutive_failures = 5
            
            while self.is_running:
                try:
                    success = self.fetch_and_store(db_connection)
                    if success:
                        logger.info("✅ Periodic reporter update completed successfully")
                        consecutive_failures = 0  # Reset failure counter on success
                    else:
                        consecutive_failures += 1
                        logger.error(f"❌ Periodic reporter update failed (attempt {consecutive_failures}/{max_consecutive_failures})")
                        
                        # Log more detailed error info for debugging
                        if consecutive_failures >= max_consecutive_failures:
                            logger.error("🚨 Maximum consecutive failures reached - reporter fetcher may need manual intervention")
                            logger.error("🔍 Check network connectivity, binary availability, and RPC endpoint status")
                    
                    # Wait for the next update
                    time.sleep(self.update_interval)
                    
                except Exception as e:
                    consecutive_failures += 1
                    logger.error(f"❌ Exception in periodic update loop (attempt {consecutive_failures}/{max_consecutive_failures}): {e}")
                    
                    # Log stack trace for debugging
                    import traceback
                    logger.error(f"📋 Full traceback:\n{traceback.format_exc()}")
                    
                    if consecutive_failures >= max_consecutive_failures:
                        logger.error("🚨 Too many consecutive exceptions - reporter fetcher may need manual intervention")
                    
                    time.sleep(self.update_interval)  # Still wait before retrying
        
        self.fetch_thread = threading.Thread(target=update_loop, daemon=True)
        self.fetch_thread.start()
        logger.info("🚀 Periodic reporter updates started")

    def stop_periodic_updates(self):
        """Stop the periodic update thread."""
        if not self.is_running:
            return
        
        self.is_running = False
        logger.info("🛑 Stopping periodic reporter updates")
        
        if self.fetch_thread and self.fetch_thread.is_alive():
            self.fetch_thread.join(timeout=5)

    def get_unknown_reporters(self, db_connection) -> List[str]:
        """
        Get list of reporter addresses that appear in layer_data but not in reporters table.
        This helps handle the case where new reporters start reporting before the RPC update.
        
        Args:
            db_connection: DuckDB connection
            
        Returns:
            List of unknown reporter addresses
        """
        try:
            result = db_connection.execute("""
                SELECT DISTINCT ld.REPORTER
                FROM layer_data ld
                LEFT JOIN reporters r ON ld.REPORTER = r.address
                WHERE r.address IS NULL
                AND ld.REPORTER IS NOT NULL
                AND ld.REPORTER != ''
            """).fetchall()
            
            unknown_reporters = [row[0] for row in result]
            if unknown_reporters:
                logger.info(f"🔍 Found {len(unknown_reporters)} unknown reporters in transaction data")
            
            return unknown_reporters
                
        except Exception as e:
            logger.error(f"❌ Error finding unknown reporters: {e}")
            return []

    def create_placeholder_reporters(self, addresses: List[str], db_connection) -> bool:
        """
        Create placeholder entries for unknown reporters.
        
        Args:
            addresses: List of reporter addresses to create placeholders for
            db_connection: DuckDB connection
            
        Returns:
            True if successful, False otherwise
        """
        if not addresses:
            return True
        
        try:
            current_time = datetime.now(timezone.utc)
            
            for address in addresses:
                db_connection.execute("""
                    INSERT OR IGNORE INTO reporters (
                        address, moniker, commission_rate, jailed, jailed_until,
                        last_updated, min_tokens_required, power, fetched_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, [
                    address,
                    f"Unknown ({address[:12]}...)",  # Placeholder moniker
                    "0",
                    False,
                    None,
                    None,
                    0,
                    0,
                    current_time,
                    current_time
                ])
            
            logger.info(f"📝 Created placeholder entries for {len(addresses)} unknown reporters")
            return True
                
        except Exception as e:
            logger.error(f"❌ Error creating placeholder reporters: {e}")
            return False

    def initialize_historical_maximal_power(self, db_connection, days_back: int = 7):
        """
        Initialize historical maximal power data. This should be called once during startup.
        
        Args:
            db_connection: DuckDB connection
            days_back: Number of days of historical data to collect
        """
        if not self.maximal_power_tracker:
            logger.warning("⚠️  Maximal power tracker not initialized")
            return
        
        try:
            logger.info(f"🔄 Initializing historical maximal power data for last {days_back} days...")
            
            # Check if we already have sufficient historical data (more than just 1-2 recent snapshots)
            total_snapshots = db_connection.execute("""
                SELECT COUNT(*) FROM maximal_power_snapshots
            """).fetchone()
            
            if total_snapshots and total_snapshots[0] > 5:  # Only skip if we have more than 5 data points
                logger.info(f"✅ Sufficient maximal power data already exists ({total_snapshots[0]} snapshots), skipping historical initialization")
                return
            else:
                logger.info(f"📊 Found only {total_snapshots[0] if total_snapshots else 0} snapshots, proceeding with historical data collection...")
            
            # Initialize historical data
            snapshots = self.maximal_power_tracker.initialize_historical_data(days_back)
            logger.info(f"✅ Historical maximal power initialization complete: {len(snapshots)} snapshots")
            
        except Exception as e:
            logger.error(f"❌ Error initializing historical maximal power: {e}")


def test_fetcher():
    """Test function to verify the fetcher works with example data."""
    logging.basicConfig(level=logging.INFO)
    
    # Test with the example YAML file
    example_file = Path(__file__).parent / "example_output.yaml"
    
    if example_file.exists():
        with open(example_file, 'r') as f:
            example_data = yaml.safe_load(f)
        
        # Create fetcher without checking binary for test
        fetcher = ReporterFetcher.__new__(ReporterFetcher)
        fetcher.binary_path_obj = Path("../layerd")  # Correct path relative to chain_queries
        fetcher.binary_path = "../layerd"  # String path for subprocess
        fetcher.update_interval = 60
        fetcher.is_running = False
        fetcher.last_fetch_time = None
        fetcher.fetch_thread = None
        fetcher.maximal_power_tracker = None
        fetcher.last_maximal_power_update = None
        fetcher.maximal_power_interval = 3600
        
        reporters = fetcher.parse_reporter_data(example_data)
        
        print(f"✅ Parsed {len(reporters)} reporters from example data:")
        for reporter in reporters[:3]:  # Show first 3
            print(f"  - {reporter['moniker']} ({reporter['address'][:12]}...) Power: {reporter['power']}")


if __name__ == "__main__":
    test_fetcher() 