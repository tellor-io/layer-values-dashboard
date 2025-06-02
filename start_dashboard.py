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
                       default=os.getenv('LAYER_SOURCE_DIR', 'source_tables'),
                       help='Directory containing CSV files (default: source_tables)')
    parser.add_argument('--port', '-p', 
                       default=8000, type=int,
                       help='Port to run the server on (default: 8000)')
    parser.add_argument('--host', 
                       default='0.0.0.0',
                       help='Host to bind the server to (default: 0.0.0.0)')
    
    args = parser.parse_args()
    
    # Get the directory where this script is located
    project_root = Path(__file__).parent.absolute()
    backend_dir = project_root / "backend"
    
    print("🚀 Starting Layer Values Dashboard...")
    print(f"📁 Project root: {project_root}")
    print(f"📁 Backend directory: {backend_dir}")
    print(f"📊 Source directory: {args.source_dir}")
    
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
    if not source_dir.exists() or not any(source_dir.glob("*.csv")):
        print(f"⚠️  Warning: No CSV files found in {args.source_dir} directory")
        print("The dashboard will start but won't have any data to display.")
    else:
        csv_files = list(source_dir.glob("*.csv"))
        print(f"📊 Found {len(csv_files)} CSV files in {args.source_dir}/")
    
    # Set environment variable for the backend
    os.environ['LAYER_SOURCE_DIR'] = str(source_dir.absolute())
    
    # Change to backend directory
    os.chdir(backend_dir)
    
    print("\n🌐 Starting web server...")
    print(f"📱 Dashboard will be available at: http://localhost:{args.port}")
    print(f"🔧 API documentation at: http://localhost:{args.port}/docs")
    print("\n💡 Press Ctrl+C to stop the server")
    print("-" * 50)
    
    try:
        # Start the FastAPI server
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