# OpenShift security posture management with Elastic Agent Builder

 This directory contains the supporting manifests, custom CEL rules, integration package, and Elastic Workflows for the blog post: *"From posture to root cause: investigate OpenShift compliance with Elastic Agent Builder"*.

 The solution centralizes Red Hat OpenShift Compliance Operator scan results in Elasticsearch, automates manual rule checks using Common Expression Language (CEL), and connects an interactive AI agent to query posture, inspect offending workloads, and trace configuration drift using Kubernetes audit logs.

 ---

 ## Repository layout

 The repository is organized by target runtime: Openshift-compliance-agent/
  openshift-compliance-agent/
  ├── README.md                          # This file
  │
  ├── openshift/                         # Manifests applied to OpenShift (oc apply -f)
  │   ├── agent-deployment.yaml          # Deployment and RBAC manifest for Elastic Agent
  │   ├── customrules.yaml               # CustomRule CRs evaluated with CEL
  │   └── tailoredprofile.yaml           # TailoredProfile binding CEL checks to compliance scans
  │
  └── elastic/                           # Assets imported into the Elastic Stack
      ├── connector/
      │   └── connector.txt              # Dev Tools request to register the Kubernetes connector
      │
      ├── integration/
      │   ├── openshift_security_posture_management-0.4.8.zip  # Custom integration package
      │   └── README.md                  # Integration upload and policy instructions
      │
      ├── workflows/                     # (Optional) Elastic Workflows definitions
      │   ├── workflows.txt              # Dev Tools requests for the 5 workflows
      │   └── README.md                  # Workflow breakdown and execution details
      │
      └── agent/
          ├── tools.txt                  # Dev Tools definitions for ES|QL, search, and workflow tools
          ├── skills.txt                 # Dev Tools definitions for the 4 modular skills
          ├── agent.txt                  # Dev Tools definition for the compliance agent
          └── README.md                  # Agent Builder configuration order and testing guide

 ---

 ## Architecture overview

 1. **Scan execution (OpenShift):** The OpenShift Compliance Operator runs scheduled compliance scans (such as CIS benchmarks and NIST controls) on each cluster.
 2. **CEL automation (OpenShift):** Rules tagged as `MANUAL` are evaluated programmatically using Common Expression Language via `CustomRule` objects.
 3. **Data ingestion (Elastic Agent):** An Elastic Agent Deployment queries the Compliance Operator API endpoints every 60 seconds using the HTTP JSON input, shipping findings into Elasticsearch data streams tagged with `orchestrator.cluster.name`.
 4. **Continuous transforms (Elasticsearch):** Continuous transforms (`scans`, `checks`, and `remedy`) deduplicate incoming events and maintain latest-state indices (`ospm-compliance_*-latest`).
 5. **Background annotation (Elastic Workflows):** A scheduled workflow runs every 5 minutes, reading evaluated CEL statuses from Elasticsearch and patching the OCP cluster's native `Rule` custom resources.
 6. **Agentic investigation (Elastic Agent Builder):** An AI agent interprets natural-language queries, summarizes fleet posture, queries live workloads via read-only Kubernetes workflows, and correlates cluster audit logs to identify drift originators.

 ---

 ## Prerequisites

 ### OpenShift environment
 - Red Hat OpenShift 4.12 or later (tested on OpenShift Local 4.22)
 - OpenShift Compliance Operator 1.10.0 or later (required for CEL support)
 - Cluster administrator privileges to create ServiceAccounts and ClusterRoles

 ### Elastic deployment
 - Elastic Stack 9.5 or later with an Enterprise license, or Elastic Cloud Serverless or Trail license
 - Kibana Fleet Server configured and reachable from the OpenShift cluster
 - Kubernetes connector configured in Kibana pointing to your OpenShift API endpoint

 ---

 ## Deployment walkthrough

 Follow these steps in sequence to set up the end-to-end solution:

 ### Step 1: Deploy OpenShift custom CEL rules
 Apply the custom rules and tailored profile so the Compliance Operator automates previously manual checks:
oc apply -f openshift/customrules.yaml
oc apply -f openshift/tailoredprofile.yaml
### Step 2: Install the Elastic integration
1. Follow `elastic/integration/README.md` to upload `openshift_security_posture_management-0.4.8.zip` via Kibana Fleet.
2. Create an agent policy (for example, `ospm-ocp-clusters`) containing the integration, set the 60-second polling interval, and generate a Fleet enrollment token.
### Step 3: Deploy Elastic Agent on OpenShift
Open `openshift/agent-deployment.yaml`, update the environment variables with your cluster details (`CLUSTER_NAME`, `FLEET_URL` `FLEET_ENROLLMENT_TOKEN`), then apply the manifest:
  oc apply -f openshift/agent-deployment.yaml

 Verify that documents start arriving in the `logs-openshift_security_posture_management.*` data streams and that the transforms build the `ospm-compliance_*-latest` indices.

 ### Step 4: Configure the Kubernetes connector
In Kibana Dev Tools Console, execute the request in `elastic/connector/connector.txt` (or configure via **Management** > **Connectors**) to establish secure connectivity between Elastic and your OpenShift API server. Ensure the connector name matches your `CLUSTER_NAME` (e.g. `ocp-na-prod`).

 ### Step 5: Configure the compliance agent
 Follow `elastic/agent/README.md` to register the tools, skills, and agent definition in Kibana Dev Tools Console in order:
 1. `tools.txt`
 2. `skills.txt`
 3. `agent.txt`

 ---

 ## Verification

Open Kibana and navigate to **Management** > **Agent Builder** > **OpenShift Compliance Agent**.
---
## Disclaimer
The integration package, custom rules, and workflows in this repository are developed for demonstration and reference architectures. They are not covered by official Elastic commercial support.
