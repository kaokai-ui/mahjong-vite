export type AppBridgeStore<Snapshot, Actions, Patch> = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => Snapshot;
  getActions: () => Actions;
  updateSnapshot: (patch?: Patch) => void;
  setActions: (nextActions: Partial<Actions>) => void;
};

export function createAppBridgeStore<Snapshot, Actions, Patch>({
  initialSnapshot,
  initialActions,
  mergeSnapshot,
}: {
  initialSnapshot: Snapshot;
  initialActions: Actions;
  mergeSnapshot: (snapshot: Snapshot, patch: Patch) => Snapshot;
}): AppBridgeStore<Snapshot, Actions, Patch> {
  const listeners = new Set<() => void>();

  let snapshot = initialSnapshot;
  let actions = initialActions;

  const publish = (nextSnapshot: Snapshot) => {
    snapshot = nextSnapshot;
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return snapshot;
    },
    getActions() {
      return actions;
    },
    updateSnapshot(patch = {} as Patch) {
      publish(mergeSnapshot(snapshot, patch));
    },
    setActions(nextActions) {
      actions = {
        ...actions,
        ...nextActions,
      };
      publish({
        ...snapshot,
      });
    },
  };
}
