// Global state
let isLoading = false;
let totalRecords = 0;
let pageLoadTime = new Date(); // Store page load time
let isQuestionableFilterActive = false; // Track questionable filter state

// Query ID mappings
let queryMappings = {};

// Enhanced cellular detection
const IS_MOBILE = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const IS_CELLULAR = checkCellularConnection();

function checkCellularConnection() {
    // Check for cellular indicators
    if (navigator.connection) {
        const connectionType = navigator.connection.effectiveType;
        return ['slow-2g', '2g', '3g', '4g'].includes(connectionType) || 
               navigator.connection.type === 'cellular';
    }
    
    // Fallback: check user agent for carrier indicators
    const userAgent = navigator.userAgent.toLowerCase();
    return userAgent.includes('mobile') && (
        userAgent.includes('verizon') || 
        userAgent.includes('att') || 
        userAgent.includes('t-mobile') ||
        userAgent.includes('sprint')
    );
}

// Cellular-optimized configuration
const REQUEST_TIMEOUT = IS_CELLULAR ? 8001 : (IS_MOBILE ? 15000 : 30000);
const MAX_RETRIES = IS_CELLULAR ? 1 : (IS_MOBILE ? 2 : 3);

// Configuration with mobile detection
let API_BASE = ''; // Will be set to MOUNT_PATH from backend config

// Query ID mapping functions
const loadQueryMappings = async () => {
    try {
        // Try relative to static assets first, then fallback to root
        let response = await fetch(`${API_BASE}/static/query_mappings.json`);
        if (!response.ok) {
            response = await fetch('/query_mappings.json');
        }
        
        if (response.ok) {
            queryMappings = await response.json();
            console.log(`📊 Loaded ${Object.keys(queryMappings).length} query ID mappings:`, queryMappings);
        } else {
            console.warn('⚠️ Failed to load query mappings, using default display');
            queryMappings = {};
        }
    } catch (error) {
        console.warn('⚠️ Error loading query mappings:', error);
        queryMappings = {};
    }
};

const formatQueryId = (queryId) => {
    if (queryMappings[queryId]) {
        return queryMappings[queryId];
    }
    // Fallback to truncated version
    return queryId.length > 15 ? queryId.substring(0, 12) + '...' : queryId;
};

const getFullQueryId = (queryId) => {
    return queryId; // Always return the full query ID for tooltips
};

// DOM elements
const elements = {
    // Header stats
    totalRecords: document.getElementById('total-records'),
    loadTimestamp: document.getElementById('load-timestamp'),
    
    // Stats cards
    uniqueReporters: document.getElementById('unique-reporters'),
    uniqueReportersCard: document.getElementById('unique-reporters-card'),
    uniqueQueryIds30d: document.getElementById('unique-query-ids-30d'),
    queryIdsCard: document.getElementById('query-ids-card'),
    totalReporterPower: document.getElementById('total-reporter-power'),
    totalReporterPowerCard: document.getElementById('total-reporter-power-card'),
    recentActivity: document.getElementById('recent-activity'),
    recentActivityCard: document.getElementById('recent-activity-card'),
    questionableValues: document.getElementById('questionable-values'),
    questionableCard: document.getElementById('questionable-card'),
    questionableSubtitle: document.getElementById('questionable-subtitle'),
    urgentIndicator: document.getElementById('urgent-indicator'),
    
    // Header search - for redirecting to search page
    headerSearchInput: document.getElementById('header-search-input'),
    headerSearchBtn: document.getElementById('header-search-btn'),
    
    // Loading and modal
    loadingOverlay: document.getElementById('loading-overlay'),
    detailModal: document.getElementById('detail-modal'),
    modalClose: document.getElementById('modal-close'),
    modalBody: document.getElementById('modal-body'),
    
    // Analytics modal
    analyticsModal: document.getElementById('analytics-modal'),
    analyticsModalClose: document.getElementById('analytics-modal-close'),
    analyticsTitle: document.getElementById('analytics-title'),
    analyticsChart: document.getElementById('analytics-chart'),
    analyticsLoading: document.getElementById('analytics-loading'),
    
    // Query analytics modal
    queryAnalyticsModal: document.getElementById('query-analytics-modal'),
    queryAnalyticsModalClose: document.getElementById('query-analytics-modal-close'),
    queryAnalyticsTitle: document.getElementById('query-analytics-title'),
    queryAnalyticsChart: document.getElementById('query-analytics-chart'),
    queryAnalyticsLoading: document.getElementById('query-analytics-loading'),
    queryLegend: document.getElementById('query-legend'),
    
    // Reporter analytics modal
    reporterAnalyticsModal: document.getElementById('reporter-analytics-modal'),
    reporterAnalyticsModalClose: document.getElementById('reporter-analytics-modal-close'),
    reporterAnalyticsTitle: document.getElementById('reporter-analytics-title'),
    reporterAnalyticsChart: document.getElementById('reporter-analytics-chart'),
    reporterAnalyticsLoading: document.getElementById('reporter-analytics-loading'),
    reporterLegend: document.getElementById('reporter-legend'),
    
    // Power analytics modal
    powerAnalyticsModal: document.getElementById('power-analytics-modal'),
    powerAnalyticsModalClose: document.getElementById('power-analytics-modal-close'),
    powerAnalyticsTitle: document.getElementById('power-analytics-title'),
    powerAnalyticsChart: document.getElementById('power-analytics-chart'),
    powerAnalyticsLoading: document.getElementById('power-analytics-loading'),
    powerLegend: document.getElementById('power-legend'),
    absentReportersSection: document.getElementById('absent-reporters-section'),
    absentReportersList: document.getElementById('absent-reporters-list'),
    queryIdSelect: document.getElementById('query-id-select'),
    powerInfo: document.getElementById('power-info'),
    
    // Agreement card
    averageAgreement: document.getElementById('average-agreement'),
    agreementCard: document.getElementById('agreement-card'),
    
    // Total potential power card
    totalPotentialPower: document.getElementById('total-potential-power'),
    
    // Agreement analytics modal
    agreementAnalyticsModal: document.getElementById('agreement-analytics-modal'),
    agreementAnalyticsModalClose: document.getElementById('agreement-analytics-modal-close'),
    agreementAnalyticsTitle: document.getElementById('agreement-analytics-title'),
    agreementAnalyticsChart: document.getElementById('agreement-analytics-chart'),
    agreementAnalyticsLoading: document.getElementById('agreement-analytics-loading'),
    agreementLegend: document.getElementById('agreement-legend'),
};

// Utility functions
const formatNumber = (num) => {
    if (num === null || num === undefined) return '-';
    return new Intl.NumberFormat().format(num);
};

const formatValue = (value) => {
    if (value === null || value === undefined) return '-';
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isNaN(num) && Number.isFinite(num)) {
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 6
        }).format(num);
    }
    return String(value);
};

const formatTimestamp = (timestamp) => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleString();
};

