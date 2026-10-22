FROM node:25-alpine@sha256:bdf2cca6fe3dabd014ea60163eca3f0f7015fbd5c7ee1b0e9ccb4ced6eb02ef4 AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

COPY . .
RUN npm run build

FROM node:25-alpine@sha256:bdf2cca6fe3dabd014ea60163eca3f0f7015fbd5c7ee1b0e9ccb4ced6eb02ef4

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node server.js ./server.js

ENV TWEXTHUB_PORT=3000

USER node

EXPOSE 3000

CMD ["node", "server.js"]