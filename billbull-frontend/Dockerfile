FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
# npm workspaces: every workspace manifest must exist before `npm ci`.
COPY packages/shared/package.json packages/shared/
COPY apps/pos/package.json apps/pos/
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
