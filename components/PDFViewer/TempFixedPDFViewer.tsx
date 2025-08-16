import * as FileSystem from 'expo-file-system';
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, StyleSheet, Text, TextInput, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { generateUUID } from '../../utils/uuid';

// Type definitions
export interface PDFViewerRef {
  startTextEditing: () => TextItem;
}

interface TextPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

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

interface FixedPDFViewerProps {
  uri: string;
  onSelectionMade?: (x: number, y: number, width: number, height: number, page: number) => void;
  onTextAdded?: (textItem: TextItem) => void;
  onTextEdited?: (textItem: TextItem) => void;
  onPageChanged?: (currentPage: number, totalPages: number) => void;
}

// Simple HTML template that loads PDF directly
const createHtmlWithPDF = (pdfBase64: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    body, html {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    #pdf-container {
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: flex-start;
    }
    object {
      width: 100%;
      height: 100%;
    }
  </style>
</head>
<body>
  <div id="pdf-container">
    <object data="data:application/pdf;base64,${pdfBase64}" type="application/pdf">
      <p>Your browser does not support PDFs. Please download the PDF to view it.</p>
    </object>
  </div>
  <script>
    document.addEventListener('click', function(e) {
      const x = e.clientX;
      const y = e.clientY;
      const width = 150;
      const height = 50;
      const page = 1; // Basic implementation assumes page 1
      
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'tap',
        x: x,
        y: y,
        width: width,
        height: height,
        page: page
      }));
    });
    
    // Notify React Native that PDF is loaded
    window.addEventListener('load', function() {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'loaded',
        totalPages: 1
      }));
    });
  </script>
