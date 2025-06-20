#!/usr/bin/env python3
"""
Dashboard Monitor - Track dashboard health and detect issues
"""

import requests
import time
import psutil
import sys
import os
import glob
from datetime import datetime

def check_dashboard_health():
    """Check if dashboard is responding and healthy"""
    try:
        # Test main endpoint
        response = requests.get("http://localhost:8000/dashboard/api/info", timeout=10)
        if response.status_code == 200:
            data = response.json()
            return True, data.get('total_rows', 0)
        else:
            return False, f"HTTP {response.status_code}"
    except requests.exceptions.Timeout:
        return False, "Timeout"
    except requests.exceptions.ConnectionError:
        return False, "Connection refused"
    except Exception as e:
        return False, str(e)

def check_source_files():
    """Check if source CSV files are being updated"""
    try:
        # Look for the most recent table file
        pattern = "/home/admin/layer-values-monitor/logs/table_*.csv"
        files = glob.glob(pattern)
        if not files:
            return False, "No source files found"
        
        # Get the most recent file
        latest_file = max(files, key=os.path.getmtime)
        file_stat = os.stat(latest_file)
        
        # Check how long ago it was modified
        seconds_since_modified = time.time() - file_stat.st_mtime
        file_size_mb = file_stat.st_size / 1024 / 1024
        
        return True, {
            'file': os.path.basename(latest_file),
            'size_mb': file_size_mb,
            'seconds_since_modified': seconds_since_modified,
            'is_recent': seconds_since_modified < 300  # Within 5 minutes
        }
    except Exception as e:
        return False, str(e)

def get_memory_usage():
    """Get memory usage of dashboard processes"""
    dashboard_processes = []
    for proc in psutil.process_iter(['pid', 'name', 'cmdline', 'memory_info']):
        try:
            if 'python' in proc.info['name'] and any('main.py' in cmd or 'uvicorn' in cmd for cmd in proc.info['cmdline']):
                dashboard_processes.append({
                    'pid': proc.info['pid'],
                    'memory_mb': proc.info['memory_info'].rss / 1024 / 1024,
                    'cmdline': ' '.join(proc.info['cmdline'][:3])
                })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    
    return dashboard_processes

def monitor_dashboard():
    """Monitor dashboard and report issues"""
    print("🔍 Starting dashboard monitor...")
    print("📊 Checking every 30 seconds for issues...")
    print("-" * 60)
    
    last_total_rows = None
    stuck_count = 0
    max_stuck_count = 6  # 3 minutes of being stuck
    
    while True:
        try:
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            # Check dashboard health
            is_healthy, result = check_dashboard_health()
            
            # Check source file status
            source_ok, source_info = check_source_files()
            
            if is_healthy:
                current_rows = result
                
                # Determine status based on both dashboard and source data
                if last_total_rows is not None and current_rows == last_total_rows:
                    stuck_count += 1
                    
                    # Check if it's a source data issue or dashboard issue
                    if source_ok and not source_info['is_recent']:
                        status = f"🔶 QUIET NETWORK ({stuck_count}/{max_stuck_count})"
                        context = f"Source: {source_info['file']} ({source_info['size_mb']:.1f}MB, {source_info['seconds_since_modified']/60:.1f}m ago)"
                    else:
                        status = f"⚠️  DASHBOARD STUCK ({stuck_count}/{max_stuck_count})"
                        context = "Source files updating but dashboard not processing"
                else:
                    stuck_count = 0
                    status = "✅ HEALTHY"
                    if source_ok:
                        context = f"Source: {source_info['file']} ({source_info['size_mb']:.1f}MB)"
                    else:
                        context = f"Source issue: {source_info}"
                
                last_total_rows = current_rows
                
                # Get memory usage
                processes = get_memory_usage()
                total_memory = sum(p['memory_mb'] for p in processes)
                
                print(f"{timestamp} | {status} | Rows: {current_rows:,} | Memory: {total_memory:.1f}MB")
                print(f"           └─ {context}")
                
                # Alert if stuck for too long
                if stuck_count >= max_stuck_count:
                    if source_ok and not source_info['is_recent']:
                        print(f"ℹ️  INFO: Network quiet period - no new Layer data for {stuck_count * 30} seconds")
                        print("💡 This is normal during low network activity")
                    else:
                        print(f"🚨 ALERT: Dashboard stuck! No processing for {stuck_count * 30} seconds")
                        print("💡 Consider restarting the dashboard service")
                    
                # Alert on high memory usage
                if total_memory > 3000:
                    print(f"⚠️  HIGH MEMORY: {total_memory:.1f}MB - consider restart")
                    
            else:
                print(f"{timestamp} | ❌ UNHEALTHY | Error: {result}")
                stuck_count = 0  # Reset since we can't check data growth
                
        except KeyboardInterrupt:
            print("\n👋 Monitor stopped by user")
            break
        except Exception as e:
            print(f"{timestamp} | ❌ MONITOR ERROR | {e}")
        
        time.sleep(30)

if __name__ == "__main__":
    monitor_dashboard() 