import OpenAI from "openai";
import { DEEPSEEK_API_KEY } from "./config";

export const llm = new OpenAI({
  apiKey: DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
});