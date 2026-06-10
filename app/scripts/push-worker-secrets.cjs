const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const requiredSecrets = [
  "OPENAI_API_KEY"
];

const values = new Map();

for (const fileName of [".env.local", ".env"]) {
  const filePath = path.join(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) continue;
  loadDotenv(fs.readFileSync(filePath, "utf8"), values);
}

for (const secretName of requiredSecrets) {
  if (process.env[secretName]) {
    values.set(secretName, process.env[secretName]);
  }
}

const missing = requiredSecrets.filter((secretName) => !values.get(secretName));
if (missing.length) {
  console.error(`Missing required Worker secrets: ${missing.join(", ")}`);
  process.exit(1);
}

for (const secretName of requiredSecrets) {
  const result = spawnSync(
    "cmd.exe",
    ["/d", "/s", "/c", `npx wrangler secret put ${secretName}`],
    {
      input: values.get(secretName),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"]
    }
  );

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(result.stdout || "");
    console.error(result.stderr || "");
    process.exit(result.status ?? 1);
  }

  console.log(`Set Worker secret: ${secretName}`);
}

function loadDotenv(text, target) {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator < 1) continue;

    const name = line.slice(0, separator).trim();
    if (!requiredSecrets.includes(name)) continue;

    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    target.set(name, value);
  }
}
