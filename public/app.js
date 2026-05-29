// CloudPulse - App Logic

// App State
let articles = [];
let activeProviderFilter = 'all';
let activeTags = new Set();
let searchQuery = '';
let currentSort = 'newest';
let currentTheme = localStorage.getItem('theme') || 'dark';

// DOM Elements
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearch');
const themeToggleBtn = document.getElementById('themeToggle');
const refreshBtn = document.getElementById('refreshBtn');
const articlesGrid = document.getElementById('articlesGrid');
const emptyState = document.getElementById('emptyState');
const resetFiltersBtn = document.getElementById('resetFiltersBtn');
const clearFiltersBtn = document.getElementById('clearFiltersBtn');
const activeFiltersContainer = document.getElementById('activeFilters');
const activeTagsList = document.getElementById('activeTagsList');
const sortSelect = document.getElementById('sortSelect');

// Dashboard Counters
const totalCount = document.getElementById('totalCount');
const newCount = document.getElementById('newCount');
const cacheTime = document.getElementById('cacheTime');
const awsDistBar = document.getElementById('awsDistBar');
const azureDistBar = document.getElementById('azureDistBar');
const gcpDistBar = document.getElementById('gcpDistBar');
const awsDistPct = document.getElementById('awsDistPct');
const azureDistPct = document.getElementById('azureDistPct');
const gcpDistPct = document.getElementById('gcpDistPct');

// Provider Tabs
const providerTabs = {
  all: document.getElementById('tab-all'),
  AWS: document.getElementById('tab-aws'),
  Azure: document.getElementById('tab-azure'),
  GCP: document.getElementById('tab-gcp')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  setupTheme();
  setupEventListeners();
  fetchBlogs();
});

// Setup Initial Theme
function setupTheme() {
  document.documentElement.setAttribute('data-theme', currentTheme);
}

// Setup Event Listeners
function setupEventListeners() {
  // Theme toggle
  themeToggleBtn.addEventListener('click', toggleTheme);

  // Search input listeners
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    clearSearchBtn.style.display = searchQuery ? 'block' : 'none';
    filterAndRender();
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    clearSearchBtn.style.display = 'none';
    searchInput.focus();
    filterAndRender();
  });

  // Tab filters
  Object.entries(providerTabs).forEach(([provider, btn]) => {
    if (btn) {
      btn.addEventListener('click', () => {
        // Update active tab styling
        Object.values(providerTabs).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        activeProviderFilter = provider;
        filterAndRender();
      });
    }
  });

  // Sorting
  sortSelect.addEventListener('change', (e) => {
    currentSort = e.target.value;
    filterAndRender();
  });

  // Refresh feed button
  refreshBtn.addEventListener('click', () => {
    fetchBlogs(true);
  });

  // Clear filters
  clearFiltersBtn.addEventListener('click', resetFilters);
  resetFiltersBtn.addEventListener('click', resetFilters);
}

// Toggle light/dark theme
function toggleTheme() {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', currentTheme);
  localStorage.setItem('theme', currentTheme);
}

// Reset all filters
function resetFilters() {
  searchInput.value = '';
  searchQuery = '';
  clearSearchBtn.style.display = 'none';
  
  activeTags.clear();
  activeProviderFilter = 'all';

  // Reset tab selection styling
  Object.entries(providerTabs).forEach(([provider, btn]) => {
    if (btn) {
      if (provider === 'all') btn.classList.add('active');
      else btn.classList.remove('active');
    }
  });

  filterAndRender();
}

// Fetch blogs from our Node server API
async function fetchBlogs(forceRefresh = false) {
  showSkeletons();
  refreshBtn.classList.add('loading');
  refreshBtn.disabled = true;

  const url = forceRefresh ? '/api/blogs?refresh=true' : '/api/blogs';

  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.success) {
      articles = data.articles;
      updateDashboard(data);
      filterAndRender();
    } else {
      showErrorState(data.message || 'Error loading articles');
    }
  } catch (error) {
    console.error('Error fetching blogs:', error);
    showErrorState('Failed to connect to the blog aggregator server.');
  } finally {
    refreshBtn.classList.remove('loading');
    refreshBtn.disabled = false;
  }
}

// Show skeleton loaders in the grid
function showSkeletons() {
  emptyState.classList.add('hidden');
  activeFiltersContainer.classList.add('hidden');
  
  articlesGrid.innerHTML = Array(6).fill().map(() => `
    <div class="card skeleton-card">
      <div class="skeleton skeleton-provider"></div>
      <div class="skeleton skeleton-title"></div>
      <div class="skeleton skeleton-title short"></div>
      <div class="skeleton skeleton-text"></div>
      <div class="skeleton skeleton-text"></div>
      <div class="skeleton skeleton-meta"></div>
    </div>
  `).join('');
}

// Render error message inside grid
function showErrorState(message) {
  articlesGrid.innerHTML = '';
  emptyState.classList.remove('hidden');
  emptyState.querySelector('h3').textContent = 'Error Loading Feeds';
  emptyState.querySelector('p').textContent = message;
}

