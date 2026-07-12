import { execa } from 'execa';
import axios from 'axios';
import { setActiveProvider, saveProvider } from './registry.js';

export async function checkLocalModelStatus(): Promise<{ running: boolean; models: string[] }> {
  try {
    const res = await axios.get('http://localhost:11434/api/tags', { timeout: 3000 });
    return { running: true, models: res.data.models.map((m: any) => m.name) };
  } catch {
    return { running: false, models: [] };
  }
}

export async function startLocalModelServer(): Promise<string> {
  try {
    await execa('which', ['ollama']);
  } catch {
    return '❌ Ollama not installed. Install it from https://ollama.com then try again.';
  }

  const child = execa('ollama', ['serve'], { detached: true, stdio: 'ignore', reject: false });
  child.unref();
  await new Promise(r => setTimeout(r, 2000));

  const status = await checkLocalModelStatus();
  return status.running
    ? `✅ Local model server started.\nAvailable models: ${status.models.join(', ') || 'none pulled yet'}`
    : '⚠️ Server started but not responding yet. Try again in a few seconds.';
}

export async function stopLocalModelServer(): Promise<string> {
  try {
    await execa('pkill', ['-f', 'ollama serve'], { reject: false });
    return '⏹️ Local model server stopped.';
  } catch (err: any) {
    return `Error stopping server: ${err.message}`;
  }
}

export async function pullLocalModel(modelName: string): Promise<string> {
  const result = await execa('ollama', ['pull', modelName], { reject: false, all: true });
  return result.all ?? `Pulled ${modelName}`;
}

export async function setActiveLocalModel(modelName: string): Promise<void> {
  await saveProvider('localmodel', 'not-needed', modelName);
  await setActiveProvider('localmodel', modelName);
}
