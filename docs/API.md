# Detection API (public contract)

The website (`site/api.js`) talks to our private server. Only the **suspect image** is sent, never a selfie or a face template.

## The "city" of streets
1. `POST /api/v1/city` — asks for a new city. **This counts as one check.**
   Answer: `{"city": "<id>", "street_bytes": 262144, "max_bytes": 15728640, "ttl": 120}`
2. The browser cuts the file into pieces. Each piece gets a random one-time street name
   (`lilas-9f2c41d07ab3e815`) and the pieces are sent **in shuffled order**:
   `PUT /api/v1/city/<id>/<street>` with the raw bytes.
3. Only the browser knows the map. It sends it last:
   `POST /api/v1/city/<id>/plan` `{"streets": ["…in the right order…"]}`
   The server rebuilds the image **in memory**, answers, and forgets the whole city
   (also about 2 minutes later if the plan never comes). Nothing is written to disk.

Answer: `{"verdict": "likely" | "possible" | "no_sign" | "insufficient" | "unsupported" | "too_large"}`.
The verdict is coarse on purpose and the daily limits are low, to make the service costly to use
for tuning fakes. It cannot make that impossible: someone patient can still learn which edit removes
a marker. That is why the detector code stays private.

## Limits
- IPv4 only (IPv6 is refused).
- Per IP address: 5 checks per day, at least 30 seconds apart.
- Per /24 range (256 addresses): 50 checks per day.
- Counters are kept for the current day under a keyed hash whose key lives only in memory and changes
  every day (pseudonymisation: while the API runs, someone with root on the server could recover an
  address). An email pass replaces the daily quotas but not the IPv4-only rule or the 30-second gap.
- Nginx applies an extra per-IP rate limit only to the requests that cost something (new check,
  unlock, forms), not to the image pieces.

## Reopening access by email
`POST /api/v1/unlock` `{"email": "...", "lang": "fr"}` → `202`.
About 3 hours later, one email with a link is sent. It gives 5 more checks for 24 hours
(header `X-IMSM-Pass`). The address is deleted as soon as the email has gone (or after 5 failed
tries / 24 hours); only a keyed hash of the normalised address (lower-case, without +tags) is kept
for the day, so one mailbox gets one link per day. Limits: 3 requests per IP, 10 per /24 and 300 in
total per day. Without an email server configured the API answers 503. No image is ever sent by email.
