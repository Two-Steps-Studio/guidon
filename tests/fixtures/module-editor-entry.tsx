import { createRoot } from "react-dom/client";
import { ModuleBuilder } from "../../src/app/projects/[id]/modules/module-builder";

const initial = JSON.parse(document.getElementById("initial")!.textContent!);
createRoot(document.getElementById("root")!).render(<ModuleBuilder projectId="fixture-project" aiEnabled initialDraft={initial} />);
