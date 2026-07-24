-- Recommendation telemetry analytics (service role / SQL editor only).
-- Do not expose via public APIs.

-- Sessions (last 7d)
SELECT date_trunc('day', created_at) AS day, count(*) AS sessions
FROM recommendation_sessions
WHERE created_at > now() - interval '7 days'
GROUP BY 1 ORDER BY 1;

-- Genuine impressions
SELECT count(*) AS impressions
FROM recommendation_events
WHERE action = 'impression'
  AND occurred_at > now() - interval '7 days';

-- Unique exposed users
SELECT count(DISTINCT user_id) AS unique_users
FROM recommendation_events
WHERE action = 'impression'
  AND occurred_at > now() - interval '7 days'
  AND user_id IS NOT NULL;

-- Action rates vs impressions (same session+event)
WITH impressions AS (
  SELECT session_id, event_id, occurred_at
  FROM recommendation_events
  WHERE action = 'impression'
    AND occurred_at > now() - interval '7 days'
),
actions AS (
  SELECT session_id, event_id, action
  FROM recommendation_events
  WHERE action IN ('open','like','save','going','calendar_add','ticket_click','share','pass','hide')
    AND occurred_at > now() - interval '7 days'
)
SELECT
  count(*) AS impressions,
  count(*) FILTER (WHERE a.action = 'open')::float / nullif(count(*),0) AS open_rate,
  count(*) FILTER (WHERE a.action = 'like')::float / nullif(count(*),0) AS like_rate,
  count(*) FILTER (WHERE a.action = 'save')::float / nullif(count(*),0) AS save_rate,
  count(*) FILTER (WHERE a.action = 'going')::float / nullif(count(*),0) AS going_rate,
  count(*) FILTER (WHERE a.action = 'calendar_add')::float / nullif(count(*),0) AS calendar_add_rate,
  count(*) FILTER (WHERE a.action = 'ticket_click')::float / nullif(count(*),0) AS ticket_click_rate,
  count(*) FILTER (WHERE a.action = 'share')::float / nullif(count(*),0) AS share_rate,
  count(*) FILTER (WHERE a.action = 'pass')::float / nullif(count(*),0) AS pass_rate,
  count(*) FILTER (WHERE a.action = 'hide')::float / nullif(count(*),0) AS hide_rate
FROM impressions i
LEFT JOIN actions a
  ON a.session_id IS NOT DISTINCT FROM i.session_id
 AND a.event_id = i.event_id;

-- Outcome rate by position
SELECT i.position,
       count(*) AS impressions,
       count(*) FILTER (WHERE a.action = 'like')::float / nullif(count(*),0) AS like_rate
FROM recommendation_events i
LEFT JOIN recommendation_events a
  ON a.session_id IS NOT DISTINCT FROM i.session_id
 AND a.event_id = i.event_id
 AND a.action = 'like'
 AND a.occurred_at > i.occurred_at
WHERE i.action = 'impression'
  AND i.occurred_at > now() - interval '7 days'
GROUP BY i.position
ORDER BY i.position;

-- By algorithm version
SELECT algorithm_version, count(*) AS impressions
FROM recommendation_events
WHERE action = 'impression'
  AND occurred_at > now() - interval '7 days'
GROUP BY 1;

-- By persona (from session context)
SELECT s.context->>'persona_id' AS persona_id,
       count(*) FILTER (WHERE e.action = 'impression') AS impressions,
       count(*) FILTER (WHERE e.action = 'like') AS likes
FROM recommendation_sessions s
JOIN recommendation_events e ON e.session_id = s.id
WHERE e.occurred_at > now() - interval '7 days'
GROUP BY 1
ORDER BY impressions DESC NULLS LAST;

-- By candidate source
SELECT coalesce(candidate_source, 'unknown') AS candidate_source,
       count(*) AS impressions
FROM recommendation_events
WHERE action = 'impression'
  AND occurred_at > now() - interval '7 days'
GROUP BY 1
ORDER BY impressions DESC;

-- Cold-start percentage
SELECT
  count(*) FILTER (WHERE candidate_source = 'cold_start')::float
    / nullif(count(*),0) AS cold_start_pct
FROM recommendation_events
WHERE action = 'impression'
  AND occurred_at > now() - interval '7 days';

-- Unique venue / promoter coverage (join event_id to catalogue outside SQL as needed)
SELECT count(DISTINCT event_id) AS unique_events_impressed
FROM recommendation_events
WHERE action = 'impression'
  AND occurred_at > now() - interval '7 days';

-- Repeated impression rate (should be ~0 within session due to unique index;
-- this measures same user+event across sessions)
SELECT
  count(*) AS impression_rows,
  count(DISTINCT (user_id, event_id)) AS unique_user_event,
  1 - count(DISTINCT (user_id, event_id))::float / nullif(count(*),0) AS repeat_rate
FROM recommendation_events
WHERE action = 'impression'
  AND occurred_at > now() - interval '7 days'
  AND user_id IS NOT NULL;

-- Training view sample
SELECT *
FROM ml_training_examples_v1
ORDER BY impression_at DESC
LIMIT 50;
