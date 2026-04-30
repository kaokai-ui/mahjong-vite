import { bootstrapLegacyApp } from "./app-bootstrap-runtime";

const elements = {
  gamePanel: document.querySelector("#game-panel"),
};

bootstrapLegacyApp(elements);
