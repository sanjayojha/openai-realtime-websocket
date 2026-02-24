import { defineAction } from "astro:actions";
import { z } from "astro/zod";
const openAIApiKey = import.meta.env.OPENAI_API_KEY;
import OpenAI from "openai";

export const server = {
    getOpenAIToken: defineAction({
        input: z
            .object({
                expireAfter: z.number().optional(),
            })
            .optional(),
        handler: async (input) => {
            const client = new OpenAI({
                apiKey: openAIApiKey, // This is the default and can be omitted
            });
            const body: { expires_after?: { seconds: number; anchor: "created_at" } } = {};
            if (input?.expireAfter) {
                body.expires_after = { seconds: input.expireAfter, anchor: "created_at" };
            }

            const clientSecret = await client.realtime.clientSecrets.create(body);
            return { ephemeralKey: clientSecret.value };
        },
    }),
};
