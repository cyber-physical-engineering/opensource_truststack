# Open Source Trust Assurance Stack

**Trust nothing. Prove everything.**

This is an open-source toolkit for **trust assurance**: security monitoring, access control, auditability, integrity, and verifiable provenance around regulated data and critical systems. No vendor lock-in. No magic. Just plumbing you control.

Designed for environments handling **sensitive data, connected devices, and AI**—healthcare, defense, manufacturing, food & beverage—where leaders must show controls can be **proven**, not just asserted.

## Reference Implementation

A working Docker Compose reference implementation is available in the [reference-implementation](./reference-implementation) directory. It includes:
- **Observability**: OpenObserve, Grafana, Prometheus
- **Incident Response**: FIR
- **Simulation**: A data generator for testing telemetry

## The Stack (Tool Index)

### Common Baseline (The Foundation)
Get the foundation right before picking specialized tools.

*   **Identity & Policy**: [Keycloak](https://www.keycloak.org/) / [Authentik](https://goauthentik.io/) + [Open Policy Agent (OPA)](https://www.openpolicyagent.org/)
*   **Kubernetes Policy**: [Gatekeeper](https://open-policy-agent.github.io/gatekeeper/website/) + [Kyverno](https://kyverno.io/)
*   **Observability**: [OpenObserve](https://openobserve.ai/) + [Prometheus](https://prometheus.io/) + [Grafana](https://grafana.com/) + [OpenTelemetry](https://opentelemetry.io/)
*   **Search**: [OpenSearch](https://opensearch.org/) (log/event search at scale)
*   **Detection**: [Wazuh](https://wazuh.com/) + [Suricata](https://suricata.io/) + [osquery](https://osquery.io/) + [Zeek](https://zeek.org/) + [Falco](https://falco.org/)
*   **Incident Response**: [TheHive](https://thehive-project.org/)
*   **Secrets & Certs**: [HashiCorp Vault](https://www.vaultproject.io/) + [step-ca](https://smallstep.com/docs/step-ca) + [cert-manager](https://cert-manager.io/)
*   **Supply Chain**: [Syft](https://github.com/anchore/syft) + [Grype](https://github.com/anchore/grype) + [Trivy](https://aquasecurity.github.io/trivy/) + [Dependency-Track](https://dependencytrack.org/)
*   **Data Plumbing**: [Apache Kafka](https://kafka.apache.org/) / [NATS](https://nats.io/) / [RabbitMQ](https://www.rabbitmq.com/)
*   **State**: [PostgreSQL](https://www.postgresql.org/)

### Secure — Detection and Telemetry
Where you catch bad actors and honest mistakes.

*   **[Wazuh](https://wazuh.com/)** — Endpoint security and log analysis; host telemetry.
*   **[Suricata](https://suricata.io/)** — Network IDS; packet-based detections.
*   **[Zeek](https://zeek.org/)** — Network telemetry; high-fidelity protocol logs.
*   **[Falco](https://falco.org/)** — Runtime detection; suspicious process/container behaviors.
*   **[osquery](https://osquery.io/)** — Endpoint inventory as SQL.
*   **[YARA](https://virustotal.github.io/yara/)** — Content and malware pattern matching.
*   **[Sigma](https://github.com/SigmaHQ/sigma)** — Generic signature format for SIEM systems.

### Secure — Network Policy & Segmentation
*   **[Cilium](https://cilium.io/)** — eBPF-powered networking and security.
*   **[Calico](https://www.tigera.io/project-calico/)** — Kubernetes network policy and enforcement.

### Secure — OT & Edge Connectivity
*   **[EdgeX Foundry](https://www.edgexfoundry.org/)** — Edge integration framework.
*   **[MQTT](https://mqtt.org/)** — Lightweight pub/sub protocol for IoT.
*   **[OPC UA](https://opcfoundation.org/)** — Industrial interoperability protocol.

### Secure — Core Data Stores
*   **[PostgreSQL](https://www.postgresql.org/)** — Durable relational store.
*   **[MariaDB](https://mariadb.org/)** — Relational alternative (common in ERPs).
*   **[Redis](https://redis.io/)** — Cache and message broker.

### Control — Identity, Access & Policy
*   **[Keycloak](https://www.keycloak.org/)** — OIDC/SAML identity provider.
*   **[Authentik](https://goauthentik.io/)** — Lightweight IdP and SSO.
*   **[Open Policy Agent (OPA)](https://www.openpolicyagent.org/)** — Policy-as-code engine.
*   **[Kyverno](https://kyverno.io/)** — Kubernetes-native policy engine.

### Control — AI Gateway & Guardrails
*   **[Kong Gateway](https://konghq.com/products/kong-gateway)** — API gateway with AI plugins.
*   **[Traefik](https://traefik.io/)** — Cloud-native edge router.
*   **[Envoy](https://www.envoyproxy.io/)** — High-performance proxy.
*   **[NeMo Guardrails](https://github.com/NVIDIA/NeMo-Guardrails)** — Programmable LLM guardrails (NVIDIA).
*   **[Guardrails AI](https://www.guardrailsai.com/)** — Structure and type validation for LLMs.
*   **[LLM Guard](https://llm-guard.com/)** — Security toolkit for LLM inputs/outputs.
*   **[Microsoft Presidio](https://microsoft.github.io/presidio/)** — PII detection and redaction.

### Control — Automation & Response
*   **[TheHive](https://thehive-project.org/)** — Security Incident Response Platform.
*   **[n8n](https://n8n.io/)** — Workflow automation.
*   **[Shuffle](https://shuffler.io/)** — Open source SOAR.
*   **[StackStorm](https://stackstorm.com/)** — Event-driven automation.

### Control — Secrets & Keys
*   **[HashiCorp Vault](https://www.vaultproject.io/)** — Secrets management.
*   **[SoftHSM](https://www.opendnssec.org/softhsm/)** — Software emulation of an HSM.
*   **[step-ca](https://smallstep.com/docs/step-ca)** — Private certificate authority.

### Comply — Health & Quality
*   **[HAPI FHIR](https://hapifhir.io/)** — Complete implementation of the HL7 FHIR standard in Java.
*   **[NextGen Connect (Mirth)](https://github.com/nextgenhealthcare/connect)** — Healthcare integration engine.
*   **[ERPNext](https://erpnext.com/)** — Open source ERP (Quality Management, Manufacturing).

### Verify — Observability & Validation
*   **[OpenObserve](https://openobserve.ai/)** — Full-stack observability (logs, metrics, traces).
*   **[OpenSearch](https://opensearch.org/)** — Search and analytics suite.
*   **[Grafana](https://grafana.com/)** — The open observability platform.
*   **[Prometheus](https://prometheus.io/)** — Monitoring system and time series database.
*   **[Jaeger](https://www.jaegertracing.io/)** — Distributed tracing.
*   **[restic](https://restic.net/)** — Fast, secure, efficient backups.
*   **[Velero](https://velero.io/)** — Backup and migrate Kubernetes resources.

### Verify — Security Validation
*   **[MITRE ATT&CK Navigator](https://mitre-attack.github.io/attack-navigator/)** — Explore the ATT&CK matrix.
*   **[Caldera](https://caldera.mitre.org/)** — Automated adversary emulation.
*   **[Atomic Red Team](https://atomicredteam.io/)** — Small and highly portable detection tests.
*   **[OpenSCAP](https://www.open-scap.org/)** — Security compliance (SCAP).
*   **[Lynis](https://cisofy.com/lynis/)** — Security auditing tool for Linux/Unix.

### Prove — Integrity & Provenance
*   **[in-toto](https://in-toto.io/)** — Framework to secure the integrity of software supply chains.
*   **[Sigstore](https://sigstore.dev/)** — Signing and verifying software artifacts.
*   **[Trillian](https://github.com/google/trillian)** — Transparent, highly scalable and verifiable data store.
*   **[OpenLineage](https://openlineage.io/)** — Open standard for data lineage.
*   **[Marquez](https://marquezproject.ai/)** — Lineage metadata collection and visualization.

