# Elasticsearch Serverless AI Agent

This little command-line tool lets you manage your [Serverless Elasticsearch projects](https://www.elastic.co/guide/en/serverless/current/intro.html) in plain English. It talks to an AI (in this case, OpenAI) to figure out what you mean and call the right functions using LlamaIndex!

### What Does It Do?
- **Create a project**: Spin up a new Serverless Elasticsearch project.
- **Delete a project**: Remove an existing project (yep, it cleans up after you).
- **Get project status**: Check on how your project is doing.
- **Get project details**: Fetch all the juicy details about your project.

### How It Works
When you type in something like:

_"Create a serverless project named my_project"_

…here’s what goes on behind the scenes:

- **User Input & Context:** Your natural language command is sent to the AI agent.
- **Function Descriptions:** The AI agent already knows about a few functions—like create_ess_project, delete_ess_project, get_ess_project_status, and get_ess_project_details—because we gave it detailed descriptions. These descriptions tell the AI what each function does and what parameters they need.
- **LLM Processing:** Your query plus the function info is sent off to the LLM. This means the AI sees:
- **The User Query**: Your plain-English instruction.
- **Available Functions & Descriptions**: Details on what each tool does so it can choose the right one.
- **Context/Historic Chat Info**: Since it’s a conversation, it remembers what’s been said before.
- **Function Call & Response**: The AI figures out which function to call, passes along the right parameters (like your project name), and then the function is executed. The response is sent back to you in a friendly format.

In short, we’re sending both your natural language query and a list of detailed tool descriptions to the LLM so it can “understandd” and choose the right action for your request.

### Setup

- **Clone the Repoo:** 
```
git clone git@github.com:framsouza/serverless-ai-agent.git
cd serverless-ai-agent
```

- **Install the Dependencies**: Make sure you have Python installed, then run:
```
pip install -r requirements.txt
```

- **Configure Your Environment**: Create a .env file in the project root with these variables:
```
ES_URL=your_elasticsearch_api_url
API_KEY=your_elasticsearch_api_key
REGION=your_region
OPENAI_API_KEY=your_openai_api_key
```

- **Projects File**: The tool uses a `projects.json` file to store your project mappings (project names to their details). This file is created automatically if it doesn’t exist.

### Running the agent

```
python main.py
```

You’ll see a prompt like this:

```
Welcome to the Serverless Project AI Agent Tool!
You can ask things like:
 - 'Create a serverless project named my_project'
 - 'Delete the serverless project named my_project'
 - 'Get the status of the serverless project named my_project'
 - 'Get the details of the serverless project named my_project'
```

Type in your command, and the AI agent will work its magic! When you're done, type `exit` or `quit` to leave.

### A few more details

- **LLM Integration**: The LLM is given both your query and detailed descriptions of each available function. This helps it understand the context and decide, for example, whether to call `create_ess_project` or `delete_ess_project`.
- **Tool Descriptions**: Each function tool (created using FunctionTool.from_defaults) has a friendly description. This description is included in the prompt sent to the LLM so that it “knows” what actions are available and what each action expects.
- **Persistence**: Your projects and their details are saved in projects.json, so you don’t have to re-enter info every time.
- **Verbose Logging**: The agent is set to verbose mode, which is great for debugging and seeing how your instructions get translated into function calls.

### Example utilization


```
python main.py 

Welcome to the Serverless Project AI Agent Tool!

You can ask things like:
 - 'Create a serverless project named my_project'
 - 'Delete the serverless project named my_project'
 - 'Get the status of the serverless project named my_project'
 - 'Get the details of the serverless project named my_project'

User: Create a serverless project named my-february-test
Added user message to memory: Create a serverless project named my-february-test

=== Calling Function ===
Calling function: create_ess_project with args: {"project_name":"my-february-test"}
========================


Agent: The serverless Elasticsearch project named "my-february-test" has been created successfully. Here are the details:

- **Project ID:** <>>
- **Elasticsearch Endpoint:** [https://my-february-test-ccc399.es.eu-west-1.aws.qa.elastic.cloud](https://my-february-test-ccc399.es.eu-west-1.aws.qa.elastic.cloud)
- **Kibana Endpoint:** [https://my-february-test-ccc399.kb.eu-west-1.aws.qa.elastic.cloud](https://my-february-test-ccc399.kb.eu-west-1.aws.qa.elastic.cloud)

User: get my-february-test status
Added user message to memory: get my-february-test status

=== Calling Function ===
Calling function: get_ess_project_status with args: {"project_name":"my-february-test"}
========================

Agent: The status of the "my-february-test" project is currently **initializing**.

User: get my-february-test info
Added user message to memory: get my-february-test info

=== Calling Function ===
Calling function: get_ess_project_details with args: {"project_name":"my-february-test"}
========================

Agent: Here are the details for the "my-february-test" project:

- **Project Name:** my-february-test
- **Alias:** my-february-test-ccc399
- **Cloud ID:** ""
- **Project ID:** ""
- **Region ID:** aws-eu-west-1
- **Created At:** 2025-02-12T15:42:00.530177619Z
- **Created By:** 571213384
- **Organization ID:** ""
- **Type:** Elasticsearch
- **Optimized For:** General Purpose
- **Search Lake:**
  - **Boost Window:** 7
  - **Search Power:** 100
- **Endpoints:**
  - **Elasticsearch:** https://my-february-test-ccc399.es.eu-west-1.aws.qa.elastic.cloud
  - **Kibana:** https://my-february-test-ccc399.kb.eu-west-1.aws.qa.elastic.cloud
- **Credentials:**
  - **Username:** ""
  - **Password:** ""

Please ensure to keep the credentials secure.

User: please delete the my-february-test project
Added user message to memory: please delete the my-february-test project

=== Calling Function ===
Calling function: delete_ess_project with args: {"project_name":"my-february-test"}
========================

Agent: The "my-february-test" project has been deleted successfully.
```

[See original code](https://github.com/framsouza/serverless-ai-agent)