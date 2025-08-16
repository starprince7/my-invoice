import React from 'react';
import { TouchableOpacity, StyleSheet, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { ThemedText } from '../ThemedText';
import { Ionicons } from '@expo/vector-icons';

interface PDFFilePickerProps {
  onFilePicked: (uri: string, name: string) => void;
  style?: object;
}

const PDFFilePicker: React.FC<PDFFilePickerProps> = ({ onFilePicked, style }) => {
  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        console.log('Document picking was canceled');
        return;
      }

      // Handle the selected file
      const fileUri = result.assets[0].uri;
      const fileName = result.assets[0].name || 'Unnamed PDF';
      console.log('URI:', fileUri);
      onFilePicked(fileUri, fileName);
    } catch (error) {
      console.error('Error picking document:', error);
    }
  };

  return (
    <View style={[styles.container, style]}>
      <TouchableOpacity style={styles.button} onPress={pickDocument}>
        <Ionicons name="document-outline" size={24} color="#fff" />
        <ThemedText style={styles.buttonText}>Select PDF</ThemedText>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    marginLeft: 10,
    fontWeight: '500',
  },
});

export default PDFFilePicker;
