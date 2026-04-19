import type { Language } from "../types";

export type ScaffoldFile = { path: string; content: string };

interface ScaffoldOptions {
  projectName: string;
  language: Language;
  framework: string;
  buildTool: string;
  generatedFiles: ScaffoldFile[];
}

export class ProjectScaffoldService {
  generate(opts: ScaffoldOptions): ScaffoldFile[] {
    const files: ScaffoldFile[] = [];

    // Core scaffold per language
    switch (opts.language) {
      case "javascript":
      case "typescript":
        files.push(...this.nodeScaffold(opts));
        break;
      case "python":
        files.push(...this.pythonScaffold(opts));
        break;
      case "java":
        files.push(...this.javaScaffold(opts));
        break;
      case "cpp":
        files.push(...this.cppScaffold(opts));
        break;
    }

    // Universal files
    files.push(this.gitignore(opts.language));
    files.push(this.readme(opts));
    files.push(this.editorconfig());
    files.push(this.vscodeSettings(opts));
    files.push(this.vscodeExtensions(opts));

    return files;
  }

  // ─── Node.js / TypeScript ────────────────────────────────────────────────

  private nodeScaffold(opts: ScaffoldOptions): ScaffoldFile[] {
    const { projectName, language, framework, buildTool, generatedFiles } = opts;
    const isTS = language === "typescript";
    const isReact = ["React", "Next.js", "Vue", "Angular"].some(f => framework.includes(f));
    const srcFiles = generatedFiles.map(f => f.path);

    const deps: Record<string, string> = {};
    const devDeps: Record<string, string> = {};
    const scripts: Record<string, string> = {};

    // Base runtime deps by framework
    if (framework === "Express" || framework === "Node.js") {
      deps["express"] = "^4.18.2";
      deps["cors"] = "^2.8.5";
      deps["dotenv"] = "^16.4.5";
      if (isTS) {
        devDeps["@types/express"] = "^4.17.21";
        devDeps["@types/cors"] = "^2.8.17";
        devDeps["@types/node"] = "^20.12.7";
      }
    }
    if (framework === "NestJS") {
      deps["@nestjs/common"] = "^10.3.8";
      deps["@nestjs/core"] = "^10.3.8";
      deps["@nestjs/platform-express"] = "^10.3.8";
      deps["reflect-metadata"] = "^0.2.2";
      deps["rxjs"] = "^7.8.1";
      devDeps["@nestjs/cli"] = "^10.3.2";
      devDeps["@nestjs/schematics"] = "^10.1.1";
      devDeps["@types/node"] = "^20.12.7";
    }
    if (framework === "React") {
      deps["react"] = "^18.3.1";
      deps["react-dom"] = "^18.3.1";
      if (isTS) {
        devDeps["@types/react"] = "^18.3.1";
        devDeps["@types/react-dom"] = "^18.3.0";
      }
      devDeps["vite"] = "^5.2.11";
      devDeps["@vitejs/plugin-react"] = "^4.2.1";
    }
    if (framework === "Next.js") {
      deps["next"] = "^14.2.3";
      deps["react"] = "^18.3.1";
      deps["react-dom"] = "^18.3.1";
      if (isTS) {
        devDeps["@types/react"] = "^18.3.1";
        devDeps["@types/react-dom"] = "^18.3.0";
        devDeps["@types/node"] = "^20.12.7";
      }
    }
    if (framework === "Vue") {
      deps["vue"] = "^3.4.21";
      devDeps["@vitejs/plugin-vue"] = "^5.0.4";
      devDeps["vite"] = "^5.2.11";
    }

    // Common dev deps
    if (isTS) {
      devDeps["typescript"] = "^5.4.5";
      devDeps["ts-node"] = "^10.9.2";
      devDeps["tsx"] = "^4.10.2";
    }
    devDeps["eslint"] = "^8.57.0";

    // Scripts
    if (framework === "Next.js") {
      scripts["dev"] = "next dev";
      scripts["build"] = "next build";
      scripts["start"] = "next start";
      scripts["lint"] = "next lint";
    } else if (framework === "NestJS") {
      scripts["build"] = "nest build";
      scripts["start"] = "nest start";
      scripts["start:dev"] = "nest start --watch";
      scripts["start:prod"] = "node dist/main";
      scripts["lint"] = "eslint \"{src,apps,libs,test}/**/*.ts\"";
    } else if (isReact) {
      scripts["dev"] = "vite";
      scripts["build"] = "vite build";
      scripts["preview"] = "vite preview";
      scripts["lint"] = "eslint src";
    } else {
      scripts["start"] = isTS ? "tsx src/index.ts" : "node src/index.js";
      scripts["dev"] = isTS ? "tsx watch src/index.ts" : "node --watch src/index.js";
      scripts["build"] = isTS ? "tsc" : "echo 'No build step needed'";
      scripts["lint"] = "eslint src";
    }
    scripts["test"] = "echo 'No tests yet'";

    const packageJson = {
      name: projectName,
      version: "0.1.0",
      private: true,
      scripts,
      dependencies: deps,
      devDependencies: devDeps,
      engines: { node: ">=18.0.0" },
    };

    const files: ScaffoldFile[] = [
      { path: "package.json", content: JSON.stringify(packageJson, null, 2) },
      { path: ".env.example", content: this.envExample(framework) },
      { path: ".env", content: "# Copy from .env.example and fill in real values\n" },
    ];

    if (isTS) {
      const tsconfig: any = {
        compilerOptions: {
          target: "ES2022",
          module: isReact ? "ESNext" : "CommonJS",
          moduleResolution: isReact ? "bundler" : "node",
          lib: isReact ? ["ES2022", "DOM", "DOM.Iterable"] : ["ES2022"],
          outDir: "./dist",
          rootDir: "./src",
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          resolveJsonModule: true,
          declaration: true,
          declarationMap: true,
          sourceMap: true,
          ...(isReact ? { jsx: "react-jsx", allowImportingTsExtensions: true, noEmit: true } : {}),
          ...(framework === "NestJS" ? { experimentalDecorators: true, emitDecoratorMetadata: true } : {}),
        },
        include: ["src/**/*"],
        exclude: ["node_modules", "dist"],
      };
      files.push({ path: "tsconfig.json", content: JSON.stringify(tsconfig, null, 2) });
    }

    if (isReact && framework !== "Next.js") {
      files.push({
        path: "vite.config." + (isTS ? "ts" : "js"),
        content: isTS
          ? `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\nexport default defineConfig({\n  plugins: [react()],\n})\n`
          : `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\nexport default defineConfig({\n  plugins: [react()],\n})\n`,
      });
      files.push({
        path: "index.html",
        content: `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${projectName}</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.${isTS ? "tsx" : "jsx"}"></script>\n  </body>\n</html>\n`,
      });
    }

    if (framework === "NestJS") {
      files.push({ path: "nest-cli.json", content: JSON.stringify({ $schema: "https://json.schemastore.org/nest-cli", collection: "@nestjs/schematics", sourceRoot: "src", compilerOptions: { deleteOutDir: true } }, null, 2) });
    }

    // Prettier
    files.push({ path: ".prettierrc", content: JSON.stringify({ semi: true, singleQuote: true, trailingComma: "all", printWidth: 100, tabWidth: 2 }, null, 2) });

    // ESLint
    files.push({
      path: ".eslintrc.json",
      content: JSON.stringify({
        env: { es2022: true, node: true },
        extends: isTS ? ["eslint:recommended", "plugin:@typescript-eslint/recommended"] : ["eslint:recommended"],
        parser: isTS ? "@typescript-eslint/parser" : undefined,
        plugins: isTS ? ["@typescript-eslint"] : undefined,
        rules: { "no-console": "warn" },
      }, null, 2),
    });

    return files;
  }

