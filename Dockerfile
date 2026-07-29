FROM oven/bun:1.3.14
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY  . .

RUN bun install --frozen-lockfile
ARG APP
ENV APP=$APP
CMD ["sh" ,"-c" , "bun run apps/$APP/index.ts"]