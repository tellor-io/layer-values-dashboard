#!/usr/bin/env python3
"""
Layer Values Dashboard - Startup Script
Run this to start the web dashboard server.
"""

import os
import sys
import subprocess
import argparse
from pathlib import Path

def main():
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Layer Values Dashboard')
    parser.add_argument('--source-dir', '-s', 
                       default=os.getenv('LAYER_SOURCE_DIR', None),
                       help='Directory containing CSV files')
    parser.add_argument('--layer-rpc-url', 
                       default=os.getenv('LAYER_RPC_URL', None),
                       help='RPC URL for layerd commands')
    parser.add_argument('--instance-name', 
                       default=os.getenv('LAYER_INSTANCE_NAME', 'palmito'),
                       help='Instance name for this dashboard (default: palmito)')
    parser.add_argument('--port', '-p', 
                       default=8001, type=int,
                       help='Port to run the server on (default: 8001)')
    parser.add_argument('--host', 
                       default='0.0.0.0',
                       help='Host to bind the server to (default: 0.0.0.0)')
    parser.add_argument('--mount-path', 
                       default=os.getenv('MOUNT_PATH', None),
                       help='Mount path for the dashboard (default: /dashboard-{instance_name})')
    
    args = parser.parse_args()
    
    # Set instance-specific defaults
    if not args.source_dir:
        args.source_dir = f'source_tables_{args.instance_name}'
    
    # Set default mount path if not provided
    if not args.mount_path:
        args.mount_path = f'/dashboard-{args.instance_name}'
    
    # Get the directory where this script is located
    project_root = Path(__file__).parent.absolute()
    backend_dir = project_root / "backend"
    
    print("🚀 Starting Layer Values Dashboard...")
    print(f"📁 Project root: {project_root}")
    print(f"📁 Backend directory: {backend_dir}")
    print(f"🏷️  Instance name: {args.instance_name}")
    print(f"📊 Source directory: {args.source_dir}")
    print(f"🌐 Mount path: {args.mount_path}")
    
    # Check if backend directory exists
    if not backend_dir.exists():
        print("❌ Backend directory not found!")
        sys.exit(1)
    
    # Check if requirements are installed
    try:
        import fastapi
        import uvicorn
        import duckdb
        import pandas
        print("✅ Dependencies found")
    except ImportError as e:
        print(f"❌ Missing dependency: {e}")
        print("Please install requirements: pip install -r requirements.txt")
        sys.exit(1)
    
    # Check if source directory exists
    source_dir = Path(args.source_dir)
    if not source_dir.exists():
        print(f"📁 Creating source directory: {args.source_dir}")
        source_dir.mkdir(parents=True, exist_ok=True)
    
    csv_files = list(source_dir.glob("*.csv"))
    if not csv_files:
        print(f"⚠️  Warning: No CSV files found in {args.source_dir} directory")
        print("The dashboard will start but won't have any data to display.")
    else:
        print(f"📊 Found {len(csv_files)} CSV files in {args.source_dir}/")
    
    # Set environment variables for the backend
    os.environ['LAYER_SOURCE_DIR'] = str(source_dir.absolute())
    os.environ['LAYER_INSTANCE_NAME'] = args.instance_name
    os.environ['MOUNT_PATH'] = args.mount_path
    if args.layer_rpc_url:
        os.environ['LAYER_RPC_URL'] = args.layer_rpc_url
    
    # Change to backend directory
    os.chdir(backend_dir)
    
    print("\n🌐 Starting web server...")
    print(f"📱 Dashboard will be available at: http://localhost:{args.port}{args.mount_path}/")
    print(f"🔧 API documentation at: http://localhost:{args.port}/docs")
    print(f"📋 Log file: dashboard_{args.instance_name}.log")
    print("\n💡 Press Ctrl+C to stop the server")
    print("-" * 50)
    
    try:
        # Start the FastAPI server with instance-specific parameters
        subprocess.run([
            sys.executable, "-m", "uvicorn", 
            "main:app", 
            "--host", args.host, 
            "--port", str(args.port),
            "--reload"
        ])
    except KeyboardInterrupt:
        print("\n\n👋 Shutting down server...")
    except Exception as e:
        print(f"\n❌ Error starting server: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main() 