import type { ZodObject, ZodType } from 'zod';
import type { Icon } from '@phosphor-icons/react';
import { registries } from './Registries';
import type { RegistryEntry } from './Registry';

/** A parameter the command palette asks for before running an action. */
export interface ActionParamField {
  key: string;
  label: string;
  placeholder?: string;
  /** Pick from a list instead of typing (containers, shortcuts, …); loaded when the palette shows the field. */
  choices?: () => Promise<{ value: string; label: string; detail?: string }[]>;
}

/**
 * An action: something the command palette, keyboard shortcuts and other
 * apps can run. Built-in and catalog apps provide them the same way.
 * Server-backed work stays in the REST API; `run` only calls it.
 */
export interface ActionDefinition<P = Record<string, unknown>> extends RegistryEntry {
  title: string;
  /** Short line under the title in the palette. */
  description?: string;
  icon?: Icon;
  /** "core" or an app id. */
  provider: string;
  /** Validated before run; omit for actions without parameters. */
  params?: ZodType<P>;
  /** How to ask for the parameters (one field per key of `params`). */
  fields?: ActionParamField[];
  /** Hidden from the palette (only for other apps or shortcuts). */
  hidden?: boolean;
  run: (params: P) => void | Promise<void>;
}

export type AnyAction = ActionDefinition<Record<string, unknown>>;

export function registerAction<P>(action: ActionDefinition<P>): () => void {
  return registries.actions.register(action as unknown as AnyAction);
}

/** Runs an action by id with validated parameters. Throws on unknown ids or invalid parameters. */
export async function runAction(id: string, params: Record<string, unknown> = {}): Promise<void> {
  const action = registries.actions.get(id);
  if (!action) throw new Error(`Unknown action "${id}"`);
  const parsed = action.params ? action.params.safeParse(params) : null;
  if (parsed && !parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(issue ? `${issue.path.join('.') || 'params'}: ${issue.message}` : 'Invalid parameters');
  }
  await action.run((parsed?.data as Record<string, unknown> | undefined) ?? params);
}

/** The parameter keys an action needs (for the palette's inline prompt). */
export function actionParamKeys(action: AnyAction): string[] {
  const schema = action.params as ZodObject | undefined;
  if (!schema || !('shape' in schema)) return [];
  return Object.keys(schema.shape as Record<string, unknown>);
}
