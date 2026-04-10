#!/usr/bin/env node

const API_BASE = 'https://cms-azure-one.vercel.app/api/content-queue';
const AUTH_HEADER = 'users API-Key 765a1b119c5227ac6e241b798e416332dfa71b3d';

// Primary rules: match on keyword text (checked first, highest confidence)
const KEYWORD_RULES = [
  { type: 'bathroom', patterns: ['bathroom', 'bath', 'vanity', 'toilet'] },
  { type: 'shower', patterns: ['shower', 'walk-in', 'steam', 'curbless'] },
  { type: 'floor', patterns: ['floor', 'subfloor', 'concrete', 'plywood', 'hardwood', 'wood-look', 'basement', 'entryway', 'mudroom', 'carpet tile'] },
  { type: 'backsplash', patterns: ['backsplash', 'kitchen', 'cabinet', 'countertop'] },
  { type: 'repair', patterns: ['repair', 'fix', 'crack', 'replace', 'regrout', 'grout repair', 'loose tile', 'water damage', 'unevenly', 'upside down', 'uneven'] },
  { type: 'reglazing', patterns: ['reglaz', 'refinish', 'resurface'] },
];

// Secondary rules: parentSlug-based classification
const PARENT_SLUG_MAP = {
  '12x24-tile-installation-patterns': 'floor',   // pattern/layout articles are about floor tile
  'tile-installation-cost-per-square-foot': 'floor', // cost-per-sqft is predominantly floor tile
};

// Tertiary rules: keyword-context patterns for general tile installation articles
const CONTEXT_RULES = [
  // Pattern/layout terms → floor (tile patterns are almost always floor)
  { type: 'floor', patterns: ['herringbone', 'offset', 'running bond', 'ashlar', 'grid', 'pattern', 'layouts', 'direction', 'vertical', 'designs', 'design ideas', 'diagram', '50 50', '1 3 offset', '1/3'] },
  // Wall-specific → bathroom (wall tile is most commonly bathroom)
  { type: 'bathroom', patterns: ['wall', 'on wall', 'ceiling'] },
  // Outdoor → floor
  { type: 'floor', patterns: ['outdoor', 'yard', 'drain'] },
  // Tile size articles (NxN) → floor (large format tile is predominantly floor)
  { type: 'floor', regex: /^\d+x\d+\s+tile\s+install/ },
  { type: 'floor', regex: /tile\s+install\w*\s+\d+x\d+/ },
  // Cost/pricing articles → floor (most common tile installation type)
  { type: 'floor', patterns: ['cost', 'price', 'rate', 'calculator', 'estimate', 'labor', 'square foot', 'square meter', 'hourly'] },
];

function inferServiceType(item) {
  const keyword = (item.keyword || '').toLowerCase();
  const parentSlug = (item.parentSlug || '').toLowerCase();
  const hubSlug = (item.hubSlug || '').toLowerCase();
  const slug = (item.slug || '').toLowerCase();
  const searchText = `${keyword} ${parentSlug} ${hubSlug}`;

  // 1. Primary: direct keyword match
  for (const rule of KEYWORD_RULES) {
    for (const pattern of rule.patterns) {
      if (searchText.includes(pattern)) {
        return rule.type;
      }
    }
  }

  // 2. Secondary: parentSlug-based
  if (PARENT_SLUG_MAP[parentSlug]) {
    return PARENT_SLUG_MAP[parentSlug];
  }

  // 3. Tertiary: context-based keyword patterns
  for (const rule of CONTEXT_RULES) {
    if (rule.patterns) {
      for (const pattern of rule.patterns) {
        if (keyword.includes(pattern)) {
          return rule.type;
        }
      }
    }
    if (rule.regex && rule.regex.test(keyword)) {
      return rule.type;
    }
  }

  return 'general';
}

async function fetchAllGeneral() {
  const items = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `${API_BASE}?where[serviceType][equals]=general&limit=100&page=${page}`;
    console.log(`Fetching page ${page}...`);
    const res = await fetch(url, {
      headers: { Authorization: AUTH_HEADER },
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch page ${page}: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    items.push(...data.docs);
    hasMore = data.hasNextPage;
    page++;
  }
  return items;
}

async function patchItem(id, serviceType) {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: 'PATCH',
    headers: {
      Authorization: AUTH_HEADER,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ serviceType }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PATCH ${id} failed: ${res.status} — ${text}`);
  }
  return res.json();
}

async function main() {
  console.log('Fetching all content-queue items with serviceType=general...\n');
  const items = await fetchAllGeneral();
  console.log(`Found ${items.length} items with serviceType=general\n`);

  const summary = {};
  const changes = [];

  for (const item of items) {
    const newType = inferServiceType(item);
    if (newType !== 'general') {
      changes.push({ id: item.id, keyword: item.keyword, from: 'general', to: newType });
    }
    summary[newType] = (summary[newType] || 0) + 1;
  }

  console.log('Inference summary:');
  for (const [type, count] of Object.entries(summary).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }
  console.log(`\nTotal to update: ${changes.length} items\n`);

  if (changes.length === 0) {
    console.log('Nothing to update.');
    return;
  }

  // Batch updates with concurrency limit
  const CONCURRENCY = 5;
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < changes.length; i += CONCURRENCY) {
    const batch = changes.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(c => patchItem(c.id, c.to))
    );

    for (let j = 0; j < results.length; j++) {
      const change = batch[j];
      if (results[j].status === 'fulfilled') {
        updated++;
        console.log(`  [${updated}/${changes.length}] ${change.keyword} → ${change.to}`);
      } else {
        failed++;
        console.error(`  FAILED: ${change.keyword} — ${results[j].reason.message}`);
      }
    }
  }

  console.log(`\n=== DONE ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Failed: ${failed}`);
  console.log(`Kept as general: ${summary['general'] || 0}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
