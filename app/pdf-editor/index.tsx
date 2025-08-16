import { Ionicons } from "@expo/vector-icons";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system";
import { Stack } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import type { TextItem } from "../../components/PDFViewer/SimplePDFViewer";
import SimplePDFViewer, {
  PDFViewerRef,
} from "../../components/PDFViewer/SimplePDFViewer";

// PDF files
const SAMPLE_PDF_URL =
  "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";
const SAMPLE_PDF_NAME = "sample.pdf";
// Invoice PDF in assets directory

export default function PDFEditorScreen() {
  // PDF state
  const [pdfUri, setPdfUri] = useState<string | null>(null);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(0);

  // Editor state
  const [textItems, setTextItems] = useState<TextItem[]>([]);
  const [showPageInfo, setShowPageInfo] = useState(false);

  // Refs
  const pdfViewerRef = useRef<PDFViewerRef>(null);

  useEffect(() => {
    loadInvoicePdf();
  }, []);


  const loadSamplePdf = async () => {
    try {
      setLoading(true);

      // Download the sample PDF to cache directory
      const downloadResult = await FileSystem.downloadAsync(
        SAMPLE_PDF_URL,
        FileSystem.cacheDirectory + SAMPLE_PDF_NAME
      );

      if (downloadResult.status === 200) {
        console.log("Sample PDF downloaded to:", downloadResult.uri);
        setPdfUri(downloadResult.uri);
      } else {
        console.error(
          "Failed to download sample PDF, status:",
          downloadResult.status
        );
        Alert.alert("Error", "Failed to download sample PDF");
      }
    } catch (error) {
      console.error("Error downloading sample PDF:", error);
      Alert.alert("Error", "Failed to download sample PDF");
    } finally {
      setLoading(false);
    }
  };

  const loadInvoicePdf = async () => {
    try {
      setLoading(true);

      // Load the invoice PDF from assets
      console.log("Loading invoice PDF from assets...");
      const asset = Asset.fromModule(
        require("../../assets/pdf/PROFORMA-INVOICE-AUG-08-25.pdf")
      );
      await asset.downloadAsync();

      if (asset.localUri) {
        console.log("Invoice PDF loaded from assets:", asset.localUri);
        setPdfUri(asset.localUri);

        // Read file as base64 (kept for future features if needed)
        const base64 = await FileSystem.readAsStringAsync(asset.localUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        setPdfBase64(base64);
      } else {
        console.error("Failed to load invoice PDF from assets");
        Alert.alert("Error", "Failed to load invoice PDF from assets");
      }
    } catch (error) {
      console.error("Error loading invoice PDF from assets:", error);
      Alert.alert("Error", "Failed to load invoice PDF from assets");
    } finally {
      setLoading(false);
    }
  };

  const handlePageChanged = (page: number, numberOfPages: number) => {
    console.log(`Page changed: ${page} / ${numberOfPages}`);
    setCurrentPage(page);
    setTotalPages(numberOfPages);
  };

  const handleTextAdded = (item: TextItem) => {
    console.log("Text item added:", item);
    setTextItems((prev) => [...prev, item]);
  };

  const handleTextEdited = (item: TextItem) => {
    console.log("Text item edited:", item);
    setTextItems((prev) => prev.map((t) => (t.id === item.id ? item : t)));
  };

  const togglePageInfo = () => {
    setShowPageInfo((prev) => !prev);
  };

  // OCR processing removed in overhaul

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          title: "PDF Editor",
          headerShown: false,
        }}
      />

      <View style={styles.container}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2196F3" />
            <Text style={styles.loadingText}>Loading PDF...</Text>
          </View>
        ) : !pdfUri ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>No PDF loaded</Text>
            <TouchableOpacity
              style={styles.button}
              onPress={loadSamplePdf}
            >
              <Text style={styles.buttonText}>Load Sample PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.invoiceButton]}
              onPress={loadInvoicePdf}
            >
              <Text style={styles.buttonText}>Load Invoice</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* PDF Viewer */}
            <SimplePDFViewer
              ref={pdfViewerRef}
              pdfPath={pdfUri}
              onPageChanged={handlePageChanged}
              onTextAdded={handleTextAdded}
              onTextEdited={handleTextEdited}
            />

            {/* Page Information */}
            {showPageInfo && (
              <View style={styles.pageInfoContainer}>
                <Text style={styles.pageInfoText}>
                  Page {currentPage} of {totalPages}
                </Text>
                <TouchableOpacity
                  onPress={() => setShowPageInfo(false)}
                  style={styles.pageInfoButton}
                >
                  <Ionicons name="close-circle" size={16} color="#666" />
                </TouchableOpacity>
              </View>
            )}

            {/* Extracted data UI removed in overhaul */}
            
            {/* Bottom toolbar */}
            <View style={styles.toolbarContainer}>
              <TouchableOpacity
                style={styles.toolbarButton}
                onPress={togglePageInfo}
              >
                <Ionicons
                  name="information-circle-outline"
                  size={24}
                  color="#333"
                />
                <Text style={styles.buttonText}>Page Info</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: "#666",
  },
  button: {
    backgroundColor: "#2196F3",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 5,
    marginTop: 20,
  },
  invoiceButton: {
    backgroundColor: "#FF6B00",
    marginTop: 10,
  },
  buttonText: {
    color: "#333",
    fontSize: 14,
    marginTop: 4,
  },
  activeButtonText: {
    color: "#2196F3",
    fontWeight: "bold",
  },
  toolbarContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    backgroundColor: "#ffffff",
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderTopWidth: 1,
    borderColor: "#e0e0e0",
    zIndex: 10,
  },
  toolbarButton: {
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
  },
  pageInfoContainer: {
    position: "absolute",
    top: 20,
    right: 20,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 20,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  pageInfoText: {
    fontSize: 14,
    color: "#333",
    marginRight: 8,
  },
  pageInfoButton: {
    padding: 2,
  },
  extractedDataContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 60,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderColor: '#e0e0e0',
    maxHeight: '60%',
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  extractedDataHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderColor: '#e0e0e0',
  },
  extractedDataTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  extractedDataContent: {
    padding: 15,
    maxHeight: 350,
  },
  dataRow: {
    flexDirection: 'row',
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  dataLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#555',
    marginRight: 5,
    minWidth: 80,
  },
  dataValue: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  dataSection: {
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2196F3',
    marginBottom: 5,
  },
  itemRow: {
    flexDirection: 'row',
    marginBottom: 10,
    alignItems: 'flex-start',
  },
  itemNumber: {
    width: 20,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#555',
  },
  itemDetails: {
    flex: 1,
  },
  itemDescription: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 3,
  },
  itemMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  itemMetaText: {
    fontSize: 12,
    color: '#777',
    marginRight: 10,
    marginBottom: 2,
  },
  totalRow: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: '#eee',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2196F3',
  },
});
