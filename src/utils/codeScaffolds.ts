import type { JavaVersion, SpringBootVersion } from "../types";

export type ScaffoldContext = {
  nodeName: string;
  nodeType: string;
  javaVersion: JavaVersion;
  springBootVersion: SpringBootVersion;
  config: Record<string, unknown>;
  projectName: string;
};

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

function pkg(ctx: ScaffoldContext) {
  return ctx.projectName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "") || "app";
}

// ─── API / Microservice ───────────────────────────────────────────────────────

function scaffoldApi(ctx: ScaffoldContext): string {
  const name = pascal(ctx.nodeName);
  const base = `com.${pkg(ctx)}.${camel(ctx.nodeName).toLowerCase()}`;

  return `package ${base}.controller;

import ${base}.dto.${name}Request;
import ${base}.dto.${name}Response;
import ${base}.service.${name}Service;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "${name}")
@RestController
@RequestMapping("/api/${camel(ctx.nodeName).toLowerCase()}")
@RequiredArgsConstructor
public class ${name}Controller {

    private final ${name}Service service;

    @GetMapping("/health")
    @Operation(summary = "Health check")
    public java.util.Map<String, String> health() {
        return java.util.Map.of("status", "ok");
    }

    @GetMapping
    public List<${name}Response> findAll() {
        return service.findAll();
    }

    @GetMapping("/{id}")
    public ${name}Response findById(@PathVariable String id) {
        return service.findById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ${name}Response create(@Valid @RequestBody ${name}Request request) {
        return service.create(request);
    }

    @PutMapping("/{id}")
    public ${name}Response update(@PathVariable String id,
                                   @Valid @RequestBody ${name}Request request) {
        return service.update(id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String id) {
        service.delete(id);
    }
}
`;
}

// ─── Database (JPA Entity + Repository scaffold) ──────────────────────────────

function scaffoldDatabase(ctx: ScaffoldContext): string {
  const name = pascal(ctx.nodeName);
  const orm = cfg(ctx, "orm", "Spring Data JPA");
  const engine = cfg(ctx, "engine", "PostgreSQL");
  const poolMax = cfg<number>(ctx, "pool_max", 10);
  const migrations = cfg<boolean>(ctx, "migrations", true);
  const base = `com.${pkg(ctx)}.${camel(ctx.nodeName).toLowerCase()}`;

  return `package ${base};

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;

// ${orm} — ${engine}
@Entity
@Table(name = "${ctx.nodeName.toLowerCase().replace(/\s+/g, "_")}")
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

    // IMPLEMENT[1]: Add domain-specific fields with appropriate JPA constraints
    // Example:
    // @Column(nullable = false, length = 255)
    // private String name;
}

// === FILE: src/main/java/${base.replace(/\./g, "/")}/${name}Repository.java ===
package ${base};

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ${name}Repository extends JpaRepository<${name}Entity, String> {
    // IMPLEMENT[2]: Add custom query methods
    // List<${name}Entity> findByNameContainingIgnoreCase(String name);
    // @Query("SELECT e FROM ${name}Entity e WHERE e.field = :value")
    // List<${name}Entity> findByCustomField(@Param("value") String value);
}

// === FILE: src/main/resources/application.yml ===
spring:
  datasource:
    url: \${SPRING_DATASOURCE_URL:jdbc:${engine === "PostgreSQL" ? "postgresql" : engine === "MySQL" ? "mysql" : "postgresql"}://localhost:5432/${pkg(ctx)}}
    username: \${SPRING_DATASOURCE_USERNAME:postgres}
    password: \${SPRING_DATASOURCE_PASSWORD:}
    hikari:
      maximum-pool-size: ${poolMax}
  jpa:
    hibernate:
      ddl-auto: validate
    show-sql: false
  flyway:
    enabled: ${migrations}
    locations: classpath:db/migration
`;
}

// ─── Auth (Spring Security + JWT) ────────────────────────────────────────────

