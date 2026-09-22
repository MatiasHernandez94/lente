"use client";

import { useState } from "react";
import { MessageCircle, Target } from "lucide-react";
import { CoachChat } from "@/components/coach/CoachChat";
import { OKRDashboard } from "@/components/okrs/OKRDashboard";

interface Props {
  videoId: string;
  videoTitle: string;
}

type Tab = "coach" | "okrs";

export function VideoTools({ videoId, videoTitle }: Props) {
  const [tab, setTab] = useState<Tab>("coach");

  return (
    <div className="space-y-4">
      {/* Tab selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab("coach")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
            tab === "coach"
              ? "bg-ink text-white"
              : "border border-ink/20 text-ink hover:bg-surface"
          }`}
        >
          <MessageCircle size={12} />
          Coach Virtual
        </button>
        <button
          onClick={() => setTab("okrs")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
            tab === "okrs"
              ? "bg-ink text-white"
              : "border border-ink/20 text-ink hover:bg-surface"
          }`}
        >
          <Target size={12} />
          OKRs
        </button>
      </div>

      {/* Content */}
      {tab === "coach" && <CoachChat videoId={videoId} />}
      {tab === "okrs" && <OKRDashboard videoId={videoId} />}
    </div>
  );
}
