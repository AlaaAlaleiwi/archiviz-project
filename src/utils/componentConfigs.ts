export type FieldType = "text" | "select" | "multiselect" | "toggle" | "number" | "password";

export interface ConfigField {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  default?: string | string[] | boolean | number;
  placeholder?: string;
  hint?: string;
}

export interface ComponentConfigSchema {
  fields: ConfigField[];
}

const configs: Record<string, ComponentConfigSchema> = {

  // ── SERVICES ──────────────────────────────────────────────────────────────

  notification_service: {
    fields: [
      { key: "channels",       label: "Delivery Channels",  type: "multiselect", options: ["Email", "SMS", "Push", "In-app"],               default: ["Email"],      required: true, hint: "Which channels this service dispatches through" } as any,
      { key: "email_provider", label: "Email Provider",     type: "select",      options: ["SMTP", "SendGrid", "Mailgun", "Amazon SES"],      default: "SMTP" },
      { key: "sms_provider",   label: "SMS Provider",       type: "select",      options: ["Twilio", "Vonage", "AWS SNS"],                    default: "Twilio" },
      { key: "push_provider",  label: "Push Provider",      type: "select",      options: ["Firebase FCM", "Apple APNs", "OneSignal"],        default: "Firebase FCM" },
    ],
  },

  email_service: {
    fields: [
      { key: "provider",    label: "Email Provider",  type: "select", options: ["SMTP", "SendGrid", "Mailgun", "Amazon SES", "Postmark"], default: "SMTP" },
      { key: "from_name",   label: "Default Sender",  type: "text",   placeholder: "My App <no-reply@example.com>" },
      { key: "templates",   label: "Template Engine", type: "select", options: ["Handlebars", "Mustache", "EJS", "Pug", "None"],          default: "Handlebars" },
    ],
  },

  payment_service: {
    fields: [
      { key: "provider",      label: "Payment Provider",  type: "select",      options: ["Stripe", "PayPal", "Braintree", "Square", "Adyen"], default: "Stripe" },
      { key: "currencies",    label: "Currencies",        type: "multiselect", options: ["USD", "EUR", "GBP", "JPY", "CAD", "AUD"],          default: ["USD"] } as any,
      { key: "webhooks",      label: "Webhook Events",    type: "toggle",      default: true,  hint: "Handle provider webhook callbacks" },
      { key: "subscriptions", label: "Subscriptions",     type: "toggle",      default: false, hint: "Support recurring billing plans" },
    ],
  },

  auth: {
    fields: [
      { key: "strategy",       label: "Auth Strategy",    type: "multiselect", options: ["JWT", "Session", "API Key", "OAuth2", "SAML"],    default: ["JWT"] } as any,
      { key: "oauth_providers",label: "OAuth Providers",  type: "multiselect", options: ["Google", "GitHub", "Facebook", "Apple", "Twitter"], default: [] } as any,
      { key: "mfa",            label: "MFA",              type: "toggle",      default: false, hint: "Multi-factor authentication (TOTP/SMS)" },
      { key: "token_expiry",   label: "Access Token TTL", type: "select",      options: ["5m", "15m", "30m", "1h", "24h"],                  default: "15m" },
    ],
  },

  worker: {
    fields: [
      { key: "concurrency",  label: "Concurrency",      type: "number", default: 5,   placeholder: "5",   hint: "Parallel jobs processed at once" },
      { key: "max_retries",  label: "Max Retries",      type: "number", default: 3,   placeholder: "3" },
      { key: "backoff",      label: "Retry Backoff",    type: "select", options: ["Exponential", "Linear", "Fixed"], default: "Exponential" },
      { key: "dead_letter",  label: "Dead-Letter Queue",type: "toggle", default: true, hint: "Move failed jobs to DLQ after max retries" },
    ],
  },

  scheduler: {
    fields: [
      { key: "timezone",    label: "Timezone",          type: "select", options: ["UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Tokyo", "Asia/Singapore"], default: "UTC" },
      { key: "lock_store",  label: "Distributed Lock",  type: "select", options: ["None", "Redis", "Database"], default: "None", hint: "Prevent duplicate runs across multiple instances" },
    ],
  },

  websocket_gateway: {
    fields: [
      { key: "rooms",       label: "Room Support",     type: "toggle", default: true,  hint: "Enable multi-room broadcast" },
      { key: "auth",        label: "Authenticate WS",  type: "toggle", default: true,  hint: "Verify JWT on connection handshake" },
      { key: "heartbeat",   label: "Heartbeat (ms)",   type: "number", default: 30000, placeholder: "30000" },
      { key: "transport",   label: "Transport",        type: "multiselect", options: ["WebSocket", "Polling"], default: ["WebSocket"] } as any,
    ],
  },

  rate_limiter: {
    fields: [
      { key: "strategy",     label: "Algorithm",       type: "select", options: ["Sliding Window", "Token Bucket", "Fixed Window", "Leaky Bucket"], default: "Sliding Window" },
      { key: "window_ms",    label: "Window (ms)",     type: "number", default: 60000,  placeholder: "60000" },
      { key: "max_requests", label: "Max Requests",    type: "number", default: 100,    placeholder: "100" },
      { key: "key_by",       label: "Identify By",     type: "select", options: ["IP", "User ID", "API Key", "IP + Route"], default: "IP" },
      { key: "store",        label: "State Store",     type: "select", options: ["Redis", "In-memory", "Database"], default: "Redis" },
    ],
  },

  // ── DATA STORES ───────────────────────────────────────────────────────────

  database: {
    fields: [
      { key: "engine",      label: "Database Engine",  type: "select", options: ["PostgreSQL", "MySQL", "MariaDB", "SQL Server", "Oracle"], default: "PostgreSQL" },
      { key: "orm",         label: "ORM / Access",     type: "select", options: ["Spring Data JPA", "jOOQ", "Spring Data JDBC", "Raw SQL"], default: "Spring Data JPA" },
      { key: "pool_max",    label: "Max Pool Size",    type: "number", default: 10, placeholder: "10" },
      { key: "migrations",  label: "Flyway Migrations",type: "toggle", default: true },
    ],
  },

  sql_database: {
    fields: [
      { key: "engine",    label: "Engine",      type: "select", options: ["PostgreSQL", "MySQL", "MariaDB", "SQL Server", "Oracle"], default: "PostgreSQL" },
      { key: "orm",       label: "ORM",         type: "select", options: ["Spring Data JPA", "jOOQ", "Spring Data JDBC", "Hibernate (native)"], default: "Spring Data JPA" },
      { key: "pool_max",  label: "Max Pool",    type: "number", default: 10 },
      { key: "ssl",       label: "SSL/TLS",     type: "toggle", default: true },
    ],
  },

  nosql_database: {
    fields: [
      { key: "engine",   label: "Engine",        type: "select", options: ["MongoDB", "DynamoDB", "Cassandra", "Couchbase", "Redis"], default: "MongoDB" },
      { key: "driver",   label: "Driver / SDK",  type: "select", options: ["Spring Data MongoDB", "Spring Data DynamoDB", "Spring Data Cassandra", "Spring Data Redis", "Native Driver"], default: "Spring Data MongoDB" },
      { key: "indexes",  label: "Auto Indexes",  type: "toggle", default: true },
    ],
  },

  cache: {
    fields: [
      { key: "engine",       label: "Cache Engine",    type: "select", options: ["Redis", "Memcached", "DragonflyDB", "In-memory"], default: "Redis" },
      { key: "default_ttl",  label: "Default TTL (s)", type: "number", default: 300, placeholder: "300" },
      { key: "strategy",     label: "Eviction Policy", type: "select", options: ["LRU", "LFU", "FIFO", "No eviction"], default: "LRU" },
      { key: "cluster",      label: "Cluster Mode",    type: "toggle", default: false },
    ],
  },

  object_storage: {
    fields: [
      { key: "provider",   label: "Storage Provider",  type: "select", options: ["AWS S3", "Google Cloud Storage", "Azure Blob", "MinIO", "Cloudflare R2"], default: "AWS S3" },
      { key: "cdn",        label: "CDN",               type: "toggle", default: false, hint: "Serve assets via CDN (CloudFront, etc.)" },
      { key: "signed_urls",label: "Signed URLs",       type: "toggle", default: true,  hint: "Pre-sign download links for private access" },
      { key: "versioning", label: "Versioning",        type: "toggle", default: false },
    ],
  },

  search_engine: {
    fields: [
      { key: "engine",     label: "Search Engine",  type: "select", options: ["Elasticsearch", "OpenSearch", "Typesense", "Algolia", "Meilisearch"], default: "Elasticsearch" },
      { key: "fuzzy",      label: "Fuzzy Search",   type: "toggle", default: true },
      { key: "highlight",  label: "Highlighting",   type: "toggle", default: true },
      { key: "facets",     label: "Facets / Filters",type: "toggle", default: false },
    ],
  },

  // ── MESSAGING ────────────────────────────────────────────────────────────

  queue: {
    fields: [
      { key: "engine",     label: "Queue Engine",   type: "select", options: ["BullMQ (Redis)", "RabbitMQ", "Amazon SQS", "Azure Service Bus", "Google Pub/Sub"], default: "BullMQ (Redis)" },
      { key: "concurrency",label: "Concurrency",    type: "number", default: 5 },
      { key: "dlq",        label: "Dead-Letter",    type: "toggle", default: true },
      { key: "priority",   label: "Job Priority",   type: "toggle", default: false },
    ],
  },

  message_broker: {
    fields: [
      { key: "engine",      label: "Broker",         type: "select", options: ["Apache Kafka", "RabbitMQ", "NATS", "Apache Pulsar", "Amazon MSK"], default: "Apache Kafka" },
      { key: "delivery",    label: "Delivery",       type: "select", options: ["At-least-once", "At-most-once", "Exactly-once"], default: "At-least-once" },
      { key: "partitions",  label: "Partitions",     type: "number", default: 3 },
      { key: "schema_reg",  label: "Schema Registry",type: "toggle", default: false, hint: "Avro/Protobuf schema validation" },
    ],
  },

  event_bus: {
    fields: [
      { key: "scope",    label: "Scope",          type: "select", options: ["In-process", "Distributed (Redis)", "Distributed (Kafka)"], default: "In-process" },
      { key: "async",    label: "Async Handlers", type: "toggle", default: true },
      { key: "replay",   label: "Event Replay",   type: "toggle", default: false, hint: "Persist events and allow replaying" },
    ],
  },

  stream_processor: {
    fields: [
      { key: "engine",        label: "Stream Engine",    type: "select", options: ["Apache Kafka", "AWS Kinesis", "Google Pub/Sub", "Apache Flink", "Spark Streaming"], default: "Apache Kafka" },
      { key: "batch_size",    label: "Batch Size",       type: "number", default: 100 },
      { key: "window_type",   label: "Window Type",      type: "select", options: ["Tumbling", "Sliding", "Session", "None"], default: "None" },
      { key: "checkpointing", label: "Checkpointing",    type: "toggle", default: true },
    ],
  },

  // ── INFRASTRUCTURE ────────────────────────────────────────────────────────

  api_gateway: {
    fields: [
      { key: "auth",         label: "Auth Middleware",    type: "toggle", default: true },
      { key: "rate_limit",   label: "Rate Limiting",      type: "toggle", default: true },
      { key: "cors",         label: "CORS",               type: "toggle", default: true },
      { key: "ssl_term",     label: "SSL Termination",    type: "toggle", default: true },
      { key: "routing",      label: "Routing Strategy",   type: "select", options: ["Path-based", "Host-based", "Header-based"], default: "Path-based" },
    ],
  },

  load_balancer: {
    fields: [
      { key: "strategy",      label: "Algorithm",       type: "select", options: ["Round Robin", "Least Connections", "IP Hash", "Weighted", "Random"], default: "Round Robin" },
      { key: "health_check",  label: "Health Checks",   type: "toggle", default: true },
      { key: "sticky",        label: "Sticky Sessions", type: "toggle", default: false },
      { key: "ssl",           label: "SSL Passthrough", type: "toggle", default: false },
    ],
  },

  reverse_proxy: {
    fields: [
      { key: "engine",   label: "Proxy Engine",   type: "select", options: ["Nginx", "Caddy", "Traefik", "HAProxy", "Custom"], default: "Nginx" },
      { key: "caching",  label: "Response Cache", type: "toggle", default: false },
      { key: "compress", label: "Compression",    type: "toggle", default: true },
      { key: "ssl",      label: "SSL/TLS",        type: "toggle", default: true },
    ],
  },

  config_service: {
    fields: [
      { key: "source",   label: "Config Source",  type: "select", options: ["Environment variables", "AWS AppConfig", "HashiCorp Consul", "Azure App Config", "Vault"], default: "Environment variables" },
      { key: "hot_reload",label: "Hot Reload",    type: "toggle", default: false, hint: "Re-read config without restarting" },
      { key: "encrypt",  label: "Encrypted Values",type: "toggle",default: false },
    ],
  },

  secrets_manager: {
    fields: [
      { key: "provider",   label: "Provider",        type: "select", options: ["AWS Secrets Manager", "HashiCorp Vault", "Azure Key Vault", "GCP Secret Manager", "Doppler"], default: "AWS Secrets Manager" },
      { key: "cache_ttl",  label: "Cache TTL (s)",   type: "number", default: 300, hint: "Cache secrets locally to reduce API calls" },
      { key: "auto_rotate",label: "Auto Rotation",   type: "toggle", default: false },
    ],
  },

  logging_service: {
    fields: [
      { key: "level",    label: "Log Level",     type: "select",      options: ["debug", "info", "warn", "error"],                                default: "info" },
      { key: "format",   label: "Format",        type: "select",      options: ["JSON", "Plain text"],                                            default: "JSON" },
      { key: "outputs",  label: "Output Targets",type: "multiselect", options: ["Console", "File", "Elasticsearch", "CloudWatch", "Datadog", "Loki"], default: ["Console"] } as any,
    ],
  },

  monitoring_service: {
    fields: [
      { key: "backends", label: "Metrics Backend", type: "multiselect", options: ["Prometheus", "Datadog", "CloudWatch", "Grafana Cloud", "New Relic"], default: ["Prometheus"] } as any,
      { key: "health",   label: "Health Endpoint", type: "toggle",      default: true },
      { key: "alerts",   label: "Alerting",        type: "toggle",      default: false, hint: "Configure alert rules and notification channels" },
    ],
  },

  tracing_service: {
    fields: [
      { key: "provider",    label: "Tracing Backend",  type: "select", options: ["Jaeger", "Zipkin", "Tempo / OTLP", "AWS X-Ray", "Datadog APM", "Honeycomb"], default: "Jaeger" },
      { key: "sample_rate", label: "Sample Rate (%)",  type: "number", default: 10, placeholder: "10", hint: "% of traces to record (100 = all)" },
      { key: "propagation", label: "Context Propagation", type: "select", options: ["W3C TraceContext", "B3", "Jaeger"], default: "W3C TraceContext" },
    ],
  },

  file_service: {
    fields: [
      { key: "max_mb",        label: "Max File Size (MB)", type: "number",      default: 10 },
      { key: "allowed_types", label: "Allowed MIME Types", type: "multiselect", options: ["image/*", "application/pdf", "video/*", "audio/*", "text/*", "application/zip"], default: ["image/*", "application/pdf"] } as any,
      { key: "virus_scan",    label: "Virus Scanning",     type: "toggle",      default: false },
      { key: "image_resize",  label: "Auto Image Resize",  type: "toggle",      default: false },
    ],
  },

  grpc_service: {
    fields: [
      { key: "reflection",   label: "Server Reflection",  type: "toggle", default: true,  hint: "Enable gRPC reflection for tooling" },
      { key: "tls",          label: "mTLS",               type: "toggle", default: false, hint: "Mutual TLS for service-to-service auth" },
      { key: "keepalive",    label: "Keepalive",          type: "toggle", default: true },
      { key: "max_msg_size", label: "Max Message (MB)",   type: "number", default: 4 },
    ],
  },

  microservice: {
    fields: [
      { key: "pattern",   label: "Architecture Pattern", type: "select", options: ["Layered (N-tier)", "Hexagonal / Ports & Adapters", "CQRS", "Event-sourced", "Clean Architecture"], default: "Layered (N-tier)" },
      { key: "health",    label: "Health Endpoint",      type: "toggle", default: true },
      { key: "container", label: "Containerised",        type: "toggle", default: true },
    ],
  },

};

export function getComponentConfig(type: string): ComponentConfigSchema | null {
  return configs[type] ?? null;
}

export function hasConfig(type: string): boolean {
  return type in configs;
}

/** Produce a human-readable summary of config values for display on the node */
export function summarizeConfig(config: Record<string, unknown>): string {
  return Object.entries(config)
    .filter(([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0))
    .map(([, v]) => (Array.isArray(v) ? v.join(" · ") : String(v)))
    .slice(0, 3)
    .join("  ·  ");
}

/** Format node config as a prompt-friendly string */
export function formatConfigForPrompt(schema: ComponentConfigSchema, config: Record<string, unknown>): string {
  return schema.fields
    .filter(f => config[f.key] !== undefined && config[f.key] !== null && config[f.key] !== "")
    .map(f => {
      const v = config[f.key];
      return `  - ${f.label}: ${Array.isArray(v) ? v.join(", ") : String(v)}`;
    })
    .join("\n");
}
