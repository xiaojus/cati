import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './lib/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.CAT_DB ?? './data/cat.db',
  },
});
