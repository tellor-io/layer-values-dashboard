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
    
    // Query analytics elements (now in tab)
    queryAnalyticsChart: document.getElementById('query-analytics-chart'),
    queryAnalyticsLoading: document.getElementById('query-analytics-loading'),
    queryLegend: document.getElementById('query-legend'),
    
    // Values analytics elements
    valuesChart: document.getElementById('values-chart'),
    valuesLoading: document.getElementById('values-loading'),
    valuesLegend: document.getElementById('values-legend'),
    
    // Trusted values analytics elements
    trustedValuesChart: document.getElementById('trusted-values-chart'),
    trustedValuesLoading: document.getElementById('trusted-values-loading'),
    trustedValuesLegend: document.getElementById('trusted-values-legend'),
    
    // Overlays analytics elements
    overlaysChart: document.getElementById('overlays-chart'),
    overlaysLoading: document.getElementById('overlays-loading'),
    overlaysLegend: document.getElementById('overlays-legend'),
    
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
    
    // Reporter section elements
    reportersTable: document.getElementById('reportersTable'),
    reportersTableBody: document.getElementById('reportersTableBody'),
    showingInfo: document.getElementById('showing-info'),
    prevPage: document.getElementById('prev-page'),
    nextPage: document.getElementById('next-page'),
    currentPage: document.getElementById('current-page'),
    totalPages: document.getElementById('total-pages'),
    reporterActivityChart: document.getElementById('reporter-activity-chart'),
    reporterActivityLoading: document.getElementById('reporter-activity-loading'),
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
    // Load timestamp display removed - now compact search only
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
        // Total records display removed - now compact search only
    } catch (error) {
        console.error('Failed to load info:', error);
        // Total records display removed - now compact search only
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
                        text: 'Total Reports',
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

const showQueryAnalyticsTab = () => {
    // Find the analytics section and scroll to it
    const analyticsSection = document.querySelector('.analytics-section');
    if (analyticsSection) {
        analyticsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
        // Wait a bit for the scroll to start, then switch to the query tab
        setTimeout(() => {
            // Remove active class from all tab buttons and contents
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            
            // Activate the query analytics tab
            const queryTabBtn = document.querySelector('.tab-btn[data-tab="data-by-query-id"]');
            const queryTabContent = document.getElementById('data-by-query-id');
            
            if (queryTabBtn && queryTabContent) {
                queryTabBtn.classList.add('active');
                queryTabContent.classList.add('active');
                
                // Get current timeframe and load query analytics
                const activeTimeframe = document.querySelector('.timeframe-controls .analytics-btn.active')?.dataset.timeframe || '30d';
                loadQueryAnalytics(activeTimeframe);
            }
        }, 100);
    }
};

// Query analytics is now in a tab, so we don't need a hide function
// The chart cleanup will be handled when switching tabs if needed

const loadQueryAnalytics = async (timeframe) => {
    try {
        // Show loading
        elements.queryAnalyticsLoading.style.display = 'flex';
        
        // Update active button in timeframe controls (for tab context)
        const timeframeButtons = document.querySelectorAll('.timeframe-controls .analytics-btn');
        timeframeButtons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.timeframe === timeframe) {
                btn.classList.add('active');
            }
        });
        
        // Fetch query analytics data
        const data = await apiCall('/query-analytics', { timeframe });
        
        // Create or update chart
        createQueryAnalyticsChart(data);
        
        // Create legend
        createQueryLegend(data);
        
    } catch (error) {
        console.error('Failed to load query analytics:', error);
        // In tab context, we don't need to update a title element
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
            <p class="legend-subtitle">Showing top ${data.query_ids.length} most active query IDs (${data.query_ids.length} of ${data.total_unique_query_ids || 'unknown'} total)</p>
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

// Values Analytics functionality
let valuesChart = null;
let hiddenValuesDatasets = new Set();

const loadValuesAnalytics = async (timeframe) => {
    try {
        // Show loading
        elements.valuesLoading.style.display = 'flex';
        
        // Update active button in timeframe controls (for tab context)
        const timeframeButtons = document.querySelectorAll('.timeframe-controls .analytics-btn');
        timeframeButtons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.timeframe === timeframe) {
                btn.classList.add('active');
            }
        });
        
        // Fetch values analytics data
        const data = await apiCall('/values-analytics', { timeframe });
        
        // Create or update chart
        createValuesChart(data);
        
        // Create legend
        createValuesLegend(data);
        
    } catch (error) {
        console.error('Failed to load values analytics:', error);
    } finally {
        // Hide loading
        elements.valuesLoading.style.display = 'none';
    }
};

