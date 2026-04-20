import type { Language } from "../types";

export type ScaffoldContext = {
  nodeName: string;
  nodeType: string;
  language: Language;
  framework: string;
  config: Record<string, unknown>;
  projectName: string;
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function fw(ctx: ScaffoldContext) {
  return ctx.framework.toLowerCase();
}
function cfg<T = string>(ctx: ScaffoldContext, key: string, fallback?: T): T {
  return (ctx.config[key] as T) ?? (fallback as T);
}
function pascal(s: string) {
  return s.replace(/(^|[\s_-]+)(\w)/g, (_, __, c) => c.toUpperCase());
}
function camel(s: string) {
  const p = pascal(s);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

// ─── backend scaffolds ────────────────────────────────────────────────────────

function scaffoldApi(ctx: ScaffoldContext): string {
  const name = pascal(ctx.nodeName);
  const f = fw(ctx);

  if (ctx.language === "typescript" || ctx.language === "javascript") {
    if (f.includes("nestjs") || f.includes("nest")) {
      return `import { Controller, Get, Post, Put, Delete, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ${name}Service } from './${camel(ctx.nodeName)}.service';
import { Create${name}Dto } from './dto/create-${camel(ctx.nodeName)}.dto';
import { Update${name}Dto } from './dto/update-${camel(ctx.nodeName)}.dto';

@ApiTags('${camel(ctx.nodeName)}')
@Controller('${camel(ctx.nodeName)}')
export class ${name}Controller {
  constructor(private readonly service: ${name}Service) {}

  @Get('health')
  @ApiOperation({ summary: 'Health check' })
  health() { return { status: 'ok', ts: new Date().toISOString() }; }

  @Get()
  findAll() { return this.service.findAll(); }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: Create${name}Dto) { return this.service.create(dto); }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: Update${name}Dto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) { return this.service.remove(id); }
}

// === FILE: src/${camel(ctx.nodeName)}/${camel(ctx.nodeName)}.service.ts ===
import { Injectable, NotFoundException } from '@nestjs/common';
import { Create${name}Dto } from './dto/create-${camel(ctx.nodeName)}.dto';
import { Update${name}Dto } from './dto/update-${camel(ctx.nodeName)}.dto';

@Injectable()
export class ${name}Service {
  // IMPLEMENT[1]: Inject repository/ORM client (e.g. @InjectRepository(${name}Entity) or PrismaService)

  async findAll() {
    // IMPLEMENT[2]: Return all ${name} records from the data store
    throw new Error('Not implemented');
  }

  async findOne(id: string) {
    // IMPLEMENT[3]: Find ${name} by id; throw NotFoundException if not found
    throw new NotFoundException(\`${name} \${id} not found\`);
  }

  async create(dto: Create${name}Dto) {
    // IMPLEMENT[4]: Persist new ${name} record and return it
    throw new Error('Not implemented');
  }

  async update(id: string, dto: Update${name}Dto) {
    // IMPLEMENT[5]: Update ${name} record by id and return updated entity
    throw new Error('Not implemented');
  }

  async remove(id: string) {
    // IMPLEMENT[6]: Delete ${name} record by id
    throw new Error('Not implemented');
  }
}

// === FILE: src/${camel(ctx.nodeName)}/dto/create-${camel(ctx.nodeName)}.dto.ts ===
import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class Create${name}Dto {
  // IMPLEMENT[7]: Add validated fields using class-validator decorators and @ApiProperty
}

// === FILE: src/${camel(ctx.nodeName)}/dto/update-${camel(ctx.nodeName)}.dto.ts ===
import { PartialType } from '@nestjs/swagger';
import { Create${name}Dto } from './create-${camel(ctx.nodeName)}.dto';
export class Update${name}Dto extends PartialType(Create${name}Dto) {}
`;
    }

    // Express (default)
    return `import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';

// IMPLEMENT[1]: Define your domain entity type / interface here
export type ${name}Entity = {
  id: string;
  // add domain fields
};

// IMPLEMENT[2]: Define create/update schemas with Zod
const Create${name}Schema = z.object({
  // add field validations
});
const Update${name}Schema = Create${name}Schema.partial();

export interface I${name}Service {
  findAll(): Promise<${name}Entity[]>;
  findById(id: string): Promise<${name}Entity | null>;
  create(data: z.infer<typeof Create${name}Schema>): Promise<${name}Entity>;
  update(id: string, data: z.infer<typeof Update${name}Schema>): Promise<${name}Entity>;
  delete(id: string): Promise<void>;
}

export function create${name}Router(svc: I${name}Service): Router {
  const router = Router();

  router.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

  router.get('/', async (_req, res, next) => {
    try { res.json({ data: await svc.findAll() }); } catch (e) { next(e); }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const item = await svc.findById(req.params.id);
      item ? res.json({ data: item }) : res.status(404).json({ error: 'Not found' });
    } catch (e) { next(e); }
  });

  router.post('/', async (req, res, next) => {
    try {
      const body = Create${name}Schema.parse(req.body);
      res.status(201).json({ data: await svc.create(body) });
    } catch (e) { next(e); }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      const body = Update${name}Schema.parse(req.body);
      res.json({ data: await svc.update(req.params.id, body) });
    } catch (e) { next(e); }
  });

  router.delete('/:id', async (req, res, next) => {
    try { await svc.delete(req.params.id); res.status(204).send(); } catch (e) { next(e); }
  });

  return router;
}

// === FILE: src/${camel(ctx.nodeName)}.service.ts ===
import type { I${name}Service, ${name}Entity } from './${camel(ctx.nodeName)}.router';

export class ${name}ServiceImpl implements I${name}Service {
  // IMPLEMENT[3]: Inject your data access layer (ORM client, repository, etc.)

  async findAll(): Promise<${name}Entity[]> {
    // IMPLEMENT[4]: Query and return all ${name} records
    return [];
  }

  async findById(id: string): Promise<${name}Entity | null> {
    // IMPLEMENT[5]: Query ${name} by id; return null if not found
    return null;
  }

  async create(data: any): Promise<${name}Entity> {
    // IMPLEMENT[6]: Persist new ${name} and return saved record
    throw new Error('Not implemented');
  }

  async update(id: string, data: any): Promise<${name}Entity> {
    // IMPLEMENT[7]: Update ${name} by id and return updated record
    throw new Error('Not implemented');
  }

  async delete(id: string): Promise<void> {
    // IMPLEMENT[8]: Delete ${name} by id
  }
}
`;
  }

  if (ctx.language === "python") {
    const isNested = f.includes("django");
    if (isNested) {
      return `from django.db import models
from rest_framework import serializers, viewsets, routers
from rest_framework.decorators import action
from rest_framework.response import Response

# IMPLEMENT[1]: Define the Django model for ${name}
class ${name}(models.Model):
    # IMPLEMENT[2]: Add model fields (e.g. name = models.CharField(max_length=255))
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = '${camel(ctx.nodeName).toLowerCase()}'

# IMPLEMENT[3]: Define serializer — add fields matching the model
class ${name}Serializer(serializers.ModelSerializer):
    class Meta:
        model = ${name}
        fields = '__all__'

class ${name}ViewSet(viewsets.ModelViewSet):
    queryset = ${name}.objects.all()
    serializer_class = ${name}Serializer

    @action(detail=False, methods=['get'], url_path='health')
    def health(self, request):
        return Response({'status': 'ok'})

    # IMPLEMENT[4]: Add any custom actions (e.g. search, bulk operations)

router = routers.DefaultRouter()
router.register(r'${camel(ctx.nodeName).toLowerCase()}', ${name}ViewSet)
`;
    }
    // FastAPI default
    return `from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import Optional, List
import uuid

router = APIRouter(prefix="/${camel(ctx.nodeName).toLowerCase()}", tags=["${ctx.nodeName}"])

# IMPLEMENT[1]: Define Pydantic schemas for request/response
class ${name}Base(BaseModel):
    pass  # add shared fields

class ${name}Create(${name}Base):
    pass  # IMPLEMENT[2]: Add creation-specific fields

class ${name}Update(${name}Base):
    pass  # IMPLEMENT[3]: Add update fields (all optional)

class ${name}Response(${name}Base):
    id: str
    # IMPLEMENT[4]: Add response-only fields (created_at, etc.)

    class Config:
        from_attributes = True

# IMPLEMENT[5]: Inject repository/service as a FastAPI dependency
def get_service():
    raise NotImplementedError

@router.get("/health")
async def health(): return {"status": "ok"}

@router.get("/", response_model=List[${name}Response])
async def list_items():
    # IMPLEMENT[6]: Return all ${name} records from the service
    return []

@router.get("/{item_id}", response_model=${name}Response)
async def get_item(item_id: str):
    # IMPLEMENT[7]: Fetch by id; raise HTTPException(404) if missing
    raise HTTPException(status_code=404, detail="Not found")

@router.post("/", response_model=${name}Response, status_code=status.HTTP_201_CREATED)
async def create_item(body: ${name}Create):
    # IMPLEMENT[8]: Persist and return new ${name}
    raise NotImplementedError

@router.put("/{item_id}", response_model=${name}Response)
async def update_item(item_id: str, body: ${name}Update):
    # IMPLEMENT[9]: Update ${name} by id and return
    raise NotImplementedError

@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(item_id: str):
    # IMPLEMENT[10]: Delete ${name} by id
    pass
`;
  }

  if (ctx.language === "java") {
    return `package com.${ctx.projectName.toLowerCase().replace(/\s+/g, "")}.${camel(ctx.nodeName).toLowerCase()};

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;

@Tag(name = "${ctx.nodeName}")
@RestController
@RequestMapping("/api/${camel(ctx.nodeName).toLowerCase()}")
@RequiredArgsConstructor
public class ${name}Controller {

    private final ${name}Service service;

    @GetMapping("/health")
    @Operation(summary = "Health check")
    public java.util.Map<String, Object> health() {
        return java.util.Map.of("status", "ok");
    }

    @GetMapping
    public List<${name}Response> findAll() { return service.findAll(); }

    @GetMapping("/{id}")
    public ${name}Response findById(@PathVariable String id) { return service.findById(id); }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ${name}Response create(@Valid @RequestBody ${name}Request request) { return service.create(request); }

    @PutMapping("/{id}")
    public ${name}Response update(@PathVariable String id, @Valid @RequestBody ${name}Request request) {
        return service.update(id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String id) { service.delete(id); }
}

// === FILE: src/main/java/com/${ctx.projectName.toLowerCase().replace(/\s+/g, "")}/${camel(ctx.nodeName).toLowerCase()}/${name}Service.java ===
package com.${ctx.projectName.toLowerCase().replace(/\s+/g, "")}.${camel(ctx.nodeName).toLowerCase()};

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional
public class ${name}Service {

    // IMPLEMENT[1]: Inject the repository (e.g. private final ${name}Repository repository;)

    public List<${name}Response> findAll() {
        // IMPLEMENT[2]: Query all records and map to ${name}Response DTOs
        throw new UnsupportedOperationException("Not implemented");
    }

    public ${name}Response findById(String id) {
        // IMPLEMENT[3]: Find by id or throw ResourceNotFoundException
        throw new UnsupportedOperationException("Not implemented");
    }

    public ${name}Response create(${name}Request request) {
        // IMPLEMENT[4]: Map request → entity, persist, return response DTO
        throw new UnsupportedOperationException("Not implemented");
    }

    public ${name}Response update(String id, ${name}Request request) {
        // IMPLEMENT[5]: Find, apply changes, persist, return response DTO
        throw new UnsupportedOperationException("Not implemented");
    }

    public void delete(String id) {
        // IMPLEMENT[6]: Find by id and delete; throw if not found
        throw new UnsupportedOperationException("Not implemented");
    }
}

// === FILE: src/main/java/com/${ctx.projectName.toLowerCase().replace(/\s+/g, "")}/${camel(ctx.nodeName).toLowerCase()}/${name}Request.java ===
package com.${ctx.projectName.toLowerCase().replace(/\s+/g, "")}.${camel(ctx.nodeName).toLowerCase()};

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class ${name}Request {
    // IMPLEMENT[7]: Add validated fields with Bean Validation annotations
}

// === FILE: src/main/java/com/${ctx.projectName.toLowerCase().replace(/\s+/g, "")}/${camel(ctx.nodeName).toLowerCase()}/${name}Response.java ===
package com.${ctx.projectName.toLowerCase().replace(/\s+/g, "")}.${camel(ctx.nodeName).toLowerCase()};

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class ${name}Response {
    private String id;
    // IMPLEMENT[8]: Add response fields matching the domain entity
}
`;
  }

  return null;
}

// ─── database scaffold ────────────────────────────────────────────────────────

function scaffoldDatabase(ctx: ScaffoldContext): string {
  const orm = cfg(ctx, "orm", "Prisma");
  const engine = cfg(ctx, "engine", "PostgreSQL");
  const poolMax = cfg(ctx, "pool_max", 10);
  const migrations = cfg(ctx, "migrations", true);
  const ssl = cfg(ctx, "ssl", true);
  const name = pascal(ctx.nodeName);

  if (ctx.language === "typescript" || ctx.language === "javascript") {
    if (orm === "Prisma") {
      return `// Prisma client singleton — DATABASE_URL must be set in environment
import { PrismaClient } from '@prisma/client';

declare global { var __prisma: PrismaClient | undefined; }

export const prisma: PrismaClient =
  globalThis.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasources: { db: { url: process.env.DATABASE_URL } },
  });

if (process.env.NODE_ENV !== 'production') globalThis.__prisma = prisma;

// === FILE: prisma/schema.prisma ===
// Generator and datasource
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "${engine === "PostgreSQL" ? "postgresql" : engine === "MySQL" ? "mysql" : engine === "SQLite" ? "sqlite" : "postgresql"}"
  url      = env("DATABASE_URL")${ssl && engine !== "SQLite" ? '\n  // SSL is enforced via DATABASE_URL query params: ?sslmode=require' : ""}
}

// IMPLEMENT[1]: Define your Prisma models below. Example:
// model ${name} {
//   id        String   @id @default(cuid())
//   createdAt DateTime @default(now())
//   updatedAt DateTime @updatedAt
//   // add fields
// }

${migrations ? `// === FILE: prisma/migrations/.gitkeep ===
// Migrations are managed by Prisma Migrate: npx prisma migrate dev --name init
// Env: DATABASE_URL=${engine === "PostgreSQL" ? "postgresql://user:pass@localhost:5432/dbname" : engine === "MySQL" ? "mysql://user:pass@localhost:3306/dbname" : "file:./dev.db"}
` : ""}
// === FILE: src/db/index.ts ===
export { prisma } from '../prismaClient';

// IMPLEMENT[2]: Export repository functions that wrap prisma queries.
// Keep all DB access here; services import from this module only.
`;
    }

    if (orm === "TypeORM") {
      return `import { DataSource } from 'typeorm';

export const AppDataSource = new DataSource({
  type: '${engine === "PostgreSQL" ? "postgres" : engine === "MySQL" ? "mysql" : engine === "SQLite" ? "sqlite" : "postgres"}',
  url: process.env.DATABASE_URL,
  ${engine !== "SQLite" ? `ssl: ${ssl} ? { rejectUnauthorized: false } : false,` : ""}
  entities: [__dirname + '/entities/**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/**/*{.ts,.js}'],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  extra: { max: ${poolMax} },
});

export async function initDatabase(): Promise<void> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
    ${migrations ? "await AppDataSource.runMigrations();" : ""}
  }
}

// === FILE: src/db/entities/.gitkeep ===
// IMPLEMENT[1]: Create entity files here. Example:
// import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
// @Entity('${camel(ctx.nodeName).toLowerCase()}')
// export class ${name}Entity {
//   @PrimaryGeneratedColumn('uuid') id: string;
//   @CreateDateColumn() createdAt: Date;
//   // add columns
// }

// === FILE: src/db/repositories/${camel(ctx.nodeName)}.repository.ts ===
import { AppDataSource } from '../dataSource';
// IMPLEMENT[2]: Import your entity and build a typed repository
// const repo = AppDataSource.getRepository(${name}Entity);
// export const ${name}Repository = repo;
`;
    }

    if (orm === "Drizzle") {
      return `import { drizzle } from 'drizzle-orm/${engine === "PostgreSQL" ? "node-postgres" : engine === "MySQL" ? "mysql2" : "better-sqlite3"}';
import { pgTable, text, timestamp } from 'drizzle-orm/${engine === "PostgreSQL" ? "pg-core" : engine === "MySQL" ? "mysql-core" : "sqlite-core"}';
${engine === "PostgreSQL" ? "import { Pool } from 'pg';\n\nconst pool = new Pool({ connectionString: process.env.DATABASE_URL, max: " + poolMax + " });\nexport const db = drizzle(pool);" : engine === "MySQL" ? "import mysql from 'mysql2/promise';\n\nconst connection = mysql.createPool(process.env.DATABASE_URL!);\nexport const db = drizzle(connection);" : "import Database from 'better-sqlite3';\n\nconst sqlite = new Database(process.env.DATABASE_URL ?? './dev.db');\nexport const db = drizzle(sqlite);"}

// === FILE: src/db/schema.ts ===
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// IMPLEMENT[1]: Define your Drizzle schema tables here. Example:
// export const ${camel(ctx.nodeName)} = pgTable('${camel(ctx.nodeName).toLowerCase()}', {
//   id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
//   createdAt: timestamp('created_at').defaultNow(),
//   // add columns
// });

// === FILE: drizzle.config.ts ===
import type { Config } from 'drizzle-kit';
export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  driver: '${engine === "PostgreSQL" ? "pg" : engine === "MySQL" ? "mysql2" : "better-sqlite"}',
  dbCredentials: { connectionString: process.env.DATABASE_URL! },
} satisfies Config;
`;
    }

    // Raw SQL fallback
    return `import { Pool, PoolClient } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: ${poolMax},
  ${ssl ? "ssl: { rejectUnauthorized: false }," : ""}
});

export async function query<T = any>(text: string, params?: unknown[]): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
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

// IMPLEMENT[1]: Add typed query functions for your domain entities here
`;
  }

  if (ctx.language === "python") {
    if (orm.includes("SQLAlchemy") || orm === "Prisma") {
      return `from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import Column, String, DateTime, func
import os

DATABASE_URL = os.environ["DATABASE_URL"]

engine = create_async_engine(
    DATABASE_URL,
    pool_size=${poolMax},
    echo=(os.getenv("ENV") == "development"),
)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def get_session() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

# === FILE: src/models/${ctx.nodeName.toLowerCase()}.py ===
from src.db import Base
from sqlalchemy import Column, String, DateTime, func

# IMPLEMENT[1]: Define your SQLAlchemy model
class ${name}(Base):
    __tablename__ = '${ctx.nodeName.toLowerCase()}'
    id = Column(String, primary_key=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    # IMPLEMENT[2]: Add domain-specific columns

# === FILE: src/repositories/${ctx.nodeName.toLowerCase()}_repository.py ===
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from src.models.${ctx.nodeName.toLowerCase()} import ${name}

class ${name}Repository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def find_all(self):
        # IMPLEMENT[3]: Return all ${name} records
        result = await self.session.execute(select(${name}))
        return result.scalars().all()

    async def find_by_id(self, id: str):
        # IMPLEMENT[4]: Return ${name} by id or None
        return await self.session.get(${name}, id)

    async def save(self, entity: ${name}) -> ${name}:
        # IMPLEMENT[5]: Persist and return the entity
        self.session.add(entity)
        await self.session.commit()
        await self.session.refresh(entity)
        return entity

    async def delete(self, id: str):
        # IMPLEMENT[6]: Delete ${name} by id
        entity = await self.find_by_id(id)
        if entity:
            await self.session.delete(entity)
            await self.session.commit()
`;
    }
  }

  if (ctx.language === "java") {
    return `package com.${ctx.projectName.toLowerCase().replace(/\s+/g, "")}.${camel(ctx.nodeName).toLowerCase()};

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import java.time.Instant;

// IMPLEMENT[1]: Define your JPA entity
@Entity
@Table(name = "${ctx.nodeName.toLowerCase()}")
@Getter @Setter @Builder @NoArgsConstructor @AllArgsConstructor
public class ${name}Entity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @CreationTimestamp
    @Column(updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    private Instant updatedAt;

    // IMPLEMENT[2]: Add domain fields with appropriate constraints
}

// === FILE: src/main/java/com/${ctx.projectName.toLowerCase().replace(/\s+/g, "")}/${camel(ctx.nodeName).toLowerCase()}/${name}Repository.java ===
package com.${ctx.projectName.toLowerCase().replace(/\s+/g, "")}.${camel(ctx.nodeName).toLowerCase()};

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ${name}Repository extends JpaRepository<${name}Entity, String> {
    // IMPLEMENT[3]: Add custom query methods using Spring Data naming conventions or @Query
}

// === FILE: src/main/resources/application.yml ===
# IMPLEMENT[4]: Verify/set database connection properties
spring:
  datasource:
    url: \${DATABASE_URL:jdbc:postgresql://localhost:5432/${ctx.projectName.toLowerCase().replace(/\s+/g, "")}}
    username: \${DB_USER:postgres}
    password: \${DB_PASSWORD:}
    hikari:
      maximum-pool-size: ${poolMax}
  jpa:
    hibernate:
      ddl-auto: validate
    show-sql: false
  flyway:
    enabled: ${migrations ? "true" : "false"}
    locations: classpath:db/migration
`;
  }

  return null;
}

// ─── nosql database scaffold ──────────────────────────────────────────────────

function scaffoldNoSqlDatabase(ctx: ScaffoldContext): string {
  const engine = cfg(ctx, "engine", "MongoDB");
  const odm = cfg(ctx, "odm", "Mongoose");
  const name = pascal(ctx.nodeName);

  if (ctx.language === "typescript" || ctx.language === "javascript") {
    if (engine === "MongoDB" && odm === "Mongoose") {
      return `import mongoose, { Schema, model, Document } from 'mongoose';

export async function connectDatabase(): Promise<void> {
  await mongoose.connect(process.env.MONGODB_URI!, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
  });
}

// === FILE: src/models/${camel(ctx.nodeName)}.model.ts ===
import { Schema, model, Document } from 'mongoose';

// IMPLEMENT[1]: Define the document interface
export interface I${name} extends Document {
  // add typed fields
  createdAt: Date;
  updatedAt: Date;
}

// IMPLEMENT[2]: Define the schema with validation and indexes
const ${name}Schema = new Schema<I${name}>({
  // add fields
}, { timestamps: true });

// IMPLEMENT[3]: Add indexes
// ${name}Schema.index({ fieldName: 1 });

export const ${name}Model = model<I${name}>('${name}', ${name}Schema);

// === FILE: src/repositories/${camel(ctx.nodeName)}.repository.ts ===
import { ${name}Model, I${name} } from '../models/${camel(ctx.nodeName)}.model';

export class ${name}Repository {
  async findAll() { return ${name}Model.find().lean(); }

  async findById(id: string) { return ${name}Model.findById(id).lean(); }

  async create(data: Partial<I${name}>) {
    // IMPLEMENT[4]: Create and return new document
    return ${name}Model.create(data);
  }

  async update(id: string, data: Partial<I${name}>) {
    // IMPLEMENT[5]: Update by id and return updated document
    return ${name}Model.findByIdAndUpdate(id, data, { new: true }).lean();
  }

  async delete(id: string) {
    return ${name}Model.findByIdAndDelete(id);
  }
}
`;
    }

    if (engine === "DynamoDB") {
      return `import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
export const dynamo = DynamoDBDocumentClient.from(client);

const TABLE = process.env.DYNAMODB_TABLE ?? '${ctx.nodeName.toLowerCase()}';

// IMPLEMENT[1]: Define your item type
export type ${name}Item = {
  pk: string;
  sk: string;
  // add domain attributes
};

export async function getItem(pk: string, sk: string): Promise<${name}Item | null> {
  const resp = await dynamo.send(new GetCommand({ TableName: TABLE, Key: { pk, sk } }));
  return (resp.Item as ${name}Item) ?? null;
}

export async function putItem(item: ${name}Item): Promise<void> {
  await dynamo.send(new PutCommand({ TableName: TABLE, Item: item }));
}

export async function deleteItem(pk: string, sk: string): Promise<void> {
  await dynamo.send(new DeleteCommand({ TableName: TABLE, Key: { pk, sk } }));
}

// IMPLEMENT[2]: Add query/index access patterns using QueryCommand for GSIs
`;
    }
  }

  return null;
}

// ─── auth scaffold ────────────────────────────────────────────────────────────

function scaffoldAuth(ctx: ScaffoldContext): string {
  const strategies = cfg<string[]>(ctx, "strategy", ["JWT"]);
  const mfa = cfg<boolean>(ctx, "mfa", false);
  const tokenExpiry = cfg(ctx, "token_expiry", "15m");
  const oauthProviders = cfg<string[]>(ctx, "oauth_providers", []);
  const name = pascal(ctx.nodeName);

  if (ctx.language === "typescript" || ctx.language === "javascript") {
    const hasJwt = strategies.includes("JWT");
    const hasOAuth = strategies.includes("OAuth2") || oauthProviders.length > 0;
    const hasSession = strategies.includes("Session");

    return `import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
${hasJwt ? "import jwt from 'jsonwebtoken';" : ""}
${hasSession ? "import session from 'express-session';" : ""}

// ── Environment variables ────────────────────────────────────────────────────
// JWT_SECRET, JWT_EXPIRY=${tokenExpiry}, REFRESH_SECRET
${hasOAuth ? oauthProviders.map(p => `// ${p.toUpperCase().replace(/\//g, "_")}_CLIENT_ID, ${p.toUpperCase().replace(/\//g, "_")}_CLIENT_SECRET`).join("\n") : ""}

export const authRouter = Router();

${hasJwt ? `// ── JWT Helpers ──────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRY = process.env.JWT_EXPIRY ?? '${tokenExpiry}';
const REFRESH_SECRET = process.env.REFRESH_SECRET!;

export function signAccessToken(payload: object): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

export function signRefreshToken(payload: object): string {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: '7d' });
}

export function verifyAccessToken(token: string): jwt.JwtPayload {
  return jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
}

// ── JWT Auth Middleware ───────────────────────────────────────────────────────
export function jwtGuard(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) { res.status(401).json({ error: 'Missing token' }); return; }
  try {
    const payload = verifyAccessToken(header.slice(7));
    (req as any).user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
` : ""}

// ── Auth Routes ───────────────────────────────────────────────────────────────

authRouter.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // IMPLEMENT[1]: Validate input (email, password), check for duplicates
    // IMPLEMENT[2]: Hash password with bcrypt, persist user to DB
    // IMPLEMENT[3]: Return ${hasJwt ? "access + refresh tokens" : "session"} on success
    res.status(201).json({ message: 'Registered' });
  } catch (e) { next(e); }
});

authRouter.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // IMPLEMENT[4]: Find user by email; return 401 if not found
    // IMPLEMENT[5]: Compare password with bcrypt.compare
    // IMPLEMENT[6]: Return ${hasJwt ? "signed JWT access + refresh tokens" : "session cookie"}
    ${mfa ? "// IMPLEMENT[7]: If user has MFA enabled, issue a challenge token instead" : ""}
    res.json({ message: 'Logged in' });
  } catch (e) { next(e); }
});

