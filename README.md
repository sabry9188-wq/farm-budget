# Farm Budget – AMSC Cage Farm

Budget planner and tracker for Station 05, Offshore 01 and Offshore 02.

- Static site: `index.html`, `styles.css`, `app.js` (no build step)
- Data: Supabase project **farm-netlog**, tables starting with `budget_`
- Login: same email and password as NetLog
- Style: "Budget Planner" design system

## Deploy to Vercel (about 5 minutes)

1. On GitHub, create a new private repo called `farm-budget`.
2. Click **Add file → Upload files**. Drag in `index.html`, `styles.css`, `app.js` and this README. Commit.
3. On Vercel, click **Add New → Project**, pick the `farm-budget` repo, and click **Deploy**.
   Framework preset: **Other**. No build command. No environment variables needed.
4. Copy the site address (e.g. `farm-budget-xxx.vercel.app`).
5. In Supabase → farm-netlog → **Authentication → URL Configuration**, add that address to
   **Redirect URLs**. This is only needed for the "Forgot password" email link.

After this, every change pushed to GitHub deploys by itself.

## Roles

- **Admin** – set up the budget, approve, close the year, add people
- **Editor** – add and edit expenses
- **Viewer** – see only

Add people in **Settings & Help → Budget Team**. They need a NetLog login first.
