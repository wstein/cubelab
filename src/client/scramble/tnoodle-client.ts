export type TnoodleEvent = "333";

export type TnoodleConfig = {
  serverUrl: string;
  event: TnoodleEvent;
  batchSize?: number;
  timeoutMs?: number;
};

export type TnoodleHealth = {
  online: boolean;
  latencyMs: number | null;
  message: string;
};

export type TnoodleScramble = {
  source: "tnoodle";
  event: TnoodleEvent;
  scramble: string;
};

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_TIMEOUT_MS = 2_500;
const MAX_RESPONSE_BYTES = 128 * 1024;
const move = /^(?:U|R|F|D|L|B)(?:2|')?$/;

export class TnoodleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TnoodleError";
  }
}

const normalizedConfig = (config: TnoodleConfig): Required<TnoodleConfig> => {
  const serverUrl = config.serverUrl.trim();
  let origin: URL;
  try {
    origin = new URL(serverUrl);
  } catch {
    throw new TnoodleError("TNoodle server URL is invalid.");
  }
  if (origin.protocol !== "http:" && origin.protocol !== "https:") {
    throw new TnoodleError("TNoodle server URL must use HTTP or HTTPS.");
  }
  if (origin.username || origin.password) {
    throw new TnoodleError("TNoodle server URL must not contain credentials.");
  }
  const batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 20) {
    throw new TnoodleError("TNoodle batch size must be between 1 and 20.");
  }
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30_000) {
    throw new TnoodleError("TNoodle timeout must be between 1 and 30,000 ms.");
  }
  return {serverUrl: origin.toString(), event: config.event, batchSize, timeoutMs};
};

export const tnoodleBatchUrl = (config: TnoodleConfig, count = config.batchSize ?? DEFAULT_BATCH_SIZE): string => {
  const normalized = normalizedConfig({...config, batchSize: count});
  const url = new URL("scramble/.txt", normalized.serverUrl);
  url.searchParams.set("e", `${normalized.event}*${normalized.batchSize}`);
  return url.toString();
};

const valid333Scramble = (scramble: string): boolean => {
  const tokens = scramble.trim().split(/\s+/);
  return tokens.length >= 1 && tokens.length <= 100 && tokens.every((token) => move.test(token));
};

export const parseTnoodleBatch = (text: string, expectedCount: number): string[] => {
  if (text.length > MAX_RESPONSE_BYTES) throw new TnoodleError("TNoodle response is unexpectedly large.");
  const scrambles = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (scrambles.length !== expectedCount) {
    throw new TnoodleError(`TNoodle returned ${scrambles.length} scrambles; expected ${expectedCount}.`);
  }
  if (!scrambles.every(valid333Scramble)) {
    throw new TnoodleError("TNoodle response contains an invalid 3×3 scramble.");
  }
  return scrambles;
};

/**
 * A configuration-aware FIFO. It never invents a scramble: callers choose
 * their own offline fallback when TNoodle cannot be reached.
 */
export class TnoodleClient {
  private queue: TnoodleScramble[] = [];
  private configKey = "";

  constructor(private readonly fetcher: FetchLike = fetch) {}

  private key(config: Required<TnoodleConfig>): string {
    return `${config.serverUrl}\u0000${config.event}\u0000${config.batchSize}\u0000${config.timeoutMs}`;
  }

  private async request(config: Required<TnoodleConfig>): Promise<TnoodleScramble[]> {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await this.fetcher(tnoodleBatchUrl(config), {
        signal: controller.signal,
        headers: {Accept: "text/plain"},
      });
      if (!response.ok) throw new TnoodleError(`TNoodle returned HTTP ${response.status}.`);
      const scrambles = parseTnoodleBatch(await response.text(), config.batchSize);
      return scrambles.map((scramble) => ({source: "tnoodle", event: config.event, scramble}));
    } catch (error) {
      if (error instanceof TnoodleError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new TnoodleError(`TNoodle did not respond within ${config.timeoutMs} ms.`);
      }
      throw new TnoodleError("Could not reach the configured TNoodle server.");
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }

  async next(config: TnoodleConfig): Promise<TnoodleScramble> {
    const normalized = normalizedConfig(config);
    const key = this.key(normalized);
    if (key !== this.configKey) {
      this.configKey = key;
      this.queue = [];
    }
    const queued = this.queue.shift();
    if (queued) return queued;
    this.queue = await this.request(normalized);
    const next = this.queue.shift();
    if (!next) throw new TnoodleError("TNoodle returned an empty scramble batch.");
    return next;
  }

  async checkHealth(config: TnoodleConfig): Promise<TnoodleHealth> {
    const startedAt = performance.now();
    try {
      await this.next(config);
      return {
        online: true,
        latencyMs: Math.round(performance.now() - startedAt),
        message: "TNoodle is ready.",
      };
    } catch (error) {
      return {
        online: false,
        latencyMs: null,
        message: error instanceof Error ? error.message : "Could not reach the configured TNoodle server.",
      };
    }
  }
}
