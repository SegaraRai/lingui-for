(function () {
  function applyTabByHash() {
    var hash = location.hash.slice(1);
    if (!hash) return;

    document
      .querySelectorAll("starlight-tabs")
      .forEach(function (starlightTabs) {
        var tabs = Array.from(starlightTabs.querySelectorAll('[role="tab"]'));
        var panels = Array.from(
          starlightTabs.querySelectorAll(':scope > [role="tabpanel"]'),
        );

        var matchIndex = tabs.findIndex(function (tab) {
          return (
            (tab.textContent || "").trim().toLowerCase() === hash.toLowerCase()
          );
        });

        if (matchIndex === -1) return;

        // Deselect all tabs and hide all panels
        tabs.forEach(function (tab, i) {
          tab.setAttribute("aria-selected", "false");
          tab.setAttribute("tabindex", "-1");
          var panel = panels[i];
          if (panel) panel.setAttribute("hidden", "");
        });

        // Activate the matched tab and its panel
        var newTab = tabs[matchIndex];
        var newPanel = panels[matchIndex];
        if (newTab) {
          newTab.removeAttribute("tabindex");
          newTab.setAttribute("aria-selected", "true");
        }
        if (newPanel) {
          newPanel.removeAttribute("hidden");
        }

        // Persist to localStorage so other synced tabs on the page follow
        var syncKey = starlightTabs.dataset.syncKey;
        if (syncKey && newTab) {
          try {
            localStorage.setItem(
              "starlight-synced-tabs__" + syncKey,
              (newTab.textContent || "").trim(),
            );
          } catch (_) {}
        }
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyTabByHash);
  } else {
    applyTabByHash();
  }

  window.addEventListener("hashchange", applyTabByHash);
})();
