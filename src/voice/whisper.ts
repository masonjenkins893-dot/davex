import fs from 'fs-extra';
import { getSetting, setSetting } from '../config/settings.js';
import { prepare } from '../storage/db.js';

export async function transcribeVoice(audioFilePath: string): Promise<string> {
  // Get or ask for Groq API key
  let groqKey = getSetting('groqApiKeyForWhisper');
  if (!groqKey) {
    throw new Error('NEEDS_GROQ_KEY');
  }

  const Groq = (await import('groq-sdk')).default;
  const groq = new Groq({ apiKey: groqKey });

  const audioStream = fs.createReadStream(audioFilePath);

  const transcription = await groq.audio.transcriptions.create({
    file: audioStream as any,
    model: 'whisper-large-v3',
    response_format: 'text',
  });

  return typeof transcription === 'string' ? transcription : (transcription as any).text ?? '';
}

export function saveGroqWhisperKey(apiKey: string): void {
  setSetting('groqApiKeyForWhisper', apiKey);
  // Also save to providers table so it can be reused
  const existing = prepare("SELECT id FROM providers WHERE id = 'groq'").get();
  if (!existing) {
    prepare("INSERT OR IGNORE INTO providers (id, name, api_key, base_url) VALUES ('groq', 'Groq', ?, 'https://api.groq.com/openai/v1')")
      .run(apiKey);
  }
}

export function hasGroqWhisperKey(): boolean {
  const key = getSetting('groqApiKeyForWhisper');
  // Also check providers table
  if (!key) {
    const row = prepare("SELECT api_key FROM providers WHERE id = 'groq'").get() as any;
    if (row?.api_key) {
      setSetting('groqApiKeyForWhisper', row.api_key);
      return true;
    }
  }
  return !!key;
}