  // ─── Python ─────────────────────────────────────────────────────────────

  private pythonScaffold(opts: ScaffoldOptions): ScaffoldFile[] {
    const { projectName, framework, buildTool } = opts;
    const files: ScaffoldFile[] = [];

    if (buildTool === "poetry" || buildTool === "uv") {
      files.push({
        path: "pyproject.toml",
        content: `[tool.poetry]\nname = "${projectName}"\nversion = "0.1.0"\ndescription = ""\nauthors = []\n\n[tool.poetry.dependencies]\npython = "^3.11"\n${framework === "FastAPI" ? 'fastapi = "^0.111.0"\nuvicorn = {extras = ["standard"], version = "^0.29.0"}\n' : framework === "Django" ? 'django = "^5.0.6"\n' : 'flask = "^3.0.3"\n'}\n[tool.poetry.group.dev.dependencies]\npytest = "^8.2.0"\nblack = "^24.4.2"\nruff = "^0.4.4"\n\n[build-system]\nrequires = ["poetry-core"]\nbuild-backend = "poetry.core.masonry.api"\n`,
      });
    } else {
      const reqs = [
        framework === "FastAPI" ? "fastapi>=0.111.0\nuvicorn[standard]>=0.29.0\npython-dotenv>=1.0.1" :
        framework === "Django"  ? "django>=5.0.6\npython-dotenv>=1.0.1" :
                                  "flask>=3.0.3\npython-dotenv>=1.0.1",
      ];
      files.push({ path: "requirements.txt", content: reqs.join("\n") + "\n" });
      files.push({ path: "requirements-dev.txt", content: "pytest>=8.2.0\nblack>=24.4.2\nruff>=0.4.4\n" });
    }

    files.push({
      path: "pyproject.toml",
      content: `[tool.black]\nline-length = 100\n\n[tool.ruff]\nline-length = 100\nselect = ["E", "F", "I"]\n\n[tool.pytest.ini_options]\ntestpaths = ["tests"]\n`,
    });

    files.push({ path: ".env.example", content: this.envExample(framework) });
    files.push({ path: ".env", content: "# Copy from .env.example and fill in real values\n" });
    files.push({ path: "tests/__init__.py", content: "" });
    files.push({ path: "tests/test_main.py", content: `def test_placeholder():\n    assert True\n` });

    if (framework === "FastAPI") {
      files.push({ path: "src/main.py", content: `from fastapi import FastAPI\n\napp = FastAPI(title="${projectName}")\n\n@app.get("/health")\nasync def health():\n    return {"status": "ok"}\n` });
    }

    return files;
  }

