import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// globals: false → Testing Library ne démonte pas automatiquement les rendus.
afterEach(() => {
  cleanup();
});
