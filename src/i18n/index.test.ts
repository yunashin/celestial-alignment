import { afterEach, describe, expect, it } from "vitest";
import { LANGUAGES, getLocale, setLocale, t } from "./index";

describe("t()", () => {
  afterEach(() => setLocale("en")); // module-level locale state persists across tests in this file

  it("resolves a nested dot-path key", () => {
    expect(t("signs.ARIES.label")).toBe("Aries");
  });

  it("interpolates named placeholders", () => {
    expect(t("log.move", { name: "Guardian 1", x: 3, y: 5 })).toBe("Guardian 1 moves to (3,5).");
  });

  it("leaves an unrecognized placeholder token untouched if no matching param is given", () => {
    expect(t("log.move", { name: "Guardian 1" })).toBe("Guardian 1 moves to ({x},{y}).");
  });

  it("falls back to the key itself when it matches nothing in any locale — lets test code pass literal text through unchanged", () => {
    expect(t("This is not a real translation key.")).toBe("This is not a real translation key.");
  });

  it("switches which locale subsequent calls read from", () => {
    const enValue = t("signs.ARIES.label");
    setLocale("ko");
    expect(getLocale()).toBe("ko");
    // Asserts the switch mechanism actually re-reads from the new locale's dict, without pinning
    // this test to either locale's exact translated text (which is free to keep changing as real
    // Korean copy lands in ko.yaml).
    expect(t("signs.ARIES.label")).not.toBe(enValue);
  });

  it("ignores an unknown locale code", () => {
    const before = getLocale();
    setLocale("xx-not-a-real-locale");
    expect(getLocale()).toBe(before);
  });

  it("lists English and Korean as available languages", () => {
    expect(LANGUAGES.map((l) => l.code)).toEqual(["en", "ko"]);
  });
});
