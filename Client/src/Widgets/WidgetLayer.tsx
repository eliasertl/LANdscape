import { useDesktopStore } from '../Store/DesktopStore';
import { registries } from '../Platform/Registries';
import { useRegistry } from '../Platform/Registry';
import { ErrorBoundary } from '../Components/ErrorBoundary';
import { WidgetFrame } from './WidgetFrame';

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
        // A crashing widget keeps its frame (so it can still be moved or removed) and shows the error inside.
        return (
          <ErrorBoundary
            key={widget.id}
            label={`${definition.name} widget`}
            frame={(card) => (
              <WidgetFrame widget={widget} title={definition.name}>
                {card}
              </WidgetFrame>
            )}
          >
            <Component widget={widget} />
          </ErrorBoundary>
        );
      })}
    </>
  );
}
