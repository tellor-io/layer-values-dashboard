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
    totalReporterPower: document.getElementById('total-reporter-power'),
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
    analyticsLoading: document.getElementById('analytics-loading')
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

// Event listeners
document.addEventListener('DOMContentLoaded', async () => {
    // Set and display load time
    updateLoadTime();
    
    // Initial load
    await loadStats();
    await loadData();
    
    // Analytics card click
    elements.recentActivityCard.addEventListener('click', showAnalyticsModal);
    
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
    
    // Analytics timeframe buttons
    document.querySelectorAll('.analytics-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const timeframe = btn.dataset.timeframe;
            loadAnalytics(timeframe);
        });
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideModal();
            hideAnalyticsModal();
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