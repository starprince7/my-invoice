import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { templates } from '../../doc-templates/manifest';

export default function TemplatesScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={templates}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/editor/[id]', params: { id: item.id } })}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          >
            <View style={styles.cardIconWrap}>
              <Ionicons name="document-text-outline" size={28} color="#2196F3" />
            </View>
            <Text numberOfLines={2} style={styles.cardTitle}>{item.title}</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f7f7',
  },
  listContent: {
    padding: 12,
  },
  row: {
    gap: 12,
  },
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    minHeight: 120,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardPressed: {
    opacity: 0.8,
  },
  cardIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#E8F2FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  cardTitle: {
    textAlign: 'center',
    color: '#333',
    fontSize: 14,
    fontWeight: '600',
  },
});
