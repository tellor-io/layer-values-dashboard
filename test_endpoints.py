#!/usr/bin/env python3
"""
Test script to verify all dashboard endpoints are working correctly
"""

import requests
import sys

BASE_URL = "http://localhost:8000"

def test_endpoint(url, description):
    """Test a single endpoint"""
    try:
        response = requests.get(url, timeout=5)
        status = "✅ PASS" if response.status_code == 200 else f"❌ FAIL ({response.status_code})"
        print(f"{status} - {description}: {url}")
        return response.status_code == 200
    except Exception as e:
        print(f"❌ ERROR - {description}: {url} - {e}")
        return False

def main():
    """Run all endpoint tests"""
    print("🧪 Testing Layer Values Dashboard Endpoints")
    print("=" * 50)
    
    tests = [
        (f"{BASE_URL}/", "API root (info only)"),
        (f"{BASE_URL}/dashboard/", "🏠 Dashboard frontend (MAIN APP)"),
        (f"{BASE_URL}/dashboard/api/info", "API info endpoint"),
        (f"{BASE_URL}/dashboard/api/stats", "API stats endpoint"),
        (f"{BASE_URL}/dashboard/api/data", "API data endpoint"),
        (f"{BASE_URL}/dashboard/static/style.css", "Static CSS file"),
        (f"{BASE_URL}/dashboard/static/app.js", "Static JS file"),
        (f"{BASE_URL}/dashboard/docs", "API documentation"),
    ]
    
    passed = 0
    total = len(tests)
    
    for url, description in tests:
        if test_endpoint(url, description):
            passed += 1
    
    print("=" * 50)
    print(f"📊 Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All endpoints are working correctly!")
        print("🌐 Main Dashboard: http://localhost:8000/dashboard/")
        print("📚 API Documentation: http://localhost:8000/dashboard/docs")
        return 0
    else:
        print("⚠️  Some endpoints failed. Check server logs.")
        return 1

if __name__ == "__main__":
    sys.exit(main()) 