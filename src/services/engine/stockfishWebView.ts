/**
 * Stockfish WebView bridge service.
 *
 * Manages a hidden WebView running stockfish.js WASM and provides a
 * clean async interface for UCI communication.
 */

import type { RefObject } from 'react';
import type WebView from 'react-native-webview';

import { parseUciLine, type UciParseResult } from './uciParser';
import type { EngineStatus } from '../../types/analysis';

/** Callback for every UCI line the engine emits. */
export type EngineLineCallback = (result: UciParseResult) => void;

/** Callback for engine lifecycle status changes. */
export type EngineStatusCallback = (status: EngineStatus) => void;

export class StockfishWebView {
  private webViewRef: RefObject<WebView | null>;
  private lineCallback: EngineLineCallback | null = null;
  private statusCallback: EngineStatusCallback | null = null;

  private _status: EngineStatus = 'unloaded';
  private _uciReady = false; // true after full UCI handshake
  private commandQueue: string[] = [];

  // Resolvers for async handshake steps
  private uciokResolver: (() => void) | null = null;
  private readyokResolver: (() => void) | null = null;

  // Crash recovery
  private _restartRequested = false;
  private _initPromise: Promise<void> | null = null;

  // Resolver for init() to wait until handshake completes
  private _initResolver: (() => void) | null = null;
  private _initRejecter: ((err: Error) => void) | null = null;
  private _initTimeout: ReturnType<typeof setTimeout> | null = null;

  // Track if WASM engine signaled ready (may arrive before or after init())
  private _engineReady = false;

  constructor(webViewRef: RefObject<WebView | null>) {
    this.webViewRef = webViewRef;
  }

  /** Current engine status. */
  get status(): EngineStatus {
    return this._status;
  }

  /** Whether the engine has completed UCI handshake and is ready. */
  get isReady(): boolean {
    return this._uciReady;
  }

  /** Register a callback for every parsed UCI line. */
  onLine(callback: EngineLineCallback): void {
    this.lineCallback = callback;
  }

  /** Register a callback for status changes. */
  onStatusChange(callback: EngineStatusCallback): void {
    this.statusCallback = callback;
  }

  /**
   * Handle a message from the WebView.
   * This should be called from the WebView's onMessage prop.
   */
  handleMessage(data: string): void {
    // Internal lifecycle messages from our HTML runner
    if (data === '__ENGINE_LOADING__') {
      this.setStatus('loading');
      return;
    }
    if (data === '__ENGINE_READY__') {
      // WebView + WASM loaded, but UCI handshake not yet done.
      this._engineReady = true;
      // Only start handshake if init() has been called (resolver exists)
      if (this._initResolver) {
        this.performUciHandshake();
      }
      return;
    }
    if (data.startsWith('__ENGINE_ERROR__:')) {
      const errorMsg = data.slice('__ENGINE_ERROR__:'.length);
      console.error('[StockfishWebView] Engine error:', errorMsg);
      this.setStatus('error');
      return;
    }

    // Regular UCI output line
    const result = parseUciLine(data);

    // Handle handshake responses
    if (result.type === 'uciok' && this.uciokResolver) {
      this.uciokResolver();
      this.uciokResolver = null;
    }
    if (result.type === 'readyok' && this.readyokResolver) {
      this.readyokResolver();
      this.readyokResolver = null;
    }

    // Forward to listener
    this.lineCallback?.(result);
  }

  /**
   * Initialize the engine. The WebView must already be mounted and loaded.
   * Performs the full UCI handshake:
   *   uci -> wait uciok
   *   setoption commands
   *   isready -> wait readyok
   */
  async init(): Promise<void> {
    if (this._initPromise) {
      return this._initPromise;
    }
    this._initPromise = this._doInit();
    try {
      await this._initPromise;
    } finally {
      this._initPromise = null;
    }
  }

  private _doInit(): Promise<void> {
    this.setStatus('loading');

    return new Promise<void>((resolve, reject) => {
      this._initResolver = resolve;
      this._initRejecter = reject;

      // Timeout if engine never becomes ready
      this._initTimeout = setTimeout(() => {
        if (this._initResolver) {
          this._initResolver = null;
          this._initRejecter = null;
          this._initTimeout = null;
          reject(new Error('Engine init timed out after 30s'));
        }
      }, 30000);

      // If __ENGINE_READY__ already arrived before init(), start handshake now
      if (this._engineReady) {
        this.performUciHandshake();
      }
    });
  }

