# My Diet MVP Skeleton

Minimal frontend skeleton for a personal calorie and macro tracker.

## Stack

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Mobile-first layout
- PWA-ready manifest structure

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Available routes

- `/` -> Today
- `/add-entry` -> Add Entry
- `/foods` -> Foods
- `/recipes` -> Recipes
- `/progress` -> Progress
- `/settings` -> Settings

## Project structure

- `src/app/layout.tsx` - global app shell + mobile bottom navigation
- `src/app/globals.css` - base global styles
- `src/app/manifest.ts` - PWA manifest route
- `src/components/mobile-bottom-nav.tsx` - bottom navigation bar
- `src/components/page-screen.tsx` - simple page placeholder block

## Scripts

- `npm run dev` - start dev server
- `npm run build` - production build
- `npm run start` - run production build
- `npm run lint` - run lint checks

## Production deploy (Vercel)

### Pre-deploy checks

```bash
npm install
npm run lint
npm run build
```

### Environment variables

No environment variables are required for the current MVP.

### Initialize git (if needed)

```bash
git init
git add .
git commit -m "Initial MVP commit"
git branch -M main
```

### Push to GitHub

1. Create a new empty repository on GitHub.
2. Copy repository URL and run:

```bash
git remote add origin https://github.com/<your-user>/<your-repo>.git
git push -u origin main
```

### Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Or use the Vercel dashboard:

1. Log in to Vercel.
2. Click `Add New...` -> `Project`.
3. Import your GitHub repository.
4. Keep defaults:
   - Framework Preset: `Next.js`
   - Build Command: `next build`
   - Output Directory: `.next` (auto)
5. Click `Deploy`.

After deploy, Vercel provides a public URL that you can open on phone.
