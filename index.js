/**
 * My Earth `create_map` — turn place data into a shareable My Earth map.
 *
 * Host-only bundle. It registers one model-facing tool on `ctx.tools` and calls
 * the public My Earth HTTP API, whose base URL is configurable. It has no
 * dependencies, no build step, and keeps no local state: the map lives in the
 * public service, the returned `shareUrl` is the deliverable, and the returned
 * `previewImageUrl` is a public 1200×630 PNG cover.
 *
 * The configured default is the production public site. A caller can still override
 * `apiBaseUrl` for a self-hosted or preview deployment. When the cover cannot be
 * generated the API still creates the map, so this tool reports
 * `coverStatus: "failed"` together with the working link instead of failing the call.
 */

/** Loader row name for this bundle's patch entry. */
export const name = 'my-earth'

/** The tool registry is the only service this bundle needs. */
export const inject = ['tools']

/** Verified public production base URL; see docs/API.md in the me-my-earth repository. */
const DEFAULT_API_BASE_URL = 'https://me-interest-globe.netlify.app'

/** Upper bound on one request, covering upload and cover generation. */
const DEFAULT_TIMEOUT_MS = 45_000

/** Public API request body limit. */
const MAX_DOCUMENT_BYTES = 512 * 1024

/** Public API event limit. */
const MAX_EVENTS = 100

/** Public API location precisions. */
const PRECISIONS = ['country', 'city', 'point']

/** One nullable-scalar schema branch pair reused by the parameter descriptions. */
const nullable = (type, description) => ({
  oneOf: [{ type }, { type: 'null' }],
  description,
})

const LOCATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    countryId: {
      type: 'string',
      description: 'My Earth country/region id such as JPN, USA, GBR.',
    },
    precision: {
      type: 'string',
      enum: [...PRECISIONS],
      description:
        'country: a country-level link only, and coordinates plus placeId are dropped. '
        + 'city: a known placeId or the coordinates of the city area. '
        + 'point: the exact marker coordinates, such as a storefront.',
    },
    label: {
      type: 'string',
      description: 'Human-readable place name, 1–160 characters.',
    },
    reason: {
      type: 'string',
      description: 'Why this event belongs here, 1–500 characters.',
    },
    placeId: nullable('string', 'Existing My Earth city id, or null to place the marker by coordinates.'),
    lat: {
      type: 'number',
      description: 'Latitude, −90 to 90, required for city and point precision. 0,0 is rejected.',
    },
    lng: {
      type: 'number',
      description: 'Longitude, −180 to 180, required for city and point precision.',
    },
  },
  required: ['countryId', 'precision', 'label', 'reason'],
}

const EVENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: {
      type: 'string',
      description: 'Stable unique id, 1–80 characters of letters, digits, dots, underscores, colons and hyphens.',
    },
    title: {
      type: 'string',
      description: 'Event or place title, 1–300 characters.',
    },
    summary: {
      type: 'string',
      description: 'One or two plain-text sentences, 1–3000 characters, saying what makes this worth mapping.',
    },
    publishedDate: nullable(
      'string',
      'Source publication date as YYYY-MM-DD, or null. Omit it when unknown and never pass today’s date as a guess.',
    ),
    eventDate: nullable('string', 'Event date as YYYY-MM-DD, or null for a place without a date.'),
    source: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: {
          type: 'string',
          description: 'Source, venue or shop name, 1–160 characters.',
        },
        url: {
          type: 'string',
          description: 'Direct http or https page for the place, at most 2048 characters.',
        },
      },
      required: ['name', 'url'],
    },
    locations: {
      type: 'array',
      description:
        'Places this event links to, 1–30. A point is a marker, never a boundary claim; '
        + 'counts are per unique event, so a cross-border event counts once per linked country.',
      items: LOCATION_SCHEMA,
    },
  },
  required: ['id', 'title', 'summary', 'source', 'locations'],
}

const PARAMETERS = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: {
      type: 'string',
      description: 'Map title, 1–120 characters, naming the result rather than the tool call.',
    },
    events: {
      type: 'array',
      description: 'The places to map: 1–100 events with unique ids.',
      items: EVENT_SCHEMA,
    },
  },
  required: ['title', 'events'],
}

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    shareUrl: {
      type: 'string',
      description: 'Public interactive map. This is the deliverable and works even when the cover failed.',
    },
    previewImageUrl: nullable('string', 'Public 1200×630 PNG cover, or null when cover generation failed.'),
    coverStatus: {
      type: 'string',
      description: '`ready` when a cover image exists, `failed` when only the map link is available.',
    },
    coverError: nullable('string', 'The service’s explanation of a failed cover, when it sends one.'),
    mapId: nullable('string', 'Stored map id, usable with the public read API.'),
    eventCount: nullable('integer', 'Events stored in the map.'),
    countryCount: nullable('integer', 'Distinct source countries or regions.'),
    cityCount: nullable('integer', 'Distinct places in the map.'),
  },
  required: ['shareUrl', 'previewImageUrl', 'coverStatus'],
}

