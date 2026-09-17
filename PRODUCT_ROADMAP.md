# Archiviz Product Roadmap

## Purpose

This document defines how Archiviz should evolve from its current desktop architecture workspace into a focused architecture-to-code product. It is written as a durable implementation brief for engineers and AI development agents.

The intended product promise is:

> Archiviz turns a system design into a validated, runnable codebase and keeps the design and implementation aligned as they evolve.

Archiviz should not attempt to replace a full IDE, diagramming suite, API client, Git client, and terminal equally. Its primary value is the controlled transition between architecture and implementation.

## Initial target user

The first target customer is a backend engineer or small platform team building Spring Boot services.

Their primary job-to-be-done is:

> I need to turn an architecture idea into a consistent, runnable multi-service project without manually assembling repositories, configuration, infrastructure, and boilerplate.

Broader framework support should come only after the Spring Boot workflow is reliable and differentiated.

## Product principles

All milestone work should follow these principles:

1. **One golden path:** Design, build, review, validate, and ship.
2. **Review before mutation:** Show planned file and architecture changes before applying them.
3. **Reversible operations:** Destructive and AI-generated changes must support undo or recovery.
4. **Architecture with evidence:** Every inferred component and relationship should link to its source.
5. **Contextual AI:** Prefer scoped operations over a detached general-purpose chat experience.
6. **Progressive disclosure:** Show the next decision first and expose technical detail on demand.
7. **IDE interoperability:** Make it easy to continue work in IntelliJ IDEA, VS Code, or another IDE.
8. **Local-first operation:** The core product should remain usable without a cloud account.
9. **Secure by default:** Protect credentials, restrict the desktop webview, and make data transmission explicit.
10. **Accessible interaction:** The primary workflow must be usable with keyboard, pointer, and assistive technology.

## Golden path

The primary end-to-end workflow should be:

1. Create or import a project.
2. Describe the system or choose a template.
3. Review the proposed architecture.
4. Configure important decisions.
5. Review a generation plan.
6. Generate or update the project.
7. Build and test automatically.
8. Inspect and refine code.
9. Export, open in an IDE, or publish to GitHub.
10. Reopen the project with architecture and code still synchronized.

## Proposed information architecture

The main application should have four primary workspaces:

### Design

- Architecture canvas
- Component library
- Contextual properties inspector
- Architecture validation
- Templates
- AI-assisted architecture operations

### Build

- Generation plan
- Files to add, modify, or delete
- Framework and infrastructure configuration
- Change warnings
- Generation progress
- Validation results

### Code

- File explorer
- Editor
- Problems and diagnostics
- Test results
- Optional terminal drawer
- Open in IDE

### Ship

- Build and test status
- API smoke tests
- Git diff
- Commit and push workflow
- ZIP export
- Deployment artifacts

Settings, terminal, AI chat, and detailed Git tools should be secondary drawers or contextual tools rather than competing primary panels.

---

# Milestone 1: Trustworthy Core Workflow

**Status:** Complete (2026-09-17)

Implementation reference:

- The application now exposes the Design, Build, Code, and Ship workflow.
- Generation is staged as a selectable file-change plan before workspace mutation, followed by native build and test validation.
- Workspace-wide undo/redo, visible autosave and recovery, clear confirmation, keyboard canvas controls, semantic dialogs, reduced motion, and touch-target rules establish the safety and accessibility baseline.
- AI and Git credentials use the native keychain in Tauri and are never persisted to browser storage; the desktop webview has a restrictive CSP.
- Built-in starter templates, empty-state guidance, ZIP export, and availability-aware IDE/file-manager/terminal handoff complete the first-run and shipping paths.
- Large Code, Ship, chat, terminal, and 3D features are lazy-loaded; an application error boundary protects the shell.
- CI runs lint, 54 unit/component workflow tests, the production frontend build, Rust checks, and Rust tests. Local verification uses `npm run check`, `cargo check`, `cargo test`, and `git diff --check`.

## Objective

Make Archiviz safe, understandable, accessible, and dependable enough for real project work.

## Product outcome