  // ─── Java ────────────────────────────────────────────────────────────────

  private javaScaffold(opts: ScaffoldOptions): ScaffoldFile[] {
    const { projectName, framework, buildTool } = opts;
    const groupId = "com.example";
    const artifactId = projectName.replace(/[^a-z0-9]/gi, "").toLowerCase() || "app";
    const files: ScaffoldFile[] = [];

    if (buildTool === "maven") {
      files.push({
        path: "pom.xml",
        content: `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.2.5</version>
  </parent>
  <groupId>${groupId}</groupId>
  <artifactId>${artifactId}</artifactId>
  <version>0.0.1-SNAPSHOT</version>
  <name>${projectName}</name>
  <properties>
    <java.version>21</java.version>
  </properties>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter${framework === "Spring Boot" ? "-web" : ""}</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-test</artifactId>
      <scope>test</scope>
    </dependency>
  </dependencies>
  <build>
    <plugins>
      <plugin>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-maven-plugin</artifactId>
      </plugin>
    </plugins>
  </build>
</project>`,
      });
    } else {
      files.push({
        path: "build.gradle.kts",
        content: `plugins {\n  java\n  id("org.springframework.boot") version "3.2.5"\n  id("io.spring.dependency-management") version "1.1.4"\n}\n\ngroup = "${groupId}"\nversion = "0.0.1-SNAPSHOT"\n\njava {\n  sourceCompatibility = JavaVersion.VERSION_21\n}\n\nrepositories { mavenCentral() }\n\ndependencies {\n  implementation("org.springframework.boot:spring-boot-starter-web")\n  testImplementation("org.springframework.boot:spring-boot-starter-test")\n}\n\ntasks.withType<Test> { useJUnitPlatform() }\n`,
      });
      files.push({ path: "settings.gradle.kts", content: `rootProject.name = "${artifactId}"\n` });
    }

    files.push({ path: "src/main/resources/application.properties", content: `spring.application.name=${artifactId}\nserver.port=8080\n` });
    files.push({ path: "src/main/resources/application-dev.properties", content: `# Dev overrides\n` });
    files.push({ path: ".env.example", content: this.envExample(framework) });
    files.push({ path: ".mvn/wrapper/maven-wrapper.properties", content: `distributionUrl=https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.6/apache-maven-3.9.6-bin.zip\n` });

    return files;
  }

  // ─── C++ ─────────────────────────────────────────────────────────────────