/**
 * Resolve the bundle configuration, falling back to the verified public default.
 * @param config - the loader row's `config` mapping, possibly absent or partial.
 * @returns the base URL without a trailing slash and a request timeout.
 */
function readSettings(config) {
  const raw = config !== null && typeof config === 'object' ? config : {}
  return {
    apiBaseUrl: normalizeBaseUrl(raw.apiBaseUrl),
    timeoutMs: typeof raw.timeoutMs === 'number' && Number.isFinite(raw.timeoutMs) && raw.timeoutMs > 0
      ? raw.timeoutMs
      : DEFAULT_TIMEOUT_MS,
  }
}

/**
 * Accept the configured public base URL and strip trailing slashes.
 * @param value - the configured value, or undefined to use the public default.
 * @returns an absolute http(s) base URL without a trailing slash.
 */
function normalizeBaseUrl(value) {
  const candidate = typeof value === 'string' && value.trim() !== '' ? value.trim() : DEFAULT_API_BASE_URL
  let url
  try {
    url = new URL(candidate)
  } catch {
    throw new TypeError(`my-earth: apiBaseUrl must be an absolute http(s) URL, got ${JSON.stringify(candidate)}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError(`my-earth: apiBaseUrl must use http or https, got ${JSON.stringify(candidate)}`)
  }
  const path = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '')
  return `${url.origin}${path}`
}

/** A trimmed non-empty string, or undefined. Numbers are accepted for id-like fields. */
function text(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? undefined : trimmed
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

/** A required field, with the argument path in the failure message. */
function requiredText(value, path) {
  const resolved = text(value)
  if (resolved === undefined) throw new Error(`create_map: ${path} must be a non-empty string.`)
  return resolved
}

/** An optional YYYY-MM-DD value; the public API validates the format. */
function optionalDate(value) {
  const resolved = text(value)
  return resolved === undefined || resolved === 'null' ? undefined : resolved
}

/** A finite coordinate, accepting a numeric string from a sloppier caller. */
function coordinate(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

/**
 * Validate the shape the tool owns and normalize it into a public API document.
 * Field-level rules stay with the service, whose rejection names the exact path.
 * @param args - the model's arguments.
 * @returns the `{ schemaVersion, title, events }` document to post.
 */
function toApiDocument(args) {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) {
    throw new Error('create_map expects an object with `title` and `events`.')
  }
  const title = requiredText(args.title, 'title')
  if (!Array.isArray(args.events) || args.events.length === 0) {
    throw new Error('create_map: events must be a non-empty array of places.')
  }
  if (args.events.length > MAX_EVENTS) {
    throw new Error(`create_map: events accepts at most ${MAX_EVENTS} items (got ${args.events.length}).`)
  }
  return {
    schemaVersion: 1,
    title,
    events: args.events.map((event, index) => toApiEvent(event, index)),
  }
}

/**
 * Normalize one event of the document.
 * @param raw - the model-supplied event.
 * @param index - its position, used in failure messages.
 * @returns the event with only documented fields.
 */
function toApiEvent(raw, index) {
  const path = `events[${index}]`
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`create_map: ${path} must be an object.`)
  }
  const source = raw.source
  if (source === null || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error(`create_map: ${path}.source must be an object with name and url.`)
  }
  if (!Array.isArray(raw.locations) || raw.locations.length === 0) {
    throw new Error(`create_map: ${path}.locations must contain at least one place.`)
  }
  const event = {
    id: requiredText(raw.id, `${path}.id`),
    title: requiredText(raw.title, `${path}.title`),
    summary: requiredText(raw.summary, `${path}.summary`),
    source: {
      name: requiredText(source.name, `${path}.source.name`),
      url: requiredText(source.url, `${path}.source.url`),
    },
    locations: raw.locations.map((location, locationIndex) => toApiLocation(location, index, locationIndex)),
  }
  const publishedDate = optionalDate(raw.publishedDate)
  if (publishedDate !== undefined) event.publishedDate = publishedDate
  const eventDate = optionalDate(raw.eventDate)
  if (eventDate !== undefined) event.eventDate = eventDate
  return event
}

/**
 * Normalize one location, dropping what the chosen precision makes meaningless.
 * @param raw - the model-supplied location.
 * @param eventIndex - owning event position.
 * @param locationIndex - position within the event.
 * @returns the location with only documented fields.
 */
function toApiLocation(raw, eventIndex, locationIndex) {
  const path = `events[${eventIndex}].locations[${locationIndex}]`
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`create_map: ${path} must be an object.`)
  }
  const precision = text(raw.precision)
  if (precision === undefined || !PRECISIONS.includes(precision)) {
    throw new Error(`create_map: ${path}.precision must be one of ${PRECISIONS.join(', ')}.`)
  }
  const location = {
    countryId: requiredText(raw.countryId, `${path}.countryId`),
    precision,
    label: requiredText(raw.label, `${path}.label`),
    reason: requiredText(raw.reason, `${path}.reason`),
  }
  if (precision === 'country') return location
  const placeId = text(raw.placeId)
  if (placeId !== undefined) location.placeId = placeId
  const lat = coordinate(raw.lat)
  const lng = coordinate(raw.lng)
  if (lat !== undefined) location.lat = lat
  if (lng !== undefined) location.lng = lng
  return location
}

/** A string from a response field, or null. */
const stringOrNull = value => (typeof value === 'string' && value !== '' ? value : null)

/** An integer from a response field, or null. */
const integerOrNull = value => (typeof value === 'number' && Number.isInteger(value) ? value : null)

/** Turn an HTTP failure into one model-facing message with the service's issue paths. */
function describeApiFailure(status, payload, rawText) {
  const error = payload !== null && typeof payload === 'object' ? payload.error : undefined
  const message = error !== null && typeof error === 'object' && typeof error.message === 'string'
    ? error.message
    : undefined
  const issues = error !== null && typeof error === 'object' && Array.isArray(error.issues) ? error.issues : []
  const details = issues
    .filter(issue => issue !== null && typeof issue === 'object')
    .slice(0, 10)
    .map((issue) => {
      const issuePath = typeof issue.path === 'string' && issue.path !== '' ? issue.path : 'data'
      const issueMessage = typeof issue.message === 'string' ? issue.message : 'is invalid'
      return `- ${issuePath}: ${issueMessage}`
    })
  const head = message === undefined
    ? `My Earth API returned HTTP ${status}.`
    : `My Earth API rejected the map (HTTP ${status}): ${message}`
  const detailText = details.length === 0 ? '' : `\n${details.join('\n')}`
  const fallback = message === undefined && typeof rawText === 'string' && rawText.trim() !== ''
    ? `\n${rawText.trim().slice(0, 300)}`
    : ''
  return `${head}${detailText}${fallback}`
}

/**
 * Fuse the caller's cancellation signal with this request's own deadline.
 * @param signal - the tool execution's signal, if any.
 * @param timeoutMs - request deadline in milliseconds.
 * @returns a combined signal and its cleanup.
 */
function withDeadline(signal, timeoutMs) {
  const controller = new AbortController()
  const onAbort = () => controller.abort(signal.reason)
  const timer = setTimeout(
    () => controller.abort(new Error(`My Earth API did not answer within ${timeoutMs} ms`)),
    timeoutMs,
  )
  if (signal !== null && typeof signal === 'object') {
    if (signal.aborted) controller.abort(signal.reason)
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer)
      if (signal !== null && typeof signal === 'object') signal.removeEventListener('abort', onAbort)
    },
  }
}

/**
 * Build the one model-facing message for a result that may or may not have
 * reached the service. The model must not resend the POST on its own.
 * @param reason - what made the result ambiguous.
 * @returns an error whose message tells the model to stop and ask.
 */
function unconfirmedError(reason) {
  return new Error(
    `My Earth map creation is unconfirmed (${reason}); the map may already be saved. `
    + 'Do not POST again automatically. Ask the user to check the result before retrying.',
  )
}

/**
 * Create one map through the public API.
 * @param endpoint - absolute `.../api/maps` URL.
 * @param body - serialized document.
 * @param signal - the tool execution's cancellation signal.
 * @param timeoutMs - request deadline in milliseconds.
 * @returns the HTTP status and the raw response text.
 */
async function postMap(endpoint, body, signal, timeoutMs) {
  const deadline = withDeadline(signal, timeoutMs)
  try {
    const response = await globalThis.fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body,
      signal: deadline.signal,
    })
    return { ok: response.ok, status: response.status, text: await response.text() }
  } catch (error) {
    if (signal !== null && typeof signal === 'object' && signal.aborted) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw unconfirmedError(`request timed out after ${timeoutMs} ms`)
    }
    throw unconfirmedError(`connection failed: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    deadline.dispose()
  }
}

/**
 * Build the tool definition for one resolved configuration.
 * @param settings - resolved base URL and request timeout.
 * @returns the `create_map` tool definition.
 */
function createMapTool(settings) {
  const endpoint = `${settings.apiBaseUrl}/api/maps`
  return {
    name: 'create_map',
    description:
      'Publish one My Earth map and return its public share link plus a 1200×630 cover image. '
      + 'Call it only when the user explicitly asks to publish a draft or create a public share link. '
      + 'For an organize, draft, "先给我看看" or "give me JSON" request, do not call this tool: '
      + 'build a local JSON draft with the available file tools and do not POST. '
      + 'One call sends exactly one POST to the configured public My Earth API. '
      + 'The resulting map is public by link, so anyone with the URL can open it and follow its sources. '
      + 'If the request times out, the connection breaks, or a success response has no shareUrl, '
      + 'report that the creation result is unconfirmed and the map may already be saved; '
      + 'do not POST again automatically. '
      + 'If a shareUrl is returned but coverStatus is "failed", deliver the link; the cover is optional. '
      + 'A server rejection returns the API error with its field paths.',
    parameters: PARAMETERS,
    output: {
      schema: OUTPUT_SCHEMA,
      render(_args, value) {
        const lines = [`My Earth map: ${value.shareUrl}`]
        if (value.previewImageUrl !== null) {
          lines.push(`Cover (1200×630 PNG): ${value.previewImageUrl}`)
        } else {
          const reason = value.coverError === null ? '' : ` (${value.coverError})`
          lines.push(`Cover: ${value.coverStatus}${reason}. The map link above still works.`)
        }
        const plural = (count, singular, pluralForm) => `${count} ${count === 1 ? singular : pluralForm}`
        const counts = [
          value.eventCount === null ? undefined : plural(value.eventCount, 'event', 'events'),
          value.countryCount === null ? undefined : plural(value.countryCount, 'country', 'countries'),
          value.cityCount === null ? undefined : plural(value.cityCount, 'place', 'places'),
        ].filter(part => part !== undefined)
        if (counts.length > 0) lines.push(`Contents: ${counts.join(', ')}.`)
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(args, exec) {
      const document = toApiDocument(args)
      const body = JSON.stringify(document)
      const bytes = new TextEncoder().encode(body).length
      if (bytes > MAX_DOCUMENT_BYTES) {
        throw new Error(
          `create_map: the map data is ${bytes} bytes and the public API accepts at most ${MAX_DOCUMENT_BYTES}. `
          + 'Shorten summaries or split the places into more than one map.',
        )
      }
      const response = await postMap(endpoint, body, exec?.signal, settings.timeoutMs)
      let payload
      try {
        payload = JSON.parse(response.text)
      } catch {
        payload = undefined
      }
      if (!response.ok) {
        const detail = describeApiFailure(response.status, payload, response.text)
        throw response.status >= 500 ? unconfirmedError(detail) : new Error(detail)
      }
      if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
        throw unconfirmedError(`HTTP ${response.status} response was not a readable map object`)
      }
      const shareUrl = stringOrNull(payload.shareUrl)
      if (shareUrl === null) {
        throw unconfirmedError(`HTTP ${response.status} response had no shareUrl`)
      }
      const previewImageUrl = stringOrNull(payload.previewImageUrl)
      return {
        shareUrl,
        previewImageUrl,
        coverStatus: stringOrNull(payload.coverStatus) ?? (previewImageUrl === null ? 'failed' : 'ready'),
        coverError: stringOrNull(payload.coverError),
        mapId: stringOrNull(payload.mapId),
        eventCount: integerOrNull(payload.eventCount),
        countryCount: integerOrNull(payload.countryCount),
        cityCount: integerOrNull(payload.cityCount),
      }
    },
  }
}

/**
 * Register `create_map` on the tool registry.
 * @param ctx - plugin context carrying `ctx.tools`.
 * @param config - the loader row's config: `apiBaseUrl` and `timeoutMs`.
 */
export function apply(ctx, config) {
  const settings = readSettings(config)
  ctx.tools.register(createMapTool(settings))
}
