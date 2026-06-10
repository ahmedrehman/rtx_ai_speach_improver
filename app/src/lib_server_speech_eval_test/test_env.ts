import { readFileSync } from "node:fs";

for (const fileName of [".env", ".env.local", "app/.env", "app/.env.local"]) {
  try {
    loadEnvText(readFileSync(fileName, "utf8"));
  } catch {
    // Local env files are optional.
  }
}

function loadEnvText(text: string) {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const name = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[name]) process.env[name] = value;
  }
}