const formatTimeAgo = (timestamp) => {
    if (!timestamp) return '-';
    
    // Convert timestamp to milliseconds if it's in seconds
    const timestampMs = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
    const currentTimeMs = Date.now();
    const diffMs = currentTimeMs - timestampMs;
    
    // If timestamp is in the future, show as "0s ago"
    if (diffMs < 0) return '0s ago';
    
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) {
        return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
    } else if (diffHours > 0) {
        return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
    } else if (diffMinutes > 0) {
        return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`;
    } else {
        return diffSeconds <= 1 ? 'just now' : `${diffSeconds}s ago`;
    }
};

const truncateText = (text, maxLength = 20) => {
    if (!text) return '-';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
};

const showLoading = () => {
    isLoading = true;
    elements.loadingOverlay.classList.remove('hidden');
};

const hideLoading = () => {
    isLoading = false;
    elements.loadingOverlay.classList.add('hidden');
};

const showModal = (content) => {
    elements.modalBody.innerHTML = content;
    elements.detailModal.classList.add('show');
};

const hideModal = () => {
    elements.detailModal.classList.remove('show');
};

const updateLoadTime = () => {
    const timeString = pageLoadTime.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    elements.loadTimestamp.textContent = timeString;
};

// Enhanced API call with cellular optimizations
const apiCall = async (endpoint, params = {}, retries = MAX_RETRIES, forceRefresh = false) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    
    try {
        const url = new URL(`${API_BASE}/api${endpoint}`, window.location.origin);
        Object.keys(params).forEach(key => {
            if (params[key] !== null && params[key] !== undefined && params[key] !== '') {
                url.searchParams.append(key, params[key]);
            }
        });
        
        // Add cache-busting timestamp for forced refreshes
        if (forceRefresh) {
            url.searchParams.append('_t', Date.now().toString());
        }
        
        console.log(`📡 ${IS_CELLULAR ? 'CELLULAR' : (IS_MOBILE ? 'MOBILE' : 'DESKTOP')} API Call: ${endpoint}${forceRefresh ? ' (FORCE REFRESH)' : ''}`);
        
        const headers = {
            'X-Mobile-Request': IS_MOBILE ? 'true' : 'false'
        };
        
        // Set cache control headers based on refresh mode
        if (forceRefresh) {
            headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
            headers['Pragma'] = 'no-cache';
            headers['Expires'] = '0';
        } else {
            headers['Cache-Control'] = IS_CELLULAR ? 'max-age=60' : (IS_MOBILE ? 'max-age=120' : 'max-age=300');
        }
        
        // Add cellular connection indicator
        if (IS_CELLULAR) {
            headers['Connection-Type'] = 'cellular';
        }
        
        const response = await fetch(url, {
            signal: controller.signal,
            headers: headers
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log(`✅ API Response: ${endpoint} - Cellular: ${IS_CELLULAR}`);
        return data;
        
    } catch (error) {
        clearTimeout(timeoutId);
        
        console.error(`❌ API call failed: ${endpoint}`, {
            error: error.message,
            cellular: IS_CELLULAR,
            mobile: IS_MOBILE,
            retries: retries
        });
        
        // More conservative retry for cellular
        if (retries > 0 && error.name !== 'AbortError') {
            const retryDelay = IS_CELLULAR ? 2000 : 1000;
            console.log(`🔄 Retrying API call: ${endpoint} (${retries} retries left)`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            return apiCall(endpoint, params, retries - 1, forceRefresh);
        }
        
        if (IS_CELLULAR) {
            showCellularErrorMessage(error);
        } else if (IS_MOBILE) {
            showMobileErrorMessage(error);
        }
        
        throw error;
    }
};

// Cellular-specific error handling
const showCellularErrorMessage = (error) => {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'mobile-error-banner cellular-error';
    errorDiv.innerHTML = `
        <div class="error-content">
            <i class="fas fa-signal"></i>
            <span>Cellular network issue detected. Try switching to WiFi or refreshing in a moment.</span>
            <button onclick="this.parentElement.parentElement.remove()" class="error-close">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    document.body.insertBefore(errorDiv, document.body.firstChild);
    
    // Longer display time for cellular issues
    setTimeout(() => {
        if (errorDiv.parentElement) {
            errorDiv.remove();
        }
    }, 8001);
};

