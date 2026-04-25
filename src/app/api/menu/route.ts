import { NextResponse } from "next/server";
import { fetchWeeklyMenu } from "@/lib/scraper";

export const dynamic = "force-dynamic";

export async function GET() {
  const menu = await fetchWeeklyMenu();
  if (!menu) {
    return NextResponse.json({ error: "Не удалось загрузить меню с fitkitchen.cz" }, { status: 502 });
  }
  return NextResponse.json(menu);
}
