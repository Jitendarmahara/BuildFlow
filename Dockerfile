FROM oven/bun:1.3.14
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY  . .

RUN bun install --frozen-lockfile
# APP   = which app under apps/ to run (agents, storage-sidecar, orchestrator, ws-server,
#         primary-backend, reaper, web)
# ENTRY = its entrypoint file; defaults to index.ts, overridden to server.ts for `web`
ARG APP
ARG ENTRY=index.ts
ENV APP=$APP
ENV ENTRY=$ENTRY
CMD ["sh" ,"-c" , "bun run apps/$APP/$ENTRY"]
