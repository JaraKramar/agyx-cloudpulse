import express from 'express';
import cors from 'cors';
import Parser from 'rss-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import * as cheerio from 'cheerio';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const parser = new Parser();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize SQLite database
const db = new sqlite3.Database(path.join(__dirname, 'cloudpulse.db'));

// Promisify SQLite methods
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) {
    if (err) reject(err);
    else resolve(this);
  });
});

const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) reject(err);
    else resolve(rows);
  });
});

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) reject(err);
    else resolve(row);
  });
});

// Setup schema and seed initial feeds
async function initDatabase() {
  // Create feeds table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL, -- 'rss' or 'scrape'
      selector TEXT,       -- CSS selector for HTML page scraping
      provider TEXT NOT NULL, -- 'AWS', 'Azure', 'GCP', 'Other'
      active INTEGER DEFAULT 1
    )
  `);

  // Create articles table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      title TEXT NOT NULL,
      link TEXT UNIQUE NOT NULL,
      date TEXT NOT NULL,
      author TEXT,
      tags TEXT, -- Comma-separated tags
      snippet TEXT,
      feed_id INTEGER REFERENCES feeds(id) ON DELETE CASCADE
    )
  `);

  // Seed default feeds
  const defaultFeeds = [
    {
      name: 'AWS News Blog',
      url: 'https://aws.amazon.com/blogs/aws/feed/',
      type: 'rss',
      selector: null,
      provider: 'AWS'
    },
    {
      name: 'Microsoft Azure Blog',
      url: 'https://azure.microsoft.com/en-us/blog/feed/',
      type: 'rss',
      selector: null,
      provider: 'Azure'
    },
    {
      name: 'Google Cloud Blog',
      url: 'https://blog.google/products/google-cloud/rss/',
      type: 'rss',
      selector: null,
      provider: 'GCP'
    }
  ];

  for (const feed of defaultFeeds) {
    await dbRun(`
      INSERT OR IGNORE INTO feeds (name, url, type, selector, provider)
      VALUES (?, ?, ?, ?, ?)
    `, [feed.name, feed.url, feed.type, feed.selector, feed.provider]);
  }
  console.log('Database initialized successfully.');
}

// Database will be initialized upon starting the server at the bottom of the file

