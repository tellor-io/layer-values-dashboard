// POLYFILLS FOR OLDER MOBILE BROWSERS -----------------------------
if (typeof AbortController === 'undefined') {
    console.warn('AbortController not supported – using fallback stub.');
    window.AbortController = function() { return { abort: () => {}, signal: undefined }; };
}

if (typeof URLSearchParams === 'undefined') {
    console.warn('URLSearchParams not supported – polyfilling.');
    window.URLSearchParams = function(init) {
        this.params = [];
        if (init && typeof init === 'object') {
            for (const key in init) {
                this.params.push(`${encodeURIComponent(key)}=${encodeURIComponent(init[key])}`);
            }
        } else if (typeof init === 'string') {
            this.params = [init];
        }
        this.append = (k, v) => this.params.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
        this.toString = () => this.params.join('&');
    };
}

if (typeof window.fetch === 'undefined') {
    console.warn('fetch API not supported – using XHR polyfill.');
    window.fetch = function(url, options = {}) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open(options.method || 'GET', typeof url === 'string' ? url : url.toString(), true);
            for (const h in (options.headers || {})) {
                xhr.setRequestHeader(h, options.headers[h]);
            }
            xhr.onload = () => {
                const body = 'response' in xhr ? xhr.response : xhr.responseText;
                resolve({
                    ok: xhr.status >= 200 && xhr.status < 300,
                    status: xhr.status,
                    statusText: xhr.statusText,
                    text: () => Promise.resolve(body),
                    json: () => {
                        try { return Promise.resolve(JSON.parse(body)); } catch(e) { return Promise.reject(e); }
                    }
                });
            };
            xhr.onerror = () => reject(new TypeError('Network request failed'));
            xhr.send(options.body || null);
        });
    };
}
// ----------------------------------------------------------------

// Global state for search page
let currentSearchQuery = '';
let currentPage = 1;
let searchResults = [];
let searchStats = {};
let isLoading = false;

// Configuration
const RECORDS_PER_PAGE = 100;
let API_BASE = '/dashboard-palmito'; // Default, will be updated from backend config

