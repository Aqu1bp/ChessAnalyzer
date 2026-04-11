/**
 * StockfishProvider — renders a hidden WebView running the Stockfish WASM engine
 * and provides the engine service to the app via React context.
 *
 * Usage:
 *   <StockfishProvider>
 *     <App />
 *   </StockfishProvider>
 *
 *   const engine = useStockfish();
 *   engine.analyze(fen, depth);
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { Asset } from 'expo-asset';
import WebView from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';

import { StockfishWebView } from '../../services/engine/stockfishWebView';

const ENGINE_BUNDLE = require('../../../assets/engine/stockfish-18-lite-single.bundle');
const ENGINE_WASM = require('../../../assets/engine/stockfish-18-lite-single.wasm');

function buildEngineRunnerHtml(bundleUri: string, wasmUri: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Stockfish Runner</title>
</head>
<body>
<script>
  var ENGINE_BUNDLE_URI = ${JSON.stringify(bundleUri)};
  var ENGINE_WASM_URI = ${JSON.stringify(wasmUri)};
  var engine = null;
  var ready = false;
  var queue = [];

  function sendToRN(msg) {
    try {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(msg);
      }
    } catch (e) {}
  }

  function handleCommand(cmd) {
    if (typeof cmd !== 'string') return;
    if (!ready) {
      queue.push(cmd);
      return;
    }
    if (engine && engine.processCommand) {
      engine.processCommand(cmd);
    }
  }

  function initEngine() {
    sendToRN('__ENGINE_LOADING__');

    var script = document.createElement('script');
    script.src = ENGINE_BUNDLE_URI;
    script.onload = function () {
      var factory = script._exports;
      if (!factory) {
        sendToRN('__ENGINE_ERROR__:Could not find Stockfish factory');
        return;
      }

      var config = {
        locateFile: function (file) {
          if (file.indexOf('.wasm') !== -1) {
            return ENGINE_WASM_URI;
          }
          return file;
        },
        listener: function (line) {
          sendToRN(line);
        }
      };

      factory(config).then(function (sf) {
        engine = sf;
        ready = true;
        sendToRN('__ENGINE_READY__');
        while (queue.length > 0) {
          engine.processCommand(queue.shift());
        }
      }).catch(function (err) {
        sendToRN('__ENGINE_ERROR__:' + (err.message || String(err)));
      });
    };
    script.onerror = function () {
      sendToRN('__ENGINE_ERROR__:Failed to load Stockfish JS');
    };
    document.body.appendChild(script);
  }

  document.addEventListener('message', function (event) {
    handleCommand(event.data);
  });

  window.addEventListener('message', function (event) {
    handleCommand(event.data);
  });

  initEngine();
</script>
</body>
</html>`;
}

const StockfishContext = createContext<StockfishWebView | null>(null);

/**
 * Hook to access the Stockfish engine service.
 * Must be used within a StockfishProvider.
 */
export function useStockfish(): StockfishWebView {
  const ctx = useContext(StockfishContext);
  if (!ctx) {
    throw new Error('useStockfish must be used within a StockfishProvider');
  }
  return ctx;
}

interface StockfishProviderProps {
  children: React.ReactNode;
}

export function StockfishProvider({ children }: StockfishProviderProps) {
  const webViewRef = useRef<WebView | null>(null);
  const [engine] = useState(() => new StockfishWebView(webViewRef));
  const [engineHtml, setEngineHtml] = useState<string | null>(null);

  // Key to force remount of WebView on crash recovery
  const [webViewKey, setWebViewKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadAssets = async () => {
      try {
        const [bundleAsset, wasmAsset] = await Asset.loadAsync([ENGINE_BUNDLE, ENGINE_WASM]);
        if (cancelled) {
          return;
        }
        const bundleUri = bundleAsset.localUri ?? bundleAsset.uri;
        const wasmUri = wasmAsset.localUri ?? wasmAsset.uri;
        setEngineHtml(buildEngineRunnerHtml(bundleUri, wasmUri));
      } catch (error) {
        console.error('[StockfishProvider] Failed to load Stockfish assets:', error);
        engine.handleCrash();
      }
    };

    void loadAssets();

    return () => {
      cancelled = true;
    };
  }, [engine]);

  useEffect(() => {
    // Check for crash-recovery restart requests
    const interval = setInterval(() => {
      if (engine.restartRequested) {
        engine.clearRestartRequest();
        setWebViewKey((k) => k + 1);
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      engine.destroy();
    };
  }, [engine]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const data = event.nativeEvent.data;
      engine.handleMessage(data);
    },
    [engine],
  );

  const handleError = useCallback(() => {
    engine.handleCrash();
  }, [engine]);

  const handleLoad = useCallback(() => {
    // Only start init after the HTML runner has loaded successfully.
    // onLoadEnd fires for both success and failure, which can turn a bad asset
    // load into a misleading init timeout.
    engine.init().catch((err) => {
      console.error('[StockfishProvider] Engine init failed:', err);
    });
  }, [engine]);

  return (
    <StockfishContext.Provider value={engine}>
      <View style={styles.hidden}>
        {engineHtml && (
          <WebView
            key={webViewKey}
            ref={webViewRef}
            source={{ html: engineHtml, baseUrl: 'file:///' }}
            originWhitelist={['*']}
            javaScriptEnabled
            onMessage={handleMessage}
            onLoad={handleLoad}
            onError={handleError}
            onHttpError={handleError}
            onContentProcessDidTerminate={handleError}
            onRenderProcessGone={handleError}
            style={styles.webView}
            // Allow loading local files
            allowFileAccess
            allowFileAccessFromFileURLs
            allowUniversalAccessFromFileURLs
            // Don't show any UI
            scrollEnabled={false}
            bounces={false}
          />
        )}
      </View>
      {children}
    </StockfishContext.Provider>
  );
}

const styles = StyleSheet.create({
  hidden: {
    height: 0,
    width: 0,
    overflow: 'hidden',
    position: 'absolute',
    top: -1000,
    left: -1000,
  },
  webView: {
    height: 0,
    width: 0,
    opacity: 0,
  },
});
