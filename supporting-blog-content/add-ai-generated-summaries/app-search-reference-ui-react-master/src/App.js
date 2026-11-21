import React from "react";
import { ApiProxyConnector } from "@elastic/search-ui-elasticsearch-connector/api-proxy";
import {
  ErrorBoundary,
  SearchProvider,
  SearchBox,
  Results,
  Facet,
} from "@elastic/react-search-ui";
import { Layout } from "@elastic/react-search-ui-views";
import "@elastic/react-search-ui-views/lib/styles/styles.css";
import AiSummary from "./AiSummary";

const connector = new ApiProxyConnector({
  basePath: "http://localhost:1337/api",
});

const config = {
  debug: true,
  searchQuery: {
    search_fields: {
      semantic_text: {},
    },
    result_fields: {
      title: {
        snippet: {},
      },
      article_content: {
        snippet: {
          size: 10,
        },
      },
      meta_description: {},
      url: {},
      meta_author: {},
      meta_img: {},
    },
    facets: {
      "meta_author.enum": { type: "value" },
    },
  },
  apiConnector: connector,
  alwaysSearchOnInitialLoad: false,
};

export default function App() {
  return (
    <SearchProvider config={config}>
      <div className="App">
        <ErrorBoundary>
          <Layout
            header={<SearchBox />}
            bodyHeader={<AiSummary />}
            bodyContent={
              <Results
                titleField="title"
                thumbnailField="meta_img"
                urlField="url"
              />
            }
            sideContent={
              <Facet key={"1"} field={"meta_author.enum"} label={"author"} />
            }
          />
        </ErrorBoundary>
      </div>
    </SearchProvider>
  );
}
