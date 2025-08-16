import * as FileSystem from 'expo-file-system';
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { ActivityIndicator, Dimensions, StyleSheet, Text, TextInput, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { generateUUID } from '../../utils/uuid';

// Define the TextItem interface for annotations
export interface TextItem {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  color: string;
  pageIndex: number;
}

// Props for the PDF viewer
interface SimplePDFViewerProps {
  pdfPath: string;
  onSelectionMade?: (x: number, y: number, width: number, height: number, page: number) => void;
  onTextAdded?: (text: TextItem) => void;
  onTextEdited?: (text: TextItem) => void;
  onPageChanged?: (currentPage: number, totalPages: number) => void;
}

// Define the ref interface for external method access
export interface PDFViewerRef {
  startTextEditing: () => TextItem | undefined;
}

// Enhanced HTML template that loads PDF directly with text detection
const createPdfHtml = (pdfUri: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    body, html {
      margin: 0;
      padding: 0;
      height: 100%;
      width: 100%;
      overflow: hidden;
      background-color: #f5f5f5;
    }
    #pdf-container {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    #pdf-viewer {
      width: 100%;
      height: 100%;
      border: none;
    }
    .error-message {
      color: red;
      font-family: sans-serif;
      text-align: center;
      padding: 20px;
    }
    .text-detector {
      position: absolute;
      background: transparent;
      pointer-events: none;
      z-index: -1;
      opacity: 0;
    }
  </style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.min.js"></script>
</head>
<body>
  <div id="pdf-container">
    <object id="pdf-viewer" data="${pdfUri}" type="application/pdf" width="100%" height="100%">
      <p class="error-message">
        Unable to display PDF. Please make sure you have a PDF viewer installed, or try a different browser.
      </p>
    </object>
    <div id="text-detector" class="text-detector"></div>
  </div>
  
  <script>
    // Text detection function to get text under cursor
    function getTextAtPosition(x, y) {
      try {
        // First attempt: try to get element directly at position
        let element = document.elementFromPoint(x, y);
        let textContent = '';
        let fontSize = 16;
        let textWidth = 100;
        let textHeight = 40;
        
        // Check if we have an element with text content
        if (element && element.textContent) {
          textContent = element.textContent.trim();
          
          // Get computed style for font information
          const style = window.getComputedStyle(element);
          fontSize = parseInt(style.fontSize) || 16;
          
          // Calculate text dimensions
          const range = document.createRange();
          range.selectNodeContents(element);
          const rect = range.getBoundingClientRect();
          textWidth = Math.max(rect.width, 100);
          textHeight = Math.max(rect.height, 40);
        }
        
        return {
          textContent,
          fontSize,
          textWidth,
          textHeight
        };
      } catch (e) {
        console.error('Error detecting text:', e);
        return {
          textContent: '',
          fontSize: 16,
          textWidth: 100,
          textHeight: 40
        };
      }
    }

    // Enhanced tap detection with text content extraction
    document.addEventListener('click', function(event) {
      const x = event.clientX;
      const y = event.clientY;
      
      // Get text information at tap position
      const textInfo = getTextAtPosition(x, y);
      
      const message = {
        type: 'tap',
        x: x,
        y: y,
        textContent: textInfo.textContent,
        fontSize: textInfo.fontSize,
        textWidth: textInfo.textWidth,
        textHeight: textInfo.textHeight,
        pageNumber: 1, // Default to page 1
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
      };
      window.ReactNativeWebView.postMessage(JSON.stringify(message));
    });
    
    // Notify when PDF is loaded
    document.getElementById('pdf-viewer').addEventListener('load', function() {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'pdfLoaded',
        totalPages: 1 // Simple implementation, just assume one page for now
      }));
    });
    
    // Notify on errors
    document.getElementById('pdf-viewer').addEventListener('error', function(error) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'error',
        message: 'Failed to load PDF'
      }));
    });
  </script>
