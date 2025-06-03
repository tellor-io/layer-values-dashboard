// Global state
let currentPage = 1;
let currentFilters = {};
let isLoading = false;
let totalRecords = 0;
let pageLoadTime = new Date(); // Store page load time

// Configuration
const RECORDS_PER_PAGE = 100;
const API_BASE = '/dashboard';

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
    
    // Search and filters
    searchInput: document.getElementById('search-input'),
    searchBtn: document.getElementById('search-btn'),
    filterReporter: document.getElementById('filter-reporter'),
    filterQueryType: document.getElementById('filter-query-type'),
    filterQueryId: document.getElementById('filter-query-id'),
    applyFilters: document.getElementById('apply-filters'),
    clearFilters: document.getElementById('clear-filters'),
    
    // Data table
    dataTable: document.getElementById('data-table'),
    dataTbody: document.getElementById('data-tbody'),
    showingInfo: document.getElementById('showing-info'),
    refreshData: document.getElementById('refresh-data'),
    
    // Pagination
    prevPage: document.getElementById('prev-page'),
    nextPage: document.getElementById('next-page'),
    currentPageSpan: document.getElementById('current-page'),
    totalPages: document.getElementById('total-pages'),
    
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
    powerInfo: document.getElementById('power-info')
};

// Utility functions
const formatNumber = (num) => {
    if (num === null || num === undefined) return '-';
    return new Intl.NumberFormat().format(num);
};

const formatValue = (value) => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'number') {
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 6
        }).format(value);
    }
    return value;
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

// API functions
const apiCall = async (endpoint, params = {}) => {
    try {
        const url = new URL(`${API_BASE}/api${endpoint}`, window.location.origin);
        Object.keys(params).forEach(key => {
            if (params[key] !== null && params[key] !== undefined && params[key] !== '') {
                url.searchParams.append(key, params[key]);
            }
        });
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('API call failed:', error);
        throw error;
    }
};

