import { useDesktopStore } from '../Store/DesktopStore';
import { registries } from '../Platform/Registries';
import { useRegistry } from '../Platform/Registry';

/** Renders every placed widget via its registry definition. */
export function WidgetLayer() {
  const widgets = useDesktopStore((s) => s.widgets);
  const definitions = useRegistry(registries.widgets);
  return (
    <>
      {widgets.map((widget) => {
        const definition = definitions.find((d) => d.id === widget.type);
        if (!definition) return null;
        const Component = definition.component;
        return <Component key={widget.id} widget={widget} />;
      })}
    </>
  );
}
