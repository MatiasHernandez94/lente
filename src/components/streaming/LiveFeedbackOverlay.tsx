"use client";

import { useState, useEffect } from "react";
import { getFeedbackColor, getFeedbackIcon, type Feedback } from "@/lib/ai/live-feedback";

interface Props {
  feedback: Feedback | null;
}

export function LiveFeedbackOverlay({ feedback }: Props) {
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState<Feedback | null>(null);

  useEffect(() => {
    if (!feedback) return;

    // defer to avoid cascading renders in some strict modes
    const id = setTimeout(() => {
      setCurrent(feedback);
      setVisible(true);
    }, 0);
    return () => clearTimeout(id);

    const timer = setTimeout(() => {
      setVisible(false);
    }, 3000);

    return () => {
      clearTimeout(timer);
    };
  }, [feedback]);

  if (!current || !visible) return null;

  return (
    <div className="absolute bottom-4 left-4 right-4 z-20 pointer-events-none">
      <div
        className={`${getFeedbackColor(current.type)} text-white px-4 py-2 text-sm font-medium shadow-lg transition-all duration-300 ${
          visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
        }`}
      >
        <span className="mr-2">{getFeedbackIcon(current.type)}</span>
        {current.message}
      </div>
    </div>
  );
}