  private cppScaffold(opts: ScaffoldOptions): ScaffoldFile[] {
    const { projectName, buildTool } = opts;
    const files: ScaffoldFile[] = [];

    if (buildTool === "cmake" || buildTool === "make") {
      files.push({
        path: "CMakeLists.txt",
        content: `cmake_minimum_required(VERSION 3.20)\nproject(${projectName} VERSION 0.1.0 LANGUAGES CXX)\n\nset(CMAKE_CXX_STANDARD 20)\nset(CMAKE_CXX_STANDARD_REQUIRED ON)\nset(CMAKE_EXPORT_COMPILE_COMMANDS ON)\n\nfile(GLOB_RECURSE SOURCES "src/*.cpp")\nadd_executable(${projectName} \${SOURCES})\ntarget_include_directories(${projectName} PRIVATE include)\n`,
      });
      files.push({
        path: "build.sh",
        content: `#!/bin/bash\nmkdir -p build && cd build\ncmake .. -DCMAKE_BUILD_TYPE=Debug\ncmake --build . -j$(nproc)\n`,
      });
    } else {
      files.push({
        path: "meson.build",
        content: `project('${projectName}', 'cpp', version: '0.1.0', default_options: ['cpp_std=c++20'])\nexecutable('${projectName}', 'src/main.cpp', install: true)\n`,
      });
    }

    files.push({ path: "include/.gitkeep", content: "" });
    files.push({ path: ".clang-format", content: `BasedOnStyle: Google\nIndentWidth: 4\nColumnLimit: 100\n` });
    files.push({ path: ".clang-tidy", content: `Checks: "clang-diagnostic-*,clang-analyzer-*,modernize-*,readability-*"\n` });

    return files;
  }

  // ─── Shared helpers ───────────────────────────────────────────────────────

  private gitignore(lang: Language): ScaffoldFile {
    const common = `# OS\n.DS_Store\nThumbs.db\n\n# Editor\n.idea/\n*.iml\n*.swp\n*.swo\n.vscode/settings.json\n\n# Secrets\n.env\n*.pem\n*.key\n`;

    const langSpecific: Record<Language, string> = {
      javascript: `node_modules/\ndist/\n.next/\nout/\nbuild/\n.cache/\ncoverage/\n`,
      typescript: `node_modules/\ndist/\n.next/\nout/\nbuild/\n.cache/\ncoverage/\n*.tsbuildinfo\n`,
      python: `__pycache__/\n*.py[cod]\n*.egg-info/\n.venv/\nvenv/\ndist/\nbuild/\n.pytest_cache/\n.mypy_cache/\n.ruff_cache/\n`,
      java: `target/\nbuild/\n.gradle/\n*.class\n*.jar\n*.war\n*.ear\n`,
      cpp: `build/\n*.o\n*.obj\n*.exe\n*.out\n*.a\n*.lib\n*.so\n*.dylib\nCMakeCache.txt\nCMakeFiles/\ncompile_commands.json\n`,
    };

    return { path: ".gitignore", content: common + langSpecific[lang] };
  }

  private readme(opts: ScaffoldOptions): ScaffoldFile {
    const { projectName, language, framework, buildTool } = opts;
    const runCmd: Record<string, string> = {
      "npm":    "npm install && npm run dev",
      "pnpm":   "pnpm install && pnpm dev",
      "yarn":   "yarn && yarn dev",
      "pip":    "pip install -r requirements.txt && python src/main.py",
      "poetry": "poetry install && poetry run uvicorn src.main:app --reload",
      "uv":     "uv sync && uv run uvicorn src.main:app --reload",
      "maven":  "mvn spring-boot:run",
      "gradle": "./gradlew bootRun",
      "cmake":  "bash build.sh && ./build/${projectName}",
      "make":   "make",
      "meson":  "meson setup build && meson compile -C build",
    };

    return {
      path: "README.md",
      content: `# ${projectName}

> Generated by **Arch Builder** · ${framework} · ${language}

## Getting Started

\`\`\`bash
${runCmd[buildTool] ?? "# See build instructions above"}
\`\`\`

## Project Structure

\`\`\`
src/          # Application source files
tests/        # Test files
.env.example  # Environment variable template
\`\`\`

## Environment Variables

Copy \`.env.example\` to \`.env\` and fill in your values before running.

## Scripts

| Command | Description |
|---------|-------------|
${this.scriptTable(buildTool)}

## Architecture

This project was scaffolded from an Arch Builder diagram. Each source file
in \`src/\` corresponds to a component in the architecture diagram.
`,
    };
  }

