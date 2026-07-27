import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { getSheetsEditUrl, readWatchlistFromSheets, resolveSpreadsheetId } from '@/lib/googleSheets'
import { loadWatchlistFromCatalog, getCatalogSource, countCatalogRows } from '@/lib/adminCatalog'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const catalogSource = getCatalogSource()
  try {
    if (catalogSource !== 'sheets') {
      const counts = await countCatalogRows()
      if (catalogSource === 'supabase' || counts.venues + counts.promoters > 0) {
        const rows = await loadWatchlistFromCatalog()
        return NextResponse.json({
          rows,
          source: 'supabase',
          sheetsUrl: getSheetsEditUrl(),
          canWrite: false,
          editHint:
            'Scrape handles come from Supabase venues/promoters (instagram_handle + is_active). Edit in /admin/venues and /admin/promoters.',
        })
      }
    }

    const hasSheet =
      !!resolveSpreadsheetId() ||
      !!process.env.NEXT_PUBLIC_VENUES_CSV_URL?.trim() ||
      !!process.env.NEXT_PUBLIC_PROMOTERS_CSV_URL?.trim()

    if (!hasSheet) {
      return NextResponse.json(
        {
          error:
            'No catalog — seed Supabase venues/promoters, set NEXT_PUBLIC_VENUES_CSV_URL, or GOOGLE_SHEETS_ID',
          rows: [],
          canWrite: false,
        },
        { status: 503 }
      )
    }

    const rows = await readWatchlistFromSheets()
    return NextResponse.json({
      rows,
      source: 'sheets',
      sheetsUrl: getSheetsEditUrl(),
      canWrite: false,
      editHint:
        'Scrape handles come from the Venues + Promoters sheets (instagram_handle + is_active), not Fontes IG. Edit those tabs or /admin/venues after seeding.',
    })
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Failed',
        rows: [],
        canWrite: false,
      },
      { status: 500 }
    )
  }
}

/** Writing Fontes IG is retired — edit Venues/Promoters (Sheets or /admin). */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  return NextResponse.json(
    {
      error:
        'Watchlist write retired. Edit Venues/Promoters (instagram_handle + is_active) in Google Sheets or /admin/venues and /admin/promoters.',
    },
    { status: 410 }
  )
}
