import type { User } from "./Loginpage";
import "./product-entry.css";

interface HomePageProps {
  user: User | null;
  onLogin: () => void;
  onSignup: () => void;
  onOpenWorkspace: () => void;
  onContinueLocal: () => void;
}

const workflow = [
  ["01", "Design", "Map services, data stores, APIs, and system boundaries on an architecture canvas."],
  ["02", "Generate safely", "Review every proposed file before AI-generated changes reach your workspace."],
  ["03", "Validate", "Build and test the generated Spring Boot project, with diagnostics linked back to code."],
  ["04", "Ship", "Export the project or continue in IntelliJ IDEA, VS Code, or your normal Git workflow."],
];

export default function HomePage({ user, onLogin, onSignup, onOpenWorkspace, onContinueLocal }: HomePageProps) {
  return (
    <main className="product-home">
      <nav className="product-nav" aria-label="Primary navigation">
        <a className="product-wordmark" href="#top" aria-label="Archiviz home">
          <span className="product-mark" aria-hidden="true">A</span>
          <span>Archiviz</span>
        </a>
        <div className="product-nav-links">
          <a href="#workflow">How it works</a>
          <a href="#teams">For teams</a>
          {user ? (
            <button className="product-button product-button--compact" onClick={onOpenWorkspace}>Open workspace</button>
          ) : (
            <>
              <button className="product-text-button" onClick={onLogin}>Sign in</button>
              <button className="product-button product-button--compact" onClick={onSignup}>Create account</button>
            </>
          )}
        </div>
      </nav>

      <section id="top" className="product-hero" aria-labelledby="product-title">
        <div className="product-hero-copy">
          <div className="product-eyebrow"><span /> ARCH-OS // Architecture-to-code workspace</div>
          <h1 id="product-title">Turn system design into <em>validated software.</em></h1>
          <p>
            Archiviz helps backend teams design a Spring Boot architecture, generate a reviewable codebase,
            run build and tests, and keep the path to production understandable.
          </p>
          <div className="product-hero-actions">
            <button className="product-button" onClick={user ? onOpenWorkspace : onSignup}>
              {user ? `Continue as ${user.name.split(" ")[0]}` : "Start building"}
              <span aria-hidden="true">→</span>
            </button>
            <button className="product-button product-button--secondary" onClick={onContinueLocal}>Continue locally</button>
          </div>
          <div className="product-trust-row" aria-label="Product principles">
            <span>Local-first</span><span>Review before mutation</span><span>IDE compatible</span>
          </div>
        </div>

        <div className="product-preview" aria-label="Archiviz workflow preview">
          <div className="product-preview-bar"><i /><i /><i /><span>SYS://payments-platform.archiviz [GRAPH_ONLINE]</span></div>
          <div className="product-preview-body">
            <div className="product-preview-rail"><b>Design</b><span>Build</span><span>Code</span><span>Ship</span></div>
            <div className="product-preview-canvas">
              <div className="preview-node preview-node--api"><small>REST API // PORT 8080</small><strong>Orders Service</strong><span>Spring Boot 3.4</span></div>
              <div className="preview-connector preview-connector--one" />
              <div className="preview-node preview-node--event"><small>EVENT // TOPIC</small><strong>Payment Created</strong><span>Kafka broker</span></div>
              <div className="preview-connector preview-connector--two" />
              <div className="preview-node preview-node--data"><small>DATABASE // PG_SQL</small><strong>Payments DB</strong><span>PostgreSQL 16</span></div>
              <div className="preview-status"><span /> Build passed · 38 tests</div>
            </div>
          </div>
        </div>
      </section>

      <section className="product-proof" aria-label="Product capabilities">
        <div><strong>Reviewable</strong><span>See generated changes before they touch your files.</span></div>
        <div><strong>Reversible</strong><span>Undo architecture and code-generation operations.</span></div>
        <div><strong>Validated</strong><span>Build and test automatically after generation.</span></div>
        <div><strong>Private by choice</strong><span>Use local AI or an approved provider.</span></div>
      </section>

      <section id="workflow" className="product-section">
        <div className="product-section-heading">
          <span>One controlled workflow</span>
          <h2>From an idea to a runnable project</h2>
          <p>Archiviz concentrates on the handoff where architecture tools usually stop and implementation work begins.</p>
        </div>
        <div className="product-workflow-grid">
          {workflow.map(([number, title, description]) => (
            <article key={number} className="product-workflow-card">
              <span>{number}</span><h3>{title}</h3><p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="teams" className="product-teams">
        <div>
          <span className="product-kicker">Why teams choose Archiviz</span>
          <h2>Architecture decisions become working, testable evidence.</h2>
        </div>
        <ul>
          <li><strong>Reduce setup time</strong><span>Generate consistent services, configuration, and infrastructure from one design.</span></li>
          <li><strong>Control AI changes</strong><span>Review scope, ownership warnings, and file changes before applying them.</span></li>
          <li><strong>Fit existing engineering</strong><span>Continue in familiar IDE, Git, build, and deployment workflows.</span></li>
        </ul>
      </section>

      <footer className="product-footer">
        <div className="product-wordmark"><span className="product-mark" aria-hidden="true">A</span><span>Archiviz</span></div>
        <p>Design with intent. Generate with control. Ship with evidence.</p>
        <button className="product-text-button" onClick={onContinueLocal}>Open local workspace →</button>
      </footer>
    </main>
  );
}