  private scriptTable(buildTool: string): string {
    const tables: Record<string, string> = {
      npm:    "| `npm run dev` | Start dev server |\n| `npm run build` | Production build |\n| `npm test` | Run tests |",
      pnpm:   "| `pnpm dev` | Start dev server |\n| `pnpm build` | Production build |\n| `pnpm test` | Run tests |",
      yarn:   "| `yarn dev` | Start dev server |\n| `yarn build` | Production build |\n| `yarn test` | Run tests |",
      pip:    "| `python src/main.py` | Start app |\n| `pytest` | Run tests |",
      poetry: "| `poetry run uvicorn src.main:app --reload` | Start dev server |\n| `poetry run pytest` | Run tests |",
      uv:     "| `uv run uvicorn src.main:app --reload` | Start dev server |\n| `uv run pytest` | Run tests |",
      maven:  "| `mvn spring-boot:run` | Start app |\n| `mvn test` | Run tests |\n| `mvn package` | Build JAR |",
      gradle: "| `./gradlew bootRun` | Start app |\n| `./gradlew test` | Run tests |\n| `./gradlew build` | Build JAR |",
      cmake:  "| `bash build.sh` | Build project |\n| `./build/app` | Run app |",
    };
    return tables[buildTool] ?? "";
  }

  private editorconfig(): ScaffoldFile {
    return {
      path: ".editorconfig",
      content: `root = true\n\n[*]\nindent_style = space\nindent_size = 2\nend_of_line = lf\ncharset = utf-8\ntrim_trailing_whitespace = true\ninsert_final_newline = true\n\n[*.java]\nindent_size = 4\n\n[*.cpp]\nindent_size = 4\n\n[*.h]\nindent_size = 4\n\n[Makefile]\nindent_style = tab\n`,
    };
  }

  private vscodeSettings(opts: ScaffoldOptions): ScaffoldFile {
    const isTS = opts.language === "typescript";
    const isPython = opts.language === "python";
    const isJava = opts.language === "java";

    const settings: Record<string, any> = {
      "editor.formatOnSave": true,
      "editor.defaultFormatter": isPython ? "ms-python.black-formatter" : isJava ? "redhat.java" : "esbenp.prettier-vscode",
      "editor.tabSize": (isJava || opts.language === "cpp") ? 4 : 2,
      "files.trimTrailingWhitespace": true,
      "files.insertFinalNewline": true,
    };

    if (isTS || opts.language === "javascript") {
      settings["typescript.preferences.importModuleSpecifier"] = "relative";
      settings["javascript.preferences.importModuleSpecifier"] = "relative";
      settings["eslint.validate"] = ["javascript", "javascriptreact", "typescript", "typescriptreact"];
    }
    if (isPython) {
      settings["python.defaultInterpreterPath"] = ".venv/bin/python";
      settings["[python]"] = { "editor.defaultFormatter": "ms-python.black-formatter" };
    }
    if (isJava) {
      settings["java.compile.nullAnalysis.mode"] = "automatic";
    }

    return { path: ".vscode/settings.json", content: JSON.stringify(settings, null, 2) };
  }

  private vscodeExtensions(opts: ScaffoldOptions): ScaffoldFile {
    const base = ["EditorConfig.EditorConfig", "streetsidesoftware.code-spell-checker"];

    const byLang: Record<Language, string[]> = {
      javascript: ["esbenp.prettier-vscode", "dbaeumer.vscode-eslint", "bradlc.vscode-tailwindcss"],
      typescript: ["esbenp.prettier-vscode", "dbaeumer.vscode-eslint", "ms-vscode.vscode-typescript-next"],
      python:     ["ms-python.python", "ms-python.black-formatter", "charliermarsh.ruff"],
      java:       ["redhat.java", "vscjava.vscode-java-pack", "vmware.vscode-spring-boot"],
      cpp:        ["ms-vscode.cpptools", "ms-vscode.cmake-tools", "xaver.clang-format"],
    };

    const recommendations = [...base, ...(byLang[opts.language] ?? [])];
    return { path: ".vscode/extensions.json", content: JSON.stringify({ recommendations }, null, 2) };
  }

  private envExample(framework: string): string {
    const lines = ["# Application", "NODE_ENV=development", "PORT=3000", ""];

    if (["Express", "NestJS", "Node.js", "Spring Boot", "FastAPI", "Django", "Flask"].includes(framework)) {
      lines.push("# Database", "DATABASE_URL=postgresql://user:password@localhost:5432/dbname", "");
      lines.push("# Auth", "JWT_SECRET=change-me-in-production", "JWT_EXPIRES_IN=15m", "");
      lines.push("# Redis", "REDIS_URL=redis://localhost:6379", "");
    }
    if (framework === "Spring Boot") {
      lines.push("# Spring", "SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/dbname", "SPRING_DATASOURCE_USERNAME=user", "SPRING_DATASOURCE_PASSWORD=password", "");
    }

    return lines.join("\n");
  }
}