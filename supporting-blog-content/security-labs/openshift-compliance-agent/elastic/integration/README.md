 # OpenShift security posture management custom integration

 This directory contains the custom Elastic integration package (`openshift_security_posture_management-0.4.8.zip`) used to collect, parse, and transform OpenShift Compliance Operator data into Elasticsearch.

 ---

 ## Package overview

 This archive is a custom Elastic package built to poll the Red Hat OpenShift Compliance Operator APIs using the Elastic Agent HTTP JSON input.

 When imported into Kibana Fleet, the package automatically installs the following assets:

 ### 1. Data streams & ingest pipelines (`data_stream/`)
 - **`compliance_scans`:** Ingests scan definitions, phases, and high-level results from `compliancescans.compliance.openshift.io`.
 - **`compliance_check_results`:** Ingests granular check outcomes, severity ratings, and rule annotations from `compliancecheckresults.compliance.openshift.io`.
 - **`compliance_remediations`:** Ingests automated remediation objects and their application states from `complianceremediations.compliance.openshift.io`.

 ### 2. Continuous Elasticsearch transforms (`elasticsearch/transform/`)
 The package installs three continuous transforms:
 - **`scans`**
 - **`checks`**
 - **`remedy`**

 These transforms continuously process incoming time-series documents and collapse them into dedicated latest-state indices
(`ospm-compliance_*-latest`). The `checks` transform deduplicates records by cluster and resource name (`metadata.name`), preserving evaluations across multiple node roles without creating duplicate entries across repeated scan cycles.

 ### 3. Data views (`kibana/index_pattern/`)
 - `ospm-compliance-*-latest`: Targets the transformed latest-state indices used by Agent Builder.
 - `logs-openshift_security_posture_management.compliance*`: Targets the raw historical data streams used for trend and drift investigations.

 ### 4. Pre-built Kibana dashboards (`kibana/dashboard/`)
 - **[OpenShift Compliance] Posture Overview:** High-level fleet pass/fail status and scan health.
 - **[OpenShift Compliance] Overall Results:** Granular rule breakdown filtered by severity and compliance profile.
 - **[OpenShift Compliance] Auto Remediations:** Status of native remediation patches across clusters.

 ---

 ## How to upload and configure

 For a visual walkthrough of the upload and policy configuration process, refer to the recorded video included with this blog post: `openshift-compliance-deploy-integration.mp4`

 ### Installation steps:

 1. **Upload the package:**
    - In Kibana, navigate to **Management** > **Integrations**.
    - Use the package upload option in the Kibana UI to upload `openshift_security_posture_management-0.4.8.zip`.

 2. **Add to an Elastic Agent policy:**
    - Create or edit an Elastic Agent policy in Fleet (for example, `ospm-ocp-clusters`).
    - Add the **OpenShift Security Posture Management** integration to the policy.

 3. **Configure API endpoints and polling:**
    - The integration defaults to querying the cluster's internal Kubernetes API using pod environment variables:
    - The default polling interval is set to **60 seconds**. Adjust this interval to match your cluster's scan schedules and
 freshness requirements.

 4. **Verify cluster metadata:**
    - Ensure the Elastic Agent deployed on the cluster has the `CLUSTER_NAME` environment variable set. The integration uses this
 variable to enrich all incoming events with `orchestrator.cluster.name`.

 5. **Deploy the agent:**
    - Deploy the Elastic Agent to your OpenShift cluster using the reference manifest provided in the `openshift/` directory.

 ---

 ## Important note

 This is a custom-built integration designed for demonstration and proof-of-concept purposes. It is not an official Elastic integration package distributed through the Elastic Package Registry (EPR) and is not covered by Elastic commercial support.
