'use client'

import { useMemo } from 'react'
import { NormalizedEvent, filterEvents } from '@/lib/eventsAdapter'
import EventCardsSlider from './EventCardsSlider'
import { format, addDays } from 'date-fns'

// Helper to format date safely
const formatDate = (date: Date, formatStr: string) => {
  try {
    return format(date, formatStr)
  } catch (e) {
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }
}

interface MobileDaySlidersProps {
  events: NormalizedEvent[]
  onEventClick: (event: NormalizedEvent) => void
  selectedCategories: string[]
  selectedTags: string[]
  freeOnly: boolean
  excludeExhibitions: boolean
  excludeContinuous: boolean
  onCategoriesChange?: (categories: string[]) => void
  onTagsChange?: (tags: string[]) => void
}

export default function MobileDaySliders({
  events,
  onEventClick,
  selectedCategories,
  selectedTags,
  freeOnly,
  excludeExhibitions,
  excludeContinuous,
  onCategoriesChange,
  onTagsChange,
}: MobileDaySlidersProps) {
  // Generate 7 days starting from today (T+0 to T+6)
  const days = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(today, i)
      const dayStart = new Date(day)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(day)
      dayEnd.setHours(23, 59, 59, 999)
      
      return {
        date: day,
        start: dayStart,
        end: dayEnd,
        label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : formatDate(day, 'EEE, MMM d'),
      }
    })
  }, [])

  // Filter events for each day
  const eventsByDay = useMemo(() => {
    return days.map(day => {
      // First filter by date range
      let dayEvents = events.filter(event => {
        const eventStart = new Date(event.start)
        return eventStart >= day.start && eventStart <= day.end
      })

      // Apply all other filters
      dayEvents = filterEvents(dayEvents, {
        selectedTags,
        categories: selectedCategories,
        freeOnly,
      })

      // Exclude exhibitions
      if (excludeExhibitions) {
        dayEvents = dayEvents.filter((event) => {
          const category = event.extendedProps.category?.toLowerCase()
          const tags = event.extendedProps.tags.map((t) => t.toLowerCase())
          return category !== 'arts' && !tags.includes('exhibition')
        })
      }

      if (excludeContinuous) {
        dayEvents = dayEvents.filter((event) => {
          if (!event.allDay) return true
          if (event.end) {
            const start = new Date(event.start)
            const end = new Date(event.end)
            const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
            return daysDiff <= 1
          }
          return true
        })
      }

      // Sort chronologically
      return dayEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    })
  }, [events, days, selectedCategories, selectedTags, freeOnly, excludeExhibitions, excludeContinuous])

  const handleRemoveTag = (tag: string) => {
    if (onTagsChange) {
      const newTags = selectedTags.filter(t => t !== tag)
      onTagsChange(newTags)
    }
  }

  return (
    <div className="w-full space-y-6 pb-6">
      {days.map((day, index) => (
        <div key={index} className="w-full">
          {/* Day Header */}
          <div className="mb-3 px-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-white">
                {day.label}
              </h3>
              <span className="text-sm text-slate-400">
                {eventsByDay[index].length} event{eventsByDay[index].length !== 1 ? 's' : ''}
              </span>
            </div>
            
            {/* Selected Tags for this day */}
            {selectedTags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-gradient-to-r from-indigo-600/80 to-purple-600/80 text-white border border-indigo-500/50"
                  >
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:bg-indigo-500/50 rounded-full p-0.5 transition-colors flex items-center justify-center"
                      aria-label={`Remove ${tag}`}
                    >
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Day Slider */}
          {eventsByDay[index].length > 0 ? (
            <EventCardsSlider
              events={eventsByDay[index]}
              onEventClick={onEventClick}
              selectedCategories={selectedCategories}
              selectedTags={selectedTags}
              freeOnly={freeOnly}
              excludeExhibitions={excludeExhibitions}
              excludeContinuous={excludeContinuous}
              onCategoriesChange={onCategoriesChange}
              onTagsChange={onTagsChange}
              mode="slider"
              hideHeader={true}
            />
          ) : (
            <div className="text-center py-6 px-4 bg-slate-800/40 rounded-lg border border-slate-700/30 mx-4">
              <div className="text-slate-400 text-sm">No events for {day.label.toLowerCase()}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
