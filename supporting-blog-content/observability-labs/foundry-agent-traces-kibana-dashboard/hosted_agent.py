"""Foundry hosted agent that exports its own traces to Elastic and, when enabled, Agent 365.

The agent server host configures the Microsoft OpenTelemetry distro for you. It sends
traces to any OTLP endpoint named in OTEL_EXPORTER_OTLP_ENDPOINT, adds the agent, blueprint
and tenant IDs to every span, and exports to Agent 365 when the Foundry account-level
a365LoggingEnabled setting is true. So this file does not call use_microsoft_opentelemetry() itself. It describes each
agent step with the distro's scopes, which emit the span shapes Agent 365 accepts
(invoke_agent, chat, execute_tool) and that the dashboard queries read.

Install:
  pip install azure-ai-agentserver-invocations azure-ai-projects azure-identity \
      microsoft-opentelemetry

Environment variables you set on the hosted agent:
  OTEL_EXPORTER_OTLP_ENDPOINT         Elastic managed OTLP endpoint
  OTEL_EXPORTER_OTLP_HEADERS          Authorization=ApiKey <your-api-key>
  CAPTURE_MESSAGE_CONTENT             "true" records prompts, responses and tool arguments.
                                      Default "false". Agent 365 only consumes spans that
                                      carry content, so with this off it ignores those spans.

Environment variables Foundry injects into every hosted agent container at startup. They are
reserved and read-only: read them here, never set or override them on the platform.
  FOUNDRY_PROJECT_ENDPOINT            Foundry project endpoint URL
  FOUNDRY_MODEL_NAME                  Model deployment name in your Foundry project
  FOUNDRY_AGENT_NAME                  Becomes service.name in Kibana
  FOUNDRY_AGENT_INSTANCE_CLIENT_ID    Agent instance ID (gen_ai.agent.id)
  FOUNDRY_AGENT_BLUEPRINT_CLIENT_ID   Agent blueprint ID
  FOUNDRY_AGENT_TENANT_ID             Microsoft Entra tenant ID

Only when you run the container locally, outside Foundry, do you need to export the
FOUNDRY_* variables yourself.
"""

import asyncio
import os
import uuid
from urllib.parse import urlparse

# The scopes below do nothing unless observability is switched on. The agent server host
# only does that itself when Foundry enables Agent 365 export, so opt in here to get spans
# in Elastic either way.
os.environ.setdefault("ENABLE_OBSERVABILITY", "true")

from azure.ai.agentserver.invocations import InvocationAgentServerHost
from azure.ai.projects import AIProjectClient
from azure.identity import DefaultAzureCredential
from microsoft.opentelemetry.a365.core import (
    AgentDetails,
    CallerDetails,
    Channel,
    ExecuteToolScope,
    InferenceCallDetails,
    InferenceOperationType,
    InferenceScope,
    InvokeAgentScope,
    InvokeAgentScopeDetails,
    Request,
    ServiceEndpoint,
    ToolCallDetails,
    ToolType,
    UserDetails,
)
from starlette.responses import JSONResponse

# The agent server host turns on OTLP export when OTEL_EXPORTER_OTLP_ENDPOINT is set.
app = InvocationAgentServerHost()

CAPTURE_CONTENT = os.environ.get("CAPTURE_MESSAGE_CONTENT", "false").lower() == "true"
MODEL = os.environ["FOUNDRY_MODEL_NAME"]
PROJECT_HOST = ServiceEndpoint(
    hostname=urlparse(os.environ["FOUNDRY_PROJECT_ENDPOINT"]).hostname
)

# The instance ID goes in agent_id. Using the blueprint ID there makes Agent 365 reject
# the export with a 403 agent ID mismatch.
AGENT = AgentDetails(
    agent_id=os.environ["FOUNDRY_AGENT_INSTANCE_CLIENT_ID"],
    agent_name=os.environ.get("FOUNDRY_AGENT_NAME", "support-agent"),
    agent_blueprint_id=os.environ["FOUNDRY_AGENT_BLUEPRINT_CLIENT_ID"],
    tenant_id=os.environ["FOUNDRY_AGENT_TENANT_ID"],
)

project = AIProjectClient(
    endpoint=os.environ["FOUNDRY_PROJECT_ENDPOINT"],
    credential=DefaultAzureCredential(),
)
openai = project.get_openai_client()


def lookup_order(request: Request, order_id: str) -> str:
    """Stand-in for a real tool call, such as a database or MCP lookup."""
    arguments = {"order_id": order_id}
    details = ToolCallDetails(
        tool_name="lookup_order",
        arguments=arguments if CAPTURE_CONTENT else None,
        tool_call_id=str(uuid.uuid4()),
        tool_type=ToolType.FUNCTION.value,
        # Replace with the host your real tool calls.
        endpoint=ServiceEndpoint(hostname="orders.example.com"),
    )
    with ExecuteToolScope.start(
        request=request, details=details, agent_details=AGENT
    ) as scope:
        result = f"Order {order_id} shipped and arrives Thursday."
        if CAPTURE_CONTENT:
            scope.record_response(result)
        return result


def ask_model(request: Request, prompt: str) -> str:
    """One model call, recorded as a chat span with token counts."""
    details = InferenceCallDetails(
        operationName=InferenceOperationType.CHAT,
        model=MODEL,
        providerName="microsoft.foundry",
        endpoint=PROJECT_HOST,
    )
    with InferenceScope.start(
        request=request, details=details, agent_details=AGENT
    ) as scope:
        response = openai.responses.create(model=MODEL, input=prompt)
        if CAPTURE_CONTENT:
            scope.record_input_messages([prompt])
            scope.record_output_messages([response.output_text])
        scope.record_input_tokens(response.usage.input_tokens)
        scope.record_output_tokens(response.usage.output_tokens)
        return response.output_text


@app.invoke_handler
async def handle(request):
    body = await request.json()
    question = body.get("question", "")

    # Content=None keeps the question out of the span. The conversation ID groups the runs
    # in one thread. The host adds Foundry's session ID to every span for you.
    agent_request = Request(
        content=question if CAPTURE_CONTENT else None,
        conversation_id=body.get("conversation_id"),
        channel=Channel(name=body.get("channel", "web")),
    )
    caller = CallerDetails(
        user_details=UserDetails(
            user_id=body.get("user_id"), user_client_ip=request.client.host
        )
    )

    # One root span per request keeps the model and tool calls in a single trace.
    with InvokeAgentScope.start(
        request=agent_request,
        scope_details=InvokeAgentScopeDetails(endpoint=PROJECT_HOST),
        agent_details=AGENT,
        caller_details=caller,
    ) as scope:
        order_status = lookup_order(agent_request, body.get("order_id", "unknown"))

        # The OpenAI client is synchronous, so run it off the event loop.
        answer = await asyncio.to_thread(
            ask_model,
            agent_request,
            "You are a support agent. Answer in two sentences.\n"
            f"Order status: {order_status}\n"
            f"Customer question: {question}",
        )
        if CAPTURE_CONTENT:
            scope.record_output_messages([answer])
        return JSONResponse({"answer": answer})


if __name__ == "__main__":
    app.run()