</body>
</html>
`;

// Component definition
const FixedPDFViewer = forwardRef<PDFViewerRef, FixedPDFViewerProps>((props, ref) => {
  const { uri, onSelectionMade, onTextAdded, onTextEdited, onPageChanged } = props;
  
  // State variables
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Loading PDF...');
  const [error, setError] = useState<string | null>(null);
  const [html, setHtml] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  // Text overlay state
  const [textPosition, setTextPosition] = useState<TextPosition>({ x: 0, y: 0, width: 150, height: 50 });
  const [showTextOverlay, setShowTextOverlay] = useState(false);
  const [overlayText, setOverlayText] = useState('');
  const [overlayKey, setOverlayKey] = useState('initial');
  
  // Refs
  const webViewRef = useRef<WebView>(null);
  
  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    startTextEditing: () => {
      return startTextEditingHandler();
    }
  }));
  
  // Load the PDF when URI changes
  useEffect(() => {
    loadPDF(uri);
  }, [uri]);
  
  // Convert local file URI to base64 for WebView
  const loadPDF = async (uri: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Handle local file vs remote URL
      if (uri.startsWith('file://') || uri.startsWith('/')) {
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const htmlContent = createHtmlWithPDF(base64);
        setHtml(htmlContent);
      } else {
        // For remote URLs, fetch and convert to base64 first
        const fileInfo = await FileSystem.downloadAsync(
          uri,
          FileSystem.cacheDirectory + 'temp.pdf'
        );
        
        if (fileInfo.status === 200) {
          const base64 = await FileSystem.readAsStringAsync(fileInfo.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const htmlContent = createHtmlWithPDF(base64);
          setHtml(htmlContent);
        } else {
          throw new Error(`Failed to download PDF: status ${fileInfo.status}`);
        }
      }
    } catch (err) {
      console.error('Error loading PDF:', err);
      setError(`Failed to load PDF: ${err instanceof Error ? err.message : String(err)}`);
      setIsLoading(false);
    }
  };
  
  // Handle messages from WebView
  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      if (data.type === 'tap') {
        console.log('Tap detected at:', data);
        setTextPosition({
          x: data.x,
          y: data.y,
          width: data.width,
          height: data.height
        });
        
        // Notify parent component of tap/selection
        if (onSelectionMade) {
          onSelectionMade(data.x, data.y, data.width, data.height, data.page);
        }
      } else if (data.type === 'loaded') {
        console.log('PDF loaded with total pages:', data.totalPages);
        setCurrentPage(1);
        setTotalPages(data.totalPages || 1);
        setIsLoading(false);
        
        // Notify parent of page change
        if (onPageChanged) {
          onPageChanged(1, data.totalPages || 1);
        }
      }
    } catch (err) {
      console.error('Error handling WebView message:', err);
    }
  };
  
  // Text editing implementation with robust handling
  const startTextEditingHandler = useCallback(() => {
    console.log('START TEXT EDITING CALLED - ROBUST IMPLEMENTATION');
    
    // Get current screen dimensions for positioning
    const screenWidth = Dimensions.get('window').width;
    const screenHeight = Dimensions.get('window').height;
    
    // Use the last tap position if available, or center of screen
    const position = textPosition.x !== 0 ? {
      x: textPosition.x,
      y: textPosition.y,
      width: textPosition.width || 150,
      height: textPosition.height || 50
    } : {
      x: screenWidth / 2 - 75,
      y: screenHeight / 3,
      width: 150,
      height: 50
    };
    
    console.log('Using position for text overlay:', position);
    
    // Create a new text item with a unique ID
    const newTextItem: TextItem = {
      id: generateUUID(),
      text: '',
      x: position.x,
      y: position.y,
      width: position.width,
      height: position.height,
      fontSize: 18,
      color: '#000000',
      pageIndex: currentPage - 1,
    };
    
    // Update state in sequence to ensure proper rendering
    setTextPosition(position);
    setOverlayText('');
    setOverlayKey(Date.now().toString());
    setShowTextOverlay(true);
    
    console.log('Text overlay visibility set to true');
    
    // Force update after a brief delay
    setTimeout(() => {
      setShowTextOverlay(true); // Redundant to ensure state is applied
    }, 50);
    
    return newTextItem;
  }, [textPosition, currentPage]);
  
  // Handle text changes in the overlay
  const handleOverlayTextChange = (text: string) => {
    setOverlayText(text);
  };
  
  // Handle text editing completion
  const handleTextEditingComplete = () => {
    console.log('Text editing completed with text:', overlayText);
    
    if (onTextEdited) {
      const editedTextItem: TextItem = {
        id: generateUUID(),
        text: overlayText,
        x: textPosition.x,
        y: textPosition.y,
        width: textPosition.width,
        height: textPosition.height,
        fontSize: 18,
        color: '#000000',
        pageIndex: currentPage - 1,
      };
      
      onTextEdited(editedTextItem);
    }
    
    setShowTextOverlay(false);
  };
  
  return (
    <View style={styles.container}>
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.loadingText}>{loadingMessage}</Text>
        </View>
      )}
      
      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Error loading PDF: {error}</Text>
        </View>
      ) : (
        <View style={styles.pdfWrapper}>
          {/* WebView to render the PDF */}
          <WebView
            ref={webViewRef}
            source={{ html: html }}
            style={styles.webview}
            onMessage={handleMessage}
            originWhitelist={['*']}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            onError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              setError(`WebView error: ${nativeEvent.description || 'Unknown error'}`);
            }}
            onLoadEnd={() => {
              console.log('WebView load ended');
              setTimeout(() => {
                setIsLoading(false);
              }, 500);
            }}
          />
          
          {/* Overlay layer for text input */}
          <View style={styles.overlayLayer}>
            {/* Debug info - can be removed in production */}
            <View style={styles.debugInfo}>
              <Text style={styles.debugText}>
                Tap PDF to add text. TextOverlay visible: {showTextOverlay ? 'Yes' : 'No'}
              </Text>
            </View>
            
            {/* Text input overlay with high visibility */}
            {showTextOverlay && (
              <View 
                key={overlayKey}
                style={[
                  styles.textOverlay,
                  {
                    left: textPosition.x,
                    top: textPosition.y,
                    width: textPosition.width,
                    height: textPosition.height,
                  }
                ]}
              >
                <TextInput
                  autoFocus
                  multiline
                  value={overlayText}
                  onChangeText={handleOverlayTextChange}
                  onBlur={handleTextEditingComplete}
                  style={styles.textInput}
                />
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  pdfWrapper: {
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
    color: '#333',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
    fontSize: 16,
  },
  overlayLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    pointerEvents: 'box-none',
  },
  textOverlay: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderWidth: 3,
    borderColor: '#FF3366',
    zIndex: 9999,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.8,
    shadowRadius: 5,
    transform: [{ scale: 1.05 }],
  },
  textInput: {
    flex: 1,
    padding: 10,
    fontSize: 20,
    color: '#000000',
    fontWeight: '500',
  },
  debugInfo: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 5,
    borderRadius: 5,
    zIndex: 30,
  },
  debugText: {
    color: 'white',
    fontSize: 10,
  }
});

export default FixedPDFViewer;
