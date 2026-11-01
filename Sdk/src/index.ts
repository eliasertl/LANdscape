/**
 * @landscape/sdk — types for catalog apps.
 *
 * At runtime the host injects `window.landscape` (built from Runtime.ts)
 * into every app frame, so an app never bundles this package; it only
 * imports the types:
 *
 *   import type { Landscape } from '@landscape/sdk';
 *   declare const landscape: Landscape;
 *
 * See Docs/AppSdk.md.
 */
export type { FrameContext } from './Protocol';
export type { Landscape, MetricName, Unsubscribe, WidgetSize, LogSource, ThemeTokens } from './Types';
