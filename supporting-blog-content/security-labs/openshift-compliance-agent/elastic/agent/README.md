 # OpenShift compliance agent configuration for Elastic Agent Builder

 This directory contains the API definitions needed to bootstrap the **OpenShift Compliance Agent** in Elastic Agent Builder using the Kibana Dev Tools Console.

 To ensure references resolve correctly, components must be created in this specific order:
 1. **Tools** (`tools.txt`)
 2. **Skills** (`skills.txt`)
 3. **Agent** (`agent.txt`)

 ---

 ## File breakdown

 ### 1. `tools.txt` (Create first)
 Registers all queries, search tools, and workflow-backed cluster tools:

 #### ES|QL and Search tools:
 - **`ocp_compliance.get_scan_status` (ES|QL):** Queries current scan phases and results across clusters from `ospm-compliance_scans-latest`.
 - **`ocp_compliance.list_checks_by_status` (ES|QL):** Lists check results filtered by status (`FAIL`, `MANUAL`, `PASS`), including custom CEL evaluation annotations.
 - **`ocp_compliance.list_remediations` (ES|QL):** Queries native Red Hat remediations and their current state (`Applied` vs `NotApplied`).
 - **`ocp_compliance.get_rule_details` (ES|QL):** Retrieves rule description, severity, and remediation guidance for a specific check.
 - **`ocp_compliance.search_audit_logs` (Index search):** Searches OpenShift Kubernetes API audit logs to attribute which user or service account deployed a non-compliant workload.
 - **`ocp_compliance.search_compliance_history` (Index search):** Searches raw time-series data streams
(`logs-openshift_security_posture_management.compliance_*-default`) to track check history and flapping states over time.

 #### Workflow tools (Live cluster actions):
 - **`ocp_compliance.trigger_scan` (Workflow):** Invokes the rescan workflow to re-run an existing `ComplianceScan` on the live cluster by setting the rescan annotation.
 - **`ocp_compliance.set_remediation_state` (Workflow):** Invokes the remediation workflow to apply (`apply: true`) or revert (`apply: false`) an official `ComplianceRemediation` patch on the live cluster.

 ---

 ### 2. `skills.txt` (Create second)
 Registers the four modular skills that govern the agent's task-specific execution flows:

 - **`ocp-compliance-posture-summary`:** Coordinates high-level queries about fleet health, scan completion, and pass/fail ratios.
 - **`ocp-compliance-failure-investigation`:** Coordinates root-cause investigations by combining rule metadata, workload history, and Kubernetes audit logs.
 - **`ocp-compliance-live-cluster-actions`:** Manages live cluster actions (`trigger_scan` and `set_remediation_state`) behind human-in-the-loop approval confirmation.
 - **`ocp-compliance-reporting`:** Generates structured Markdown compliance summaries and scan-over-scan trend comparisons.

 ---

 ### 3. `agent.txt` (Create last)
 Registers the top-level **OpenShift Compliance Agent**, attaching all skills, tools, and the system prompt. It configures:
 - **Precautionary role:** Strict read-only posture investigation; live modifications require explicit user approval.
 - **Guardrails:** Prevents arbitrary mutations, enforces exact cluster name matching, and silently filters internal custom scans.
 - **Audit citations:** Enforces citing Elasticsearch document IDs, cluster names, and scan timestamps for every finding.

 ---

 ## Prerequisites

 Before executing these requests, ensure the following are configured in your Elastic environment:

 1. **Elastic Stack:** Version 9.5 or later with an Enterprise license, or Elastic Cloud Serverless or Trial version.
 2. **Data ingestion:** The OpenShift Security Posture Management integration package installed and polling data.
 3. **Continuous transforms:** The three transforms (`scans`, `checks`, `remedy`) running to maintain the `ospm-compliance_*-latest` indices.
 4. **Elastic Workflows:** The underlying workflows (`openshift-compliance-trigger-scan` and `openshift-compliance-set-remediation-state`) imported and active.
 5. **Kubernetes connector:** An active Elastic Kubernetes connector configured with permissions on the target clusters.

 ---

 ## Installation via Kibana Dev Tools Console

 Because Elastic Agent Builder and Workflows are managed by Kibana rather than core Elasticsearch, all Dev Tools Console requests
 must use the **`kbn:`** routing prefix. 

 1. Open Kibana and navigate to **Management** > **Dev Tools** > **Console**.
 2. **Step 1 — Register Tools:**  
    Open `tools.txt`, paste the contents into the Console, and run each request. Verify that each tool returns `200 OK` or `201 Created`.
 3. **Step 2 — Register Skills:**  
    Open `skills.txt`, paste the contents into the Console, and run each request.
 4. **Step 3 — Register Agent:**  
    Open `agent.txt`, paste the request into the Console, and execute it to create the agent.

 ---

 ## Verifying in the UI

 1. In Kibana, open **Management** > **Agent Builder**.
 2. Select the **OpenShift Compliance Agent**.
 3. Verify that all four skills, the six ES|QL/search tools, and the two workflow tools are listed and active.
