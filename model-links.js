(() => {
  "use strict";

  const MODEL_LINKS = Object.freeze({
    "129": "https://shop.malfini.com/pl/pl/product/basic-129",
    "F29": "https://shop.malfini.com/pl/pl/product/basic-free-f29",
    "124": "https://shop.malfini.com/pl/pl/product/fantasy-124",
    "137": "https://shop.malfini.com/pl/pl/product/heavy-new-137",
    "171": "https://shop.malfini.com/pl/pl/product/origin-gots-171",
    "413": "https://shop.malfini.com/pl/pl/product/cape-413",
    "F13": "https://shop.malfini.com/pl/pl/product/cape-free-f13",
    "420": "https://shop.malfini.com/pl/pl/product/moon-420",
    "407": "https://shop.malfini.com/pl/pl/product/adventure-407",
    "410": "https://shop.malfini.com/pl/pl/product/trendy-zipper-410",
    "522": "https://shop.malfini.com/pl/pl/product/performance-522",
    "531": "https://shop.malfini.com/pl/pl/product/nano-531",
    "501": "https://shop.malfini.com/pl/pl/product/jacket-501",
    "527": "https://shop.malfini.com/pl/pl/product/frosty-527",
    "506": "https://shop.malfini.com/pl/pl/product/jacket-hi-q-506",
    "530": "https://shop.malfini.com/pl/pl/product/effect-530",
    "5V1": "https://shop.malfini.com/pl/pl/product/hv-fleece-jacket-5v1",
    "417": "https://shop.malfini.com/pl/pl/product/direct-417",
    "W42": "https://shop.malfini.com/pl/pl/product/vertex-w42",
    "P41": "https://shop.malfini.com/pl/pl/product/zero-p41",
    "406": "https://shop.malfini.com/pl/pl/product/essential-406",
    "210": "https://shop.malfini.com/pl/pl/product/pique-polo-210",
    "203": "https://shop.malfini.com/pl/pl/product/pique-polo-203",
    "202": "https://shop.malfini.com/pl/pl/product/single-j-202",
    "215": "https://shop.malfini.com/pl/pl/product/cotton-heavy-215",
    "213": "https://shop.malfini.com/pl/pl/product/cotton-213",
    "212": "https://shop.malfini.com/pl/pl/product/cotton-212"
  });

  window.MF_MODEL_LINKS = MODEL_LINKS;

  // app.js prosi dziś o TOP 15. Przechwytujemy wyłącznie ranking modeli
  // i pobieramy pełną listę, aby UI mogło ją rozwinąć bez kolejnego zapytania.
  if (!window.supabase || typeof window.supabase.createClient !== "function") return;

  const previousCreateClient = window.supabase.createClient.bind(window.supabase);

  window.supabase.createClient = function createClientWithFullModelRanking(...args) {
    const client = previousCreateClient(...args);
    const previousRpc = client.rpc.bind(client);

    client.rpc = function rpcWithFullModelRanking(name, params = {}) {
      if (name === "dashboard_v2_top_models" || name === "dashboard_top_models") {
        return previousRpc(name, { ...params, p_limit: 500 });
      }
      return previousRpc(name, params);
    };

    return client;
  };
})();
