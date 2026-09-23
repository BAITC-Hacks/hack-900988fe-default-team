# syntax=docker/dockerfile:1
FROM node:22-alpine AS build

WORKDIR /app
ARG VITE_API_BASE_URL
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN --mount=type=secret,id=frontend_env,target=/run/secrets/frontend_env \
    if [ -f /run/secrets/frontend_env ]; then set -a && . /run/secrets/frontend_env && set +a; fi && \
    if [ -n "$VITE_API_BASE_URL" ]; then export VITE_API_BASE_URL; fi && \
    npm run build

FROM nginx:1.27-alpine AS production

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
