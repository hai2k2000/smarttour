# System Patterns

## Architecture

Use a modular monolith:

- Next.js web app in `apps/web`
- NestJS API in `apps/api`
- Prisma schema in `prisma/schema.prisma`
- Shared domain constants/types in `packages/shared`

## Module Pattern

Each API module should own:

- Controller
- Service
- DTOs
- Permission names
- Prisma queries

Start simple. Add abstractions only when shared behavior is real.

## Data Access

Prisma is the source of truth for database access. Use migrations for every schema change.
