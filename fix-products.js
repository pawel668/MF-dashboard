(() => {
  "use strict";

  if (!window.supabase || typeof window.supabase.createClient !== "function") return;

  const originalCreateClient = window.supabase.createClient.bind(window.supabase);

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

  window.supabase.createClient = function patchedCreateClient(...args) {
    const client = originalCreateClient(...args);
    const originalRpc = client.rpc.bind(client);
    let fullProductsPromise = null;

    async function loadAllProductDimensions() {
      const pageSize = 500;
      let from = 0;
      const all = [];

      while (true) {
        const { data, error } = await client
          .from("products")
          .select("sku,model,color,size,full_name")
          .order("model", { ascending: true })
          .order("sku", { ascending: true })
          .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        all.push(...data);
        from += data.length;
      }

      const distinct = new Map();
      all.forEach((product) => {
        const row = {
          model: product.model,
          model_name: modelNameFromFullName(product.full_name, product.model),
          category: categoryFromName(product.full_name),
          color: product.color,
          size: product.size
        };
        const key = JSON.stringify([row.model, row.model_name, row.category, row.color, row.size]);
        distinct.set(key, row);
      });

      const rows = [...distinct.values()];
      window.__MF_FILTER_SKU_COUNT = all.length;
      window.__MF_FILTER_DIMENSION_COUNT = rows.length;
      console.info(`MF Dashboard: pełne filtry z ${all.length} SKU / ${rows.length} kombinacji.`);
      return rows;
    }

    client.rpc = async function patchedRpc(name, params = {}) {
      if (name !== "dashboard_v2_products") {
        return originalRpc(name, params);
      }

      // Najpierw sprawdzamy, czy backend v2 rzeczywiście istnieje.
      const probe = await originalRpc(name, params);
      if (probe.error) return probe;

      try {
        if (!fullProductsPromise) fullProductsPromise = loadAllProductDimensions();
        const data = await fullProductsPromise;
        return { data, error: null };
      } catch (error) {
        console.error("MF Dashboard: nie udało się załadować pełnej listy produktów do filtrów.", error);
        return { data: null, error };
      }
    };

    return client;
  };
})();