${hasJwt ? `authRouter.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // IMPLEMENT[${mfa ? "8" : "7"}]: Verify refresh token, return new access token
    res.json({ message: 'Refreshed' });
  } catch (e) { next(e); }
});
` : ""}

authRouter.post('/logout', async (req: Request, res: Response) => {
  // IMPLEMENT: Invalidate refresh token / session
  res.json({ message: 'Logged out' });
});

${mfa ? `// ── MFA Routes ───────────────────────────────────────────────────────────────
authRouter.post('/mfa/setup', jwtGuard, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // IMPLEMENT: Generate TOTP secret (use 'speakeasy'), return QR code URL
    res.json({ message: 'MFA setup initiated' });
  } catch (e) { next(e); }
});

authRouter.post('/mfa/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // IMPLEMENT: Verify TOTP token against stored secret; issue full auth tokens on success
    res.json({ message: 'MFA verified' });
  } catch (e) { next(e); }
});
` : ""}

${hasOAuth && oauthProviders.length > 0 ? `// ── OAuth2 Routes (Passport.js) ──────────────────────────────────────────────
// Install: npm install passport passport-google-oauth20 (adjust per providers)
${oauthProviders.map(p => {
  const pLower = p.toLowerCase().replace(/\//g, "-").replace(/\s/g, "-");
  return `// IMPLEMENT: Configure passport strategy for ${p}
// authRouter.get('/oauth/${pLower}', passport.authenticate('${pLower}'));
// authRouter.get('/oauth/${pLower}/callback', passport.authenticate('${pLower}', { session: false }), issueTokens);`;
}).join("\n")}
` : ""}
`;
  }

  if (ctx.language === "python") {
    return `from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
${strategies.includes("JWT") ? "import jwt\nfrom datetime import datetime, timedelta" : ""}
import os

router = APIRouter(prefix="/auth", tags=["auth"])
bearer = HTTPBearer()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

${strategies.includes("JWT") ? `JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRY = int(os.getenv("JWT_EXPIRY_MINUTES", ${tokenExpiry === "15m" ? "15" : tokenExpiry === "1h" ? "60" : "15"}))

def create_access_token(data: dict) -> str:
    payload = {**data, "exp": datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRY)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(credentials: HTTPAuthorizationCredentials = Depends(bearer)):
    try:
        return jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
` : ""}

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest):
    # IMPLEMENT[1]: Check duplicate email
    # IMPLEMENT[2]: Hash password: pwd_context.hash(body.password)
    # IMPLEMENT[3]: Persist user to database
    # IMPLEMENT[4]: Return tokens or confirmation
    return {"message": "Registered"}

@router.post("/login")
async def login(body: LoginRequest):
    # IMPLEMENT[5]: Find user by email; raise 401 if not found
    # IMPLEMENT[6]: Verify password: pwd_context.verify(body.password, stored_hash)
    # IMPLEMENT[7]: Return ${strategies.includes("JWT") ? "JWT access token" : "session"}
    ${mfa ? "# IMPLEMENT[8]: Issue MFA challenge if user has MFA enabled" : ""}
    return {"message": "Logged in"}

@router.post("/logout")
async def logout():
    # IMPLEMENT: Invalidate token / session
    return {"message": "Logged out"}
${mfa ? `
@router.post("/mfa/setup")
async def mfa_setup(user=Depends(decode_token)):
    # IMPLEMENT: Generate TOTP secret (use 'pyotp'), return QR code URI
    return {"message": "MFA setup initiated"}

@router.post("/mfa/verify")
async def mfa_verify(token: str):
    # IMPLEMENT: Validate TOTP token; issue full auth on success
    return {"message": "MFA verified"}
` : ""}`;
  }

  if (ctx.language === "java") {
    return `package com.${ctx.projectName.toLowerCase().replace(/\s+/g, "")}.auth;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final JwtService jwtService;

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthResponse register(@Valid @RequestBody RegisterRequest request) {
        // IMPLEMENT[1]: Delegate to authService.register; return tokens
        return authService.register(request);
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest request) {
        // IMPLEMENT[2]: Authenticate and return tokens
        return authService.login(request);
    }

    @PostMapping("/refresh")
    public AuthResponse refresh(@RequestBody RefreshRequest request) {
        // IMPLEMENT[3]: Validate refresh token, return new access token
        return authService.refresh(request.getRefreshToken());
    }
}

// === FILE: src/main/java/com/${ctx.projectName.toLowerCase().replace(/\s+/g, "")}/auth/JwtService.java ===
package com.${ctx.projectName.toLowerCase().replace(/\s+/g, "")}.auth;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import java.security.Key;
import java.util.Date;

@Service
public class JwtService {

    @Value("\${jwt.secret}") private String secret;
    @Value("\${jwt.expiry:${tokenExpiry === "15m" ? "900000" : tokenExpiry === "1h" ? "3600000" : "900000"}}") private long expiry;

    private Key signingKey() { return Keys.hmacShaKeyFor(secret.getBytes()); }

    public String generateAccessToken(String subject) {
        return Jwts.builder()
            .setSubject(subject)
            .setIssuedAt(new Date())
            .setExpiration(new Date(System.currentTimeMillis() + expiry))
            .signWith(signingKey())
            .compact();
    }

    public Claims validateToken(String token) {
        // IMPLEMENT[4]: Parse and return claims; throws on invalid/expired
        return Jwts.parserBuilder().setSigningKey(signingKey()).build()
            .parseClaimsJws(token).getBody();
    }
}

// === FILE: src/main/java/com/${ctx.projectName.toLowerCase().replace(/\s+/g, "")}/auth/AuthService.java ===
package com.${ctx.projectName.toLowerCase().replace(/\s+/g, "")}.auth;

import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AuthService {
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    // IMPLEMENT[5]: Inject UserRepository

    public AuthResponse register(RegisterRequest request) {
        // IMPLEMENT[6]: Validate uniqueness, hash password, persist user, return tokens
        throw new UnsupportedOperationException("Not implemented");
    }

    public AuthResponse login(LoginRequest request) {
        // IMPLEMENT[7]: Find user, verify password, return tokens
        throw new UnsupportedOperationException("Not implemented");
    }

    public AuthResponse refresh(String refreshToken) {
        // IMPLEMENT[8]: Validate refresh token, generate new access token
        throw new UnsupportedOperationException("Not implemented");
    }
}
`;
  }

  return null;
}

