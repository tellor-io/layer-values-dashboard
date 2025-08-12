#!/usr/bin/env python3
"""
Dashboard Health Monitor
Monitors the dashboard process for hanging and automatically restarts if needed.
"""

import psutil
import subprocess
import time
import logging
import os
import signal
from datetime import datetime, timedelta
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('dashboard_monitor.log')
    ]
)
logger = logging.getLogger(__name__)

class DashboardMonitor:
    def __init__(self, process_name="start_dashboard.py", check_interval=300, hang_threshold=600):
        """
        Initialize the dashboard monitor.
        
        Args:
            process_name: Name pattern to identify dashboard process
            check_interval: How often to check (seconds)
            hang_threshold: Consider hung if no log activity for this long (seconds)
        """
        self.process_name = process_name
        self.check_interval = check_interval
        self.hang_threshold = hang_threshold
        self.last_restart = None
        self.restart_count = 0
        
    def find_dashboard_process(self):
        """Find the dashboard process."""
        for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
            try:
                cmdline = ' '.join(proc.info['cmdline']) if proc.info['cmdline'] else ''
                if self.process_name in cmdline:
                    return proc
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        return None
    
    def get_log_last_activity(self, log_file="dashboard_palmito.log"):
        """Get the timestamp of the last log activity."""
        try:
            if not Path(log_file).exists():
                logger.warning(f"Log file {log_file} not found")
                return None
                
            # Get the modification time of the log file
            mtime = Path(log_file).stat().st_mtime
            return datetime.fromtimestamp(mtime)
            
        except Exception as e:
            logger.error(f"Error checking log activity: {e}")
            return None
    
    def check_for_hang(self, process):
        """Check if the process appears to be hung."""
        try:
            # Check CPU usage - a hung process often has 0% CPU
            cpu_percent = process.cpu_percent(interval=1)
            
            # Check log activity
            last_activity = self.get_log_last_activity()
            if last_activity:
                time_since_activity = datetime.now() - last_activity
                if time_since_activity.total_seconds() > self.hang_threshold:
                    logger.warning(f"⚠️  No log activity for {time_since_activity.total_seconds():.0f} seconds")
                    return True
            
            # Check if process is responsive (not in uninterruptible sleep)
            if process.status() == psutil.STATUS_DISK_SLEEP:
                logger.warning(f"⚠️  Process appears to be in uninterruptible sleep")
                return True
                
            return False
            
        except Exception as e:
            logger.error(f"Error checking for hang: {e}")
            return False
    
    def restart_dashboard(self):
        """Restart the dashboard process."""
        try:
            logger.info("🔄 Restarting dashboard process...")
            
            # Kill existing process
            proc = self.find_dashboard_process()
            if proc:
                logger.info(f"🛑 Terminating existing process {proc.pid}")
                proc.terminate()
                
                # Wait for graceful shutdown
                try:
                    proc.wait(timeout=10)
                except psutil.TimeoutExpired:
                    logger.warning("⚠️  Process didn't terminate gracefully, force killing")
                    proc.kill()
            
            # Wait a moment
            time.sleep(2)
            
            # Start new process
            logger.info("🚀 Starting new dashboard process...")
            subprocess.Popen(
                ["python", "start_dashboard.py"],
                cwd=Path(__file__).parent,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            
            self.last_restart = datetime.now()
            self.restart_count += 1
            logger.info(f"✅ Dashboard restarted (restart count: {self.restart_count})")
            
        except Exception as e:
            logger.error(f"❌ Error restarting dashboard: {e}")
    
    def monitor_loop(self):
        """Main monitoring loop."""
        logger.info("🔍 Starting dashboard health monitor...")
        logger.info(f"📊 Check interval: {self.check_interval}s, Hang threshold: {self.hang_threshold}s")
        
        while True:
            try:
                # Find dashboard process
                process = self.find_dashboard_process()
                
                if not process:
                    logger.warning("⚠️  Dashboard process not found, attempting restart...")
                    self.restart_dashboard()
                    time.sleep(30)  # Wait for startup
                    continue
                
                # Check if process is hung
                if self.check_for_hang(process):
                    logger.error("💥 Dashboard appears to be hung, restarting...")
                    self.restart_dashboard()
                    time.sleep(30)  # Wait for startup
                    continue
                
                # Log health status
                memory_mb = process.memory_info().rss / 1024 / 1024
                logger.info(f"✅ Dashboard healthy - PID: {process.pid}, Memory: {memory_mb:.1f}MB")
                
                # Wait for next check
                time.sleep(self.check_interval)
                
            except KeyboardInterrupt:
                logger.info("🛑 Monitor stopped by user")
                break
            except Exception as e:
                logger.error(f"❌ Error in monitor loop: {e}")
                time.sleep(30)  # Wait before retrying

def main():
    """Main function."""
    monitor = DashboardMonitor(
        process_name="start_dashboard.py",
        check_interval=300,  # Check every 5 minutes
        hang_threshold=600   # Consider hung if no activity for 10 minutes
    )
    
    try:
        monitor.monitor_loop()
    except KeyboardInterrupt:
        logger.info("👋 Dashboard monitor shutting down...")

if __name__ == "__main__":
    main()