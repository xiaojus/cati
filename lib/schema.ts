import {
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name'),
  createdAt: text('created_at').notNull(),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
});

export const cats = sqliteTable('cats', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  birthEst: text('birth_est'),
  sex: text('sex'),
  neutered: integer('neutered'),
  neuteredAt: text('neutered_at'),
  avatarUrl: text('avatar_url'),
  note: text('note'),
  createdAt: text('created_at').notNull(),
});

export const catMembers = sqliteTable(
  'cat_members',
  {
    catId: text('cat_id')
      .notNull()
      .references(() => cats.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
  },
  (table) => [primaryKey({ columns: [table.catId, table.userId] })],
);

export const dailyLogs = sqliteTable(
  'daily_logs',
  {
    id: text('id').primaryKey(),
    catId: text('cat_id')
      .notNull()
      .references(() => cats.id, { onDelete: 'cascade' }),
    logDate: text('log_date').notNull(),
    appetite: integer('appetite'),
    water: integer('water'),
    stoolScore: integer('stool_score'),
    stoolCount: integer('stool_count'),
    vomitCount: integer('vomit_count'),
    energy: integer('energy'),
    weightG: integer('weight_g'),
    note: text('note'),
    photoPath: text('photo_path'),
    source: text('source').notNull().default('manual'),
    createdBy: text('created_by').references(() => users.id),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    unique('daily_logs_cat_id_log_date_unique').on(table.catId, table.logDate),
  ],
);

export const records = sqliteTable('records', {
  id: text('id').primaryKey(),
  catId: text('cat_id')
    .notNull()
    .references(() => cats.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  name: text('name'),
  eventDate: text('event_date').notNull(),
  dose: text('dose'),
  nextDue: text('next_due'),
  cost: real('cost'),
  vet: text('vet'),
  note: text('note'),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').notNull(),
});

export const aiParses = sqliteTable('ai_parses', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  rawText: text('raw_text').notNull(),
  parsedJson: text('parsed_json').notNull(),
  accepted: integer('accepted'),
  createdAt: text('created_at').notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Cat = typeof cats.$inferSelect;
export type NewCat = typeof cats.$inferInsert;
export type DailyLog = typeof dailyLogs.$inferSelect;
export type NewDailyLog = typeof dailyLogs.$inferInsert;
export type Record = typeof records.$inferSelect;
export type NewRecord = typeof records.$inferInsert;
