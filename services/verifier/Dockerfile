FROM node:20-bookworm-slim

WORKDIR /app

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .npmrc .npmrc
COPY services/verifier/package.json services/verifier/package.json
COPY packages/credential-v2/package.json packages/credential-v2/package.json
COPY packages/sdk-types/package.json packages/sdk-types/package.json
COPY packages/verifier-core/package.json packages/verifier-core/package.json
COPY packages/zk-claims/package.json packages/zk-claims/package.json

RUN pnpm install --frozen-lockfile

COPY services/verifier services/verifier
COPY packages/credential-v2 packages/credential-v2
COPY packages/sdk-types packages/sdk-types
COPY packages/verifier-core packages/verifier-core
COPY packages/zk-claims packages/zk-claims

RUN pnpm --filter @mintra/credential-v2 build \
  && pnpm --filter @mintra/sdk-types build \
  && pnpm --filter @mintra/zk-claims build \
  && pnpm --filter @mintra/verifier-core build \
  && pnpm --filter @mintra/verifier build

ENV NODE_ENV=production
ENV PORT=3002

EXPOSE 3002

CMD ["pnpm", "--filter", "@mintra/verifier", "start"]
