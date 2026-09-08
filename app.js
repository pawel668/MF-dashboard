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
    categoryFilter: document.getElementById("categoryFilter"),
    modelFilter: document.getElementById("modelFilter"),
    colorFilter: document.getElementById("colorFilter"),
    sizeFilter: document.getElementById("sizeFilter"),
    aggregationFilter: document.getElementById("aggregationFilter"),
    backendNotice: document.getElementById("backendNotice"),
    dataStatus: document.getElementById("dataStatus"),
    lastRefresh: document.getElementById("lastRefresh"),
    kpiAdjustedSales: document.getElementById("kpiAdjustedSales"),
    kpiRawSales: document.getElementById("kpiRawSales"),
    kpiCurrentStock: document.getElementById("kpiCurrentStock"),
    kpiCurrentStockMeta: document.getElementById("kpiCurrentStockMeta"),
    kpiGaps: document.getElementById("kpiGaps"),
    topCategoriesBody: document.getElementById("topCategoriesBody"),
    topModelsBody: document.getElementById("topModelsBody"),
    topColorsBody: document.getElementById("topColorsBody"),
    topModelColorsBody: document.getElementById("topModelColorsBody"),
    topSizesBody: document.getElementById("topSizesBody")
  };

  const fmt = new Intl.NumberFormat("pl-PL");
  let client = null;
  let salesChart = null;
  let stockChart = null;
  let products = [];
  let backendV2Available = false;
  let earliestObservedDate = null;
  let latestObservedDate = null;

  function show(view) {
    [els.setupView, els.loginView, els.dashboardView].forEach((el) => el.classList.add("hidden"));
    view.classList.remove("hidden");
  }

  function setStatus(text) { els.dataStatus.textContent = text; }

  function setLoginError(message = "") {
    els.loginError.textContent = message;
    els.loginError.classList.toggle("hidden", !message);
  }

  function setBackendNotice(message = "") {
    els.backendNotice.textContent = message;
    els.backendNotice.classList.toggle("hidden", !message);
  }

  function dateIso(date) { return date.toISOString().slice(0, 10); }

  function addDays(dateString, days) {
    const d = new Date(`${dateString}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return dateIso(d);
  }

  function categoryFromName(fullName) {
    const s = String(fullName || "").toLowerCase();
    if (s.includes("koszulka polo")) return "Polo";
    if (s.includes("koszulka")) return "T-shirt";
    if (s.includes("bluza")) return "Bluza";
    if (s.includes("softshell")) return "Softshell";
    if (s.includes("polar")) return "Polar";
    if (s.includes("kurtka")) return "Kurtka";
    if (s.includes("kamizelka")) return "Kamizelka";
    if (s.includes("koszula")) return "Koszula";
    if (s.includes("spodnie")) return "Spodnie";
    if (s.includes("szort")) return "Szorty";
    if (s.includes("fartuch")) return "Fartuch";
    if (s.includes("czapk")) return "Czapka";
    if (s.includes("torba")) return "Torba";
    if (s.includes("ręcznik")) return "Ręcznik";
    return "Inne";
  }

  function modelNameFromFullName(fullName, model) {
    const value = String(fullName || "").trim();
    if (!value) return model || "Brak";
    const match = value.match(/\s+(koszulka polo|koszulka|bluza|softshell|polar|kurtka|kamizelka|koszula|spodnie|szorty|fartuch|czapka|torba|ręcznik)\s+/i);
    if (!match || match.index === undefined) return model || value;
    return value.slice(0, match.index).trim() || model || "Brak";
  }

  function enrichProduct(product) {
    return {
      ...product,
      category: product.category || categoryFromName(product.full_name),
      model_name: product.model_name || modelNameFromFullName(product.full_name, product.model)
    };
  }

  function v2Params() {
    return {
      p_date_from: els.dateFrom.value,
      p_date_to: els.dateTo.value,
      p_category: els.categoryFilter.value || null,
      p_model: els.modelFilter.value || null,
      p_color: els.colorFilter.value || null,
      p_size: els.sizeFilter.value || null
    };
  }

  function legacyParams() {
    return {
      p_date_from: els.dateFrom.value,
      p_date_to: els.dateTo.value,
      p_model: els.modelFilter.value || null,
      p_color: els.colorFilter.value || null,
      p_sku: null
    };
  }

  async function initialize() {
    if (placeholder(cfg.supabaseUrl) || placeholder(cfg.supabasePublishableKey) || placeholder(cfg.authEmail)) {
      show(els.setupView);
      return;
    }

    client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });

    const { data, error } = await client.auth.getSession();
    if (error) {
      setLoginError("Nie udało się odczytać sesji.");
      show(els.loginView);
      return;
    }

    if (data.session) await openDashboard();
    else show(els.loginView);
  }

  async function login(event) {
    event.preventDefault();
    setLoginError();
    els.loginButton.disabled = true;
    els.loginButton.textContent = "Sprawdzam…";

    try {
      const { error } = await client.auth.signInWithPassword({
        email: cfg.authEmail,
        password: els.accessCode.value
      });
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

  async function logout() {
    await client.auth.signOut();
    show(els.loginView);
  }

  async function openDashboard() {
    show(els.dashboardView);
    setStatus("Ładowanie…");

    try {
      await detectBackendV2();
      await loadProducts();
      await setDateBounds();
      rebuildFilterOptions();
      await refreshDashboard();
    } catch (error) {
      console.error(error);
      setStatus("Błąd danych");
      alert(`Nie udało się załadować dashboardu: ${error.message || error}`);
    }
  }

  async function detectBackendV2() {
    const { error } = await client.rpc("dashboard_v2_products");
    backendV2Available = !error;
    if (!backendV2Available) {
      setBackendNotice("Nowe filtry kategorii i rozmiaru oraz rozszerzone rankingi wymagają jednorazowego uruchomienia pliku sql/dashboard_v2.sql w Supabase. Podstawowy widok nadal działa.");
    } else {
      setBackendNotice();
    }
  }

  async function loadProducts() {
    if (backendV2Available) {
      const { data, error } = await client.rpc("dashboard_v2_products");
      if (!error && Array.isArray(data)) {
        products = data.map(enrichProduct);
        return;
      }
    }

    const pageSize = 1000;
    let from = 0;
    const all = [];

    while (true) {
      const { data, error } = await client
        .from("products")
        .select("id,sku,model,color,size,full_name")
        .order("model", { ascending: true })
        .order("sku", { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) throw error;
      all.push(...data.map(enrichProduct));
      if (data.length < pageSize) break;
      from += pageSize;
    }

    products = all;
  }

  async function setDateBounds() {
    const [{ data: latest, error: latestError }, { data: earliest, error: earliestError }] = await Promise.all([
      client.from("stock_observations").select("observed_date").order("observed_date", { ascending: false }).limit(1),
      client.from("stock_observations").select("observed_date").order("observed_date", { ascending: true }).limit(1)
    ]);

    if (latestError) throw latestError;
    if (earliestError) throw earliestError;
    if (!latest.length) throw new Error("Brak obserwacji magazynowych.");

    latestObservedDate = latest[0].observed_date;
    earliestObservedDate = earliest.length ? earliest[0].observed_date : latestObservedDate;

    if (!els.dateTo.value) els.dateTo.value = latestObservedDate;
    if (!els.dateFrom.value) els.dateFrom.value = addDays(latestObservedDate, -29);
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
    else if (current) select.value = "";
  }

  function productSubset({ ignore = null } = {}) {
    const category = ignore === "category" ? "" : els.categoryFilter.value;
    const model = ignore === "model" ? "" : els.modelFilter.value;
    const color = ignore === "color" ? "" : els.colorFilter.value;
    const size = ignore === "size" ? "" : els.sizeFilter.value;

    return products.filter((p) =>
      (!category || p.category === category) &&
      (!model || p.model === model) &&
      (!color || p.color === color) &&
      (!size || p.size === size)
    );
  }

  function rebuildFilterOptions() {
    const categories = uniqueSorted(products.map((p) => p.category));
    fillSelect(els.categoryFilter, categories);

    const modelSource = products.filter((p) => !els.categoryFilter.value || p.category === els.categoryFilter.value);
    const modelCodes = uniqueSorted(modelSource.map((p) => p.model));
    const modelNames = new Map(modelSource.map((p) => [p.model, p.model_name]));
    fillSelect(els.modelFilter, modelCodes, (model) => {
      const name = modelNames.get(model);
      return name && name !== model ? `${model} · ${name}` : model;
    });

    const colorSource = productSubset({ ignore: "color" });
    fillSelect(els.colorFilter, uniqueSorted(colorSource.map((p) => p.color)));

    const sizeSource = productSubset({ ignore: "size" });
    fillSelect(els.sizeFilter, uniqueSorted(sizeSource.map((p) => p.size)));
  }

  async function rpc(name, params = {}) {
    const { data, error } = await client.rpc(name, params);
    if (error) throw error;
    return data || [];
  }

  function periodKey(dateString, aggregation) {
    const d = new Date(`${dateString}T12:00:00Z`);
    if (aggregation === "month") return dateString.slice(0, 7);
    if (aggregation === "week") {
      const day = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() - day + 1);
      return `Tydz. ${dateIso(d)}`;
    }
    return dateString;
  }

  function aggregateSalesRows(rows, aggregation) {
    if (aggregation === "day") return rows;
    const grouped = new Map();

    rows.forEach((row) => {
      const key = periodKey(row.observed_date, aggregation);
      if (!grouped.has(key)) {
        grouped.set(key, {
          observed_date: key,
          adjusted_sales: 0,
          sold_units: 0,
          restock_units: 0,
          gap_events: 0,
          gap_adjusted_sales: 0,
          restock_events: 0,
          movement_count: 0
        });
      }
      const target = grouped.get(key);
      ["adjusted_sales", "sold_units", "restock_units", "gap_events", "gap_adjusted_sales", "restock_events", "movement_count"].forEach((field) => {
        target[field] += Number(row[field] || 0);
      });
    });

    return [...grouped.values()];
  }

  function aggregateStockRows(rows, aggregation) {
    if (aggregation === "day") return rows;
    const grouped = new Map();

    rows.forEach((row) => {
      const key = periodKey(row.observed_date, aggregation);
      const current = grouped.get(key);
      if (!current || String(row.observed_date) > String(current.source_date)) {
        grouped.set(key, {
          observed_date: key,
          stock_qty: Number(row.stock_qty || 0),
          observed_skus: Number(row.observed_skus || 0),
          source_date: row.observed_date
        });
      }
    });

    return [...grouped.values()];
  }

  async function refreshDashboard() {
    if (!els.dateFrom.value || !els.dateTo.value) return;
    if (els.dateFrom.value > els.dateTo.value) {
      alert("Data 'Od' nie może być późniejsza niż data 'Do'.");
      return;
    }

    if (!backendV2Available && (els.categoryFilter.value || els.sizeFilter.value)) {
      setBackendNotice("Filtr kategorii lub rozmiaru wymaga jednorazowego uruchomienia sql/dashboard_v2.sql w Supabase.");
      return;
    }

    els.applyFilters.disabled = true;
    setStatus("Odświeżanie…");

    try {
      const aggregation = els.aggregationFilter.value;
      let salesDaily;
      let stockDaily;
      let latestStock;
      let topCategories = [];
      let topModels = [];
      let topColors = [];
      let topModelColors = [];
      let topSizes = [];

      if (backendV2Available) {
        const params = v2Params();
        [salesDaily, stockDaily, latestStock, topCategories, topModels, topColors, topModelColors, topSizes] = await Promise.all([
          rpc("dashboard_v2_sales_daily", params),
          rpc("dashboard_v2_stock_daily", params),
          rpc("dashboard_v2_latest_stock", params),
          rpc("dashboard_v2_top_categories", { ...params, p_limit: 15 }),
          rpc("dashboard_v2_top_models", { ...params, p_limit: 15 }),
          rpc("dashboard_v2_top_colors", { ...params, p_limit: 15 }),
          rpc("dashboard_v2_top_model_colors", { ...params, p_limit: 15 }),
          rpc("dashboard_v2_top_sizes", { ...params, p_limit: 20 })
        ]);
      } else {
        const params = legacyParams();
        [salesDaily, stockDaily, latestStock, topModels] = await Promise.all([
          rpc("dashboard_sales_daily", params),
          rpc("dashboard_stock_daily", params),
          rpc("dashboard_latest_stock", params),
          rpc("dashboard_top_models", { ...params, p_limit: 15 })
        ]);
        topModels = topModels.map((row) => ({ ...row, model_name: modelNameForCode(row.model), category: categoryForModel(row.model) }));
      }

      const salesRows = aggregateSalesRows(salesDaily, aggregation);
      const stockRows = aggregateStockRows(stockDaily, aggregation);

      renderKpis(salesDaily, latestStock);
      renderSalesChart(salesRows);
      renderStockChart(stockRows);
      renderRankings({ topCategories, topModels, topColors, topModelColors, topSizes });

      els.lastRefresh.textContent = `Odświeżono: ${new Date().toLocaleString("pl-PL")}`;
      setStatus("Gotowe");
      if (backendV2Available) setBackendNotice();
    } catch (error) {
      console.error(error);
      setStatus("Błąd danych");
      alert(`Błąd odczytu danych: ${error.message || error}`);
    } finally {
      els.applyFilters.disabled = false;
    }
  }

  function modelNameForCode(model) {
    const p = products.find((item) => item.model === model);
    return p ? p.model_name : model || "—";
  }

  function categoryForModel(model) {
    const p = products.find((item) => item.model === model);
    return p ? p.category : "—";
  }

  function renderKpis(salesDaily, latestStockRows) {
    const adjusted = salesDaily.reduce((sum, row) => sum + Number(row.adjusted_sales || 0), 0);
    const raw = salesDaily.reduce((sum, row) => sum + Number(row.sold_units || 0), 0);
    const gaps = salesDaily.reduce((sum, row) => sum + Number(row.gap_events || 0), 0);
    const stock = latestStockRows[0] || {};

    els.kpiAdjustedSales.textContent = fmt.format(adjusted);
    els.kpiRawSales.textContent = fmt.format(raw);
    els.kpiGaps.textContent = fmt.format(gaps);
    els.kpiCurrentStock.textContent = stock.stock_qty === null || stock.stock_qty === undefined
      ? "—"
      : fmt.format(Number(stock.stock_qty));
    els.kpiCurrentStockMeta.textContent = stock.product_count
      ? `${fmt.format(Number(stock.product_count))} SKU · stan znany do ${stock.max_observed_date || "—"}`
      : "Brak danych";
  }

  function chartBaseOptions(showLegend = false) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: showLegend, position: "bottom" },
        tooltip: { enabled: true }
      },
      scales: {
        x: { ticks: { maxTicksLimit: 12 }, grid: { display: false } },
        y: { beginAtZero: true }
      }
    };
  }

  function movingAverage(values, windowSize = 7) {
    return values.map((_, index) => {
      const start = Math.max(0, index - windowSize + 1);
      const window = values.slice(start, index + 1);
      return window.reduce((sum, value) => sum + value, 0) / window.length;
    });
  }

  function linearTrend(values) {
    const n = values.length;
    if (!n) return [];
    if (n === 1) return [values[0]];

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    values.forEach((y, x) => {
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    });

    const denominator = n * sumXX - sumX * sumX;
    if (!denominator) return values.map(() => sumY / n);

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;
    return values.map((_, x) => Math.max(0, intercept + slope * x));
  }

  function renderSalesChart(rows) {
    if (salesChart) salesChart.destroy();

    const values = rows.map((r) => Number(r.adjusted_sales || 0));
    const avg7 = movingAverage(values, Math.min(7, Math.max(1, values.length)));
    const trend = linearTrend(values);
    const gapPoints = rows.map((r) => Number(r.gap_events || 0) > 0 ? Number(r.adjusted_sales || 0) : null);

    const options = chartBaseOptions(true);
    options.plugins.tooltip.callbacks = {
      afterBody(items) {
        if (!items.length) return "";
        const index = items[0].dataIndex;
        const row = rows[index];
        if (!row || !Number(row.gap_events || 0)) return "";
        return `GAP: ${fmt.format(Number(row.gap_events || 0))} zdarzeń`;
      }
    };

    salesChart = new Chart(document.getElementById("salesChart"), {
      type: "bar",
      data: {
        labels: rows.map((r) => r.observed_date),
        datasets: [
          { type: "bar", label: "Sprzedaż skorygowana", data: values, order: 4 },
          { type: "line", label: "Średnia krocząca", data: avg7, borderWidth: 3, pointRadius: 0, tension: 0.25, order: 1 },
          { type: "line", label: "Trend liniowy", data: trend, borderWidth: 2, borderDash: [7, 5], pointRadius: 0, tension: 0, order: 2 },
          { type: "line", label: "GAP", data: gapPoints, showLine: false, pointRadius: 5, pointHoverRadius: 7, pointBackgroundColor: "#c62828", pointBorderColor: "#c62828", order: 0 }
        ]
      },
      options
    });
  }

  function renderStockChart(rows) {
    if (stockChart) stockChart.destroy();
    stockChart = new Chart(document.getElementById("stockChart"), {
      type: "line",
      data: {
        labels: rows.map((r) => r.observed_date),
        datasets: [{
          label: "Stan magazynowy",
          data: rows.map((r) => Number(r.stock_qty || 0)),
          tension: 0.15
        }]
      },
      options: chartBaseOptions(false)
    });
  }

  function emptyRow(tbody, colspan, text = "Brak danych") {
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="muted">${escapeHtml(text)}</td></tr>`;
  }

  function renderRankings({ topCategories, topModels, topColors, topModelColors, topSizes }) {
    if (!backendV2Available) {
      emptyRow(els.topCategoriesBody, 2, "Wymaga dashboard_v2.sql");
      renderTopModels(topModels);
      emptyRow(els.topColorsBody, 2, "Wymaga dashboard_v2.sql");
      emptyRow(els.topModelColorsBody, 4, "Wymaga dashboard_v2.sql");
      emptyRow(els.topSizesBody, 2, "Wymaga dashboard_v2.sql");
      return;
    }

    renderSimpleRanking(els.topCategoriesBody, topCategories, ["category"], 2);
    renderTopModels(topModels);
    renderSimpleRanking(els.topColorsBody, topColors, ["color"], 2);
    renderTopModelColors(topModelColors);
    renderSimpleRanking(els.topSizesBody, topSizes, ["size"], 2);
  }

  function renderSimpleRanking(tbody, rows, fields, colspan) {
    tbody.innerHTML = "";
    if (!rows.length) {
      emptyRow(tbody, colspan);
      return;
    }
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = fields.map((field) => `<td>${escapeHtml(row[field] || "—")}</td>`).join("") +
        `<td class="num">${fmt.format(Number(row.adjusted_sales || 0))}</td>`;
      tbody.appendChild(tr);
    });
  }

  function renderTopModels(rows) {
    els.topModelsBody.innerHTML = "";
    if (!rows.length) {
      emptyRow(els.topModelsBody, 4);
      return;
    }
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = [
        `<td>${escapeHtml(row.model || "—")}</td>`,
        `<td>${escapeHtml(row.model_name || modelNameForCode(row.model) || "—")}</td>`,
        `<td>${escapeHtml(row.category || categoryForModel(row.model) || "—")}</td>`,
        `<td class="num">${fmt.format(Number(row.adjusted_sales || 0))}</td>`
      ].join("");
      els.topModelsBody.appendChild(tr);
    });
  }

  function renderTopModelColors(rows) {
    els.topModelColorsBody.innerHTML = "";
    if (!rows.length) {
      emptyRow(els.topModelColorsBody, 4);
      return;
    }
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = [
        `<td>${escapeHtml(row.model || "—")}</td>`,
        `<td>${escapeHtml(row.model_name || modelNameForCode(row.model) || "—")}</td>`,
        `<td>${escapeHtml(row.color || "—")}</td>`,
        `<td class="num">${fmt.format(Number(row.adjusted_sales || 0))}</td>`
      ].join("");
      els.topModelColorsBody.appendChild(tr);
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function setQuickRange(days) {
    if (!latestObservedDate) return;
    els.dateTo.value = latestObservedDate;
    if (days === "all") els.dateFrom.value = earliestObservedDate;
    else els.dateFrom.value = addDays(latestObservedDate, -(Number(days) - 1));
    await refreshDashboard();
  }

  els.loginForm.addEventListener("submit", login);
  els.logoutButton.addEventListener("click", logout);
  els.applyFilters.addEventListener("click", refreshDashboard);

  els.categoryFilter.addEventListener("change", () => {
    els.modelFilter.value = "";
    els.colorFilter.value = "";
    els.sizeFilter.value = "";
    rebuildFilterOptions();
  });

  els.modelFilter.addEventListener("change", () => {
    els.colorFilter.value = "";
    els.sizeFilter.value = "";
    rebuildFilterOptions();
  });

  els.colorFilter.addEventListener("change", () => {
    els.sizeFilter.value = "";
    rebuildFilterOptions();
  });

  els.sizeFilter.addEventListener("change", rebuildFilterOptions);
  els.aggregationFilter.addEventListener("change", refreshDashboard);

  document.querySelectorAll("[data-days]").forEach((button) => {
    button.addEventListener("click", () => setQuickRange(button.dataset.days));
  });

  initialize().catch((error) => {
    console.error(error);
    show(els.loginView);
    setLoginError("Nie udało się uruchomić aplikacji.");
  });
})();
