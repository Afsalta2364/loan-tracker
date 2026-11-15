# Loan Repayment Tracker

A web app for tracking loans with daily interest. Record payments on any date; each payment clears the interest built up so far, then reduces the principal.

## Features

- **My loans** – active loans, total outstanding principal, interest due today, payoff today, interest per day, and a card per loan (rate, tenure, start and end date, payoff at end of tenure).
- **Loan page** – record payments, balance chart, payment history, end-of-tenure figures, close-early planner, edit details.
- **Ledger** – date-wise opening + interest − repayment = outstanding, per loan or combined across all loans. Copy as CSV.
- **Calculator** – EMI, total interest and schedule for a new loan, then save it to track.
- **Gold** – a schedule of gold items (name, grams, purity, who has it now, since when, note). Moving an item to another person keeps a record of earlier holders. Filter by person, copy as CSV. At the bottom, **insights** show the grams (and 24K-equivalent) with each person and their share of the total.
- **Base currency** – picker in the top bar (display only, no conversion).

## How interest works

- Interest builds up daily at `annual rate ÷ 365` on the principal outstanding (simple interest; unpaid interest is not itself charged interest).
- There are no fixed EMI dates. A payment on any day pays the interest built up to that day first, then principal.

## Where data is stored

Everything is saved in the browser's **localStorage** (key `loanTracker.v3`). There is no server or database:

- Data stays on the device and browser where it was entered. It does not sync between devices.
- Clearing browser data deletes it.

## Project structure

```
index.html              page shell
assets/styles.css       styles
assets/app.js           all app logic (no dependencies)
favicon.svg             icon
icons/                  PNG app icons (192, 512, maskable 512, Apple 180)
manifest.webmanifest    app name, icons and colours for installing
sw.js                   service worker: makes it installable and work offline
vercel.json             clean URLs, security headers, service-worker headers
```

No build step and no npm packages. Fonts load from Google Fonts.

## Install as an app (PWA)

Once deployed (Vercel serves it over HTTPS, which installing needs):

- **Chrome / Edge on desktop or Android:** an **Install app** button appears in the top bar, or use the install icon in the address bar.
- **iPhone / iPad (Safari):** tap **Install app** for instructions, or tap Share → **Add to Home Screen**.

The installed app opens in its own window and works offline. When you deploy a change, it picks up the new version the next time it opens online. If you change file names or want to clear old caches, bump `VERSION` in `sw.js` (and the `?v=` numbers in `index.html` and `sw.js`).

## Run locally

Open `index.html` directly, or serve the folder:

```bash
npx serve .
# or
python3 -m http.server 8000
```

## Deploy to Vercel

**Option A – GitHub (recommended)**

1. Create a new GitHub repository and upload these files (keep the folder structure).
2. In Vercel, click **Add New → Project** and import the repository.
3. Framework Preset: **Other**. Leave Build Command and Output Directory empty. Root Directory: the folder that contains `index.html`.
4. Click **Deploy**. Every push to the repo redeploys automatically.

**Option B – Vercel CLI**

```bash
npm i -g vercel
cd loan-tracker-web
vercel          # first deploy (preview)
vercel --prod   # production
```

**Option C – Drag and drop**

On vercel.com, create a new project and upload this folder.
