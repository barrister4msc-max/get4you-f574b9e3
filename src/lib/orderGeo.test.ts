import { describe, it, expect } from "vitest";
import { cityFromPlace, neighborhoodFromPlace, isGeoStale, cityLabel, type OrderGeo } from "./orderGeo";

// Shapes copied from real Nominatim reverse responses (Tel Aviv, relation 1382494).
const nd = { name: "תל־אביב–יפו", "name:en": "Tel Aviv-Yafo", "name:ru": "Тель-Авив", "name:ar": "تل أبيب - يافا", alt_name: "Tel-Aviv" };
const cityHe = { osm_type: "relation", osm_id: 1382494, addresstype: "city", name: "תל־אביב–יפו", address: { city: "תל־אביב–יפו", country_code: "il" }, namedetails: nd };
const cityEn = { ...cityHe, name: "Tel-Aviv", address: { city: "Tel-Aviv", country_code: "il" } };

describe("order geography", () => {
  it("same city in different languages → same stable ID", () => {
    const a = cityFromPlace(cityHe)!, b = cityFromPlace(cityEn)!;
    expect(a.id).toBe("osm:R1382494");
    expect(b.id).toBe(a.id);
    expect(a.countryCode).toBe("IL");
    expect(a.names.ru).toBe("Тель-Авив");
    expect(a.aliases).toContain("Tel-Aviv");
  });
  it("administrative district is not a city or neighborhood", () => {
    expect(cityFromPlace({ osm_type: "relation", osm_id: 1, addresstype: "state_district", address: { country_code: "il" } })).toBeNull();
    expect(neighborhoodFromPlace({ osm_type: "relation", osm_id: 2, addresstype: "county", address: {} }, [])).toBeNull();
    expect(neighborhoodFromPlace({ osm_type: "relation", osm_id: 3, addresstype: "city_district", address: {} }, [])).toBeNull();
  });
  it("missing neighborhood stays unknown (road result is not guessed)", () => {
    expect(neighborhoodFromPlace({ osm_type: "way", osm_id: 1232777971, addresstype: "road", name: "Arlosoroff", address: { suburb: "X", city: "Tel-Aviv" } }, ["Tel-Aviv"])).toBeNull();
  });
  it("neighborhood accepted only inside the same city", () => {
    const nb = { osm_type: "node", osm_id: 77, addresstype: "suburb", name: "Florentin", address: { city: "Tel-Aviv" } };
    expect(neighborhoodFromPlace(nb, ["Tel-Aviv"])?.id).toBe("osm:N77");
    expect(neighborhoodFromPlace(nb, ["Haifa"])).toBeNull();
  });
  it("changing the address (city) invalidates city and neighborhood together", () => {
    const g = { resolvedFor: "Dizengoff 1, Tel Aviv", cityNames: { default: "x", he: "תל אביב" } } as unknown as OrderGeo;
    expect(isGeoStale(g, "Dizengoff 1, Tel Aviv")).toBe(false);
    expect(isGeoStale(g, "Herzl 1, Haifa")).toBe(true);
    expect(cityLabel(g, "he")).toBe("תל אביב");
    expect(cityLabel(g, "ru")).toBe("x");
  });
});
