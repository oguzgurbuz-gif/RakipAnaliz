# Project Overview

## What This Project Is

RakipAnaliz, branded in the codebase as `bitalih`, is a monorepo for collecting, normalizing, analyzing, and monitoring betting campaign data across Turkish betting sites. Its main goal is to track competitor campaigns, compare them against the `bitalih` brand, and expose that data through an internal dashboard and API.

## High-Level Architecture

The repository is organized as a `pnpm` workspace with three main parts:

- `apps/dashboard`: Next.js dashboard application and API layer
- `apps/scraper`: background scraping and job-processing service
- `packages/shared`: shared TypeScript types, schemas, constants, and utilities

Supporting infrastructure lives in:

- `db/`: PostgreSQL migrations and seed data
- `docker-compose.yml`: local container orchestration for database, dashboard, and scraper

## Main Modules

### 1. Dashboard

The dashboard is built with Next.js 14 and React 18. It provides:

- campaign listing and filtering
- report views and summaries
- competition analysis across tracked sites
- scrape run visibility
- live updates through SSE
- admin endpoints for operational actions

The dashboard is not only a frontend. It also hosts the application API under `app/api/*` and talks directly to PostgreSQL.

Important areas:

- `apps/dashboard/app/page.tsx`: main metrics and comparison dashboard
- `apps/dashboard/app/api/campaigns/*`: campaign APIs
- `apps/dashboard/app/api/reports/*`: reporting APIs
- `apps/dashboard/app/api/competition/route.ts`: competitor comparison API
- `apps/dashboard/app/api/events/stream/route.ts`: SSE endpoint
- `apps/dashboard/lib/db.ts`: PostgreSQL connection layer
- `apps/dashboard/lib/api.ts`: frontend API client helpers

### 2. Scraper Service

The scraper is a standalone TypeScript Node.js service responsible for ingesting campaign data from tracked betting sites. On startup it:

- connects to PostgreSQL
- starts the internal job scheduler
- optionally runs an initial scrape for all active sites

It contains:

- per-site adapters under `apps/scraper/src/adapters/`
- scraping orchestration under `apps/scraper/src/core/`
- AI and date extraction logic under `apps/scraper/src/ai/` and `apps/scraper/src/date-extraction/`
- scheduled/background jobs under `apps/scraper/src/jobs/`
- SSE publishing under `apps/scraper/src/publish/`

The job scheduler currently processes:

- `scrape`
- `ai-analysis`
- `date-extraction`
- `weekly-report`
- `status-recalc`

Important areas:

- `apps/scraper/src/index.ts`: service entry point
- `apps/scraper/src/jobs/scheduler.ts`: job polling and execution
- `apps/scraper/src/core/scraper.ts`: scrape orchestration
- `apps/scraper/src/adapters/index.ts`: site adapter registry

### 3. Shared Package

`packages/shared` contains shared code used across applications:

- constants
- DTOs
- Zod schemas
- logger exports
- error helpers
- validation helpers

This package keeps the dashboard and scraper aligned on data contracts.

## Database Model

The PostgreSQL schema is centered around campaign ingestion and analysis. Key tables include:

- `sites`: tracked betting sites
- `scrape_runs` and `scrape_run_sites`: operational scrape tracking
- `raw_campaign_snapshots`: raw scraped source data
- `campaigns`: normalized canonical campaign records
- `campaign_versions`: campaign change history
- `campaign_status_history`: status transitions over time
- `campaign_ai_analyses`: AI-generated campaign analysis results
- `campaign_similarities`: cross-campaign similarity relationships
- `campaign_notes`: internal notes on campaigns

## Runtime And Entry Points

### Local Development

Root scripts:

- `pnpm dev:dashboard`: run the dashboard locally
- `pnpm dev:scraper`: run the scraper locally
- `pnpm db:migrate`: run database migrations
- `pnpm db:seed`: seed initial data
- `pnpm docker:up`: start local containers
- `pnpm docker:down`: stop local containers

### Container Setup

`docker-compose.yml` starts:

- `db`: PostgreSQL 16
- `dashboard`: Next.js application
- `scraper`: scraping and background processing service

## Product Capabilities

Based on the current codebase, the project supports:

- multi-site campaign aggregation
- campaign deduplication and normalization
- AI-assisted analysis and date extraction
- live operational updates over SSE
- weekly reporting
- campaign status recalculation
- competitor ranking and category-based comparisons

## Notable Implementation Details

- The dashboard doubles as both UI and backend API.
- Scraping is queue-based rather than fully inline, which keeps operational actions asynchronous.
- Live updates are delivered with SSE.
- The codebase is centered around PostgreSQL rather than a separate queue broker.
- There is a small naming mismatch in the repo: the folder is `RakipAnaliz`, while the package and app naming still use `bitalih`.
- AI configuration appears to be in transition. The README mentions GPT-style AI extraction, while current container configuration points at DeepSeek-related environment variables.

## Suggested Mental Model

Think of the system as a three-stage pipeline:

1. Scrape campaign data from betting sites.
2. Normalize, enrich, classify, and store campaigns in PostgreSQL.
3. Serve insights, comparisons, and operational controls through the Next.js dashboard and API.