A user can design a Spring Boot architecture, generate a project, review the changes, validate the result, and recover from mistakes without relying on the embedded terminal.

## Scope

### 1. Simplify the application structure

Implement the four primary workspaces: Design, Build, Code, and Ship.

Each workspace must provide:

- A clear title and project identity
- Visible save and validation state
- One visually dominant primary action
- Relevant warnings and next-step guidance
- Consistent navigation between workflow stages
- Contextual secondary actions

Avoid permanently displaying every tool. Terminal, AI chat, Git details, and inspectors should open only when relevant.

### 2. Implement safe project history

Create an undoable command or state-history system covering:

- Adding, removing, moving, renaming, and configuring nodes
- Adding, editing, and removing connections
- Generated file changes
- Manual file edits
- Project setting changes
- Canvas clearing

Required behavior:

- `Cmd/Ctrl+Z` performs undo.
- `Cmd/Ctrl+Shift+Z` performs redo.
- Destructive operations describe their impact before execution.
- Clearing a project requires confirmation.
- The most recent autosaved state can be restored.
- Each generation operation can be reverted as one transaction.

History entries should have human-readable descriptions such as `Removed Orders Service` or `Generated 14 files for Payments Service`.

### 3. Make autosave visible and recoverable

The application header must always display one of these states:

- Saved
- Saving…
- Unsaved changes
- Save failed — Retry
- Local-only

Clicking the state should reveal:

- Last successful save time
- Current project destination
- Autosave failure details
- Retry action
- Restore previous autosave action when available

Autosave failures must never be silent.

### 4. Add a generation-plan workflow

Before files are changed, present a reviewable plan containing:

- Components being generated
- Files being added
- Files being modified
- Files being deleted
- Configuration decisions
- Affected services and contracts
- Warnings about user-edited files
- Validation actions that will run afterward

The user must be able to:

- Expand individual file diffs
- Exclude optional changes
- Cancel the operation
- Apply the complete plan
- Revert the applied result

Never silently overwrite a file identified as user-owned or manually modified.

### 5. Build and test automatically

After applying generation changes:

1. Materialize the project workspace.
2. Run the appropriate Maven or Gradle build.
3. Run the test suite.
4. Parse diagnostics.
5. Link errors to files and architecture nodes.
6. Offer a scoped repair operation.

Express the result as a clear product state:

- Ready to run
- Build failed
- Tests failed
- Configuration incomplete
- Validation cancelled

The API tester timeout must use a real abort signal and cancel requests at the configured duration.

### 6. Secure credentials and the desktop runtime

- Move AI provider keys and GitHub tokens from `localStorage` into OS-protected secure storage.
- Configure a restrictive Tauri Content Security Policy.
- Redact credentials from logs, errors, exports, and generated prompts.
- Add explicit Forget Credential actions.
- Validate imported paths and external URLs.
- Explain which files and content will be sent to an AI provider.
- Do not include secrets in generated source or project exports.

### 7. Establish an accessibility baseline

- Make component-library items keyboard operable.
- Allow nodes to be inserted, selected, moved, renamed, configured, and deleted with a keyboard.
- Provide a keyboard workflow for creating and selecting connections.
- Give every icon-only control an accessible name.
- Implement semantic dialogs with focus trapping and focus restoration.
- Support Escape consistently for dismissible overlays.
- Announce build, generation, error, and chat states with appropriate live regions.
- Add reduced-motion styling.
- Maintain at least 44 by 44 pixel touch targets on coarse-pointer devices.
- Raise important labels and status text to a readable minimum size.
- Ensure visible focus treatment for all interactive controls.

### 8. Add Open in IDE

Add prominent actions to open the materialized project in:

- IntelliJ IDEA
- Visual Studio Code
- The system file manager
- The default terminal

Unavailable applications should be disabled or omitted with a clear explanation.

### 9. Improve first-run guidance

The startup experience should offer:

- Create from description
- Start from template
- Import existing project
- Open recent project

Recommended starter templates:

- REST API with PostgreSQL
- Modular monolith
- Event-driven microservices
- API gateway with services
- Authentication service
- Spring Boot with React frontend