function scaffoldAuth(ctx: ScaffoldContext): string {
  const tokenExpiry = cfg<string>(ctx, "token_expiry", "15m");
  const mfa = cfg<boolean>(ctx, "mfa", false);
  const expiryMs = tokenExpiry === "5m" ? "300000" : tokenExpiry === "30m" ? "1800000" : tokenExpiry === "1h" ? "3600000" : tokenExpiry === "24h" ? "86400000" : "900000";
  const base = `com.${pkg(ctx)}.auth`;

  return `package ${base};

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthResponse register(@Valid @RequestBody RegisterRequest request) {
        return authService.register(request);
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }

    @PostMapping("/refresh")
    public AuthResponse refresh(@RequestBody RefreshRequest request) {
        return authService.refresh(request.getRefreshToken());
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@RequestHeader("Authorization") String bearerToken) {
        // IMPLEMENT[1]: Invalidate token (add to denylist in Redis/DB)
    }
    ${mfa ? `
    @PostMapping("/mfa/setup")
    public MfaSetupResponse mfaSetup(@RequestAttribute("userId") String userId) {
        // IMPLEMENT[2]: Generate TOTP secret, return QR code URI (use Google Authenticator library)
        throw new UnsupportedOperationException("Not implemented");
    }

    @PostMapping("/mfa/verify")
    public AuthResponse mfaVerify(@Valid @RequestBody MfaVerifyRequest request) {
        // IMPLEMENT[3]: Validate TOTP token, issue full auth tokens
        throw new UnsupportedOperationException("Not implemented");
    }` : ""}
}

// === FILE: src/main/java/${base.replace(/\./g, "/")}/JwtService.java ===
package ${base};

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.security.Key;
import java.util.Date;

@Service
public class JwtService {

    @Value("\${jwt.secret}")
    private String secret;

    @Value("\${jwt.access-token-expiry:${expiryMs}}")
    private long accessTokenExpiry;

    @Value("\${jwt.refresh-token-expiry:604800000}")
    private long refreshTokenExpiry;

    private Key signingKey() {
        return Keys.hmacShaKeyFor(secret.getBytes());
    }

    public String generateAccessToken(String subject) {
        return buildToken(subject, accessTokenExpiry);
    }

    public String generateRefreshToken(String subject) {
        return buildToken(subject, refreshTokenExpiry);
    }

    private String buildToken(String subject, long expiryMs) {
        return Jwts.builder()
            .setSubject(subject)
            .setIssuedAt(new Date())
            .setExpiration(new Date(System.currentTimeMillis() + expiryMs))
            .signWith(signingKey())
            .compact();
    }

    public Claims validateToken(String token) {
        return Jwts.parserBuilder()
            .setSigningKey(signingKey())
            .build()
            .parseClaimsJws(token)
            .getBody();
    }
}

// === FILE: src/main/java/${base.replace(/\./g, "/")}/AuthService.java ===
package ${base};

import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class AuthService {

    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    // IMPLEMENT[4]: Inject UserRepository

    public AuthResponse register(RegisterRequest request) {
        // IMPLEMENT[5]: Check email uniqueness, hash password, persist user, return tokens
        throw new UnsupportedOperationException("Not implemented");
    }

    public AuthResponse login(LoginRequest request) {
        // IMPLEMENT[6]: Load user, verify password, return tokens
        throw new UnsupportedOperationException("Not implemented");
    }

    public AuthResponse refresh(String refreshToken) {
        // IMPLEMENT[7]: Validate refresh token, generate new access token
        throw new UnsupportedOperationException("Not implemented");
    }
}
`;
}

// ─── Cache (Spring Cache + Redis) ─────────────────────────────────────────────

function scaffoldCache(ctx: ScaffoldContext): string {
  const engine = cfg(ctx, "engine", "Redis");
  const ttl = cfg<number>(ctx, "default_ttl", 300);
  const base = `com.${pkg(ctx)}.cache`;

  return `package ${base};

import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext;

import java.time.Duration;

// ${engine} cache configuration
@Configuration
@EnableCaching
public class CacheConfig {

    @Bean
    public RedisCacheManager cacheManager(RedisConnectionFactory factory) {
        RedisCacheConfiguration config = RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(Duration.ofSeconds(${ttl}))
            .serializeValuesWith(
                RedisSerializationContext.SerializationPair.fromSerializer(
                    new GenericJackson2JsonRedisSerializer()
                )
            );
        return RedisCacheManager.builder(factory)
            .cacheDefaults(config)
            .build();
    }
}

// === FILE: src/main/java/${base.replace(/\./g, "/")}/CacheService.java ===
package ${base};

import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class CacheService {

    private final RedisTemplate<String, Object> redisTemplate;

    public <T> Optional<T> get(String key, Class<T> type) {
        Object value = redisTemplate.opsForValue().get(key);
        return Optional.ofNullable(type.cast(value));
    }

    public void set(String key, Object value, Duration ttl) {
        redisTemplate.opsForValue().set(key, value, ttl);
    }

    public void evict(String key) {
        redisTemplate.delete(key);
    }

    // IMPLEMENT[1]: Add domain-specific cache methods (e.g. cacheUser, evictUser)
    // Use @Cacheable, @CachePut, @CacheEvict on service methods for declarative caching
}
`;
}

// ─── Queue / Message Broker (Spring AMQP / Spring Kafka) ─────────────────────

