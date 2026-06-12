/* PhishScope content script (V2)
 * Runs on every http(s) page. Collects raw facts about the DOM,
 * scores them with the shared engine, and reports to the background
 * worker so the toolbar badge shows a live verdict.
 * Also answers GET_PAGE_SCAN requests from the popup.
 */

(() => {
  const PS = globalThis.PhishScope;
  if (!PS) return;

  const BAIT_PHRASES = [
    "verify your account", "account verification", "security check",
    "login required", "account suspended", "unusual activity",
    "confirm your identity", "verify immediately", "act now",
    "your account will be", "re-enter your password", "session expired"
  ];

  function sameRegistrable(hostA, hostB) {
    return PS.splitHostname(hostA).registrable === PS.splitHostname(hostB).registrable;
  }

  /** Gather raw, unscored facts about the current page. */
  function collectFacts() {
    const hostname = location.hostname;

    const hasPasswordInput = !!document.querySelector('input[type="password"]');

    // Visible-ish text sample: title + headings + form labels/buttons.
    // Scanning innerText of the whole body is slow on big pages; this is
    // where phishing bait language actually lives.
    const textBits = [
      document.title,
      ...[...document.querySelectorAll("h1, h2, h3, label, button, legend, [role=alert]")]
        .slice(0, 80)
        .map(el => el.textContent || "")
    ].join(" ").toLowerCase();

    const baitPhrases = BAIT_PHRASES.filter(p => textBits.includes(p));

    // Forms that post somewhere else, or over plain HTTP
    const externalFormHosts = [];
    let insecureFormAction = false;
    for (const form of document.querySelectorAll("form[action]")) {
      let actionUrl;
      try { actionUrl = new URL(form.getAttribute("action"), location.href); } catch { continue; }
      if (!/^https?:$/.test(actionUrl.protocol)) continue;
      const hasCredFields = form.querySelector('input[type="password"], input[type="email"], input[name*=user i], input[name*=login i]');
      if (!hasCredFields) continue;
      if (!sameRegistrable(actionUrl.hostname, hostname)) {
        externalFormHosts.push(actionUrl.hostname);
      }
      if (location.protocol === "https:" && actionUrl.protocol === "http:") {
        insecureFormAction = true;
      }
    }

    // Brands featured prominently (title / main headings only — a news
    // article mentioning PayPal in a paragraph shouldn't trigger this)
    const prominent = (document.title + " " +
      [...document.querySelectorAll("h1, h2")].slice(0, 10).map(h => h.textContent).join(" ")
    ).toLowerCase();
    const brandMentions = PS.PROTECTED_BRANDS.filter(b => prominent.includes(b));

    // Broader visible-text sample for Scam Shield category matching.
    // Cap length so huge pages stay fast; scam copy is short and near the top.
    let pageText = "";
    try {
      pageText = (document.body?.innerText || "").slice(0, 8000).toLowerCase();
    } catch { pageText = textBits; }

    // Cheap behavioural signals (more advanced behaviour analysis is a
    // future update — these are the safe, synchronous ones)
    const forcedFullscreen = !!document.fullscreenElement;

    return {
      hostname, hasPasswordInput, baitPhrases,
      externalFormHosts: [...new Set(externalFormHosts)],
      insecureFormAction, brandMentions, pageText, forcedFullscreen
    };
  }

  function runScan() {
    const facts = collectFacts();
    const pageFindings = PS.analyzePageFacts(facts);
    return { facts, pageFindings };
  }

  /** Full local result = URL findings + page findings combined. */
  function fullResult() {
    const { facts, pageFindings } = runScan();
    const urlResult = PS.analyzeUrl(location.href);
    const urlFindings = urlResult.ok ? urlResult.findings : [];
    const combined = PS.combineFindings(urlFindings, pageFindings);
    return {
      hostname: location.hostname,
      url: location.href,
      score: combined.score,
      verdict: combined.verdict,
      findings: combined.findings,
      pageFindings
    };
  }

  // Report to background for the badge (URL findings are computed there)
  function report() {
    try {
      chrome.runtime.sendMessage({ type: "PAGE_SCAN_RESULT", payload: runScan() });
    } catch { /* extension reloaded; ignore */ }
  }

  // Decide whether to show the warning overlay on this page.
  async function maybeWarn() {
    const result = fullResult();
    if (result.verdict !== "HIGH RISK") return;

    // Respect a per-page dismissal for this tab session
    try {
      if (sessionStorage.getItem("__phishscope_dismissed") === location.href) return;
    } catch {}

    // Ask background whether overlay is enabled and this domain is trusted
    let allowed = true;
    try {
      const resp = await chrome.runtime.sendMessage({ type: "OVERLAY_CHECK", hostname: location.hostname });
      allowed = resp && resp.show;
    } catch { allowed = false; }

    if (allowed && typeof window.__phishscopeShowOverlay === "function") {
      window.__phishscopeShowOverlay(result);
    }
  }

  report();
  maybeWarn();
  // Re-scan when SPAs late-render login forms
  let rescans = 0;
  const observer = new MutationObserver(() => {
    if (rescans >= 3) return observer.disconnect();
    clearTimeout(observer._t);
    observer._t = setTimeout(() => { rescans++; report(); maybeWarn(); }, 1500);
  });
  observer.observe(document.body || document.documentElement, { childList: true, subtree: true });

  // Popup asks for fresh page findings
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "GET_PAGE_SCAN") {
      sendResponse(runScan());
    }
    return false;
  });
})();
