import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/public-sans';
import '@fontsource-variable/jetbrains-mono';
import './Design/Tokens.css';
import './Design/Base.css';
import './Design/Typography.css';
import { App } from './App';
import { registerBuiltins } from './Platform/BuiltIns';
import { applyDeviceSettings } from './Store/DeviceStore';
import { installDebugHandle } from './Platform/DebugHandle';
import { installKeyboardShortcuts } from './Platform/Keyboard';

registerBuiltins();
applyDeviceSettings();
installDebugHandle();
installKeyboardShortcuts();

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
