# Mahalaxmi Stock Engine — setup

## 1. Run one SQL file in Supabase
Open your Supabase project → **SQL Editor** → New Query → paste the entire contents
of `supabase-app-state.sql` → **Run**.

## 2. Create your first login
Supabase → **Authentication** → **Users** → **Add user** → enter your email + a password.
This is how you'll log into the app. Add one more per staff member the same way, any time.

## 3. Upload this folder to GitHub
On your empty GitHub repo page, click **"uploading an existing file"** (or **Add file →
Upload files**), then drag this entire unzipped `mahalaxmi-app` folder into the browser
window. Commit the changes.

## 4. Deploy on Vercel
- Go to vercel.com → sign in with GitHub → **Add New → Project** → pick this repo → **Import**.
- Vercel will detect it's a Vite project automatically. Before clicking Deploy, open
  **Environment Variables** and add:
  - `VITE_SUPABASE_URL` → from Supabase: Project Settings → API → Project URL
  - `VITE_SUPABASE_ANON_KEY` → from Supabase: Project Settings → API → anon public key
- Click **Deploy**.

## 5. Test it
Open the live link Vercel gives you, sign in with the account from step 2, and confirm
your data loads and saves.
