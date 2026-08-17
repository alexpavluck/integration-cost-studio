# Vertical Program Integration Studio

A two-stage decision tool for evaluating whether/how to integrate vertical health
programs. Cost (or a chosen resource) is the objective; resource ceilings and a
funding envelope are hard constraints.

- **Set up** — programs, capacity & funding limits, and component categories
  (with cost ranges and an optional "government funded when merged" flag).
- **Analyze** — Stage 1 shortlists candidate bundles by the chosen objective;
  Stage 2 stress-tests each finalist's cost robustness on a 2D grid.
- **Decide** — the robust recommendation, a program-vs-country cost breakout, and
  a visual attribute map. Selecting any option updates the map.

Everything runs client-side (no backend, no database). Share links encode the
full scenario in the URL, so work can be shared without any server.

## Stack

Standard **Next.js 16** (App Router, React 19) + Tailwind CSS v4. Deploys to
Vercel with zero configuration.

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
```

## Verify

```bash
npm run lint     # eslint
npm run test     # node --test over the pure-logic modules in lib/
npm run build    # production build (next build)
```

## Deploy (Vercel)

Import the repo in Vercel (set the project root to this directory if it lives in
a subfolder of the repo). Vercel runs `next build` and serves it — no extra
configuration needed.
