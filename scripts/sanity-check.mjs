#!/usr/bin/env node
/**
 * Sanity-check: verify REFACTOR_PLAN verification routes.
 * Run after: npm run dev
 * Then manually verify:
 *   - http://localhost:3000/         -> redirects to /calendar
 *   - http://localhost:3000/calendar -> loads events, filters work
 *   - http://localhost:3000/venues   -> lists venues with counts
 *   - http://localhost:3000/venues/lux-fragil -> venue detail with events
 */

console.log('Refactor verification checklist:')
console.log('  1. / -> redirects to /calendar')
console.log('  2. /calendar -> loads events, search/tags/venues filters work')
console.log('  3. /venues -> lists venues with upcoming event counts')
console.log('  4. /venues/[slug] -> venue detail with upcoming events')
console.log('  5. Event modal opens with full details')
console.log('  6. URL state (q, cat, tag, venue, t) persists')
console.log('OK: See REFACTOR_PLAN.md for full checklist')
