import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("users")
    .addColumn("id", "varchar", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("wallet_address", "varchar", (col) => col.notNull())
    .addColumn("passkey_id", "varchar", (col) => col.notNull())
    .addColumn("passkey_public_key", "varchar", (col) => col.notNull())
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn("phone_number", "varchar")
    .addColumn("verified_at", "timestamp")
    .execute();

  // Add an index on wallet_address for faster lookups
  await db.schema
    .createIndex("users_wallet_address_idx")
    .on("users")
    .column("wallet_address")
    .execute();

  await db.schema
    .createTable("user_session")
    .addColumn("id", "varchar", (col) => col.primaryKey())
    .addColumn("user_id", "text", (col) =>
      col.notNull().references("users.id").onDelete("cascade")
    )
    .addColumn("expires_at", "timestamptz", (col) => col.notNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("users_wallet_address_idx").execute();
  await db.schema.dropTable("users").execute();
}
