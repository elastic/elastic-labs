import { z } from "zod";
import { Client } from "@elastic/elasticsearch";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import OpenAI from "openai";

const ELASTICSEARCH_ENDPOINT =
  process.env.ELASTICSEARCH_ENDPOINT ?? "http://localhost:9200";
const ELASTICSEARCH_API_KEY = process.env.ELASTICSEARCH_API_KEY ?? "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const INDEX = "documents";

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

const _client = new Client({
  node: ELASTICSEARCH_ENDPOINT,
  auth: {
    apiKey: ELASTICSEARCH_API_KEY,
  },
});

const DocumentSchema = z.object({
  id: z.number(),
  title: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
});

const SearchResultSchema = z.object({
  id: z.number(),
  title: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
  score: z.number(),
});

type Document = z.infer<typeof DocumentSchema>;
type SearchResult = z.infer<typeof SearchResultSchema>;

const server = new McpServer({
  name: "Elasticsearch RAG MCP",
  description:
    "A RAG server using Elasticsearch. Provides tools for document search, result summarization, and source citation.",
  version: "1.0.0",
});

server.registerTool(
  "search_docs",
  {
    title: "Search Documents",
    description:
      "Search for documents in Elasticsearch using full-text search. Returns the most relevant documents with their content, title, tags, and relevance score.",
    inputSchema: {
      query: z
        .string()
        .describe("The search query terms to find relevant documents"),
      max_results: z
        .number()
        .optional()
        .default(5)
        .describe("Maximum number of results to return"),
    },
    outputSchema: {
      results: z.array(SearchResultSchema),
      total: z.number(),
    },
  },
  async ({ query, max_results }) => {
    if (!query) {
      return {
        content: [
          {
            type: "text",
            text: "Query parameter is required",
          },
        ],
        isError: true,
      };
    }

    try {
      const response = await _client.search({
        index: INDEX,
        size: max_results,
        query: {
          bool: {
            must: [
              {
                multi_match: {
                  query: query,
                  fields: ["title^2", "content", "tags"],
                  fuzziness: "AUTO",
                },
              },
            ],
            should: [
              {
                match_phrase: {
                  title: {
                    query: query,
                    boost: 2,
                  },
                },
              },
            ],
          },
        },
        highlight: {
          fields: {
            title: {},
            content: {},
          },
        },
      });

      const results: SearchResult[] = response.hits.hits.map((hit: any) => {
        const source = hit._source as Document;

        return {
          id: source.id,
          title: source.title,
          content: source.content,
          tags: source.tags,
          score: hit._score ?? 0,
        };
      });

      const contentText = results
        .map(
          (r, i) =>
            `[${i + 1}] ${r.title} (score: ${r.score.toFixed(
              2,
            )})\n${r.content.substring(0, 200)}...`,
        )
        .join("\n\n");

      const totalHits =
        typeof response.hits.total === "number"
          ? response.hits.total
          : (response.hits.total?.value ?? 0);

      return {
        content: [
          {
            type: "text",
            text: `Found ${results.length} relevant documents:\n\n${contentText}`,
          },
        ],
        structuredContent: {
          results: results,
          total: totalHits,
        },
      };
    } catch (error: any) {
      console.error("Error during search:", error);

      return {
        content: [
          {
            type: "text",
            text: `Error searching documents: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  },
);

server.registerTool(
  "summarize_and_cite",
  {
    title: "Summarize and Cite",
    description:
      "Summarize the provided search results to answer a question and return citation metadata for the sources used.",
    inputSchema: {
      results: z
        .array(SearchResultSchema)
        .describe("Array of search results from search_docs"),
      question: z.string().describe("The question to answer"),
      max_length: z
        .number()
        .optional()
        .default(500)
        .describe("Maximum length of the summary in characters"),
      max_docs: z
        .number()
        .optional()
        .default(5)
        .describe("Maximum number of documents to include in the context"),
    },
    outputSchema: {
      summary: z.string(),
      sources_used: z.number(),
      citations: z.array(
        z.object({
          id: z.number(),
          title: z.string(),
          tags: z.array(z.string()),
          relevance_score: z.number(),
        }),
      ),
    },
  },
  async ({ results, question, max_length, max_docs }) => {
    if (!results || results.length === 0 || !question) {
      return {
        content: [
          {
            type: "text",
            text: "Both results and question parameters are required, and results must not be empty",
          },
        ],
        isError: true,
      };
    }

    try {
      const used = results.slice(0, max_docs);

      const context = used
        .map(
          (r: SearchResult, i: number) =>
            `[Document ${i + 1}: ${r.title}]\\n${r.content}`,
        )
        .join("\n\n---\n\n");

      // Generate summary with OpenAI
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant that answers questions based on provided documents. Synthesize information from the documents to answer the user's question accurately and concisely. If the documents don't contain relevant information, say so.",
          },
          {
            role: "user",
            content: `Question: ${question}\\n\\nRelevant Documents:\\n${context}`,
          },
        ],
        max_tokens: Math.min(Math.ceil(max_length / 4), 1000),
        temperature: 0.3,
      });

      const summaryText =
        completion.choices[0]?.message?.content ?? "No summary generated.";

      const citations = used.map((r: SearchResult) => ({
        id: r.id,
        title: r.title,
        tags: r.tags,
        relevance_score: r.score,
      }));

      const citationText = citations
        .map(
          (c: any, i: number) =>
            `[${i + 1}] ID: ${c.id}, Title: "${c.title}", Tags: ${c.tags.join(
              ", ",
            )}, Score: ${c.relevance_score.toFixed(2)}`,
        )
        .join("\n");

      const combinedText = `Summary:\\n\\n${summaryText}\\n\\nSources used (${citations.length}):\\n\\n${citationText}`;

      return {
        content: [
          {
            type: "text",
            text: combinedText,
          },
        ],
        structuredContent: {
          summary: summaryText,
          sources_used: citations.length,
          citations: citations,
        },
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error generating summary and citations: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  },
);

const transport = new StdioServerTransport();
server.connect(transport);