const loadStats = async () => {
    try {
        const [info, stats] = await Promise.all([
            apiCall('/info'),
            apiCall('/stats')
        ]);
        
        // Update header stats
        elements.totalRecords.textContent = formatNumber(info.total_rows);
        
        // Update stats cards
        elements.uniqueReporters.textContent = formatNumber(stats.unique_reporters);
        elements.uniqueQueryIds30d.textContent = formatNumber(stats.unique_query_ids_30d);
        elements.totalReporterPower.textContent = stats.total_reporter_power ? formatValue(stats.total_reporter_power) : '-';
        elements.recentActivity.textContent = formatNumber(stats.recent_activity);
        
        // Update questionable values
        if (stats.questionable_values) {
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
        
        // Populate filter dropdowns
        if (stats.query_types) {
            elements.filterQueryType.innerHTML = '<option value="">All Types</option>';
            stats.query_types.forEach(type => {
                const option = document.createElement('option');
                option.value = type.QUERY_TYPE;
                option.textContent = `${type.QUERY_TYPE} (${type.count})`;
                elements.filterQueryType.appendChild(option);
            });
        }
        
        // Populate reporter dropdown
        if (stats.top_reporters) {
            elements.filterReporter.innerHTML = '<option value="">All Reporters</option>';
            stats.top_reporters.forEach(reporter => {
                const option = document.createElement('option');
                option.value = reporter.REPORTER;
                const shortReporter = reporter.REPORTER.length > 20 
                    ? reporter.REPORTER.substring(0, 20) + '...' 
                    : reporter.REPORTER;
                option.textContent = `${shortReporter} (${reporter.count})`;
                option.title = reporter.REPORTER; // Full address on hover
                elements.filterReporter.appendChild(option);
            });
        }
        
        // Populate query ID dropdown
        if (stats.top_query_ids) {
            elements.filterQueryId.innerHTML = '<option value="">All Query IDs</option>';
            stats.top_query_ids.forEach(queryId => {
                const option = document.createElement('option');
                option.value = queryId.QUERY_ID;
                const shortQueryId = queryId.QUERY_ID.length > 30 
                    ? queryId.QUERY_ID.substring(0, 30) + '...' 
                    : queryId.QUERY_ID;
                option.textContent = `${shortQueryId} (${queryId.count})`;
                option.title = queryId.QUERY_ID; // Full query ID on hover
                elements.filterQueryId.appendChild(option);
            });
        }
        
        totalRecords = stats.total_rows;
        
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
};

const loadData = async (page = 1, filters = {}) => {
    showLoading();
    
    try {
        const params = {
            limit: RECORDS_PER_PAGE,
            offset: (page - 1) * RECORDS_PER_PAGE,
            ...filters
        };
        
        const response = await apiCall('/data', params);
        
        // Update table
        renderTable(response.data);
        
        // Update pagination
        const totalPages = Math.ceil(response.total / RECORDS_PER_PAGE);
        updatePagination(page, totalPages, response.total, response.offset);
        
        currentPage = page;
        
    } catch (error) {
        console.error('Failed to load data:', error);
        elements.dataTbody.innerHTML = '<tr><td colspan="7" class="text-center text-red">Failed to load data</td></tr>';
    } finally {
        hideLoading();
    }
};

const searchData = async (query) => {
    if (!query.trim()) {
        await loadData(1, currentFilters);
        return;
    }
    
    showLoading();
    
    try {
        const response = await apiCall('/search', { q: query.trim() });
        
        // Update table with search results
        renderTable(response.results);
        
        // Update pagination info for search
        elements.showingInfo.textContent = `Found ${response.count} results for "${query}"`;
        elements.prevPage.disabled = true;
        elements.nextPage.disabled = true;
        elements.currentPageSpan.textContent = '1';
        elements.totalPages.textContent = '1';
        
    } catch (error) {
        console.error('Search failed:', error);
        elements.dataTbody.innerHTML = '<tr><td colspan="7" class="text-center text-red">Search failed</td></tr>';
    } finally {
        hideLoading();
    }
};

const renderTable = (data) => {
    if (!data || data.length === 0) {
        elements.dataTbody.innerHTML = '<tr><td colspan="7" class="text-center text-gray">No data found</td></tr>';
        return;
    }
    
    elements.dataTbody.innerHTML = data.map(row => `
        <tr>
            <td>
                <button class="action-btn" onclick="showDetails(${JSON.stringify(row).replace(/"/g, '&quot;')})">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
            <td class="hash" title="${row.QUERY_ID}">${row.QUERY_ID}</td>
            <td class="value">${formatValue(row.VALUE)}</td>
            <td class="reporter" title="${row.REPORTER}">${row.REPORTER}</td>
            <td class="text-center">${formatNumber(row.POWER)}</td>
            <td class="text-center time-ago">${formatTimeAgo(row.TIMESTAMP)}</td>
            <td class="text-center">
                <span class="badge ${row.DISPUTABLE ? 'badge-danger' : 'badge-success'}">
                    ${row.DISPUTABLE ? 'Yes' : 'No'}
                </span>
            </td>
        </tr>
    `).join('');
};

const updatePagination = (page, totalPages, total, offset) => {
    elements.currentPageSpan.textContent = page;
    elements.totalPages.textContent = totalPages;
    
    const start = offset + 1;
    const end = Math.min(offset + RECORDS_PER_PAGE, total);
    elements.showingInfo.textContent = `Showing ${start}-${end} of ${formatNumber(total)} records`;
    
    elements.prevPage.disabled = page <= 1;
    elements.nextPage.disabled = page >= totalPages;
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
    // Clear search input and existing filters
    elements.searchInput.value = '';
    elements.filterReporter.value = '';
    elements.filterQueryType.value = '';
    elements.filterQueryId.value = '';
    
    // Set up questionable filter
    currentFilters = { questionable_only: true };
    currentPage = 1;
    
    // Load data with questionable filter
    await loadData(currentPage, currentFilters);
};

// Analytics functionality
let analyticsChart = null;

const showAnalyticsModal = () => {
    elements.analyticsModal.classList.add('show');
    loadAnalytics('hourly'); // Default to hourly view
};

const hideAnalyticsModal = () => {
    elements.analyticsModal.classList.remove('show');
    if (analyticsChart) {
        analyticsChart.destroy();
        analyticsChart = null;
    }
};

const loadAnalytics = async (timeframe) => {
    try {
        // Show loading
        elements.analyticsLoading.style.display = 'flex';
        
        // Update active button
        document.querySelectorAll('.analytics-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.timeframe === timeframe) {
                btn.classList.add('active');
            }
        });
        
        // Fetch analytics data
        const data = await apiCall('/analytics', { timeframe });
        
        // Update title
        elements.analyticsTitle.textContent = data.title;
        
        // Create or update chart
        createAnalyticsChart(data);
        
    } catch (error) {
        console.error('Failed to load analytics:', error);
        elements.analyticsTitle.textContent = 'Failed to load analytics';
    } finally {
        // Hide loading
        elements.analyticsLoading.style.display = 'none';
    }
};

