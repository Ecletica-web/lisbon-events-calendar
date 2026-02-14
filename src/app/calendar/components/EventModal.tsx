'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { getCategoryColor } from '@/lib/categoryColors'
import { toCanonicalTagKey } from '@/lib/eventsAdapter'
import { getGoogleCalendarUrl } from '@/lib/googleCalendar'
import type { NormalizedEvent } from '@/lib/eventsAdapter'
import FollowButton from '@/components/FollowButton'
import FollowVenueButton from '@/components/FollowVenueButton'
import EventActionButtons from '@/components/EventActionButtons'
import EventLikeCount from '@/components/EventLikeCount'
import EventCounts from '@/components/EventCounts'
import { useUserActions } from '@/contexts/UserActionsContext'
import { getEventReasons } from '@/lib/eventReasons'

interface EventModalProps {
  event: NormalizedEvent | null
  onClose: () => void
  reasons?: string[]
}

export default function EventModal({ event, onClose, reasons: reasonsProp }: EventModalProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const actions = useUserActions()
  const reasons = reasonsProp ?? (event && actions ? getEventReasons(event, {
    followedVenueIds: actions.actions.followedVenueIds,
    followedPromoterIds: actions.actions.followedPromoterIds,
  }) : [])

  useEffect(() => {
    if (!event) return
    contentRef.current?.scrollTo(0, 0)
  }, [event])

  if (!event) return null

  const startDate = new Date(event.start)
  const endDate = event.end ? new Date(event.end) : null
  const props = event.extendedProps
  const categoryColor = getCategoryColor(props.category)
  const status = props.status

  const formatDateTime = (date: Date, opts?: { timeStyle?: 'short' | undefined }) => {
    const timezone = props.timezone || 'Europe/Lisbon'
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'full',
      timeStyle: opts?.timeStyle ?? 'short',
      timeZone: timezone,
    }).format(date)
  }

  const formatPrice = () => {
    if (props.isFree) return 'Free'
    if (props.priceMin !== undefined && props.priceMax !== undefined) {
      if (props.priceMin === props.priceMax) {
        return `${props.priceMin} ${props.currency || 'EUR'}`
      }
      return `${props.priceMin} - ${props.priceMax} ${props.currency || 'EUR'}`
    }
    if (props.priceMin !== undefined) {
      return `From ${props.priceMin} ${props.currency || 'EUR'}`
    }
    return null
  }

  const statusLabel =
    status === 'postponed'
      ? 'Postponed'
      : status === 'sold_out'
        ? 'Sold out'
        : status === 'cancelled'
          ? 'Cancelled'
          : status === 'archived'
            ? 'Archived'
            : null

  const modalContent = (
    <div
      className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-[9999] overflow-hidden p-0 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-modal-title"
    >
      <div
        ref={contentRef}
        className="bg-slate-800/95 backdrop-blur-xl rounded-t-2xl sm:rounded-lg p-4 pb-[max(1rem,env(safe-area-inset-bottom))] max-w-md w-full max-h-[90vh] sm:max-h-[85vh] min-h-0 overflow-y-auto overflow-x-hidden border border-slate-700/50 shadow-2xl overscroll-contain flex-shrink-0 sm:mx-4 sm:my-8 touch-pan-y"
        style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={props.imageUrl || '/lisboa.png'}
          alt={event.title}
          className="w-full h-24 object-cover rounded-md mb-3"
          onError={(e) => {
            e.currentTarget.src = '/lisboa.png'
          }}
        />

        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0 flex items-start gap-2 flex-wrap">
            <h2
              id="event-modal-title"
              className="text-lg font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent"
            >
              {event.title}
            </h2>
            {statusLabel && (
              <span className="flex-shrink-0 px-2 py-0.5 rounded text-xs font-medium bg-amber-600/80 text-white">
                {statusLabel}
              </span>
            )}
          </div>
          <EventActionButtons eventId={event.id} eventTitle={event.title} eventStart={event.start} className="flex-shrink-0" />
        </div>
        {reasons.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {reasons.map((r) => (
              <span key={r} className="px-2 py-0.5 rounded text-xs bg-indigo-900/50 text-indigo-200 border border-indigo-700/50">
                {r}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3 flex-wrap mb-3">
          <EventCounts eventId={event.id} />
          <EventLikeCount eventId={event.id} />
        </div>

        <div className="space-y-2 mb-3 text-slate-200 text-xs">
          <div>
            <strong className="text-slate-100 text-xs">Date/Time:</strong>
            <div className="text-slate-300 text-xs">
              {props.opensAt ? (
                <>
                  {formatDateTime(startDate, { timeStyle: undefined })}
                  {endDate && ` – ${formatDateTime(endDate, { timeStyle: undefined })}`}
                  <span className="text-slate-400"> · Opens {props.opensAt}</span>
                </>
              ) : (
                <>
                  {formatDateTime(startDate)}
                  {endDate && ` – ${formatDateTime(endDate)}`}
                </>
              )}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              Timezone: {props.timezone || 'Europe/Lisbon'}
            </div>
          </div>

          {props.descriptionShort && (
            <div>
              <strong className="text-slate-100 text-xs">Description:</strong>
              <p className="mt-0.5 text-slate-300 text-xs">{props.descriptionShort}</p>
            </div>
          )}

          {props.descriptionLong && (
            <div>
              <strong className="text-slate-100 text-xs">Full Description:</strong>
              <p className="mt-0.5 whitespace-pre-wrap text-slate-300 text-xs">
                {props.descriptionLong}
              </p>
            </div>
          )}

          {props.venueName && (
            <div>
              <strong className="text-slate-100 text-xs">Venue:</strong>{' '}
              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                <Link
                  href={`/venues/${encodeURIComponent(props.venueId || props.venueKey || props.venueName?.toLowerCase().replace(/\s+/g, '-') || '')}`}
                  className="text-indigo-400 hover:text-indigo-300 hover:underline text-xs"
                >
                  {props.venueName}
                </Link>
                <FollowVenueButton
                  venueId={(props.venueId || props.venueKey || props.venueName || '').toString()}
                  displayName={props.venueName || ''}
                  size="sm"
                />
              </div>
              {props.venueAddress && (
                <div className="text-xs text-slate-400 mt-0.5">{props.venueAddress}</div>
              )}
              {props.neighborhood && (
                <div className="text-xs text-slate-400">{props.neighborhood}</div>
              )}
              {props.city && <div className="text-xs text-slate-400">{props.city}</div>}
            </div>
          )}

          {formatPrice() && (
            <div>
              <strong className="text-slate-100 text-xs">Price:</strong>{' '}
              <span className="text-slate-300 text-xs">{formatPrice()}</span>
            </div>
          )}

          {props.category && (
            <div>
              <strong className="text-slate-100 text-xs">Category:</strong>{' '}
              <span
                className="px-1.5 py-0.5 rounded text-xs text-white font-medium"
                style={{ backgroundColor: categoryColor }}
              >
                {props.category}
              </span>
            </div>
          )}

          {props.tags.length > 0 && (
            <div>
              <strong className="text-slate-100 text-xs">Tags:</strong>
              <div className="flex flex-wrap gap-1.5 mt-1 items-center">
                {props.tags.map((tag) => (
                  <span key={tag} className="flex items-center gap-1">
                    <span className="bg-slate-700/80 border border-slate-600/50 px-1.5 py-0.5 rounded text-xs text-slate-300">
                      {tag}
                    </span>
                    <FollowButton
                      type="tag"
                      normalizedValue={toCanonicalTagKey(tag)}
                      displayValue={tag}
                      size="sm"
                    />
                  </span>
                ))}
              </div>
            </div>
          )}

          {props.language && (
            <div>
              <strong className="text-slate-100 text-xs">Language:</strong>{' '}
              <span className="text-slate-300 text-xs">{props.language}</span>
            </div>
          )}

          {props.ageRestriction && (
            <div>
              <strong className="text-slate-100 text-xs">Age Restriction:</strong>{' '}
              <span className="text-slate-300 text-xs">{props.ageRestriction}</span>
            </div>
          )}

          {props.ticketUrl && (
            <div>
              <strong className="text-slate-100 text-xs">Tickets:</strong>{' '}
              <a
                href={props.ticketUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:text-indigo-300 hover:underline text-xs"
              >
                Buy Tickets
              </a>
            </div>
          )}

          {(props.sourceUrl || props.sourceName) && (
            <div>
              <strong className="text-slate-100 text-xs">Source:</strong>{' '}
              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                {props.sourceUrl ? (
                  <a
                    href={props.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-400 hover:text-indigo-300 hover:underline text-xs"
                  >
                    {props.sourceName || 'View Source'}
                  </a>
                ) : (
                  <span className="text-slate-300 text-xs">{props.sourceName}</span>
                )}
                {props.sourceName && (
                  <FollowButton
                    type="source"
                    normalizedValue={(props.sourceName || '').toLowerCase().trim()}
                    displayValue={props.sourceName}
                    size="sm"
                  />
                )}
              </div>
            </div>
          )}
        </div>

        <a
          href={getGoogleCalendarUrl(event)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-lg border border-slate-600/50 bg-slate-700/50 text-slate-200 text-sm font-medium hover:bg-slate-600/60 hover:text-white transition-colors mt-3"
        >
          <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.5 3h-1.5v.5h-1V3H7v.5H5.5V3H4c-.55 0-1 .45-1 1v16c0 .55.45 1 1 1h15.5c.55 0 1-.45 1-1V4c0-.55-.45-1-1-1zM19 19H5V9h14v10zm0-11H5V5h2v.5h1V5h7v.5h1V5h2v3z" />
          </svg>
          Add to Google Calendar
        </a>

        <button
          onClick={onClose}
          className="w-full bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:via-purple-500 hover:to-pink-500 px-3 py-1.5 rounded-md text-xs font-medium text-white transition-all shadow-md hover:shadow-lg mt-3"
        >
          Close
        </button>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent
}
