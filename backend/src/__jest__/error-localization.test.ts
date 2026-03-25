import {
  resolvePreferredLanguage,
  translateErrorMessage,
} from "../i18n/error-localization.js";

describe("error localization", () => {
  it("selects the highest-priority supported language from Accept-Language", () => {
    expect(resolvePreferredLanguage("fr-CA,fr;q=0.9,en;q=0.8")).toBe("fr");
    expect(resolvePreferredLanguage("de-DE,de;q=0.9,es;q=0.7")).toBe("es");
  });

  it("falls back to English for unsupported or missing languages", () => {
    expect(resolvePreferredLanguage(undefined)).toBe("en");
    expect(resolvePreferredLanguage("de-DE,de;q=0.9")).toBe("en");
  });

  it("translates known error codes and preserves fallback messages for unknown codes", () => {
    expect(
      translateErrorMessage(
        "ERR_INVALID_ADDRESS_FORMAT",
        "ar-SA,ar;q=0.9,en;q=0.8",
        "Invalid address format",
      ),
    ).toBe("تنسيق العنوان غير صالح");

    expect(
      translateErrorMessage(
        "ERR_NOT_IN_DICTIONARY",
        "fr-FR,fr;q=0.9",
        "Original fallback",
      ),
    ).toBe("Original fallback");
  });
});
