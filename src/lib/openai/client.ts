import 'server-only'

import OpenAI from 'openai'

const apiKey = process.env.OPENAI_API_KEY
const configuredModel = process.env.OPENAI_MODEL

if (!apiKey) {
  throw new Error('Missing OPENAI_API_KEY environment variable')
}

if (configuredModel !== 'gpt-5-mini') {
  throw new Error('OPENAI_MODEL must be set to gpt-5-mini')
}

export const openai = new OpenAI({ apiKey })
// Use this shared model for every OpenAI feature, including future chatbot logic.
export const OPENAI_MODEL = configuredModel