// ─── cache scaffold ───────────────────────────────────────────────────────────

function scaffoldCache(ctx: ScaffoldContext): string {
  const engine = cfg(ctx, "engine", "Redis");
  const ttl = cfg<number>(ctx, "default_ttl", 300);
  const cluster = cfg<boolean>(ctx, "cluster", false);

  if (ctx.language === "typescript" || ctx.language === "javascript") {
    if (engine === "Redis" || engine === "DragonflyDB") {
      return `import { createClient${cluster ? ", createCluster" : ""} } from 'redis';

${cluster
  ? `const redis = createCluster({
  rootNodes: (process.env.REDIS_NODES ?? 'redis://localhost:6379').split(',').map(url => ({ url })),
});`
  : `const redis = createClient({ url: process.env.REDIS_URL ?? 'redis://localhost:6379' });`}

redis.on('error', (err) => console.error('[redis] error:', err));

export async function connectCache(): Promise<void> {
  await redis.connect();
}

export const DEFAULT_TTL = ${ttl};

export async function cacheGet<T>(key: string): Promise<T | null> {
  const value = await redis.get(key);
  return value ? (JSON.parse(value) as T) : null;
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = DEFAULT_TTL): Promise<void> {
  await redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
}

export async function cacheDel(key: string): Promise<void> {
  await redis.del(key);
}

export async function cacheGetOrSet<T>(
  key: string,
  fn: () => Promise<T>,
  ttlSeconds = DEFAULT_TTL,
): Promise<T> {
  const cached = await cacheGet<T>(key);
  if (cached !== null) return cached;
  const fresh = await fn();
  await cacheSet(key, fresh, ttlSeconds);
  return fresh;
}

// IMPLEMENT[1]: Add domain-specific cache helpers (e.g. getUserById, invalidateUserCache)
export { redis };
`;
    }

    if (engine === "Memcached") {
      return `import Memcached from 'memcached';

const memcached = new Memcached(process.env.MEMCACHED_URL ?? 'localhost:11211', {
  maxExpiration: ${ttl},
});

export const DEFAULT_TTL = ${ttl};

export function cacheGet<T>(key: string): Promise<T | null> {
  return new Promise((resolve, reject) =>
    memcached.get(key, (err, data) => (err ? reject(err) : resolve(data ?? null)))
  );
}

export function cacheSet(key: string, value: unknown, ttlSeconds = DEFAULT_TTL): Promise<void> {
  return new Promise((resolve, reject) =>
    memcached.set(key, value, ttlSeconds, (err) => (err ? reject(err) : resolve()))
  );
}

export function cacheDel(key: string): Promise<void> {
  return new Promise((resolve, reject) =>
    memcached.del(key, (err) => (err ? reject(err) : resolve()))
  );
}

// IMPLEMENT[1]: Add domain-specific cache helpers
`;
    }
  }

  if (ctx.language === "python") {
    return `import redis.asyncio as aioredis
import json, os
from typing import Any, Optional, TypeVar, Callable, Awaitable

T = TypeVar("T")
DEFAULT_TTL = ${ttl}

${cluster
  ? `redis_client = aioredis.RedisCluster.from_url(os.environ.get("REDIS_URL", "redis://localhost:6379"))`
  : `redis_client = aioredis.from_url(os.environ.get("REDIS_URL", "redis://localhost:6379"), decode_responses=True)`}

async def cache_get(key: str) -> Optional[Any]:
    value = await redis_client.get(key)
    return json.loads(value) if value else None

async def cache_set(key: str, value: Any, ttl: int = DEFAULT_TTL) -> None:
    await redis_client.setex(key, ttl, json.dumps(value))

async def cache_del(key: str) -> None:
    await redis_client.delete(key)

async def cache_get_or_set(key: str, fn: Callable[[], Awaitable[T]], ttl: int = DEFAULT_TTL) -> T:
    cached = await cache_get(key)
    if cached is not None:
        return cached
    fresh = await fn()
    await cache_set(key, fresh, ttl)
    return fresh

# IMPLEMENT[1]: Add domain-specific cache helpers (e.g. get_user_cache, invalidate_user)
`;
  }

  return null;
}

