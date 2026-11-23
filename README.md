# I’m Still Mine

*Your body. Your images. Your choice.*

I’m Still Mine is a free, non-profit project for anyone who is thinking about selling intimate content online, or who finds fake or stolen intimate images of themselves. Most of them are women, but men are victims too.

- **Before they start:** an anonymous, non-judgemental walkthrough. It covers what stays online, real earnings, life afterwards, and a private check for pressure or coercion. It points to free support.
- **When they find an image:** they compare it with their own live selfie (on their device), ask our server whether it shows signs of manipulation, and get an evidence report.
- **Free psychological and psychiatric support** from volunteer professionals: a request goes by email to one verified volunteer in the person's city (or to our coordinator if there is none yet), and our server keeps no copy.
- **Donations go to associations, never to us.** The site links to their own donation pages, in random order.

This repository is public so that anyone can read exactly what the website does with their data. **You are free to build your own site from it, even with advertising**: the more places this message reaches, the better. We only ask that you keep the commitments below, and that you don't call your site I’m Still Mine.

## What we will never do
These commitments are why the project exists. A copy of this code that breaks any of them is **not** I’m Still Mine.

1. We never build a face database of people who did not sign up themselves.
2. We never try to identify anyone in the images we check. The server reads how the file was made, never who is in it.
3. Your selfie and face template never leave your device. Face comparison runs in your browser.
4. We never store images. Only the suspect image is sent to our server, in shuffled pieces; it is never written to disk and is released from memory as soon as we answer.
5. Nothing is reported automatically. A human reviews every report, and only the woman herself (or someone she authorises) can request a legal removal.
6. No advertising, no tracking, no analytics, and no donations to us. The site links to independent associations instead.
7. We never use platform data beyond what the platform has explicitly authorised in writing.

## Repository layout
| Folder | What it is |
|---|---|
| `site/` | The website in 20 languages: the walkthrough, "check my photos", face comparison with a live selfie (in the browser), and the client for our detection API (`site/api.js`) |
| `coming-soon/` | The one-page "coming soon" site, in 20 languages |
| `docs/` | Reference Nginx configuration and the public API contract (`API.md`) |

### Why the fake detector is not here
The code that detects fake or manipulated images is **deliberately private**. If it were public, anyone making deepfakes could study it and learn exactly how to get past it. It runs only on our server, behind strict limits (see `docs/API.md`), and answers with a simple verdict, never with detailed scores. Platforms that want to run checks themselves can ask us for access.

## Status (November 2026)
This is a **first version**.
- The detector only reads provenance markers in the file (AI-generator settings and labels, face-editing apps). It does not analyse pixels yet, so an image without markers can still be a deepfake; most images shared online have lost these markers. A pixel-level check will only be added once it is calibrated on real photos without false alarms.
- The PRNU (camera fingerprint) tool is not available yet.
- The InsightFace/ArcFace engine supported by `site/moteurs.js` is **not included**, because its weights are licensed for non-commercial research only. The site uses face-api (MIT).

## Licence
Apache License 2.0 for our code (see `LICENSE`). Third-party components keep their own licences (see `NOTICE`).

## Security and safety
Please report vulnerabilities privately (see `SECURITY.md`). If you come across child sexual abuse material, do not download or share it. Report it immediately to the authorities: in France, internet-signalement.gouv.fr (Pharos), or Point de Contact.
