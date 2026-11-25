import { expect, it } from "vitest";
import { searchKey } from "../shared/text";

it("builds a lowercase, accent-free search key from non-empty parts", () => {
  expect(searchKey("María Gómez", null, "3058147293")).toBe("maria gomez 3058147293");
});
