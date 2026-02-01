/**
 * View state represents the complete filter and view configuration
 */
export interface ViewState {
  viewMode: 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay'
  dateFocus: string // ISO date string (YYYY-MM-DD)
  searchQuery: string
  selectedCategories: string[]
  selectedTags: string[]
  toggles: {
    freeOnly: boolean
    excludeExhibitions: boolean
    excludeContinuous: boolean
  }
}

/**
 * Default view state
 */
export const DEFAULT_VIEW_STATE: ViewState = {
  viewMode: 'dayGridMonth',
  dateFocus: new Date().toISOString().split('T')[0], // Today
  searchQuery: '',
  selectedCategories: [],
  selectedTags: [],
  toggles: {
    freeOnly: false,
    excludeExhibitions: false,
    excludeContinuous: true,
  },
}

/**
 * Serialize view state to URL query params
 */
export function serializeViewStateToURL(state: ViewState): Record<string, string> {
  const params: Record<string, string> = {}
  
  if (state.viewMode !== DEFAULT_VIEW_STATE.viewMode) {
    params.v = state.viewMode
  }
  
  if (state.dateFocus !== DEFAULT_VIEW_STATE.dateFocus) {
    params.d = state.dateFocus
  }
  
  if (state.searchQuery) {
    params.q = encodeURIComponent(state.searchQuery)
  }
  
  if (state.selectedCategories.length > 0) {
    params.cat = state.selectedCategories.join(',')
  }
  
  if (state.selectedTags.length > 0) {
    params.tag = state.selectedTags.join(',')
  }
  
  const toggleFlags: string[] = []
  if (state.toggles.freeOnly) toggleFlags.push('free')
  if (state.toggles.excludeExhibitions) toggleFlags.push('noex')
  if (state.toggles.excludeContinuous) toggleFlags.push('nocont')
  
  if (toggleFlags.length > 0) {
    params.t = toggleFlags.join(',')
  }
  
  return params
}

/**
 * Deserialize view state from URL query params
 */
export function deserializeViewStateFromURL(
  searchParams: URLSearchParams
): Partial<ViewState> {
  const state: Partial<ViewState> = {}
  
  const viewMode = searchParams.get('v')
  if (viewMode && ['dayGridMonth', 'timeGridWeek', 'timeGridDay'].includes(viewMode)) {
    state.viewMode = viewMode as ViewState['viewMode']
  }
  
  const dateFocus = searchParams.get('d')
  if (dateFocus) {
    // Validate date format
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateFocus)) {
      state.dateFocus = dateFocus
    }
  }
  
  const searchQuery = searchParams.get('q')
  if (searchQuery) {
    state.searchQuery = decodeURIComponent(searchQuery)
  }
  
  const categories = searchParams.get('cat')
  if (categories) {
    state.selectedCategories = categories.split(',').filter(Boolean)
  }
  
  const tags = searchParams.get('tag')
  if (tags) {
    state.selectedTags = tags.split(',').filter(Boolean)
  }
  
  const toggles = searchParams.get('t')
  if (toggles) {
    const flags = toggles.split(',')
    state.toggles = {
      freeOnly: flags.includes('free'),
      excludeExhibitions: flags.includes('noex'),
      excludeContinuous: flags.includes('nocont'),
    }
  }
  
  return state
}

/**
 * Merge view state with defaults
 */
export function mergeViewState(partial: Partial<ViewState>): ViewState {
  return {
    ...DEFAULT_VIEW_STATE,
    ...partial,
    toggles: {
      ...DEFAULT_VIEW_STATE.toggles,
      ...(partial.toggles || {}),
    },
  }
}

/**
 * Check if view state is different from default
 */
export function isViewStateDefault(state: ViewState): boolean {
  return (
    state.viewMode === DEFAULT_VIEW_STATE.viewMode &&
    state.dateFocus === DEFAULT_VIEW_STATE.dateFocus &&
    state.searchQuery === '' &&
    state.selectedCategories.length === 0 &&
    state.selectedTags.length === 0 &&
    !state.toggles.freeOnly &&
    !state.toggles.excludeExhibitions &&
    state.toggles.excludeContinuous
  )
}
