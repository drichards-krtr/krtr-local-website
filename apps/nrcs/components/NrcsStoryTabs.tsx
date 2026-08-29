"use client";

import { useState, type ReactNode } from "react";

type TabItem = {
  id: string;
  label: string;
  attentionCount?: number;
  children: ReactNode;
};

export default function NrcsStoryTabs({ tabs }: { tabs: TabItem[] }) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id || "");

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2 border-b border-neutral-200">
        {tabs.map((tab) => {
          const active = tab.id === activeTab;
          const attention = Number(tab.attentionCount || 0) > 0;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={[
                "border-b-2 px-3 py-2 text-sm font-semibold",
                active ? "border-neutral-900 text-neutral-950" : "border-transparent text-neutral-500 hover:text-neutral-900",
                attention ? "rounded-t border-amber-400 bg-amber-50 text-amber-900" : "",
              ].join(" ")}
            >
              {attention ? "!" : null} {tab.label}
              {attention ? ` · ${tab.attentionCount}` : ""}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div key={tab.id} hidden={tab.id !== activeTab}>
          {tab.children}
        </div>
      ))}
    </div>
  );
}
