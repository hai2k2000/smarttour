# SmartTour / Travel Operations ERP

SmartTour is a travel operations ERP focused first on tour operation, supplier management, tour programs, bookings, operation forms, costs, supplier payments, and tour profit/loss.

## MVP Focus

The first release intentionally avoids broad CRM, HRM, marketing, automation, and AI. The core workflow is:

```text
Supplier -> Tour Program -> Booking -> Operation Form -> Operation Services -> Costs -> Supplier Payment -> Profit/Loss
```

## Monorepo

```text
apps/web        Next.js admin dashboard
apps/api        NestJS API
packages/shared Shared constants and types
prisma          Database schema and seed data
docs            Architecture and implementation notes
deploy/nginx    Reverse proxy config
memory-bank     Persistent project context for Codex/agents
```

## Local Development

```bash
cp .env.example .env
npm install
docker compose up -d postgres redis minio n8n
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

Default ports:

- Web: http://localhost:3000
- API: http://localhost:4000
- Swagger: http://localhost:4000/docs
- n8n: http://localhost:5678
- MinIO console: http://localhost:9001

## Current Status

This repository contains the initial SmartTour foundation. The next implementation step is to replace placeholder list endpoints with Prisma-backed CRUD for suppliers, tour programs, bookings, operation forms, operation tasks, operation costs, and supplier payment requests.
