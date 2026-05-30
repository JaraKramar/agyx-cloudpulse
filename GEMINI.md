# GEMINI.MD: AI Collaboration Guide

This document provides essential context for AI models interacting with this project. Adhering to these guidelines will ensure consistency and maintain code quality.

## 1. Project Overview & Purpose

* **Primary Goal:** Multi-cloud blog aggregator application designed to poll, cache, consolidate, and visualize the official blog RSS feeds from Amazon Web Services (AWS), Microsoft Azure, and Google Cloud Platform (GCP).
* **Business Domain:** Cloud Computing, Content Aggregation, and Dashboard Analytics.

## 2. Core Technologies & Stack

* **Languages:** JavaScript (ES Modules syntax for both server and client-side scripts).
* **Frameworks & Runtimes:** Node.js, Express.js.
* **Databases:** None (uses robust in-memory caching to avoid external database overhead).
* **Key Libraries/Dependencies:**
  - `express`: Minimalist web framework for Node.js.
  - `rss-parser`: Robust XML parser to parse RSS/Atom feeds into standardized JavaScript objects.
  - `cors`: Cross-Origin Resource Sharing middleware.
* **Package Manager(s):** npm (`package.json`).

## 3. Architectural Patterns

* **Overall Architecture:** Single-repo monolithic Node.js backend serving as both an API proxy/cacher and a static file web server for the Vanilla HTML/CSS/JS frontend.
* **Directory Structure Philosophy:**
  - `/public`: Houses all front-end assets:
    - `index.html`: Layout structure, loading skeleton elements, and metrics dashboard components.
    - `index.css`: Dark/light mode theme configuration, responsive grids, and visual animations.
    - `app.js`: State management, search, filtering, and metric calculation logic.
  - `/server.js`: Houses the Express server, RSS polling logic, in-memory caching mechanism, and API endpoints.
  - `package.json`: Main Node.json dependency configuration.

## 4. Coding Conventions & Style Guide

* **Formatting:** Modern ES Module JavaScript. 2-space indentation. Strict formatting in CSS utilizing HSL color variables and layout utilities.
* **Naming Conventions:**
  - Variables and Functions: camelCase (e.g. `blogCache`, `standardizeItem`, `filterAndRender`).
  - Directories and files: Lowercase / kebab-case (e.g. `public/index.html`, `public/app.js`).
* **API Design:** REST-style endpoints.
  - `GET /api/blogs`: Consolidates and returns a sorted JSON list of blog posts.
  - Accepts a query parameter `?refresh=true` to bust the in-memory cache and fetch fresh feeds on demand.
* **Error Handling:** 
  - Backend uses parallelized `Promise.allSettled` to fetch feeds so that failure of one feed (e.g. timeout or XML corruption) does not prevent other providers' blogs from loading successfully.
  - Frontend displays custom, friendly empty states and skeletons during loading or retrieval errors.

## 5. Key Files & Entrypoints

* **Main Entrypoint(s):** 
  - `server.js` (Express backend and static server)
  - `public/index.html` (Frontend client entrypoint)
  - `update.sh` (Pull-based update script for remote environments)
* **Configuration:** `package.json` for npm script and package definitions.
* **CI/CD Pipeline:** Pull-based auto-deployment script (`update.sh`) triggered via cron on Raspberry Pi. (Confidence level: High).

## 6. Development & Testing Workflow

* **Local Development Environment:**
  - Clone/Navigate to project root.
  - Run `npm install` to load dependencies.
  - Run `npm start` to launch the Express app locally on port 3000.
  - Navigate to `http://localhost:3000` in the browser.
* **Testing:**
  - Standard JavaScript test scripts can be run via node CLI.
  - Manual verification of API feeds can be verified by running `fetch` requests directly from a Node shell or browser developer tools.
* **CI/CD & Deployment Process:**
  - Local changes pushed to the `main` branch on GitHub automatically propagate to the remote Raspberry Pi.
  - A pull-based cron job running on the Raspberry Pi checks GitHub for commit updates every 5 minutes. If updates are found, it pulls them, triggers `npm install`, and restarts the application PM2 daemon process (`cloudpulse`).

## 7. Specific Instructions for AI Collaboration

* **Contribution Guidelines:**
  - Ensure frontend pages remain responsive and implement sleek modern aesthetics (glassmorphism, subtle micro-animations) in `public/index.css`.
  - Maintain the clean separations between Backend (`server.js`) and Frontend (`/public`).
* **Infrastructure (IaC):** None. (Inferred; Confidence level: High).
* **Security:**
  - Do not commit API keys, cloud credentials, or secrets to the repo (although RSS feeds are currently public).
  - Use `cors` on server side to control origin resource sharing safely.
* **Dependencies:** Keep dependencies minimal. Add libraries only if they are cross-platform compatible and standard Node.js compliant.
* **Commit Messages:** Follow basic Conventional Commits format (e.g., `feat: add gcp support`, `fix: resolve azure feed parsing`, `docs: update gemini guide`). (Inferred; Confidence level: Medium).
