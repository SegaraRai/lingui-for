import { describe, expect, it } from "vitest";

import {
  mergeRuntimeTransValues,
  toRuntimeTransDescriptor,
} from "./trans-descriptor.ts";

describe("toRuntimeTransDescriptor", () => {
  it("preserves descriptor inputs", () => {
    const descriptor = {
      id: "demo.greeting",
      message: "Hello {name}",
      values: {
        name: "Ada",
      },
    };

    expect(toRuntimeTransDescriptor(descriptor)).toBe(descriptor);
  });

  it("builds a descriptor from plain string messages", () => {
    expect(toRuntimeTransDescriptor("Save", "demo.save")).toEqual({
      id: "demo.save",
      message: "Save",
    });
  });

  it("falls back to the message text when no explicit id is provided", () => {
    expect(toRuntimeTransDescriptor("Save")).toEqual({
      id: "Save",
      message: "Save",
    });
  });
});

describe("mergeRuntimeTransValues", () => {
  it("keeps descriptor values when no overrides are provided", () => {
    expect(
      mergeRuntimeTransValues({
        id: "demo.greeting",
        message: "Hello {name}",
        values: {
          name: "Ada",
        },
      }),
    ).toEqual({
      id: "demo.greeting",
      message: "Hello {name}",
      values: {
        name: "Ada",
      },
    });
  });

  it("merges runtime values on top of descriptor values", () => {
    expect(
      mergeRuntimeTransValues(
        {
          id: "demo.greeting",
          message: "Hello {name} from {place}",
          values: {
            name: "Descriptor Ada",
            place: "Tokyo",
          },
        },
        {
          name: "Runtime Ada",
        },
      ),
    ).toEqual({
      id: "demo.greeting",
      message: "Hello {name} from {place}",
      values: {
        name: "Runtime Ada",
        place: "Tokyo",
      },
    });
  });
});
