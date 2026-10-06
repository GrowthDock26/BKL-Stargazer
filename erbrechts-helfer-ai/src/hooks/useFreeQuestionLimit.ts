import { useState, useEffect } from "react";

const STORAGE_KEY = "legacy_chat_free_usage";
const MONTHLY_LIMIT = 3;

interface FreeUsage {
  month: string; // "YYYY-MM"
  count: number;
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getUsage(): FreeUsage {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: FreeUsage = JSON.parse(raw);
      if (parsed.month === getCurrentMonth()) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return { month: getCurrentMonth(), count: 0 };
}

function setUsage(usage: FreeUsage) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(usage));
}

export const useFreeQuestionLimit = () => {
  const [questionCount, setQuestionCount] = useState(() => getUsage().count);

  const remaining = Math.max(0, MONTHLY_LIMIT - questionCount);
  const isExhausted = questionCount >= MONTHLY_LIMIT;

  const increment = () => {
    const usage = getUsage();
    usage.count += 1;
    setUsage(usage);
    setQuestionCount(usage.count);
  };

  return { questionCount, remaining, isExhausted, increment, limit: MONTHLY_LIMIT };
};
