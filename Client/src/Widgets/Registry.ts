import { Clock } from '@phosphor-icons/react';
import type { WidgetType } from '@landscape/shared';
import type { WidgetDefinition } from './Types';
import { ClockWidget } from './Clock/ClockWidget';

/**
 * Widget catalogue. Each widget is a self-contained folder; the metric
 * widgets register here in milestone 3.
 */
export const WIDGETS: WidgetDefinition[] = [
  {
    type: 'clock',
    name: 'Clock',
    description: 'Time and date',
    icon: Clock,
    component: ClockWidget,
    metric: null,
    size: { width: 220, height: 120 },
    settingsFields: [
      {
        key: 'showSeconds',
        label: 'Show seconds',
        type: 'toggle',
        defaultValue: false,
      },
    ],
  },
];

const byType = new Map(WIDGETS.map((w) => [w.type, w]));

export function getWidget(type: WidgetType): WidgetDefinition | undefined {
  return byType.get(type);
}
