import { describe, it, expect } from '@jest/globals'
import {
  ViewState,
  DEFAULT_VIEW_STATE,
  serializeViewStateToURL,
  deserializeViewStateFromURL,
  mergeViewState,
  isViewStateDefault,
} from '../viewState'

describe('viewState', () => {
  describe('serializeViewStateToURL', () => {
    it('should return empty object for default state', () => {
      const params = serializeViewStateToURL(DEFAULT_VIEW_STATE)
      expect(params).toEqual({})
    })

    it('should serialize view mode when different from default', () => {
      const state: ViewState = {
        ...DEFAULT_VIEW_STATE,
        viewMode: 'timeGridWeek',
      }
      const params = serializeViewStateToURL(state)
      expect(params.v).toBe('timeGridWeek')
    })

    it('should serialize date focus when different from default', () => {
      const state: ViewState = {
        ...DEFAULT_VIEW_STATE,
        dateFocus: '2024-01-15',
      }
      const params = serializeViewStateToURL(state)
      expect(params.d).toBe('2024-01-15')
    })

    it('should serialize search query', () => {
      const state: ViewState = {
        ...DEFAULT_VIEW_STATE,
        searchQuery: 'test query',
      }
      const params = serializeViewStateToURL(state)
      expect(params.q).toBe('test%20query')
    })

    it('should serialize selected categories', () => {
      const state: ViewState = {
        ...DEFAULT_VIEW_STATE,
        selectedCategories: ['music', 'cinema'],
      }
      const params = serializeViewStateToURL(state)
      expect(params.cat).toBe('music,cinema')
    })

    it('should serialize selected tags', () => {
      const state: ViewState = {
        ...DEFAULT_VIEW_STATE,
        selectedTags: ['rock', 'jazz'],
      }
      const params = serializeViewStateToURL(state)
      expect(params.tag).toBe('rock,jazz')
    })

    it('should serialize toggle flags', () => {
      const state: ViewState = {
        ...DEFAULT_VIEW_STATE,
        toggles: {
          freeOnly: true,
          excludeExhibitions: true,
          excludeContinuous: false,
        },
      }
      const params = serializeViewStateToURL(state)
      expect(params.t).toBe('free,noex')
    })

    it('should serialize all fields together', () => {
      const state: ViewState = {
        viewMode: 'timeGridDay',
        dateFocus: '2024-02-20',
        searchQuery: 'concert',
        selectedCategories: ['music'],
        selectedTags: ['rock', 'live'],
        toggles: {
          freeOnly: true,
          excludeExhibitions: false,
          excludeContinuous: true,
        },
      }
      const params = serializeViewStateToURL(state)
      expect(params).toEqual({
        v: 'timeGridDay',
        d: '2024-02-20',
        q: 'concert',
        cat: 'music',
        tag: 'rock,live',
        t: 'free,nocont',
      })
    })
  })

  describe('deserializeViewStateFromURL', () => {
    it('should return empty object for empty search params', () => {
      const params = new URLSearchParams()
      const state = deserializeViewStateFromURL(params)
      expect(state).toEqual({})
    })

    it('should deserialize view mode', () => {
      const params = new URLSearchParams('v=timeGridWeek')
      const state = deserializeViewStateFromURL(params)
      expect(state.viewMode).toBe('timeGridWeek')
    })

    it('should ignore invalid view mode', () => {
      const params = new URLSearchParams('v=invalid')
      const state = deserializeViewStateFromURL(params)
      expect(state.viewMode).toBeUndefined()
    })

    it('should deserialize date focus', () => {
      const params = new URLSearchParams('d=2024-01-15')
      const state = deserializeViewStateFromURL(params)
      expect(state.dateFocus).toBe('2024-01-15')
    })

    it('should ignore invalid date format', () => {
      const params = new URLSearchParams('d=invalid-date')
      const state = deserializeViewStateFromURL(params)
      expect(state.dateFocus).toBeUndefined()
    })

    it('should deserialize search query', () => {
      const params = new URLSearchParams('q=test%20query')
      const state = deserializeViewStateFromURL(params)
      expect(state.searchQuery).toBe('test query')
    })

    it('should deserialize selected categories', () => {
      const params = new URLSearchParams('cat=music,cinema')
      const state = deserializeViewStateFromURL(params)
      expect(state.selectedCategories).toEqual(['music', 'cinema'])
    })

    it('should deserialize selected tags', () => {
      const params = new URLSearchParams('tag=rock,jazz')
      const state = deserializeViewStateFromURL(params)
      expect(state.selectedTags).toEqual(['rock', 'jazz'])
    })

    it('should deserialize toggle flags', () => {
      const params = new URLSearchParams('t=free,noex')
      const state = deserializeViewStateFromURL(params)
      expect(state.toggles).toEqual({
        freeOnly: true,
        excludeExhibitions: true,
        excludeContinuous: false,
      })
    })

    it('should deserialize all fields together', () => {
      const params = new URLSearchParams(
        'v=timeGridDay&d=2024-02-20&q=concert&cat=music&tag=rock,live&t=free,nocont'
      )
      const state = deserializeViewStateFromURL(params)
      expect(state).toEqual({
        viewMode: 'timeGridDay',
        dateFocus: '2024-02-20',
        searchQuery: 'concert',
        selectedCategories: ['music'],
        selectedTags: ['rock', 'live'],
        toggles: {
          freeOnly: true,
          excludeExhibitions: false,
          excludeContinuous: true,
        },
      })
    })
  })

  describe('mergeViewState', () => {
    it('should merge partial state with defaults', () => {
      const partial = {
        searchQuery: 'test',
        selectedCategories: ['music'],
      }
      const merged = mergeViewState(partial)
      expect(merged).toEqual({
        ...DEFAULT_VIEW_STATE,
        searchQuery: 'test',
        selectedCategories: ['music'],
      })
    })

    it('should merge toggles correctly', () => {
      const partial = {
        toggles: {
          freeOnly: true,
        },
      }
      const merged = mergeViewState(partial)
      expect(merged.toggles).toEqual({
        freeOnly: true,
        excludeExhibitions: false,
        excludeContinuous: false,
      })
    })
  })

  describe('isViewStateDefault', () => {
    it('should return true for default state', () => {
      expect(isViewStateDefault(DEFAULT_VIEW_STATE)).toBe(true)
    })

    it('should return false when view mode differs', () => {
      const state: ViewState = {
        ...DEFAULT_VIEW_STATE,
        viewMode: 'timeGridWeek',
      }
      expect(isViewStateDefault(state)).toBe(false)
    })

    it('should return false when search query is set', () => {
      const state: ViewState = {
        ...DEFAULT_VIEW_STATE,
        searchQuery: 'test',
      }
      expect(isViewStateDefault(state)).toBe(false)
    })

    it('should return false when categories are selected', () => {
      const state: ViewState = {
        ...DEFAULT_VIEW_STATE,
        selectedCategories: ['music'],
      }
      expect(isViewStateDefault(state)).toBe(false)
    })

    it('should return false when tags are selected', () => {
      const state: ViewState = {
        ...DEFAULT_VIEW_STATE,
        selectedTags: ['rock'],
      }
      expect(isViewStateDefault(state)).toBe(false)
    })

    it('should return false when toggles are enabled', () => {
      const state: ViewState = {
        ...DEFAULT_VIEW_STATE,
        toggles: {
          ...DEFAULT_VIEW_STATE.toggles,
          freeOnly: true,
        },
      }
      expect(isViewStateDefault(state)).toBe(false)
    })
  })

  describe('backward compatibility', () => {
    it('should handle missing fields gracefully', () => {
      const params = new URLSearchParams('v=timeGridWeek')
      const state = deserializeViewStateFromURL(params)
      const merged = mergeViewState(state)
      expect(merged).toEqual({
        ...DEFAULT_VIEW_STATE,
        viewMode: 'timeGridWeek',
      })
    })

    it('should handle empty arrays in URL params', () => {
      const params = new URLSearchParams('cat=&tag=')
      const state = deserializeViewStateFromURL(params)
      expect(state.selectedCategories).toEqual([])
      expect(state.selectedTags).toEqual([])
    })
  })
})
