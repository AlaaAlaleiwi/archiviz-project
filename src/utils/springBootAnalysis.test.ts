import { describe, it, expect } from "vitest";
import {
  extractRoutes,
  analyzeSecurity,
  analyzeMessageQueue,
  analyzeHttpRequestClient,
  analyzeModule,
  analyzeDocker,
  analyzeTests,
  analyzeSpringBootComponent,
} from "./springBootAnalysis";

describe("extractRoutes", () => {
  it("extracts GET and POST routes from controller", () => {
    const content = `
      @RestController
      @RequestMapping("/api/users")
      public class UserController {
        @GetMapping("/{id}")
        public User getUser(@PathVariable Long id) { return null; }

        @PostMapping
        public User create(@RequestBody User user) { return null; }
      }`;
    const routes = extractRoutes("src/main/java/UserController.java", content);

    expect(routes).toHaveLength(2);
    expect(routes[0].httpMethod).toBe("GET");
    expect(routes[1].httpMethod).toBe("POST");
  });

  it("uses class-level RequestMapping as base path", () => {
    const content = `
      @GetMapping("/{id}")
      @RequestMapping("/api/users")`;
    const routes = extractRoutes("UserController.java", content);
    expect(routes[0].path).toBe("/{id}");
  });

  it("returns empty array for non-controller files", () => {
    const routes = extractRoutes("Service.java", "public class Service {}");
    expect(routes).toEqual([]);
  });
});

describe("analyzeSecurity", () => {
  it("detects @EnableWebSecurity", () => {
    const content = `
      @EnableWebSecurity
      public class SecurityConfig {
        @Bean
        public SecurityFilterChain filterChain() { return null; }
      }`;
    const result = analyzeSecurity("SecurityConfig.java", content);
    expect(result.hasSecurity).toBe(true);
    expect(result.annotations).toContain("@EnableWebSecurity");
    expect(result.configClass).toBe("SecurityConfig");
  });

  it("returns false for files without security", () => {
    const result = analyzeSecurity("Service.java", "public class Service {}");
    expect(result.hasSecurity).toBe(false);
    expect(result.sourceFile).toBeUndefined();
  });
});

describe("analyzeMessageQueue", () => {
  it("detects Kafka listeners", () => {
    const content = `
      @KafkaListener(topics = "orders")
      public void listen(String data) {}`;
    const result = analyzeMessageQueue("Listener.java", content);
    expect(result.hasKafka).toBe(true);
    expect(result.listeners.some(l => l.type === "kafka")).toBe(true);
  });

  it("detects RabbitMQ listeners", () => {
    const content = `
      @RabbitListener(queues = "orders-queue")
      public void handle(String data) {}`;
    const result = analyzeMessageQueue("Listener.java", content);
    expect(result.hasRabbit).toBe(true);
    expect(result.listeners.some(l => l.type === "rabbit")).toBe(true);
  });

  it("returns false when no message queue annotations", () => {
    const result = analyzeMessageQueue("Service.java", "public class Service {}");
    expect(result.hasKafka).toBe(false);
    expect(result.hasRabbit).toBe(false);
    expect(result.listeners).toEqual([]);
  });
});

describe("analyzeHttpRequestClient", () => {
  it("detects Feign clients", () => {
    const content = "@FeignClient(name = \"payment-service\")\npublic interface PaymentClient {}";
    const result = analyzeHttpRequestClient("Client.java", content);
    expect(result.hasFeign).toBe(true);
  });

  it("detects RestTemplate", () => {
    const result = analyzeHttpRequestClient("Service.java", "RestTemplate restTemplate = new RestTemplate();");
    expect(result.hasRestTemplate).toBe(true);
  });

  it("detects WebClient", () => {
    const result = analyzeHttpRequestClient("Service.java", "WebClient webClient = WebClient.create();");
    expect(result.hasWebClient).toBe(true);
  });

  it("returns false when no HTTP client annotations", () => {
    const result = analyzeHttpRequestClient("Service.java", "public class Service {}");
    expect(result.hasFeign).toBe(false);
    expect(result.hasRestTemplate).toBe(false);
    expect(result.hasWebClient).toBe(false);
  });
});

