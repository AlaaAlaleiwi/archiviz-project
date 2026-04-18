import { useEffect, useState } from "react";
import "../styles.css";

type Item = {
  type: string;
  label: string;
  icon: string;
  desc: string;
  category: "backend" | "frontend";
};

const baseItems: Item[] = [
  { type: "api", label: "API Service", icon: "⚡", desc: "Backend endpoint", category: "backend" },
  { type: "database", label: "Database", icon: "🗄️", desc: "Data storage", category: "backend" },
  { type: "queue", label: "Queue", icon: "📨", desc: "Async processing", category: "backend" },
  { type: "auth", label: "Auth Service", icon: "🔐", desc: "Security layer", category: "backend" },
];

const frontendByStack: Record<string, Item[]> = {
  "react": [
    { type: "react_app", label: "React App", icon: "⚛️", desc: "SPA frontend", category: "frontend" },
    { type: "ui_layer", label: "UI Layer", icon: "🎨", desc: "Components & views", category: "frontend" },
  ],
  "angular": [
    { type: "angular_app", label: "Angular App", icon: "🅰️", desc: "Enterprise frontend", category: "frontend" },
  ],
  "vue": [
    { type: "vue_app", label: "Vue App", icon: "🟢", desc: "Reactive UI frontend", category: "frontend" },
  ],
  "none": [],
};

export default function Palette({ language, framework }: any) {
  const [items, setItems] = useState<Item[]>(baseItems);

  const [newItem, setNewItem] = useState({
    label: "",
    icon: "⚙️",
    desc: ""
  });

  // 🔥 auto update frontend services when framework changes
  useEffect(() => {
    const frontendItems = frontendByStack[framework?.toLowerCase()] || [];
    
    setItems([
      ...baseItems,
      ...frontendItems
    ]);
  }, [framework, language]);

  const addService = () => {
    if (!newItem.label.trim()) return;

    const type = newItem.label.toLowerCase().replace(/\s+/g, "_");

    setItems((prev) => [
      ...prev,
      {
        type,
        label: newItem.label,
        icon: newItem.icon,
        desc: newItem.desc || "Custom service",
        category: "backend"
      }
    ]);

    setNewItem({ label: "", icon: "⚙️", desc: "" });
  };

  const backendItems = items.filter(i => i.category === "backend");
  const frontendItems = items.filter(i => i.category === "frontend");

  return (
    <div className="palette">

      <div className="paletteHeader">COMPONENTS</div>

      {/* ADD CUSTOM SERVICE */}
      <div className="paletteAddBox">
        <input
          className="input"
          placeholder="Service name"
          value={newItem.label}
          onChange={(e) =>
            setNewItem({ ...newItem, label: e.target.value })
          }
        />

        <input
          className="input"
          placeholder="Description"
          value={newItem.desc}
          onChange={(e) =>
            setNewItem({ ...newItem, desc: e.target.value })
          }
        />

        <button className="paletteAddBtn" onClick={addService}>
          + Add Service
        </button>
      </div>

      {/* BACKEND */}
      <div className="paletteSectionTitle">Backend</div>
      {backendItems.map((t) => (
        <div
          key={t.type}
          draggable
          onDragStart={(e) => e.dataTransfer.setData("type", t.type)}
          className="paletteItem"
        >
          <div className="paletteIcon">{t.icon}</div>

          <div className="paletteText">
            <div className="paletteTitle">{t.label}</div>
            <div className="paletteSub">{t.desc}</div>
          </div>

          <div className="paletteHint">↗</div>
        </div>
      ))}

      {/* FRONTEND */}
      {frontendItems.length > 0 && (
        <>
          <div className="paletteSectionTitle">Frontend</div>

          {frontendItems.map((t) => (
            <div
              key={t.type}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("type", t.type)}
              className="paletteItem frontend"
            >
              <div className="paletteIcon">{t.icon}</div>

              <div className="paletteText">
                <div className="paletteTitle">{t.label}</div>
                <div className="paletteSub">{t.desc}</div>
              </div>

              <div className="paletteHint">↗</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}