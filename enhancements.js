(() => {
  "use strict";

  const sizeOrder = [
    "XXS", "XS", "S", "M", "L", "XL",
    "2XL", "3XL", "4XL", "5XL", "6XL", "7XL", "8XL"
  ];

  const waitForDashboard = () => new Promise((resolve) => {
    const ready = () => {
      const apply = document.getElementById("applyFilters");
      const category = document.getElementById("categoryFilter");
      if (apply && category) return resolve();
      window.setTimeout(ready, 100);
    };
    ready();
  });

  function optionRank(value) {
    const normalized = String(value || "").trim().toUpperCase();
    const exact = sizeOrder.indexOf(normalized);
    if (exact >= 0) return exact;

    const numeric = normalized.match(/^(\d+)(?:XL|X)$/);
    if (numeric) return 100 + Number(numeric[1]);

    const numberOnly = normalized.match(/^\d+(?:[.,]\d+)?$/);
    if (numberOnly) return 200 + Number(normalized.replace(",", "."));

    return 1000;
  }

  function reorderSizeOptions() {
    const select = document.getElementById("sizeFilter");
    if (!select || select.options.length <= 2) return;

    const current = select.value;
    const first = select.options[0];
    const rest = [...select.options].slice(1).sort((a, b) => {
      const rankDiff = optionRank(a.value) - optionRank(b.value);
      return rankDiff || a.textContent.localeCompare(b.textContent, "pl", { numeric: true });
    });

    select.innerHTML = "";
    select.appendChild(first);
    rest.forEach((option) => select.appendChild(option));
    if ([...select.options].some((option) => option.value === current)) select.value = current;
  }

  function selectedLabel(select) {
    if (!select || !select.value) return null;
    return select.options[select.selectedIndex]?.textContent || select.value;
  }

  function updateActiveFilters() {
    const bar = document.getElementById("activeFiltersBar");
    if (!bar) return;

    const entries = [
      ["Kategoria", document.getElementById("categoryFilter")],
      ["Model", document.getElementById("modelFilter")],
      ["Kolor", document.getElementById("colorFilter")],
      ["Rozmiar", document.getElementById("sizeFilter")]
    ];

    const active = entries
      .map(([label, select]) => {
        const value = selectedLabel(select);
        return value ? `${label}: ${value}` : null;
      })
      .filter(Boolean);

    bar.textContent = active.length ? `Aktywne filtry: ${active.join(" · ")}` : "Aktywne filtry: brak";
  }

  function dispatchChange(select) {
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function setFilter(selectId, value) {
    const select = document.getElementById(selectId);
    if (!select || !value) return false;

    const optionExists = [...select.options].some((option) => option.value === value);
    if (!optionExists) return false;

    select.value = value;
    dispatchChange(select);
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    return true;
  }

  async function applyRankingFilter(type, row) {
    const cells = [...row.cells].map((cell) => cell.textContent.trim());
    if (!cells.length || cells[0] === "Brak danych" || cells[0].startsWith("Wymaga")) return;

    if (type === "category") {
      await setFilter("categoryFilter", cells[0]);
    } else if (type === "model") {
      if (cells[2] && cells[2] !== "—") await setFilter("categoryFilter", cells[2]);
      await setFilter("modelFilter", cells[0]);
    } else if (type === "color") {
      await setFilter("colorFilter", cells[0]);
    } else if (type === "modelColor") {
      await setFilter("modelFilter", cells[0]);
      await setFilter("colorFilter", cells[2]);
    } else if (type === "size") {
      await setFilter("sizeFilter", cells[0]);
    }

    reorderSizeOptions();
    updateActiveFilters();
    document.getElementById("applyFilters")?.click();
    document.querySelector(".filters")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function makeRankingClickable(tbodyId, type) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    tbody.addEventListener("click", (event) => {
      const row = event.target.closest("tr");
      if (!row) return;
      applyRankingFilter(type, row);
    });

    const observer = new MutationObserver(() => {
      [...tbody.querySelectorAll("tr")].forEach((row) => {
        if (row.cells.length && !row.textContent.includes("Brak danych") && !row.textContent.includes("Wymaga")) {
          row.style.cursor = "pointer";
          row.title = "Kliknij, aby zastosować ten filtr";
        }
      });
    });
    observer.observe(tbody, { childList: true });
  }

  function addResetButton() {
    const action = document.querySelector(".filter-action");
    if (!action || document.getElementById("resetFilters")) return;

    const reset = document.createElement("button");
    reset.id = "resetFilters";
    reset.type = "button";
    reset.className = "secondary";
    reset.textContent = "Wyczyść filtry";
    reset.style.marginTop = "8px";
    action.appendChild(reset);

    reset.addEventListener("click", () => {
      ["categoryFilter", "modelFilter", "colorFilter", "sizeFilter"].forEach((id) => {
        const select = document.getElementById(id);
        if (select) select.value = "";
      });

      const aggregation = document.getElementById("aggregationFilter");
      if (aggregation) aggregation.value = "day";

      const category = document.getElementById("categoryFilter");
      if (category) dispatchChange(category);
      reorderSizeOptions();
      updateActiveFilters();
      document.querySelector('[data-days="30"]')?.click();
    });
  }

  function addActiveFiltersBar() {
    const grid = document.querySelector(".filter-grid");
    if (!grid || document.getElementById("activeFiltersBar")) return;

    const bar = document.createElement("div");
    bar.id = "activeFiltersBar";
    bar.className = "muted small";
    bar.style.marginTop = "10px";
    grid.insertAdjacentElement("afterend", bar);
    updateActiveFilters();
  }

  async function initializeEnhancements() {
    await waitForDashboard();

    addResetButton();
    addActiveFiltersBar();
    reorderSizeOptions();

    makeRankingClickable("topCategoriesBody", "category");
    makeRankingClickable("topModelsBody", "model");
    makeRankingClickable("topColorsBody", "color");
    makeRankingClickable("topModelColorsBody", "modelColor");
    makeRankingClickable("topSizesBody", "size");

    ["categoryFilter", "modelFilter", "colorFilter", "sizeFilter"].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", () => {
        window.setTimeout(() => {
          reorderSizeOptions();
          updateActiveFilters();
        }, 0);
      });
    });
  }

  initializeEnhancements().catch(console.error);
})();
