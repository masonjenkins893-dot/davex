import { PROVIDERS } from '../config/constants.js';
import { fetchModels, saveProvider, setActiveProvider, listSavedProviders, getActiveProvider } from '../providers/registry.js';

export async function runProvidersWizardCLI(): Promise<void> {
  const prompts = (await import('prompts')).default;

  const { providerId } = await prompts({
    type: 'select',
    name: 'providerId',
    message: 'Choose a provider',
    choices: PROVIDERS.map(p => ({ title: p.name, value: p.id })),
  });
  if (!providerId) return;

  const { apiKey } = await prompts({
    type: 'password',
    name: 'apiKey',
    message: 'Enter your API key',
  });
  if (!apiKey) return;

  console.log('Fetching available models...');
  const models = await fetchModels(providerId, apiKey);

  const { model } = await prompts({
    type: 'select',
    name: 'model',
    message: 'Choose a model',
    choices: models.map(m => ({ title: m, value: m })),
  });
  if (!model) return;

  await saveProvider(providerId, apiKey, model);
  await setActiveProvider(providerId, model);
  console.log(`✅ Provider set: ${providerId} / ${model}`);
}

export async function runChangeModelCLI(): Promise<void> {
  const prompts = (await import('prompts')).default;
  const providers = await listSavedProviders();

  if (providers.length === 0) {
    console.log('No providers configured yet. Run /providers first.');
    return;
  }

  const { providerId } = await prompts({
    type: 'select',
    name: 'providerId',
    message: 'Choose a saved provider',
    choices: providers.map(p => ({ title: `${p.name} (current: ${p.model})`, value: p.id })),
  });
  if (!providerId) return;

  const provider = providers.find(p => p.id === providerId)!;
  const models = await fetchModels(providerId, provider.apiKey);

  const { model } = await prompts({
    type: 'select',
    name: 'model',
    message: 'Choose a model',
    choices: models.map(m => ({ title: m, value: m })),
  });
  if (!model) return;

  await setActiveProvider(providerId, model);
  console.log(`✅ Model changed to: ${model}`);
}
