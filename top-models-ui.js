(() => {
  "use strict";

  const DEFAULT_LIMIT = 15;
  let expanded = false;

  function getBody() {
    return document.getElementById("topModelsBody");
  }

  function getCard() {
    return getBody()?.closest("article.card") || null;
  }

  function ensureControls() {
    const card = getCard();
    if (!card) return null;

    let controls = card.querySelector(".top-models-controls");
    if (controls) return controls;

    controls = document.createElement("div");
    controls.className = "top-models-controls hidden";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary top-models-toggle";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      expanded = !expanded;
      refresh();
    });

    controls.appendChild(button);
    card.appendChild(controls);
    return controls;
  }

  function decorateLink(row) {
    if (!row || row.cells.length < 2) return;

    const model = row.cells[0].textContent.trim();
    const nameCell = row.cells[1];
    const url = window.MF_MODEL_LINKS?.[model];
    if (!url) return;

    const currentLink = nameCell.querySelector("a.model-external-link");
    if (currentLink) return;

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

  function refresh() {
    const body = getBody();
    const controls = ensureControls();
    if (!body || !controls) return;

    const rows = [...body.querySelectorAll("tr")].filter((row) =>
      row.cells.length >= 4 &&
      !row.textContent.includes("Brak danych") &&
      !row.textContent.includes("Wymaga")
    );

    rows.forEach((row, index) => {
      decorateLink(row);
      row.classList.toggle("top-model-hidden", !expanded && index >= DEFAULT_LIMIT);
    });

    const button = controls.querySelector(".top-models-toggle");
    if (rows.length > DEFAULT_LIMIT) {
      controls.classList.remove("hidden");
      button.textContent = expanded
        ? "Pokaż tylko TOP 15 ↑"
        : `Pokaż wszystkie modele (${rows.length}) ↓`;
    } else {
      controls.classList.add("hidden");
      expanded = false;
    }

    const wrap = body.closest(".table-wrap");
    if (wrap) wrap.classList.toggle("top-models-expanded", expanded);
  }

  function initialize() {
    const body = getBody();
    if (!body) {
      window.setTimeout(initialize, 100);
      return;
    }

    ensureControls();
    const observer = new MutationObserver(() => window.requestAnimationFrame(refresh));
    observer.observe(body, { childList: true, subtree: true });
    refresh();
  }

  initialize();
})();
