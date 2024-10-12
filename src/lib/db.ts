import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { promises as fs } from "fs";
import {
  CamelCasePlugin,
  FileMigrationProvider,
  Kysely,
  Migrator,
  PostgresDialect,
} from "kysely";
import { fileURLToPath } from "node:url";
import path from "path";
import pg from "pg";
import Cursor from "pg-cursor";
import { Tables } from "../types/db";
import { NodePostgresAdapter } from "@lucia-auth/adapter-postgresql";

const { Pool } = pg;

const pool = new Pool({
  max: 20,
  connectionString: process.env.DATABASE_URL,
});

export const getDbClient = (
  connectionString: string | undefined = process.env.DATABASE_URL
) => {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  return new Kysely<Tables>({
    dialect: new PostgresDialect({
      pool,
      cursor: Cursor,
    }),
    plugins: [new CamelCasePlugin()],
    log: ["error", "query"],
  });
};

export const getAuthAdapter = (
  connectionString: string | undefined = process.env.DATABASE_URL
) => {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const adapter = new NodePostgresAdapter(pool, {
    user: "users",
    session: "user_session",
  });

  return adapter;
};

export const db = getDbClient();
export const luciaDb = getDbClient();

const createMigrator = async (db: Kysely<Tables>) => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(currentDir, "../", "migrations"),
    }),
  });

  return migrator;
};

export const migrateToLatest = async (db: Kysely<Tables>): Promise<void> => {
  const migrator = await createMigrator(db);

  const { error, results } = await migrator.migrateToLatest();

  results?.forEach((it) => {
    if (it.status === "Success") {
      console.log(`Migration "${it.migrationName}" was executed successfully`);
    } else if (it.status === "Error") {
      console.error(`failed to execute migration "${it.migrationName}"`);
    }
  });

  if (error) {
    console.error("Failed to apply all database migrations");
    console.error(error);
    throw error;
  }

  console.log("Migrations up to date");
};

export async function ensureMigrations(db: Kysely<Tables>) {
  console.log("Ensuring database migrations are up to date");

  try {
    await migrateToLatest(db);
  } catch (error) {
    console.error("Failed to migrate database", error);
    throw error;
  }
}
