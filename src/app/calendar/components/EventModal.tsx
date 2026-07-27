'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { toCanonicalTagKey } from '@/lib/eventsAdapter'
import { getGoogleCalendarUrl } from '@/lib/googleCalendar'
import type { NormalizedEvent } from '@/lib/eventsAdapter'
import FollowButton from '@/components/FollowButton'
import FollowVenueButton from '@/components/FollowVenueButton'
import EventActionButtons from '@/components/EventActionButtons'
import EventLikeCount from '@/components/EventLikeCount'
import EventCounts from '@/components/EventCounts'
import { EventImageGallery } from '@/components/EventImageGallery'
import { useUserActions } from '@/contexts/UserActionsContext'
import { getEventReasons } from '@/lib/eventReasons'
import { trackRecommendationAction } from '@/lib/recommendationTelemetryClient'
import { useRecommendationSession } from '@/contexts/RecommendationSessionContext'
import { venueHref } from '@/lib/venuePath'

interface EventModalProps {
  event: NormalizedEvent | null
  onClose: () => void
  reasons?: string[]
}

export default function EventModal({ event, onClose, reasons: reasonsProp }: EventModalProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const actions = useUserActions()
  const recSession = useRecommendationSession()
  const reasons = reasonsProp ?? (event && actions ? getEventReasons(event, {
    followedVenueIds: actions.actions.followedVenueIds,
    followedPromoterIds: actions.actions.followedPromoterIds,
  }) : [])

  useEffect(() => {
    if (!event) return
    contentRef.current?.scrollTo(0, 0)
  }, [event])

  useEffect(() => {
    if (!event || !recSession?.telemetryEnabled) return
    trackRecommendationAction('open', event.id)
  }, [event?.id, recSession?.telemetryEnabled, recSession?.sessionId])

  const emitTicketClick = () => {
    if (event && recSession?.telemetryEnabled) trackRecommendationAction('ticket_click', event.id)
  }
  const emitCalendarAdd = () => {
    if (event && recSession?.telemetryEnabled) trackRecommendationAction('calendar_add', event.id)
  }

  if (!event) return null

  const startDate = new Date(event.start)
  const endDate = event.end ? new Date(event.end) : null
  const props = event.extendedProps
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
    if (props.isFree === true) return 'Free'
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
        className="pager-panel p-4 pb-[max(1rem,env(safe-area-inset-bottom))] max-w-md w-full max-h-[90vh] sm:max-h-[85vh] min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain flex-shrink-0 sm:mx-4 sm:my-8 touch-pan-y border-t-2 sm:border-2"
        style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        <EventImageGallery
          imageUrl={props.imageUrl}
          imageUrls={props.imageUrls}
          alt={event.title}
          heightClass="h-28 sm:h-36"
        />

        <div className="flex items-start justify-between gap-2 mb-3 mt-3">
          <div className="flex-1 min-w-0 flex items-start gap-2 flex-wrap">
            <h2
              id="event-modal-title"
              className="text-lg font-semibold text-pager-fg"
            >
              {event.title}
            </h2>
            {statusLabel && (
              <span className="pager-pill pager-pill-active flex-shrink-0">
                {statusLabel}
              </span>
            )}
          </div>
          <EventActionButtons eventId={event.id} eventTitle={event.title} eventStart={event.start} className="flex-shrink-0" />
        </div>
        {reasons.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {reasons.map((r) => (
              <span key={r} className="pager-pill">
                {r}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3 flex-wrap mb-3">
          <EventCounts eventId={event.id} />
          <EventLikeCount eventId={event.id} />
        </div>

        <div className="space-y-2 mb-3 text-pager-fg text-xs">
          <div>
            <strong className="text-pager-fg text-xs">Date/Time:</strong>
            <div className="text-pager-fg-muted text-xs">
              {props.opensAt ? (
                <>
                  {formatDateTime(startDate, { timeStyle: undefined })}
                  {endDate && ` – ${formatDateTime(endDate, { timeStyle: undefined })}`}
                  <span className="text-pager-fg-faint"> · Opens {props.opensAt}</span>
                </>
              ) : (
                <>
                  {formatDateTime(startDate)}
                  {endDate && ` – ${formatDateTime(endDate)}`}
                </>
              )}
            </div>
            <div className="text-xs text-pager-fg-faint mt-0.5">
              Timezone: {props.timezone || 'Europe/Lisbon'}
            </div>
          </div>

          {props.descriptionShort && (
            <div>
              <strong className="text-pager-fg text-xs">Description:</strong>
              <p className="mt-0.5 text-pager-fg-muted text-xs">{props.descriptionShort}</p>
            </div>
          )}

          {props.nightActs && props.nightActs.length > 1 && (
            <div>
              <strong className="text-pager-fg text-xs">
                Lineup ({props.nightActs.length} acts):
              </strong>
              <ul className="mt-1.5 space-y-2">
                {props.nightActs.map((act) => (
                  <li
                    key={act.id}
                    className="flex gap-2 items-start border-2 border-pager-border bg-pager-muted p-2"
                  >
                    {act.imageUrl && (
                      <img
                        src={act.imageUrl}
                        alt=""
                        className="w-10 h-10 object-cover flex-shrink-0 border border-pager-border"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-pager-fg text-xs font-medium leading-snug">{act.title}</div>
                      {act.descriptionShort && (
                        <p className="text-pager-fg-faint text-[11px] mt-0.5 line-clamp-2">{act.descriptionShort}</p>
                      )}
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1">
                        {act.promoterName && (
                          <span className="text-[11px] text-pager-fg-faint">{act.promoterName}</span>
                        )}
                        {act.sourceUrl && (
                          <a
                            href={act.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] pager-link"
                          >
                            Post
                          </a>
                        )}
                        {act.ticketUrl && (
                          <a
                            href={act.ticketUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] pager-link"
                            onClick={emitTicketClick}
                          >
                            Tickets
                          </a>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {props.descriptionLong && !props.nightActs?.length && (
            <div>
              <strong className="text-pager-fg text-xs">Full Description:</strong>
              <p className="mt-0.5 whitespace-pre-wrap text-pager-fg-muted text-xs">
                {props.descriptionLong}
              </p>
            </div>
          )}

          {props.venueName && (
            <div>
              <strong className="text-pager-fg text-xs">Venue:</strong>{' '}
              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                <Link
                  href={venueHref({
                    venueId: props.venueId,
                    venueKey: props.venueKey,
                    venueName: props.venueName,
                  })}
                  className="pager-link text-xs"
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
                <div className="text-xs text-pager-fg-faint mt-0.5">{props.venueAddress}</div>
              )}
              {props.neighborhood && (
                <div className="text-xs text-pager-fg-faint">{props.neighborhood}</div>
              )}
              {props.city && <div className="text-xs text-pager-fg-faint">{props.city}</div>}
            </div>
          )}

          {formatPrice() && (
            <div>
              <strong className="text-pager-fg text-xs">Price:</strong>{' '}
              <span className="text-pager-fg-muted text-xs">{formatPrice()}</span>
            </div>
          )}

          {props.category && (
            <div>
              <strong className="text-pager-fg text-xs">Category:</strong>{' '}
              <span className="pager-pill pager-pill-active">
                {props.category}
              </span>
            </div>
          )}

          {props.tags.length > 0 && (
            <div>
              <strong className="text-pager-fg text-xs">Tags:</strong>
              <div className="flex flex-wrap gap-1.5 mt-1 items-center">
                {props.tags.map((tag) => (
                  <span key={tag} className="flex items-center gap-1">
                    <span className="pager-pill">{tag}</span>
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
              <strong className="text-pager-fg text-xs">Language:</strong>{' '}
              <span className="text-pager-fg-muted text-xs">{props.language}</span>
            </div>
          )}

          {props.ageRestriction && (
            <div>
              <strong className="text-pager-fg text-xs">Age Restriction:</strong>{' '}
              <span className="text-pager-fg-muted text-xs">{props.ageRestriction}</span>
            </div>
          )}

          {props.ticketUrl && (
            <div>
              <strong className="text-pager-fg text-xs">Tickets:</strong>{' '}
              <a
                href={props.ticketUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="pager-link text-xs"
                onClick={emitTicketClick}
              >
                Buy Tickets
              </a>
            </div>
          )}

          {(props.sourceUrl || props.sourceName) && (
            <div>
              <strong className="text-pager-fg text-xs">Source:</strong>{' '}
              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                {props.sourceUrl ? (
                  <a
                    href={props.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pager-link text-xs"
                  >
                    {props.sourceName || 'View Source'}
                  </a>
                ) : (
                  <span className="text-pager-fg-muted text-xs">{props.sourceName}</span>
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
          className="pager-btn w-full px-3 py-2.5 text-sm mt-3"
          onClick={emitCalendarAdd}
        >
          <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.5 3h-1.5v.5h-1V3H7v.5H5.5V3H4c-.55 0-1 .45-1 1v16c0 .55.45 1 1 1h15.5c.55 0 1-.45 1-1V4c0-.55-.45-1-1-1zM19 19H5V9h14v10zm0-11H5V5h2v.5h1V5h7v.5h1V5h2v3z" />
          </svg>
          Add to Google Calendar
        </a>

        <button
          onClick={onClose}
          className="pager-btn pager-btn-primary w-full px-3 py-2 text-xs font-semibold uppercase tracking-wider mt-3"
        >
          Close
        </button>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent
}
