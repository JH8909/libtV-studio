import { ProviderRegistry } from "./registry";
import { KlingProvider } from "./providers/kling";
import { MockProvider } from "./providers/mock";
import { VolcengineProvider } from "./providers/volcengine";

let singleton: ProviderRegistry | undefined;

export function getProviderRegistry(): ProviderRegistry {
  if (singleton) return singleton;
  const registry = new ProviderRegistry();
  if ((process.env.ENABLE_MOCK_PROVIDER ?? "true") !== "false") registry.register(new MockProvider());
  registry.register(new VolcengineProvider());
  registry.register(new KlingProvider());
  singleton = registry;
  return registry;
}
