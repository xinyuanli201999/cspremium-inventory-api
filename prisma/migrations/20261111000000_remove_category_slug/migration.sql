-- Remove the obsolete category URL slug and its unique index.
DROP INDEX IF EXISTS "Category_slug_key";
ALTER TABLE "Category" DROP COLUMN "slug";