// Initialize configuration from backend
const initializeConfig = async () => {
    try {
        // Extract mount path from current URL
        const currentPath = window.location.pathname;
        let mountPath = '';
        
        // If we're on a path like /dashboard-mainnet/ or /dashboard-mainnet/something
        if (currentPath.startsWith('/dashboard-')) {
            const pathParts = currentPath.split('/');
            if (pathParts.length >= 2) {
                mountPath = '/' + pathParts[1];
            }
        }
        
        // Default fallback if we can't determine from URL
        if (!mountPath) {
            mountPath = '/dashboard-mainnet';
        }
        
        // Test the mount path by calling the API
        const configUrl = new URL(`${mountPath}/api/info`, window.location.origin);
        const response = await fetch(configUrl);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch configuration: HTTP ${response.status}`);
        }
        
        const info = await response.json();
        if (!info.mount_path) {
            throw new Error('Configuration missing mount_path - check MOUNT_PATH environment variable');
        }
        
        API_BASE = info.mount_path;
        console.log(`📊 API_BASE set to: ${API_BASE}`);
    } catch (error) {
        console.error('❌ Configuration Error:', error);
        throw new Error(`Failed to initialize configuration: ${error.message}`);
    }
};

const loadStats = async (forceRefresh = false) => {
    // Load APIs individually with graceful error handling to prevent freezing
    let info = null;
    let stats = null;
    let reportersSummary = null;
    
    // Load core info - this should almost never fail
    try {
        info = await apiCall('/info', {}, MAX_RETRIES, forceRefresh);
        elements.totalRecords.textContent = formatNumber(info.total_rows);
    } catch (error) {
        console.error('Failed to load info:', error);
        elements.totalRecords.textContent = 'Error';
    }
    
    // Load stats - this is critical for dashboard functionality
    try {
        stats = await apiCall('/stats', {}, MAX_RETRIES, forceRefresh);
        elements.uniqueReporters.textContent = formatNumber(stats.unique_reporters);
        elements.uniqueQueryIds30d.textContent = formatNumber(stats.unique_query_ids_30d);
        elements.recentActivity.textContent = formatNumber(stats.recent_activity);
    } catch (error) {
        console.error('Failed to load stats:', error);
        elements.uniqueReporters.textContent = 'Error';
        elements.uniqueQueryIds30d.textContent = 'Error';
        elements.recentActivity.textContent = 'Error';
    }
    
    // Load reporters summary - this might fail if reporter fetcher is down
    try {
        reportersSummary = await apiCall('/reporters-summary', {}, MAX_RETRIES, forceRefresh);
    } catch (error) {
        console.error('Failed to load reporters summary:', error);
        // Set fallback values to prevent further errors
        reportersSummary = { summary: { total_power: null } };
    }
    
    // Calculate reporting power utilization percentage with error handling
    try {
        if (stats && stats.active_reporter_power && reportersSummary.summary && reportersSummary.summary.total_power) {
            const reportingPower = stats.active_reporter_power;
            const totalRegistryPower = reportersSummary.summary.total_power;
            const utilizationPercent = (reportingPower / totalRegistryPower * 100).toFixed(1);
            elements.totalReporterPower.textContent = `${utilizationPercent}%`;
        } else {
            elements.totalReporterPower.textContent = '-';
        }
        
        // Update total potential power from reporters registry
        if (reportersSummary.summary && reportersSummary.summary.total_power) {
            elements.totalPotentialPower.textContent = formatNumber(reportersSummary.summary.total_power);
        } else {
            elements.totalPotentialPower.textContent = '-';
        }
    } catch (error) {
        console.error('Error calculating power metrics:', error);
        elements.totalReporterPower.textContent = 'Error';
        elements.totalPotentialPower.textContent = 'Error';
    }
    
    // Update questionable values with error handling
    try {
        if (stats && stats.questionable_values) {
            elements.questionableValues.textContent = formatNumber(stats.questionable_values.total);
            
            // Update subtitle based on urgent count
            if (stats.questionable_values.urgent > 0) {
                elements.questionableSubtitle.textContent = `${stats.questionable_values.urgent} urgent (<48h)`;
            } else {
                elements.questionableSubtitle.textContent = 'Click to view';
            }
            
            // Handle urgent styling
            if (stats.questionable_values.has_urgent) {
                elements.questionableCard.classList.add('urgent');
                elements.urgentIndicator.style.display = 'flex';
            } else {
                elements.questionableCard.classList.remove('urgent');
                elements.urgentIndicator.style.display = 'none';
            }
        } else {
            elements.questionableValues.textContent = '0';
            elements.questionableSubtitle.textContent = 'Click to view';
            elements.questionableCard.classList.remove('urgent');
            elements.urgentIndicator.style.display = 'none';
        }
    } catch (error) {
        console.error('Error updating questionable values:', error);
        elements.questionableValues.textContent = 'Error';
    }
    
    // Populate query ID dropdown with error handling
    try {
        if (stats && stats.top_query_ids && elements.queryIdSelect) {
            elements.queryIdSelect.innerHTML = '<option value="">Overall (All Query IDs)</option>';
            stats.top_query_ids.forEach(queryId => {
                const option = document.createElement('option');
                option.value = queryId.QUERY_ID;
                const displayQueryId = formatQueryId(queryId.QUERY_ID);
                option.textContent = `${displayQueryId} (${queryId.count})`;
                option.title = queryId.QUERY_ID; // Full query ID on hover
                elements.queryIdSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error populating query ID dropdown:', error);
    }
    
    // Update total records and agreement card with error handling
    try {
        if (stats) {
            totalRecords = stats.total_rows;
            
            // Update agreement card
            if (stats.average_agreement !== null) {
                elements.averageAgreement.textContent = `${stats.average_agreement.toFixed(2)}%`;
            } else {
                elements.averageAgreement.textContent = '-';
            }
        }
    } catch (error) {
        console.error('Error updating records and agreement:', error);
        elements.averageAgreement.textContent = 'Error';
    }
};




const formatAgreement = (reportedValue, trustedValue) => {
    const r = typeof reportedValue === 'number' ? reportedValue : Number(reportedValue);
    const t = typeof trustedValue === 'number' ? trustedValue : Number(trustedValue);
    if (Number.isNaN(r) || Number.isNaN(t) || !Number.isFinite(t) || t === 0) {
        return '-';
    }
    if (r === t) {
        return '100.00%';
    }
    const percentDiff = Math.abs((r - t) / t);
    const agreement = Math.max(0, (1 - percentDiff) * 100);
    return `${agreement.toFixed(2)}%`;
};

const getAgreementClass = (reportedValue, trustedValue) => {
    const r = typeof reportedValue === 'number' ? reportedValue : Number(reportedValue);
    const t = typeof trustedValue === 'number' ? trustedValue : Number(trustedValue);
    if (Number.isNaN(r) || Number.isNaN(t) || !Number.isFinite(t) || t === 0) {
        return 'agreement-na';
    }
    if (r === t) {
        return 'agreement-perfect';
    }
    const percentDiff = Math.abs((r - t) / t);
    const agreement = Math.max(0, (1 - percentDiff) * 100);
    if (agreement >= 99) return 'agreement-perfect';
    if (agreement >= 95) return 'agreement-good';
    if (agreement >= 90) return 'agreement-moderate';
    return 'agreement-poor';
};


const showDetails = (row) => {
    const content = `
        <div class="detail-grid">
            <div class="detail-item">
                <div class="detail-label">Reporter</div>
                <div class="detail-value">${row.REPORTER}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Query Type</div>
                <div class="detail-value">${row.QUERY_TYPE}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Query ID</div>
                <div class="detail-value">${row.QUERY_ID}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Value</div>
                <div class="detail-value text-green font-bold">${formatValue(row.VALUE)}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Trusted Value</div>
                <div class="detail-value">${formatValue(row.TRUSTED_VALUE)}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Aggregate Method</div>
                <div class="detail-value">${row.AGGREGATE_METHOD}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Power</div>
                <div class="detail-value">${formatNumber(row.POWER)}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Timestamp</div>
                <div class="detail-value">${formatTimestamp(row.TIMESTAMP)}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Current Time</div>
                <div class="detail-value">${formatTimestamp(row.CURRENT_TIME)}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Time Difference</div>
                <div class="detail-value">${formatNumber(row.TIME_DIFF)}ms</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">TX Hash</div>
                <div class="detail-value">${row.TX_HASH}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Cyclelist</div>
                <div class="detail-value">${row.CYCLELIST ? 'Yes' : 'No'}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Disputable</div>
                <div class="detail-value ${row.DISPUTABLE ? 'text-red' : 'text-green'}">${row.DISPUTABLE ? 'Yes' : 'No'}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Source File</div>
                <div class="detail-value">${row.source_file}</div>
            </div>
        </div>
    `;
    
    showModal(content);
};

const showQuestionableValues = async () => {
    // Toggle questionable filter - redirect to search page with appropriate filter
    if (isQuestionableFilterActive) {
        // Remove filter - redirect to search page without filter
        isQuestionableFilterActive = false;
        elements.questionableCard.classList.remove('filter-active');
        window.location.href = `${API_BASE}/search`;
    } else {
        // Apply filter - redirect to search page with questionable filter
        isQuestionableFilterActive = true;
        elements.questionableCard.classList.add('filter-active');
        window.location.href = `${API_BASE}/search?questionable_only=true`;
    }
};

// Analytics functionality
let analyticsChart = null;

const showAnalyticsModal = () => {
    elements.analyticsModal.classList.add('show');
    loadAnalytics('24h'); // Default to 24h view
};

const hideAnalyticsModal = () => {
    elements.analyticsModal.classList.remove('show');
    if (analyticsChart) {
        analyticsChart.destroy();
        analyticsChart = null;
    }
};

// Mobile-optimized analytics loading
const loadAnalytics = async (timeframe) => {
    try {
        elements.analyticsLoading.style.display = 'flex';
        
        // Update active button
        document.querySelectorAll('.analytics-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.timeframe === timeframe) {
                btn.classList.add('active');
            }
        });
        
        console.log(`📊 Loading analytics - Timeframe: ${timeframe}, Mobile: ${IS_MOBILE}`);
        
        // Fetch analytics data with mobile optimization - using reporters-activity-analytics for maximal power data
        const data = await apiCall('/reporters-activity-analytics', { timeframe });
        
        // Update title
        elements.analyticsTitle.textContent = data.title;
        if (data.mobile_optimized) {
            elements.analyticsTitle.textContent += ' (Mobile Optimized)';
        }
        
        // Create chart
        createAnalyticsChart(data);
        
    } catch (error) {
        console.error('Failed to load analytics:', error);
        elements.analyticsTitle.textContent = IS_MOBILE ? 
            'Unable to load analytics. Please try again.' : 
            'Failed to load analytics';
    } finally {
        elements.analyticsLoading.style.display = 'none';
    }
};

const createAnalyticsChart = (data) => {
    const ctx = elements.analyticsChart.getContext('2d');
    
    // Destroy existing chart
    if (analyticsChart) {
        analyticsChart.destroy();
    }
    
    // Create gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(0, 255, 136, 0.3)');
    gradient.addColorStop(1, 'rgba(0, 255, 136, 0.05)');
    
    // Prepare datasets - start with total reports
    const datasets = [{
        label: 'Total Reports',
        data: data.total_reports || [],
        borderColor: '#00ff88',
        backgroundColor: gradient,
        borderWidth: 2,
        fill: true,
        tension: 0,
        pointBackgroundColor: '#00ff88',
        pointBorderColor: '#000',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
        yAxisID: 'y'
    }];
    
    // Add active reporters dataset
    if (data.active_reporters) {
        datasets.push({
            label: 'Active Reporters',
            data: data.active_reporters,
            borderColor: '#00d4ff',
            backgroundColor: 'rgba(0, 212, 255, 0.1)',
            borderWidth: 2,
            fill: false,
            tension: 0,
            pointBackgroundColor: '#00d4ff',
            pointBorderColor: '#000',
            pointBorderWidth: 1,
            pointRadius: 4,
            pointHoverRadius: 6,
            yAxisID: 'y'
        });
    }
    
    // Add representative power dataset if available
    if (data.representative_power_of_aggr) {
        datasets.push({
            label: 'Median Power Per Report',
            data: data.representative_power_of_aggr,
            borderColor: '#a855f7',
            backgroundColor: 'rgba(168, 85, 247, 0.1)',
            borderWidth: 2,
            fill: false,
            tension: 0,
            pointBackgroundColor: '#a855f7',
            pointBorderColor: '#000',
            pointBorderWidth: 1,
            pointRadius: 4,
            pointHoverRadius: 6,
            yAxisID: 'y1'
        });
    }
    
    // Add maximal power dataset if data is available
    if (data.has_maximal_power_data && data.maximal_power_network) {
        datasets.push({
            label: 'Maximal Network Power',
            data: data.maximal_power_network,
            borderColor: '#ff8c00',
            backgroundColor: 'rgba(255, 140, 0, 0.1)',
            borderWidth: 3,
            borderDash: [5, 5],  // Dashed line to distinguish from median power
            fill: false,
            tension: 0,
            pointBackgroundColor: '#ff8c00',
            pointBorderColor: '#000',
            pointBorderWidth: 1,
            pointRadius: 4,
            pointHoverRadius: 6,
            yAxisID: 'y1'
        });
    }
    
    analyticsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.time_labels || [],
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: '#00d4ff',
                        usePointStyle: true,
                        padding: 15,
                        font: {
                            family: 'Inter',
                            size: 12
                        }
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(26, 26, 46, 0.9)',
                    titleColor: '#00d4ff',
                    bodyColor: '#00ff88',
                    borderColor: '#333344',
                    borderWidth: 1,
                    callbacks: {
                        title: function(context) {
                            return `Time: ${context[0].label}`;
                        },
                        label: function(context) {
                            const dataset = context.dataset;
                            let value = context.formattedValue;
                            
                            // Format power values differently
                            if (dataset.label.includes('Power')) {
                                value = parseFloat(context.raw).toLocaleString();
                            }
                            
                            return `${dataset.label}: ${value}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#00d4ff',
                        maxTicksLimit: 12,
                        font: {
                            family: 'Inter',
                            size: 11
                        }
                    },
                    grid: {
                        color: 'rgba(51, 51, 68, 0.5)'
                    }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    ticks: {
                        color: '#00ff88',
                        beginAtZero: true,
                        font: {
                            family: 'Inter',
                            size: 11
                        }
                    },
                    grid: {
                        color: 'rgba(51, 51, 68, 0.5)'
                    },
                    title: {
                        display: true,
                        text: 'Reports & Active Reporters',
                        color: '#00ff88'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    ticks: {
                        color: '#a855f7',
                        font: {
                            family: 'Inter',
                            size: 11
                        },
                        callback: function(value) {
                            return value.toLocaleString();  // Format large numbers with commas
                        }
                    },
                    grid: {
                        drawOnChartArea: false,
                    },
                    title: {
                        display: true,
                        text: 'Power Values',
                        color: '#a855f7'
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            },
            elements: {
                point: {
                    hoverBackgroundColor: '#00ff88'
                }
            }
        }
    });
};

