# Home Inventory

Chater's home inventory app: a replacement for UnderMyRoof that runs in the browser on any device.
Data lives in [Supabase](https://supabase.com); the web app is hosted on [Vercel](https://vercel.com).

## Features

- **Nested locations** (house → room → shelf → box) with item counts, plus an "(unspecified)" bucket
- **Items** with description, category, tags, quantity, value and currency per item, purchase date and store,
  brand, model, serial number, barcode and notes
- **Photos, receipts and file attachments** per item (photos are shrunk before upload to save storage)
- **Browse by location, category or tag**, and search across every field
- **Bulk actions**: select several items to move, tag or delete them together
- **Household sharing**: invite family members with a code; everyone sees the same inventory
- **CSV import** with column matching (for your UnderMyRoof export) and **CSV export** for backups
- Works on phone, tablet and desktop; can be added to the home screen

## How it fits together

```
Browser (Next.js app on Vercel) ──► Supabase
                                     ├─ Auth (email + password)
                                     ├─ Postgres (tables in supabase/migrations)
                                     └─ Storage bucket "item-files" (private)
```

The app talks to Supabase directly from the browser. Security is enforced in the database with row level
security: a signed-in user can only read or change rows, and files, belonging to a household they are a
member of. The publishable key in the browser is safe to expose; never put the secret / service-role key in
the app.

## One-time setup

### 1. Create the Supabase project

1. Sign in at [supabase.com](https://supabase.com) and create a new project. Pick a region near you
   (e.g. Singapore `ap-southeast-1`).
2. Apply the database schema, either way works:
   - **Dashboard:** open *SQL Editor*, paste the contents of
     `supabase/migrations/20261018000000_init.sql`, and run it.
   - **CLI:** `npx supabase login`, `npx supabase link --project-ref <your-project-ref>`, then
     `npx supabase db push`.
3. In *Authentication → URL Configuration*, set **Site URL** to your Vercel address (e.g.
   `https://homeinventory.vercel.app`) and add it under **Redirect URLs** too. Confirmation and
   password-reset emails link there.
4. In *Project Settings → API Keys*, copy the **Project URL** and the **publishable** key
   (older projects call it the `anon` key).

### 2. Deploy to Vercel

1. In Vercel choose *Add New → Project* and import the `dachater/homeinventory` GitHub repo.
   The Next.js preset is detected automatically.
2. Under *Environment Variables* add:
   - `NEXT_PUBLIC_SUPABASE_URL`: the Project URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: the publishable (or anon) key
3. Deploy. Every push to `main` redeploys automatically.

### 3. First use

1. Open the site, choose **Create an account**, and confirm your email.
2. Create your inventory (e.g. "Chater's Items & Storage") and choose a default currency.
3. To share it, open **Settings → Members → Create invite code** and send the code. The other person
   creates an account, picks **Join someone else's**, and enters the code.

## Importing from UnderMyRoof

1. In UnderMyRoof, export your items to CSV.
2. In this app open **Settings → Import / export**, choose the CSV file, check the column matches and the
   preview, then **Import**.
   - Nested locations are created from paths like `Taioma Close > Kitchen > Pantry`. Pick the separator
     your export uses, or "Not nested".
   - Values like `RM 1,050.50` are understood. Rows without a currency column use your default currency.
   - Photos can't come across in a CSV; add them to items afterwards.

Running the import twice creates duplicate items, so import into an empty inventory or check first.

## Local development

Needs Node 20+ and, for a local database, Docker.

```bash
npm install
npx supabase start            # local Supabase with the migration applied
cp .env.example .env.local    # then fill in the URL and publishable key that `supabase start` prints
npm run dev                   # http://localhost:3000
```

Without Docker, point `.env.local` at a hosted Supabase project instead.

To change the database, add a new file in `supabase/migrations/` and run `npx supabase db push`
(or paste it into the SQL Editor).

## Project layout

| Path | What's there |
| --- | --- |
| `supabase/migrations/` | Tables, triggers, row level security, storage bucket and policies |
| `src/components/Inventory.tsx` | Main three-pane screen and data loading |
| `src/components/Sidebar.tsx` | Location tree, categories, tags, search |
| `src/components/ItemList.tsx` | Item list, sorting and bulk actions |
| `src/components/ItemDetail.tsx` | Item details, photos, receipts and files |
| `src/components/Settings.tsx` | Inventory, members and invites, categories and tags, import/export, account |
| `src/lib/data.ts` | Supabase queries and file uploads |
| `src/lib/csv.ts` | CSV import and export |