// ─── queue scaffold ───────────────────────────────────────────────────────────

function scaffoldQueue(ctx: ScaffoldContext): string {
  const engine = cfg(ctx, "engine", "BullMQ (Redis)");
  const concurrency = cfg<number>(ctx, "concurrency", 5);
  const dlq = cfg<boolean>(ctx, "dlq", true);
  const priority = cfg<boolean>(ctx, "priority", false);
  const name = pascal(ctx.nodeName);

  if (ctx.language === "typescript" || ctx.language === "javascript") {
    if (engine.includes("BullMQ")) {
      return `import { Queue, Worker, Job${dlq ? ", QueueEvents" : ""}${priority ? ", JobPriority" : ""} } from 'bullmq';
import { Redis } from 'ioredis';

const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

// ── Queue ─────────────────────────────────────────────────────────────────────
export const ${camel(ctx.nodeName)}Queue = new Queue('${camel(ctx.nodeName)}', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { count: 100 },
    removeOnFail: ${dlq ? "false" : "{ count: 50 }"},
  },
});

// IMPLEMENT[1]: Define your job payload types
export type ${name}JobPayload = {
  // add job-specific fields
};

export async function enqueue(
  payload: ${name}JobPayload,
  opts?: { delay?: number${priority ? "; priority?: number" : ""} },
) {
  return ${camel(ctx.nodeName)}Queue.add('${camel(ctx.nodeName)}', payload, {
    delay: opts?.delay,
    ${priority ? "priority: opts?.priority," : ""}
  });
}

// ── Worker ────────────────────────────────────────────────────────────────────
export const ${camel(ctx.nodeName)}Worker = new Worker<${name}JobPayload>(
  '${camel(ctx.nodeName)}',
  async (job: Job<${name}JobPayload>) => {
    // IMPLEMENT[2]: Process job based on job.name or job.data
    // Access payload: job.data
    // Update progress: await job.updateProgress(50)
    throw new Error(\`Unhandled job: \${job.name}\`);
  },
  { connection, concurrency: ${concurrency} },
);

${camel(ctx.nodeName)}Worker.on('completed', (job) => console.log(\`[queue] Job \${job.id} completed\`));
${camel(ctx.nodeName)}Worker.on('failed', (job, err) => console.error(\`[queue] Job \${job?.id} failed:\`, err));

${dlq ? `// ── Dead-Letter Queue ─────────────────────────────────────────────────────────
export const ${camel(ctx.nodeName)}DLQ = new Queue('${camel(ctx.nodeName)}:dlq', { connection });

${camel(ctx.nodeName)}Worker.on('failed', async (job, err) => {
  if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
    await ${camel(ctx.nodeName)}DLQ.add('dead-letter', { ...job.data, error: err.message, jobId: job.id });
  }
});
` : ""}`;
    }

    if (engine.includes("RabbitMQ")) {
      return `import amqplib, { Connection, Channel } from 'amqplib';

const QUEUE = '${camel(ctx.nodeName)}';
${dlq ? `const DLQ = '${camel(ctx.nodeName)}.dlq';` : ""}

let connection: Connection;
let channel: Channel;

export async function connectQueue(): Promise<void> {
  connection = await amqplib.connect(process.env.RABBITMQ_URL ?? 'amqp://localhost');
  channel = await connection.createChannel();
  await channel.assertQueue(QUEUE, { durable: true${dlq ? `, arguments: { 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': DLQ }` : ""} });
  ${dlq ? `await channel.assertQueue(DLQ, { durable: true });` : ""}
  channel.prefetch(${concurrency});
}

// IMPLEMENT[1]: Define job payload type
export type ${pascal(ctx.nodeName)}Payload = {};

export function enqueue(payload: ${pascal(ctx.nodeName)}Payload): void {
  channel.sendToQueue(QUEUE, Buffer.from(JSON.stringify(payload)), { persistent: true });
}

export async function startWorker(): Promise<void> {
  await channel.consume(QUEUE, async (msg) => {
    if (!msg) return;
    try {
      const payload: ${pascal(ctx.nodeName)}Payload = JSON.parse(msg.content.toString());
      // IMPLEMENT[2]: Process payload
      channel.ack(msg);
    } catch (err) {
      console.error('[queue] processing failed:', err);
      channel.nack(msg, false, false);
    }
  });
}
`;
    }

    if (engine.includes("SQS")) {
      return `import { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';

const sqs = new SQSClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
const QUEUE_URL = process.env.SQS_QUEUE_URL!;
${dlq ? `const DLQ_URL = process.env.SQS_DLQ_URL!;` : ""}

// IMPLEMENT[1]: Define message payload type
export type ${pascal(ctx.nodeName)}Message = {};

export async function enqueue(payload: ${pascal(ctx.nodeName)}Message, delaySeconds = 0): Promise<void> {
  await sqs.send(new SendMessageCommand({
    QueueUrl: QUEUE_URL,
    MessageBody: JSON.stringify(payload),
    DelaySeconds: delaySeconds,
  }));
}

export async function poll(batchSize = ${concurrency}): Promise<void> {
  const response = await sqs.send(new ReceiveMessageCommand({
    QueueUrl: QUEUE_URL,
    MaxNumberOfMessages: Math.min(batchSize, 10),
    WaitTimeSeconds: 20,
  }));

  for (const msg of response.Messages ?? []) {
    try {
      const payload: ${pascal(ctx.nodeName)}Message = JSON.parse(msg.Body!);
      // IMPLEMENT[2]: Process payload
      await sqs.send(new DeleteMessageCommand({ QueueUrl: QUEUE_URL, ReceiptHandle: msg.ReceiptHandle! }));
    } catch (err) {
      console.error('[sqs] processing failed:', err);
    }
  }
}
`;
    }
  }

  return null;
}

// ─── frontend scaffolds ───────────────────────────────────────────────────────

function scaffoldFormModule(ctx: ScaffoldContext): string {
  const lib = cfg(ctx, "library", "React Hook Form");
  const validation = cfg(ctx, "validation", "Zod");
  const fileUpload = cfg<boolean>(ctx, "file_upload", false);
  const name = pascal(ctx.nodeName);

  if (ctx.language === "typescript" || ctx.language === "javascript") {
    if (lib === "React Hook Form") {
      const hasZod = validation === "Zod";
      const hasYup = validation === "Yup";
      return `import React from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
${hasZod ? "import { z } from 'zod';\nimport { zodResolver } from '@hookform/resolvers/zod';" : ""}
${hasYup ? "import * as yup from 'yup';\nimport { yupResolver } from '@hookform/resolvers/yup';" : ""}

// IMPLEMENT[1]: Define form schema with ${validation}
${hasZod ? `const ${name}Schema = z.object({
  // add field validations, e.g.: name: z.string().min(2),
});
type ${name}FormData = z.infer<typeof ${name}Schema>;` : `type ${name}FormData = {
  // IMPLEMENT[2]: Add typed form fields
};`}

type ${name}Props = {
  onSubmit: (data: ${name}FormData) => Promise<void> | void;
  defaultValues?: Partial<${name}FormData>;
  isLoading?: boolean;
};

export default function ${name}({ onSubmit, defaultValues, isLoading }: ${name}Props) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<${name}FormData>({
    ${hasZod ? `resolver: zodResolver(${name}Schema),` : ""}
    defaultValues,
  });

  const handleFormSubmit: SubmitHandler<${name}FormData> = async (data) => {
    await onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} noValidate>
      {/* IMPLEMENT[${hasZod ? "2" : "3"}]: Render form fields using register() */}
      {/* Example:
      <div>
        <label htmlFor="fieldName">Label</label>
        <input id="fieldName" {...register('fieldName')} />
        {errors.fieldName && <span>{errors.fieldName.message}</span>}
      </div>
      */}

      ${fileUpload ? `{/* File Upload Field */}
      <div>
        <label htmlFor="file">Upload File</label>
        <input
          id="file"
          type="file"
          {...register('file')}
          accept="image/*,application/pdf"
        />
        {/* IMPLEMENT: Show upload progress */}
      </div>` : ""}

      <button type="submit" disabled={isSubmitting || isLoading}>
        {isSubmitting || isLoading ? 'Saving…' : 'Submit'}
      </button>
    </form>
  );
}
`;
    }

    if (lib === "Formik") {
      return `import React from 'react';
import { Formik, Form, Field, ErrorMessage, FormikHelpers } from 'formik';
${validation === "Yup" ? "import * as Yup from 'yup';" : ""}

// IMPLEMENT[1]: Define form values type
type ${name}Values = {
  // add form fields
};

const initialValues: ${name}Values = {
  // IMPLEMENT[2]: Set initial field values
};

${validation === "Yup" ? `// IMPLEMENT[3]: Define Yup validation schema
const validationSchema = Yup.object({
  // e.g. name: Yup.string().required('Required'),
});` : ""}

type ${name}Props = {
  onSubmit: (values: ${name}Values) => Promise<void> | void;
};

export default function ${name}({ onSubmit }: ${name}Props) {
  const handleSubmit = async (values: ${name}Values, helpers: FormikHelpers<${name}Values>) => {
    try {
      await onSubmit(values);
    } finally {
      helpers.setSubmitting(false);
    }
  };

  return (
    <Formik initialValues={initialValues} ${validation === "Yup" ? "validationSchema={validationSchema}" : ""} onSubmit={handleSubmit}>
      {({ isSubmitting }) => (
        <Form>
          {/* IMPLEMENT[4]: Add form fields using Field, ErrorMessage */}
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Submit'}
          </button>
        </Form>
      )}
    </Formik>
  );
}
`;
    }
  }

  return null;
}

function scaffoldDataTable(ctx: ScaffoldContext): string {
  const lib = cfg(ctx, "library", "TanStack Table");
  const pagination = cfg(ctx, "pagination", "Server-side");
  const selection = cfg<boolean>(ctx, "selection", true);
  const exportCsv = cfg<boolean>(ctx, "export", false);
  const name = pascal(ctx.nodeName);

  if (ctx.language === "typescript" || ctx.language === "javascript") {
    if (lib === "TanStack Table") {
      return `import React, { useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  ${pagination === "Client-side" ? "getPaginationRowModel," : ""}
  ${pagination === "Infinite scroll" ? "" : ""}
  flexRender,
  ColumnDef,
  ${selection ? "RowSelectionState," : ""}
  PaginationState,
} from '@tanstack/react-table';
${exportCsv ? "import { exportToCsv } from '../utils/csvExport';" : ""}

// IMPLEMENT[1]: Define row data type
export type ${name}Row = {
  id: string;
  // add typed columns
};

// IMPLEMENT[2]: Define column definitions
const columns: ColumnDef<${name}Row>[] = [
  ${selection ? `{
    id: 'select',
    header: ({ table }) => (
      <input
        type="checkbox"
        checked={table.getIsAllRowsSelected()}
        onChange={table.getToggleAllRowsSelectedHandler()}
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        checked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler()}
      />
    ),
  },` : ""}
  // Example: { accessorKey: 'name', header: 'Name', cell: info => info.getValue() },
];

type ${name}Props = {
  data: ${name}Row[];
  totalRows${pagination === "Server-side" ? ": number" : "?: number"};
  ${pagination === "Server-side" ? "onPaginationChange: (page: number, pageSize: number) => void;" : ""}
  isLoading?: boolean;
};

export default function ${name}({ data, totalRows${pagination === "Server-side" ? ", onPaginationChange" : ""}, isLoading }: ${name}Props) {
  ${selection ? "const [rowSelection, setRowSelection] = useState<RowSelectionState>({});" : ""}
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });

  const table = useReactTable({
    data,
    columns,
    ${selection ? "state: { rowSelection, pagination }," : "state: { pagination },"}
    ${selection ? "onRowSelectionChange: setRowSelection," : ""}
    onPaginationChange: (updater) => {
      const next = typeof updater === 'function' ? updater(pagination) : updater;
      setPagination(next);
      ${pagination === "Server-side" ? "onPaginationChange(next.pageIndex, next.pageSize);" : ""}
    },
    getCoreRowModel: getCoreRowModel(),
    ${pagination === "Client-side" ? "getPaginationRowModel: getPaginationRowModel()," : ""}
    ${pagination === "Server-side" ? `manualPagination: true,\n    pageCount: Math.ceil(totalRows / pagination.pageSize),` : ""}
  });

  return (
    <div>
      ${exportCsv ? `<button onClick={() => exportToCsv(data, '${name.toLowerCase()}-export.csv')}>
        Export CSV
      </button>` : ""}

      {isLoading ? (
        <div>Loading…</div>
      ) : (
        <table>
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(header => (
                  <th key={header.id}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr key={row.id}>
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Pagination Controls */}
      <div>
        <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
          Previous
        </button>
        <span>Page {pagination.pageIndex + 1} of {table.getPageCount()}</span>
        <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
          Next
        </button>
      </div>
    </div>
  );
}
`;
    }
  }

  return null;
}

function scaffoldStateStore(ctx: ScaffoldContext): string {
  const lib = cfg(ctx, "library", "Zustand");
  const devtools = cfg<boolean>(ctx, "devtools", true);
  const persist = cfg<boolean>(ctx, "persist", false);
  const name = pascal(ctx.nodeName);

  if (ctx.language === "typescript" || ctx.language === "javascript") {
    if (lib === "Zustand") {
      return `import { create } from 'zustand';
${devtools ? "import { devtools } from 'zustand/middleware';" : ""}
${persist ? "import { persist } from 'zustand/middleware';" : ""}

// IMPLEMENT[1]: Define your store state type
type ${name}State = {
  // add state fields
};

// IMPLEMENT[2]: Define store actions type
type ${name}Actions = {
  // add action signatures, e.g.: setUser: (user: User) => void;
  reset: () => void;
};

type ${name}Store = ${name}State & ${name}Actions;

const initialState: ${name}State = {
  // IMPLEMENT[3]: Set initial values
};

export const use${name} = create<${name}Store>()(
  ${devtools ? "devtools(" : ""}
  ${persist ? "persist(" : ""}
  (set, get) => ({
    ...initialState,

    reset: () => set(initialState),

    // IMPLEMENT[4]: Implement actions using set() and get()
    // Example:
    // setUser: (user) => set({ user }),
    // fetchUser: async (id) => {
    //   const user = await api.getUser(id);
    //   set({ user });
    // },
  }),
  ${persist ? `{ name: '${camel(ctx.nodeName)}-store' }` : ""}
  ${persist ? ")" : ""}
  ${devtools ? `{ name: '${name}Store' }` : ""}
  ${devtools ? ")" : ""}
);
`;
    }

    if (lib === "Redux Toolkit") {
      return `import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';

// IMPLEMENT[1]: Define state type
type ${name}State = {
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  // add domain state fields
};

const initialState: ${name}State = {
  status: 'idle',
  error: null,
  // IMPLEMENT[2]: Set initial values
};

// IMPLEMENT[3]: Create async thunks for API calls
// export const fetch${name}Data = createAsyncThunk('${camel(ctx.nodeName)}/fetch', async () => {
//   return api.getAll();
// });

export const ${camel(ctx.nodeName)}Slice = createSlice({
  name: '${camel(ctx.nodeName)}',
  initialState,
  reducers: {
    reset: () => initialState,
    // IMPLEMENT[4]: Add synchronous actions
  },
  extraReducers: (builder) => {
    // IMPLEMENT[5]: Handle async thunk states (pending/fulfilled/rejected)
  },
});

export const { reset } = ${camel(ctx.nodeName)}Slice.actions;
export default ${camel(ctx.nodeName)}Slice.reducer;

// Selectors
export const select${name}Status = (state: any) => state.${camel(ctx.nodeName)}.status;
// IMPLEMENT[6]: Add typed selectors
`;
    }

    if (lib === "Jotai") {
      return `import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
${persist ? "import { atomWithStorage } from 'jotai/utils';" : ""}

// IMPLEMENT[1]: Define atoms for your state
// export const userAtom = atom<User | null>(null);
// export const loadingAtom = atom(false);

${persist ? `// Persisted atom example
// export const settingsAtom = atomWithStorage('${camel(ctx.nodeName)}-settings', defaultSettings);` : ""}

// IMPLEMENT[2]: Define derived/computed atoms
// export const isAuthenticatedAtom = atom(get => get(userAtom) !== null);

// IMPLEMENT[3]: Define writable derived atoms for actions
// export const loginAtom = atom(null, async (get, set, credentials) => {
//   set(loadingAtom, true);
//   const user = await api.login(credentials);
//   set(userAtom, user);
//   set(loadingAtom, false);
// });

// Export atoms for use in components
`;
    }
  }

  return null;
}

function scaffoldClientApi(ctx: ScaffoldContext): string {
  const transport = cfg(ctx, "transport", "fetch (native)");
  const cache = cfg(ctx, "cache", "React Query");
  const auth = cfg<boolean>(ctx, "auth", true);
  const retry = cfg<boolean>(ctx, "retry", false);

  if (ctx.language === "typescript" || ctx.language === "javascript") {
    const useAxios = transport === "axios";

    if (cache === "React Query") {
      return `${useAxios ? "import axios from 'axios';" : ""}
import { QueryClient, QueryClientProvider, useQuery, useMutation } from '@tanstack/react-query';

// ── HTTP Client ───────────────────────────────────────────────────────────────
${useAxios ? `const http = axios.create({
  baseURL: process.env.VITE_API_URL ?? '/api',
  headers: { 'Content-Type': 'application/json' },
});

${auth ? `http.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = \`Bearer \${token}\`;
  return config;
});

http.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) {
      // IMPLEMENT[1]: Refresh token and retry, or redirect to login
    }
    return Promise.reject(err);
  },
);` : ""}` : `const BASE_URL = (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_API_URL : process.env.VITE_API_URL) ?? '/api';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  ${auth ? `const token = localStorage.getItem('access_token');
  if (token) headers['Authorization'] = \`Bearer \${token}\`;` : ""}
  const response = await fetch(\`\${BASE_URL}\${path}\`, { ...options, headers });
  if (!response.ok) throw new Error(\`\${response.status} \${response.statusText}\`);
  return response.json() as Promise<T>;
}

export const http = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};`}

// ── Query Client ──────────────────────────────────────────────────────────────
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      ${retry ? "retry: 2," : "retry: false,"}
      refetchOnWindowFocus: false,
    },
  },
});

