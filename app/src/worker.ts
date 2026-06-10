import type { Env } from "./server/bindings";
import { handleRequest } from "./server/http";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  }
};
