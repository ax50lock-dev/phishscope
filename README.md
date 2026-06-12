# PhishScope

A browser extension that analyzes URLs, web pages, and emails for phishing
and scam indicators, then explains its reasoning in plain language. Built
with vanilla HTML, CSS, and JavaScript — no build step, no frameworks, no
trackers.

```
https://paypal-security-login-verification.xyz   ->   85/100   HIGH RISK

This site looks like it's pretending to be paypal.
The real paypal address is paypal.com, but this page is
paypal-security-login-verification.xyz.

 - Embeds "paypal" in a hyphenated domain
 - Domain registered 12 days ago
 - Commonly-abused TLD (.xyz)
 - Urgency keywords in hostname

Do not enter passwords or payment details here.
```

---

## Table of contents

1. [What it does](#what-it-does)
2. [Install](#install)
3. [Optional lookup services & API keys](#optional-lookup-services--api-keys)
4. [Privacy & data handling](#privacy--data-handling)
5. [How the risk engine works](#how-the-risk-engine-works)
6. [Display modes](#display-modes)
7. [Project structure](#project-structure)
8. [Testing](#testing)
9. [Roadmap](#roadmap)
10. [Limitations](#limitations)

---

## What it does

- **URL analysis** - lookalike brands (Levenshtein distance), homograph
  attacks (Unicode confusables + punycode decoding), suspicious TLDs, link
  shorteners, IP-logger/grabber links, free-hosting abuse, excessive
  subdomains, and more.
- **Live page analysis** - a content script inspects the page you're on for
  password forms, forms posting to other domains, brand impersonation, and
  Scam Shield categories (tech-support scams, fake virus warnings, fake
  giveaways, crypto/investment scams, suspicious shops).
- **Email analysis** - paste a suspicious email (text, raw headers, or both):
  SPF/DKIM/DMARC checks, display-name spoofing, Reply-To/Return-Path
  mismatches, deceptive hyperlinks, and every link run through the URL engine.
- **High-risk warning overlay** - a full-page, plain-language warning when you
  land on a dangerous page. It's a *warning, never a block* - you always
  choose to leave, trust the site, or continue.
- **Plain-language explanations** - every result opens with a single
  jargon-free sentence ("This looks like a fake PayPal page, not the real
  one"), shown in all modes. Three display modes (Simple / Normal / Expert)
  control how much detail follows. Simple is the default.
- **Actionable buttons** - results offer clear next steps: "Go to the real
  paypal.com site" for impersonation, plus "Leave this site" / "I'll be
  careful".
- **Color themes** - Dark, Light, Midnight, and High-contrast, in Settings.
- **Scan history** - the last 200 scans stored locally, exportable as JSON or
  CSV threat reports.
- **Optional database lookups** - VirusTotal, PhishTank, and RDAP domain age.
- **Optional AI explanations** - narrate findings using your own Anthropic key.

---

## Install

This is an unpacked developer extension (not yet on the Chrome Web Store).

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome (or `edge://extensions`,
   `brave://extensions` - all Chromium browsers work).
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `phishing-detector` folder.
5. Pin PhishScope to your toolbar. Click the icon on any page to analyze it.

When you update the code, click the **reload** icon on the extension card.
If the manifest changed (new permissions), remove and re-add it.

No build step is required - the code runs as-is.

---

## Optional lookup services & API keys

PhishScope works fully on its own using built-in heuristics. The services
below are **optional** and **off by default**. Each one improves detection of
phishing hosted on clean-looking domains that heuristics alone can't catch.
Configure them in the extension's **Settings** tab or its options page
(`chrome://extensions` -> PhishScope -> Details -> Extension options).

| Service | What it adds | Key needed? | Where to get it |
|---------|--------------|-------------|-----------------|
| **VirusTotal** | Cross-checks the URL against ~90 security vendors. 3+ vendors flagging it adds a large risk weight; a broad clean result lowers it. | Yes (free) | virustotal.com -> sign up -> profile -> **API key** |
| **PhishTank** | Checks a community database of reported/verified phishing URLs. A verified listing is a very strong signal. | Optional | phishtank.org -> register -> Developer info (works without a key at lower rate limits) |
| **RDAP domain age** | Looks up how recently the domain was registered. Most phishing domains are days to weeks old. | No | Built-in (uses the free public RDAP service) |
| **AI explanations** | Narrates the findings in friendly natural language. Does **not** decide if a site is dangerous - only explains the existing findings. | Yes (your own) | console.anthropic.com -> API keys |

**Free-tier limits to be aware of:** VirusTotal allows ~4 requests/minute and
500/day; the popup's auto-scan on open counts toward this. PhishTank and RDAP
are also rate-limited. Errors (rate limits, bad keys) are shown in the popup's
status line rather than failing silently.

---

## Privacy & data handling

Transparency is a core goal of this project. Here is exactly what happens to
your data:

- **Everything runs locally by default.** URL heuristics, page analysis, email
  analysis, and the warning overlay all run entirely in your browser. Nothing
  is sent anywhere unless you turn on an optional lookup service.
- **API keys are stored on your device only** (`chrome.storage.local`), never
  in `chrome.storage.sync`. They are not transmitted anywhere except directly
  to the service they belong to (VirusTotal/PhishTank/Anthropic) when you use
  that service.
- **What gets sent, and when:**
  - *VirusTotal / PhishTank:* the **URL** you analyze, only when the service is
    enabled.
  - *RDAP:* the **domain name** (not the full URL), only when enabled.
  - *AI explanations:* the **verdict, score, and finding labels** - never the
    page contents, form values, or your browsing history - and only when you
    click "Explain with AI".
- **No analytics, no telemetry, no ads.** The extension contains no tracking
  code and makes no network requests of its own beyond the optional services
  above.
- **Scan history stays local** (`chrome.storage.local`) and never leaves your
  machine unless you choose to export it.
- **Permissions requested:** `activeTab` and `tabs` (to read the URL of the tab
  you're analyzing), `storage` (to save settings and history). Host
  permissions are limited to the four optional services' domains.

If you find any behavior that contradicts the above, please open an issue -
that's exactly the kind of report this project wants.

---

## How the risk engine works

Each detector inspects the input and returns findings with point values.
Points are summed, clamped to 0-100, and mapped to a verdict:

| Score | Verdict |
|-------|---------|
| 0-30  | SAFE |
| 31-60 | SUSPICIOUS |
| 61-100 | HIGH RISK |

Selected URL/page indicators (not exhaustive - see `lib/analyzer.js`):

| Indicator | Points |
|-----------|--------|
| IP-logger / grabber link (Grabify, IPLogger, ...) | +65 |
| Homograph spoof of a known brand | +60 |
| Lookalike brand (edit distance within threshold) | +40 (+10 if hyphenated) |
| Brand used as a subdomain of an unrelated domain | +40 |
| Crypto/investment scam language (2+ markers) | +40 |
| Tech-support / fake-virus scam language (2+ markers) | +35 |
| Link shortener / redirector | +35 |
| Domain registered within ~14 days | +35 |
| Form posts to a different domain | +30 |
| Credential form on a free-hosting platform | +30 |
| IP address instead of a domain | +30 |
| Free-hosting platform | +25 |
| Suspicious TLD (.xyz, .top, .zip, ...) | +20 |
| Password form present | +15 |
| Uses HTTPS | -5 (suppressed once other risk signals fire) |

### Algorithms worth studying

- **Levenshtein distance** (`lib/analyzer.js`) - two-row dynamic programming;
  the match threshold scales with brand length.
- **Homoglyph / confusable folding** - maps Cyrillic/Greek/fullwidth
  lookalikes to a Latin "skeleton" (Unicode TR39 style), plus a punycode
  decoder so `xn--`-encoded homographs are caught too.
- **eTLD+1 extraction** - identifies the *registrable* domain so
  `paypal.com.login.verify-user.xyz` is correctly read as `verify-user.xyz`.

---

## Display modes

Every result begins with one jargon-free sentence summarizing what happened,
regardless of mode. The mode (set in **Settings**) controls the detail below:

- **Simple** (default; great for non-technical users) - calm plain-language
  summary, the real-vs-fake domain comparison, the scam type, and one clear
  action line.
- **Normal** - readable reasons, each with a short "why it matters".
- **Expert** - the full technical findings ledger with point values and
  "Learn more" explainers (homographs, typosquatting, TLD abuse, etc.).

### Themes

Four color themes in Settings: **Dark** (default), **Light**, **Midnight**,
and **High-contrast** (for accessibility). The choice applies to the popup
and the full-tab view and syncs across the options page.

---

## Project structure

```
phishing-detector/
|-- manifest.json          MV3 config
|-- background.js          Service worker: badge, score combining, trust list
|-- content.js             Page scanner: collects DOM facts, triggers overlay
|-- overlay.js             Full-page high-risk warning (Shadow DOM)
|-- options.html/.js       Settings page (syncs with the popup)
|-- popup/
|   |-- popup.html         Four-tab UI: URL - Email - History - Settings
|   |-- popup.css          Styling
|   |-- popup.js           Controller for all tabs and rendering
|-- lib/
|   |-- analyzer.js        * The risk engine + Explain-WHY layer (no DOM)
|   |-- virustotal.js      VirusTotal API v3 client
|   |-- phishtank.js       PhishTank checkurl client
|   |-- rdap.js            RDAP domain-age client
|   |-- ai-explain.js      Optional Anthropic narration client
|   |-- email-analyzer.js  Email header + content analysis
|-- icons/
```

The risk engine (`lib/analyzer.js`) has no DOM dependencies, so it can be
unit-tested in plain Node:

```bash
node -e "
global.globalThis.PhishScope = undefined;
require('./lib/analyzer.js');
console.log(globalThis.PhishScope.analyzeUrl('https://paypa1-login.xyz'));
"
```

---

## Testing

PhishScope has a zero-dependency test suite (no framework, no network, no
`npm install` required). The engine is pure and DOM-free, so it runs in plain
Node:

```bash
npm test
# or directly:
node test/run.js
```

The suite (`test/suite.js`) currently has 50+ assertions covering: the string
algorithms (Levenshtein, homoglyph folding, eTLD+1 extraction), URL detection
of every known-bad shape, a regression block that keeps legitimate sites SAFE,
the HTTPS scoring rule, all five Scam Shield categories, credential-harvesting
page facts, score combining and band mapping, brand similarity, the
three-mode Explain-WHY layer, email header/content analysis, and a privacy
check proving the AI prompt never contains page content. It exits non-zero on
failure, so it can gate a commit or CI step.

Manual end-to-end testing:

1. Load the extension unpacked.
2. Paste known-bad URLs from a feed like PhishTank into the URL tab.
3. Paste a suspicious email into the Email tab.
4. Toggle display modes and confirm the explanation changes.
5. Visit a high-risk test page and confirm the warning overlay appears, then
   that "Trust this site" suppresses it.

---

## Roadmap

Done: URL engine, page scanner, email analysis, history + export, VirusTotal,
PhishTank, RDAP, IP-logger detection, homograph/TR39, Scam Shield categories,
three display modes, warning overlay, optional AI explanations.

Planned:

- **Deeper browser-behaviour analysis** - clipboard hijacking, forced
  redirects, notification/popup spam (needs careful content-script work).
- **Community intelligence** - shared user reports (needs a backend; would be
  built as an optional, clearly-disclosed service).
- **Full Public Suffix List** - replaces the current common-suffix handling.
- **Allowlist/blocklist tuning** and **lookup result caching**.

---

## Limitations

This is heuristic scoring, not ground truth. **A low score is not proof a site
is safe** - a well-crafted phishing page on a clean, established domain can
pass. **A high score is not proof of malice** - legitimate sites sometimes do
unusual things. Always verify a site independently before entering credentials
or payment details. PhishScope is a decision aid, not a guarantee.

---

## License & contributing

Released under the [MIT License](LICENSE) for transparency and education.
Issues and pull requests are welcome - especially false-positive/false-negative
reports with the URL or email that was misjudged, and any privacy or security
concerns. If you add or change a detector, please add a matching assertion in
`test/suite.js` and make sure `npm test` passes.
