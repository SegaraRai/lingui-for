import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { defineCollection } from "astro:content";

const guides = defineCollection({
  loader: glob({
    pattern: "**/*.{md,mdx}",
    base: "./src/data/guides",
  }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
  }),
});

export const collections = {
  guides,
};
