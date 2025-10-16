# Prisma Migrations for Supabase

## Initial Setup

This directory contains database migrations for PyPay's Supabase (PostgreSQL) database.

## Running Migrations

### First Time Setup

```bash
cd apps/indexer

# Generate Prisma Client
pnpm prisma generate

# Apply all migrations to Supabase
pnpm prisma migrate deploy
```

### Development

```bash
# Create a new migration after changing schema.prisma
pnpm prisma migrate dev --name your_migration_name

# Reset database (careful - deletes all data!)
pnpm prisma migrate reset
```

## Migrating from SQLite to Supabase

If you previously used SQLite and want to migrate to Supabase:

### Option 1: Fresh Start (Recommended for MVP)

```bash
# 1. Backup your SQLite data (if needed)
cp dev.db dev.db.backup

# 2. Update .env with Supabase connection strings
# DATABASE_URL=postgresql://... (port 6543)
# DIRECT_URL=postgresql://... (port 5432)

# 3. Generate Prisma client
pnpm prisma generate

# 4. Run migrations on Supabase
pnpm prisma migrate deploy

# 5. Your tables are now in Supabase!
```

### Option 2: Migrate Existing Data

```bash
# 1. Export data from SQLite
sqlite3 dev.db .dump > backup.sql

# 2. Convert SQLite to PostgreSQL syntax
# (You'll need to manually adjust some SQL syntax differences)

# 3. Import to Supabase
psql "$DIRECT_URL" < backup.sql

# Or use a tool like pgloader:
brew install pgloader
pgloader dev.db "$DIRECT_URL"
```

### Option 3: Use Prisma's Data Migration

```javascript
// migrate-data.ts
import { PrismaClient as SQLiteClient } from './old-sqlite-client';
import { PrismaClient as PostgresClient } from '@prisma/client';

const sqlite = new SQLiteClient({ datasources: { db: { url: 'file:./dev.db' } } });
const postgres = new PostgresClient();

async function migrate() {
  // Migrate merchants
  const merchants = await sqlite.merchant.findMany();
  for (const merchant of merchants) {
    await postgres.merchant.create({ data: merchant });
  }
  
  // Migrate invoices
  const invoices = await sqlite.invoice.findMany();
  for (const invoice of invoices) {
    await postgres.invoice.create({ data: invoice });
  }
  
  // ... repeat for other models
  
  console.log('Migration complete!');
}

migrate();
```

## Common Commands

```bash
# View database in browser
pnpm prisma studio

# Check migration status
pnpm prisma migrate status

# Validate schema
pnpm prisma validate

# Format schema file
pnpm prisma format

# View generated SQL for migration
pnpm prisma migrate diff \
  --from-schema-datasource schema.prisma \
  --to-schema-datasource schema.prisma \
  --script
```

## Troubleshooting

### "Can't reach database server"
- Check `DATABASE_URL` and `DIRECT_URL` are correct
- Verify Supabase project is active
- Test connection: `psql "$DATABASE_URL"`

### "Prepared statement already exists"
- You're using pooled connection (port 6543) for migrations
- Use `DIRECT_URL` (port 5432) instead
- Prisma should automatically use `directUrl` for migrations

### "Connection pool timeout"
- Too many connections to Supabase
- Upgrade to Pro plan for more connections
- Or reduce connection pool size in app

### "Password authentication failed"
- Double-check password in connection string
- Reset password in Supabase dashboard if needed
- Ensure no special characters need URL encoding

## Advanced: Shadow Database

Prisma uses a "shadow database" for migration validation. With Supabase, this is handled automatically via the `directUrl` connection.

If you need to specify a separate shadow database:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
  shadowDatabaseUrl = env("SHADOW_DATABASE_URL") // optional
}
```

## Production Checklist

Before deploying to production:

- [ ] All migrations tested on staging Supabase project
- [ ] `DIRECT_URL` and `DATABASE_URL` set correctly
- [ ] Row Level Security (RLS) policies enabled in Supabase
- [ ] Database backups configured (automatic in Supabase Pro)
- [ ] Connection pooling configured (automatic with port 6543)
- [ ] Indexes verified for performance
- [ ] Sensitive data encrypted

## Resources

- [Prisma Migrations](https://www.prisma.io/docs/concepts/components/prisma-migrate)
- [Supabase + Prisma Guide](https://supabase.com/docs/guides/integrations/prisma)
- [Supabase Connection Pooling](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)