The empty canvas should explain how to add components, connect them, configure them, and proceed to generation.

## UX requirements

- Every screen has one obvious next action.
- Planned, running, successful, failed, and cancelled states are visually distinct.
- Long-running work reports real progress and can be cancelled safely.
- Errors explain what happened, what was affected, and how to continue.
- Destructive actions communicate impact and recovery options.
- AI actions show their scope before execution.

## Engineering requirements

- Split large workspace features into lazy-loaded bundles.
- Add an application-level error boundary.
- Break global CSS into feature-level styles or an intentional design-system layer.
- Remove conflicting responsive rules.
- Add a lint script and make lint part of CI.
- Fix all existing lint errors and warnings.
- Add component and end-to-end coverage for the golden path.

## Acceptance criteria

- A user can complete the golden path without using the terminal.
- Clearing a populated project requires explicit confirmation.
- Every graph edit supports undo and redo.
- Autosave state is always visible.
- Autosave failures expose retry and recovery actions.
- Generated changes are previewed before application.
- User-edited files are never silently overwritten.
- Generated projects are automatically built and tested.
- API tester timeouts cancel active requests.
- Credentials are not stored in browser storage.
- The golden path is keyboard accessible.
- The main workflow meets agreed contrast and touch-target requirements.
- Production build, tests, and lint pass in CI.
- End-to-end tests cover project creation, generation, validation, undo, autosave recovery, and export.

## Out of scope

- Real-time multi-user collaboration
- Additional backend frameworks
- Cloud-hosted accounts
- Advanced organization policy management

---

# Milestone 2: Bidirectional Architecture and Code

## Objective

Make the architecture model reflect the real implementation and detect when design and code diverge.

## Product outcome

Users can import an existing Spring Boot system, understand it visually, modify either design or code, and reconcile the differences safely.

## Dependencies

Milestone 1 must be complete. In particular, generation preview, undo, secure persistence, validation, and the simplified workspace structure must already exist.

## Scope

### 1. Define a normalized architecture model

Create a versioned internal schema representing:

- Applications and services
- Modules and packages
- Controllers and endpoints
- Databases and caches
- Events, queues, and topics
- External systems
- Authentication boundaries
- Deployment units
- Relationships and protocols
- Source-file ownership
- Generated and user-owned artifacts
- Evidence supporting inferred relationships

The canvas, importer, generator, validator, exporter, and drift engine must use this shared model.

Provide migrations for older saved projects.

### 2. Build deeper Spring Boot analysis

Analyze imported projects for:

- Spring applications and modules
- Controllers and routes
- Service classes
- Repositories and entities
- Database dependencies
- Security configuration
- HTTP clients
- Kafka and RabbitMQ producers and consumers
- Configuration properties
- Docker and Compose definitions
- Maven and Gradle modules
- Tests associated with components

Prefer parser- or syntax-tree-based analysis where practical. Regular expressions may be used only as a documented fallback.

Every discovered item should contain:

- Source file
- Relevant line or symbol
- Classification confidence
- Framework evidence
- Stable model identifier

### 3. Add an import review flow

Import should proceed through these stages:

1. Scan project.
2. Display discovered modules, services, contracts, and infrastructure.
3. Highlight uncertain classifications.
4. Let the user merge, split, rename, reclassify, or ignore items.
5. Preview the resulting architecture.
6. Save model-to-source mappings.

Do not jump directly from folder selection to a supposedly authoritative diagram.

### 4. Detect architecture drift

Compare the saved model with current source code and detect:

- Added or removed endpoints
- Added or removed service dependencies
- Missing components
- Database connection changes
- Protocol changes
- Deleted or renamed source files
- Model relationships not found in code
- Code relationships absent from the model
- Contract changes

Each drift item must offer appropriate actions:

- Accept code change into architecture
- Regenerate code from architecture
- Review evidence
- Mark as intentionally different
- Ignore once
- Create or modify an architecture rule

### 5. Implement incremental generation

When a component changes, determine and regenerate only the affected files and dependants.

The impact review must show:

- Directly affected files
- Dependent services
- Changed contracts
- Tests that will run
- Infrastructure changes
- Potentially destructive database migrations

Unrelated services and user-owned files must remain unchanged.

### 6. Make contracts first-class objects

Model and inspect:

- REST endpoints
- Request and response schemas
- Event payloads
- Queue and topic names
- Error models
- Authentication requirements
- Contract versions
- Producers and consumers

Selecting a connection on the canvas should open its contract inspector. Connections must communicate protocol and direction instead of behaving as decorative lines.

### 7. Add architecture validation rules

Initial built-in rules should include:

- A service should not access another service's database.
- Circular synchronous dependencies should be reported.
- Public endpoints must define authentication expectations.
- Event consumers must reference a declared payload contract.
- Deployable services require health checks.
- Database migrations should be versioned.
- Generated services require at least one smoke test.
- Contract changes with known consumers require compatibility review.

Rules must be configurable per project and return actionable remediation guidance.

## UX requirements

- Imported architecture is presented as a proposal with evidence.
- Confidence and uncertainty are communicated without overwhelming the user.
- Drift appears as a review queue with clear resolution actions.
- Selecting an inferred node or relationship reveals its source evidence.
- Incremental generation explains why each file is affected.
- Contract changes emphasize downstream impact.

## Engineering requirements

- Version the normalized model explicitly.
- Keep analyzers and generators independent from UI components.
- Add fixture repositories representing common Spring Boot structures.
- Measure import accuracy against a maintained benchmark set.
- Preserve stable model identifiers when files move or symbols are renamed.
- Make drift analysis available through a headless service for future CLI use.

## Acceptance criteria

- A representative multi-module Spring Boot project can be imported.
- Imported nodes and relationships link to source evidence.
- Endpoint and dependency detection meet an agreed accuracy benchmark.
- Uncertain classifications can be corrected before model creation.
- Modifying a mapped endpoint produces a drift notification.
- Users can accept a code change into the architecture.
- One service can be regenerated without rewriting unrelated services.
- Contract changes show affected consumers.
- Architecture rules run during project validation.
- Older saved projects migrate without losing architecture data.

## Out of scope

- Real-time collaboration
- Multiple backend frameworks
- Organization-wide policy distribution
- Automatic production deployment

---

# Milestone 3: Team Collaboration and Governance

## Objective

Turn Archiviz from a personal design tool into a shared architecture-review workspace integrated with normal engineering workflows.

## Product outcome

A team can propose, discuss, approve, validate, and trace architecture changes alongside source-code changes.

## Dependencies

Milestones 1 and 2 must be complete. Collaboration depends on a stable versioned model, change history, drift detection, and deterministic validation.

## Scope

### 1. Create shareable architecture reviews

A review package should contain:

- Architecture snapshot
- Proposed model changes
- Generated code diff
- Validation results
- Build and test results
- Open warnings
- Author summary
- Links to affected services, contracts, and files

Initially, reviews may be stored in the repository or attached to a pull request. Real-time cloud collaboration is not required for the first version.

### 2. Add architecture change history

Record:

- Author
- Timestamp
- What changed
- Reason for the change
- Affected nodes and contracts
- Affected generated files
- Validation results
- Associated commit, branch, or pull request

Provide side-by-side and overlay comparisons between architecture versions.

### 3. Add comments and decisions

Allow comments on:

- Nodes
- Connections
- Contracts
- Validation warnings
- Proposed changes

Decision states should include:

- Open
- Accepted
- Rejected
- Superseded

Accepted decisions should be exportable as Architecture Decision Record files.

### 4. Integrate with Git and pull requests

Provide:

- Architecture summary for the current branch
- Drift status
- Generated diff summary
- Validation checks
- Links between architecture items and commits
- Pull-request report generation
- Headless CI validation

Create a CLI or equivalent headless interface supporting commands such as:

```bash
archiviz validate
archiviz drift
archiviz report
```

Commands must use deterministic exit codes and support machine-readable output.

### 5. Add versioned team templates

Team templates may define:

- Preferred service structure
- Dependency and framework versions
- Security defaults
- Logging and observability configuration
- Testing conventions
- Deployment configuration
- Architecture rules
- Approved infrastructure components

Template upgrades must show a preview and clearly distinguish required from optional changes.

### 6. Add governance policies

Support configurable checks for:

- Approved framework versions
- Disallowed dependencies
- Required authentication
- Required health and readiness endpoints
- Required observability configuration
- Data-classification constraints
- Naming rules
- Repository layout
- Minimum test expectations

Policies must explain why a result matters and how to resolve it.

### 7. Introduce roles if cloud collaboration is added

Potential roles:

- Viewer
- Contributor
- Reviewer
- Template administrator
- Workspace administrator

Local projects must remain usable without authentication.

## UX requirements

- Reviews focus on changes rather than entire diagrams.
- Discussions attach to stable model elements.
- Resolved comments remain available in history.
- Policy failures link directly to evidence and remediation.
- Repository and pull-request context is visible without overwhelming design work.
- Users can distinguish recommendations from blocking policies.

## Engineering requirements

- Define a stable serialized review format.
- Ensure comments survive renames through stable model identifiers.
- Make validation reproducible locally and in CI.
- Support structured JSON output for automation.
- Keep repository-based collaboration viable without requiring a hosted service.
- Add permission enforcement only when shared cloud state exists.

## Acceptance criteria

- Architecture changes can be compared between two commits.
- A review report can be generated without opening the desktop app.
- Comments remain attached after supported model refactors.
- Accepted decisions can generate ADR files.
- CI fails when configured blocking policies fail.
- Advisory policies do not incorrectly block CI.
- Team templates are versioned and upgradeable.
- A pull request can include an architecture change summary.
- Local-only usage remains supported.

## Out of scope

- Broad framework expansion
- Full project-management functionality
- General-purpose document collaboration
- Mandatory cloud accounts

---

# Milestone 4: Multi-Platform Expansion

## Objective

Extend the proven architecture-to-code model beyond Spring Boot without weakening product consistency or maintainability.

## Product outcome

Teams can model and generate heterogeneous systems using a shared architecture language and framework-specific adapters.

## Dependencies

Milestones 1 and 2 must be stable. Milestone 3 is recommended but not strictly required for initial adapter development.

## Scope

### 1. Define a plugin-based platform architecture

Create stable extension interfaces for:

- Project discovery
- Source-code analysis
- Component classification
- Code generation
- Build and test commands
- Contract extraction
- Validation rules
- Framework-specific settings
- File ownership and regeneration
- Export and deployment artifacts

Platform support must be implemented through adapters rather than framework conditionals distributed throughout the application.

Spring Boot should be migrated to the same adapter interface before adding another production adapter.

### 2. Build a NestJS adapter

Support:

- Controllers and routes
- Providers and modules
- DTOs
- TypeORM or Prisma
- Guards and authentication
- Event and queue integrations
- Jest tests
- npm and pnpm build commands

### 3. Build a FastAPI adapter

Support:

- Routers and endpoints
- Pydantic models
- Dependency injection
- SQLAlchemy
- Authentication dependencies
- Background tasks
- pytest
- Python environment detection

### 4. Build a .NET adapter

Support:

- ASP.NET controllers and minimal APIs
- Services and dependency injection
- Entity Framework
- Authentication and authorization
- Configuration
- xUnit or NUnit
- `dotnet build` and `dotnet test`

### 5. Add frontend application adapters selectively

Support React or Next.js only where it improves full-system architecture modeling:

- Application shell
- Routes
- API clients
- Authentication integration
- Environment configuration
- Shared contracts
- Frontend build and tests

Do not turn the architecture canvas into a visual page builder.

### 6. Support cross-platform contracts

Generate or synchronize contracts using:

- OpenAPI
- AsyncAPI
- JSON Schema
- Protocol Buffers
- Generated client libraries

Show compatibility and downstream consumers across language boundaries.

### 7. Add deployment adapters

Potential targets:

- Docker Compose
- Kubernetes
- Terraform
- Major cloud application platforms

