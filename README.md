# FormMitra

FormMitra is a Manifest V3 browser side-panel assistant that explains webpages, translates page text, assists with safe navigation, and helps review form entries in English, Hindi, or Kannada.

It is built for people who find complex websites and online forms difficult to navigate or understand, especially when content is primarily in English.

## What it does

- **Page Q&A**: Answers questions about the open webpage in 1–5 plain sentences in English, Hindi, or Kannada, labeled `via Gemini` or `via Groq`.
- **On-page Find**: Highlights visible text matches without modifying input values and steps through them with **Prev**, **Next**, and **Clear**.
- **Whole-page translation**: Translates visible page text and labels to English, Hindi, or Kannada and restores original text via **Show original** (offscreen lazy batches on scroll: **Experimental**).
- **Safe page actions with approval**: Types into site search boxes (never pressing Enter), clicks approved result links or safe navigation controls, and refuses submit, payment, delete, send, sign-out, password, and CAPTCHA actions.
- **Saved details & form fill review**: Stores details locally for one-click **Copy** or focused-field **Insert**, previews confidence-scored matches before applying, and keeps sensitive fields manual.
- **Dual AI providers**: Supports Google Gemini and Groq with queued calls, cooldown handling, and automatic fallback.
- **Voice input (Experimental)**: Records via microphone into the composer box using Groq Whisper or Gemini without auto-sending (automated QA used a fake browser audio stream and mocked APIs).

## How it works

FormMitra runs completely in the browser with no external backend server. The side panel communicates with the active tab through a background service worker, while AI requests are serialized through an in-memory provider queue with automatic rate-limit cooldown tracking and fallback between Gemini and Groq.

```text
Side Panel  <--->  Content Script   (snapshot, find, click, type, scroll, fill, translate)
    |
    v
Background Service Worker (provider queue & tab relay)  --->  Gemini API / Groq API
```

## Install (Load unpacked)

1. Download or clone this repository to your computer.
2. Open Chrome or Edge and go to `chrome://extensions/`.
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the `web-helper` folder.
5. Pin **FormMitra** from the extensions toolbar menu and click its icon to open the side panel.

## Set up your AI keys

FormMitra requires at least one API key from Google Gemini or Groq:

1. Create a Gemini key in **Google AI Studio** (`aistudio.google.com`) and/or a Groq key in the **Groq Console** (`console.groq.com`).
2. Open FormMitra's **Settings** page (gear icon in the side panel or **Extension options**), paste each key into its matching field, click **Test Connection**, and click **Save**.
3. Use the side-panel header selector to choose **Auto** (Gemini primary for text/translation/fill, Groq primary for voice), **Gemini**, or **Groq**.

Free-tier API keys have per-minute request limits (`HTTP 429`). Your API keys and saved details stay strictly inside `chrome.storage.local` in your browser and are never included in this repository.

## Using it

- **"What is this page?"**: Click the chip or ask a question; reads the snapshot and replies directly (no approval needed).
- **"Find `<word>`"**: Highlights all visible matches locally on the page with **Prev** / **Next** / **Clear** controls.
- **"Search this site for `<topic>`"**: Shows an **Allow / Skip** card before typing into the search box and another approval before opening a link.
- **Translate page to Hindi**: Select `हिन्दी` in the header language menu and click **Translate page**; click **Show original** to revert.
- **"Fill this form"**: Shows a review checklist (`< 60%` confidence rows unticked in amber, sensitive rows locked) before **Apply** fills ticked fields.
- **Voice input**: Press the mic button to start listening and press again to stop; the transcript fills the input box without sending automatically.

## Privacy and safety

- **Sent to your selected AI provider**: Visible page text snapshots (up to 3,000 chars), headings, interactive control labels, form field metadata, and your question or audio recording.
- **Never sent to AI providers**: Saved detail values, password fields, sensitive items (`Aadhaar`, `PAN`, `passport`, `bank`, `OTP`, `CVV`, `IFSC`, `PIN`), or items marked sensitive.
- **Action guardrails**: The content script enforces one guarded click path and blocks submit, payment, checkout, delete, remove, send, verify, OTP, CAPTCHA, sign-out, and password interactions. Typing into message boxes is draft-only, and clicks ask approval unless **Auto-allow navigation clicks** is checked (limited to safe links, tabs, list options, and `Next`/`Open`/`View`-style buttons).

## Project structure

```text
.gitignore                    Git ignore rules for dependencies, keys, OS, and editor files
LICENSE                       MIT license
README.md                     Project overview, setup, safety, and structure guide
test/test-form.html           Small static sample page for manual local form and search checks
web-helper/
  manifest.json               Chrome Manifest V3 configuration and minimal permissions
  background.js               Service worker tab relay and Gemini/Groq fallback queue
  content.js                  DOM snapshot, non-destructive find, and guarded click/type/scroll
  content-helpers.js          Viewport translation collection/restore and form-fill injection
  sidepanel.html/.css/.js     Side panel layout, responsive styles, and tab/task controller
  details.css                 Shared styling for saved details lists and forms
  options.html/.css/.js       API key setup, live model loading, saved details, and data wipe
  permission.html/.js         Dedicated microphone permission request page
  icons/icon16|48|128.png     Extension toolbar and Chrome Web Store icons (16, 48, 128 px)
  lib/agent.js                Prompt builder, JSON action validation, and step approval loop
  lib/chat-ui.js              Chat bubbles, error details, approval cards, and form-fill review UI
  lib/details-ui.js           Shared saved-details CRUD component for Chat and Settings
  lib/form-fill.js            Metadata-only form mapping prompt and local confidence plan
  lib/providers.js            Gemini and Groq REST clients for chat, models, and transcription
  lib/storage.js              chrome.storage.local wrapper and cross-provider key prefix checks
  lib/translate.js            JSON-array batch translation and mismatch retry orchestrator
  lib/voice.js                Single-instance mic state machine with Web Speech fallback
```

## Known limitations

- Free-tier Gemini and Groq API rate limits can pause multi-batch page translations during cooldowns.
- Sites with custom non-standard widgets or closed Shadow DOM inputs may not respond to automatic form filling and require manual **Insert**.
- Browser image viewers, built-in PDF viewers, and restricted pages (`chrome://`, `edge://`, Chrome Web Store) cannot be read by extensions.
- Whole-page translation may skip a batch if an AI response returns a mismatched item count or vary in phrasing on very long pages.
- Voice transcription accuracy, particularly for Kannada and noisy audio, depends on microphone hardware and provider model support.

## Roadmap

Planned future improvements (not currently implemented):

- Reusable form-label templates for common public-service portals
- Optional per-site permission profiles and domain quick-toggles
- Local/offline small-model fallback via WebGPU where supported
- Expanded dialect tuning and noise handling for regional voice input

## Project info

Team name: <Team Name> | Team ID: <Team ID> | Event: <Hackathon name and track> | Members: <Names>

## License

MIT — see [LICENSE](LICENSE).
