import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

/**
 * Mirrors the route registration order in src/App.tsx:
 *   static routes are declared BEFORE the dynamic SEO catch-alls
 *     /:city, /:city/:category, /services/:category
 * so React Router resolves them with the correct precedence.
 */
const Static = ({ name }: { name: string }) => <div>STATIC:{name}</div>;
const Seo = () => <div>SEO_PAGE</div>;

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<Static name="home" />} />
        <Route path="/tasks" element={<Static name="tasks" />} />
        <Route path="/login" element={<Static name="login" />} />
        <Route path="/signup" element={<Static name="signup" />} />
        <Route path="/dashboard" element={<Static name="dashboard" />} />
        <Route path="/admin" element={<Static name="admin" />} />
        <Route path="/admin/users" element={<Static name="admin-users" />} />
        <Route path="/profile" element={<Static name="profile" />} />
        <Route path="/messages" element={<Static name="messages" />} />
        <Route path="/payment-success" element={<Static name="payment-success" />} />
        <Route path="/for-taskers" element={<Static name="for-taskers" />} />
        <Route path="/how-it-works" element={<Static name="how-it-works" />} />
        {/* dynamic SEO catch-alls — declared last */}
        <Route path="/israel" element={<Seo />} />
        <Route path="/services/:category" element={<Seo />} />
        <Route path="/:city/:category" element={<Seo />} />
        <Route path="/:city" element={<Seo />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("App routing precedence", () => {
  const staticPaths = [
    ["/", "home"],
    ["/tasks", "tasks"],
    ["/login", "login"],
    ["/signup", "signup"],
    ["/dashboard", "dashboard"],
    ["/admin", "admin"],
    ["/admin/users", "admin-users"],
    ["/profile", "profile"],
    ["/messages", "messages"],
    ["/payment-success", "payment-success"],
    ["/for-taskers", "for-taskers"],
    ["/how-it-works", "how-it-works"],
  ] as const;

  for (const [path, name] of staticPaths) {
    it(`resolves ${path} to static route, not /:city`, () => {
      renderAt(path);
      expect(screen.getByText(`STATIC:${name}`)).toBeInTheDocument();
    });
  }

  it("renders SEO page for /tel-aviv", () => {
    renderAt("/tel-aviv");
    expect(screen.getByText("SEO_PAGE")).toBeInTheDocument();
  });

  it("renders SEO page for /tel-aviv/cleaning", () => {
    renderAt("/tel-aviv/cleaning");
    expect(screen.getByText("SEO_PAGE")).toBeInTheDocument();
  });

  it("renders SEO page for /services/repair", () => {
    renderAt("/services/repair");
    expect(screen.getByText("SEO_PAGE")).toBeInTheDocument();
  });

  it("renders SEO page for /israel (explicit static SEO route)", () => {
    renderAt("/israel");
    expect(screen.getByText("SEO_PAGE")).toBeInTheDocument();
  });
});