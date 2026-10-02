# Trust Stack: a tool index and a demo stack

Two things live here. The first is a curated index of 63 security, observability, identity, policy and provenance tools. It has a common baseline of 27 tools and 53 entries under five actions (Secure, Control, Comply, Verify and Prove); 17 names appear in both. The second is a Docker Compose demo in `reference-implementation/` that runs a few of those tools with six small Node.js services written for it.

**Status: prototype.** Checked without Docker on October 2, 2026 (Node 22.19.0, Apple Silicon Mac). All 11 JavaScript files pass `node --check`, and `npm ci` passes for all six services. The base, dev and mes Compose files pass the Compose Specification schema. The simulator, anomaly service, event relay, ERPNext poller and status page each start on their own and answer their health endpoints. Both test-lite scripts pass as documented. CI starts the default-profile stack and checks every published endpoint on each push.

James Thornton set the architecture and requirements. The code was written with AI-assisted development in late 2025. The tests and checks were re-run in October 2026.

## The index

The index is a reading list, not a bill of materials for the demo. Of the 63 tools, 7 run in the demo (PostgreSQL, OpenObserve, Prometheus and Grafana in the default profile; MariaDB, Redis and ERPNext in the `mes` profile). Most are open source; two are not: HashiCorp Vault is under the Business Source License, and TheHive is now distributed commercially. MQTT and OPC UA are protocols, not tools.

### Common baseline

The foundation most stacks share. Seventeen of these names appear again under an action below.

