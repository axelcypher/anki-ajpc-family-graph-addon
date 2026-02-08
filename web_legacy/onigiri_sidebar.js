(() => {
  if (window.__ajpcGraphSidebarInjected) {
    return;
  }
  window.__ajpcGraphSidebarInjected = true;

  const inject = () => {
    const sidebar = document.querySelector(".sidebar-left");
    if (!sidebar) {
      return false;
    }
    const container =
      sidebar.querySelector(".sidebar-expanded-content") || sidebar;
    if (!container) {
      return false;
    }
    if (container.querySelector(".action-ajpc-graph")) {
      return true;
    }

    const item = document.createElement("div");
    item.className = "menu-item action-ajpc-graph";
    item.innerHTML = "<i class=\"icon\"></i><span>Graph</span>";
    item.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (typeof pycmd === "function") {
        pycmd("ajpc_family_graph_open");
      }
    });

    const browseItem = container.querySelector(".menu-item.action-browse");
    if (browseItem && browseItem.parentNode) {
      browseItem.parentNode.insertBefore(item, browseItem.nextSibling);
    } else {
      container.appendChild(item);
    }

    const graphIconUrl = "/_addons/ajpc-family-graph_dev/web/graph-icon.svg";
    item.style.setProperty("--ajpc-graph-icon", `url('${graphIconUrl}')`);
    return true;
  };

  const ready = () => {
    if (inject()) {
      return;
    }
    const observer = new MutationObserver(() => {
      if (inject()) {
        observer.disconnect();
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ready);
  } else {
    ready();
  }
})();
