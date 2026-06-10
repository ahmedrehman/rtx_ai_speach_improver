import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync, type SQLInputValue, type StatementSync } from "node:sqlite";
import type { D1DatabaseLike, D1PreparedStatementLike } from "./bindings";

export function openLocalImproverDb(path = "local-data/improver.sqlite"): D1DatabaseLike {
  let database: DatabaseSync;
  if (path === ":memory:") {
    database = new DatabaseSync(":memory:");
  } else {
    const absolutePath = resolve(path);
    mkdirSync(dirname(absolutePath), { recursive: true });
    database = new DatabaseSync(absolutePath);
  }

  return {
    prepare(query: string) {
      return new LocalPreparedStatement(database.prepare(query));
    }
  };
}

class LocalPreparedStatement implements D1PreparedStatementLike {
  private values: SQLInputValue[] = [];

  constructor(private readonly statement: StatementSync) {}

  bind(...values: unknown[]) {
    this.values = values.map(toSqlValue);
    return this;
  }

  async run() {
    this.statement.run(...this.values);
    return {};
  }

  async all<T = unknown>() {
    return {
      results: this.statement.all(...this.values) as T[]
    };
  }
}

function toSqlValue(value: unknown): SQLInputValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
    return value;
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (value instanceof Uint8Array) {
    return value;
  }

  return String(value);
}
