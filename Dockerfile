# Builds AXtime Next from source and packages the single Linux executable.
#   docker build -t axtime-next .
FROM node:22-bookworm-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN node scripts/build.mjs linux-x64

FROM debian:bookworm-slim
COPY --from=build /src/dist/release/axtime-next /usr/local/bin/axtime-next
ENV AX_DATA_DIR=/data AX_PORT=8080 AX_DOCKER=1
VOLUME ["/data"]
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/axtime-next"]
