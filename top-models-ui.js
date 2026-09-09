(() => {
  "use strict";

  const DEFAULT_LIMIT = 15;
  const states = new Map();
  const sizeOrder = ["XXS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL", "7XL", "8XL"];
  const configs = [
    { id: "topCategoriesBody", label: "kategorie" },
    { id: "topModelsBody", label: "modele", decorate: decorateModelLink },
    { id: "topColorsBody", label: "kolory" },
    { id: "topModelColorsBody", label: "pozycje" },
    { id: "topSizesBody", label: "rozmiary", transform: transformSizes }
  ];

  function validRows(body) {
    return [...body.querySelectorAll("tr")].filter((row) =>
      row.cells.length &&
      !row.textContent.includes("Brak danych") &&
      !row.textContent.includes("Wymaga")
    );
  }

  function sizeRank(value) {
    const normalized = String(value || "").trim().toUpperCase();
    const exact = sizeOrder.indexOf(normalized);
    if (exact >= 0) return exact;
    const numericXl = normalized.match(/^(\d+)(?:XL|X)$/);
    if (numericXl) return 100 + Number(numericXl[1]);
    const numeric = normalized.match(/^\d+(?:[.,]\d+)?$/);
    if (numeric) return 200 + Number(normalized.replace(",", "."));
    return 1000;
  }

  function numericCell(cell) {
    if (!cell) return 0;
    const raw = cell.dataset.rawSales || cell.textContent;
    const cleaned = String(raw).replace(/[^0-9,.-]/g, "").replace(/\s/g, "").replace(",", ".");
    return Number(cleaned) || 0;
  }

  function transformSizes(body) {
    const rows = validRows(body);
    if (!rows.length) return;

    rows.forEach((row) => {
      const valueCell = row.cells[row.cells.length - 1];
      if (!valueCell.dataset.rawSales) valueCell.dataset.rawSales = String(numericCell(valueCell));
    });

    const total = rows.reduce((sum, row) => sum + Number(row.cells[row.cells.length - 1].dataset.rawSales || 0), 0);
    rows.sort((a, b) => {
      const rank = sizeRank(a.cells[0].textContent) - sizeRank(b.cells[0].textContent);
      return rank || a.cells[0].textContent.localeCompare(b.cells[0].textContent, "pl", { numeric: true });
    });
    rows.forEach((row) => body.appendChild(row));

    rows.forEach((row) => {
      const valueCell = row.cells[row.cells.length - 1];
      const sales = Number(valueCell.dataset.rawSales || 0);
      const share = total > 0 ? (sales / total) * 100 : 0;
      valueCell.textContent = `${share.toLocaleString("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
      valueCell.title = `${sales.toLocaleString("pl-PL")} szt.`;
    });

    const table = body.closest("table");
    const lastHeader = table?.querySelector("thead th:last-child");
    if (lastHeader) lastHeader.textContent = "Udział";
  }

  function decorateModelLink(row) {
    if (!row || row.cells.length < 2) return;
    const model = row.cells[0].textContent.trim();
    const nameCell = row.cells[1];
    const url = window.MF_MODEL_LINKS?.[model];
    if (!url || nameCell.querySelector("a.model-external-link")) return;

    const label = nameCell.textContent.trim() || model;
    nameCell.textContent = "";
    const link = document.createElement("a");
    link.className = "model-external-link";
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.referrerPolicy = "no-referrer";
    link.textContent = `${label} ↗`;
    link.title = "Otwórz stronę modelu u producenta";
    link.addEventListener("click", (event) => event.stopPropagation());
    nameCell.appendChild(link);
  }

  function ensureControls(config, body) {
    const card = body.closest("article.card");
    if (!card) return null;
    const className = `ranking-controls-${config.id}`;
    let controls = card.querySelector(`.${className}`);
    if (controls) return controls;

    controls = document.createElement("div");
    controls.className = `ranking-controls ${className} hidden`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary ranking-toggle";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      states.set(config.id, !states.get(config.id));
      refresh(config);
    });
    controls.appendChild(button);
    card.appendChild(controls);
    return controls;
  }

  function refresh(config) {
    const body = document.getElementById(config.id);
    if (!body) return;
    const controls = ensureControls(config, body);
    if (!controls) return;

    if (config.transform) config.transform(body);
    const rows = validRows(body);
    if (config.decorate) rows.forEach(config.decorate);

    const expanded = Boolean(states.get(config.id));
    rows.forEach((row, index) => row.classList.toggle("ranking-hidden", !expanded && index >= DEFAULT_LIMIT));

    const button = controls.querySelector(".ranking-toggle");
    if (rows.length > DEFAULT_LIMIT) {
      controls.classList.remove("hidden");
      button.textContent = expanded
        ? "Pokaż tylko TOP 15 ↑"
        : `Pokaż wszystkie ${config.label} (${rows.length}) ↓`;
    } else {
      controls.classList.add("hidden");
      states.set(config.id, false);
    }

    body.closest(".table-wrap")?.classList.toggle("ranking-expanded", expanded);
  }

  function initializeConfig(config) {
    const body = document.getElementById(config.id);
    if (!body) return false;
    states.set(config.id, false);
    ensureControls(config, body);
    let refreshing = false;
    const observer = new MutationObserver(() => {
      if (refreshing) return;
      refreshing = true;
      window.requestAnimationFrame(() => {
        refresh(config);
        refreshing = false;
      });
    });
    observer.observe(body, { childList: true, subtree: true });
    refresh(config);
    return true;
  }

  function initialize() {
    const ready = configs.every((config) => document.getElementById(config.id));
    if (!ready) {
      window.setTimeout(initialize, 100);
      return;
    }
    configs.forEach(initializeConfig);
  }

  initialize();
})();