// Update dashboard analytics widgets
function updateDashboard(data) {
  totalCount.textContent = articles.length;

  // Compute posts in last 48 hours
  const limitDate = new Date();
  limitDate.setHours(limitDate.getHours() - 48);
  const freshCount = articles.filter(art => new Date(art.date) >= limitDate).length;
  newCount.textContent = freshCount;

  // Format cache lastFetched time
  if (data.lastFetched) {
    const date = new Date(data.lastFetched);
    cacheTime.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    cacheTime.title = `Full timestamp: ${date.toLocaleString()}`;
  }

  // Compute provider distribution ratios
  const total = articles.length || 1;
  const awsCount = articles.filter(art => art.provider === 'AWS').length;
  const azureCount = articles.filter(art => art.provider === 'Azure').length;
  const gcpCount = articles.filter(art => art.provider === 'GCP').length;

  const awsPct = Math.round((awsCount / total) * 100);
  const azurePct = Math.round((azureCount / total) * 100);
  const gcpPct = Math.round((gcpCount / total) * 100);

  // Update layout bars and percentages
  awsDistBar.style.width = `${awsPct}%`;
  awsDistPct.textContent = `${awsPct}%`;
  awsDistPct.title = `${awsCount} posts`;

  azureDistBar.style.width = `${azurePct}%`;
  azureDistPct.textContent = `${azurePct}%`;
  azureDistPct.title = `${azureCount} posts`;

  gcpDistBar.style.width = `${gcpPct}%`;
  gcpDistPct.textContent = `${gcpPct}%`;
  gcpDistPct.title = `${gcpCount} posts`;
}

// Filter, Sort and Render articles
function filterAndRender() {
  // 1. Filter articles
  let filtered = articles.filter(art => {
    // Provider filter
    if (activeProviderFilter !== 'all' && art.provider !== activeProviderFilter) {
      return false;
    }

    // Search query filter (matches title, snippet, creator, provider or tags)
    if (searchQuery) {
      const matchText = `${art.title} ${art.snippet} ${art.author} ${art.provider}`.toLowerCase();
      const matchTags = art.tags.some(t => t.toLowerCase().includes(searchQuery));
      if (!matchText.includes(searchQuery) && !matchTags) {
        return false;
      }
    }

    // Tag filters (logical AND for selected tags)
    if (activeTags.size > 0) {
      const hasAllTags = Array.from(activeTags).every(tag => art.tags.includes(tag));
      if (!hasAllTags) {
        return false;
      }
    }

    return true;
  });

  // 2. Sort articles
  filtered.sort((a, b) => {
    if (currentSort === 'newest') {
      return new Date(b.date) - new Date(a.date);
    } else if (currentSort === 'oldest') {
      return new Date(a.date) - new Date(b.date);
    } else if (currentSort === 'title') {
      return a.title.localeCompare(b.title);
    }
    return 0;
  });

  // Update active filters bar
  renderActiveFiltersBar();

  // 3. Render HTML
  if (filtered.length === 0) {
    articlesGrid.innerHTML = '';
    emptyState.classList.remove('hidden');
    emptyState.querySelector('h3').textContent = 'No Articles Found';
    emptyState.querySelector('p').textContent = 'No matching blog posts found. Try adjusting your search keywords or active filters.';
  } else {
    emptyState.classList.add('hidden');
    articlesGrid.innerHTML = filtered.map(renderArticleCard).join('');

    // Attach click listeners to rendered tags dynamically
    document.querySelectorAll('.tag').forEach(tagEl => {
      tagEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const tag = e.target.getAttribute('data-tag');
        toggleTagFilter(tag);
      });
    });
  }
}

// Render active filter items in the helper toolbar
function renderActiveFiltersBar() {
  if (activeTags.size === 0) {
    activeFiltersContainer.classList.add('hidden');
    return;
  }

  activeFiltersContainer.classList.remove('hidden');
  activeTagsList.innerHTML = Array.from(activeTags).map(tag => `
    <span class="active-filter-tag">
      <span>${tag}</span>
      <button class="remove-tag-btn" data-tag="${tag}">&times;</button>
    </span>
  `).join('');

  // Attach delete click handlers
  activeTagsList.querySelectorAll('.remove-tag-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tag = e.target.getAttribute('data-tag');
      toggleTagFilter(tag);
    });
  });
}

// Add/remove a tag filter
function toggleTagFilter(tag) {
  if (activeTags.has(tag)) {
    activeTags.delete(tag);
  } else {
    activeTags.add(tag);
  }
  filterAndRender();
}

// Helper to format date relative (e.g. "2 hours ago" or "May 27")
function formatRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMs < 0 || diffSec < 60) {
    return 'Just now';
  } else if (diffMin < 60) {
    return `${diffMin}m ago`;
  } else if (diffHr < 24) {
    return `${diffHr}h ago`;
  } else if (diffDay < 7) {
    return `${diffDay}d ago`;
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  }
}

// Check if a post is "new" (published in the last 24h)
function isNewPost(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffHours = (now - date) / (1000 * 60 * 60);
  return diffHours <= 24;
}

// Render HTML for a single article card
function renderArticleCard(art) {
  const isNew = isNewPost(art.date);
  const formattedDate = formatRelativeTime(art.date);
  const providerClass = art.provider.toLowerCase();
  
  // Format initials for author avatar fallback
  const initials = art.author
    .split(' ')
    .slice(0, 2)
    .map(name => name[0])
    .join('')
    .toUpperCase() || 'U';

  const tagsHTML = art.tags.slice(0, 4).map(tag => `
    <span class="tag" data-tag="${tag}">#${tag}</span>
  `).join('');

  return `
    <article class="card glass-panel ${providerClass}" id="post-${art.id}">
      <div class="card-header">
        <span class="provider-badge">${art.provider}</span>
        <span class="pub-date" title="${new Date(art.date).toLocaleString()}">
          ${isNew ? '<span class="new-badge-dot" title="New post inside last 24h"></span>' : ''}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          ${formattedDate}
        </span>
      </div>
      
      <h4 class="card-title">
        <a href="${art.link}" target="_blank" rel="noopener noreferrer">${art.title}</a>
      </h4>

      <div class="card-author">
        <div class="author-avatar">${initials}</div>
        <span>${art.author}</span>
      </div>

      <p class="card-snippet">${art.snippet}</p>

      ${art.tags.length > 0 ? `<div class="card-tags">${tagsHTML}</div>` : ''}
    </article>
  `;
}