Deployment generation must use the same plan, preview, validation, application, and rollback workflow as source generation.

### 8. Make the UI capability-aware

- Show only settings and actions supported by the active adapter.
- Use framework-appropriate terminology and commands.
- Clearly mark partially supported imported components.
- Never imply complete support when only basic generation exists.
- Explain which capabilities are missing and what fallback is available.

## UX requirements

- Mixed-language systems still appear as one coherent architecture.
- Framework-specific detail is available without contaminating the shared model.
- Adapter limitations are explicit.
- Switching the selected component updates contextual actions and settings.
- Cross-platform contract relationships remain understandable.

## Engineering requirements

- Version adapter interfaces.
- Publish a conformance test suite.
- Isolate adapter failures from the core application.
- Support capability discovery.
- Keep shared architecture concepts independent from framework-specific syntax.
- Require import, generation, build, test, and basic drift support before labeling an adapter production-ready.

## Acceptance criteria

- Adapter interfaces are documented and versioned.
- Spring Boot operates through the adapter interface.
- NestJS, FastAPI, and .NET pass a shared conformance suite.
- Each production adapter can import, generate, build, test, and detect basic drift.
- Cross-language REST contracts can generate usable clients.
- Mixed-platform projects can be validated together.
- Adding an adapter does not require changes to core canvas components.
- The UI presents only capabilities supported by the active adapter.

## Out of scope

- Supporting every language or framework
- Visual page building
- Framework adapters that only provide superficial templates
- Automatic deployment without review and validation

---

# Cross-Milestone Quality Gates

Every milestone must satisfy the following before it is considered complete:

## Product

- The milestone produces a complete user outcome, not only backend capability.
- Empty, loading, success, failure, cancelled, and recovery states are designed.
- Destructive actions explain impact and recovery.
- New features fit the golden path or have an explicit secondary role.

## Accessibility

- Primary workflows are keyboard operable.
- Focus order and focus restoration are verified.
- Dynamic state changes are announced appropriately.
- Contrast, zoom, reduced motion, and touch targets are tested.

## Security and privacy

- No new secrets are stored in plaintext browser storage.
- External data transmission is visible and scoped.
- Logs and analytics do not include source code or secrets by default.
- Desktop permissions and CSP changes are reviewed.

## Engineering

- Production build passes.
- Lint passes without warnings.
- Unit, component, integration, and relevant end-to-end tests pass.
- Performance regressions are measured.
- Saved-project schema changes include migrations.
- New long-running operations support cancellation and cleanup.

## Documentation

- User-facing behavior is documented.
- Architecture decisions are recorded.
- New commands and extension interfaces are documented.
- Known limitations are explicit.

---

# Execution Guidance for AI Development Agents

An agent implementing work from this roadmap should follow this process:

1. Read this entire roadmap and identify the active milestone.
2. Inspect the current repository state before proposing changes.
3. Check for existing uncommitted work and preserve unrelated user changes.
4. Select one bounded vertical slice with a user-visible outcome.
5. State assumptions when requirements are ambiguous.
6. Implement the smallest coherent change that advances the acceptance criteria.
7. Add or update tests for every behavioral change.
8. Run relevant tests, lint, type checking, and the production build.
9. Verify visible UI changes at representative desktop and narrow-window sizes.
10. Report files changed, verification performed, remaining risks, and the next recommended slice.

Agents should not:

- Begin framework expansion before the core architecture-to-code loop is trustworthy.
- Add large permanent panels for secondary tools.
- Overwrite user-authored files silently.
- introduce irreversible AI operations.
- Store credentials in `localStorage` or project files.
- Claim a milestone is complete when only its underlying services exist without the required UX.
- Combine unrelated roadmap items into a single risky change.

## Recommended implementation order

1. Complete Milestone 1 to make the product safe and usable.
2. Complete Milestone 2 to establish the primary product differentiation.
3. Complete Milestone 3 to support team adoption and governance.
4. Complete Milestone 4 to expand the market without sacrificing depth.

The most important constraint is to avoid broad framework expansion before bidirectional architecture-to-code synchronization works reliably for Spring Boot.
