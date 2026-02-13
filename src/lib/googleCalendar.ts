/**
 * Build a Google Calendar "Add event" URL for a given event.
 * Opens calendar.google.com with the event pre-filled; user can save to their calendar.
 */

import type { NormalizedEvent } from './eventsAdapter'

function toGoogleCalendarDate(date: Date): string {
  return date.toISOString().replace(/-/g, '').replace(/:/g, '').replace(/\.\d{3}/, '')
}

export function getGoogleCalendarUrl(event: NormalizedEvent): string {
  const start = new Date(event.start)
  const end = event.end ? new Date(event.end) : new Date(start.getTime() + 60 * 60 * 1000)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${toGoogleCalendarDate(start)}/${toGoogleCalendarDate(end)}`,
  })
  const props = event.extendedProps
  if (props.descriptionShort || props.descriptionLong) {
    const desc = [
      props.descriptionShort,
      props.descriptionLong,
      props.venueName && `Venue: ${props.venueName}`,
      props.ticketUrl && `Tickets: ${props.ticketUrl}`,
    ]
      .filter(Boolean)
      .join('\n\n')
    params.set('details', desc)
  }
  if (props.venueName || props.venueAddress) {
    const loc = [props.venueName, props.venueAddress].filter(Boolean).join(', ')
    params.set('location', loc)
  }
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