</body>
</html>
`;

// Component implementation with forwardRef for imperative handle
const SimplePDFViewer = forwardRef<PDFViewerRef, SimplePDFViewerProps>((
  { pdfPath, onSelectionMade, onTextAdded, onTextEdited, onPageChanged },
  ref
) => {
  // State
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showTextOverlay, setShowTextOverlay] = useState(false);
  const [overlayText, setOverlayText] = useState('');
  const [textPosition, setTextPosition] = useState({ x: 0, y: 0, width: 100, height: 40 });
  const [overlayKey, setOverlayKey] = useState('overlay-0');
  const [detectedFontSize, setDetectedFontSize] = useState<number | null>(null);
  const [originalText, setOriginalText] = useState<string | null>(null);

  // WebView reference
  const webViewRef = React.useRef<WebView>(null);

  // Prepare the HTML content with the PDF URI
  useEffect(() => {
    const loadPDF = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Check if file exists
        const fileInfo = await FileSystem.getInfoAsync(pdfPath);
        if (!fileInfo.exists) {
          throw new Error(`File does not exist: ${pdfPath}`);
        }

        // Read file as base64
        const base64 = await FileSystem.readAsStringAsync(pdfPath, {
          encoding: FileSystem.EncodingType.Base64,
        });

        console.log(`PDF loaded, size: ${base64.length} characters`);
        setPdfBase64(base64);
      } catch (err) {
        console.error('Error loading PDF:', err);
        setError(`Failed to load PDF: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setIsLoading(false);
      }
    };

    loadPDF();
  }, [pdfPath]);

  // Handle messages from WebView
  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log('Received message from WebView:', data);

      if (data.type === 'tap') {
        console.log('Tap event:', data);

        // Calculate estimated dimensions if not provided
        let estimatedWidth = data.width || 150;
        let estimatedHeight = data.height || 40;
        let textContent = '';
        let fontSize = 16;

        // OCR removed - use WebView detection only
        textContent = data.textContent || '';
        fontSize = data.fontSize || 16;

        // Update detected font size and original text
        setDetectedFontSize(fontSize);
        setOriginalText(textContent);
        setOverlayText(textContent);

        // Set the text position for the overlay
        const position = {
          x: data.x,
          y: data.y,
          width: estimatedWidth,
          height: estimatedHeight
        };
        setTextPosition(position);

        // Show the overlay
        setShowTextOverlay(true);

        // Notify parent if callback exists
        if (onSelectionMade) {
          onSelectionMade(data.x, data.y, estimatedWidth, estimatedHeight, data.pageNumber || 1);
        }
      } else if (data.type === 'pdfLoaded' && onPageChanged) {
        // Notify when PDF is loaded
        onPageChanged(1, data.totalPages || 1);
      } else if (data.type === 'error') {
        console.error('PDF error:', data.message);
        setError(data.message || 'Error loading PDF');
      }
    } catch (err) {
      console.error('Error parsing WebView message:', err);
    }
  }, [onSelectionMade, onPageChanged]);

  // Text editing implementation with font size detection using OCR
  const startTextEditing = useCallback(() => {
    console.log('START TEXT EDITING CALLED');
    // Show the text input at the current selection or default position
    const screenWidth = Dimensions.get('window').width;
    const screenHeight = Dimensions.get('window').height;

    // Use the last tap position if available, or center of screen
    const position = textPosition.x !== 0 ? textPosition : {
      x: screenWidth / 2 - 50,
      y: screenHeight / 3,
      width: 100,
      height: 40
    };

    // Get best font size - either from OCR, direct detection, or default
    const bestFontSize = detectedFontSize || 16;

    // Create a new text item with detected or OCR font size
    const newTextItem: TextItem = {
      id: generateUUID(),
      text: originalText || '', // Pre-fill with original text if available
      x: position.x,
      y: position.y,
      width: position.width,
      height: position.height,
      fontSize: bestFontSize,
      color: '#000000',
      pageIndex: currentPage - 1,
    };

    // Update the overlay position
    setTextPosition(position);

    // Force re-render with a new key
    setOverlayKey(Date.now().toString());

    // Show the overlay
    console.log('Showing text overlay at:', position, 'with font size:', bestFontSize);
    setShowTextOverlay(true);

    // Notify parent if callback exists
    if (onTextAdded) {
      onTextAdded(newTextItem);
    }

    return newTextItem;
  }, [textPosition, currentPage, onTextAdded]);

  // Expose methods to parent components
  useImperativeHandle(ref, () => ({
    startTextEditing,
  }), [startTextEditing]);

  // Handle text changes in the overlay
  const handleOverlayTextChange = useCallback((text: string) => {
    setOverlayText(text);
    console.log('Text changed to:', text);
  }, []);

  // Handle when text editing is complete with font size preservation
  const handleTextEditingComplete = useCallback(() => {
    console.log('Text editing completed');
    setShowTextOverlay(false);

    if (onTextEdited && overlayText) {
      const editedItem: TextItem = {
        id: generateUUID(),
        text: overlayText,
        x: textPosition.x,
        y: textPosition.y,
        width: textPosition.width,
        height: textPosition.height,
        fontSize: detectedFontSize || 16, // Use detected font size
        color: '#000000',
        pageIndex: currentPage - 1,
      };
      onTextEdited(editedItem);
      console.log('Edited text with font size:', detectedFontSize, 'replacing:', originalText || 'new text');
    }
  }, [overlayText, textPosition, currentPage, detectedFontSize, originalText, onTextEdited]);

  return (
    <View style={styles.container}>
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0000ff" />
          <Text style={styles.loadingText}>Loading PDF...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : pdfBase64 ? (
        <View style={styles.pdfContainer}>
          <WebView
            ref={webViewRef}
            source={{ html: createPdfHtml(`data:application/pdf;base64,${pdfBase64}`) }}
            style={styles.webview}
            onMessage={handleMessage}
            originWhitelist={['*']}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            allowFileAccess={true}
            allowFileAccessFromFileURLs={true}
            allowUniversalAccessFromFileURLs={true}
            mixedContentMode="always"
            onError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              setError(`WebView error: ${nativeEvent.description || 'Unknown error'}`);
            }}
            onHttpError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              if (nativeEvent.statusCode >= 400) {
                setError(`HTTP error ${nativeEvent.statusCode}`);
              }
            }}
            onLoad={() => {
              console.log('WebView loaded');
              setIsLoading(false);
            }}
          />
          
          {/* Text input overlay - Enhanced with detected font size and styling */}
          {showTextOverlay && (
            <View 
              key={overlayKey}
              style={{
                position: 'absolute',
                left: textPosition.x,
                top: textPosition.y,
                width: textPosition.width,
                height: textPosition.height,
                backgroundColor: 'rgba(255, 255, 255, 0.85)',
                borderWidth: 1,
                borderColor: '#2196F3',
                borderStyle: 'dashed',
                borderRadius: 2,
                zIndex: 100,
                padding: 2,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 2,
                elevation: 3,
              }}
            >
              <TextInput
                autoFocus
                multiline
                value={overlayText}
                onChangeText={handleOverlayTextChange}
                onBlur={handleTextEditingComplete}
                onSubmitEditing={handleTextEditingComplete}
                style={{
                  flex: 1,
                  fontSize: detectedFontSize || 16, // Use detected font size
                  color: '#000000',
                  padding: 4,
                }}
                placeholder={originalText ? 'Edit existing text...' : 'Add text...'}
              />
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  pdfContainer: {
    flex: 1,
    position: 'relative',
  },
  webview: {
    flex: 1,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    zIndex: 10,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#2196F3',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: 'red',
    fontSize: 16,
    textAlign: 'center',
  }
});

export default SimplePDFViewer;
