export type AssetsBinding = {
  fetch: (request: Request) => Promise<Response>;
};

export type Env = {
  ASSETS: AssetsBinding;
  APP_BASE_PATH?: string;
  OPENAI_API_KEY?: string;
};
