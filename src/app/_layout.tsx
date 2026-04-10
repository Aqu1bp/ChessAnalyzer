import { Stack } from 'expo-router';
import { StockfishProvider } from '../components/analysis/StockfishProvider';

export default function RootLayout() {
  return (
    <StockfishProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#1a1a2e' },
          headerTintColor: '#e0e0e0',
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: '#16213e' },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Chess Scanner' }} />
        <Stack.Screen name="quad-editor" options={{ title: 'Adjust Board' }} />
        <Stack.Screen name="confirm" options={{ title: 'Confirm Position' }} />
        <Stack.Screen name="analysis" options={{ title: 'Analysis' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </StockfishProvider>
  );
}
