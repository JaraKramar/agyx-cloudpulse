import express from 'express';
import cors from 'cors';
import Parser from 'rss-parser';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const parser = new Parser();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Cache storage
let blogCache = {
  data: null,
  lastFetched: 0
};
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

const FEEDS = [
  {
    provider: 'AWS',
    url: 'https://aws.amazon.com/blogs/aws/feed/',
    defaultAuthor: 'AWS Blog Contributors'
  },
  {
    provider: 'Azure',
    url: 'https://azure.microsoft.com/en-us/blog/feed/',
    defaultAuthor: 'Microsoft Azure Team'
  },
  {
    provider: 'GCP',
    url: 'https://blog.google/products/google-cloud/rss/',
    defaultAuthor: 'Google Cloud Team'
  }
];

// Standardize single RSS item
function standardizeItem(item, provider, defaultAuthor) {
  // Extract author name
  let author = defaultAuthor;
  if (typeof item.creator === 'string' && item.creator.trim().length > 0) {
    author = item.creator.trim();
  } else if (item.creator && typeof item.creator === 'object') {
    // GCP uses an object format for creator
    const name = item.creator.name;
    if (Array.isArray(name) && name[0]) {
      author = name[0].trim();
    } else if (typeof name === 'string' && name.trim().length > 0) {
      author = name.trim();
    }
  } else if (typeof item.author === 'string' && item.author.trim().length > 0) {
    author = item.author.trim();
  } else if (typeof item['dc:creator'] === 'string' && item['dc:creator'].trim().length > 0) {
    author = item['dc:creator'].trim();
  }

  // Extract content snippet
  let snippet = item.contentSnippet || item.content || '';
  // Clean snippet: limit length and remove trailing ellipsis or brackets if needed
  if (snippet.length > 280) {
    snippet = snippet.slice(0, 280) + '...';
  }

  // Parse and format date
  const dateStr = item.isoDate || item.pubDate;
  const isoDate = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString();

  // Extract and clean tags
  const rawTags = item.categories || [];
  const tags = rawTags
    .map(tag => {
      if (typeof tag === 'string') return tag.trim();
      if (tag && typeof tag === 'object' && tag._) return tag._.trim(); // Handle object tags
      return null;
    })
    .filter(Boolean);

  // Generate clean unique ID
  const id = item.guid || item.id || item.link || Math.random().toString(36).substring(2, 11);

  return {
    id,
    provider,
    title: item.title || 'Untitled Post',
    link: item.link || '#',
    date: isoDate,
    author,
    tags,
    snippet
  };
}

// Fetch all feeds and combine
async function fetchAllFeeds() {
  console.log(`[${new Date().toISOString()}] Fetching fresh feeds...`);
  const promises = FEEDS.map(async (feed) => {
    try {
      const response = await parser.parseURL(feed.url);
      const items = response.items || [];
      return items.map(item => standardizeItem(item, feed.provider, feed.defaultAuthor));
    } catch (error) {
      console.error(`Error fetching/parsing feed for ${feed.provider}:`, error.message);
      return []; // Return empty list on failure for resilience
    }
  });

  const results = await Promise.allSettled(promises);
  const allArticles = results.flatMap((res, index) => {
    if (res.status === 'fulfilled') {
      return res.value;
    } else {
      console.error(`Promise rejected for feed index ${index}:`, res.reason);
      return [];
    }
  });

  // Sort articles by date descending
  allArticles.sort((a, b) => new Date(b.date) - new Date(a.date));

  return allArticles;
}

// API endpoint to get blogs
app.get('/api/blogs', async (req, res) => {
  const forceRefresh = req.query.refresh === 'true';
  const now = Date.now();

  try {
    if (forceRefresh || !blogCache.data || (now - blogCache.lastFetched) > CACHE_DURATION) {
      const data = await fetchAllFeeds();
      blogCache = {
        data,
        lastFetched: now
      };
    }
    
    // Return cache metadata alongside posts
    res.json({
      success: true,
      lastFetched: new Date(blogCache.lastFetched).toISOString(),
      cacheRemaining: Math.max(0, CACHE_DURATION - (Date.now() - blogCache.lastFetched)),
      articles: blogCache.data
    });
  } catch (error) {
    console.error('Server endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve blog articles',
      error: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
