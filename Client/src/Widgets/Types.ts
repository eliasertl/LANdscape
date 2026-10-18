import type { ComponentType } from 'react';
import type { Icon } from '@phosphor-icons/react';
import type { MetricName, Widget, WidgetType } from '@landscape/shared';

export interface WidgetProps {
  widget: Widget;
}

export interface WidgetSettingsField {
  key: string;
  label: string;
  type: 'select' | 'toggle';
  /** Static options, or a function for options that depend on live data (e.g. interface names). */
  options?: { value: string; label: string }[] | (() => { value: string; label: string }[]);
  defaultValue: unknown;
}

export interface WidgetDefinition {
  type: WidgetType;
  name: string;
  description: string;
  icon: Icon;
  component: ComponentType<WidgetProps>;
  /** Server metric this widget subscribes to, or null for client-only widgets (clock). */
  metric: MetricName | null;
  size: { width: number; height: number };
  /** Extra per-widget settings besides the update interval. */
  settingsFields?: WidgetSettingsField[];
}
