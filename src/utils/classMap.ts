export type ClassRole =
  | "controller"
  | "service"
  | "repository"
  | "gateway"
  | "model"
  | "middleware"
  | "config"
  | "worker"
  | "queue";

export type ClassNode = {
  abbr: string;
  label: string;
  role: ClassRole;
};

export const ROLE_COLOR: Record<ClassRole, string> = {
  controller: "#60a5fa",  // blue
  service:    "#34d399",  // green
  repository: "#f59e0b",  // amber
  gateway:    "#a78bfa",  // purple
  model:      "#f97316",  // orange
  middleware: "#ec4899",  // pink
  config:     "#94a3b8",  // slate
  worker:     "#06b6d4",  // cyan
  queue:      "#8b5cf6",  // violet
};

const CLASS_MAPS: Record<string, ClassNode[]> = {
  // ── BACKEND ────────────────────────────────────────────────────────────────
  api: [
    { abbr: "Ctrl",  label: "Controller",   role: "controller" },
    { abbr: "Svc",   label: "Service",       role: "service"    },
    { abbr: "Repo",  label: "Repository",    role: "repository" },
  ],
  microservice: [
    { abbr: "Ctrl",  label: "Controller",   role: "controller" },
    { abbr: "Svc",   label: "Service",       role: "service"    },
    { abbr: "Repo",  label: "Repository",    role: "repository" },
  ],
  auth: [
    { abbr: "Ctrl",  label: "AuthController", role: "controller" },
    { abbr: "Svc",   label: "AuthService",    role: "service"    },
    { abbr: "JWT",   label: "JwtService",     role: "config"     },
  ],
  database: [
    { abbr: "Repo",  label: "Repository",    role: "repository" },
    { abbr: "Ent",   label: "Entity/Model",  role: "model"      },
    { abbr: "Mig",   label: "Migration",     role: "config"     },
  ],
  sql_database: [
    { abbr: "Repo",  label: "Repository",    role: "repository" },
    { abbr: "Ent",   label: "Entity",        role: "model"      },
    { abbr: "Mig",   label: "Migration",     role: "config"     },
  ],
  nosql_database: [
    { abbr: "Repo",  label: "Repository",    role: "repository" },
    { abbr: "Scm",   label: "Schema/Model",  role: "model"      },
  ],
  cache: [
    { abbr: "Svc",   label: "CacheService",  role: "service"    },
    { abbr: "Cli",   label: "CacheClient",   role: "gateway"    },
  ],
  queue: [
    { abbr: "Q",     label: "Queue",         role: "queue"      },
    { abbr: "Wkr",   label: "Worker",        role: "worker"     },
    { abbr: "DLQ",   label: "DeadLetter",    role: "config"     },
  ],
  worker: [
    { abbr: "Wkr",   label: "Worker",        role: "worker"     },
    { abbr: "Hdl",   label: "JobHandler",    role: "service"    },
  ],
  scheduler: [
    { abbr: "Sch",   label: "Scheduler",     role: "worker"     },
    { abbr: "Task",  label: "TaskRunner",    role: "service"    },
  ],
  websocket_gateway: [
    { abbr: "Gw",    label: "WsGateway",     role: "gateway"    },
    { abbr: "Hdl",   label: "EventHandler",  role: "service"    },
    { abbr: "Rm",    label: "RoomManager",   role: "service"    },
  ],
  api_gateway: [
    { abbr: "Gw",    label: "Gateway",       role: "gateway"    },
    { abbr: "Auth",  label: "AuthMiddleware",role: "middleware"  },
    { abbr: "Prx",   label: "Proxy",         role: "service"    },
  ],
  grpc_service: [
    { abbr: "Srv",   label: "GrpcServer",    role: "gateway"    },
    { abbr: "Svc",   label: "ServiceImpl",   role: "service"    },
    { abbr: "Proto", label: "ProtoSchema",   role: "config"     },
  ],
  notification_service: [
    { abbr: "Svc",   label: "NotifService",  role: "service"    },
    { abbr: "Adp",   label: "ChannelAdapter",role: "gateway"    },
  ],
  email_service: [
    { abbr: "Svc",   label: "EmailService",  role: "service"    },
    { abbr: "Tmpl",  label: "Templates",     role: "config"     },
    { abbr: "Prv",   label: "SmtpProvider",  role: "gateway"    },
  ],
  payment_service: [
    { abbr: "Svc",   label: "PaymentService",role: "service"    },
    { abbr: "Prv",   label: "ProviderAdpt",  role: "gateway"    },
    { abbr: "Wh",    label: "WebhookHdl",    role: "controller" },
  ],
  file_service: [
    { abbr: "Svc",   label: "FileService",   role: "service"    },
    { abbr: "Str",   label: "StorageAdpt",   role: "gateway"    },
  ],
  rate_limiter: [
    { abbr: "Mw",    label: "RateLimitMw",   role: "middleware"  },
    { abbr: "Str",   label: "LimitStore",    role: "repository" },
  ],
  message_broker: [
    { abbr: "Pub",   label: "Publisher",     role: "gateway"    },
    { abbr: "Sub",   label: "Subscriber",    role: "worker"     },
    { abbr: "Hdl",   label: "MsgHandler",    role: "service"    },
  ],
  event_bus: [
    { abbr: "Bus",   label: "EventBus",      role: "gateway"    },
    { abbr: "Pub",   label: "Publisher",     role: "service"    },
    { abbr: "Sub",   label: "Subscriber",    role: "worker"     },
  ],
  stream_processor: [
    { abbr: "Cns",   label: "Consumer",      role: "worker"     },
    { abbr: "Proc",  label: "Processor",     role: "service"    },
    { abbr: "Snk",   label: "Sink",          role: "gateway"    },
  ],
  object_storage: [
    { abbr: "Svc",   label: "StorageService",role: "service"    },
    { abbr: "Adp",   label: "ProviderAdpt",  role: "gateway"    },
  ],
  search_engine: [
    { abbr: "Svc",   label: "SearchService", role: "service"    },
    { abbr: "Idx",   label: "Indexer",       role: "worker"     },
    { abbr: "Cli",   label: "SearchClient",  role: "gateway"    },
  ],
  reverse_proxy: [
    { abbr: "Prx",   label: "ProxyServer",   role: "gateway"    },
    { abbr: "Cfg",   label: "RouteConfig",   role: "config"     },
  ],
  load_balancer: [
    { abbr: "LB",    label: "LoadBalancer",  role: "gateway"    },
    { abbr: "HC",    label: "HealthChecker", role: "worker"     },
  ],
  config_service: [
    { abbr: "Cfg",   label: "ConfigService", role: "config"     },
    { abbr: "Src",   label: "ConfigSource",  role: "gateway"    },
  ],
  secrets_manager: [
    { abbr: "Svc",   label: "SecretsService",role: "service"    },
    { abbr: "Prv",   label: "VaultProvider", role: "gateway"    },
  ],
  logging_service: [
    { abbr: "Log",   label: "Logger",        role: "service"    },
    { abbr: "Fmt",   label: "Formatter",     role: "config"     },
    { abbr: "Out",   label: "OutputSink",    role: "gateway"    },
  ],
  monitoring_service: [
    { abbr: "Col",   label: "Collector",     role: "worker"     },
    { abbr: "Exp",   label: "Exporter",      role: "gateway"    },
  ],
  tracing_service: [
    { abbr: "Tr",    label: "Tracer",        role: "service"    },
    { abbr: "Exp",   label: "SpanExporter",  role: "gateway"    },
  ],

};

export function getClassMap(nodeType: string): ClassNode[] | null {
  return CLASS_MAPS[nodeType] ?? null;
}
