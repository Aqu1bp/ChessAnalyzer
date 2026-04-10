import { View, Text, StyleSheet } from 'react-native';

export default function QuadEditorScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Quad Editor — TODO</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#16213e' },
  text: { color: '#e0e0e0', fontSize: 18 },
});
