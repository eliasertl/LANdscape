import { useEffect, useState } from 'react';
import type { WidgetProps } from './Types';
import { WidgetFrame } from './WidgetFrame';
import { AppFrame } from '../Apps/AppFrame';
import { installedApp } from '../Platform/InstalledApps';
import { sendFrameEvent } from '../Platform/AppBroker';
import { getWidget } from './Registry';

/** A widget contributed by a catalog app: the widget frame with a sandboxed AppFrame inside. */
export default function AppWidget({ widget }: WidgetProps) {
  const [appId, widgetId] = widget.type.split('/');
  const app = appId ? installedApp(appId) : undefined;
  const definition = getWidget(widget.type);
  const [frame, setFrame] = useState<Window | null>(null);
  const params = { settings: widget.settings, size: widget.size, widgetId };

  useEffect(() => {
    if (frame) sendFrameEvent(frame, 'params', params);
    // Settings/size changes are forwarded as a params event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, widget.settings, widget.size]);

  return (
    <WidgetFrame widget={widget} title={definition?.name ?? widget.type} unavailable={app ? null : 'This widget belongs to an app that is not installed.'}>
      {app && widgetId && <AppFrame app={app} surface="widget" surfaceId={widgetId} params={params} onWindow={setFrame} title={definition?.name} style={{ margin: '-4px -2px -2px' }} />}
    </WidgetFrame>
  );
}
