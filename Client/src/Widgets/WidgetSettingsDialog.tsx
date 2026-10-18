import { useState } from 'react';
import { WIDGET_DEFAULT_INTERVAL_MS, WIDGET_MAX_INTERVAL_MS, WIDGET_MIN_INTERVAL_MS, type WidgetSettings } from '@landscape/shared';
import { useDesktopStore } from '../Store/DesktopStore';
import { useUiStore } from '../Store/UiStore';
import { Dialog } from '../Components/Dialog';
import { Button } from '../Components/Button';
import { Select } from '../Components/Select';
import { Toggle } from '../Components/Toggle';
import { toast } from '../Components/Toast';
import { errorMessage } from '../Api/Http';
import { getWidget } from './Registry';

const INTERVALS = [500, 1000, 2000, 5000, 10000, 30000, 60000, 300000];

function formatInterval(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${ms / 1000} s`;
  return `${ms / 60000} min`;
}

export function WidgetSettingsDialog({ widgetId }: { widgetId: string }) {
  const widget = useDesktopStore((s) => s.widgets.find((w) => w.id === widgetId));
  const updateWidgetSettings = useDesktopStore((s) => s.updateWidgetSettings);
  const close = useUiStore((s) => s.openWidgetSettings);
  const [settings, setSettings] = useState<WidgetSettings>(() => widget?.settings ?? { intervalMs: 5000 });
  const [saving, setSaving] = useState(false);
  const definition = widget ? getWidget(widget.type) : undefined;
  if (!widget || !definition) return null;

  const options = [...new Set([...INTERVALS, widget.settings.intervalMs, WIDGET_DEFAULT_INTERVAL_MS[widget.type]])]
    .filter((ms) => ms >= WIDGET_MIN_INTERVAL_MS && ms <= WIDGET_MAX_INTERVAL_MS)
    .sort((a, b) => a - b)
    .map((ms) => ({ value: String(ms), label: formatInterval(ms) + (ms === WIDGET_DEFAULT_INTERVAL_MS[widget.type] ? ' (default)' : '') }));

  const save = async () => {
    setSaving(true);
    try {
      await updateWidgetSettings(widget.id, settings);
      close(null);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      title={`${definition.name} widget`}
      onClose={() => close(null)}
      width={380}
      locked={saving}
      footer={
        <>
          <Button onClick={() => close(null)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <Select
        label="Update interval"
        value={String(settings.intervalMs)}
        options={options}
        onChange={(value) => setSettings({ ...settings, intervalMs: Number(value) })}
      />
      {definition.settingsFields?.map((field) => {
        const value = settings[field.key] ?? field.defaultValue;
        if (field.type === 'toggle') {
          return <Toggle key={field.key} label={field.label} checked={Boolean(value)} onChange={(checked) => setSettings({ ...settings, [field.key]: checked })} />;
        }
        return (
          <Select
            key={field.key}
            label={field.label}
            value={String(value)}
            options={field.options ?? []}
            onChange={(v) => setSettings({ ...settings, [field.key]: v })}
          />
        );
      })}
      {definition.metric && <p className="text-footnote text-secondary">The server samples this metric at the fastest interval any widget asks for and shares the result.</p>}
    </Dialog>
  );
}
