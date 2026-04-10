import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAppStore } from '../stores/appStore';

export default function HomeScreen() {
  const router = useRouter();
  const setSourceImage = useAppStore((s) => s.setSourceImage);
  const reset = useAppStore((s) => s.reset);

  const handleCameraScan = async () => {
    reset();
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      // TODO: show alert directing user to Settings
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      setSourceImage(result.assets[0].uri, 'camera');
      router.push('/quad-editor');
    }
  };

  const handleImportImage = async () => {
    reset();
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      setSourceImage(result.assets[0].uri, 'import');
      router.push('/quad-editor');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Chess Scanner</Text>
      <Text style={styles.subtitle}>
        Scan a chess board to get instant analysis
      </Text>

      <Pressable style={styles.button} onPress={handleCameraScan}>
        <Text style={styles.buttonText}>Camera Scan</Text>
        <Text style={styles.buttonHint}>Point camera at a physical board</Text>
      </Pressable>

      <Pressable style={[styles.button, styles.secondaryButton]} onPress={handleImportImage}>
        <Text style={styles.buttonText}>Import Image</Text>
        <Text style={styles.buttonHint}>Screenshot, photo, or book page</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#16213e',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#e0e0e0',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#8892b0',
    marginBottom: 48,
    textAlign: 'center',
  },
  button: {
    width: '100%',
    backgroundColor: '#0f3460',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#e0e0e0',
  },
  buttonHint: {
    fontSize: 13,
    color: '#8892b0',
    marginTop: 4,
  },
});
