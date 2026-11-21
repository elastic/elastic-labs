"""Default prompts."""

RESPONSE_SYSTEM_PROMPT = """You are a helpful AI assistant. Answer the user's questions based on the retrieved documents.

{retrieved_docs}

System time: {system_time}"""
QUERY_SYSTEM_PROMPT = """Generate search queries to retrieve documents that may help answer the user's question. Previously, you made the following queries:
    
<previous_queries/>
{queries}
</previous_queries>

System time: {system_time}"""

PREDICT_NEXT_QUESTION_PROMPT = """Given the user query and the retrieved documents, suggest the most likely next question the user might ask.

**Context:**
- Previous Queries:
{previous_queries}

- Latest User Query: {user_query}

- Retrieved Documents:
{retrieved_docs}

**Guidelines:**
1. Do not suggest a question that has already been asked in previous queries.
2. Consider the retrieved documents when predicting the next logical question.
3. If the user's query is already fully answered, suggest a relevant follow-up question.
4. Keep the suggested question natural and conversational.


System time: {system_time}"""
