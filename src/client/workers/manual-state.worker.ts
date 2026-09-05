import {allowedManualStateColours, type ManualStateDraft, type ManualStateSize} from "../manual-state";

type Request = {id: number; type: "verifyManualStateColours"; size: ManualStateSize; draft: ManualStateDraft; index: number};

self.addEventListener("message", (event: MessageEvent<Request>) => {
  const request = event.data;
  try {
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
