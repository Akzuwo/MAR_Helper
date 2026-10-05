export const ASSISTANT_MODELS = ['qwen3.5:2b', 'qwen3.5:4b', 'qwen3.5:9b'] as const;
export function selectAssistantModel(memoryBytes: number): { model: string; modelDownloadGb: number; reason: string } {
  const gb = memoryBytes / 1024 ** 3;
  // Reserve memory for Windows, MAR Helper and a bounded 8K inference context. No assumed GPU memory.
  if (gb >= 24) return { model: 'qwen3.5:9b', modelDownloadGb: 6.6, reason: 'Mindestens 24 GB RAM: das stärkere 9B-Modell mit Reserve für die App.' };
  if (gb >= 12) return { model: 'qwen3.5:4b', modelDownloadGb: 3.4, reason: 'Mindestens 12 GB RAM: das 4B-Modell mit Reserve für die App.' };
  return { model: 'qwen3.5:2b', modelDownloadGb: 2.7, reason: 'Das kompakte 2B-Modell hält den Speicherbedarf auf diesem Gerät kleiner.' };
}
