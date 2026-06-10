export type D1DatabaseLike = {
  prepare: (query: string) => D1PreparedStatementLike;
};

export type D1PreparedStatementLike = {
  bind: (...values: unknown[]) => D1PreparedStatementLike;
  run: () => Promise<unknown>;
  all: <T = unknown>() => Promise<{ results?: T[] }>;
};

export type AssetsBinding = {
  fetch: (request: Request) => Promise<Response>;
};

export type Env = {
  ASSETS: AssetsBinding;
  APP_BASE_PATH?: string;
  OPENAI_API_KEY?: string;
  IMPROVER_DB?: D1DatabaseLike;
};
