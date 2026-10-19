import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));
vi.mock("@/i18n/LanguageContext", () => ({ useLanguage: () => ({ locale: "en", currency: "ILS", t: (k: string) => k }) }));
vi.mock("@/hooks/useFormatPrice", () => ({ useFormatPrice: () => (n: number) => `₪${n}` }));

import { PriceEstimator } from "./PriceEstimator";

const hist = (rec: number) => ({ status: "available", method: "history", currency: "ILS", min: rec - 100, recommended: rec, max: rec + 100, provenance: { sampleSize: 5 } });

describe("PriceEstimator", () => {
  beforeEach(() => { vi.useFakeTimers(); invoke.mockReset(); });

  it("ignores a late response for old parameters", async () => {
    let resolveOld!: (v: unknown) => void;
    invoke.mockImplementationOnce(() => new Promise((r) => { resolveOld = r; }))
          .mockImplementationOnce(() => Promise.resolve({ data: hist(1000), error: null }));
    const props = { category: "cleaning", city: "Haifa", onUseSuggested: vi.fn() };
    const { rerender } = render(<PriceEstimator {...props} serviceDetails={{ area_m2: 100 }} />);
    await act(async () => { vi.advanceTimersByTime(700); });
    rerender(<PriceEstimator {...props} serviceDetails={{ area_m2: 200 }} />);
    await act(async () => { vi.advanceTimersByTime(700); });
    await act(async () => { resolveOld({ data: hist(300), error: null }); });
    expect(screen.queryByText("₪300")).toBeNull();
    expect(screen.getByText("₪1000")).toBeTruthy();
  });

  it("never sets budget without a click; error shows retry, no price", async () => {
    const onUse = vi.fn();
    invoke.mockResolvedValueOnce({ data: null, error: new Error("boom") });
    render(<PriceEstimator category="cleaning" city="" serviceDetails={{ area_m2: 50 }} onUseSuggested={onUse} />);
    await act(async () => { vi.advanceTimersByTime(700); });
    expect(screen.getByText("Retry")).toBeTruthy();
    expect(screen.queryByText(/₪/)).toBeNull();
    expect(onUse).not.toHaveBeenCalled();
    invoke.mockResolvedValueOnce({ data: hist(600), error: null });
    fireEvent.click(screen.getByText("Retry"));
    await act(async () => { vi.advanceTimersByTime(700); });
    expect(onUse).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Use this price"));
    expect(onUse).toHaveBeenCalledWith(600);
  });
});
