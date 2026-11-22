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
   (also after 120 s if the plan never comes). Nothing is written to disk.

Answer: `{"verdict": "likely" | "possible" | "possible_low" | "no_sign" | "insufficient"}`.
The verdict is coarse on purpose, so the service cannot be used to fine-tune fakes.

## Limits
- IPv4 only (IPv6 is refused).
- Per IP address: 5 checks per day, at least 30 seconds apart.
- Per /24 range (256 addresses): 50 checks per day.
- Counters are kept for the current day only, under a keyed hash (the address cannot be read back).

## Reopening access by email
`POST /api/v1/unlock` `{"email": "...", "lang": "fr"}` → `202`.
About 3 hours later, one email with a link is sent. It gives 5 more checks for 24 hours
(header `X-IMSM-Pass`). The address is deleted as soon as the email has gone; only a keyed hash
is kept for 24 hours so the same address gets one link per day. No image is ever sent by email.
