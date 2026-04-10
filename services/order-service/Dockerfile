FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
COPY tsconfig.base.json ./
COPY libs/node-common/package.json libs/node-common/package.json
COPY services/order-service/package.json services/order-service/package.json
COPY services/payment-service/package.json services/payment-service/package.json

RUN npm ci

COPY libs/node-common libs/node-common
COPY services/order-service services/order-service

RUN npm run build -w libs/node-common && npm run build -w services/order-service

FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY libs/node-common/package.json libs/node-common/package.json
COPY services/order-service/package.json services/order-service/package.json
COPY services/payment-service/package.json services/payment-service/package.json

RUN npm ci --omit=dev

COPY --from=build /app/libs/node-common/dist libs/node-common/dist
COPY --from=build /app/services/order-service/dist services/order-service/dist

EXPOSE 3000

CMD ["npm", "run", "start:prod", "-w", "services/order-service"]

