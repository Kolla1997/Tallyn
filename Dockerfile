# Single deployment: the Go server serves the API and the built React app.

# 1. Build the React app
FROM node:22-alpine AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# 2. Build the Go server
FROM golang:1.24-alpine AS server
WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY cmd/ cmd/
COPY internal/ internal/
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

# 3. Runtime
FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=server /out/server /app/server
COPY --from=web /src/web/dist /app/web/dist
ENV PORT=8080 WEB_DIR=/app/web/dist
EXPOSE 8080
USER nonroot
ENTRYPOINT ["/app/server"]
