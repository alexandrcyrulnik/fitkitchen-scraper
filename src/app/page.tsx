"use client";

import { useState, useEffect, useCallback } from "react";
import type { WeeklyMenu, Meal } from "@/lib/scraper";

const CACHE_KEY = "fitkitchen_menu";

const DAYS_ORDER = [0, 1, 2, 3, 4, 5];

function groupByDay(meals: Meal[]): Record<number, Meal[]> {
  return meals.reduce<Record<number, Meal[]>>((acc, m) => {
    (acc[m.dayOfWeek] ??= []).push(m);
    return acc;
  }, {});
}

function mealText(meal: Meal): string {
  const macros =
    meal.proteinG !== null && meal.carbsG !== null && meal.fatG !== null
      ? ` (🥩Б:${meal.proteinG}г 🍞У:${meal.carbsG}г 🧈Ж:${meal.fatG}г)`
      : "";
  return `${meal.name} — ${meal.calories} ккал${macros}`;
}

function dayText(meals: Meal[], dayName: string): string {
  const total = meals.reduce((s, m) => s + m.calories, 0);
  const lines = [`${dayName} (${total} ккал):`];
  for (const m of meals) lines.push(`  ${m.mealTypeRu} ${mealText(m)}`);
  return lines.join("\n");
}

function fullMenuText(menu: WeeklyMenu): string {
  const byDay = groupByDay(menu.meals);
  return DAYS_ORDER.filter((d) => byDay[d])
    .map((d) => dayText(byDay[d], byDay[d][0].dayName))
    .join("\n\n");
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} title={label} style={btnStyle(copied)}>
      {copied ? "✓" : "📋"}
    </button>
  );
}

function btnStyle(active: boolean): React.CSSProperties {
  return {
    width: 28,
    height: 28,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    borderRadius: 6,
    border: "1px solid #ddd",
    cursor: "pointer",
    background: active ? "#d4edda" : "transparent",
    color: active ? "#155724" : "inherit",
    transition: "background 0.2s, color 0.2s",
    flexShrink: 0,
    padding: 0,
  };
}

export default function Home() {
  const [menu, setMenu] = useState<WeeklyMenu | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/menu");
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Ошибка загрузки");
      } else {
        const data: WeeklyMenu = await res.json();
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        setMenu(data);
        setFromCache(false);
      }
    } catch {
      setError("Сетевая ошибка");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      try {
        setMenu(JSON.parse(raw));
        setFromCache(true);
        return;
      } catch {}
    }
    load();
  }, [load]);

  const byDay = menu ? groupByDay(menu.meals) : {};

  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "32px 16px", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>🍱 Fitkitchen — тариф Fit</h1>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 20 }}>≈1200 ккал/день</p>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 24 }}>
        <button
          onClick={load}
          disabled={loading}
          style={{
            padding: "8px 20px",
            background: loading ? "#aaa" : "#0070f3",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: loading ? "default" : "pointer",
            fontSize: 14,
          }}
        >
          {loading ? "Загружаю…" : "🔄 Обновить"}
        </button>

        {menu && (
          <CopyButton text={fullMenuText(menu)} label="Скопировать всё меню" />
        )}

        {menu && (
          <span style={{ fontSize: 12, color: "#999" }}>
            неделя с {menu.weekStart}
            {fromCache && <span style={{ marginLeft: 6, color: "#bbb" }}>· кэш</span>}
          </span>
        )}
      </div>

      {error && (
        <div style={{ background: "#ffe0e0", border: "1px solid #f88", borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 14 }}>
          ❌ {error}
        </div>
      )}

      {menu &&
        DAYS_ORDER.filter((d) => byDay[d]).map((dayIdx) => {
          const dayMeals = byDay[dayIdx];
          const total = dayMeals.reduce((s, m) => s + m.calories, 0);
          const dayText_ = dayText(dayMeals, dayMeals[0].dayName);
          return (
            <div
              key={dayIdx}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: "14px 16px",
                marginBottom: 12,
                background: "#fafafa",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <strong style={{ fontSize: 15 }}>
                  {dayMeals[0].dayName}
                  <span style={{ fontWeight: 400, color: "#666", fontSize: 13, marginLeft: 8 }}>
                    {total} ккал
                  </span>
                </strong>
                <CopyButton text={dayText_} label="Копировать день" />
              </div>

              {dayMeals.map((meal, i) => {
                const text = mealText(meal);
                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      padding: "6px 0",
                      borderTop: i === 0 ? "none" : "1px solid #eee",
                      gap: 8,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, color: "#888", marginBottom: 2 }}>{meal.mealTypeRu}</div>
                      <div style={{ fontSize: 14 }}>{meal.name}</div>
                      <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
                        🔥 {meal.calories} ккал
                        {meal.proteinG !== null && (
                          <span style={{ marginLeft: 6 }}>
                            · 🥩Б:{meal.proteinG}г 🍞У:{meal.carbsG}г 🧈Ж:{meal.fatG}г
                          </span>
                        )}
                      </div>
                    </div>
                    <CopyButton text={text} label="Копировать" />
                  </div>
                );
              })}
            </div>
          );
        })}
    </main>
  );
}