function scaffoldQueue(ctx: ScaffoldContext): string {
  const engine = cfg(ctx, "engine", "BullMQ (Redis)");
  const name = pascal(ctx.nodeName);
  const base = `com.${pkg(ctx)}.${camel(ctx.nodeName).toLowerCase()}`;

  const isKafka = engine.includes("Kafka") || engine.includes("MSK");

  if (isKafka) {
    return `package ${base};

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class ${name}Consumer {

    private static final String TOPIC = "${ctx.nodeName.toLowerCase().replace(/\s+/g, "-")}";

    @KafkaListener(topics = TOPIC, groupId = "\${spring.kafka.consumer.group-id}")
    public void consume(String message) {
        log.info("[{}] Received: {}", TOPIC, message);
        // IMPLEMENT[1]: Deserialize message (JSON → DTO) and delegate to service
    }
}

// === FILE: src/main/java/${base.replace(/\./g, "/")}/${name}Producer.java ===
package ${base};

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class ${name}Producer {

    private static final String TOPIC = "${ctx.nodeName.toLowerCase().replace(/\s+/g, "-")}";
    private final KafkaTemplate<String, String> kafkaTemplate;

    public void publish(String key, Object payload) {
        // IMPLEMENT[2]: Serialize payload to JSON and send
        kafkaTemplate.send(TOPIC, key, payload.toString());
        log.info("[{}] Published: key={}", TOPIC, key);
    }
}
`;
  }

  // Default: RabbitMQ / AMQP
  return `package ${base};

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.stereotype.Component;

@Configuration
public class ${name}QueueConfig {

    public static final String QUEUE   = "${ctx.nodeName.toLowerCase().replace(/\s+/g, ".")}";
    public static final String DLQ     = QUEUE + ".dlq";
    public static final String EXCHANGE = "${ctx.nodeName.toLowerCase().replace(/\s+/g, ".")}.exchange";

    @Bean Queue ${camel(ctx.nodeName)}Queue() {
        return QueueBuilder.durable(QUEUE)
            .withArgument("x-dead-letter-exchange", "")
            .withArgument("x-dead-letter-routing-key", DLQ)
            .build();
    }

    @Bean Queue ${camel(ctx.nodeName)}Dlq() { return new Queue(DLQ, true); }

    @Bean DirectExchange ${camel(ctx.nodeName)}Exchange() { return new DirectExchange(EXCHANGE); }

    @Bean Binding ${camel(ctx.nodeName)}Binding() {
        return BindingBuilder.bind(${camel(ctx.nodeName)}Queue()).to(${camel(ctx.nodeName)}Exchange()).with(QUEUE);
    }
}

// === FILE: src/main/java/${base.replace(/\./g, "/")}/${name}Consumer.java ===
package ${base};

import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class ${name}Consumer {

    @RabbitListener(queues = ${name}QueueConfig.QUEUE)
    public void consume(String message) {
        log.info("[{}] Received message", ${name}QueueConfig.QUEUE);
        // IMPLEMENT[1]: Deserialize message (JSON → DTO) and delegate to service
    }

    @RabbitListener(queues = ${name}QueueConfig.DLQ)
    public void consumeDlq(String message) {
        log.error("[DLQ] Dead-lettered message: {}", message);
        // IMPLEMENT[2]: Alert or store for manual reprocessing
    }
}

// === FILE: src/main/java/${base.replace(/\./g, "/")}/${name}Publisher.java ===
package ${base};

import lombok.RequiredArgsConstructor;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ${name}Publisher {

    private final RabbitTemplate rabbitTemplate;

    public void publish(Object payload) {
        // IMPLEMENT[3]: Serialize payload to JSON and publish
        rabbitTemplate.convertAndSend(
            ${name}QueueConfig.EXCHANGE,
            ${name}QueueConfig.QUEUE,
            payload
        );
    }
}
`;
}

// ─── Worker (@Async processing) ───────────────────────────────────────────────

function scaffoldWorker(ctx: ScaffoldContext): string {
  const concurrency = cfg<number>(ctx, "concurrency", 5);
  const name = pascal(ctx.nodeName);
  const base = `com.${pkg(ctx)}.${camel(ctx.nodeName).toLowerCase()}`;

  return `package ${base};

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Component;

import java.util.concurrent.Executor;

@Configuration
@EnableAsync
public class ${name}WorkerConfig {

    @Bean("${camel(ctx.nodeName)}Executor")
    public Executor executor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(${Math.max(2, Math.floor(concurrency / 2))});
        executor.setMaxPoolSize(${concurrency});
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("${camel(ctx.nodeName)}-worker-");
        executor.initialize();
        return executor;
    }
}

// === FILE: src/main/java/${base.replace(/\./g, "/")}/${name}Worker.java ===
package ${base};

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import java.util.concurrent.CompletableFuture;

@Slf4j
@Component
@RequiredArgsConstructor
public class ${name}Worker {

    @Async("${camel(ctx.nodeName)}Executor")
    public CompletableFuture<Void> process(String jobId, Object payload) {
        log.info("[{}] Processing job: {}", "${name}Worker", jobId);
        try {
            // IMPLEMENT[1]: Perform the background work here
            return CompletableFuture.completedFuture(null);
        } catch (Exception e) {
            log.error("[{}] Job {} failed: {}", "${name}Worker", jobId, e.getMessage(), e);
            return CompletableFuture.failedFuture(e);
        }
    }
}
`;
}

