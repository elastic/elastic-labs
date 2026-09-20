import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import ElasticsearchAPIConnector from "@elastic/search-ui-elasticsearch-connector";
import axios from "axios";

dotenv.config();
const { ELASTICSEARCH_URL, API_KEY } = process.env;

const app = express();
app.use(express.json());
app.use(cors());

const connector = new ElasticsearchAPIConnector(
  {
    host: ELASTICSEARCH_URL,
    apiKey: API_KEY,
    index: "search-labs-index",
  },
  (requestBody, requestState) => {
    if (!requestState.searchTerm) return requestBody;

    requestBody.query = {
      semantic: {
        query: requestState.searchTerm,
        field: "semantic_text",
      },
    };

    return requestBody;
  }
);

app.post("/api/search", async (req, res) => {
  const { state, queryConfig } = req.body;

  try {
    const response = await connector.onSearch(state, queryConfig);
    res.json(response);
  } catch (error) {
    console.error("Error during search:", error);
    return res.status(500).json({ error: error.message });
  }
});

// Handle all _completion requests
app.post("/api/completion", async (req, res) => {
  try {
    const response = await axios.post(
      `${ELASTICSEARCH_URL}/_inference/completion/summaries-completion`,
      req.body,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `ApiKey ${API_KEY}`,
        },
      }
    );
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start the server
const PORT = process.env.PORT || 1337;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
