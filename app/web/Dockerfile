# syntax=docker/dockerfile:1
# Static web build served by nginx (a few MB of RAM).
# Build from the repository root:
#   docker build -f app/web/Dockerfile .

FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY app/api/package.json app/api/package.json
COPY app/web/package.json app/web/package.json
RUN npm ci --workspace=@dbd-assistant/web \
  && npm cache clean --force
COPY app/web ./app/web
WORKDIR /app/app/web

# Required: absolute API URL baked into the build (e.g. the LAN address
# or public URL players use to reach the API). The build fails without
# it — an empty value would silently send all API and socket.io traffic
# to the page origin instead. Pass via compose (root .env) or --build-arg.
ARG VITE_API_URL=
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

# ---- Serve ----------------------------------------------------------------
FROM nginx:1.29-alpine
COPY app/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/app/web/dist /usr/share/nginx/html
EXPOSE 80