const createValuesChart = (data) => {
    const ctx = elements.valuesChart.getContext('2d');
    
    // Destroy existing chart
    if (valuesChart) {
        valuesChart.destroy();
    }
    
    if (!data.query_ids || data.query_ids.length === 0) {
        // Show "No data" message
        ctx.fillStyle = '#00d4ff';
        ctx.font = '16px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('No SpotPrice data available for this timeframe', ctx.canvas.width / 2, ctx.canvas.height / 2);
        return;
    }
    
    // Generate colors for each query ID
    const colors = generateColors(data.query_ids.length);
    
    // Prepare datasets
    const datasets = data.query_ids.map((queryInfo, index) => {
        const isHidden = hiddenValuesDatasets.has(queryInfo.id);
        return {
            label: queryInfo.short_name,
            data: data.data[queryInfo.id] || [],
            borderColor: colors[index],
            backgroundColor: `${colors[index]}20`,
            borderWidth: 2,
            fill: false,
            tension: 0.1,
            pointBackgroundColor: colors[index],
            pointBorderColor: '#000',
            pointBorderWidth: 1,
            pointRadius: 4,
            pointHoverRadius: 6,
            hidden: isHidden,
            queryId: queryInfo.id,
            mostRecentValue: queryInfo.most_recent_value
        };
    });
    
    valuesChart = new Chart(ctx, {
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
                            return value !== null ? `${dataset.label}: ${formatValue(value)}` : `${dataset.label}: No data`;
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
                        callback: function(value) {
                            return formatValue(value);
                        }
                    },
                    grid: {
                        color: 'rgba(51, 51, 68, 0.5)'
                    },
                    title: {
                        display: true,
                        text: 'Value',
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

const createValuesLegend = (data) => {
    if (!data.query_ids || data.query_ids.length === 0) {
        elements.valuesLegend.innerHTML = '<p class="no-data">No SpotPrice query IDs found for this timeframe</p>';
        return;
    }
    
    const colors = generateColors(data.query_ids.length);
    
    const legendItems = data.query_ids.map((queryInfo, index) => {
        const isHidden = hiddenValuesDatasets.has(queryInfo.id);
        const valueDisplay = queryInfo.most_recent_value !== null && queryInfo.most_recent_value !== undefined 
            ? formatValue(queryInfo.most_recent_value) 
            : 'N/A';
        
        return `
            <div class="legend-item ${isHidden ? 'hidden' : ''}" data-query-id="${queryInfo.id}">
                <div class="legend-color" style="background-color: ${colors[index]}"></div>
                <div class="legend-text">
                    <div class="legend-label" title="${queryInfo.id}">${queryInfo.short_name}</div>
                    <div class="legend-count">Latest: ${valueDisplay}</div>
                </div>
            </div>
        `;
    }).join('');
    
    elements.valuesLegend.innerHTML = `
        <div class="legend-header">
            <h4>Query IDs (click to toggle)</h4>
            <p class="legend-subtitle">Showing SpotPrice values over time</p>
        </div>
        <div class="legend-items">
            ${legendItems}
        </div>
    `;
    
    // Add click handlers for legend items
    elements.valuesLegend.querySelectorAll('.legend-item').forEach(item => {
        item.addEventListener('click', () => {
            const queryId = item.dataset.queryId;
            
            if (hiddenValuesDatasets.has(queryId)) {
                hiddenValuesDatasets.delete(queryId);
                item.classList.remove('hidden');
            } else {
                hiddenValuesDatasets.add(queryId);
                item.classList.add('hidden');
            }
            
            // Update chart
            if (valuesChart) {
                valuesChart.data.datasets.forEach(dataset => {
                    if (dataset.queryId === queryId) {
                        dataset.hidden = hiddenValuesDatasets.has(queryId);
                    }
                });
                valuesChart.update();
            }
        });
    });
};

// Trusted Values Analytics functionality
let trustedValuesChart = null;
let hiddenTrustedValuesDatasets = new Set();

const loadTrustedValuesAnalytics = async (timeframe) => {
    try {
        // Show loading
        elements.trustedValuesLoading.style.display = 'flex';
        
        // Update active button in timeframe controls (for tab context)
        const timeframeButtons = document.querySelectorAll('.timeframe-controls .analytics-btn');
        timeframeButtons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.timeframe === timeframe) {
                btn.classList.add('active');
            }
        });
        
        // Fetch trusted values analytics data
        const data = await apiCall('/trusted-values-analytics', { timeframe });
        
        // Create or update chart
        createTrustedValuesChart(data);
        
        // Create legend
        createTrustedValuesLegend(data);
        
    } catch (error) {
        console.error('Failed to load trusted values analytics:', error);
    } finally {
        // Hide loading
        elements.trustedValuesLoading.style.display = 'none';
    }
};