// DOM elements
const elements = {
    // Search elements
    searchTermDisplay: document.getElementById('search-term-display'),
    newSearchInput: document.getElementById('new-search-input'),
    newSearchBtn: document.getElementById('new-search-btn'),
    refreshSearch: document.getElementById('refresh-search'),
    
    // Summary stats
    totalMatches: document.getElementById('total-matches'),
    uniqueReportersMatches: document.getElementById('unique-reporters-matches'),
    uniqueQueryIdsMatches: document.getElementById('unique-query-ids-matches'),
    valueRange: document.getElementById('value-range'),
    
    // Insights
    searchInsights: document.getElementById('search-insights'),
    insightsGrid: document.getElementById('insights-grid'),
    
    // Results table
    searchResultsTable: document.getElementById('search-results-table'),
    searchResultsTbody: document.getElementById('search-results-tbody'),
    showingCount: document.getElementById('showing-count'),
    searchTimestamp: document.getElementById('search-timestamp'),
    
    // Pagination
    prevPage: document.getElementById('prev-page'),
    nextPage: document.getElementById('next-page'),
    currentPageSpan: document.getElementById('current-page'),
    totalPages: document.getElementById('total-pages'),
    
    // Modal and loading
    loadingOverlay: document.getElementById('loading-overlay'),
    detailModal: document.getElementById('detail-modal'),
    modalClose: document.getElementById('modal-close'),
    modalBody: document.getElementById('modal-body'),
    exportResults: document.getElementById('export-results')
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
    
    const timestampMs = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
    const currentTimeMs = Date.now();
    const diffMs = currentTimeMs - timestampMs;
    
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

// Initialize configuration from backend
const initializeConfig = async () => {
    try {
        // Use the default API_BASE to fetch configuration
        const url = new URL(`${API_BASE}/api/info`, window.location.origin);
        const response = await fetch(url);
        if (response.ok) {
            const info = await response.json();
            if (info.mount_path) {
                API_BASE = info.mount_path;
                console.log(`📊 Search API_BASE updated to: ${API_BASE}`);
            }
        }
    } catch (error) {
        console.warn('Failed to load configuration, using default API_BASE:', error);
    }
};

// API call function
const apiCall = async (endpoint, params = {}) => {
    try {
        const url = new URL(`${API_BASE}${endpoint}`, window.location.origin);
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

// Search functionality
const performSearch = async (query, page = 1) => {
    if (!query.trim()) {
        alert('Please enter a search term');
        return;
    }

    showLoading();
    currentSearchQuery = query;
    currentPage = page;

    try {
        // Update search term display
        elements.searchTermDisplay.textContent = query;
        
        // Update URL without reloading
        const url = new URL(window.location);
        url.searchParams.set('q', query);
        url.searchParams.set('page', page);
        window.history.pushState({}, '', url);

        // Search API call
        const searchResponse = await apiCall('/api/search', {
            q: query,
            limit: RECORDS_PER_PAGE,
            offset: (page - 1) * RECORDS_PER_PAGE
        });

        searchResults = searchResponse.data || [];
        searchStats = searchResponse.stats || {};

        // Update summary stats
        updateSummaryStats();
        
        // Generate insights
        generateSearchInsights();
        
        // Render results
        renderSearchResults();
        
        // Update pagination
        updatePagination();
        
        // Update timestamp
        elements.searchTimestamp.textContent = new Date().toLocaleString();

    } catch (error) {
        console.error('Search failed:', error);
        alert('Search failed. Please try again.');
    } finally {
        hideLoading();
    }
};

// Update summary statistics
const updateSummaryStats = () => {
    elements.totalMatches.textContent = formatNumber(searchStats.total_matches || 0);
    elements.uniqueReportersMatches.textContent = formatNumber(searchStats.unique_reporters || 0);
    elements.uniqueQueryIdsMatches.textContent = formatNumber(searchStats.unique_query_ids || 0);
    
    if (searchStats.value_range) {
        const min = formatValue(searchStats.value_range.min);
        const max = formatValue(searchStats.value_range.max);
        elements.valueRange.textContent = `${min} - ${max}`;
    } else {
        elements.valueRange.textContent = '-';
    }
};

// Generate search insights
const generateSearchInsights = () => {
    const insights = [];
    
    if (searchStats.total_matches > 0) {
        // Most common reporter
        if (searchStats.top_reporter) {
            insights.push({
                title: 'Most Active Reporter',
                value: `${truncateText(searchStats.top_reporter.reporter, 15)} (${searchStats.top_reporter.count} matches)`
            });
        }
        
        // Most common query ID
        if (searchStats.top_query_id) {
            insights.push({
                title: 'Most Common Query ID',
                value: `${searchStats.top_query_id.query_id} (${searchStats.top_query_id.count} matches)`
            });
        }
        
        // Average agreement
        if (searchStats.avg_agreement !== undefined) {
            insights.push({
                title: 'Average Agreement',
                value: `${(searchStats.avg_agreement * 100).toFixed(1)}%`
            });
        }
        
        // Time range
        if (searchStats.time_range) {
            insights.push({
                title: 'Time Range',
                value: `${formatTimeAgo(searchStats.time_range.oldest)} to ${formatTimeAgo(searchStats.time_range.newest)}`
            });
        }
        
        // Power distribution
        if (searchStats.power_stats) {
            insights.push({
                title: 'Total Power Involved',
                value: formatValue(searchStats.power_stats.total)
            });
        }
    }
    
    if (insights.length > 0) {
        elements.insightsGrid.innerHTML = insights.map(insight => `
            <div class="insight-card">
                <div class="insight-title">${insight.title}</div>
                <div class="insight-value">${insight.value}</div>
            </div>
        `).join('');
        elements.searchInsights.style.display = 'block';
    } else {
        elements.searchInsights.style.display = 'none';
    }
};

// Format agreement percentage and class
const formatAgreement = (reportedValue, trustedValue) => {
    if (reportedValue === null || trustedValue === null || reportedValue === undefined || trustedValue === undefined) {
        return { text: 'N/A', class: 'agreement-na' };
    }

    if (reportedValue === trustedValue) {
        return { text: '100%', class: 'agreement-perfect' };
    }

    const diff = Math.abs(reportedValue - trustedValue);
    const avg = (Math.abs(reportedValue) + Math.abs(trustedValue)) / 2;
    
    if (avg === 0) {
        return reportedValue === trustedValue ? 
            { text: '100%', class: 'agreement-perfect' } : 
            { text: '0%', class: 'agreement-poor' };
    }

    const agreement = Math.max(0, 100 * (1 - diff / avg));
    
    let agreementClass;
    if (agreement >= 95) agreementClass = 'agreement-perfect';
    else if (agreement >= 80) agreementClass = 'agreement-good';
    else if (agreement >= 60) agreementClass = 'agreement-moderate';
    else agreementClass = 'agreement-poor';

    return { text: `${agreement.toFixed(1)}%`, class: agreementClass };
};

// Render search results table
const renderSearchResults = () => {
    if (!searchResults || searchResults.length === 0) {
        elements.searchResultsTbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center">
                    <div style="padding: 2rem; color: #666;">
                        <i class="fas fa-search" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
                        No results found for "${currentSearchQuery}"
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    elements.searchResultsTbody.innerHTML = searchResults.map(row => {
        const agreement = formatAgreement(row.VALUE, row.TRUSTED_VALUE);
        
        return `
            <tr>
                <td>
                    <button class="action-btn" onclick="showDetails(${JSON.stringify(row).replace(/"/g, '&quot;')})">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
                <td class="font-mono">${truncateText(row.QUERY_ID, 8)}</td>
                <td class="font-mono">${formatValue(row.VALUE)}</td>
                <td class="font-mono">${formatValue(row.TRUSTED_VALUE)}</td>
                <td class="agreement ${agreement.class}">${agreement.text}</td>
                <td class="reporter">${truncateText(row.REPORTER, 12)}</td>
                <td class="text-right">${formatValue(row.POWER)}</td>
                <td class="time-ago">${formatTimeAgo(row.TIMESTAMP)}</td>
                <td>
                    <span class="badge ${row.DISPUTABLE ? 'badge-danger' : 'badge-success'}">
                        ${row.DISPUTABLE ? 'Yes' : 'No'}
                    </span>
                </td>
            </tr>
        `;
    }).join('');
};

// Show detailed view
const showDetails = (row) => {
    const agreement = formatAgreement(row.VALUE, row.TRUSTED_VALUE);
    
    elements.modalBody.innerHTML = `
        <div class="detail-grid">
            <div class="detail-item">
                <span class="detail-label">Transaction Hash</span>
                <span class="detail-value font-mono">${row.TX_HASH || 'N/A'}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Query ID</span>
                <span class="detail-value font-mono">${row.QUERY_ID || 'N/A'}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Query Type</span>
                <span class="detail-value">${row.QUERY_TYPE || 'N/A'}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Reported Value</span>
                <span class="detail-value font-mono">${formatValue(row.VALUE)}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Trusted Value</span>
                <span class="detail-value font-mono">${formatValue(row.TRUSTED_VALUE)}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Agreement</span>
                <span class="detail-value agreement ${agreement.class}">${agreement.text}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Reporter</span>
                <span class="detail-value font-mono">${row.REPORTER || 'N/A'}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Power</span>
                <span class="detail-value">${formatValue(row.POWER)}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Timestamp</span>
                <span class="detail-value">${formatTimestamp(row.TIMESTAMP * 1000)}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Time Ago</span>
                <span class="detail-value">${formatTimeAgo(row.TIMESTAMP)}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Disputable</span>
                <span class="detail-value">
                    <span class="badge ${row.DISPUTABLE ? 'badge-danger' : 'badge-success'}">
                        ${row.DISPUTABLE ? 'Yes' : 'No'}
                    </span>
                </span>
            </div>
        </div>
    `;
    
    elements.detailModal.classList.add('show');
};

// Update pagination
const updatePagination = () => {
    const total = searchStats.total_matches || 0;
    const totalPages = Math.max(1, Math.ceil(total / RECORDS_PER_PAGE));
    
    elements.currentPageSpan.textContent = currentPage;
    elements.totalPages.textContent = totalPages;
    
    elements.prevPage.disabled = currentPage <= 1;
    elements.nextPage.disabled = currentPage >= totalPages;
    
    const start = ((currentPage - 1) * RECORDS_PER_PAGE) + 1;
    const end = Math.min(currentPage * RECORDS_PER_PAGE, total);
    elements.showingCount.textContent = total > 0 ? `${start}-${end} of ${formatNumber(total)}` : '0 of 0';
};

// Initialize page
const initializePage = async () => {
    // Initialize configuration first
    await initializeConfig();
    
    // Get search query from URL
    const urlParams = new URLSearchParams(window.location.search);
    const query = urlParams.get('q');
    const page = parseInt(urlParams.get('page')) || 1;
    
    if (query) {
        elements.newSearchInput.value = query;
        performSearch(query, page);
    } else {
        // Redirect to dashboard if no search query
        window.location.href = API_BASE;
    }
};

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    initializePage();
    
    // Search functionality
    elements.newSearchBtn.addEventListener('click', () => {
        const query = elements.newSearchInput.value.trim();
        if (query) {
            performSearch(query, 1);
        }
    });
    
    elements.newSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const query = elements.newSearchInput.value.trim();
            if (query) {
                performSearch(query, 1);
            }
        }
    });
    
    // Refresh search
    elements.refreshSearch.addEventListener('click', () => {
        if (currentSearchQuery) {
            performSearch(currentSearchQuery, currentPage);
        }
    });
    
    // Pagination
    elements.prevPage.addEventListener('click', () => {
        if (currentPage > 1) {
            performSearch(currentSearchQuery, currentPage - 1);
        }
    });
    
    elements.nextPage.addEventListener('click', () => {
        const totalPages = Math.ceil((searchStats.total_matches || 0) / RECORDS_PER_PAGE);
        if (currentPage < totalPages) {
            performSearch(currentSearchQuery, currentPage + 1);
        }
    });
    
    // Modal functionality
    elements.modalClose.addEventListener('click', () => {
        elements.detailModal.classList.remove('show');
    });
    
    elements.detailModal.addEventListener('click', (e) => {
        if (e.target === elements.detailModal) {
            elements.detailModal.classList.remove('show');
        }
    });
    
    // Export functionality (placeholder)
    elements.exportResults.addEventListener('click', () => {
        if (searchResults.length === 0) {
            alert('No results to export');
            return;
        }
        
        // Create CSV content
        const headers = ['Query ID', 'Reported Value', 'Trusted Value', 'Agreement', 'Reporter', 'Power', 'Timestamp', 'Disputable'];
        const csvContent = [
            headers.join(','),
            ...searchResults.map(row => {
                const agreement = formatAgreement(row.VALUE, row.TRUSTED_VALUE);
                return [
                    row.QUERY_ID,
                    row.VALUE,
                    row.TRUSTED_VALUE,
                    agreement.text,
                    row.REPORTER,
                    row.POWER,
                    new Date(row.TIMESTAMP * 1000).toISOString(),
                    row.DISPUTABLE ? 'Yes' : 'No'
                ].join(',');
            })
        ].join('\n');
        
        // Download CSV
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `search_results_${currentSearchQuery}_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    });
});

// Make showDetails available globally
window.showDetails = showDetails; 