- Identity and policy: [Keycloak](https://www.keycloak.org/) or [Authentik](https://goauthentik.io/), plus [Open Policy Agent](https://www.openpolicyagent.org/)
- Kubernetes policy: [Gatekeeper](https://open-policy-agent.github.io/gatekeeper/website/) and [Kyverno](https://kyverno.io/)
- Observability: [OpenObserve](https://openobserve.ai/), [Prometheus](https://prometheus.io/), [Grafana](https://grafana.com/), [OpenTelemetry](https://opentelemetry.io/)
- Search: [OpenSearch](https://opensearch.org/)
- Detection: [Wazuh](https://wazuh.com/), [Suricata](https://suricata.io/), [osquery](https://osquery.io/), [Zeek](https://zeek.org/), [Falco](https://falco.org/)
- Incident response: [TheHive](https://strangebee.com/) (commercial)
- Secrets and certificates: [HashiCorp Vault](https://developer.hashicorp.com/vault) (Business Source License), [step-ca](https://smallstep.com/docs/step-ca), [cert-manager](https://cert-manager.io/)
- Supply chain: [Syft](https://github.com/anchore/syft), [Grype](https://github.com/anchore/grype), [Trivy](https://trivy.dev/), [Dependency-Track](https://dependencytrack.org/)
- Messaging: [Apache Kafka](https://kafka.apache.org/), [NATS](https://nats.io/), [RabbitMQ](https://www.rabbitmq.com/)
- State: [PostgreSQL](https://www.postgresql.org/)

### Secure: detection and telemetry

- [Wazuh](https://wazuh.com/): endpoint security and log analysis
- [Suricata](https://suricata.io/): network intrusion detection
- [Zeek](https://zeek.org/): network telemetry and protocol logs
- [Falco](https://falco.org/): runtime detection for processes and containers
- [osquery](https://osquery.io/): endpoint inventory as SQL
- [YARA](https://virustotal.github.io/yara/): content and malware pattern matching
- [Sigma](https://github.com/SigmaHQ/sigma): a generic signature format for SIEM systems

### Secure: network policy and segmentation

- [Cilium](https://cilium.io/): eBPF-based networking and security
- [Calico](https://www.tigera.io/project-calico/): Kubernetes network policy

### Secure: OT and edge connectivity

- [EdgeX Foundry](https://www.edgexfoundry.org/): edge integration framework
- [MQTT](https://mqtt.org/): lightweight publish-subscribe protocol
- [OPC UA](https://opcfoundation.org/): industrial interoperability protocol

### Secure: core data stores

- [PostgreSQL](https://www.postgresql.org/): relational database
- [MariaDB](https://mariadb.org/): relational database, common under ERPs
- [Redis](https://redis.io/): cache and message broker

### Control: identity, access and policy

- [Keycloak](https://www.keycloak.org/): OIDC and SAML identity provider
- [Authentik](https://goauthentik.io/): identity provider and SSO
- [Open Policy Agent](https://www.openpolicyagent.org/): policy as code
- [Kyverno](https://kyverno.io/): Kubernetes policy engine

### Control: AI gateways and guardrails

- [Kong Gateway](https://konghq.com/products/kong-gateway): API gateway with AI plugins
- [Traefik](https://traefik.io/): edge router
- [Envoy](https://www.envoyproxy.io/): proxy
- [NeMo Guardrails](https://github.com/NVIDIA-NeMo/Guardrails): programmable guardrails for language models (NVIDIA)
- [Guardrails AI](https://guardrailsai.com/): structure and type validation for model output
- [LLM Guard](https://github.com/protectai/llm-guard): checks on model inputs and outputs
- [Microsoft Presidio](https://microsoft.github.io/presidio/): PII detection and redaction

### Control: automation and response

- [TheHive](https://strangebee.com/): incident response platform (commercial)
- [n8n](https://n8n.io/): workflow automation
- [Shuffle](https://shuffler.io/): open source SOAR
- [StackStorm](https://stackstorm.com/): event-driven automation

### Control: secrets and keys

- [HashiCorp Vault](https://developer.hashicorp.com/vault): secrets management (Business Source License)
- [SoftHSM](https://github.com/softhsm/SoftHSMv2): software HSM
- [step-ca](https://smallstep.com/docs/step-ca): private certificate authority

### Comply: health and quality

- [HAPI FHIR](https://hapifhir.io/): HL7 FHIR server in Java
- [NextGen Connect (Mirth)](https://github.com/nextgenhealthcare/connect): healthcare integration engine
- [ERPNext](https://frappe.io/erpnext): ERP with quality and manufacturing modules

### Verify: observability and validation

- [OpenObserve](https://openobserve.ai/): logs, metrics and traces
- [OpenSearch](https://opensearch.org/): search and analytics
- [Grafana](https://grafana.com/): dashboards
- [Prometheus](https://prometheus.io/): metrics and time series
- [Jaeger](https://www.jaegertracing.io/): distributed tracing
- [restic](https://restic.net/): backups
- [Velero](https://velero.io/): backup and migration for Kubernetes

### Verify: security validation

- [MITRE ATT&CK Navigator](https://mitre-attack.github.io/attack-navigator/): explore the ATT&CK matrix
- [Caldera](https://caldera.mitre.org/): adversary emulation
- [Atomic Red Team](https://www.atomicredteam.io/): small, portable detection tests
- [OpenSCAP](https://www.open-scap.org/): SCAP scanning
- [Lynis](https://cisofy.com/lynis/): Linux and Unix auditing

### Prove: integrity and provenance

- [in-toto](https://in-toto.io/): supply-chain integrity framework
- [Sigstore](https://www.sigstore.dev/): signing and verifying software artifacts
- [Trillian](https://github.com/google/trillian): verifiable data store
- [OpenLineage](https://openlineage.io/): open standard for data lineage
- [Marquez](https://marquezproject.ai/): lineage metadata collection and display

## The demo stack

`reference-implementation/` holds a Docker Compose file that starts PostgreSQL, OpenObserve, Prometheus and Grafana, plus six small Express services written for the demo:

| Service | Port | What it does, as built |
|---|---|---|
| `landing` | 3030 | A status page that pings each service and starts or stops the simulator |
| `fir` | 3032 | A minimal case tracker (it is not the open-source FIR project) with five seeded demo cases; needs PostgreSQL |
| `simulator` | internal | Emits a repeating 0 to 99 test signal, one event shape, and uploads 24 hours of history in batches of 500 |
| `anomaly` | 3035 | Polls the simulator every second, flags values whose z-score against an exponential moving average passes a threshold (default 1.5), exposes Prometheus metrics, and can open a case in the tracker |
| `erp-adapter` | 3040 | Forwards posted JSON events to OpenObserve, rate-limited |
| `erp-bridge` | 3041 (mes profile) | Polls ERPNext for Work Orders changed in the last minute, de-duplicates them with SHA-256, and forwards status changes to OpenObserve |

Prometheus scrapes only the anomaly service, and Grafana provisions one dashboard with three panels of anomaly counts. An optional `mes` profile adds ERPNext v15.17.0 with MariaDB, Redis and nginx.

### Start it

```bash
cd reference-implementation
cp env.example .env
docker compose up --build -d
```

Then open the status page at http://localhost:3030, OpenObserve at http://localhost:3031, the case tracker at http://localhost:3032 and Grafana at http://localhost:3033. The demo logins are in `env.example`; a FAQ page at http://127.0.0.1:3034 lists them and is published on the loopback address only. Change every password before any shared use.

The ERPNext profile (`docker compose --profile mes up -d`) needs a hosts-file entry for `site.local` and amd64 images. It was not run in October 2026, and its port mapping needs care (see the limits).

### Run the services without Docker

Each Node service starts on its own with `npm ci` and `node server.js` in its folder, with the ports and URLs from `env.example`. The anomaly service, event relay, ERPNext poller, status page and simulator were each started this way on October 2, 2026 and answered `/healthz`. The case tracker needs PostgreSQL first.

Two small test scripts exist. `npm run test:lite` in `erp-bridge/` checks the poller's health endpoints. `npm run test:lite` in `erp-adapter/` checks the relay's readiness and rate limit; it needs the relay running and OpenObserve (or a stand-in that answers 200 on the ingest path) reachable.

### The proof script

`scripts/prove_batch.js` hashes a Work Order record as RFC 8785 canonical JSON with SHA-384 and posts the hash as a note on a demo case. With no ERP configured it hashes the fixture in `fixtures/`. For that fixture the script's hash matched an independent recomputation on October 2, 2026. Posting the note needs the case tracker and a service token.

## Limits

- The index is a reading list. Fifty-six of its 63 tools do not run in the demo.
- The stack was not run end to end on a Mac in October 2026. CI's stack job is the first full run.
- The case tracker's login tokens come from `Math.random` and travel in the URL. It is demo plumbing, never access control.
- The proof script stores an unsigned hash in an editable database row. Nothing signs it or anchors it elsewhere.
- The event relay never reads from or writes to an ERP; "simulated mode" means `ERP_URL` is unset.
- The poller's case trigger is a status named `QC_FAIL`, which is not one of ERPNext v15's eight Work Order statuses, so it cannot fire on a stock ERPNext.
- The `mes` profile mixes a pinned ERPNext image with three companion images last updated in 2023, and `env.example` gives `erp_frontend` and `erp_nginx` the same host port.
- The FAQ page prints the demo logins to anyone who can reach port 3034 on the host.
- Nothing here is specific to healthcare, defense or any other sector. The one industry example is the ERPNext Work Order flow.