const createTrustedValuesChart = (data) => {
    const ctx = elements.trustedValuesChart.getContext('2d');
    
    // Destroy existing chart
    if (trustedValuesChart) {
        trustedValuesChart.destroy();
    }
    
    if (!data.query_ids || data.query_ids.length === 0) {
        // Show "No data" message
        ctx.fillStyle = '#00d4ff';
        ctx.font = '16px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('No SpotPrice trusted values available for this timeframe', ctx.canvas.width / 2, ctx.canvas.height / 2);
        return;
    }
    
    // Generate colors for each query ID
    const colors = generateColors(data.query_ids.length);
    
    // Prepare datasets
    const datasets = data.query_ids.map((queryInfo, index) => {
        const isHidden = hiddenTrustedValuesDatasets.has(queryInfo.id);
        return {
            label: queryInfo.short_name,
            data: data.data[queryInfo.id] || [],
            borderColor: colors[index],
            backgroundColor: `${colors[index]}20`,
            borderWidth: 2,
            fill: false,
            tension: 0.1,
            pointBackgroundColor: colors[index],
            pointBorderColor: '#000',
            pointBorderWidth: 1,
            pointRadius: 4,
            pointHoverRadius: 6,
            hidden: isHidden,
            queryId: queryInfo.id,
            mostRecentTrustedValue: queryInfo.most_recent_trusted_value
        };
    });
    
    trustedValuesChart = new Chart(ctx, {
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
                            return value !== null ? `${dataset.label}: ${formatValue(value)}` : `${dataset.label}: No data`;
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
                        callback: function(value) {
                            return formatValue(value);
                        }
                    },
                    grid: {
                        color: 'rgba(51, 51, 68, 0.5)'
                    },
                    title: {
                        display: true,
                        text: 'Trusted Value',
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

const createTrustedValuesLegend = (data) => {
    if (!data.query_ids || data.query_ids.length === 0) {
        elements.trustedValuesLegend.innerHTML = '<p class="no-data">No SpotPrice query IDs with trusted values found for this timeframe</p>';
        return;
    }
    
    const colors = generateColors(data.query_ids.length);
    
    const legendItems = data.query_ids.map((queryInfo, index) => {
        const isHidden = hiddenTrustedValuesDatasets.has(queryInfo.id);
        const valueDisplay = queryInfo.most_recent_trusted_value !== null && queryInfo.most_recent_trusted_value !== undefined 
            ? formatValue(queryInfo.most_recent_trusted_value) 
            : 'N/A';
        
        return `
            <div class="legend-item ${isHidden ? 'hidden' : ''}" data-query-id="${queryInfo.id}">
                <div class="legend-color" style="background-color: ${colors[index]}"></div>
                <div class="legend-text">
                    <div class="legend-label" title="${queryInfo.id}">${queryInfo.short_name}</div>
                    <div class="legend-count">Latest: ${valueDisplay}</div>
                </div>
            </div>
        `;
    }).join('');
    
    elements.trustedValuesLegend.innerHTML = `
        <div class="legend-header">
            <h4>Query IDs (click to toggle)</h4>
            <p class="legend-subtitle">Showing SpotPrice trusted values over time</p>
        </div>
        <div class="legend-items">
            ${legendItems}
        </div>
    `;
    
    // Add click handlers for legend items
    elements.trustedValuesLegend.querySelectorAll('.legend-item').forEach(item => {
        item.addEventListener('click', () => {
            const queryId = item.dataset.queryId;
            
            if (hiddenTrustedValuesDatasets.has(queryId)) {
                hiddenTrustedValuesDatasets.delete(queryId);
                item.classList.remove('hidden');
            } else {
                hiddenTrustedValuesDatasets.add(queryId);
                item.classList.add('hidden');
            }
            
            // Update chart
            if (trustedValuesChart) {
                trustedValuesChart.data.datasets.forEach(dataset => {
                    if (dataset.queryId === queryId) {
                        dataset.hidden = hiddenTrustedValuesDatasets.has(queryId);
                    }
                });
                trustedValuesChart.update();
            }
        });
    });
};

// Overlays Analytics functionality
let overlaysChart = null;
let hiddenOverlaysQueryIds = new Set();
const TRB_USD_QUERY_ID = '0x5c13cd9c97dbb98f2429c101a2a8150e6c7a0ddaff6124ee176a3a411067ded0';

const loadOverlaysAnalytics = async (timeframe) => {
    try {
        // Show loading
        elements.overlaysLoading.style.display = 'flex';
        
        // Update active button in timeframe controls
        const timeframeButtons = document.querySelectorAll('.timeframe-controls .analytics-btn');
        timeframeButtons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.timeframe === timeframe) {
                btn.classList.add('active');
            }
        });
        
        // Fetch overlays analytics data
        const data = await apiCall('/overlays-analytics', { timeframe });
        
        // Create or update chart
        createOverlaysChart(data);
        
        // Create legend
        createOverlaysLegend(data);
        
    } catch (error) {
        console.error('Failed to load overlays analytics:', error);
    } finally {
        // Hide loading
        elements.overlaysLoading.style.display = 'none';
    }
};

