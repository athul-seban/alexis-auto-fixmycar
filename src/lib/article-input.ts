import { z } from "zod"
import { isValidSlug, slugify } from "@/lib/articles"

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null))

export const articleInputSchema = z
  .object({
    title: z.string().trim().min(3, "Give the article a title").max(140),
    slug: z.string().trim().max(80).optional(),
    excerpt: optionalText(300),
    body: z.string().trim().min(20, "The article needs some content").max(50_000),
    metaTitle: optionalText(70),
    metaDescription: optionalText(170),
    status: z.enum(["DRAFT", "PUBLISHED"]),
  })
  .transform((a) => ({ ...a, slug: a.slug ? a.slug : slugify(a.title) }))
  .refine((a) => isValidSlug(a.slug), { message: "The web address can only use lower-case letters, numbers and hyphens", path: ["slug"] })

export type ArticleInput = z.infer<typeof articleInputSchema>
