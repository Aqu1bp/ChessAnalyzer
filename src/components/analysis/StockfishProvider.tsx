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
import { Platform, StyleSheet, View } from 'react-native';
import WebView from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';

import { StockfishWebView } from '../../services/engine/stockfishWebView';

// On iOS/Android the asset is bundled by metro; on web we'd need a different path.
// expo-asset handles this for us via require().
const ENGINE_HTML = Platform.select({
  // require() on HTML assets works with react-native-webview's `source` prop
  // when using `originWhitelist={['*']}` and `source={{ uri: ... }}`.
  // For bundled assets we use require and the asset resolver.
  default: require('../../../assets/engine/stockfish-runner.html'),
});

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

  // Key to force remount of WebView on crash recovery
  const [webViewKey, setWebViewKey] = useState(0);

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

  const handleLoadEnd = useCallback(() => {
    // WebView has loaded the HTML. The HTML will self-initialize the WASM engine
    // and send __ENGINE_READY__ when done. We start the init process.
    engine.init().catch((err) => {
      console.error('[StockfishProvider] Engine init failed:', err);
    });
  }, [engine]);

  return (
    <StockfishContext.Provider value={engine}>
      <View style={styles.hidden}>
        <WebView
          key={webViewKey}
          ref={webViewRef}
          source={ENGINE_HTML}
          originWhitelist={['*']}
          javaScriptEnabled
          onMessage={handleMessage}
          onError={handleError}
          onLoadEnd={handleLoadEnd}
          style={styles.webView}
          // Allow loading local files
          allowFileAccess
          allowUniversalAccessFromFileURLs
          // Don't show any UI
          scrollEnabled={false}
          bounces={false}
        />
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
