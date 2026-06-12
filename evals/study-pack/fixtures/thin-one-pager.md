# Idempotency Keys

An idempotency key is a unique client-generated value (usually a UUID) sent with a
request that has side effects, so the server can recognize retries of the same
logical operation.

The server stores the key with the result of the first execution. When a retry
arrives with the same key, the server returns the stored result instead of executing
again. This makes "charge the card" safe to retry after a timeout: the client cannot
know whether the first attempt succeeded, but replaying it cannot double-charge.

Keys should be scoped per operation, persisted at least as long as retries are
possible, and the stored response should include the original status code. Stripe
popularized the pattern with its `Idempotency-Key` header; it expires keys after 24
hours.
