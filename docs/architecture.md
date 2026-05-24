# SmartTour Architecture

SmartTour starts as a modular monolith.

```text
Next.js Web
  -> NestJS API
  -> Prisma
  -> PostgreSQL

Supporting services:
- Redis for queues and cache
- MinIO for files
- n8n for later automation
- Nginx for production reverse proxy
```

The first bounded context is tour operation. AI and automation are future layers and must not be mixed into core operation modules.
