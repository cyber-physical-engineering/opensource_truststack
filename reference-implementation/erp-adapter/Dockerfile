FROM node:20.11.1-alpine3.19 AS dev
RUN apk add --no-cache curl

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY server.js ./

ENV ERP_ADAPTER_PORT=3034

EXPOSE 3034

CMD ["npx", "nodemon", "server.js"]

FROM node:20.11.1-alpine3.19 AS production
RUN apk add --no-cache curl

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY server.js ./

ENV ERP_ADAPTER_PORT=3034

EXPOSE 3034

CMD ["node", "server.js"]

