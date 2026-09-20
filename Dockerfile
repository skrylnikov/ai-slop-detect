FROM node:24-alpine AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile

COPY apps/api apps/api
RUN pnpm --dir apps/api build

FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/apps/api/dist apps/api/dist

USER node
EXPOSE 4310
CMD ["node", "apps/api/dist/server.js"]