// Query Analytics functionality
let queryAnalyticsChart = null;
let hiddenDatasets = new Set();

const showQueryAnalyticsModal = () => {
    elements.queryAnalyticsModal.classList.add('show');
    loadQueryAnalytics('24h'); // Default to 24h view
};

const hideQueryAnalyticsModal = () => {
    elements.queryAnalyticsModal.classList.remove('show');
    if (queryAnalyticsChart) {
        queryAnalyticsChart.destroy();
        queryAnalyticsChart = null;
    }
    hiddenDatasets.clear();
};

const loadQueryAnalytics = async (timeframe) => {
    try {
        // Show loading
        elements.queryAnalyticsLoading.style.display = 'flex';
        
        // Update active button in query analytics modal
        const queryButtons = elements.queryAnalyticsModal.querySelectorAll('.analytics-btn');
        queryButtons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.timeframe === timeframe) {
                btn.classList.add('active');
            }
        });
        
        // Fetch query analytics data
        const data = await apiCall('/query-analytics', { timeframe });
        
        // Update title
        elements.queryAnalyticsTitle.textContent = data.title;
        
        // Create or update chart
        createQueryAnalyticsChart(data);
        
        // Create legend
        createQueryLegend(data);
        
    } catch (error) {
        console.error('Failed to load query analytics:', error);
        elements.queryAnalyticsTitle.textContent = 'Failed to load query analytics';
    } finally {
        // Hide loading
        elements.queryAnalyticsLoading.style.display = 'none';
    }
};

const generateColors = (count) => {
    const colors = [
        '#00ff88', '#00d4ff', '#a855f7', '#ff6b35', '#ffd700',
        '#ff69b4', '#32cd32', '#ff4500', '#9370db', '#20b2aa'
    ];
    
    const result = [];
    for (let i = 0; i < count; i++) {
        result.push(colors[i % colors.length]);
    }
    return result;
};

