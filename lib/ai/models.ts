// Explicit aliases: no fuzzy matching of different model generations or sizes.
export const sharedModels = [
  { id: "nemotron-super", name: "Nemotron 3 Super 120B A12B", nvidia: "nvidia/nemotron-3-super-120b-a12b", openrouter: "nvidia/nemotron-3-super-120b-a12b:free" },
  { id: "nemotron-lightning", name: "Nemotron 3.5 Lightning 30B A3B", nvidia: "nvidia/nemotron-3.5-lightning-30b-a3b", openrouter: "nvidia/nemotron-3.5-lightning:free" },
  { id: "nemotron-ultra", name: "Nemotron 3 Ultra 550B A55B", nvidia: "nvidia/nemotron-3-ultra-550b-a55b", openrouter: "nvidia/nemotron-3-ultra-550b-a55b:free" },
  { id: "gemma-31b", name: "Gemma 4 31B", nvidia: "google/gemma-4-31b-it", openrouter: "google/gemma-4-31b-it:free" },
  { id: "nemotron-omni", name: "Nemotron 3 Nano Omni 30B A3B", nvidia: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning", openrouter: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free" },
  { id: "laguna-xs", name: "Laguna XS 2.1 (code focused)", nvidia: "poolside/laguna-xs-2.1", openrouter: "poolside/laguna-xs-2.1:free" },
] as const;
export const endpoints = { nvidia: "https://integrate.api.nvidia.com/v1", openrouter: "https://openrouter.ai/api/v1" } as const;
