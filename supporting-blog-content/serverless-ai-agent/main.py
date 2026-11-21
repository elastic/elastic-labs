import os
import re
import json
import requests
from dotenv import load_dotenv
from llama_index.core.tools import FunctionTool
from llama_index.agent.openai import OpenAIAgent
from llama_index.llms.openai import OpenAI

load_dotenv(".env")
PROJECTS_FILE = "projects.json"


def load_projects():
    """Load the project mapping from the JSON file."""
    if os.path.exists(PROJECTS_FILE):
        with open(PROJECTS_FILE, "r") as f:
            return json.load(f)
    return {}


def save_projects(project_map):
    """Save the project mapping to the JSON file."""
    with open(PROJECTS_FILE, "w") as f:
        json.dump(project_map, f)


# Store project name -> project info mapping.
PROJECT_MAP = load_projects()


def normalize_project_info(project_info):
    """
    Ensure that the project info is a dictionary.
    If the stored value is a string, convert it to a dictionary with the key "id".
    """
    if isinstance(project_info, str):
        return {"id": project_info}
    return project_info


def create_ess_project(project_name: str) -> str:
    """
    Creates a Serverless project by calling the ESS API.
    The API environment URL, API key, and region are read from the .env file.
    The returned project details (ID, credentials, endpoints) are stored
    in a global mapping (PROJECT_MAP) which is persisted to a file.
    Returns a summary of the created project.
    """
    env_url = os.environ.get("ES_URL")
    api_key = os.environ.get("API_KEY")
    region_id = os.environ.get("REGION", "aws-eu-west-1")

    if not env_url:
        return "Error: ES_URL is not set in the environment."
    if not api_key:
        return "Error: API_KEY is not set in the environment."

    url = f"{env_url}/api/v1/serverless/projects/elasticsearch"

    headers = {"Authorization": f"ApiKey {api_key}", "Content-Type": "application/json"}
    payload = {"name": project_name, "region_id": region_id}

    try:
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        return f"Error during project creation: {e}"

    data = response.json()
    project_id = data.get("id")
    if not project_id:
        return "Error: No project ID returned from the API."

    if not re.fullmatch(r"^[a-z0-9]{32}$", project_id):
        return (
            f"Error: Received project ID '{project_id}' does not match expected format."
        )

    credentials = data.get("credentials")
    endpoints = data.get("endpoints")

    PROJECT_MAP[project_name] = {
        "id": project_id,
        "credentials": credentials,
        "endpoints": endpoints,
    }
    save_projects(PROJECT_MAP)

    summary = (
        f"Project '{project_name}' created successfully.\n"
        f"Project ID: {project_id}\n"
        f"Endpoints: {endpoints}"
    )
    return summary


def delete_ess_project(project_name: str) -> str:
    """
    Deletes a Serverless project by using the project name.
    It looks up the project ID automatically from the persisted PROJECT_MAP and deletes the project.
    Returns a confirmation message or an error message.
    """
    project_info = PROJECT_MAP.get(project_name)
    if not project_info:
        return f"Error: No project found with name '{project_name}'. Ensure the project was created previously."
    project_info = normalize_project_info(project_info)

    project_id = project_info.get("id")
    env_url = os.environ.get("ES_URL")
    api_key = os.environ.get("API_KEY")

    if not env_url:
        return "Error: ES_URL is not set in the environment."
    if not api_key:
        return "Error: API_KEY is not set in the environment."

    url = f"{env_url}/api/v1/serverless/projects/elasticsearch/{project_id}"
    headers = {"Authorization": f"ApiKey {api_key}", "Content-Type": "application/json"}

    try:
        response = requests.delete(url, headers=headers)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        return f"Error during project deletion: {e}"

    del PROJECT_MAP[project_name]
    save_projects(PROJECT_MAP)
    return f"Project '{project_name}' (ID: {project_id}) deleted successfully."


