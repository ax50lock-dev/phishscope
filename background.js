/* PhishScope background service worker (V2)
 * Combines the URL analysis with page findings reported by the
 * content script and shows a live verdict badge on the toolbar icon.
 */

importScripts("lib/analyzer.js");
const PS = globalThis.PhishScope;

const BADGE_COLORS = { "SAFE": "#2dd4a7", "SUSPICIOUS": "#f2b23e", "HIGH RISK": "#f4544c" };

// Latest page findings per tabId, so the popup can also request them here
const tabState = new Map();

function setBadge(tabId, combined) {
  chrome.action.setBadgeText({ tabId, text: String(combined.score) });
  chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLORS[combined.verdict] });
  if (chrome.action.setBadgeTextColor) {
    chrome.action.setBadgeTextColor({ tabId, color: "#10141d" });
  }
}

function evaluateTab(tabId, url, pageFindings = []) {
  if (!url || !/^https?:/.test(url)) {
    chrome.action.setBadgeText({ tabId, text: "" });
    return;
  }
  const urlResult = PS.analyzeUrl(url);
  if (!urlResult.ok) return;
  const combined = PS.combineFindings(urlResult.findings, pageFindings);
  tabState.set(tabId, { url, urlFindings: urlResult.findings, pageFindings, combined });
  setBadge(tabId, combined);
}

// URL-only verdict as soon as navigation commits (page findings arrive later)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading" && tab.url) {
    evaluateTab(tabId, tab.url, []);
  }
});

chrome.tabs.onRemoved.addListener(tabId => tabState.delete(tabId));

/** Trusted domains and the overlay-enabled flag live in storage.local. */
async function isTrusted(hostname) {
  const { trustedDomains = [] } = await chrome.storage.local.get("trustedDomains");
  const reg = PS.splitHostname(hostname).registrable;
  return trustedDomains.includes(reg) || trustedDomains.includes(hostname);
}

async function overlayEnabled() {
  const { overlayEnabled = true } = await chrome.storage.sync.get("overlayEnabled");
  return overlayEnabled;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "PAGE_SCAN_RESULT" && sender.tab?.id != null) {
    evaluateTab(sender.tab.id, sender.tab.url, msg.payload.pageFindings);
  }
  if (msg?.type === "GET_TAB_STATE") {
    sendResponse(tabState.get(msg.tabId) || null);
    return false;
  }
  if (msg?.type === "OVERLAY_CHECK") {
    if (!sender.tab) { sendResponse({ show: false }); return false; }
    // async: should the overlay show for this hostname?
    (async () => {
      const [enabled, trusted] = await Promise.all([overlayEnabled(), isTrusted(msg.hostname)]);
      sendResponse({ show: enabled && !trusted });
    })();
    return true; // keep the message channel open for the async reply
  }
  if (msg?.type === "TRUST_DOMAIN") {
    if (!sender.tab) { sendResponse({ ok: false }); return false; }
    (async () => {
      const reg = PS.splitHostname(msg.hostname).registrable;
      const { trustedDomains = [] } = await chrome.storage.local.get("trustedDomains");
      if (!trustedDomains.includes(reg)) {
        trustedDomains.push(reg);
        await chrome.storage.local.set({ trustedDomains });
      }
      sendResponse({ ok: true });
    })();
    return true;
  }
  return false;
});