// ── API Functions ─────────────────────────────────────────────────────────────
// IMPLEMENT[2]: Add typed API functions here. Example:
// export const api = {
//   getUsers: () => http.get<User[]>('/users'),
//   getUserById: (id: string) => http.get<User>(\`/users/\${id}\`),
//   createUser: (data: CreateUserDto) => http.post<User>('/users', data),
//   updateUser: (id: string, data: UpdateUserDto) => http.put<User>(\`/users/\${id}\`, data),
//   deleteUser: (id: string) => http.delete<void>(\`/users/\${id}\`),
// };

// ── React Query Hooks ─────────────────────────────────────────────────────────
// IMPLEMENT[3]: Add typed hooks that wrap useQuery/useMutation. Example:
// export function useUsers() {
//   return useQuery({ queryKey: ['users'], queryFn: api.getUsers });
// }
// export function useCreateUser() {
//   return useMutation({
//     mutationFn: api.createUser,
//     onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
//   });
// }

export { QueryClientProvider };
`;
    }
  }

  return null;
}

function scaffoldRouter(ctx: ScaffoldContext): string {
  const lib = cfg(ctx, "library", "React Router v6");
  const lazy = cfg<boolean>(ctx, "lazy", true);
  const authGuard = cfg<boolean>(ctx, "auth_guard", true);

  if (ctx.language === "typescript" || ctx.language === "javascript") {
    if (lib === "React Router v6") {
      return `import React${lazy ? ", { lazy, Suspense }" : ""} from 'react';
