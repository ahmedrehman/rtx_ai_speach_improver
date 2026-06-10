export function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export function notFound() {
  return json({ error: "Not found" }, 404);
}

export function methodNotAllowed() {
  return json({ error: "Method not allowed" }, 405);
}
