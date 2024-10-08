import { ensureMigrations, getDbClient } from "../lib/db";

const db = getDbClient();

ensureMigrations(db);
