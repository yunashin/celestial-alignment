import { describe, expect, it } from "vitest";
import { fmtNum } from "./log";

describe("fmtNum", () => {
  it("strips floating-point noise down to 1 decimal place", () => {
    expect(fmtNum(2.0999999999999996)).toBe("2.1");
  });

  it("prints a whole number with no trailing decimal", () => {
    expect(fmtNum(3)).toBe("3");
    expect(fmtNum(64)).toBe("64");
    expect(fmtNum(0)).toBe("0");
  });

  it("rounds a value that lands exactly on a whole number after 1-decimal rounding", () => {
    expect(fmtNum(6.999999999999999)).toBe("7");
  });

  it("keeps a genuine, clean 1-decimal value as-is", () => {
    expect(fmtNum(2.1)).toBe("2.1");
    expect(fmtNum(10.5)).toBe("10.5");
  });

  it("rounds anything finer than 1 decimal place down to 1 decimal", () => {
    expect(fmtNum(2.147)).toBe("2.1");
    expect(fmtNum(2.16)).toBe("2.2");
  });
});