// Scraper logic for custom HTML web pages
async function scrapeHtmlPage(feed) {
  const articles = [];
  try {
    const res = await fetch(feed.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    if (!res.ok) throw new Error(`HTTP status ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    // If selector is not provided, use default generic selectors
    const selector = feed.selector || 'article, .post, .card, li.item';
    
    $(selector).each((idx, el) => {
      // Find link
      let link = $(el).find('a').first().attr('href') || $(el).attr('href');
      if (!link) return;

      // Resolve relative link
      try {
        link = new URL(link, feed.url).href;
      } catch {
        return; // Ignore invalid URLs
      }

      // Find title
      let title = $(el).find('h1, h2, h3, h4, .title, a').first().text().trim() || $(el).text().split('\n')[0].trim();
      if (!title || title.length < 5) return;
      if (title.length > 150) title = title.slice(0, 150) + '...';

      // Find snippet / summary
      let snippet = $(el).find('p, .summary, .description, .snippet').first().text().trim() || $(el).text().replace(/\s+/g, ' ').slice(0, 200).trim();
      if (snippet.length > 280) snippet = snippet.slice(0, 280) + '...';

      // Determine date (default to now if missing)
      let date = new Date().toISOString();
      const dateText = $(el).find('time, .date, .meta').first().text().trim() || $(el).text().match(/\b\d{1,2}\s+[A-Za-z]{3,10}\s+\d{4}\b/)?.[0];
      if (dateText) {
        const parsed = Date.parse(dateText);
        if (!isNaN(parsed)) {
          date = new Date(parsed).toISOString();
        }
      }

      // Determine author
      let author = $(el).find('.author, .byline').first().text().trim() || feed.name;
      if (author.length > 50) author = author.slice(0, 50);

      // Clean title if it contains extra spacing
      title = title.replace(/\s+/g, ' ');

      const id = crypto.createHash('sha1').update(link).digest('hex');

      articles.push({
        id,
        provider: feed.provider,
        title,
        link,
        date,
        author,
        tags: [feed.provider],
        snippet,
        feed_id: feed.id
      });
    });
  } catch (error) {
    console.error(`Error scraping web page ${feed.name}:`, error.message);
  }
  return articles;
}

// RSS Parser wrapper
async function parseRssFeed(feed) {
  const articles = [];
  try {
    const response = await parser.parseURL(feed.url);
    const items = response.items || [];
    for (const item of items) {
      // Author extraction
      let author = feed.name;
      if (typeof item.creator === 'string' && item.creator.trim().length > 0) {
        author = item.creator.trim();
      } else if (item.creator && typeof item.creator === 'object') {
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

      // Content snippet
      let snippet = item.contentSnippet || item.content || '';
      if (snippet.length > 280) {
        snippet = snippet.slice(0, 280) + '...';
      }

      // Date parsing
      const dateStr = item.isoDate || item.pubDate;
      const isoDate = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString();

      // Clean tags
      const rawTags = item.categories || [];
      const tags = rawTags
        .map(tag => {
          if (typeof tag === 'string') return tag.trim();
          if (tag && typeof tag === 'object' && tag._) return tag._.trim();
          return null;
        })
        .filter(Boolean);

      const link = item.link || '#';
      const id = item.guid || item.id || crypto.createHash('sha1').update(link).digest('hex');

      articles.push({
        id,
        provider: feed.provider,
        title: item.title || 'Untitled Post',
        link,
        date: isoDate,
        author,
        tags,
        snippet,
        feed_id: feed.id
      });
    }
  } catch (error) {
    console.error(`Error parsing RSS feed for ${feed.provider}:`, error.message);
  }
  return articles;
}

// Fetch all registered active feeds (RSS & scraping) and insert into db
async function refreshAllFeeds() {
  console.log(`[${new Date().toISOString()}] Refreshing all active feeds...`);
  const feeds = await dbAll('SELECT * FROM feeds WHERE active = 1');
  let insertedCount = 0;

  for (const feed of feeds) {
    let articles = [];
    if (feed.type === 'rss') {
      articles = await parseRssFeed(feed);
    } else if (feed.type === 'scrape') {
      articles = await scrapeHtmlPage(feed);
    }

    for (const art of articles) {
      try {
        const tagsStr = Array.isArray(art.tags) ? art.tags.join(',') : '';
        const res = await dbRun(`
          INSERT OR IGNORE INTO articles (id, provider, title, link, date, author, tags, snippet, feed_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [art.id, art.provider, art.title, art.link, art.date, art.author, tagsStr, art.snippet, feed.id]);
        
        if (res.changes > 0) {
          insertedCount++;
        }
      } catch (err) {
        console.error('Error inserting article:', err.message);
      }
    }
  }

  console.log(`Feed refresh finished. Inserted ${insertedCount} new articles.`);
  return insertedCount;
}

// API endpoint to retrieve articles
app.get('/api/blogs', async (req, res) => {
  const forceRefresh = req.query.refresh === 'true';

  try {
    if (forceRefresh) {
      await refreshAllFeeds();
    }

    // Retrieve articles from DB
    const rows = await dbAll('SELECT * FROM articles ORDER BY date DESC LIMIT 400');
    
    // Format tags back to array of strings
    const articles = rows.map(r => ({
      ...r,
      tags: r.tags ? r.tags.split(',') : []
    }));

    // Find the latest fetch/update timestamp
    const latestArticle = articles[0];
    const lastFetched = latestArticle ? latestArticle.date : new Date().toISOString();

    res.json({
      success: true,
      lastFetched,
      articles
    });
  } catch (error) {
    console.error('API /api/blogs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve blog articles',
      error: error.message
    });
  }
});

