FROM node:20.11.1-alpine3.19
FROM node:20.11.1-alpine3.19 AS dev

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY server.js ./

ENV ERP_BRIDGE_PORT=3037

EXPOSE 3037

CMD ["npx", "nodemon", "server.js"]

FROM node:20.11.1-alpine3.19 AS production

WORKDIR /app

RUN apk add --no-cache curl

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server.js ./

ENV ERP_BRIDGE_PORT=3037

EXPOSE 3037

CMD ["node", "server.js"]