const createQueryAnalyticsChart = (data) => {
    const ctx = elements.queryAnalyticsChart.getContext('2d');
    
    // Destroy existing chart
    if (queryAnalyticsChart) {
        queryAnalyticsChart.destroy();
    }
    
    if (!data.query_ids || data.query_ids.length === 0) {
        // Show "No data" message
        ctx.fillStyle = '#00d4ff';
        ctx.font = '16px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('No data available for this timeframe', ctx.canvas.width / 2, ctx.canvas.height / 2);
        return;
    }
    
    // Generate colors for each query ID
    const colors = generateColors(data.query_ids.length);
    
    // Prepare datasets
    const datasets = data.query_ids.map((queryInfo, index) => {
        const isHidden = hiddenDatasets.has(queryInfo.id);
        return {
            label: queryInfo.short_name,
            data: data.data[queryInfo.id] || [],
            borderColor: colors[index],
            backgroundColor: `${colors[index]}20`,
            borderWidth: 2,
            fill: false,
            tension: 0,
            pointBackgroundColor: colors[index],
            pointBorderColor: '#000',
            pointBorderWidth: 1,
            pointRadius: 4,
            pointHoverRadius: 6,
            hidden: isHidden,
            queryId: queryInfo.id,
            totalCount: queryInfo.total_count
        };
    });
    
    queryAnalyticsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.time_labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false // We'll use our custom legend
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        title: function(context) {
                            return `Time: ${context[0].label}`;
                        },
                        label: function(context) {
                            const dataset = context.dataset;
                            return `${dataset.label}: ${context.formattedValue} reports`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#00d4ff',
                        maxTicksLimit: 8
                    },
                    grid: {
                        color: 'rgba(51, 51, 68, 0.5)'
                    }
                },
                y: {
                    ticks: {
                        color: '#00d4ff',
                        beginAtZero: true
                    },
                    grid: {
                        color: 'rgba(51, 51, 68, 0.5)'
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
};

const createQueryLegend = (data) => {
    if (!data.query_ids || data.query_ids.length === 0) {
        elements.queryLegend.innerHTML = '<p class="no-data">No query IDs found for this timeframe</p>';
        return;
    }
    
    const colors = generateColors(data.query_ids.length);
    
    const legendItems = data.query_ids.map((queryInfo, index) => {
        const isHidden = hiddenDatasets.has(queryInfo.id);
        return `
            <div class="legend-item ${isHidden ? 'hidden' : ''}" data-query-id="${queryInfo.id}">
                <div class="legend-color" style="background-color: ${colors[index]}"></div>
                <div class="legend-text">
                    <div class="legend-label" title="${queryInfo.id}">${queryInfo.short_name}</div>
                    <div class="legend-count">${queryInfo.total_count} reports</div>
                </div>
            </div>
        `;
    }).join('');
    
    elements.queryLegend.innerHTML = `
        <div class="legend-header">
            <h4>Query IDs (click to toggle)</h4>
        </div>
        <div class="legend-items">
            ${legendItems}
        </div>
    `;
    
    // Add click handlers for legend items
    elements.queryLegend.querySelectorAll('.legend-item').forEach(item => {
        item.addEventListener('click', () => {
            const queryId = item.dataset.queryId;
            
            if (hiddenDatasets.has(queryId)) {
                hiddenDatasets.delete(queryId);
                item.classList.remove('hidden');
            } else {
                hiddenDatasets.add(queryId);
                item.classList.add('hidden');
            }
            
            // Update chart
            if (queryAnalyticsChart) {
                queryAnalyticsChart.data.datasets.forEach(dataset => {
                    if (dataset.queryId === queryId) {
                        dataset.hidden = hiddenDatasets.has(queryId);
                    }
                });
                queryAnalyticsChart.update();
            }
        });
    });
};

// Reporter Analytics functionality
let reporterAnalyticsChart = null;
let hiddenReporters = new Set();

const showReporterAnalyticsModal = () => {
    elements.reporterAnalyticsModal.classList.add('show');
    loadReporterAnalytics('24h'); // Default to 24h view
};

const hideReporterAnalyticsModal = () => {
    elements.reporterAnalyticsModal.classList.remove('show');
    if (reporterAnalyticsChart) {
        reporterAnalyticsChart.destroy();
        reporterAnalyticsChart = null;
    }
    hiddenReporters.clear();
};

const loadReporterAnalytics = async (timeframe) => {
    try {
        // Show loading
        elements.reporterAnalyticsLoading.style.display = 'flex';
        
        // Update active button in reporter analytics modal
        const reporterButtons = elements.reporterAnalyticsModal.querySelectorAll('.analytics-btn');
        reporterButtons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.timeframe === timeframe) {
                btn.classList.add('active');
            }
        });
        
        // Fetch reporter analytics data
        const data = await apiCall('/reporter-analytics', { timeframe });
        
        // Update title
        elements.reporterAnalyticsTitle.textContent = data.title;
        
        // Create or update chart
        createReporterAnalyticsChart(data);
        
        // Create legend
        createReporterLegend(data);
        
    } catch (error) {
        console.error('Failed to load reporter analytics:', error);
        elements.reporterAnalyticsTitle.textContent = 'Failed to load reporter analytics';
    } finally {
        // Hide loading
        elements.reporterAnalyticsLoading.style.display = 'none';
    }
};

