(() => {
  "use strict";

  const cfg = window.MF_CONFIG || {};
  const placeholder = (value) => !value || String(value).startsWith("__");

  const els = {
    setupView: document.getElementById("setupView"),
    loginView: document.getElementById("loginView"),
    dashboardView: document.getElementById("dashboardView"),
    loginForm: document.getElementById("loginForm"),
    accessCode: document.getElementById("accessCode"),
    loginButton: document.getElementById("loginButton"),
    loginError: document.getElementById("loginError"),
    logoutButton: document.getElementById("logoutButton"),
    applyFilters: document.getElementById("applyFilters"),
    dateFrom: document.getElementById("dateFrom"),
    dateTo: document.getElementById("dateTo"),
    modelFilter: document.getElementById("modelFilter"),
    colorFilter: document.getElementById("colorFilter"),
    skuFilter: document.getElementById("skuFilter"),
    dataStatus: document.getElementById("dataStatus"),
    lastRefresh: document.getElementById("lastRefresh"),
    kpiAdjustedSales: document.getElementById("kpiAdjustedSales"),
    kpiRawSales: document.getElementById("kpiRawSales"),
    kpiCurrentStock: document.getElementById("kpiCurrentStock"),
    kpiCurrentStockMeta: document.getElementById("kpiCurrentStockMeta"),
    kpiGaps: document.getElementById("kpiGaps"),
    topModelsBody: document.getElementById("topModelsBody"),
    topSkusBody: document.getElementById("topSkusBody")
  };

  const fmt = new Intl.NumberFormat("pl-PL");
  let client = null;
  let salesChart = null;
  let stockChart = null;
  let products = [];

  function show(view) {
    [els.setupView, els.loginView, els.dashboardView].forEach((el) => el.classList.add("hidden"));
    view.classList.remove("hidden");
  }

  function setStatus(text) { els.dataStatus.textContent = text; }
  function setLoginError(message = "") {
    els.loginError.textContent = message;
    els.loginError.classList.toggle("hidden", !message);
  }
  function dateIso(date) { return date.toISOString().slice(0, 10); }
  function addDays(dateString, days) {
    const d = new Date(`${dateString}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return dateIso(d);
  }
  function currentFilters() {
    return {
      p_date_from: els.dateFrom.value,
      p_date_to: els.dateTo.value,
      p_model: els.modelFilter.value || null,
      p_color: els.colorFilter.value || null,
      p_sku: els.skuFilter.value || null
    };
  }

  async function initialize() {
    if (placeholder(cfg.supabaseUrl) || placeholder(cfg.supabasePublishableKey) || placeholder(cfg.authEmail)) {
      show(els.setupView); return;
    }
    client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
    const { data, error } = await client.auth.getSession();
    if (error) { setLoginError("Nie udało się odczytać sesji."); show(els.loginView); return; }
    if (data.session) await openDashboard(); else show(els.loginView);
  }

  async function login(event) {
    event.preventDefault();
    setLoginError();
    els.loginButton.disabled = true;
    els.loginButton.textContent = "Sprawdzam…";
    try {
      const { error } = await client.auth.signInWithPassword({ email: cfg.authEmail, password: els.accessCode.value });
      if (error) throw error;
      els.accessCode.value = "";
      await openDashboard();
    } catch (error) {
      console.error(error);
      setLoginError("Nieprawidłowy kod dostępu.");
    } finally {
      els.loginButton.disabled = false;
      els.loginButton.textContent = "Wejdź";
    }
  }

  async function logout() { await client.auth.signOut(); show(els.loginView); }

  async function openDashboard() {
    show(els.dashboardView);
    setStatus("Ładowanie…");
    try {
      await loadProducts();
      await setDefaultDates();
      rebuildFilterOptions();
      await refreshDashboard();
    } catch (error) {
      console.error(error);
      setStatus("Błąd danych");
      alert(`Nie udało się załadować dashboardu: ${error.message || error}`);
    }
  }

  async function loadProducts() {
    const pageSize = 1000;
    let from = 0;
    const all = [];
    while (true) {
      const { data, error } = await client.from("products")
        .select("id,sku,model,color,size,full_name")
        .order("model", { ascending: true }).order("sku", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      all.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    products = all;
  }

  async function setDefaultDates() {
    if (els.dateTo.value) return;
    const { data, error } = await client.from("stock_observations")
      .select("observed_date").order("observed_date", { ascending: false }).limit(1);
    if (error) throw error;
    if (!data.length) throw new Error("Brak obserwacji magazynowych.");
    const latest = data[0].observed_date;
    els.dateTo.value = latest;
    els.dateFrom.value = addDays(latest, -29);
  }

  function uniqueSorted(values) {
    return [...new Set(values.filter((v) => v !== null && v !== undefined && String(v).trim() !== ""))]
      .sort((a, b) => String(a).localeCompare(String(b), "pl", { numeric: true }));
  }

  function fillSelect(select, values, labelFn = (v) => v) {
    const current = select.value;
    select.innerHTML = '<option value="">Wszystkie</option>';
    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = labelFn(value);
      select.appendChild(option);
    });
    if (values.includes(current)) select.value = current;
  }

  function rebuildFilterOptions() {
    const model = els.modelFilter.value;
    const color = els.colorFilter.value;
    fillSelect(els.modelFilter, uniqueSorted(products.map((p) => p.model)));
    const colorSource = products.filter((p) => !model || p.model === model);
    fillSelect(els.colorFilter, uniqueSorted(colorSource.map((p) => p.color)));
    const skuSource = products.filter((p) => (!els.modelFilter.value || p.model === els.modelFilter.value) && (!color || p.color === color));
    const skuMap = new Map(skuSource.map((p) => [p.sku, p]));
    fillSelect(els.skuFilter, uniqueSorted([...skuMap.keys()]), (sku) => {
      const p = skuMap.get(sku);
      return p ? `${sku} · ${p.size || "—"}` : sku;
    });
  }

  async function rpc(name, params) {
    const { data, error } = await client.rpc(name, params);
    if (error) throw error;
    return data || [];
  }

  async function refreshDashboard() {
    if (!els.dateFrom.value || !els.dateTo.value) return;
    if (els.dateFrom.value > els.dateTo.value) { alert("Data 'Od' nie może być późniejsza niż data 'Do'."); return; }
    els.applyFilters.disabled = true;
    setStatus("Odświeżanie…");
    const params = currentFilters();
    try {
      const [salesDaily, stockDaily, latestStock, topModels, topSkus] = await Promise.all([
        rpc("dashboard_sales_daily", params),
        rpc("dashboard_stock_daily", params),
        rpc("dashboard_latest_stock", params),
        rpc("dashboard_top_models", { ...params, p_limit: 15 }),
        rpc("dashboard_top_skus", { ...params, p_limit: 15 })
      ]);
      renderKpis(salesDaily, latestStock);
      renderSalesChart(salesDaily);
      renderStockChart(stockDaily);
      renderTopModels(topModels);
      renderTopSkus(topSkus);
      els.lastRefresh.textContent = `Odświeżono: ${new Date().toLocaleString("pl-PL")}`;
      setStatus("Gotowe");
    } catch (error) {
      console.error(error);
      setStatus("Błąd danych");
      alert(`Błąd odczytu danych: ${error.message || error}`);
    } finally { els.applyFilters.disabled = false; }
  }

  function renderKpis(salesDaily, latestStockRows) {
    const adjusted = salesDaily.reduce((sum, row) => sum + Number(row.adjusted_sales || 0), 0);
    const raw = salesDaily.reduce((sum, row) => sum + Number(row.sold_units || 0), 0);
    const gaps = salesDaily.reduce((sum, row) => sum + Number(row.gap_events || 0), 0);
    const stock = latestStockRows[0] || {};
    els.kpiAdjustedSales.textContent = fmt.format(adjusted);
    els.kpiRawSales.textContent = fmt.format(raw);
    els.kpiGaps.textContent = fmt.format(gaps);
    els.kpiCurrentStock.textContent = stock.stock_qty === null || stock.stock_qty === undefined ? "—" : fmt.format(Number(stock.stock_qty));
    els.kpiCurrentStockMeta.textContent = stock.product_count ? `${fmt.format(Number(stock.product_count))} SKU · stan znany do ${stock.max_observed_date || "—"}` : "Brak danych";
  }

  function chartBaseOptions() {
    return { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { display: false } }, scales: { x: { ticks: { maxTicksLimit: 10 }, grid: { display: false } }, y: { beginAtZero: true } } };
  }

  function renderSalesChart(rows) {
    if (salesChart) salesChart.destroy();
    salesChart = new Chart(document.getElementById("salesChart"), { type: "bar", data: { labels: rows.map((r) => r.observed_date), datasets: [{ label: "Sprzedaż skorygowana", data: rows.map((r) => Number(r.adjusted_sales || 0)) }] }, options: chartBaseOptions() });
  }

  function renderStockChart(rows) {
    if (stockChart) stockChart.destroy();
    stockChart = new Chart(document.getElementById("stockChart"), { type: "line", data: { labels: rows.map((r) => r.observed_date), datasets: [{ label: "Stan magazynowy", data: rows.map((r) => Number(r.stock_qty || 0)), tension: 0.15 }] }, options: chartBaseOptions() });
  }

  function renderTopModels(rows) {
    els.topModelsBody.innerHTML = "";
    rows.forEach((row) => { const tr = document.createElement("tr"); tr.innerHTML = `<td>${escapeHtml(row.model || "—")}</td><td class="num">${fmt.format(Number(row.adjusted_sales || 0))}</td>`; els.topModelsBody.appendChild(tr); });
  }

  function renderTopSkus(rows) {
    els.topSkusBody.innerHTML = "";
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = [`<td>${escapeHtml(row.sku || "—")}</td>`,`<td>${escapeHtml(row.model || "—")}</td>`,`<td>${escapeHtml(row.color || "—")}</td>`,`<td>${escapeHtml(row.size || "—")}</td>`,`<td class="num">${fmt.format(Number(row.adjusted_sales || 0))}</td>`].join("");
      els.topSkusBody.appendChild(tr);
    });
  }

  function escapeHtml(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  els.loginForm.addEventListener("submit", login);
  els.logoutButton.addEventListener("click", logout);
  els.applyFilters.addEventListener("click", refreshDashboard);
  els.modelFilter.addEventListener("change", () => { els.colorFilter.value = ""; els.skuFilter.value = ""; rebuildFilterOptions(); });
  els.colorFilter.addEventListener("change", () => { els.skuFilter.value = ""; rebuildFilterOptions(); });

  initialize().catch((error) => { console.error(error); show(els.loginView); setLoginError("Nie udało się uruchomić aplikacji."); });
})();
