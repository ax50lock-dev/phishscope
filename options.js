/* PhishScope options page — same storage keys as the popup, so the two
 * stay in sync automatically. */

const $ = id => document.getElementById(id);

function applyTheme(name) {
  document.body.setAttribute("data-theme", name || "dark");
  document.querySelectorAll(".theme-swatch").forEach(b =>
    b.classList.toggle("active", b.dataset.theme === (name || "dark")));
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".theme-swatch").forEach(btn =>
    btn.addEventListener("click", async () => {
      applyTheme(btn.dataset.theme);
      await chrome.storage.sync.set({ theme: btn.dataset.theme });
    }));
});

function refreshDots(vt, pt, rdap) {
  $("vt-dot").classList.toggle("on", !!vt);
  $("pt-dot").classList.toggle("on", pt);
  $("rdap-dot").classList.toggle("on", rdap);
}

$("save").addEventListener("click", async () => {
  const vtApiKey = $("vt-key").value.trim() || null;
  const ptApiKey = $("pt-key").value.trim() || null;
  const ptEnabled = $("pt-enabled").checked;
  const rdapEnabled = $("rdap-enabled").checked;
  const modeEl = document.querySelector('input[name="ui-mode"]:checked');
  const uiMode = modeEl ? modeEl.value : "normal";
  const aiApiKey = $("ai-key") ? ($("ai-key").value.trim() || null) : null;
  // Secrets on-device only; preferences may sync.
  await chrome.storage.local.set({ vtApiKey, ptApiKey, aiApiKey });
  await chrome.storage.sync.set({ ptEnabled, rdapEnabled, uiMode });
  refreshDots(vtApiKey, ptEnabled, rdapEnabled);
  $("status").textContent = "Saved. These settings now apply in the popup too.";
});

(async function init() {
  const [secrets, prefs] = await Promise.all([
    chrome.storage.local.get(["vtApiKey", "ptApiKey", "aiApiKey"]),
    chrome.storage.sync.get(["ptEnabled", "rdapEnabled", "uiMode", "theme"])
  ]);
  const s = { ...secrets, ...prefs };
  if (s.vtApiKey) $("vt-key").value = s.vtApiKey;
  if (s.ptApiKey) $("pt-key").value = s.ptApiKey;
  if (s.aiApiKey && $("ai-key")) $("ai-key").value = s.aiApiKey;
  $("pt-enabled").checked = !!s.ptEnabled;
  $("rdap-enabled").checked = !!s.rdapEnabled;
  const mode = s.uiMode || "simple";
  const r = document.querySelector(`input[name="ui-mode"][value="${mode}"]`);
  if (r) r.checked = true;
  applyTheme(s.theme || "dark");
  refreshDots(s.vtApiKey, !!s.ptEnabled, !!s.rdapEnabled);
})();

// Live-sync: if the popup changes settings while this page is open, reflect it
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    if (changes.vtApiKey) $("vt-key").value = changes.vtApiKey.newValue || "";
    if (changes.ptApiKey) $("pt-key").value = changes.ptApiKey.newValue || "";
    if (changes.aiApiKey && $("ai-key")) $("ai-key").value = changes.aiApiKey.newValue || "";
    return;
  }
  if (area !== "sync") return;
  if (changes.ptEnabled) $("pt-enabled").checked = !!changes.ptEnabled.newValue;
  if (changes.rdapEnabled) $("rdap-enabled").checked = !!changes.rdapEnabled.newValue;
  if (changes.uiMode) {
    const r = document.querySelector(`input[name="ui-mode"][value="${changes.uiMode.newValue}"]`);
    if (r) r.checked = true;
  }
  if (changes.theme) applyTheme(changes.theme.newValue);
});