import { createBrowserRouter, RouterProvider, Outlet, Navigate } from 'react-router-dom';
${authGuard ? "import { useAuthStore } from './stores/auth.store';" : ""}

${authGuard ? `// ── Auth Guard ────────────────────────────────────────────────────────────────
function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}` : ""}

${lazy ? `// ── Lazy Pages ────────────────────────────────────────────────────────────────
// IMPLEMENT[1]: Add lazy-loaded page components
// const HomePage = lazy(() => import('./pages/HomePage'));
// const DashboardPage = lazy(() => import('./pages/DashboardPage'));
// const LoginPage = lazy(() => import('./pages/LoginPage'));
` : ""}

// ── Routes ────────────────────────────────────────────────────────────────────
// IMPLEMENT[${lazy ? "2" : "1"}]: Define all application routes
export const router = createBrowserRouter([
  {
    path: '/',
    element: ${lazy ? `<Suspense fallback={<div>Loading…</div>}><Outlet /></Suspense>` : "<Outlet />"},
    children: [
      ${authGuard ? `{
        element: <ProtectedRoute />,
        children: [
          // IMPLEMENT: Protected routes go here
          // { path: 'dashboard', element: <DashboardPage /> },
        ],
      },` : ""}
      // IMPLEMENT: Public routes go here
      // { path: 'login', element: <LoginPage /> },
      // { index: true, element: <HomePage /> },
    ],
  },
]);

