import fs from 'fs-extra';
import { getSetting, setSetting } from '../config/settings.js';
import { getDb } from '../storage/db.js';

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

export async function saveGroqWhisperKey(apiKey: string): Promise<void> {
  setSetting('groqApiKeyForWhisper', apiKey);
  // Also save to providers table so it can be reused
  const db = getDb();
  const { data: existing } = await db.from('providers').select('id').eq('id', 'groq').maybeSingle();
  if (!existing) {
    await db.from('providers').insert({
      id: 'groq', name: 'Groq', api_key: apiKey, base_url: 'https://api.groq.com/openai/v1',
    });
  }
}

export async function hasGroqWhisperKey(): Promise<boolean> {
  const key = getSetting('groqApiKeyForWhisper');
  if (key) return true;

  // Also check providers table in case Groq was added via /providers instead
  const db = getDb();
  const { data: row } = await db.from('providers').select('api_key').eq('id', 'groq').maybeSingle();
  if (row?.api_key) {
    setSetting('groqApiKeyForWhisper', row.api_key);
    return true;
  }
  return false;
}
