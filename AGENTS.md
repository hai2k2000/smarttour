# AGENTS.md

## Project Identity

SmartTour is a travel operations ERP. The product must focus on real tour operator workflows before automation or AI.

## Current Priority

Build the operation core first:

1. Supplier management
2. Tour programs and itineraries
3. Tour bookings/departures
4. Operation forms
5. Operation services and tasks
6. Operation costs
7. Supplier payment requests
8. Tour profit/loss reporting

Do not expand into broad CRM, HRM, marketing, SaaS billing, or AI until the operation workflow is stable.

## Engineering Rules

- Use TypeScript strictly.
- Keep a modular monolith architecture.
- Use NestJS for API modules.
- Use Next.js App Router for the admin dashboard.
- Use Prisma migrations for schema changes.
- Keep authentication and RBAC in the foundation from the beginning.
- Keep automation separate from business modules.
- Keep AI separate from business modules and postpone it.
- Never commit real .env files, credentials, uploads, generated build output, or database volumes.

## Domain Language

Use travel-operations names consistently:

- Supplier
- Supplier Category
- Tour Program
- Tour Itinerary Day
- Booking
- Operation Form
- Operation Service
- Operation Task
- Operation Cost
- Supplier Payment Request
- Tour Profit/Loss

## UI Direction

Build a desktop-first ERP dashboard:

- Dark left sidebar
- Dense data tables
- Filters and status chips
- Detail pages for operational work
- Minimal marketing-style UI
- No landing page for the app shell

## Required Agent Workflow

Before coding:

1. Read `memory-bank/projectbrief.md`.
2. Read `memory-bank/activeContext.md`.
3. Check existing module patterns before adding a new one.

After meaningful changes:

1. Update `memory-bank/activeContext.md`.
2. Update `memory-bank/progress.md`.
3. Keep docs concise and operational.
