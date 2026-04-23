import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * Интеграционный тест RPC get_nearby_tasks.
 * Проверяет, что задача «Вайб» (фиксированные координаты в БД)
 * возвращается для разных радиусов и сортируется по расстоянию.
 *
 * Запускается против реального Supabase. При отсутствии переменных
 * окружения (например в CI без секретов) тест мягко скипается.
 */

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ?? "https://emkiekjlxmtnzrgzfdep.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVta2lla2pseG10bnpyZ3pmZGVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NzA1NDIsImV4cCI6MjA5MDA0NjU0Mn0.bilSwoFexDRoJ57zx8Oth2B2BQmV8tuOIB-VAGem5TA";

// Координаты задачи «Вайб» в БД
const VIBE_LAT = 49.7421619632432;
const VIBE_LNG = 18.6338342396047;
const VIBE_TITLE = "Вайб";

const skipIfNoNetwork = process.env.SKIP_INTEGRATION === "1";

describe.skipIf(skipIfNoNetwork)("RPC get_nearby_tasks (integration)", () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  it("returns Вайб at distance ~0 when querying its exact coordinates (radius=1km)", async () => {
    const { data, error } = await supabase.rpc("get_nearby_tasks", {
      p_lat: VIBE_LAT,
      p_lng: VIBE_LNG,
      p_radius_km: 1,
    });

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);

    const vibe = (data ?? []).find((t: any) => t.title === VIBE_TITLE);
    expect(vibe, "Задача «Вайб» должна быть в радиусе 1 км").toBeTruthy();
    expect(vibe!.distance_meters).toBeLessThan(50);
    expect(vibe!.status).toBe("open");
    expect(vibe!.latitude).toBeCloseTo(VIBE_LAT, 4);
    expect(vibe!.longitude).toBeCloseTo(VIBE_LNG, 4);
  });

  it("returns Вайб from ~40km away when radius is large enough (100km)", async () => {
    const { data, error } = await supabase.rpc("get_nearby_tasks", {
      p_lat: 50.0,
      p_lng: 19.0,
      p_radius_km: 100,
    });

    expect(error).toBeNull();
    const vibe = (data ?? []).find((t: any) => t.title === VIBE_TITLE);
    expect(vibe, "Вайб должен попадать в радиус 100 км от (50.0, 19.0)").toBeTruthy();
    expect(vibe!.distance_meters).toBeGreaterThan(10_000);
    expect(vibe!.distance_meters).toBeLessThan(100_000);
  });

  it("excludes Вайб when radius is too small from a far point (1km from 50.0,19.0)", async () => {
    const { data, error } = await supabase.rpc("get_nearby_tasks", {
      p_lat: 50.0,
      p_lng: 19.0,
      p_radius_km: 1,
    });

    expect(error).toBeNull();
    const vibe = (data ?? []).find((t: any) => t.title === VIBE_TITLE);
    expect(vibe, "Вайб не должен возвращаться при малом радиусе с дальней точки").toBeFalsy();
  });

  it("returns results sorted by distance (ascending)", async () => {
    const { data, error } = await supabase.rpc("get_nearby_tasks", {
      p_lat: VIBE_LAT,
      p_lng: VIBE_LNG,
      p_radius_km: 100,
    });

    expect(error).toBeNull();
    const distances = (data ?? []).map((t: any) => Number(t.distance_meters));
    const sorted = [...distances].sort((a, b) => a - b);
    expect(distances).toEqual(sorted);
  });

  it("only returns tasks with status=open", async () => {
    const { data, error } = await supabase.rpc("get_nearby_tasks", {
      p_lat: VIBE_LAT,
      p_lng: VIBE_LNG,
      p_radius_km: 50,
    });

    expect(error).toBeNull();
    for (const task of data ?? []) {
      expect(task.status).toBe("open");
    }
  });
});