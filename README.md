# Bitalih - Turkish Betting Campaign Analysis Platform

A monorepo for aggregating, analyzing, and tracking betting campaigns across Turkish betting sites.

## Project Structure

```
bitalih/
├── apps/
│   ├── dashboard/          # Next.js dashboard application
│   └── scraper/            # Web scraping service
├── packages/
│   └── shared/             # Shared types, schemas, and utilities
├── docker-compose.yml
└── package.json
```

## Features

- **Multi-site campaign aggregation** - Scrapes campaigns from 11 Turkish betting sites
- **AI-powered date extraction** - Uses GPT to extract and validate campaign dates
- **Deduplication** - Fingerprint-based campaign deduplication
- **Real-time updates** - Server-Sent Events (SSE) for live updates
- **Weekly reports** - Automated weekly campaign analysis reports
- **Status tracking** - Automatic campaign status recalculation

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 8+
- Docker & Docker Compose (for local development)

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env
```

### Development

```bash
# Start all services (database, redis, apps)
pnpm docker:up

# Run dashboard
pnpm dev:dashboard

# Run scraper
pnpm dev:scraper
```

### Docker

```bash
# Build and start all services
pnpm docker:build
pnpm docker:up

# Stop services
pnpm docker:down
```

## Supported Sites

| Site | Category | Status |
|------|----------|--------|
| 4nala | Sports | Active |
| Altiliganyan | Sports | Active |
| Atyarisi | Horse Racing | Active |
| Bilyoner | Sports | Active |
| Birebin | Sports | Active |
| Ekuri | Sports | Active |
| Hipodrom | Horse Racing | Active |
| Misli | Sports | Active |
| Nesine | Sports | Active |
| Oley | Sports | Active |
| Sundzulyuk | Sports | Active |

## API Endpoints

### Campaigns
- `GET /api/campaigns` - List campaigns with filtering
- `GET /api/campaigns/:id` - Get campaign details
- `PATCH /api/campaigns/:id` - Update campaign
- `GET /api/campaigns/:id/notes` - Get campaign notes
- `POST /api/campaigns/:id/notes` - Add campaign note
- `GET /api/campaigns/:id/similar` - Find similar campaigns

### Reports
- `GET /api/reports/weekly` - List weekly reports
- `GET /api/reports/weekly/:id` - Get weekly report details
- `GET /api/reports/summary` - Get summary statistics

### Admin
- `POST /api/admin/scrape/trigger` - Trigger scrape job
- `POST /api/admin/reindex-ai` - Reindex AI analysis
- `POST /api/admin/recalculate-status` - Recalculate campaign statuses

### Events
- `GET /api/events/stream` - SSE event stream

## Environment Variables

See `.env.example` for all available configuration options.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev:dashboard` | Start dashboard in dev mode |
| `pnpm dev:scraper` | Start scraper in dev mode |
| `pnpm build` | Build all packages |
| `pnpm docker:up` | Start Docker services |
| `pnpm docker:down` | Stop Docker services |
| `pnpm db:migrate` | Run database migrations |
| `pnpm db:seed` | Seed database |

## Architecture

### Dashboard (Next.js)
- Server Components for data fetching
- Client Components for interactivity
- React Query for data caching
- Tailwind CSS for styling

### Scraper (Node.js)
- Puppeteer for browser automation
- Cheerio for HTML parsing
- PostgreSQL for job queuing
- PostgreSQL for data storage
- DeepSeek for AI features
- SSE uses in-memory storage (not Redis pub/sub)

### Shared Package
- Zod schemas for validation
- TypeScript types and DTOs
- Shared constants and utilities
- Logger and error handling

## License

Private - All rights reserved
