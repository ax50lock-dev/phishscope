/* PhishScope warning overlay
 * Injected by the content script when a page scores HIGH RISK. Shows a
 * plain-language (Grandma-mode) explanation with Leave / Continue choices.
 *
 * Design constraints:
 *  - No external resources; all styles inline so it works offline and
 *    can't be blocked by the page's CSP for external assets.
 *  - High z-index and a Shadow DOM so the host page can't easily style or
 *    remove it, and so the page's own CSS can't leak in.
 *  - Never shown on a domain the user has chosen to trust, and not shown
 *    again on a page the user clicked "Continue" for (per tab session).
 */

(() => {
  const PS = globalThis.PhishScope;
  if (!PS || window.__phishscopeOverlayLoaded) return;
  window.__phishscopeOverlayLoaded = true;

  const ICON = { "HIGH RISK": "🛑", "SUSPICIOUS": "⚠️" };

  function buildExplanation(result) {
    const ctx = PS.brandSimilarity(result.hostname) || {};
    return PS.explainResult(result, "simple", ctx);
  }

  function show(result) {
    if (document.getElementById("phishscope-overlay-host")) return;

    const explain = buildExplanation(result);
    const host = document.createElement("div");
    host.id = "phishscope-overlay-host";
    host.style.cssText = "all: initial; position: fixed; inset: 0; z-index: 2147483647;";
    const root = host.attachShadow({ mode: "open" });

    const reasonsHtml = explain.reasons.slice(0, 5).map(r => {
      const why = r.why ? `<div class="why">${esc(r.why)}</div>` : "";
      return `<li><span class="r-text">${esc(r.text)}</span>${why}</li>`;
    }).join("");

    const impersonationHtml = explain.impersonation && explain.impersonation.similarity != null ? `
      <div class="impersonation">
        <div class="imp-row"><span>Real ${esc(explain.impersonation.brand)} site</span><b class="real">${esc(explain.impersonation.realDomain)}</b></div>
        <div class="imp-row"><span>You are on</span><b class="fake">${esc(explain.impersonation.shownDomain)}</b></div>
      </div>` : "";

    const scamHtml = explain.scamTypes.length
      ? `<div class="scam-tags">${explain.scamTypes.map(t => `<span>${esc(t)}</span>`).join("")}</div>`
      : "";

    root.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
        .backdrop {
          position: fixed; inset: 0; background: rgba(8,10,15,0.86);
          display: flex; align-items: center; justify-content: center; padding: 20px;
          backdrop-filter: blur(3px);
        }
        .card {
          background: #ffffff; color: #1a1f2b; max-width: 480px; width: 100%;
          border-radius: 14px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.5);
          max-height: 90vh; display: flex; flex-direction: column;
        }
        .head { padding: 22px 24px 16px; text-align: center; }
        .icon { font-size: 44px; line-height: 1; }
        .headline { font-size: 21px; font-weight: 700; margin: 12px 0 0; }
        .body { padding: 0 24px 4px; overflow-y: auto; }
        .summary { font-size: 15px; line-height: 1.55; margin: 0 0 14px; }
        .impersonation { background: #f6f8fb; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; }
        .imp-row { display: flex; justify-content: space-between; gap: 12px; margin: 4px 0; font-size: 13px; font-family: ui-monospace, Menlo, monospace; }
        .imp-row span { color: #64748b; }
        .real { color: #0a9e6e; word-break: break-all; }
        .fake { color: #dc2626; word-break: break-all; }
        .scam-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
        .scam-tags span { background: #fee2e2; color: #b91c1c; border-radius: 4px; font-size: 11px; font-weight: 600; padding: 4px 9px; text-transform: uppercase; letter-spacing: 0.03em; }
        ul { margin: 0 0 8px; padding: 0; list-style: none; }
        li { padding: 9px 0; border-top: 1px solid #eef2f6; }
        .r-text { font-size: 14px; font-weight: 500; }
        .why { font-size: 12.5px; color: #64748b; margin-top: 3px; line-height: 1.45; }
        .action { background: #fff7ed; border: 1px solid #fdba74; color: #9a3412; border-radius: 8px; padding: 12px 14px; font-size: 13.5px; line-height: 1.5; margin: 6px 0 4px; }
        .foot { padding: 16px 24px 20px; display: flex; flex-direction: column; gap: 10px; }
        .btn { border: none; border-radius: 9px; padding: 13px; font-size: 15px; font-weight: 600; cursor: pointer; }
        .leave { background: #16a34a; color: #fff; }
        .leave:hover { background: #15803d; }
        .row { display: flex; gap: 10px; }
        .row .btn { flex: 1; font-size: 13px; padding: 10px; font-weight: 500; }
        .ghost { background: #f1f5f9; color: #475569; }
        .ghost:hover { background: #e2e8f0; }
        .continue { background: transparent; color: #dc2626; border: 1px solid #fecaca; }
        .continue:hover { background: #fef2f2; }
        .brandline { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 4px; }
      </style>
      <div class="backdrop">
        <div class="card" role="alertdialog" aria-modal="true" aria-label="Security warning">
          <div class="head">
            <div class="icon">${ICON[result.verdict] || "⚠️"}</div>
            <h1 class="headline">${esc(explain.headline)}</h1>
          </div>
          <div class="body">
            <p class="summary">${esc(explain.summary)}</p>
            ${impersonationHtml}
            ${scamHtml}
            <ul>${reasonsHtml}</ul>
            <div class="action">${esc(explain.action)}</div>
          </div>
          <div class="foot">
            <button class="btn leave" id="ps-leave">Take me to safety</button>
            <div class="row">
              <button class="btn ghost" id="ps-trust">Trust this site</button>
              <button class="btn continue" id="ps-continue">Continue anyway</button>
            </div>
            <div class="brandline">◉ PhishScope — this is a warning, not a block. You decide.</div>
          </div>
        </div>
      </div>`;

    document.documentElement.appendChild(host);

    const remove = () => host.remove();

    root.getElementById("ps-leave").addEventListener("click", () => {
      // Go back if there's history, else to a neutral blank tab
      remove();
      if (history.length > 1) history.back();
      else location.href = "about:blank";
    });

    root.getElementById("ps-continue").addEventListener("click", () => {
      // Remember dismissal for this page so it doesn't nag on every re-scan
      try { sessionStorage.setItem("__phishscope_dismissed", location.href); } catch {}
      remove();
    });

    root.getElementById("ps-trust").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "TRUST_DOMAIN", hostname: result.hostname });
      remove();
    });
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // Expose so the content script can trigger it
  window.__phishscopeShowOverlay = show;
})();
