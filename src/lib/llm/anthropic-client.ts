import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is not set.");
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

export interface CallClaudeOptions {
  system: string;
  messages: Anthropic.MessageParam[];
  model?: string;
  maxTokens?: number;
}

export async function callClaude({
  system,
  messages,
  model = "claude-sonnet-4-5",
  maxTokens = 4096,
}: CallClaudeOptions): Promise<string> {
  const client = getClient();

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages,
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text content in Claude response.");
  }

  return textBlock.text;
}
