# Next 3 Blog Post Briefs — Aguirre Modern Tile

Created 2026-06-12 by Chief of Staff dispatch.

**Why these three:** The 8 live posts are all *installation / cost* intent. The two
content types Vin named in the task — **tile selection guides** and **project showcases** —
have ZERO coverage. These three fill that gap and open buyer-intent + bottom-of-funnel traffic.

These are queue-ready: each maps to the `QueueItem` shape the engine consumes
(`scripts/blog-engine/src/queue.ts`). Add to the Payload CMS content queue, then run
`npm run start -- generate -n 3` (or one at a time).

---

## 1. Porcelain vs Ceramic Tile (SELECTION GUIDE)

- **keyword:** `porcelain vs ceramic tile`
- **slug:** `porcelain-vs-ceramic-tile`
- **articleType:** pillar
- **articleStyle:** comparison
- **serviceType:** general
- **hubSlug:** `tile-installation`
- **targetWords:** 2000
- **intent:** decision-stage, very high volume, pure-margin organic. The single most
  common tile-buyer question — and we don't rank for it at all yet.
- **outline (H2s):**
  1. Porcelain vs Ceramic: Which Should You Choose? (answer-first + comparison table)
  2. What's the Actual Difference? (water absorption <0.5% vs 3-7%, PEI rating, density)
  3. Cost Comparison: Porcelain vs Ceramic per Square Foot (table, Boston 2026 pricing)
  4. Which Lasts Longer in a Bathroom or Shower?
  5. Which Is Easier to Install (and to Cut)?
  6. Best Use Cases for Each (floors, walls, backsplash, outdoor)
  7. Our Recommendation by Room and Budget
- **internal links:** bathroom hub `complete-guide-bathroom-tile-installation`,
  `tile-installation-floor`, `tile-installation-for-bathroom`

## 2. Bathroom Tile Ideas: 12 Modern Designs (SELECTION / INSPIRATION)

- **keyword:** `bathroom tile ideas`
- **slug:** `bathroom-tile-ideas`
- **articleType:** pillar
- **articleStyle:** listicle
- **serviceType:** bathroom
- **hubSlug:** `complete-guide-bathroom-tile-installation`
- **targetWords:** 2200
- **intent:** top-of-funnel inspiration. Doubles as the **Pinterest content engine**
  (goals.md cross-venture play) — each of the 12 ideas is a pinnable image + caption.
- **outline (numbered H2s):** 12 designs, e.g. large-format porcelain, vertical subway,
  marble-look shower niche, hexagon floor, heated floor, two-tone wainscot, herringbone
  accent, matte black grout, zellige, terrazzo-look, curbless walk-in, wood-look plank.
  Each: the look, rough cost, who it suits, install note.
- **internal links:** `tile-installation-for-bathroom`, `12x24-tile-installation-patterns`,
  `porcelain-vs-ceramic-tile` (once #1 is live)

## 3. Revere Master Bath Remodel — Marble Shower + Heated Floor (PROJECT SHOWCASE)

- **keyword:** `bathroom tile remodel revere ma` (local, low-competition, high-conversion)
- **slug:** `revere-master-bathroom-remodel-marble-shower`
- **articleType:** spoke
- **articleStyle:** narrative (NEW "case-study" style recommended — see dependency)
- **serviceType:** bathroom
- **parentSlug:** `tile-installation-for-bathroom`
- **hubSlug:** `complete-guide-bathroom-tile-installation`
- **targetWords:** 1200
- **intent:** bottom-of-funnel proof. Real before/after, scope, materials, timeline,
  what went wrong + how we solved it. Strongest E-E-A-T + conversion signal we can publish.
- **outline (H2s):**
  1. The Project: What the Homeowner Wanted
  2. Before: The Problems We Found (failed waterproofing, dated 4x4 tile)
  3. The Plan: Materials & Layout (KERDI, Calacatta-look porcelain, DITRA-HEAT)
  4. The Build, Day by Day (demo -> waterproof -> set -> grout -> seal)
  5. The Result (before/after photos)
  6. What It Cost and How Long It Took
  7. Thinking About a Similar Remodel? (CTA)
- **DEPENDENCY:** needs (a) a real set of before/after photos from a Revere job, and
  ~~(b) a `case-study` article style added to `src/prompts/write.ts`~~ — **DONE 2026-06-13.**
  The `case-study` style is now wired through the engine (write.ts drafting template,
  edit.ts QA preamble, seo-scorer.ts style checks for before/after + cost/timeline,
  plus the QueueItem type). Verified with `npx tsc --noEmit` (exit 0). Set
  `articleStyle: "case-study"` on the queue item. The ONLY remaining blocker is the
  before/after photos from a real Revere job — until those exist, this post cannot be
  fully auto-generated.

---

### Engine command reference
- Queue status: `npm run start -- report`
- Generate: `npm run start -- generate -n 1` (respects hub-before-pillar prerequisites)
- Score: `npm run start -- score --all`
- Publish a batch: `npm run start -- publish -b <batch>`
</content>
</invoke>
