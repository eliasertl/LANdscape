import { registerBuiltinApps } from '../Apps/Registry';
import { registerBuiltinWidgets } from '../Widgets/Registry';

/** Registers everything compiled into LANdscape. Runs once, before the first render. */
export function registerBuiltins(): void {
  registerBuiltinApps();
  registerBuiltinWidgets();
}