export default function AppRouter() {
  return <RouterProvider router={router} />;
}
`;
    }
  }

  return null;
}

function scaffoldMicroservice(ctx: ScaffoldContext): string {
  const pattern = cfg(ctx, "pattern", "Layered (N-tier)");
  const health = cfg<boolean>(ctx, "health", true);
  const name = pascal(ctx.nodeName);
  const f = fw(ctx);

  if (ctx.language === "typescript" || ctx.language === "javascript") {
    const isHex = pattern.includes("Hexagonal");
    const isCQRS = pattern.includes("CQRS");

    if (f.includes("nestjs") || f.includes("nest")) {
      return `// NestJS Microservice — ${pattern}
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('${ctx.nodeName}')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

// === FILE: src/app.module.ts ===
import { Module } from '@nestjs/common';
${health ? "import { TerminusModule } from '@nestjs/terminus';\nimport { HealthController } from './health/health.controller';" : ""}

@Module({
  imports: [
    ${health ? "TerminusModule," : ""}
    // IMPLEMENT[1]: Import feature modules
  ],
  controllers: [${health ? "HealthController" : ""}],
})
export class AppModule {}

${health ? `// === FILE: src/health/health.controller.ts ===
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HttpHealthIndicator } from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(private health: HealthCheckService) {}

  @Get()
  @HealthCheck()
  check() { return this.health.check([]); }
}` : ""}
`;
    }

    // Express default with chosen pattern
    return `import express from 'express';
