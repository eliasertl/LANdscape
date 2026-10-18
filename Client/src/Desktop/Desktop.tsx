import { useSessionStore } from '../Store/SessionStore';
import { Button } from '../Components/Button';

/** Placeholder until the desktop shell lands in milestone 2. */
export function Desktop() {
  const logout = useSessionStore((s) => s.logout);
  return (
    <div style={{ padding: 24 }}>
      <h1 className="text-large-title emphasized">Desktop</h1>
      <p className="text-body text-secondary" style={{ marginTop: 8, marginBottom: 16 }}>
        The desktop shell is coming next.
      </p>
      <Button onClick={() => void logout()}>Log out</Button>
    </div>
  );
}