const createReporterAnalyticsChart = (data) => {
    const ctx = elements.reporterAnalyticsChart.getContext('2d');
    
    // Destroy existing chart
    if (reporterAnalyticsChart) {
        reporterAnalyticsChart.destroy();
    }
    
    if (!data.reporters || data.reporters.length === 0) {
        // Show "No data" message
        ctx.fillStyle = '#00d4ff';
        ctx.font = '16px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('No data available for this timeframe', ctx.canvas.width / 2, ctx.canvas.height / 2);
        return;
    }
    
    // Generate colors for each reporter
    const colors = generateColors(data.reporters.length);
    
    // Prepare datasets
    const datasets = data.reporters.map((reporterInfo, index) => {
        const isHidden = hiddenReporters.has(reporterInfo.address);
        return {
            label: reporterInfo.short_name,
            data: data.data[reporterInfo.address] || [],
            borderColor: colors[index],
            backgroundColor: `${colors[index]}20`,
            borderWidth: 2,
            fill: false,
            tension: 0,
            pointBackgroundColor: colors[index],
            pointBorderColor: '#000',
            pointBorderWidth: 1,
            pointRadius: 4,
            pointHoverRadius: 6,
            hidden: isHidden,
            reporterAddress: reporterInfo.address,
            totalCount: reporterInfo.total_count
        };
    });
    
    reporterAnalyticsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.time_labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false // We'll use our custom legend
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        title: function(context) {
                            return `Time: ${context[0].label}`;
                        },
                        label: function(context) {
                            const dataset = context.dataset;
                            return `${dataset.label}: ${context.formattedValue} reports`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#00d4ff',
                        maxTicksLimit: 8
                    },
                    grid: {
                        color: 'rgba(51, 51, 68, 0.5)'
                    }
                },
                y: {
                    ticks: {
                        color: '#00d4ff',
                        beginAtZero: true
                    },
                    grid: {
                        color: 'rgba(51, 51, 68, 0.5)'
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
};

const createReporterLegend = (data) => {
    if (!data.reporters || data.reporters.length === 0) {
        elements.reporterLegend.innerHTML = '<p class="no-data">No reporters found for this timeframe</p>';
        return;
    }
    
    const colors = generateColors(data.reporters.length);
    
    const legendItems = data.reporters.map((reporterInfo, index) => {
        const isHidden = hiddenReporters.has(reporterInfo.address);
        return `
            <div class="legend-item ${isHidden ? 'hidden' : ''}" data-reporter-address="${reporterInfo.address}">
                <div class="legend-color" style="background-color: ${colors[index]}"></div>
                <div class="legend-text">
                    <div class="legend-label" title="${reporterInfo.address}">${reporterInfo.short_name}</div>
                    <div class="legend-count">${reporterInfo.total_count} reports</div>
                </div>
            </div>
        `;
    }).join('');
    
    elements.reporterLegend.innerHTML = `
        <div class="legend-header">
            <h4>Reporters (click to toggle)</h4>
        </div>
        <div class="legend-items">
            ${legendItems}
        </div>
    `;
    
    // Add click handlers for legend items
    elements.reporterLegend.querySelectorAll('.legend-item').forEach(item => {
        item.addEventListener('click', () => {
            const reporterAddress = item.dataset.reporterAddress;
            
            if (hiddenReporters.has(reporterAddress)) {
                hiddenReporters.delete(reporterAddress);
                item.classList.remove('hidden');
            } else {
                hiddenReporters.add(reporterAddress);
                item.classList.add('hidden');
            }
            
            // Update chart
            if (reporterAnalyticsChart) {
                reporterAnalyticsChart.data.datasets.forEach(dataset => {
                    if (dataset.reporterAddress === reporterAddress) {
                        dataset.hidden = hiddenReporters.has(reporterAddress);
                    }
                });
                reporterAnalyticsChart.update();
            }
        });
    });
};

// Power Analytics functionality
let powerAnalyticsChart = null;
let hiddenPowerSlices = new Set();

const showPowerAnalyticsModal = () => {
    elements.powerAnalyticsModal.classList.add('show');
    loadPowerAnalytics();
};

const hidePowerAnalyticsModal = () => {
    elements.powerAnalyticsModal.classList.remove('show');
    if (powerAnalyticsChart) {
        powerAnalyticsChart.destroy();
        powerAnalyticsChart = null;
    }
    hiddenPowerSlices.clear();
};

const loadPowerAnalytics = async (queryId = null) => {
    try {
        // Show loading
        elements.powerAnalyticsLoading.style.display = 'flex';
        
        // Build API call parameters
        const params = {};
        if (queryId) {
            params.query_id = queryId;
        }
        
        // Fetch power analytics data
        const data = await apiCall('/reporter-power-analytics', params);
        
        // Update title
        elements.powerAnalyticsTitle.textContent = data.title;
        
        // Populate query ID selector if not already done
        if (data.query_ids_24h && data.query_ids_24h.length > 0) {
            const currentValue = elements.queryIdSelect.value;
            elements.queryIdSelect.innerHTML = '<option value="">Overall (All Query IDs)</option>';
            
            data.query_ids_24h.forEach(queryInfo => {
                const option = document.createElement('option');
                option.value = queryInfo.id;
                option.textContent = `${queryInfo.short_name} (${queryInfo.report_count} reports, ${queryInfo.unique_reporters} reporters)`;
                option.title = queryInfo.id; // Full query ID on hover
                elements.queryIdSelect.appendChild(option);
            });
            
            // Set the selected value
            elements.queryIdSelect.value = data.selected_query_id || '';
        }
        
        // Display power info
        showPowerInfo(data);
        
        // Create pie chart
        createPowerAnalyticsChart(data);
        
        // Create legend
        createPowerLegend(data);
        
        // Show absent reporters
        showAbsentReporters(data);
        
    } catch (error) {
        console.error('Failed to load power analytics:', error);
        elements.powerAnalyticsTitle.textContent = 'Failed to load power analytics';
    } finally {
        // Hide loading
        elements.powerAnalyticsLoading.style.display = 'none';
    }
};

const showPowerInfo = (data) => {
    let infoHTML = '';
    
    // Show error message if present
    if (data.error) {
        infoHTML += `
            <div class="info-error">
                <i class="fas fa-exclamation-triangle"></i>
                <span>${data.error}</span>
            </div>
        `;
        elements.powerInfo.innerHTML = infoHTML;
        return;
    }
    
    // Show timestamp info
    if (data.target_timestamp) {
        const timestampDate = new Date(data.target_timestamp);
        const timestampNote = data.selected_query_id 
            ? "(Most recent block for this query ID)" 
            : "(Using 2nd most recent block for stability)";
        
        infoHTML += `
            <div class="info-item">
                <span class="info-label">Data Timestamp:</span>
                <span class="info-value">${timestampDate.toLocaleString()}</span>
                <span class="info-note">${timestampNote}</span>
            </div>
        `;
    }
    
    // Show query-specific info if available
    if (data.query_info) {
        const qi = data.query_info;
        infoHTML += `
            <div class="query-info-grid">
                <div class="info-item">
                    <span class="info-label">Query Type:</span>
                    <span class="info-value">${qi.query_type}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Reports:</span>
                    <span class="info-value">${qi.total_reports}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Unique Reporters:</span>
                    <span class="info-value">${qi.unique_reporters}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Avg Value:</span>
                    <span class="info-value">${formatValue(qi.avg_value)}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Value Range:</span>
                    <span class="info-value">${formatValue(qi.min_value)} - ${formatValue(qi.max_value)}</span>
                </div>
            </div>
        `;
    }
    
    // Show total power
    infoHTML += `
        <div class="info-item">
            <span class="info-label">Total Power This Aggregate:</span>
            <span class="info-value highlight">${formatNumber(data.total_power)}</span>
        </div>
    `;
    
    elements.powerInfo.innerHTML = infoHTML;
};

const createPowerAnalyticsChart = (data) => {
    const ctx = elements.powerAnalyticsChart.getContext('2d');
    
    // Destroy existing chart
    if (powerAnalyticsChart) {
        powerAnalyticsChart.destroy();
    }
    
    if (!data.power_data || data.power_data.length === 0) {
        // Show "No data" message
        ctx.fillStyle = '#00d4ff';
        ctx.font = '16px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('No power data available', ctx.canvas.width / 2, ctx.canvas.height / 2);
        return;
    }
    
    // Generate colors for each slice
    const colors = generateColors(data.power_data.length);
    
    // Prepare data for pie chart
    const labels = data.power_data.map(item => item.short_name);
    const powers = data.power_data.map(item => item.power);
    const backgroundColors = colors.map((color, index) => {
        const isHidden = hiddenPowerSlices.has(data.power_data[index].reporter);
        return isHidden ? '#333344' : color;
    });
    
    powerAnalyticsChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: powers,
                backgroundColor: backgroundColors,
                borderColor: '#1a1a2e',
                borderWidth: 2,
                hoverBorderWidth: 3,
                hoverBorderColor: '#00ff88'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false // We'll use our custom legend
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const reporter = data.power_data[context.dataIndex];
                            const percentage = ((reporter.power / data.total_power) * 100).toFixed(1);
                            return `${reporter.short_name}: ${formatNumber(reporter.power)} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
};

const createPowerLegend = (data) => {
    if (!data.power_data || data.power_data.length === 0) {
        elements.powerLegend.innerHTML = '<p class="no-data">No power data available</p>';
        return;
    }
    
    const colors = generateColors(data.power_data.length);
    
    const legendItems = data.power_data.map((reporterInfo, index) => {
        const isHidden = hiddenPowerSlices.has(reporterInfo.reporter);
        const percentage = ((reporterInfo.power / data.total_power) * 100).toFixed(1);
        
        // Show additional info if we have query-specific data
        let additionalInfo = '';
        if (reporterInfo.value !== undefined) {
            additionalInfo = `
                <div class="legend-extra">
                    <span class="legend-value">Value: ${formatValue(reporterInfo.value)}</span>
                    ${reporterInfo.trusted_value !== undefined ? 
                        `<span class="legend-trusted">Trusted: ${formatValue(reporterInfo.trusted_value)}</span>` : ''
                    }
                </div>
            `;
        }
        
        return `
            <div class="legend-item ${isHidden ? 'hidden' : ''}" data-reporter-address="${reporterInfo.reporter}">
                <div class="legend-color" style="background-color: ${colors[index]}"></div>
                <div class="legend-text">
                    <div class="legend-label" title="${reporterInfo.reporter}">${reporterInfo.short_name}</div>
                    <div class="legend-count">${formatNumber(reporterInfo.power)} (${percentage}%)</div>
                    ${additionalInfo}
                </div>
            </div>
        `;
    }).join('');
    
    elements.powerLegend.innerHTML = `
        <div class="legend-header">
            <h4>Reporter Power Distribution (click to toggle)</h4>
            <p class="legend-subtitle">Total Power: ${formatNumber(data.total_power)}</p>
        </div>
        <div class="legend-items power-legend-items">
            ${legendItems}
        </div>
    `;
    
    // Add click handlers for legend items
    elements.powerLegend.querySelectorAll('.legend-item').forEach(item => {
        item.addEventListener('click', () => {
            const reporterAddress = item.dataset.reporterAddress;
            
            if (hiddenPowerSlices.has(reporterAddress)) {
                hiddenPowerSlices.delete(reporterAddress);
                item.classList.remove('hidden');
            } else {
                hiddenPowerSlices.add(reporterAddress);
                item.classList.add('hidden');
            }
            
            // Update chart colors
            if (powerAnalyticsChart) {
                const colors = generateColors(data.power_data.length);
                const newBackgroundColors = colors.map((color, index) => {
                    const isHidden = hiddenPowerSlices.has(data.power_data[index].reporter);
                    return isHidden ? '#333344' : color;
                });
                
                powerAnalyticsChart.data.datasets[0].backgroundColor = newBackgroundColors;
                powerAnalyticsChart.update();
            }
        });
    });
};

const showAbsentReporters = (data) => {
    if (!data.absent_reporters || data.absent_reporters.length === 0) {
        elements.absentReportersList.innerHTML = '<p class="no-absent-reporters">No absent reporters - all recent reporters participated in the latest round!</p>';
        return;
    }
    
    const absentItems = data.absent_reporters.map(reporter => {
        const timeAgo = formatTimeAgo(reporter.last_report_time);
        return `
            <div class="absent-reporter-item">
                <div class="absent-reporter-info">
                    <div class="absent-reporter-address" title="${reporter.reporter}">${reporter.short_name}</div>
                    <div class="absent-reporter-details">
                        <span class="absent-reporter-power">Power: ${formatNumber(reporter.last_power)}</span>
                        <span class="absent-reporter-time">Last seen: ${timeAgo}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    elements.absentReportersList.innerHTML = absentItems;
};

// Agreement Analytics functionality
let agreementAnalyticsChart = null;
let hiddenAgreementDatasets = new Set();

const showAgreementAnalyticsModal = () => {
    elements.agreementAnalyticsModal.classList.add('show');
    loadAgreementAnalytics('24h'); // Default to 24h view
};

const hideAgreementAnalyticsModal = () => {
    elements.agreementAnalyticsModal.classList.remove('show');
    if (agreementAnalyticsChart) {
        agreementAnalyticsChart.destroy();
        agreementAnalyticsChart = null;
    }
    hiddenAgreementDatasets.clear();
};

const loadAgreementAnalytics = async (timeframe) => {
    try {
        // Show loading
        elements.agreementAnalyticsLoading.style.display = 'flex';
        
        // Update active button
        const agreementButtons = elements.agreementAnalyticsModal.querySelectorAll('.analytics-btn');
        agreementButtons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.timeframe === timeframe) {
                btn.classList.add('active');
            }
        });
        
        // Fetch agreement analytics data
        const data = await apiCall('/agreement-analytics', { timeframe });
        
        // Update title
        elements.agreementAnalyticsTitle.textContent = data.title;
        
        // Create or update chart
        createAgreementAnalyticsChart(data);
        
        // Create legend
        createAgreementLegend(data);
        
    } catch (error) {
        console.error('Failed to load agreement analytics:', error);
        elements.agreementAnalyticsTitle.textContent = 'Failed to load agreement analytics';
    } finally {
        // Hide loading
        elements.agreementAnalyticsLoading.style.display = 'none';
    }
};

