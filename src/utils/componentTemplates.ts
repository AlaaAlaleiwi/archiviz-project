import type { Language } from "../types";

export type ComponentTemplate = {
  summary: string;
  exposes: string[];
  envVars: string[];
  scaffold: Partial<Record<Language, string>>;
};

// ─────────────────────────────────────────────────────────────────────────────
// BACKEND TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

const backend: Record<string, ComponentTemplate> = {

  api: {
    summary: "REST API controller — maps HTTP routes to domain service calls and returns structured JSON responses.",
    exposes: ["getRouter(): Router", "GET /health", "CRUD endpoints for the domain entity"],
    envVars: ["PORT", "API_PREFIX"],
    scaffold: {
      typescript: `
import { Router, Request, Response, NextFunction } from 'express';

export interface IDomainService {
  findAll(): Promise<unknown[]>;
  findById(id: string): Promise<unknown | null>;
  create(data: unknown): Promise<unknown>;
  update(id: string, data: unknown): Promise<unknown>;
  delete(id: string): Promise<void>;
}

export class ApiController {
  readonly router = Router();
  constructor(private readonly svc: IDomainService) { this.registerRoutes(); }

  private registerRoutes() {
    this.router.get('/health', this.health.bind(this));
    this.router.get('/', this.list.bind(this));
    this.router.post('/', this.create.bind(this));
    this.router.get('/:id', this.getById.bind(this));
    this.router.put('/:id', this.update.bind(this));
    this.router.delete('/:id', this.remove.bind(this));
  }

  private async health(_req: Request, res: Response) {
    res.json({ status: 'ok', ts: new Date().toISOString() });
  }
  private async list(_req: Request, res: Response, next: NextFunction) {
    try { res.json({ data: await this.svc.findAll() }); } catch (e) { next(e); }
  }
  private async create(req: Request, res: Response, next: NextFunction) {
    try { res.status(201).json({ data: await this.svc.create(req.body) }); } catch (e) { next(e); }
  }
  private async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await this.svc.findById(req.params.id);
      item ? res.json({ data: item }) : res.status(404).json({ error: 'Not found' });
    } catch (e) { next(e); }
  }
  private async update(req: Request, res: Response, next: NextFunction) {
    try { res.json({ data: await this.svc.update(req.params.id, req.body) }); } catch (e) { next(e); }
  }
  private async remove(req: Request, res: Response, next: NextFunction) {
    try { await this.svc.delete(req.params.id); res.status(204).send(); } catch (e) { next(e); }
  }
}
`.trim(),
      python: `
from fastapi import APIRouter, HTTPException
from typing import Any, List

router = APIRouter(prefix="/api", tags=["api"])

@router.get("/health")
async def health() -> dict: return {"status": "ok"}

@router.get("/", response_model=List[Any])
async def list_items(): ...  # call domain service

@router.post("/", status_code=201)
async def create_item(body: Any): ...

@router.get("/{item_id}")
async def get_item(item_id: str): ...  # raise HTTPException(404) if missing

@router.put("/{item_id}")
async def update_item(item_id: str, body: Any): ...

@router.delete("/{item_id}", status_code=204)
async def delete_item(item_id: str): ...
`.trim(),
      java: `
@RestController @RequestMapping("/api") @RequiredArgsConstructor
public class ApiController {
    private final DomainService service;

    @GetMapping("/health")
    public Map<String,Object> health() { return Map.of("status","ok"); }

    @GetMapping           public List<?>   list()                                { return service.findAll(); }
    @PostMapping          public Object    create(@RequestBody Object b)         { return service.create(b); }
    @GetMapping("/{id}")  public Object    getById(@PathVariable String id)      { return service.findById(id).orElseThrow(); }
    @PutMapping("/{id}")  public Object    update(@PathVariable String id, @RequestBody Object b) { return service.update(id, b); }
    @DeleteMapping("/{id}") public void    delete(@PathVariable String id)       { service.delete(id); }
}
`.trim(),
    },
  },

  api_gateway: {
    summary: "Single entry point that authenticates requests, applies rate limiting, and proxies traffic to downstream services.",
    exposes: ["proxy(req, res): void", "addRoute(pattern, upstream): void"],
    envVars: ["PORT", "UPSTREAM_SERVICES", "JWT_SECRET"],
    scaffold: {
      typescript: `
import http from 'http';
import { createProxyMiddleware } from 'http-proxy-middleware';
import express, { Request, Response, NextFunction } from 'express';

type RouteConfig = { pattern: string; target: string };

export class ApiGateway {
  private app = express();
  private routes: RouteConfig[] = [];

  constructor(private readonly port = Number(process.env.PORT ?? 8080)) {
    this.app.use(this.authenticate.bind(this));
  }

  addRoute(pattern: string, target: string): this {
    this.routes.push({ pattern, target });
    this.app.use(pattern, createProxyMiddleware({ target, changeOrigin: true }));
    return this;
  }

  private authenticate(req: Request, res: Response, next: NextFunction) {
    // TODO: validate JWT from Authorization header, attach req.user, call next()
    next();
  }

  listen() { http.createServer(this.app).listen(this.port); }
}
`.trim(),
      python: `
from fastapi import FastAPI, Request
import httpx

app = FastAPI()
ROUTES: dict[str, str] = {}  # pattern -> upstream URL

def register_route(pattern: str, upstream: str):
    ROUTES[pattern] = upstream

@app.api_route("/{path:path}", methods=["GET","POST","PUT","DELETE","PATCH"])
async def proxy(request: Request, path: str):
    for pattern, upstream in ROUTES.items():
        if path.startswith(pattern.lstrip("/")):
            async with httpx.AsyncClient() as client:
                resp = await client.request(
                    method=request.method,
                    url=f"{upstream}/{path}",
                    content=await request.body(),
                    headers=dict(request.headers),
                )
            return resp.json()
    return {"error": "no route matched"}
`.trim(),
    },
  },

  microservice: {
    summary: "Self-contained service owning a single bounded context, with its own HTTP router, business logic, and data layer.",
    exposes: ["start(): Promise<void>", "stop(): Promise<void>", "getRouter(): Router"],
    envVars: ["PORT", "DATABASE_URL", "SERVICE_NAME"],
    scaffold: {
      typescript: `
import express from 'express';
import type { Server } from 'http';

export class Microservice {
  private app  = express();
  private server?: Server;

  constructor(private readonly port = Number(process.env.PORT ?? 3000)) {
    this.app.use(express.json());
    this.registerRoutes();
  }

  private registerRoutes() {
    this.app.get('/health', (_req, res) => res.json({ status: 'ok' }));
    // TODO: mount domain-specific routers
  }

  async start(): Promise<void> {
    this.server = this.app.listen(this.port);
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      this.server?.close(err => err ? reject(err) : resolve())
    );
  }

  getRouter() { return this.app; }
}
`.trim(),
      python: `
import uvicorn
from fastapi import FastAPI

app = FastAPI()

@app.get("/health")
async def health(): return {"status": "ok"}

# Register domain routers below:
# app.include_router(domain_router, prefix="/domain")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(__import__('os').getenv("PORT", 3000)))
`.trim(),
    },
  },

  worker: {
    summary: "Background processor that pulls jobs from a queue, executes them with retry logic, and reports outcomes.",
    exposes: ["start(): Promise<void>", "stop(): Promise<void>", "processJob(job): Promise<void>"],
    envVars: ["QUEUE_URL", "WORKER_CONCURRENCY", "MAX_RETRIES"],
    scaffold: {
      typescript: `
export interface Job { id: string; type: string; payload: unknown; attempts: number; }
export interface IQueue { dequeue(): Promise<Job | null>; ack(id: string): Promise<void>; nack(id: string): Promise<void>; }

export class Worker {
  private running = false;

  constructor(
    private readonly queue: IQueue,
    private readonly concurrency = Number(process.env.WORKER_CONCURRENCY ?? 5),
    private readonly maxRetries = Number(process.env.MAX_RETRIES ?? 3),
  ) {}

  async start(): Promise<void> {
    this.running = true;
    const slots = Array.from({ length: this.concurrency }, () => this.loop());
    await Promise.all(slots);
  }

  stop(): void { this.running = false; }

  private async loop(): Promise<void> {
    while (this.running) {
      const job = await this.queue.dequeue();
      if (!job) { await this.sleep(1000); continue; }
      await this.safeProcess(job);
    }
  }

  private async safeProcess(job: Job): Promise<void> {
    try {
      await this.processJob(job);
      await this.queue.ack(job.id);
    } catch (err) {
      job.attempts >= this.maxRetries
        ? await this.queue.ack(job.id)   // dead-letter
        : await this.queue.nack(job.id); // re-queue
    }
  }

  async processJob(job: Job): Promise<void> {
    // TODO: switch on job.type and dispatch to handlers
    throw new Error(\`Unknown job type: \${job.type}\`);
  }

  private sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
}
`.trim(),
      python: `
import asyncio, os
from dataclasses import dataclass

@dataclass
class Job:
    id: str
    type: str
    payload: dict
    attempts: int = 0

class Worker:
    def __init__(self, queue, concurrency: int = int(os.getenv("WORKER_CONCURRENCY", 5))):
        self.queue = queue
        self.concurrency = concurrency
        self._running = False

    async def start(self):
        self._running = True
        await asyncio.gather(*[self._loop() for _ in range(self.concurrency)])

    def stop(self): self._running = False

    async def _loop(self):
        while self._running:
            job = await self.queue.dequeue()
            if job is None: await asyncio.sleep(1); continue
            await self._safe_process(job)

    async def _safe_process(self, job: Job):
        try:
            await self.process_job(job)
            await self.queue.ack(job.id)
        except Exception:
            await self.queue.nack(job.id)

    async def process_job(self, job: Job):
        raise NotImplementedError(f"Unknown job type: {job.type}")
`.trim(),
    },
  },

  scheduler: {
    summary: "Cron-based task runner that executes registered jobs on configured schedules with error isolation.",
    exposes: ["register(name, cron, fn): void", "start(): void", "stop(): void"],
    envVars: ["TZ"],
    scaffold: {
      typescript: `
import cron from 'node-cron';

type TaskFn = () => Promise<void>;
type TaskEntry = { name: string; expression: string; fn: TaskFn; task?: cron.ScheduledTask };

export class Scheduler {
  private tasks: TaskEntry[] = [];

  register(name: string, expression: string, fn: TaskFn): this {
    this.tasks.push({ name, expression, fn });
    return this;
  }

  start(): void {
    for (const entry of this.tasks) {
      entry.task = cron.schedule(entry.expression, () =>
        entry.fn().catch(err => console.error(\`[scheduler] \${entry.name} failed:\`, err))
      );
    }
  }

  stop(): void {
    for (const entry of this.tasks) entry.task?.destroy();
  }
}
`.trim(),
      python: `
from apscheduler.schedulers.asyncio import AsyncIOScheduler

scheduler = AsyncIOScheduler()

def register(cron_expr: str, name: str):
    """Decorator: @register('0 * * * *', 'hourly-sync')"""
    def decorator(fn):
        scheduler.add_job(fn, 'cron', **_parse(cron_expr), id=name, replace_existing=True)
        return fn
    return decorator

def _parse(expr: str) -> dict:
    minute, hour, dom, month, dow = expr.split()
    return dict(minute=minute, hour=hour, day=dom, month=month, day_of_week=dow)

scheduler.start()
`.trim(),
    },
  },

  auth: {
    summary: "Authentication service — handles login, token issuance (JWT), token refresh, logout, and auth middleware.",
    exposes: ["login(credentials): Promise<TokenPair>", "refresh(token): Promise<TokenPair>", "middleware(): RequestHandler", "verify(token): JwtPayload"],
    envVars: ["JWT_SECRET", "JWT_EXPIRES_IN", "REFRESH_SECRET", "REFRESH_EXPIRES_IN"],
    scaffold: {
      typescript: `
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

export interface TokenPair { accessToken: string; refreshToken: string; }
export interface JwtPayload { sub: string; email: string; roles: string[]; iat?: number; exp?: number; }
export interface IUserStore { findByEmail(email: string): Promise<{ id: string; email: string; passwordHash: string; roles: string[] } | null>; }
export interface IHasher { verify(plain: string, hash: string): Promise<boolean>; }

export class AuthService {
  private readonly secret  = process.env.JWT_SECRET!;
  private readonly refresh = process.env.REFRESH_SECRET!;

  constructor(private readonly users: IUserStore, private readonly hasher: IHasher) {}

  async login(email: string, password: string): Promise<TokenPair> {
    const user = await this.users.findByEmail(email);
    if (!user || !(await this.hasher.verify(password, user.passwordHash)))
      throw Object.assign(new Error('Invalid credentials'), { status: 401 });
    return this.issue({ sub: user.id, email: user.email, roles: user.roles });
  }

  verify(token: string): JwtPayload { return jwt.verify(token, this.secret) as JwtPayload; }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const payload = jwt.verify(refreshToken, this.refresh) as JwtPayload;
    return this.issue({ sub: payload.sub, email: payload.email, roles: payload.roles });
  }

  middleware() {
    return (req: Request & { user?: JwtPayload }, _res: Response, next: NextFunction) => {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return next(Object.assign(new Error('Unauthorized'), { status: 401 }));
      try { req.user = this.verify(token); next(); } catch { next(Object.assign(new Error('Invalid token'), { status: 401 })); }
    };
  }

  private issue(payload: Omit<JwtPayload, 'iat' | 'exp'>): TokenPair {
    return {
      accessToken:  jwt.sign(payload, this.secret,  { expiresIn: process.env.JWT_EXPIRES_IN     ?? '15m' }),
      refreshToken: jwt.sign(payload, this.refresh, { expiresIn: process.env.REFRESH_EXPIRES_IN ?? '7d'  }),
    };
  }
}
`.trim(),
      python: `
import os, jwt as pyjwt
from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext

SECRET  = os.getenv("JWT_SECRET", "change-me")
REFRESH = os.getenv("REFRESH_SECRET", "change-me-r")
pwd_ctx = CryptContext(schemes=["bcrypt"])

def create_tokens(subject: str, roles: list[str]) -> dict:
    now = datetime.now(timezone.utc)
    access  = pyjwt.encode({"sub": subject, "roles": roles, "exp": now + timedelta(minutes=15)}, SECRET)
    refresh = pyjwt.encode({"sub": subject, "exp": now + timedelta(days=7)}, REFRESH)
    return {"access_token": access, "refresh_token": refresh}

def verify_token(token: str) -> dict:
    return pyjwt.decode(token, SECRET, algorithms=["HS256"])

async def login(email: str, password: str, user_store) -> dict:
    user = await user_store.find_by_email(email)
    if not user or not pwd_ctx.verify(password, user["password_hash"]):
        raise ValueError("Invalid credentials")
    return create_tokens(user["id"], user.get("roles", []))
`.trim(),
    },
  },

  websocket_gateway: {
    summary: "WebSocket server that manages client connections, rooms, and bidirectional real-time message delivery.",
    exposes: ["broadcast(room, event, data): void", "emit(clientId, event, data): void", "on(event, handler): void"],
    envVars: ["WS_PORT", "WS_HEARTBEAT_MS"],
    scaffold: {
      typescript: `
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';

type ClientId = string;
type Handler = (clientId: ClientId, data: unknown) => void;

export class WebSocketGateway {
  private wss: WebSocketServer;
  private clients = new Map<ClientId, WebSocket>();
  private rooms   = new Map<string, Set<ClientId>>();
  private handlers = new Map<string, Handler>();

  constructor(port = Number(process.env.WS_PORT ?? 3001)) {
    this.wss = new WebSocketServer({ port });
    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
  }

  on(event: string, handler: Handler): this { this.handlers.set(event, handler); return this; }

  join(clientId: ClientId, room: string) {
    if (!this.rooms.has(room)) this.rooms.set(room, new Set());
    this.rooms.get(room)!.add(clientId);
  }

  broadcast(room: string, event: string, data: unknown) {
    const payload = JSON.stringify({ event, data });
    for (const cid of this.rooms.get(room) ?? []) this.clients.get(cid)?.send(payload);
  }

  emit(clientId: ClientId, event: string, data: unknown) {
    this.clients.get(clientId)?.send(JSON.stringify({ event, data }));
  }

  private handleConnection(ws: WebSocket, _req: IncomingMessage) {
    const id = crypto.randomUUID();
    this.clients.set(id, ws);
    ws.on('message', raw => {
      try {
        const { event, data } = JSON.parse(raw.toString());
        this.handlers.get(event)?.(id, data);
      } catch {}
    });
    ws.on('close', () => { this.clients.delete(id); });
  }
}
`.trim(),
    },
  },

  grpc_service: {
    summary: "gRPC service implementing a protobuf-defined interface for high-performance inter-service communication.",
    exposes: ["getServiceDefinition(): ServiceDefinition", "start(port): void"],
    envVars: ["GRPC_PORT"],
    scaffold: {
      typescript: `
import * as grpc from '@grpc/grpc-js';

// Implement the service handlers matching your .proto definition.
// Each method receives (call, callback) where call.request is the typed request.

export type ServiceImpl = Record<string, grpc.handleUnaryCall<any, any>>;

export function createServer(impl: ServiceImpl, protoDescriptor: grpc.ServiceDefinition): grpc.Server {
  const server = new grpc.Server();
  server.addService(protoDescriptor, impl);
  return server;
}

export function startServer(server: grpc.Server, port = process.env.GRPC_PORT ?? '50051'): void {
  server.bindAsync(\`0.0.0.0:\${port}\`, grpc.ServerCredentials.createInsecure(), (err) => {
    if (err) throw err;
    server.start();
  });
}

// Example handler shape:
// const impl: ServiceImpl = {
//   GetUser: (call, cb) => cb(null, { id: call.request.id, name: 'Alice' }),
// };
`.trim(),
    },
  },

  // ──────────────── DATA STORES ────────────────

  database: {
    summary: "Generic data repository providing CRUD operations over a primary data store.",
    exposes: ["findById(id): Promise<T|null>", "findAll(filter?): Promise<T[]>", "create(data): Promise<T>", "update(id, data): Promise<T>", "delete(id): Promise<void>"],
    envVars: ["DATABASE_URL"],
    scaffold: {
      typescript: `
export interface Repository<T, CreateDTO = Partial<T>, UpdateDTO = Partial<T>> {
  findById(id: string): Promise<T | null>;
  findAll(filter?: Partial<T>): Promise<T[]>;
  create(data: CreateDTO): Promise<T>;
  update(id: string, data: UpdateDTO): Promise<T>;
  delete(id: string): Promise<void>;
}

// Base implementation — extend per entity:
export abstract class BaseRepository<T extends { id: string }> implements Repository<T> {
  abstract findById(id: string): Promise<T | null>;
  abstract findAll(filter?: Partial<T>): Promise<T[]>;
  abstract create(data: unknown): Promise<T>;
  abstract update(id: string, data: unknown): Promise<T>;
  abstract delete(id: string): Promise<void>;
}
`.trim(),
      python: `
from typing import TypeVar, Generic, Optional, Any
from abc import ABC, abstractmethod

T = TypeVar("T")

class Repository(ABC, Generic[T]):
    @abstractmethod
    async def find_by_id(self, id: str) -> Optional[T]: ...
    @abstractmethod
    async def find_all(self, filter: dict = {}) -> list[T]: ...
    @abstractmethod
    async def create(self, data: dict) -> T: ...
    @abstractmethod
    async def update(self, id: str, data: dict) -> T: ...
    @abstractmethod
    async def delete(self, id: str) -> None: ...
`.trim(),
    },
  },

  sql_database: {
    summary: "SQL relational database layer with connection pooling, migrations, and typed ORM queries.",
    exposes: ["query(sql, params): Promise<Row[]>", "transaction(fn): Promise<T>", "Repository<T> interface"],
    envVars: ["DATABASE_URL", "DB_POOL_MIN", "DB_POOL_MAX"],
    scaffold: {
      typescript: `
import { Pool, PoolClient } from 'pg';

export class SqlDatabase {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      min:  Number(process.env.DB_POOL_MIN ?? 2),
      max:  Number(process.env.DB_POOL_MAX ?? 10),
    });
  }

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    const { rows } = await this.pool.query(sql, params);
    return rows as T[];
  }

  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async close() { await this.pool.end(); }
}
`.trim(),
      python: `
import os
from contextlib import asynccontextmanager
import asyncpg

class SqlDatabase:
    def __init__(self):
        self._pool = None

    async def connect(self):
        self._pool = await asyncpg.create_pool(os.getenv("DATABASE_URL"), min_size=2, max_size=10)

    async def query(self, sql: str, *args) -> list:
        async with self._pool.acquire() as conn:
            return await conn.fetch(sql, *args)

    @asynccontextmanager
    async def transaction(self):
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                yield conn

    async def close(self): await self._pool.close()
`.trim(),
    },
  },

  nosql_database: {
    summary: "Document/key-value store with schema-flexible persistence and collection-level operations.",
    exposes: ["findOne(filter): Promise<Doc|null>", "find(filter): Promise<Doc[]>", "insertOne(doc): Promise<Doc>", "updateOne(filter, update): Promise<Doc>", "deleteOne(filter): Promise<void>"],
    envVars: ["MONGO_URI", "MONGO_DB_NAME"],
    scaffold: {
      typescript: `
import { MongoClient, Collection, Db, Filter, UpdateFilter, ObjectId } from 'mongodb';

export type Doc = Record<string, unknown> & { _id?: ObjectId };

export class NoSqlDatabase {
  private client: MongoClient;
  private db!: Db;

  constructor(private readonly uri = process.env.MONGO_URI!, private readonly dbName = process.env.MONGO_DB_NAME!) {
    this.client = new MongoClient(this.uri);
  }

  async connect() { await this.client.connect(); this.db = this.client.db(this.dbName); }
  async close()   { await this.client.close(); }

  collection<T extends Doc = Doc>(name: string): Collection<T> { return this.db.collection<T>(name); }

  async findOne<T extends Doc>(col: string, filter: Filter<T>): Promise<T | null> {
    return this.collection<T>(col).findOne(filter);
  }
  async find<T extends Doc>(col: string, filter: Filter<T> = {}): Promise<T[]> {
    return this.collection<T>(col).find(filter).toArray();
  }
  async insertOne<T extends Doc>(col: string, doc: T): Promise<T> {
    const result = await this.collection<T>(col).insertOne(doc as any);
    return { ...doc, _id: result.insertedId };
  }
  async updateOne<T extends Doc>(col: string, filter: Filter<T>, update: UpdateFilter<T>): Promise<void> {
    await this.collection<T>(col).updateOne(filter, update);
  }
  async deleteOne<T extends Doc>(col: string, filter: Filter<T>): Promise<void> {
    await this.collection<T>(col).deleteOne(filter);
  }
}
`.trim(),
    },
  },

  cache: {
    summary: "In-memory cache (Redis-backed) providing fast get/set/delete with TTL support.",
    exposes: ["get<T>(key): Promise<T|null>", "set(key, value, ttlSec?): Promise<void>", "delete(key): Promise<void>", "flush(): Promise<void>"],
    envVars: ["REDIS_URL", "CACHE_DEFAULT_TTL"],
    scaffold: {
      typescript: `
import { createClient, RedisClientType } from 'redis';

export interface ICache {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSec?: number): Promise<void>;
  delete(key: string): Promise<void>;
  flush(): Promise<void>;
}

export class RedisCache implements ICache {
  private client: RedisClientType;
  private defaultTtl = Number(process.env.CACHE_DEFAULT_TTL ?? 300);

  constructor(url = process.env.REDIS_URL!) {
    this.client = createClient({ url }) as RedisClientType;
  }

  async connect() { await this.client.connect(); }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async set(key: string, value: unknown, ttlSec = this.defaultTtl): Promise<void> {
    await this.client.set(key, JSON.stringify(value), { EX: ttlSec });
  }

  async delete(key: string): Promise<void> { await this.client.del(key); }
  async flush(): Promise<void>             { await this.client.flushDb(); }
}
`.trim(),
      python: `
import os, json
import redis.asyncio as aioredis
from typing import Any, Optional

class RedisCache:
    def __init__(self, url: str = os.getenv("REDIS_URL", "redis://localhost:6379")):
        self.client = aioredis.from_url(url, decode_responses=True)
        self.default_ttl = int(os.getenv("CACHE_DEFAULT_TTL", 300))

    async def get(self, key: str) -> Optional[Any]:
        raw = await self.client.get(key)
        return json.loads(raw) if raw else None

    async def set(self, key: str, value: Any, ttl: int | None = None) -> None:
        await self.client.set(key, json.dumps(value), ex=ttl or self.default_ttl)

    async def delete(self, key: str) -> None: await self.client.delete(key)
    async def flush(self) -> None:            await self.client.flushdb()
`.trim(),
    },
  },

  object_storage: {
    summary: "Blob/file storage abstraction (S3-compatible) for uploading, downloading, and managing binary assets.",
    exposes: ["upload(key, body, mime): Promise<string>", "download(key): Promise<Buffer>", "getSignedUrl(key, expiresIn): Promise<string>", "delete(key): Promise<void>"],
    envVars: ["S3_BUCKET", "S3_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "S3_ENDPOINT"],
    scaffold: {
      typescript: `
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

export class ObjectStorage {
  private s3: S3Client;
  private bucket = process.env.S3_BUCKET!;

  constructor() {
    this.s3 = new S3Client({
      region:   process.env.S3_REGION ?? 'us-east-1',
      endpoint: process.env.S3_ENDPOINT,
    });
  }

  async upload(key: string, body: Buffer | Readable, contentType: string): Promise<string> {
    await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
    return \`s3://\${this.bucket}/\${key}\`;
  }

  async download(key: string): Promise<Buffer> {
    const { Body } = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await (Body as Readable).read());
  }

  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn });
  }

  async delete(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
`.trim(),
    },
  },

  search_engine: {
    summary: "Full-text search and indexing service (Elasticsearch-backed) for querying documents by relevance.",
    exposes: ["index(id, doc): Promise<void>", "search(query, options?): Promise<SearchResult[]>", "delete(id): Promise<void>"],
    envVars: ["ELASTICSEARCH_URL", "SEARCH_INDEX"],
    scaffold: {
      typescript: `
import { Client } from '@elastic/elasticsearch';

export interface SearchResult { id: string; score: number; source: unknown; }

export class SearchEngine {
  private client: Client;
  private index = process.env.SEARCH_INDEX ?? 'default';

  constructor(url = process.env.ELASTICSEARCH_URL!) {
    this.client = new Client({ node: url });
  }

  async index(id: string, doc: Record<string, unknown>): Promise<void> {
    await this.client.index({ index: this.index, id, document: doc });
  }

  async search(query: string, options: { size?: number; from?: number } = {}): Promise<SearchResult[]> {
    const { hits } = await this.client.search({
      index: this.index,
      body: { query: { multi_match: { query, fields: ['*'] } } },
      size: options.size ?? 10,
      from: options.from ?? 0,
    });
    return hits.hits.map(h => ({ id: h._id!, score: h._score!, source: h._source }));
  }

  async delete(id: string): Promise<void> {
    await this.client.delete({ index: this.index, id });
  }
}
`.trim(),
    },
  },

  queue: {
    summary: "Job queue for asynchronous task buffering — producers enqueue jobs, workers dequeue and process them.",
    exposes: ["enqueue(type, payload, opts?): Promise<string>", "dequeue(): Promise<Job|null>", "ack(id): Promise<void>", "nack(id): Promise<void>"],
    envVars: ["QUEUE_URL", "QUEUE_NAME"],
    scaffold: {
      typescript: `
import Bull, { Queue as BullQueue, Job } from 'bull';

export type JobData = { type: string; payload: unknown };

export class JobQueue {
  private queue: BullQueue<JobData>;

  constructor(name = process.env.QUEUE_NAME ?? 'jobs', redisUrl = process.env.QUEUE_URL!) {
    this.queue = new Bull(name, redisUrl);
  }

  async enqueue(type: string, payload: unknown, opts?: Bull.JobOptions): Promise<string> {
    const job = await this.queue.add({ type, payload }, { attempts: 3, backoff: 'exponential', ...opts });
    return String(job.id);
  }

  /** Register a processor — Bull handles concurrency and ack/nack internally. */
  process(concurrency: number, handler: (job: Job<JobData>) => Promise<void>): void {
    this.queue.process(concurrency, handler);
  }

  async close() { await this.queue.close(); }
}
`.trim(),
      python: `
import os
from rq import Queue
from redis import Redis

redis_conn = Redis.from_url(os.getenv("QUEUE_URL", "redis://localhost:6379"))
q = Queue(os.getenv("QUEUE_NAME", "default"), connection=redis_conn)

def enqueue(fn, *args, **kwargs) -> str:
    """Enqueue a function for background execution. Returns job id."""
    job = q.enqueue(fn, *args, **kwargs)
    return job.id
`.trim(),
    },
  },

  message_broker: {
    summary: "Durable message broker with publish/subscribe semantics, topic routing, and at-least-once delivery.",
    exposes: ["publish(topic, message): Promise<void>", "subscribe(topic, handler): Promise<void>", "unsubscribe(topic): Promise<void>"],
    envVars: ["BROKER_URL", "BROKER_CLIENT_ID"],
    scaffold: {
      typescript: `
import { Kafka, Producer, Consumer, EachMessagePayload } from 'kafkajs';

type MessageHandler = (message: unknown) => Promise<void>;

export class MessageBroker {
  private kafka: Kafka;
  private producer!: Producer;
  private consumers: Consumer[] = [];

  constructor(brokers = (process.env.BROKER_URL ?? 'localhost:9092').split(','), clientId = process.env.BROKER_CLIENT_ID ?? 'app') {
    this.kafka = new Kafka({ clientId, brokers });
  }

  async connect(): Promise<void> {
    this.producer = this.kafka.producer();
    await this.producer.connect();
  }

  async publish(topic: string, message: unknown): Promise<void> {
    await this.producer.send({ topic, messages: [{ value: JSON.stringify(message) }] });
  }

  async subscribe(topic: string, handler: MessageHandler, groupId = \`\${topic}-group\`): Promise<void> {
    const consumer = this.kafka.consumer({ groupId });
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: false });
    await consumer.run({
      eachMessage: async ({ message }: EachMessagePayload) => {
        const value = message.value ? JSON.parse(message.value.toString()) : null;
        await handler(value);
      },
    });
    this.consumers.push(consumer);
  }

  async disconnect(): Promise<void> {
    await this.producer?.disconnect();
    await Promise.all(this.consumers.map(c => c.disconnect()));
  }
}
`.trim(),
    },
  },

  event_bus: {
    summary: "In-process or distributed event bus for decoupled domain event publishing and subscription.",
    exposes: ["emit(event, payload): void", "on(event, handler): Unsubscribe", "once(event, handler): void"],
    envVars: [],
    scaffold: {
      typescript: `
type Handler<T = unknown> = (payload: T) => void | Promise<void>;
type Unsubscribe = () => void;

export class EventBus {
  private handlers = new Map<string, Set<Handler>>();

  on<T = unknown>(event: string, handler: Handler<T>): Unsubscribe {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler as Handler);
    return () => this.handlers.get(event)?.delete(handler as Handler);
  }

  once<T = unknown>(event: string, handler: Handler<T>): void {
    const wrapper: Handler<T> = (payload) => { handler(payload); this.handlers.get(event)?.delete(wrapper as Handler); };
    this.on(event, wrapper);
  }

  emit<T = unknown>(event: string, payload: T): void {
    for (const handler of this.handlers.get(event) ?? []) {
      Promise.resolve(handler(payload)).catch(err => console.error(\`[EventBus] \${event}:\`, err));
    }
  }
}

export const eventBus = new EventBus();
`.trim(),
    },
  },

  stream_processor: {
    summary: "Real-time stream consumer that reads events from a source, transforms them, and emits results.",
    exposes: ["start(): Promise<void>", "stop(): void", "process(record): Promise<void>"],
    envVars: ["STREAM_BROKER_URL", "STREAM_GROUP_ID", "STREAM_TOPIC_IN", "STREAM_TOPIC_OUT"],
    scaffold: {
      typescript: `
import { Kafka, Consumer, Producer } from 'kafkajs';

export abstract class StreamProcessor {
  protected consumer!: Consumer;
  protected producer!: Producer;

  constructor(private readonly kafka: Kafka) {}

  async start(): Promise<void> {
    this.consumer = this.kafka.consumer({ groupId: process.env.STREAM_GROUP_ID! });
    this.producer = this.kafka.producer();
    await Promise.all([this.consumer.connect(), this.producer.connect()]);
    await this.consumer.subscribe({ topic: process.env.STREAM_TOPIC_IN! });
    await this.consumer.run({ eachMessage: async ({ message }) => {
      const record = JSON.parse(message.value?.toString() ?? 'null');
      await this.process(record);
    }});
  }

  /** Transform or handle a single record; call emit() to forward results. */
  abstract process(record: unknown): Promise<void>;

  protected async emit(data: unknown): Promise<void> {
    await this.producer.send({ topic: process.env.STREAM_TOPIC_OUT!, messages: [{ value: JSON.stringify(data) }] });
  }

  stop() { this.consumer.disconnect(); this.producer.disconnect(); }
}
`.trim(),
    },
  },

  notification_service: {
    summary: "Unified notification dispatcher supporting push, SMS, and in-app channels with templating.",
    exposes: ["send(channel, recipient, templateId, vars): Promise<void>", "sendPush(deviceToken, title, body): Promise<void>", "sendSms(to, text): Promise<void>"],
    envVars: ["FCM_API_KEY", "TWILIO_SID", "TWILIO_TOKEN", "TWILIO_FROM"],
    scaffold: {
      typescript: `
export interface IChannel { send(to: string, subject: string, body: string): Promise<void>; }

export class NotificationService {
  private channels: Record<string, IChannel> = {};

  register(name: string, channel: IChannel): this { this.channels[name] = channel; return this; }

  async send(channel: string, to: string, subject: string, body: string): Promise<void> {
    const ch = this.channels[channel];
    if (!ch) throw new Error(\`Unknown channel: \${channel}\`);
    await ch.send(to, subject, body);
  }

  async sendPush(deviceToken: string, title: string, body: string): Promise<void> {
    await this.send('push', deviceToken, title, body);
  }

  async sendSms(to: string, text: string): Promise<void> {
    await this.send('sms', to, '', text);
  }
}
`.trim(),
    },
  },

  email_service: {
    summary: "Transactional email sender with template rendering and delivery tracking.",
    exposes: ["send(to, subject, templateId, vars): Promise<void>", "sendRaw(to, subject, html): Promise<void>"],
    envVars: ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM"],
    scaffold: {
      typescript: `
import nodemailer from 'nodemailer';

export class EmailService {
  private transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  async sendRaw(to: string, subject: string, html: string): Promise<void> {
    await this.transporter.sendMail({ from: process.env.EMAIL_FROM, to, subject, html });
  }

  async send(to: string, subject: string, templateId: string, vars: Record<string, string>): Promise<void> {
    const html = this.renderTemplate(templateId, vars);
    await this.sendRaw(to, subject, html);
  }

  private renderTemplate(id: string, vars: Record<string, string>): string {
    // TODO: load template by id, replace {{key}} with vars[key]
    return Object.entries(vars).reduce((t, [k, v]) => t.replaceAll(\`{{\${k}}}\`, v), \`Template \${id}\`);
  }
}
`.trim(),
    },
  },

  payment_service: {
    summary: "Payment processor abstraction for creating charges, managing subscriptions, and issuing refunds.",
    exposes: ["createPaymentIntent(amount, currency, meta?): Promise<PaymentIntent>", "confirmPayment(intentId): Promise<PaymentResult>", "refund(chargeId, amount?): Promise<void>"],
    envVars: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    scaffold: {
      typescript: `
import Stripe from 'stripe';

export interface PaymentIntent { id: string; clientSecret: string; status: string; }
export interface PaymentResult { id: string; status: string; amount: number; }

export class PaymentService {
  private stripe: Stripe;

  constructor(apiKey = process.env.STRIPE_SECRET_KEY!) {
    this.stripe = new Stripe(apiKey, { apiVersion: '2023-10-16' });
  }

  async createPaymentIntent(amount: number, currency = 'usd', metadata: Record<string, string> = {}): Promise<PaymentIntent> {
    const intent = await this.stripe.paymentIntents.create({ amount, currency, metadata });
    return { id: intent.id, clientSecret: intent.client_secret!, status: intent.status };
  }

  async confirmPayment(intentId: string): Promise<PaymentResult> {
    const intent = await this.stripe.paymentIntents.confirm(intentId);
    return { id: intent.id, status: intent.status, amount: intent.amount };
  }

  async refund(chargeId: string, amount?: number): Promise<void> {
    await this.stripe.refunds.create({ charge: chargeId, ...(amount ? { amount } : {}) });
  }

  verifyWebhook(payload: string | Buffer, sig: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(payload, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  }
}
`.trim(),
    },
  },

  file_service: {
    summary: "File lifecycle manager — receives uploads, stores them (via ObjectStorage), and serves download links.",
    exposes: ["upload(file): Promise<FileRecord>", "getDownloadUrl(fileId): Promise<string>", "delete(fileId): Promise<void>"],
    envVars: ["MAX_FILE_SIZE_MB"],
    scaffold: {
      typescript: `
export interface FileRecord { id: string; name: string; mimeType: string; size: number; url: string; createdAt: Date; }
export interface IStorage { upload(key: string, body: Buffer, mime: string): Promise<string>; getSignedUrl(key: string): Promise<string>; delete(key: string): Promise<void>; }
export interface IFileRepo { save(record: FileRecord): Promise<FileRecord>; findById(id: string): Promise<FileRecord | null>; delete(id: string): Promise<void>; }

export class FileService {
  constructor(private readonly storage: IStorage, private readonly repo: IFileRepo) {}

  async upload(buffer: Buffer, name: string, mimeType: string): Promise<FileRecord> {
    const id  = crypto.randomUUID();
    const key = \`files/\${id}/\${name}\`;
    const url = await this.storage.upload(key, buffer, mimeType);
    return this.repo.save({ id, name, mimeType, size: buffer.length, url, createdAt: new Date() });
  }

  async getDownloadUrl(fileId: string): Promise<string> {
    const record = await this.repo.findById(fileId);
    if (!record) throw Object.assign(new Error('File not found'), { status: 404 });
    return this.storage.getSignedUrl(\`files/\${fileId}/\${record.name}\`);
  }

  async delete(fileId: string): Promise<void> {
    const record = await this.repo.findById(fileId);
    if (!record) return;
    await this.storage.delete(\`files/\${fileId}/\${record.name}\`);
    await this.repo.delete(fileId);
  }
}
`.trim(),
    },
  },

  rate_limiter: {
    summary: "Token-bucket / sliding-window rate limiter middleware protecting APIs from excessive traffic.",
    exposes: ["middleware(): RequestHandler", "check(key): Promise<{ allowed: boolean; remaining: number; resetAt: Date }>"],
    envVars: ["RATE_LIMIT_WINDOW_MS", "RATE_LIMIT_MAX"],
    scaffold: {
      typescript: `
import { Request, Response, NextFunction } from 'express';
import type { ICache } from './CacheService';

export class RateLimiter {
  private windowMs  = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
  private max       = Number(process.env.RATE_LIMIT_MAX       ?? 100);

  constructor(private readonly cache: ICache) {}

  async check(key: string): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
    const cacheKey = \`rl:\${key}\`;
    const current  = (await this.cache.get<number>(cacheKey)) ?? 0;
    const allowed  = current < this.max;
    if (allowed) await this.cache.set(cacheKey, current + 1, Math.ceil(this.windowMs / 1000));
    const resetAt  = new Date(Date.now() + this.windowMs);
    return { allowed, remaining: Math.max(0, this.max - current - 1), resetAt };
  }

  middleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      const key    = req.ip ?? 'unknown';
      const result = await this.check(key);
      res.set('X-RateLimit-Limit',     String(this.max));
      res.set('X-RateLimit-Remaining', String(result.remaining));
      res.set('X-RateLimit-Reset',     String(Math.floor(result.resetAt.getTime() / 1000)));
      result.allowed ? next() : res.status(429).json({ error: 'Too many requests' });
    };
  }
}
`.trim(),
    },
  },

  config_service: {
    summary: "Centralised runtime configuration provider supporting env vars, remote config stores, and hot-reload.",
    exposes: ["get<T>(key): T", "getOrThrow<T>(key): T", "reload(): Promise<void>"],
    envVars: ["CONFIG_SOURCE"],
    scaffold: {
      typescript: `
export class ConfigService {
  private store: Record<string, unknown> = {};

  constructor(initial: Record<string, unknown> = {}) {
    this.store = { ...process.env, ...initial };
  }

  get<T = string>(key: string, defaultValue?: T): T | undefined {
    return (this.store[key] as T) ?? defaultValue;
  }

  getOrThrow<T = string>(key: string): T {
    const value = this.store[key];
    if (value === undefined || value === null) throw new Error(\`Missing required config: \${key}\`);
    return value as T;
  }

  set(key: string, value: unknown): void { this.store[key] = value; }

  async reload(): Promise<void> {
    // TODO: fetch remote config (feature flags, database config, etc.) and merge into this.store
  }
}
`.trim(),
    },
  },

  secrets_manager: {
    summary: "Secure secret retrieval and caching layer backed by AWS Secrets Manager or Vault.",
    exposes: ["get(secretName): Promise<string>", "getJson<T>(secretName): Promise<T>"],
    envVars: ["AWS_REGION", "VAULT_ADDR", "VAULT_TOKEN"],
    scaffold: {
      typescript: `
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

export class SecretsManager {
  private client: SecretsManagerClient;
  private cache = new Map<string, { value: string; expiresAt: number }>();
  private cacheTtlMs = 5 * 60 * 1000; // 5 min

  constructor(region = process.env.AWS_REGION ?? 'us-east-1') {
    this.client = new SecretsManagerClient({ region });
  }

  async get(secretName: string): Promise<string> {
    const cached = this.cache.get(secretName);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const { SecretString } = await this.client.send(new GetSecretValueCommand({ SecretId: secretName }));
    const value = SecretString ?? '';
    this.cache.set(secretName, { value, expiresAt: Date.now() + this.cacheTtlMs });
    return value;
  }

  async getJson<T>(secretName: string): Promise<T> {
    return JSON.parse(await this.get(secretName)) as T;
  }
}
`.trim(),
    },
  },

  logging_service: {
    summary: "Structured logger with severity levels, contextual fields, and optional remote transport.",
    exposes: ["info(msg, meta?): void", "warn(msg, meta?): void", "error(msg, err?, meta?): void", "child(context): Logger"],
    envVars: ["LOG_LEVEL", "LOG_FORMAT"],
    scaffold: {
      typescript: `
type Level = 'debug' | 'info' | 'warn' | 'error';
type Meta  = Record<string, unknown>;

export class Logger {
  constructor(private readonly context: Meta = {}) {}

  child(extra: Meta): Logger { return new Logger({ ...this.context, ...extra }); }

  debug(msg: string, meta: Meta = {}) { this.write('debug', msg, meta); }
  info (msg: string, meta: Meta = {}) { this.write('info',  msg, meta); }
  warn (msg: string, meta: Meta = {}) { this.write('warn',  msg, meta); }
  error(msg: string, err?: unknown, meta: Meta = {}) {
    this.write('error', msg, { ...meta, error: err instanceof Error ? { message: err.message, stack: err.stack } : err });
  }

  private write(level: Level, msg: string, meta: Meta) {
    const entry = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...this.context, ...meta });
    (level === 'error' || level === 'warn') ? console.error(entry) : console.log(entry);
  }
}

export const logger = new Logger({ service: process.env.SERVICE_NAME ?? 'app' });
`.trim(),
    },
  },

  monitoring_service: {
    summary: "Health-check endpoint and metrics collector exposing Prometheus-compatible data and alerting hooks.",
    exposes: ["healthRouter: Router", "counter(name, labels?): Counter", "histogram(name, labels?): Histogram"],
    envVars: ["METRICS_PORT", "HEALTH_PATH"],
    scaffold: {
      typescript: `
import { Registry, Counter, Histogram, collectDefaultMetrics } from 'prom-client';
import { Router } from 'express';

export class MonitoringService {
  readonly registry = new Registry();
  readonly healthRouter = Router();

  constructor() {
    collectDefaultMetrics({ register: this.registry });
    this.healthRouter.get(process.env.HEALTH_PATH ?? '/health', (_req, res) => res.json({ status: 'ok' }));
    this.healthRouter.get('/metrics', async (_req, res) => {
      res.set('Content-Type', this.registry.contentType);
      res.end(await this.registry.metrics());
    });
  }

  counter(name: string, help: string, labelNames: string[] = []): Counter<string> {
    return new Counter({ name, help, labelNames, registers: [this.registry] });
  }

  histogram(name: string, help: string, labelNames: string[] = []): Histogram<string> {
    return new Histogram({ name, help, labelNames, registers: [this.registry] });
  }
}
`.trim(),
    },
  },

  tracing_service: {
    summary: "Distributed tracing integration (OpenTelemetry) that instruments HTTP and DB calls with spans.",
    exposes: ["startSpan(name, attrs?): Span", "middleware(): RequestHandler"],
    envVars: ["OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_SERVICE_NAME"],
    scaffold: {
      typescript: `
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { trace, Tracer } from '@opentelemetry/api';

export class TracingService {
  private sdk: NodeSDK;
  private tracer!: Tracer;

  constructor() {
    this.sdk = new NodeSDK({
      resource: new Resource({ [SemanticResourceAttributes.SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'app' }),
      traceExporter: new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT }),
    });
  }

  start() { this.sdk.start(); this.tracer = trace.getTracer(process.env.OTEL_SERVICE_NAME ?? 'app'); }

  startSpan(name: string, attrs: Record<string, string> = {}) {
    const span = this.tracer.startSpan(name);
    Object.entries(attrs).forEach(([k, v]) => span.setAttribute(k, v));
    return span;
  }
}
`.trim(),
    },
  },

  reverse_proxy: {
    summary: "HTTP reverse proxy that routes incoming requests to upstream services based on path/host rules.",
    exposes: ["addUpstream(pattern, target): void", "listen(port): void"],
    envVars: ["PROXY_PORT"],
    scaffold: {
      typescript: `
import express from 'express';
import { createProxyMiddleware, Options } from 'http-proxy-middleware';

export class ReverseProxy {
  private app = express();

  addUpstream(pathPattern: string, target: string, options: Partial<Options> = {}): this {
    this.app.use(pathPattern, createProxyMiddleware({ target, changeOrigin: true, ...options }));
    return this;
  }

  listen(port = Number(process.env.PROXY_PORT ?? 80)): void {
    this.app.listen(port);
  }
}
`.trim(),
    },
  },

  load_balancer: {
    summary: "Round-robin load balancer that distributes requests across a pool of upstream instances.",
    exposes: ["addInstance(url): void", "next(): string", "middleware(): RequestHandler"],
    envVars: ["LB_PORT"],
    scaffold: {
      typescript: `
import { createProxyMiddleware } from 'http-proxy-middleware';
import express, { Request, Response, NextFunction } from 'express';

export class LoadBalancer {
  private instances: string[] = [];
  private idx = 0;
  private app = express();

  addInstance(url: string): this { this.instances.push(url); return this; }

  next(): string {
    if (!this.instances.length) throw new Error('No upstream instances registered');
    const url = this.instances[this.idx % this.instances.length];
    this.idx++;
    return url;
  }

  middleware() {
    return (_req: Request, _res: Response, next: NextFunction) => {
      const target = this.next();
      createProxyMiddleware({ target, changeOrigin: true })(_req, _res, next);
    };
  }

  listen(port = Number(process.env.LB_PORT ?? 80)) { this.app.use(this.middleware()); this.app.listen(port); }
}
`.trim(),
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// FRONTEND TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

const frontend: Record<string, ComponentTemplate> = {

  frontend_app: {
    summary: "Root application shell — mounts the router, global providers, and top-level layout.",
    exposes: ["<App />"],
    envVars: ["VITE_API_BASE_URL"],
    scaffold: {
      typescript: `
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { AppRouter } from './router/AppRouter';
import { AuthProvider } from './auth/AuthProvider';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
`.trim(),
    },
  },

  router: {
    summary: "Client-side router defining all application routes with lazy loading and auth guards.",
    exposes: ["<AppRouter />", "useNavigateTo(route): fn"],
    envVars: [],
    scaffold: {
      typescript: `
import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';

const Dashboard = lazy(() => import('../pages/DashboardPage'));
const Login     = lazy(() => import('../pages/LoginPage'));

export function AppRouter() {
  return (
    <Suspense fallback={<div>Loading…</div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/"          element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
`.trim(),
    },
  },

  state_store: {
    summary: "Global client state store (Zustand/Redux) managing shared application state and actions.",
    exposes: ["useStore(): State & Actions", "store.getState(): State", "store.dispatch(action): void"],
    envVars: [],
    scaffold: {
      typescript: `
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

// Extend State and Actions with your domain fields:
interface State {
  user: { id: string; email: string } | null;
  loading: boolean;
}

interface Actions {
  setUser(user: State['user']): void;
  setLoading(v: boolean): void;
  reset(): void;
}

const initialState: State = { user: null, loading: false };

export const useStore = create<State & Actions>()(
  devtools(
    persist(
      (set) => ({
        ...initialState,
        setUser:    (user)    => set({ user }),
        setLoading: (loading) => set({ loading }),
        reset:      ()        => set(initialState),
      }),
      { name: 'app-store' }
    )
  )
);
`.trim(),
    },
  },

  client_api: {
    summary: "Typed HTTP client wrapping fetch/axios calls to the backend API with auth header injection.",
    exposes: ["get<T>(path): Promise<T>", "post<T>(path, body): Promise<T>", "put<T>(path, body): Promise<T>", "del(path): Promise<void>"],
    envVars: ["VITE_API_BASE_URL"],
    scaffold: {
      typescript: `
const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = localStorage.getItem('access_token');
  const res = await fetch(\`\${BASE}\${path}\`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: \`Bearer \${token}\` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw Object.assign(new Error(res.statusText), { status: res.status });
  return res.status === 204 ? (undefined as T) : res.json();
}

export const apiClient = {
  get:  <T>(path: string)                 => request<T>('GET',    path),
  post: <T>(path: string, body: unknown)  => request<T>('POST',   path, body),
  put:  <T>(path: string, body: unknown)  => request<T>('PUT',    path, body),
  del:      (path: string)                => request<void>('DELETE', path),
};
`.trim(),
    },
  },

  auth_ui: {
    summary: "Login and signup UI — collects credentials, calls the auth API, stores tokens, and redirects.",
    exposes: ["<LoginPage />", "<SignupPage />", "useAuth(): { user, login, logout, signup }"],
    envVars: [],
    scaffold: {
      typescript: `
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/apiClient';
import { useStore } from '../store/useStore';

export function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const setUser = useStore(s => s.setUser);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const { accessToken, user } = await apiClient.post<{ accessToken: string; user: any }>('/auth/login', { email, password });
      localStorage.setItem('access_token', accessToken);
      setUser(user);
      navigate('/dashboard');
    } catch {
      setError('Invalid credentials');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input type="email"    value={email}    onChange={e => setEmail(e.target.value)}    required />
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
      {error && <p>{error}</p>}
      <button type="submit">Log in</button>
    </form>
  );
}
`.trim(),
    },
  },

  dashboard_page: {
    summary: "Analytics overview page displaying key metrics, charts, and recent activity.",
    exposes: ["<DashboardPage />"],
    envVars: [],
    scaffold: {
      typescript: `
import { useEffect, useState } from 'react';
import { apiClient } from '../api/apiClient';

interface DashboardStats { totalUsers: number; activeToday: number; revenue: number; }

export function DashboardPage() {
  const [stats, setStats]   = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get<DashboardStats>('/dashboard/stats')
      .then(setStats)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading…</p>;

  return (
    <main>
      <h1>Dashboard</h1>
      <section className="stats-grid">
        <StatCard label="Total Users"  value={stats?.totalUsers ?? 0} />
        <StatCard label="Active Today" value={stats?.activeToday ?? 0} />
        <StatCard label="Revenue"      value={stats?.revenue ?? 0} prefix="$" />
      </section>
      {/* TODO: add charts and recent activity list */}
    </main>
  );
}

function StatCard({ label, value, prefix = '' }: { label: string; value: number; prefix?: string }) {
  return <div className="stat-card"><p>{label}</p><h2>{prefix}{value.toLocaleString()}</h2></div>;
}
`.trim(),
    },
  },

  form_module: {
    summary: "Reusable form with field-level validation, submission state, and error display.",
    exposes: ["<Form fields onSubmit /> ", "useForm(schema): { values, errors, handleChange, handleSubmit }"],
    envVars: [],
    scaffold: {
      typescript: `
import { useState } from 'react';

type FieldDef = { name: string; label: string; type?: string; required?: boolean };
type OnSubmit = (values: Record<string, string>) => Promise<void>;

export function Form({ fields, onSubmit }: { fields: FieldDef[]; onSubmit: OnSubmit }) {
  const [values, setValues]   = useState<Record<string, string>>(() => Object.fromEntries(fields.map(f => [f.name, ''])));
  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [submitting, setSub]  = useState(false);

  const validate = () => {
    const errs: Record<string, string> = {};
    for (const f of fields) if (f.required && !values[f.name]) errs[f.name] = \`\${f.label} is required\`;
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSub(true);
    try { await onSubmit(values); } finally { setSub(false); }
  };

  return (
    <form onSubmit={handleSubmit}>
      {fields.map(f => (
        <div key={f.name}>
          <label>{f.label}</label>
          <input
            type={f.type ?? 'text'}
            value={values[f.name]}
            onChange={e => setValues(v => ({ ...v, [f.name]: e.target.value }))}
          />
          {errors[f.name] && <span>{errors[f.name]}</span>}
        </div>
      ))}
      <button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Submit'}</button>
    </form>
  );
}
`.trim(),
    },
  },

  data_table: {
    summary: "Sortable, filterable data table with pagination and optional row-level actions.",
    exposes: ["<DataTable columns data onSort onPage />"],
    envVars: [],
    scaffold: {
      typescript: `
import { useState } from 'react';

export interface Column<T> { key: keyof T; label: string; sortable?: boolean; render?: (row: T) => React.ReactNode; }

interface Props<T> {
  columns: Column<T>[];
  data:    T[];
  pageSize?: number;
}

export function DataTable<T extends { id: string }>({ columns, data, pageSize = 20 }: Props<T>) {
  const [sortKey, setSortKey]   = useState<keyof T | null>(null);
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('asc');
  const [page, setPage]         = useState(0);

  const sorted = sortKey ? [...data].sort((a, b) => {
    const [av, bv] = [a[sortKey], b[sortKey]];
    return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
  }) : data;

  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  const toggleSort = (key: keyof T) => {
    setSortKey(key);
    setSortDir(d => (sortKey === key && d === 'asc') ? 'desc' : 'asc');
  };

  return (
    <>
      <table>
        <thead><tr>{columns.map(c => (
          <th key={String(c.key)} onClick={() => c.sortable && toggleSort(c.key)} style={{ cursor: c.sortable ? 'pointer' : 'default' }}>
            {c.label}{sortKey === c.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
          </th>
        ))}</tr></thead>
        <tbody>{paged.map(row => (
          <tr key={row.id}>{columns.map(c => <td key={String(c.key)}>{c.render ? c.render(row) : String(row[c.key] ?? '')}</td>)}</tr>
        ))}</tbody>
      </table>
      <div>
        <button onClick={() => setPage(p => p - 1)} disabled={page === 0}>Prev</button>
        <span>Page {page + 1} of {Math.ceil(data.length / pageSize)}</span>
        <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * pageSize >= data.length}>Next</button>
      </div>
    </>
  );
}
`.trim(),
    },
  },

  hooks_layer: {
    summary: "Collection of reusable React hooks encapsulating data fetching, side effects, and shared logic.",
    exposes: ["useQuery<T>(key, fetcher)", "useMutation<T>(fn)", "useDebounce(value, delay)", "useLocalStorage(key, default)"],
    envVars: [],
    scaffold: {
      typescript: `
import { useState, useEffect, useCallback, useRef } from 'react';

// ── Data fetching ──────────────────────────────
export function useQuery<T>(key: string, fetcher: () => Promise<T>) {
  const [data, setData]     = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetcher()
      .then(d => { if (active) { setData(d); setError(null); } })
      .catch(e => { if (active) setError(e); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [key]);

  return { data, loading, error };
}

// ── Mutation ───────────────────────────────────
export function useMutation<T, V = void>(fn: (vars: V) => Promise<T>) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<Error | null>(null);

  const mutate = useCallback(async (vars: V): Promise<T> => {
    setLoading(true); setError(null);
    try { return await fn(vars); }
    catch (e) { setError(e as Error); throw e; }
    finally { setLoading(false); }
  }, [fn]);

  return { mutate, loading, error };
}

// ── Debounce ───────────────────────────────────
export function useDebounce<T>(value: T, delayMs: number): T {
  const [dv, setDv] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return dv;
}

// ── Local storage ──────────────────────────────
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? initial; } catch { return initial; }
  });
  const set = useCallback((v: T) => { setValue(v); localStorage.setItem(key, JSON.stringify(v)); }, [key]);
  return [value, set] as const;
}
`.trim(),
    },
  },

  modal_system: {
    summary: "Centralised modal and dialog system with a context-based API for opening/closing overlays.",
    exposes: ["<ModalProvider />", "useModal(): { open(id, props), close() }", "createModal(Component)"],
    envVars: [],
    scaffold: {
      typescript: `
import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface ModalState { id: string; props: Record<string, unknown> }
interface ModalCtx   { open(id: string, props?: Record<string, unknown>): void; close(): void; current: ModalState | null; }

const Ctx = createContext<ModalCtx | null>(null);
export const useModal = () => { const c = useContext(Ctx); if (!c) throw new Error('Missing ModalProvider'); return c; };

const registry = new Map<string, React.ComponentType<any>>();
export function registerModal(id: string, Component: React.ComponentType<any>) { registry.set(id, Component); }

export function ModalProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<ModalState | null>(null);
  const open  = useCallback((id: string, props: Record<string, unknown> = {}) => setCurrent({ id, props }), []);
  const close = useCallback(() => setCurrent(null), []);

  const ActiveModal = current ? registry.get(current.id) : null;

  return (
    <Ctx.Provider value={{ open, close, current }}>
      {children}
      {ActiveModal && current && (
        <div className="modal-overlay" onClick={close}>
          <div onClick={e => e.stopPropagation()}>
            <ActiveModal {...current.props} onClose={close} />
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
`.trim(),
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRY & EXPORT
// ─────────────────────────────────────────────────────────────────────────────

const registry: Record<string, ComponentTemplate> = { ...backend, ...frontend };

export function getComponentTemplate(type: string): ComponentTemplate | null {
  return registry[type] ?? null;
}

export function formatTemplateForPrompt(template: ComponentTemplate, language: Language): string {
  const scaffoldLang: Language =
    language === "javascript" ? "typescript" :  // JS scaffold uses TS structure (AI drops types)
    language;

  const scaffold = template.scaffold[scaffoldLang] ?? template.scaffold.typescript ?? "";

  const lines: string[] = [
    `Component role: ${template.summary}`,
    "",
    "Public interface this component MUST expose:",
    ...template.exposes.map(e => `  - ${e}`),
  ];

  if (template.envVars.length) {
    lines.push("", "Environment variables to reference:");
    lines.push(...template.envVars.map(v => `  - ${v}`));
  }

  if (scaffold) {
    lines.push(
      "",
      "Starter scaffold — implement and extend this structure (do not return it verbatim):",
      "```",
      scaffold,
      "```",
    );
  }

  return lines.join("\n");
}