const createAnalyticsChart = (data) => {
    const ctx = elements.analyticsChart.getContext('2d');
    
    // Destroy existing chart
    if (analyticsChart) {
        analyticsChart.destroy();
    }
    
    // Prepare data for Chart.js
    const labels = data.data.map(item => item.time_label);
    const counts = data.data.map(item => item.count);
    
    // Create gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(0, 255, 136, 0.3)');
    gradient.addColorStop(1, 'rgba(0, 255, 136, 0.05)');
    
    analyticsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Reports',
                data: counts,
                borderColor: '#00ff88',
                backgroundColor: gradient,
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#00ff88',
                pointBorderColor: '#000',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#00d4ff',
                        maxTicksLimit: data.timeframe === 'weekly' ? 8 : 12,
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
            tension: 0.4,
            pointBackgroundColor: colors[index],
            pointBorderColor: '#000',
            pointBorderWidth: 1,
            pointRadius: 3,
            pointHoverRadius: 5,
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
            tension: 0.4,
            pointBackgroundColor: colors[index],
            pointBorderColor: '#000',
            pointBorderWidth: 1,
            pointRadius: 3,
            pointHoverRadius: 5,
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
            <span class="info-label">Total Power:</span>
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

// Event listeners
document.addEventListener('DOMContentLoaded', async () => {
    // Set and display load time
    updateLoadTime();
    
    // Initial load
    await loadStats();
    await loadData();
    
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
    
    // Search functionality
    elements.searchBtn.addEventListener('click', () => {
        const query = elements.searchInput.value;
        searchData(query);
    });
    
    elements.searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const query = elements.searchInput.value;
            searchData(query);
        }
    });
    
    // Filter functionality
    elements.applyFilters.addEventListener('click', () => {
        currentFilters = {
            reporter: elements.filterReporter.value,
            query_type: elements.filterQueryType.value,
            query_id: elements.filterQueryId.value
        };
        
        // Remove empty filters
        Object.keys(currentFilters).forEach(key => {
            if (!currentFilters[key]) {
                delete currentFilters[key];
            }
        });
        
        currentPage = 1;
        loadData(currentPage, currentFilters);
    });
    
    elements.clearFilters.addEventListener('click', () => {
        elements.filterReporter.value = '';
        elements.filterQueryType.value = '';
        elements.filterQueryId.value = '';
        
        currentFilters = {};
        currentPage = 1;
        loadData(currentPage, currentFilters);
    });
    
    // Pagination
    elements.prevPage.addEventListener('click', () => {
        if (currentPage > 1) {
            loadData(currentPage - 1, currentFilters);
        }
    });
    
    elements.nextPage.addEventListener('click', () => {
        loadData(currentPage + 1, currentFilters);
    });
    
    // Refresh button
    elements.refreshData.addEventListener('click', () => {
        // Update load time when refreshing
        pageLoadTime = new Date();
        updateLoadTime();
        
        // Refresh data and stats
        loadStats();
        loadData(currentPage, currentFilters);
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
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideModal();
            hideAnalyticsModal();
            hideQueryAnalyticsModal();
            hideReporterAnalyticsModal();
            hidePowerAnalyticsModal();
        }
        
        if (e.ctrlKey || e.metaKey) {
            switch (e.key) {
                case 'k':
                    e.preventDefault();
                    elements.searchInput.focus();
                    break;
                case 'r':
                    e.preventDefault();
                    // Update load time when refreshing via keyboard
                    pageLoadTime = new Date();
                    updateLoadTime();
                    loadStats();
                    loadData(currentPage, currentFilters);
                    break;
            }
        }
    });
});

// Make showDetails available globally
window.showDetails = showDetails;