def get_ess_project_status(project_name: str) -> str:
    """
    Retrieves the status of a Serverless project by using its project name.
    It looks up the project ID from the persisted PROJECT_MAP and calls the /status endpoint.
    Returns the status information as a formatted JSON string.
    """
    project_info = PROJECT_MAP.get(project_name)
    if not project_info:
        return f"Error: No project found with name '{project_name}'."
    project_info = normalize_project_info(project_info)

    project_id = project_info.get("id")
    env_url = os.environ.get("ES_URL")
    api_key = os.environ.get("API_KEY")

    if not env_url:
        return "Error: ES_URL is not set in the environment."
    if not api_key:
        return "Error: API_KEY is not set in the environment."

    url = f"{env_url}/api/v1/serverless/projects/elasticsearch/{project_id}/status"
    headers = {"Authorization": f"ApiKey {api_key}"}

    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        return f"Error retrieving project status: {e}"

    status_data = response.json()
    return json.dumps(status_data, indent=4)


def get_ess_project_details(project_name: str) -> str:
    """
    Retrieves the full details of a Serverless project by using its project name.
    It looks up the project ID from the persisted PROJECT_MAP and calls the GET project endpoint.
    If credentials or endpoints are missing in the API response, stored values are used as fallback.
    Returns the project details as a formatted JSON string.
    """
    project_info = PROJECT_MAP.get(project_name)
    if not project_info:
        return f"Error: No project found with name '{project_name}'."
    project_info = normalize_project_info(project_info)

    project_id = project_info.get("id")
    env_url = os.environ.get("ES_URL")
    api_key = os.environ.get("API_KEY")

    if not env_url:
        return "Error: ES_URL is not set in the environment."
    if not api_key:
        return "Error: API_KEY is not set in the environment."

    url = f"{env_url}/api/v1/serverless/projects/elasticsearch/{project_id}"
    headers = {"Authorization": f"ApiKey {api_key}"}

    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        return f"Error retrieving project details: {e}"

    details_data = response.json()
    if not details_data.get("credentials"):
        details_data["credentials"] = project_info.get("credentials")
    if not details_data.get("endpoints"):
        details_data["endpoints"] = project_info.get("endpoints")
    return json.dumps(details_data, indent=4)


create_project_tool = FunctionTool.from_defaults(
    create_ess_project,
    name="create_ess_project",
    description=(
        "Creates a Serverless Elasticsearch project. "
        "It requires a single parameter: project_name. "
        "The API environment URL (ES_URL), API key (API_KEY), and region (REGION) are read from the environment (.env file). "
        "The function stores the project details (ID, credentials, endpoints) for later use and persists them to a file."
    ),
)

delete_project_tool = FunctionTool.from_defaults(
    delete_ess_project,
    name="delete_ess_project",
    description=(
        "Deletes a Serverless Elasticsearch project using its project name. "
        "It automatically looks up the project ID (stored during project creation and persisted in a file) and deletes the project. "
        "It returns a confirmation message or an error message."
    ),
)

get_status_tool = FunctionTool.from_defaults(
    get_ess_project_status,
    name="get_ess_project_status",
    description=(
        "Retrieves the status of a Serverless Elasticsearch project by using its project name. "
        "It looks up the project ID (from a persisted mapping) and calls the /status endpoint. "
        "It returns the status information as a JSON string."
    ),
)

get_details_tool = FunctionTool.from_defaults(
    get_ess_project_details,
    name="get_ess_project_details",
    description=(
        "Retrieves the full details of a Serverless Elasticsearch project by using its project name. "
        "It looks up the project ID (from a persisted mapping) and calls the GET project endpoint. "
        "It returns the project details as a JSON string."
    ),
)

openai_api_key = os.environ.get("OPENAI_API_KEY")
if not openai_api_key:
    raise ValueError(
        "Please set the OPENAI_API_KEY environment variable with your OpenAI API key."
    )

llm = OpenAI(model="gpt-4o", api_key=openai_api_key)
agent = OpenAIAgent.from_tools(
    [create_project_tool, delete_project_tool, get_status_tool, get_details_tool],
    llm=llm,
    verbose=True,
)


def main():
    print("\nWelcome to the Serverless Project AI Agent Tool!\n")
    print("You can ask things like:")
    print(" - 'Create a serverless project named my_project'")
    print(" - 'Delete the serverless project named my_project'")
    print(" - 'Get the status of the serverless project named my_project'")
    print(" - 'Get the details of the serverless project named my_project'")

    while True:
        user_input = input("\nUser: ")
        if user_input.strip().lower() in {"exit", "quit"}:
            break

        response = agent.chat(user_input)
        print("\nAgent:", response)


if __name__ == "__main__":
    main()
