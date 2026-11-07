import ElasticsearchAPIConnector from "@elastic/search-ui-elasticsearch-connector";

export const connector = new ElasticsearchAPIConnector({
  host: globalThis.location.origin,
  index: "kibana_sample_data_ecommerce",
  apiKey: import.meta.env.VITE_ELASTICSEARCH_API_KEY,
});

export const config = {
  apiConnector: connector,
  alwaysSearchOnInitialLoad: true,
  searchQuery: {
    search_fields: {
      "products.product_name": { weight: 3 },
      category: {},
      manufacturer: {},
    },
    result_fields: {
      "products.product_name": { raw: {} },
      category: { raw: {} },
      manufacturer: { raw: {} },
      taxful_total_price: { raw: {} },
      customer_gender: { raw: {} },
      day_of_week: { raw: {} },
      "geoip.country_iso_code": { raw: {} },
    },
    facets: {
      gender: { type: "value" },
      day_of_week: { type: "value" },
      "geoip.country_iso_code": { type: "value" },
      "category.keyword": { type: "value" },
      "manufacturer.keyword": { type: "value" },
      taxful_total_price: {
        type: "range",
        ranges: [
          { from: 0, to: 25, name: "Under $25" },
          { from: 25, to: 50, name: "$25 - $50" },
          { from: 50, to: 100, name: "$50 - $100" },
          { from: 100, name: "Over $100" },
        ],
      },
    },
  },
};
