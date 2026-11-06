# Imagen SSR de SoupChef: Node habla el protocolo binario con el gestor SoupDB.
# La app de escritorio (Tauri) se sigue empaquetando aparte con `pnpm build:tauri`.

FROM node:22-slim AS base
RUN npm install -g pnpm@10
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:22-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
WORKDIR /app

RUN npm install -g pnpm@10
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY --from=build /app/build ./build

USER node
EXPOSE 3000
CMD ["node", "build"]