const createAgreementAnalyticsChart = (data) => {
    const ctx = elements.agreementAnalyticsChart.getContext('2d');
    
    // Destroy existing chart
    if (agreementAnalyticsChart) {
        agreementAnalyticsChart.destroy();
    }
    
    if (!data.query_ids || data.query_ids.length === 0) {
        // Show "No data" message
        ctx.fillStyle = '#00d4ff';
        ctx.font = '16px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('No data available for this timeframe', ctx.canvas.width / 2, ctx.canvas.height / 2);
        return;
    }
    
    // Generate colors for each query ID
    const colors = generateColors(data.query_ids.length);
    
    // Prepare datasets
    const datasets = data.query_ids.map((queryInfo, index) => {
        const isHidden = hiddenAgreementDatasets.has(queryInfo.id);
        return {
            label: queryInfo.short_name,
            data: data.data[queryInfo.id] || [],
            borderColor: colors[index],
            backgroundColor: `${colors[index]}20`,
            borderWidth: 2,
            fill: false,
            tension: 0,
            pointBackgroundColor: colors[index],
            pointBorderColor: '#000',
            pointBorderWidth: 1,
            pointRadius: 4,
            pointHoverRadius: 6,
            hidden: isHidden,
            queryId: queryInfo.id,
            totalCount: queryInfo.total_count
        };
    });
    
    agreementAnalyticsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.time_labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false // We'll use our custom legend
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        title: function(context) {
                            return `Time: ${context[0].label}`;
                        },
                        label: function(context) {
                            const dataset = context.dataset;
                            const value = context.parsed.y;
                            return value !== null ? `${dataset.label}: ${value.toFixed(2)}% deviation` : `${dataset.label}: No data`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#00d4ff',
                        maxTicksLimit: 8
                    },
                    grid: {
                        color: 'rgba(51, 51, 68, 0.5)'
                    }
                },
                y: {
                    ticks: {
                        color: '#00d4ff',
                        beginAtZero: true,
                        callback: function(value) {
                            return value + '%';
                        }
                    },
                    grid: {
                        color: 'rgba(51, 51, 68, 0.5)'
                    },
                    title: {
                        display: true,
                        text: 'Average Deviation (%)',
                        color: '#00d4ff'
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
};

const createAgreementLegend = (data) => {
    if (!data.query_ids || data.query_ids.length === 0) {
        elements.agreementLegend.innerHTML = '<p class="no-data">No query IDs found for this timeframe</p>';
        return;
    }
    
    const colors = generateColors(data.query_ids.length);
    
    const legendItems = data.query_ids.map((queryInfo, index) => {
        const isHidden = hiddenAgreementDatasets.has(queryInfo.id);
        return `
            <div class="legend-item ${isHidden ? 'hidden' : ''}" data-query-id="${queryInfo.id}">
                <div class="legend-color" style="background-color: ${colors[index]}"></div>
                <div class="legend-text">
                    <div class="legend-label" title="${queryInfo.id}">${queryInfo.short_name}</div>
                    <div class="legend-count">${queryInfo.total_count} reports</div>
                </div>
            </div>
        `;
    }).join('');
    
    elements.agreementLegend.innerHTML = `
        <div class="legend-header">
            <h4>Query IDs (click to toggle)</h4>
        </div>
        <div class="legend-items">
            ${legendItems}
        </div>
    `;
    
    // Add click handlers for legend items
    elements.agreementLegend.querySelectorAll('.legend-item').forEach(item => {
        item.addEventListener('click', () => {
            const queryId = item.dataset.queryId;
            
            if (hiddenAgreementDatasets.has(queryId)) {
                hiddenAgreementDatasets.delete(queryId);
                item.classList.remove('hidden');
            } else {
                hiddenAgreementDatasets.add(queryId);
                item.classList.add('hidden');
            }
            
            // Update chart
            if (agreementAnalyticsChart) {
                agreementAnalyticsChart.data.datasets.forEach(dataset => {
                    if (dataset.queryId === queryId) {
                        dataset.hidden = hiddenAgreementDatasets.has(queryId);
                    }
                });
                agreementAnalyticsChart.update();
            }
        });
    });
};

// Event listeners
document.addEventListener('DOMContentLoaded', async () => {
    // Set and display load time
    updateLoadTime();
    
    // Initialize configuration from backend
    await initializeConfig();
    
    // Update reporters link after configuration is loaded
    const reportersLink = document.getElementById('reporters-link');
    if (reportersLink) {
        reportersLink.href = `${API_BASE}/reporters`;
    }
    
    // Load query ID mappings first
    await loadQueryMappings();
    
    // Initial load
    await loadStats();
    
    // Analytics card click
    elements.recentActivityCard.addEventListener('click', showAnalyticsModal);
    
    // Query analytics card click
    elements.queryIdsCard.addEventListener('click', showQueryAnalyticsModal);
    
    // Reporter analytics card click
    elements.uniqueReportersCard.addEventListener('click', showReporterAnalyticsModal);
    
    // Power analytics card click
    elements.totalReporterPowerCard.addEventListener('click', showPowerAnalyticsModal);
    
    // Questionable values card click
    elements.questionableCard.addEventListener('click', showQuestionableValues);
    
    // Header search functionality - redirect to search page
    elements.headerSearchBtn.addEventListener('click', () => {
        const query = elements.headerSearchInput.value.trim();
        if (query) {
            window.location.href = `${API_BASE}/search?q=${encodeURIComponent(query)}`;
        }
    });
    
    elements.headerSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const query = elements.headerSearchInput.value.trim();
            if (query) {
                window.location.href = `${API_BASE}/search?q=${encodeURIComponent(query)}`;
            }
        }
    });
    
    // Modal functionality
    elements.modalClose.addEventListener('click', hideModal);
    
    elements.detailModal.addEventListener('click', (e) => {
        if (e.target === elements.detailModal) {
            hideModal();
        }
    });
    
    // Analytics modal functionality
    elements.analyticsModalClose.addEventListener('click', hideAnalyticsModal);
    
    elements.analyticsModal.addEventListener('click', (e) => {
        if (e.target === elements.analyticsModal) {
            hideAnalyticsModal();
        }
    });
    
    // Analytics timeframe buttons
    elements.analyticsModal.querySelectorAll('.analytics-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const timeframe = btn.dataset.timeframe;
            loadAnalytics(timeframe);
        });
    });
    
    // Query Analytics modal functionality
    elements.queryAnalyticsModalClose.addEventListener('click', hideQueryAnalyticsModal);
    
    elements.queryAnalyticsModal.addEventListener('click', (e) => {
        if (e.target === elements.queryAnalyticsModal) {
            hideQueryAnalyticsModal();
        }
    });
    
    // Query Analytics timeframe buttons
    elements.queryAnalyticsModal.querySelectorAll('.analytics-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const timeframe = btn.dataset.timeframe;
            loadQueryAnalytics(timeframe);
        });
    });
    
    // Reporter Analytics modal functionality
    elements.reporterAnalyticsModalClose.addEventListener('click', hideReporterAnalyticsModal);
    
    elements.reporterAnalyticsModal.addEventListener('click', (e) => {
        if (e.target === elements.reporterAnalyticsModal) {
            hideReporterAnalyticsModal();
        }
    });
    
    // Reporter Analytics timeframe buttons
    elements.reporterAnalyticsModal.querySelectorAll('.analytics-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const timeframe = btn.dataset.timeframe;
            loadReporterAnalytics(timeframe);
        });
    });
    
    // Power Analytics modal functionality
    elements.powerAnalyticsModalClose.addEventListener('click', hidePowerAnalyticsModal);
    
    elements.powerAnalyticsModal.addEventListener('click', (e) => {
        if (e.target === elements.powerAnalyticsModal) {
            hidePowerAnalyticsModal();
        }
    });
    
    // Query ID selector for power analytics
    elements.queryIdSelect.addEventListener('change', (e) => {
        const selectedQueryId = e.target.value || null;
        loadPowerAnalytics(selectedQueryId);
    });
    
    // Agreement analytics card click
    elements.agreementCard.addEventListener('click', showAgreementAnalyticsModal);
    
    // Agreement Analytics modal functionality
    elements.agreementAnalyticsModalClose.addEventListener('click', hideAgreementAnalyticsModal);
    
    elements.agreementAnalyticsModal.addEventListener('click', (e) => {
        if (e.target === elements.agreementAnalyticsModal) {
            hideAgreementAnalyticsModal();
        }
    });
    
    // Agreement Analytics timeframe buttons
    elements.agreementAnalyticsModal.querySelectorAll('.analytics-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const timeframe = btn.dataset.timeframe;
            loadAgreementAnalytics(timeframe);
        });
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideModal();
            hideAnalyticsModal();
            hideQueryAnalyticsModal();
            hideReporterAnalyticsModal();
            hidePowerAnalyticsModal();
            hideAgreementAnalyticsModal();
        }
        
        if (e.ctrlKey || e.metaKey) {
            switch (e.key) {
                case 'k':
                    e.preventDefault();
                    elements.headerSearchInput.focus();
                    break;
                case 'r':
                    e.preventDefault();
                    // Update load time when refreshing via keyboard
                    pageLoadTime = new Date();
                    updateLoadTime();
                    loadStats(true);  // Force refresh for stats
                    break;
            }
        }
    });

    // Add cellular indicator
    if (IS_CELLULAR) {
        document.body.classList.add('cellular-device');
        console.log('📡 Cellular connection detected - aggressive optimizations enabled');
        
        const headerStats = document.querySelector('.header-stats');
        if (headerStats) {
            const cellularIndicator = document.createElement('div');
            cellularIndicator.className = 'stat-item cellular-indicator';
            cellularIndicator.innerHTML = `
                <span class="stat-label">Connection</span>
                <span class="stat-value">📡 Cellular Optimized</span>
            `;
            headerStats.appendChild(cellularIndicator);
        }
    }
});

// Make showDetails available globally
window.showDetails = showDetails;