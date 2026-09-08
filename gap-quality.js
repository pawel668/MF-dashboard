(() => {
  "use strict";

  const cfg = window.MF_CONFIG || {};
  const fmt = new Intl.NumberFormat("pl-PL");
  const pct = new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  let client = null;
  let timer = null;

  function paramsFromUi() {
    return {
      p_date_from: document.getElementById("dateFrom")?.value || null,
      p_date_to: document.getElementById("dateTo")?.value || null,
      p_category: document.getElementById("categoryFilter")?.value || null,
      p_model: document.getElementById("modelFilter")?.value || null,
      p_color: document.getElementById("colorFilter")?.value || null,
      p_size: document.getElementById("sizeFilter")?.value || null
    };
  }

  function setLoading() {
    const value = document.getElementById("kpiGaps");
    const meta = document.getElementById("kpiGapsMeta");
    if (value) value.textContent = "…";
    if (meta) meta.textContent = "liczę udział danych z GAP";
  }

  function render(rows) {
    const adjustedSales = rows.reduce((sum, row) => sum + Number(row.adjusted_sales || 0), 0);
    const gapAdjustedSales = rows.reduce((sum, row) => sum + Number(row.gap_adjusted_sales || 0), 0);
    const gapEvents = rows.reduce((sum, row) => sum + Number(row.gap_events || 0), 0);
    const movementCount = rows.reduce((sum, row) => sum + Number(row.movement_count || 0), 0);

    const salesShare = adjustedSales > 0 ? (gapAdjustedSales / adjustedSales) * 100 : 0;
    const movementShare = movementCount > 0 ? (gapEvents / movementCount) * 100 : 0;

    const value = document.getElementById("kpiGaps");
    const meta = document.getElementById("kpiGapsMeta");
    if (!value || !meta) return;

    value.textContent = `${pct.format(salesShare)}%`;
    meta.textContent = `${fmt.format(gapAdjustedSales)} szt. sprzedaży z GAP · ${pct.format(movementShare)}% ruchów · ${fmt.format(gapEvents)} zdarzeń`;
    value.title = "Udział sprzedaży skorygowanej przypisanej do interwałów oznaczonych jako GAP w całej sprzedaży skorygowanej dla bieżących filtrów.";
    meta.title = "Druga wartość pokazuje udział rekordów ruchu oznaczonych GAP w liczbie wszystkich rekordów ruchu dla bieżących filtrów.";
  }

  async function refresh() {
    if (!client) return;
    const params = paramsFromUi();
    if (!params.p_date_from || !params.p_date_to) return;

    setLoading();
    const { data, error } = await client.rpc("dashboard_v2_sales_daily", params);
    if (error) {
      console.error("GAP KPI:", error);
      const value = document.getElementById("kpiGaps");
      const meta = document.getElementById("kpiGapsMeta");
      if (value) value.textContent = "—";
      if (meta) meta.textContent = "nie udało się policzyć udziału GAP";
      return;
    }
    render(data || []);
  }

  function scheduleRefresh(delay = 120) {
    window.clearTimeout(timer);
    timer = window.setTimeout(refresh, delay);
  }

  function initialize() {
    if (!window.supabase || !cfg.supabaseUrl || !cfg.supabasePublishableKey) return;
    client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });

    const status = document.getElementById("dataStatus");
    if (status) {
      const observer = new MutationObserver(() => {
        if (status.textContent.trim() === "Gotowe") scheduleRefresh();
      });
      observer.observe(status, { childList: true, characterData: true, subtree: true });
    }

    document.getElementById("applyFilters")?.addEventListener("click", () => scheduleRefresh(350));
    document.querySelectorAll("[data-days]").forEach((button) => button.addEventListener("click", () => scheduleRefresh(350)));

    ["categoryFilter", "modelFilter", "colorFilter", "sizeFilter"].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", () => scheduleRefresh(350));
    });

    scheduleRefresh(700);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
  else initialize();
})();
