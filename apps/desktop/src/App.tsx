import { useSession } from "./hooks/useSession";
import { SessionBar } from "./components/SessionBar";
import { ChatPanel } from "./components/ChatPanel";
import { ActionApproval } from "./components/ActionApproval";
import { ChangeLog } from "./components/ChangeLog";

function App() {
  // Single hook instance that auto-creates session on mount
  const session = useSession();

  return (
    <div className="flex flex-col h-screen bg-bg-primary text-text-primary">
      <SessionBar session={session} />
      <ChatPanel />
      <ActionApproval />
      <ChangeLog />
    </div>
  );
}

export default App;
