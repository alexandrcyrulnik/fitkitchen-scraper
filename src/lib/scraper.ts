import * as cheerio from "cheerio";
import type { Element } from "domhandler";

const MENU_URL = "https://fitkitchen.cz/fitness-menu";
const FIT_CATEGORY_ID = "2";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "cs-CZ,cs;q=0.9",
};

const DAYS_RU = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
const MEAL_TYPE_RU: Record<string, string> = {
  snídaně: "🌅 Завтрак",
  oběd: "🍽 Обед",
  večeře: "🌙 Ужин",
};
const MEAL_TYPE_BY_INDEX = ["snídaně", "oběd", "večeře"];

export interface Meal {
  name: string;
  mealType: string;
  mealTypeRu: string;
  dayOfWeek: number;
  dayName: string;
  calories: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  weightG: number | null;
}

export interface WeeklyMenu {
  weekStart: string;
  meals: Meal[];
  scrapedAt: string;
}

function getWeekStart(): string {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
  return monday.toISOString().split("T")[0];
}

async function fetchPage(): Promise<string | null> {
  try {
    const res = await fetch(MENU_URL, {
      headers: HEADERS,
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

async function fetchFitTariff(pageHtml: string): Promise<string | null> {
  try {
    const $ = cheerio.load(pageHtml);
    const form = $('form[data-request="onFilterWeeks"]');
    if (!form.length) return null;

    const sessionKey = form.find('input[name="_session_key"]').val() as string;
    const token = form.find('input[name="_token"]').val() as string;
    if (!sessionKey || !token) return null;

    const body = new URLSearchParams({
      _session_key: sessionKey,
      _token: token,
      "Filter[category]": FIT_CATEGORY_ID,
    });

    const res = await fetch(MENU_URL, {
      method: "POST",
      headers: {
        ...HEADERS,
        "X-OCTOBER-REQUEST-HANDLER": "onFilterWeeks",
        "X-OCTOBER-REQUEST-PARTIALS": "ayrestaurant/menu",
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: body.toString(),
      next: { revalidate: 0 },
    });

    if (!res.ok) return null;
    const json = await res.json();
    return json["ayrestaurant/menu"] ?? null;
  } catch {
    return null;
  }
}

function extractInt(pattern: RegExp, text: string): number {
  const m = text.match(pattern);
  return m ? parseInt(m[1], 10) : 0;
}

function extractFloat(pattern: RegExp, text: string): number | null {
  const m = text.match(pattern);
  return m ? parseFloat(m[1].replace(",", ".")) : null;
}

function extractFirstFloat(patterns: RegExp[], text: string): number | null {
  for (const p of patterns) {
    const v = extractFloat(p, text);
    if (v !== null) return v;
  }
  return null;
}

function parseMealItem(
  $: cheerio.CheerioAPI,
  item: Element,
  dayIdx: number,
  mealIdx: number
): Meal | null {
  const $item = $(item);
  const fullText = $item.text().replace(/\s+/g, " ");

  const desc = $item.find(".fit-menu-item__description");
  const container = desc.length ? desc : $item;

  // Name from first span.text-base or first substantial text
  let name = container.find("span.text-base").first().text().trim();
  if (!name) {
    container.children().each((_, el) => {
      if (name) return;
      const t = $(el).text().trim();
      if (t.length > 5 && !t.toLowerCase().includes("kcal")) name = t;
    });
  }
  if (!name) return null;

  const calories = extractInt(/(\d+)\s*kcal/i, fullText);
  if (!calories) return null;

  const protein = extractFirstFloat(
    [/(?:-\s*)?(\d+(?:[.,]\d+)?)\s*g\s*Bílkoviny/i, /Bílkoviny\s*[:\s]*(\d+(?:[.,]\d+)?)/i],
    fullText
  );
  const carbs = extractFirstFloat(
    [/(?:-\s*)?(\d+(?:[.,]\d+)?)\s*g\s*Sacharidy/i, /Sacharidy\s*[:\s]*(\d+(?:[.,]\d+)?)/i],
    fullText
  );
  const fat = extractFirstFloat(
    [/(?:-\s*)?(\d+(?:[.,]\d+)?)\s*g\s*Tuky/i, /Tuky\s*[:\s]*(\d+(?:[.,]\d+)?)/i],
    fullText
  );
  const weight = extractInt(/(\d{2,4})\s*g/, fullText) || null;

  const mealType = MEAL_TYPE_BY_INDEX[mealIdx] ?? "oběd";

  return {
    name,
    mealType,
    mealTypeRu: MEAL_TYPE_RU[mealType] ?? "🍽 Блюдо",
    dayOfWeek: dayIdx,
    dayName: DAYS_RU[dayIdx] ?? `День ${dayIdx + 1}`,
    calories,
    proteinG: protein,
    carbsG: carbs,
    fatG: fat,
    weightG: weight,
  };
}

function parseMenu(html: string): Meal[] {
  const $ = cheerio.load(html);
  const weeks = $(".fit-menu-week__wrapper");
  const target = weeks.length ? weeks.first() : $.root();

  const meals: Meal[] = [];
  target.find(".fit-menu-day__wrapper").each((dayIdx, dayEl) => {
    if (dayIdx >= 6) return;
    $(dayEl)
      .find(".fit-menu-item")
      .each((mealIdx, mealEl) => {
        const meal = parseMealItem($, mealEl, dayIdx, mealIdx);
        if (meal) meals.push(meal);
      });
  });
  return meals;
}

export async function fetchWeeklyMenu(): Promise<WeeklyMenu | null> {
  const pageHtml = await fetchPage();
  if (!pageHtml) return null;

  const fitHtml = await fetchFitTariff(pageHtml);
  const html = fitHtml ?? pageHtml;

  const meals = parseMenu(html);
  if (!meals.length) return null;

  return {
    weekStart: getWeekStart(),
    meals,
    scrapedAt: new Date().toISOString(),
  };
}

export function formatMealForCopy(meal: Meal): string {
  const macros =
    meal.proteinG !== null && meal.carbsG !== null && meal.fatG !== null
      ? ` (Б:${meal.proteinG}г У:${meal.carbsG}г Ж:${meal.fatG}г)`
      : "";
  return `${meal.name} — ${meal.calories} ккал${macros}`;
}
