# HTTP Caching Semantics

HTTP caching reduces latency and origin load by letting clients and intermediaries
reuse stored responses. Whether a stored response may be reused is governed by the
`Cache-Control` header, freshness lifetimes, and validators.

## Freshness

A response is fresh until its age exceeds its freshness lifetime. The lifetime comes
from `Cache-Control: max-age=N` (seconds), or, if absent, from the `Expires` header.
When neither is present, caches may apply a heuristic: commonly 10% of the time since
`Last-Modified`. `s-maxage` overrides `max-age` for shared caches only.

`no-cache` does not mean "do not store": it means the cache must revalidate with the
origin before reuse. `no-store` is the directive that forbids storing the response at
all. `private` restricts storage to the browser's cache; `public` permits shared
caches (CDNs, proxies) to store responses that would otherwise be uncacheable, such
as those for authenticated requests.

## Validation

A stale response need not be re-downloaded. Conditional requests revalidate it:

- `ETag` is an opaque validator the origin assigns to a representation. The client
  echoes it in `If-None-Match`. If the representation is unchanged, the origin
  answers `304 Not Modified` with no body, and the cache refreshes its copy's
  freshness lifetime.
- `Last-Modified` plays the same role at one-second granularity via
  `If-Modified-Since`. ETags are preferred because they can capture sub-second
  changes and semantic equality.

A `304` is cheap: headers only, no body bytes. This is why revalidation-heavy
strategies (`no-cache`, `max-age=0, must-revalidate`) still save substantial
bandwidth over uncached fetches.

## Variation

`Vary` names the request headers that select among stored variants. A response with
`Vary: Accept-Encoding` must not be served to a request whose `Accept-Encoding`
differs from the stored one. `Vary: *` effectively disables caching, because no
request can be proven equivalent.

## Staleness extensions

`stale-while-revalidate=N` lets a cache serve a stale response for up to N seconds
while it revalidates in the background, hiding revalidation latency from the user.
`stale-if-error=N` permits serving stale content when the origin returns 5xx or is
unreachable. `immutable` tells the browser not to revalidate on reload within the
freshness lifetime — appropriate only for content-addressed URLs (hashed filenames),
where a change always produces a new URL.

## Common failure modes

Serving HTML with long `max-age` strands users on old application shells; the
standard pattern is short or zero lifetime for HTML and `immutable` year-long
lifetimes for hashed assets. Omitting `Vary: Accept-Encoding` can serve gzip bytes
to clients that did not ask for them. Using `no-cache` when `no-store` was intended
leaks sensitive responses into shared caches.