describe("analyzeModule", () => {
  it("detects Maven modules", () => {
    const result = analyzeModule("pom.xml", "<project><parent>spring-boot-starter-parent</parent></project>");
    expect(result.isMavenModule).toBe(true);
    expect(result.isSpringBootApp).toBe(true);
  });

  it("detects Gradle modules", () => {
    const result = analyzeModule("build.gradle", "plugins { id 'org.springframework.boot' }");
    expect(result.isGradleModule).toBe(true);
    expect(result.isSpringBootApp).toBe(true);
  });

  it("detects Spring Boot application class", () => {
    const content = "@SpringBootApplication\npublic class Application { public static void main(String[] args) {} }";
    const result = analyzeModule("Application.java", content);
    expect(result.isSpringBootApp).toBe(true);
    expect(result.mainClass).toBe("Application");
  });
});

describe("analyzeDocker", () => {
  it("detects Dockerfile", () => {
    const result = analyzeDocker("Dockerfile", "FROM openjdk:17-jdk\nCOPY . /app");
    expect(result.hasDockerfile).toBe(true);
  });

  it("detects docker-compose.yml with services", () => {
    const content = `
services:
  app:
    image: myapp
  postgres:
    image: postgres`;
    const result = analyzeDocker("docker-compose.yml", content);
    expect(result.hasComposeFile).toBe(true);
    expect(result.composeServices).toContain("app");
    expect(result.composeServices).toContain("postgres");
  });
});

describe("analyzeTests", () => {
  it("detects JUnit tests", () => {
    const content = `
      @SpringBootTest
      class UserServiceTest {
        @Test void shouldDoSomething() {}
      }`;
    const result = analyzeTests("UserServiceTest.java", content);
    expect(result.hasTests).toBe(true);
    expect(result.testCount).toBe(1);
    expect(result.frameworks).toContain("spring-test");
  });

  it("returns zero for non-test files", () => {
    const result = analyzeTests("Service.java", "public class Service {}");
    expect(result.hasTests).toBe(false);
    expect(result.testCount).toBe(0);
  });
});

describe("analyzeSpringBootComponent", () => {
  it("classifies controller files", () => {
    const content = `@RestController
public class UserController {
  @GetMapping("/users")
  public List<User> getUsers() { return null; }
}`;
    const result = analyzeSpringBootComponent("UserController.java", content);
    expect(result.component.kind).toBe("controller");
    expect(result.component.confidence).toBe("high");
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0].path).toBe("/users");
  });

  it("classifies repository files", () => {
    const content = "@Repository\npublic class UserRepository extends JpaRepository<User, Long> {}";
    const result = analyzeSpringBootComponent("UserRepository.java", content);
    expect(result.component.kind).toBe("repository");
  });

  it("classifies entity files", () => {
    const content = "@Entity\n@Table(name = \"users\")\npublic class User {}";
    const result = analyzeSpringBootComponent("User.java", content);
    expect(result.component.kind).toBe("entity");
  });

  it("classifies security config files", () => {
    const content = "@EnableWebSecurity\n@Configuration\npublic class SecurityConfig {}";
    const result = analyzeSpringBootComponent("SecurityConfig.java", content);
    expect(result.component.kind).toBe("security");
    expect(result.security.hasSecurity).toBe(true);
  });

  it("classifies service files", () => {
    const content = "@Service\npublic class UserService {}";
    const result = analyzeSpringBootComponent("UserService.java", content);
    expect(result.component.kind).toBe("service");
  });

  it("classifies Kafka listener files", () => {
    const content = `@KafkaListener(topics = "orders")
public void listen(String data) {}`;
    const result = analyzeSpringBootComponent("OrderListener.java", content);
    expect(result.component.kind).toBe("queue_listener");
    expect(result.messageQueue.hasKafka).toBe(true);
  });

  it("classifies test files", () => {
    const result = analyzeSpringBootComponent("UserServiceTest.java", "public class UserServiceTest {}");
    expect(result.component.kind).toBe("test");
  });
});
