#!/bin/bash

# Setup script for Layer Values Dashboard nginx configuration
# Run with: chmod +x setup-nginx.sh && sudo ./setup-nginx.sh

set -e

echo "🚀 Setting up nginx for Layer Values Dashboard..."

# Check if nginx is installed
if ! command -v nginx &> /dev/null; then
    echo "❌ nginx is not installed. Installing nginx..."
    apt update
    apt install -y nginx
fi

# Create backup of existing default site if it exists
if [ -f "/etc/nginx/sites-enabled/default" ]; then
    echo "📦 Backing up existing default site..."
    mv /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/default.backup
fi

# Copy configuration files
echo "📋 Installing nginx configuration..."

# Use the basic HTTP configuration for local development
cp nginx-complete.conf /etc/nginx/sites-available/layer-dashboard

# Enable the site
ln -sf /etc/nginx/sites-available/layer-dashboard /etc/nginx/sites-enabled/

# Test nginx configuration
echo "🔍 Testing nginx configuration..."
nginx -t

if [ $? -eq 0 ]; then
    echo "✅ nginx configuration is valid"
    
    # Restart nginx
    echo "🔄 Restarting nginx..."
    systemctl restart nginx
    systemctl enable nginx
    
    echo "✅ nginx is now running!"
    echo ""
    echo "🌐 Your dashboard should be available at:"
    echo "   http://localhost/"
    echo "   http://$(hostname -I | awk '{print $1}')/"
    echo ""
    echo "📊 Dashboard endpoints:"
    echo "   Main dashboard: http://localhost/dashboard/"
    echo "   Reporters page: http://localhost/dashboard/reporters.html"
    echo "   Search page: http://localhost/dashboard/search.html"
    echo "   Health check: http://localhost/health"
    echo ""
    echo "🔧 To enable SSL (production):"
    echo "   1. Install certbot: sudo apt install certbot python3-certbot-nginx"
    echo "   2. Get SSL certificate: sudo certbot --nginx -d your-domain.com"
    echo "   3. Use nginx-ssl.conf for SSL configuration"
    echo ""
    echo "📝 Log files:"
    echo "   Access log: /var/log/nginx/layer-dashboard.access.log"
    echo "   Error log: /var/log/nginx/layer-dashboard.error.log"
    
else
    echo "❌ nginx configuration test failed!"
    exit 1
fi

echo ""
echo "�� Setup complete!" 