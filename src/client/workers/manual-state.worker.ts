import {allowedManualStateColours, type ManualStateDraft, type ManualStateSize} from "../manual-state";

type SingleRequest = {
  id: number;
  type: "verifyManualStateColours";
  size: ManualStateSize;
  draft: ManualStateDraft;
  index: number;
};

type BatchRequest = {
  id: number;
  type: "verifyManualStateBatch";
  size: ManualStateSize;
  draft: ManualStateDraft;
  indices: number[];
};

type Request = SingleRequest | BatchRequest;

self.addEventListener("message", (event: MessageEvent<Request>) => {
  const request = event.data;
  try {
    if (request.type === "verifyManualStateBatch") {
      const draft = [...request.draft];
      for (const index of request.indices) {
        if (draft[index] !== null) continue;
        const solution = allowedManualStateColours(request.size, draft, index);
        if (solution.length === 1) {
          draft[index] = solution[0];
        }
        self.postMessage({
          id: request.id,
          ok: true,
          type: "progress",
          index,
          solution,
        });
      }
      self.postMessage({
        id: request.id,
        ok: true,
        type: "done",
      });
      return;
    }
    self.postMessage({
      id: request.id,
      ok: true,
      solution: allowedManualStateColours(request.size, request.draft, request.index),
    });
  } catch (error) {
    self.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : "Manual-state verification failed.",
    });
  }
});