// API endpoints for managing feeds
app.get('/api/feeds', async (req, res) => {
  try {
    const feeds = await dbAll('SELECT * FROM feeds ORDER BY provider, name');
    res.json({ success: true, feeds });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/feeds', async (req, res) => {
  const { name, url, type, selector, provider } = req.body;
  if (!name || !url || !type || !provider) {
    return res.status(400).json({ success: false, message: 'Missing required feed parameters' });
  }

  try {
    const result = await dbRun(`
      INSERT INTO feeds (name, url, type, selector, provider)
      VALUES (?, ?, ?, ?, ?)
    `, [name, url, type, selector || null, provider]);
    
    res.json({
      success: true,
      feed: { id: result.lastID, name, url, type, selector, provider, active: 1 }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/feeds/:id', async (req, res) => {
  const feedId = req.params.id;
  try {
    // Delete articles related to the feed cascade
    await dbRun('DELETE FROM articles WHERE feed_id = ?', [feedId]);
    // Delete feed
    await dbRun('DELETE FROM feeds WHERE id = ?', [feedId]);
    res.json({ success: true, message: 'Feed deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// RAG Search & Chat endpoint
app.post('/api/chat', async (req, res) => {
  const { query } = req.body;
  if (!query || query.trim().length === 0) {
    return res.status(400).json({ success: false, message: 'Missing user query message.' });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ 
      success: false, 
      message: 'Gemini API Key is not configured on the server. RAG capabilities are disabled.' 
    });
  }

  try {
    // 1. Keyword-based search algorithm
    const cleanQuery = query.toLowerCase().replace(/[^\w\s]/g, ' ');
    const tokens = cleanQuery.split(/\s+/).filter(Boolean);
    
    const stopWords = [
      'what', 'is', 'for', 'the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'to', 'of', 'about', 
      'how', 'recent', 'new', 'news', 'updates', 'update', 'last', 'past', 'month', 'months', 
      'year', 'half', 'with', 'by', 'me', 'tell', 'show', 'are', 'any'
    ];
    
    const keywords = tokens.filter(t => !stopWords.includes(t) && t.length > 2);
    
    let dbMatches = [];
    if (keywords.length > 0) {
      // Build CASE WHEN scores and WHERE clauses for all keywords
      const scoreStatements = keywords.map(kw => `
        (CASE WHEN title LIKE ? THEN 4 ELSE 0 END + 
         CASE WHEN tags LIKE ? THEN 2 ELSE 0 END + 
         CASE WHEN snippet LIKE ? THEN 1 ELSE 0 END)
      `);
      
      const whereStatements = keywords.map(() => `
        (title LIKE ? OR snippet LIKE ? OR tags LIKE ?)
      `);

      const sql = `
        SELECT *, (${scoreStatements.join(' + ')}) as score
        FROM articles
        WHERE ${whereStatements.join(' OR ')}
        ORDER BY score DESC, date DESC
        LIMIT 8
      `;

      // 3 bindings for each score statement, and 3 for each where statement
      const bindings = [];
      keywords.forEach(kw => bindings.push(`%${kw}%`, `%${kw}%`, `%${kw}%`));
      keywords.forEach(kw => bindings.push(`%${kw}%`, `%${kw}%`, `%${kw}%`));

      dbMatches = await dbAll(sql, bindings);
    } else {
      // Fallback: get recent articles
      dbMatches = await dbAll('SELECT * FROM articles ORDER BY date DESC LIMIT 8');
    }

    // 2. Format Context for Gemini
    const contextText = dbMatches.map((art, index) => {
      return `[Article ${index + 1}]
Source: ${art.provider} Blog
Title: ${art.title}
Published: ${art.date}
Link: ${art.link}
Summary: ${art.snippet}`;
    }).join('\n\n');

    // 3. System context prompt
    const systemPrompt = `You are "CloudPulse AI", an advanced retrieval-augmented cloud analytics assistant.
Your goal is to answer the user's questions about cloud news (AWS, Azure, GCP) based on the database article snippets provided in the Context below.

Follow these strict rules:
1. Base your answer primarily on the provided context.
2. If the context does not contain enough information to answer the question, note that the specific details are not present in your indexed database, but summarize whatever is related.
3. Be professional, direct, and concise. 
4. Include markdown links when referring to specific articles or announcements. Use the EXACT links from the Context!
5. Format your output with clear headings and lists to make it readable.

Context:
${contextText || "No matching articles found in the database."}

User Question: ${query}`;

    // 4. Send request to Gemini API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: systemPrompt }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API responded with ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Unable to synthesize response.';

    res.json({
      success: true,
      response: answer,
      sources: dbMatches.map(m => ({
        id: m.id,
        title: m.title,
        link: m.link,
        provider: m.provider,
        date: m.date
      }))
    });
  } catch (error) {
    console.error('Chat RAG error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process RAG chat message.',
      error: error.message
    });
  }
});

// Start server after database initialization
async function startServer() {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
      // Trigger initial feed pull in background after startup
      refreshAllFeeds().catch(err => console.error('Initial feed refresh failed:', err));
    });
  } catch (err) {
    console.error('Failed to initialize database or start server:', err);
    process.exit(1);
  }
}
startServer();
