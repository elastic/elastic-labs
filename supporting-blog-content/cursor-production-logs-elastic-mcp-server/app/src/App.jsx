import { useState } from "react";
import {
  SearchProvider,
  SearchBox,
  Results,
  Facet,
  PagingInfo,
  ResultsPerPage,
  Paging,
} from "@elastic/react-search-ui";
import { Layout } from "@elastic/react-search-ui-views";
import "@elastic/react-search-ui-views/lib/styles/styles.css";
import { config } from "./searchConfig";

function ProductResult({ result }) {
  const name = result["products.product_name"]?.raw;
  const category = result.category?.raw;
  const brand = result["manufacturer.keyword"]?.raw || result.manufacturer?.raw;
  const price = result.taxful_total_price?.raw;

  return (
    <div
      style={{
        padding: "16px",
        borderBottom: "1px solid #e5e7eb",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "16px",
      }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: "15px", marginBottom: "4px" }}>
          {Array.isArray(name) ? name[0] : name}
        </div>
        <div style={{ fontSize: "13px", color: "#6b7280" }}>
          {Array.isArray(category) ? category.join(", ") : category}
          {brand && ` · ${Array.isArray(brand) ? brand[0] : brand}`}
        </div>
      </div>
      {price && (
        <div
          style={{ fontWeight: 600, fontSize: "15px", whiteSpace: "nowrap" }}>
          ${Number(price).toFixed(2)}
        </div>
      )}
    </div>
  );
}

function SearchFilters() {
  const [showMore, setShowMore] = useState(false);
  return (
    <div>
      <Facet field='category.keyword' label='Category' />
      <Facet field='manufacturer.keyword' label='Brand' />
      <Facet field='taxful_total_price' label='Price Range' />
      <button
        onClick={() => setShowMore((v) => !v)}
        style={{ fontSize: "13px", color: "#6b7280", background: "none", border: "none", cursor: "pointer", padding: "8px 0" }}>
        {showMore ? "▲ Less filters" : "▼ More filters"}
      </button>
      {showMore && (
        <>
          <Facet field='customer_gender' label='Customer Gender' />
          <Facet field='day_of_week' label='Day of Week' />
          <Facet field='geoip.country_iso_code' label='Region' />
        </>
      )}
    </div>
  );
}

export default function App() {
  return (
    <SearchProvider config={config}>
      <Layout
        header={<SearchBox />}
        sideContent={<SearchFilters />}
        bodyContent={
          <Results resultView={ProductResult} shouldTrackClickThrough={false} />
        }
        bodyHeader={
          <>
            <PagingInfo />
            <ResultsPerPage />
          </>
        }
        bodyFooter={<Paging />}
      />
    </SearchProvider>
  );
}
