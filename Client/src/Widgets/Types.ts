import type { ComponentType } from 'react';
import type { Icon } from '@phosphor-icons/react';
import type { CellSize, MetricName, Widget, WidgetSize, WidgetType } from '@landscape/shared';
import type { EntrySource } from '../Platform/Registry';

export interface WidgetProps {
  /** `widget.size` tells the component which size step it renders at. */
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
  /** The widget type stored on placed widgets. */
  id: WidgetType;
  source?: EntrySource;
  name: string;
  description: string;
  icon: Icon;
  component: ComponentType<WidgetProps>;
  /** Server metric this widget subscribes to, or null for client-only widgets (clock). */
  metric: MetricName | null;
  /** Cell spans per size step (whole app-icon cells). Medium is required; the others appear in the size picker when declared. */
  sizes: { s?: CellSize; m: CellSize; l?: CellSize };
  /** Update interval for new widgets of this type. */
  defaultIntervalMs: number;
  /** Extra per-widget settings besides the update interval. */
  settingsFields?: WidgetSettingsField[];
}

export const WIDGET_SIZE_LABELS: Record<WidgetSize, string> = { s: 'Small', m: 'Medium', l: 'Large' };