const createOverlaysChart = (data) => {
    const ctx = elements.overlaysChart.getContext('2d');
    
    // Destroy existing chart
    if (overlaysChart) {
        overlaysChart.destroy();
    }
    
    if (!data.query_ids || data.query_ids.length === 0) {
        // Show "No data" message
        ctx.fillStyle = '#00d4ff';
        ctx.font = '16px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('No SpotPrice data available for this timeframe', ctx.canvas.width / 2, ctx.canvas.height / 2);
        return;
    }
    
    // Initialize hiddenOverlaysQueryIds - hide all except TRB/USD
    hiddenOverlaysQueryIds.clear();
    data.query_ids.forEach(queryInfo => {
        if (queryInfo.id !== TRB_USD_QUERY_ID) {
            hiddenOverlaysQueryIds.add(queryInfo.id);
        }
    });
    
    // Generate colors for each query ID
    const colors = generateColors(data.query_ids.length);
    
    // Prepare datasets - create 2 datasets per query ID (VALUE solid, TRUSTED_VALUE dashed)
    const datasets = [];
    data.query_ids.forEach((queryInfo, index) => {
        const isHidden = hiddenOverlaysQueryIds.has(queryInfo.id);
        const color = colors[index];
        
        // VALUE dataset (solid line)
        datasets.push({
            label: `${queryInfo.short_name} - Value`,
            data: data.data[queryInfo.id]?.value || [],
            borderColor: color,
            backgroundColor: 'transparent',
            borderWidth: 2,
            fill: false,
            tension: 0.1,
            pointBackgroundColor: color,
            pointBorderColor: '#000',
            pointBorderWidth: 1,
            pointRadius: 3,
            pointHoverRadius: 5,
            hidden: isHidden,
            queryId: queryInfo.id,
            dataType: 'value'
        });
        
        // TRUSTED_VALUE dataset (dashed line)
        datasets.push({
            label: `${queryInfo.short_name} - Trusted`,
            data: data.data[queryInfo.id]?.trusted_value || [],
            borderColor: color,
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [5, 5],  // Dashed line
            fill: false,
            tension: 0.1,
            pointBackgroundColor: color,
            pointBorderColor: '#000',
            pointBorderWidth: 1,
            pointRadius: 3,
            pointHoverRadius: 5,
            hidden: isHidden,
            queryId: queryInfo.id,
            dataType: 'trusted_value'
        });
    });
    
    overlaysChart = new Chart(ctx, {
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
                            return value !== null ? `${dataset.label}: ${formatValue(value)}` : `${dataset.label}: No data`;
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
                        callback: function(value) {
                            return formatValue(value);
                        }
                    },
                    grid: {
                        color: 'rgba(51, 51, 68, 0.5)'
                    },
                    title: {
                        display: true,
                        text: 'Value',
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

const createOverlaysLegend = (data) => {
    if (!data.query_ids || data.query_ids.length === 0) {
        elements.overlaysLegend.innerHTML = '<p class="no-data">No SpotPrice query IDs found for this timeframe</p>';
        return;
    }
    
    const colors = generateColors(data.query_ids.length);
    
    const legendItems = data.query_ids.map((queryInfo, index) => {
        const isHidden = hiddenOverlaysQueryIds.has(queryInfo.id);
        const valueDisplay = queryInfo.most_recent_value !== null && queryInfo.most_recent_value !== undefined 
            ? formatValue(queryInfo.most_recent_value) 
            : 'N/A';
        const trustedDisplay = queryInfo.most_recent_trusted_value !== null && queryInfo.most_recent_trusted_value !== undefined 
            ? formatValue(queryInfo.most_recent_trusted_value) 
            : 'N/A';
        
        return `
            <div class="legend-item overlay-legend-item ${isHidden ? 'hidden' : ''}" data-query-id="${queryInfo.id}">
                <div class="legend-color" style="background-color: ${colors[index]}"></div>
                <div class="legend-text">
                    <div class="legend-label" title="${queryInfo.id}">${queryInfo.short_name}</div>
                    <div class="overlay-values">
                        <span class="overlay-value-line">━ Value: ${valueDisplay}</span>
                        <span class="overlay-trusted-line">┄ Trusted: ${trustedDisplay}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    elements.overlaysLegend.innerHTML = `
        <div class="legend-header">
            <h4>Query IDs (click to toggle)</h4>
            <p class="legend-subtitle">Showing VALUE (solid) and TRUSTED_VALUE (dashed) overlays. Click to show/hide.</p>
        </div>
        <div class="legend-items">
            ${legendItems}
        </div>
    `;
    
    // Add click handlers for legend items
    elements.overlaysLegend.querySelectorAll('.legend-item').forEach(item => {
        item.addEventListener('click', () => {
            const queryId = item.dataset.queryId;
            
            if (hiddenOverlaysQueryIds.has(queryId)) {
                // Toggle ON - show both lines
                hiddenOverlaysQueryIds.delete(queryId);
                item.classList.remove('hidden');
            } else {
                // Toggle OFF - hide both lines
                hiddenOverlaysQueryIds.add(queryId);
                item.classList.add('hidden');
            }
            
            // Update chart - toggle both VALUE and TRUSTED_VALUE datasets for this query ID
            if (overlaysChart) {
                overlaysChart.data.datasets.forEach(dataset => {
                    if (dataset.queryId === queryId) {
                        dataset.hidden = hiddenOverlaysQueryIds.has(queryId);
                    }
                });
                overlaysChart.update();
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
            <p class="legend-subtitle">Showing top ${data.query_ids.length} most active query IDs (${data.query_ids.length} of ${data.total_unique_query_ids || 'unknown'} total)</p>
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

// Reporters functionality
class ReportersManager {
    constructor() {
        this.currentPage = 0;
        // Smaller page size for mobile devices for faster loading
        this.pageSize = IS_MOBILE ? 60 : 110;
        this.totalReporters = 0;
        this.maxPower = 0;
        this.reporterActivityChart = null;
        this.currentTimeframe = '24h';
        this.isLoadingAnalytics = false;
    }
    
    async loadReportersSummary() {
        try {
            const data = await apiCall('/reporters-summary');
            
            // Stat cards removed - summary data still loaded for other purposes
            
            this.maxPower = data.summary.max_power;
        } catch (error) {
            console.error('Error loading reporters summary:', error);
            // Stat cards removed - error handling simplified
        }
    }
    
    async loadReporters() {
        if (!elements.reportersTableBody) return;
        
        const tableBody = elements.reportersTableBody;
        const showingInfo = elements.showingInfo;
        
        // Show loading state
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center">
                    <div class="loading">
                        <i class="fas fa-spinner fa-spin"></i> Loading reporters...
                    </div>
                </td>
            </tr>
        `;
        
        try {
            const params = new URLSearchParams({
                limit: this.pageSize,
                offset: this.currentPage * this.pageSize,
                sort_by: 'power'
            });
            
            const data = await apiCall(`/reporters?${params}`);
            
            this.totalReporters = data.total;
            this.renderReporters(data.reporters);
            this.updatePaginationControls();
            
            // Update showing info
            if (showingInfo) {
                const start = this.currentPage * this.pageSize + 1;
                const end = Math.min((this.currentPage + 1) * this.pageSize, this.totalReporters);
                showingInfo.textContent = `${start}-${end} of ${this.totalReporters.toLocaleString()} reporters`;
            }
            
        } catch (error) {
            console.error('Error loading reporters:', error);
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center">
                        <div class="error">
                            <i class="fas fa-exclamation-triangle"></i> Error loading reporters. Please try again.
                        </div>
                    </td>
                </tr>
            `;
        }
    }
    
    renderReporters(reporters) {
        if (!elements.reportersTableBody) return;
        
        const tableBody = elements.reportersTableBody;
        
        if (reporters.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center">
                        <div class="loading">No reporters found.</div>
                    </td>
                </tr>
            `;
            return;
        }
        
        const html = reporters.map(reporter => {
            const powerPercent = this.maxPower > 0 ? (reporter.power / this.maxPower) * 100 : 0;
            const statusClass = reporter.jailed ? 'badge-danger' : (reporter.power > 0 ? 'badge-success' : 'badge-secondary');
            const statusText = reporter.jailed ? 'Jailed' : (reporter.power > 0 ? 'Free' : 'Jailed');
            const commissionPercent = (parseFloat(reporter.commission_rate) / 1e18 * 100).toFixed(1);
            
            // Active status logic
            const activeClass = reporter.active_24h ? 'badge-success' : 'badge-secondary';
            const activeText = reporter.active_24h ? 'Active' : 'Inactive';
            
            return `
                <tr data-reporter-address="${this.escapeHtml(reporter.address)}" class="reporter-row">
                    <td>
                        <div class="reporter">
                            <div class="reporter-moniker font-bold text-green">${this.escapeHtml(reporter.moniker || 'Unknown')}</div>
                            <div class="reporter-address font-mono text-xs text-gray">${this.escapeHtml(reporter.address)}</div>
                        </div>
                    </td>
                    <td>
                        <div class="power-display">
                            <div class="value font-bold text-green">${reporter.power.toLocaleString()}</div>
                            <div class="power-bar" style="background: #333; height: 4px; border-radius: 2px; margin-top: 4px;">
                                <div style="background: linear-gradient(90deg, #00ff88, #00d4ff); width: ${powerPercent}%; height: 100%; border-radius: 2px; transition: width 0.3s ease;"></div>
                            </div>
                        </div>
                    </td>
                    <td>
                        <span class="value font-bold">${commissionPercent}%</span>
                    </td>
                    <td>
                        <span class="badge ${statusClass}">${statusText}</span>
                    </td>
                    <td>
                        <span class="badge ${activeClass}">${activeText}</span>
                    </td>
                </tr>
            `;
        }).join('');
        
        tableBody.innerHTML = html;
        
        // Add click event listeners to rows
        const reporterRows = tableBody.querySelectorAll('.reporter-row');
        reporterRows.forEach(row => {
            row.addEventListener('click', () => {
                const address = row.getAttribute('data-reporter-address');
                if (address) {
                    this.viewReporter(address);
                }
            });
        });
    }
    
    updatePaginationControls() {
        if (!elements.currentPage || !elements.totalPages) return;
        
        const totalPages = Math.ceil(this.totalReporters / this.pageSize);
        const prevBtn = elements.prevPage;
        const nextBtn = elements.nextPage;
        const currentPageSpan = elements.currentPage;
        const totalPagesSpan = elements.totalPages;
        
        // Update page numbers
        currentPageSpan.textContent = this.currentPage + 1;
        totalPagesSpan.textContent = totalPages;
        
        // Update button states
        if (prevBtn) prevBtn.disabled = this.currentPage === 0;
        if (nextBtn) nextBtn.disabled = this.currentPage >= totalPages - 1;
    }
    
    viewReporter(address) {
        // Redirect to search page with the reporter's address as the search query
        window.location.href = `${API_BASE}/search?q=${encodeURIComponent(address)}`;
    }
    
    async loadReporterActivityAnalytics(timeframe) {
        if (!elements.reporterActivityChart) return;
        
        // Prevent simultaneous requests
        if (this.isLoadingAnalytics) {
            return;
        }
        
        try {
            this.isLoadingAnalytics = true;
            
            // Show loading
            if (elements.reporterActivityLoading) {
                elements.reporterActivityLoading.style.display = 'flex';
            }
            
            // Fetch analytics data
            const data = await apiCall(`/reporters-activity-analytics?timeframe=${timeframe}`);
            
            // Create or update chart
            this.createReporterActivityChart(data);
            
        } catch (error) {
            console.error('Failed to load reporter activity analytics:', error);
            
            // Show error on chart
            const ctx = elements.reporterActivityChart.getContext('2d');
            if (this.reporterActivityChart) {
                this.reporterActivityChart.destroy();
            }
            ctx.fillStyle = '#ff6b6b';
            ctx.font = '16px Inter';
            ctx.textAlign = 'center';
            ctx.fillText('Failed to load reporter activity data', ctx.canvas.width / 2, ctx.canvas.height / 2);
        } finally {
            // Hide loading and reset flag
            if (elements.reporterActivityLoading) {
                elements.reporterActivityLoading.style.display = 'none';
            }
            this.isLoadingAnalytics = false;
        }
    }
    
    createReporterActivityChart(data) {
        if (!elements.reporterActivityChart) return;
        
        const ctx = elements.reporterActivityChart.getContext('2d');
        
        // Adjust chart height on mobile for better viewport fit
        const chartContainer = elements.reporterActivityChart.parentElement;
        chartContainer.style.height = IS_MOBILE ? '250px' : '400px';
        
        // Dynamic styling variables based on device
        const pointRadius = IS_MOBILE ? 2 : 4;
        const hoverRadius = IS_MOBILE ? 4 : 6;
        const borderWidthMain = IS_MOBILE ? 2 : 3;
        
        if (!data.total_reports || data.total_reports.length === 0) {
            // Destroy existing chart first
            if (this.reporterActivityChart) {
                this.reporterActivityChart.destroy();
                this.reporterActivityChart = null;
            }
            // Show "No data" message
            ctx.fillStyle = '#00d4ff';
            ctx.font = '16px Inter';
            ctx.textAlign = 'center';
            ctx.fillText('No data available for this timeframe', ctx.canvas.width / 2, ctx.canvas.height / 2);
            return;
        }
        
        // Update existing chart data if possible, otherwise recreate
        if (this.reporterActivityChart && data.time_labels.length === this.reporterActivityChart.data.labels.length) {
            // Update data efficiently without recreating chart
            this.reporterActivityChart.data.labels = data.time_labels;
            this.reporterActivityChart.data.datasets[0].data = data.total_reports;
            this.reporterActivityChart.data.datasets[1].data = [...data.representative_power_of_aggr];
            this.reporterActivityChart.update('none'); // No animation for faster updates
            return;
        }
        
        // Destroy and recreate chart only when necessary
        if (this.reporterActivityChart) {
            this.reporterActivityChart.destroy();
            this.reporterActivityChart = null;
        }
        
        // Calculate dynamic y1 axis range based on actual data
        const powerData = [...data.representative_power_of_aggr];
        const maximalPowerData = (data.has_maximal_power_data && data.maximal_power_network) ? data.maximal_power_network : [];
        const allPowerData = [...powerData, ...maximalPowerData].filter(value => value != null && value > 0);
        
        let y1Min = undefined;
        let y1Max = undefined;
        
        if (allPowerData.length > 0) {
            const dataMin = Math.min(...allPowerData);
            const dataMax = Math.max(...allPowerData);
            const range = dataMax - dataMin;
            const padding = range > 0 ? range * 0.1 : Math.abs(dataMin) * 0.1; // 10% padding
            
            y1Min = Math.max(0, dataMin - padding);
            y1Max = dataMax + padding;
        }

        // Prepare datasets array
        const datasets = [
            {
                label: 'Total Reports',
                data: data.total_reports,
                borderColor: '#00ff88',
                backgroundColor: 'rgba(0, 255, 136, 0.1)',
                borderWidth: borderWidthMain,
                fill: true,
                tension: 0.1,
                pointBackgroundColor: '#00ff88',
                pointBorderColor: '#000',
                pointBorderWidth: 1,
                pointRadius: pointRadius,
                pointHoverRadius: hoverRadius,
                yAxisID: 'y'
            },
            {
                label: 'Median Power Per Report',
                data: [...data.representative_power_of_aggr],
                borderColor: '#a855f7',
                backgroundColor: 'rgba(168, 85, 247, 0.1)',
                borderWidth: borderWidthMain,
                fill: false,
                tension: 0.1,
                pointBackgroundColor: '#a855f7',
                pointBorderColor: '#000',
                pointBorderWidth: 1,
                pointRadius: pointRadius,
                pointHoverRadius: hoverRadius,
                yAxisID: 'y1'
            }
        ];
        
        // Add maximal power dataset if data is available
        if (data.has_maximal_power_data && data.maximal_power_network) {
            datasets.push({
                label: 'Maximal Power',
                data: data.maximal_power_network,
                borderColor: '#ff8c00',
                backgroundColor: 'rgba(255, 140, 0, 0.1)',
                borderWidth: borderWidthMain,
                borderDash: [5, 5],
                fill: false,
                tension: 0.1,
                pointBackgroundColor: '#ff8c00',
                pointBorderColor: '#000',
                pointBorderWidth: 1,
                pointRadius: pointRadius,
                pointHoverRadius: hoverRadius,
                yAxisID: 'y1'
            });
        }

        this.reporterActivityChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.time_labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: IS_MOBILE ? false : {
                    duration: 500,
                    easing: 'easeOutQuart'
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: '#00d4ff',
                            usePointStyle: true,
                            font: {
                                family: 'Inter',
                                size: 12
                            }
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#00d4ff',
                        bodyColor: '#ffffff',
                        borderColor: '#00d4ff',
                        borderWidth: 1,
                        callbacks: {
                            title: function(context) {
                                return `Time: ${context[0].label}`;
                            },
                            label: function(context) {
                                const dataset = context.dataset;
                                if (dataset.label === 'Median Power Per Report') {
                                    return `${dataset.label}: ${context.formattedValue} (median POWER_OF_AGGR)`;
                                }
                                return `${dataset.label}: ${context.formattedValue}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: '#00d4ff',
                            maxTicksLimit: 8,
                            font: {
                                family: 'Inter',
                                size: 11
                            }
                        },
                        grid: {
                            color: 'rgba(51, 51, 68, 0.3)'
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        ticks: {
                            color: '#00d4ff',
                            beginAtZero: true,
                            font: {
                                family: 'Inter',
                                size: 11
                            }
                        },
                        grid: {
                            color: 'rgba(51, 51, 68, 0.3)'
                        },
                        title: {
                            display: true,
                            text: 'Total Reports',
                            color: '#00d4ff'
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        min: y1Min,
                        max: y1Max,
                        ticks: {
                            color: '#a855f7',
                            font: {
                                family: 'Inter',
                                size: 11
                            },
                            callback: function(value) {
                                return value.toLocaleString();
                            }
                        },
                        grid: {
                            drawOnChartArea: false,
                        },
                        title: {
                            display: true,
                            text: 'Median Power -vs- Maximal Power',
                            color: '#a855f7'
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
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    initializeEventListeners() {
        // Timeframe button listeners
        const timeframeButtons = document.querySelectorAll('.analytics-btn');
        timeframeButtons.forEach(btn => {
            btn.addEventListener('click', async () => {
                const timeframe = btn.dataset.timeframe;
                if (timeframe !== this.currentTimeframe && !this.isLoadingAnalytics) {
                    // Update active button
                    timeframeButtons.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    
                    // Update current timeframe and reload chart
                    this.currentTimeframe = timeframe;
                    await this.loadReporterActivityAnalytics(timeframe);
                }
            });
        });
        
        // Pagination buttons
        if (elements.prevPage) {
            elements.prevPage.addEventListener('click', () => {
                if (this.currentPage > 0) {
                    this.currentPage--;
                    this.loadReporters();
                }
            });
        }
        
        if (elements.nextPage) {
            elements.nextPage.addEventListener('click', () => {
                const totalPages = Math.ceil(this.totalReporters / this.pageSize);
                if (this.currentPage < totalPages - 1) {
                    this.currentPage++;
                    this.loadReporters();
                }
            });
        }
    }
    
    async initialize() {
        // Initialize event listeners
        this.initializeEventListeners();
        
        // Load initial data
        showLoading();
        try {
            if (IS_MOBILE) {
                // Load components sequentially on mobile to reduce load
                await this.loadReportersSummary();
                await this.loadReporters();
                await this.loadReporterActivityAnalytics(this.currentTimeframe);
            } else {
                // Load in parallel on desktop
                await Promise.all([
                    this.loadReporterActivityAnalytics(this.currentTimeframe),
                    this.loadReportersSummary(),
                    this.loadReporters()
                ]);
            }
        } finally {
            hideLoading();
        }
    }
}

// Create global reporters manager instance
const reportersManager = new ReportersManager();

// Tab functionality
function initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;
            
            // Remove active class from all buttons and contents
            tabButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Add active class to clicked button and corresponding content
            btn.classList.add('active');
            document.getElementById(targetTab).classList.add('active');
            
            // Get the currently active timeframe
            const activeTimeframe = document.querySelector('.timeframe-controls .analytics-btn.active').dataset.timeframe;
            
            // Initialize chart for the active tab with current timeframe
            if (targetTab === 'activity-overview') {
                reportersManager.loadReporterActivityAnalytics(activeTimeframe);
            } else if (targetTab === 'individual-reporters') {
                loadReporterAnalytics(activeTimeframe);
            } else if (targetTab === 'data-by-query-id') {
                loadQueryAnalytics(activeTimeframe);
            } else if (targetTab === 'values') {
                loadValuesAnalytics(activeTimeframe);
            } else if (targetTab === 'trusted-values') {
                loadTrustedValuesAnalytics(activeTimeframe);
            } else if (targetTab === 'overlays') {
                loadOverlaysAnalytics(activeTimeframe);
            }
        });
    });
}

// Event listeners
document.addEventListener('DOMContentLoaded', async () => {
    // Set and display load time
    updateLoadTime();
    
    // Initialize configuration from backend
    await initializeConfig();
    
    // Load query ID mappings first
    await loadQueryMappings();
    
    // Initial load
    await loadStats();
    
    // Initialize reporters functionality
    await reportersManager.initialize();
    
    // Initialize tab functionality
    initializeTabs();
    
    // Initialize charts in the active tab
    await reportersManager.loadReporterActivityAnalytics('24h'); // Activity Overview tab (default active)
    await loadReporterAnalytics('24h'); // Preload Individual Reporters tab
    
    // Analytics card click
    elements.recentActivityCard.addEventListener('click', showAnalyticsModal);
    
    // Query analytics card click
    elements.queryIdsCard.addEventListener('click', showQueryAnalyticsTab);
    
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
    
    // Query Analytics is now handled by the tab system above
    
    // Reporter Analytics modal functionality
    elements.reporterAnalyticsModalClose.addEventListener('click', hideReporterAnalyticsModal);
    
    elements.reporterAnalyticsModal.addEventListener('click', (e) => {
        if (e.target === elements.reporterAnalyticsModal) {
            hideReporterAnalyticsModal();
        }
    });
    
    // Unified timeframe controls for both tabs
    document.querySelectorAll('.timeframe-controls .analytics-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const timeframe = btn.dataset.timeframe;
            
            // Update active button
            document.querySelectorAll('.timeframe-controls .analytics-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Determine which tab is active and load appropriate chart
            const activeTab = document.querySelector('.tab-content.active').id;
            
            if (activeTab === 'activity-overview') {
                reportersManager.loadReporterActivityAnalytics(timeframe);
            } else if (activeTab === 'individual-reporters') {
                loadReporterAnalytics(timeframe);
            } else if (activeTab === 'data-by-query-id') {
                loadQueryAnalytics(timeframe);
            } else if (activeTab === 'values') {
                loadValuesAnalytics(timeframe);
            } else if (activeTab === 'trusted-values') {
                loadTrustedValuesAnalytics(timeframe);
            } else if (activeTab === 'overlays') {
                loadOverlaysAnalytics(timeframe);
            }
        });
    });
    
    // Reporter Analytics timeframe buttons (for modal - keep for backward compatibility)
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