FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
COPY tsconfig.base.json ./
COPY libs/node-common/package.json libs/node-common/package.json
COPY services/order-service/package.json services/order-service/package.json
COPY services/payment-service/package.json services/payment-service/package.json

RUN npm ci

COPY libs/node-common libs/node-common
COPY services/payment-service services/payment-service

RUN npm run build -w libs/node-common && npm run build -w services/payment-service

FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY libs/node-common/package.json libs/node-common/package.json
COPY services/order-service/package.json services/order-service/package.json
COPY services/payment-service/package.json services/payment-service/package.json

RUN npm ci --omit=dev

COPY --from=build /app/libs/node-common/dist libs/node-common/dist
COPY --from=build /app/services/payment-service/dist services/payment-service/dist

EXPOSE 3001

CMD ["npm", "run", "start:prod", "-w", "services/payment-service"]

