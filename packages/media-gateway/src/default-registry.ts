import { ProviderRegistry } from "./registry";
import { KlingProvider } from "./providers/kling";
import { VolcengineProvider } from "./providers/volcengine";

let singleton: ProviderRegistry | undefined;

export function getProviderRegistry(): ProviderRegistry {
  if (singleton) return singleton;
  const registry = new ProviderRegistry();
  registry.register(new VolcengineProvider());
  registry.register(new KlingProvider());
  singleton = registry;
  return registry;
}