// ─── Microservice (Spring Boot main class + config) ───────────────────────────

function scaffoldMicroservice(ctx: ScaffoldContext): string {
  const health = cfg<boolean>(ctx, "health", true);
  const name = pascal(ctx.nodeName);
  const base = `com.${pkg(ctx)}`;

  return `package ${base};

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class ${name}Application {
    public static void main(String[] args) {
        SpringApplication.run(${name}Application.class, args);
    }
}

// === FILE: src/main/java/${base.replace(/\./g, "/")}/config/WebConfig.java ===
package ${base}.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
            .allowedOriginPatterns("\${cors.allowed-origins:*}")
            .allowedMethods("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS")
            .allowedHeaders("*")
            .allowCredentials(true);
    }
}

// === FILE: src/main/java/${base.replace(/\./g, "/")}/exception/GlobalExceptionHandler.java ===
package ${base}.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;
import java.util.stream.Collectors;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(NotFoundException.class)
    public ProblemDetail handleNotFound(NotFoundException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
        Map<String, String> errors = ex.getBindingResult().getFieldErrors().stream()
            .collect(Collectors.toMap(FieldError::getField, f -> f.getDefaultMessage() != null ? f.getDefaultMessage() : "Invalid"));
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Validation failed");
        pd.setProperty("errors", errors);
        return pd;
    }
}

// === FILE: src/main/java/${base.replace(/\./g, "/")}/exception/NotFoundException.java ===
package ${base}.exception;

public class NotFoundException extends RuntimeException {
    public NotFoundException(String message) {
        super(message);
    }
}
${health ? `
// === FILE: src/main/java/${base.replace(/\./g, "/")}/health/HealthController.java ===
package ${base}.health;

import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.stereotype.Component;

@Component
public class AppHealthIndicator implements HealthIndicator {

    @Override
    public Health health() {
        // IMPLEMENT: Add custom health checks (DB, external services, etc.)
        return Health.up().withDetail("service", "${name}").build();
    }
}
` : ""}`;
}

// ─── Scheduler (@Scheduled tasks) ────────────────────────────────────────────

function scaffoldScheduler(ctx: ScaffoldContext): string {
  const tz = cfg(ctx, "timezone", "UTC");
  const lockStore = cfg(ctx, "lock_store", "None");
  const name = pascal(ctx.nodeName);
  const base = `com.${pkg(ctx)}.${camel(ctx.nodeName).toLowerCase()}`;

  return `package ${base};

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@EnableScheduling
@RequiredArgsConstructor
public class ${name}Scheduler {
    ${lockStore !== "None" ? `
    // IMPLEMENT[1]: Inject ShedLock or Redis-based lock for distributed scheduling
    // @SchedulerLock(name = "task-name", lockAtMostFor = "PT30S")` : ""}

    @Scheduled(cron = "\${scheduler.${camel(ctx.nodeName)}.cron:0 0 * * * *}", zone = "${tz}")
    public void hourlyTask() {
        log.info("[{}] Running hourly task", "${name}Scheduler");
        // IMPLEMENT[${lockStore !== "None" ? "2" : "1"}]: Business logic here
    }

    @Scheduled(cron = "\${scheduler.${camel(ctx.nodeName)}.daily-cron:0 0 9 * * *}", zone = "${tz}")
    public void dailyTask() {
        log.info("[{}] Running daily task", "${name}Scheduler");
        // IMPLEMENT[${lockStore !== "None" ? "3" : "2"}]: Daily job logic here
    }
}

// === FILE: src/main/resources/application.yml ===
scheduler:
  ${camel(ctx.nodeName)}:
    cron: "0 0 * * * *"
    daily-cron: "0 0 9 * * *"

spring:
  task:
    scheduling:
      pool:
        size: 5
`;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

const scaffoldRegistry: Record<string, (ctx: ScaffoldContext) => string | null> = {
  api:            scaffoldApi,
  microservice:   scaffoldMicroservice,
  database:       scaffoldDatabase,
  sql_database:   scaffoldDatabase,
  auth:           scaffoldAuth,
  cache:          scaffoldCache,
  queue:          scaffoldQueue,
  message_broker: scaffoldQueue,
  worker:         scaffoldWorker,
  scheduler:      scaffoldScheduler,
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
