declare module "@network-controller-entry" {
  import type { ControllerLike } from "./runtime-shell-types";

  export const NetworkController: new (...args: unknown[]) => ControllerLike;
}