  /**
   * Perform the UCI handshake after the WASM engine signals ready.
   */
  private async performUciHandshake(): Promise<void> {
    try {
      // Step 1: Send "uci" and wait for "uciok"
      await this.waitForResponse('uci', 'uciok', 10000);

      // Step 2: Configure engine options
      this.postCommand('setoption name MultiPV value 3');
      this.postCommand('setoption name Threads value 1');
      this.postCommand('setoption name Hash value 16');
      this.postCommand('setoption name UCI_AnalyseMode value true');
      this.postCommand('setoption name UCI_ShowWDL value true');

      // Step 3: Send "isready" and wait for "readyok"
      await this.waitForResponse('isready', 'readyok', 10000);

      // Handshake complete
      this._uciReady = true;
      this.setStatus('ready');

      // Clear init timeout and resolve promise
      if (this._initTimeout) {
        clearTimeout(this._initTimeout);
        this._initTimeout = null;
      }
      this._initResolver?.();
      this._initResolver = null;
      this._initRejecter = null;

      // Flush any queued commands
      this.flushQueue();
    } catch (err) {
      console.error('[StockfishWebView] UCI handshake failed:', err);
      this.setStatus('error');

      // Reject the init() promise
      this._initRejecter?.(err instanceof Error ? err : new Error(String(err)));
      this._initResolver = null;
      this._initRejecter = null;
    }
  }

  /**
   * Send a UCI command to the engine.
   * If engine is not ready yet, the command is queued.
   */
  sendCommand(cmd: string): void {
    if (!this._uciReady) {
      this.commandQueue.push(cmd);
      return;
    }
    this.postCommand(cmd);
  }

  /**
   * Send a "go" command to analyze the given FEN at the given depth.
   * Caller must send "position" first or use the analysisManager.
   */
  analyze(fen: string, depth: number): void {
    this.sendCommand(`position fen ${fen}`);
    this.sendCommand(`go depth ${depth}`);
  }

  /** Send "stop" to the engine. */
  stop(): void {
    // Stop bypasses the queue — send immediately if we can
    if (this._uciReady) {
      this.postCommand('stop');
    }
  }

  /** Clean up. */
  destroy(): void {
    this._uciReady = false;
    this._engineReady = false;
    this.commandQueue = [];
    this.lineCallback = null;
    this.statusCallback = null;
    this.uciokResolver = null;
    this.readyokResolver = null;
    // Reject pending init promise
    if (this._initRejecter) {
      this._initRejecter(new Error('Engine destroyed'));
    }
    this._initResolver = null;
    this._initRejecter = null;
    this._initPromise = null;
    if (this._initTimeout) {
      clearTimeout(this._initTimeout);
      this._initTimeout = null;
    }
    this.setStatus('unloaded');
  }

  /**
   * Called when the WebView encounters an error or crashes.
   * Attempts to restart.
   */
  handleCrash(): void {
    console.warn('[StockfishWebView] WebView crashed, scheduling restart');
    this._uciReady = false;
    this.setStatus('error');
    this._restartRequested = true;
  }

  /** Whether a restart has been requested due to a crash. */
  get restartRequested(): boolean {
    return this._restartRequested;
  }

  /** Mark restart as handled (the provider will reload the WebView). */
  clearRestartRequest(): void {
    this._restartRequested = false;
  }

  // --- Private helpers ---

  private setStatus(status: EngineStatus): void {
    this._status = status;
    this.statusCallback?.(status);
  }

  /**
   * Post a raw command string to the WebView.
   * Uses injectJavaScript instead of postMessage (which is deprecated in react-native-webview).
   */
  private postCommand(cmd: string): void {
    const webView = this.webViewRef.current;
    if (!webView) {
      console.warn('[StockfishWebView] No WebView ref, cannot send command:', cmd);
      return;
    }
    const escaped = JSON.stringify(cmd);
    webView.injectJavaScript(`handleCommand(${escaped}); true;`);
  }

  /**
   * Send a command and wait for a specific response type.
   */
  private waitForResponse(
    command: string,
    responseType: 'uciok' | 'readyok',
    timeoutMs: number,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (responseType === 'uciok') {
          this.uciokResolver = null;
        } else {
          this.readyokResolver = null;
        }
        reject(new Error(`Timeout waiting for ${responseType}`));
      }, timeoutMs);

      const resolver = () => {
        clearTimeout(timer);
        resolve();
      };

      if (responseType === 'uciok') {
        this.uciokResolver = resolver;
      } else {
        this.readyokResolver = resolver;
      }

      this.postCommand(command);
    });
  }

  private flushQueue(): void {
    while (this.commandQueue.length > 0) {
      const cmd = this.commandQueue.shift()!;
      this.postCommand(cmd);
    }
  }
}
