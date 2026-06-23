FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY apps/api/package*.json apps/api/
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run prisma:generate && npm run build -w @smarttour/api

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/package.json ./package.json
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]