import type { Server } from 'http';

${isHex ? `// ── Hexagonal Architecture: Ports (interfaces) ───────────────────────────────
// IMPLEMENT[1]: Define port interfaces in src/ports/
// export interface I${name}Repository { ... }  // driven port
// export interface I${name}Notifier { ... }     // driven port` : ""}
${isCQRS ? `// ── CQRS: Commands & Queries ─────────────────────────────────────────────────
// IMPLEMENT[1]: Define commands in src/commands/, queries in src/queries/
// export type Create${name}Command = { type: 'Create${name}'; payload: ... };
// export type Get${name}Query = { type: 'Get${name}'; id: string };` : ""}

export class ${name}Service {
  private app = express();
  private server?: Server;

  constructor(private readonly port = Number(process.env.PORT ?? 3000)) {
    this.app.use(express.json());
    this.app.use(require('cors')());
    this.registerRoutes();
  }

  private registerRoutes() {
    ${health ? `this.app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));` : ""}
    // IMPLEMENT[${isHex || isCQRS ? "2" : "1"}]: Mount domain routers
  }

  async start(): Promise<void> {
    this.server = this.app.listen(this.port, () =>
      console.log(\`[${ctx.nodeName}] listening on \${this.port}\`)
    );
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      this.server?.close(err => (err ? reject(err) : resolve()))
    );
  }
}

if (require.main === module) {
  const svc = new ${name}Service();
  svc.start();
  process.on('SIGTERM', () => svc.stop());
}
`;
  }

  if (ctx.language === "python") {
    return `import uvicorn
from fastapi import FastAPI
from contextlib import asynccontextmanager
${health ? "from fastapi.responses import JSONResponse" : ""}

# IMPLEMENT[1]: Import and configure app dependencies (DB, cache, etc.)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # IMPLEMENT[2]: Startup — connect to database, cache, etc.
    yield
    # IMPLEMENT[3]: Shutdown — close connections

app = FastAPI(title="${ctx.nodeName}", lifespan=lifespan)

${health ? `@app.get("/health")
async def health(): return {"status": "ok"}
` : ""}

# IMPLEMENT[4]: Include feature routers
# app.include_router(${camel(ctx.nodeName)}_router, prefix="/api/${camel(ctx.nodeName).toLowerCase()}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(__import__('os').getenv("PORT", 3000)))
`;
  }

  return null;
}

// ─── worker scaffold ──────────────────────────────────────────────────────────

function scaffoldWorker(ctx: ScaffoldContext): string {
  const concurrency = cfg<number>(ctx, "concurrency", 5);
  const maxRetries = cfg<number>(ctx, "max_retries", 3);
  const backoff = cfg(ctx, "backoff", "Exponential");
  const dlq = cfg<boolean>(ctx, "dead_letter", true);
  const name = pascal(ctx.nodeName);

  if (ctx.language === "typescript" || ctx.language === "javascript") {
    return `export type JobType = string; // IMPLEMENT[1]: Replace with union of job type strings

export interface Job {
  id: string;
  type: JobType;
  payload: unknown;
  attempts: number;
  createdAt: Date;
}

export interface IJobQueue {
  dequeue(): Promise<Job | null>;
  ack(jobId: string): Promise<void>;
  nack(jobId: string): Promise<void>;
  ${dlq ? "moveToDlq(job: Job, reason: string): Promise<void>;" : ""}
}

type JobHandler = (job: Job) => Promise<void>;

export class ${name} {
  private running = false;
  private readonly handlers = new Map<JobType, JobHandler>();

  constructor(
    private readonly queue: IJobQueue,
    private readonly concurrency = ${concurrency},
    private readonly maxRetries = ${maxRetries},
  ) {}

  register(type: JobType, handler: JobHandler): this {
    this.handlers.set(type, handler);
    return this;
  }

  async start(): Promise<void> {
    this.running = true;
    await Promise.all(
      Array.from({ length: this.concurrency }, () => this.loop())
    );
  }

  stop(): void { this.running = false; }

  private async loop(): Promise<void> {
    while (this.running) {
      const job = await this.queue.dequeue();
      if (!job) { await this.sleep(1000); continue; }
      await this.process(job);
    }
  }

  private async process(job: Job): Promise<void> {
    const handler = this.handlers.get(job.type);
    if (!handler) {
      ${dlq ? `await this.queue.moveToDlq(job, \`No handler for job type: \${job.type}\`);` : `console.error(\`[worker] No handler for type: \${job.type}\`);`}
      return;
    }
    try {
      await handler(job);
      await this.queue.ack(job.id);
    } catch (err) {
      if (job.attempts >= this.maxRetries) {
        ${dlq ? `await this.queue.moveToDlq(job, String(err));` : "await this.queue.ack(job.id);"}
      } else {
        await this.sleep(this.backoffDelay(job.attempts));
        await this.queue.nack(job.id);
      }
    }
  }

  private backoffDelay(attempt: number): number {
    ${backoff === "Exponential" ? "return Math.min(1000 * Math.pow(2, attempt), 30000);" : ""}
    ${backoff === "Linear" ? "return 1000 * (attempt + 1);" : ""}
    ${backoff === "Fixed" ? "return 2000;" : ""}
  }

  private sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
}

// IMPLEMENT[2]: Register job handlers at startup:
// const worker = new ${name}(queue);
// worker.register('send-email', async (job) => { ... });
// worker.register('generate-report', async (job) => { ... });
// worker.start();
`;
  }

  return null;
}

// ─── public API ───────────────────────────────────────────────────────────────

const scaffoldRegistry: Record<string, (ctx: ScaffoldContext) => string | null> = {
  api: scaffoldApi,
  microservice: scaffoldMicroservice,
  database: scaffoldDatabase,
  sql_database: scaffoldDatabase,
  nosql_database: scaffoldNoSqlDatabase,
  auth: scaffoldAuth,
  cache: scaffoldCache,
  queue: scaffoldQueue,
  worker: scaffoldWorker,
  scheduler: (ctx) => {
    const tz = cfg(ctx, "timezone", "UTC");
    const lockStore = cfg(ctx, "lock_store", "None");
    const name = pascal(ctx.nodeName);
    if (ctx.language === "typescript" || ctx.language === "javascript") {
      return `import cron from 'node-cron';
${lockStore !== "None" ? `import { acquireLock, releaseLock } from './lock';` : ""}

type Task = { name: string; expression: string; fn: () => Promise<void>; task?: cron.ScheduledTask };

export class ${name} {
  private tasks: Task[] = [];

  register(name: string, expression: string, fn: () => Promise<void>): this {
    this.tasks.push({ name, expression, fn });
    return this;
  }

  start(): void {
    for (const t of this.tasks) {
      t.task = cron.schedule(
        t.expression,
        async () => {
          ${lockStore !== "None" ? `const lock = await acquireLock(t.name);
          if (!lock) { console.log(\`[scheduler] \${t.name} skipped — lock held\`); return; }` : ""}
          try { await t.fn(); }
          catch (err) { console.error(\`[scheduler] \${t.name} failed:\`, err); }
          ${lockStore !== "None" ? "finally { await releaseLock(t.name); }" : ""}
        },
        { timezone: '${tz}' },
      );
    }
  }

  stop(): void { this.tasks.forEach(t => t.task?.destroy()); }
}

// IMPLEMENT[1]: Register your scheduled tasks:
// const scheduler = new ${name}();
// scheduler.register('daily-report', '0 9 * * *', async () => { ... });
// scheduler.register('cleanup', '0 * * * *', async () => { ... });
// scheduler.start();
`;
    }
    return null;
  },
  form_module: scaffoldFormModule,
  data_table: scaffoldDataTable,
  state_store: scaffoldStateStore,
  client_api: scaffoldClientApi,
  router: scaffoldRouter,
};

export function getCodeScaffold(ctx: ScaffoldContext): string | null {
  const handler = scaffoldRegistry[ctx.nodeType];
  if (!handler) return null;
  try {
    return handler(ctx);
  } catch {
    return null;
  }
}
