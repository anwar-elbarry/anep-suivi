import { describe, expect, it } from "vitest";
import { entierEnLettres, montantEnLettres } from "./lettres";

describe("nombres en lettres", () => {
  it.each([
    [0, "zéro"],
    [1, "un"],
    [16, "seize"],
    [17, "dix-sept"],
    [21, "vingt et un"],
    [22, "vingt-deux"],
    [71, "soixante et onze"],
    [72, "soixante-douze"],
    [80, "quatre-vingts"],
    [81, "quatre-vingt-un"],
    [91, "quatre-vingt-onze"],
    [100, "cent"],
    [200, "deux cents"],
    [201, "deux cent un"],
    [1000, "mille"],
    [1080, "mille quatre-vingts"],
    [80000, "quatre-vingt mille"],
    [200000, "deux cent mille"],
    [538800, "cinq cent trente-huit mille huit cents"],
    [1000000, "un million"],
    [200000000, "deux cents millions"],
    [2500000, "deux millions cinq cent mille"],
  ])("%i → %s", (n, attendu) => expect(entierEnLettres(n)).toBe(attendu));

  it("écrit les montants avec centimes", () => {
    expect(montantEnLettres(328912.5)).toBe("trois cent vingt-huit mille neuf cent douze dirhams et cinquante centimes");
    expect(montantEnLettres(1)).toBe("un dirham");
    expect(montantEnLettres(1000000)).toBe("un million de dirhams");
    expect(montantEnLettres(0.01)).toBe("zéro dirham et un centime");
  });
});
