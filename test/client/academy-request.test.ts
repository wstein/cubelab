import {describe, expect, test} from "vitest";

import {createAcademyRequestGuard} from "../../src/client/academy-request";

describe("Academy request guard", () => {
  test("rejects a prior result after a replacement request", () => {
    const guard = createAcademyRequestGuard();
    const first = guard.begin();
    const second = guard.begin();
    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.isCurrent(second)).toBe(true);
  });

  test.each(["setup edit", "method change", "target edit"])("rejects a pending result after %s", () => {
    const guard = createAcademyRequestGuard();
    const request = guard.begin();
    guard.invalidate();
    expect(guard.isCurrent(request)).toBe(false);
  });
});
