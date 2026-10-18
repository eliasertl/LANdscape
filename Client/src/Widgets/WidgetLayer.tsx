import { useDesktopStore } from '../Store/DesktopStore';
import { getWidget } from './Registry';

/** Renders every placed widget via its registry definition. */
export function WidgetLayer() {
  const widgets = useDesktopStore((s) => s.widgets);
  return (
    <>
      {widgets.map((widget) => {
        const definition = getWidget(widget.type);
        if (!definition) return null;
        const Component = definition.component;
        return <Component key={widget.id} widget={widget} />;
      })}
    </>
  );
}
