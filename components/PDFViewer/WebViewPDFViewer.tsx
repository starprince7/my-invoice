import React, { useState, useRef, useCallback, forwardRef, useImperativeHandle, useEffect } from 'react';
import { StyleSheet, View, Dimensions, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { ThemedView } from '../ThemedView';
import { ThemedText } from '../ThemedText';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { 
  useSharedValue,
  runOnJS, 
} from 'react-native-reanimated';
import SelectionOverlay from './SelectionOverlay';
import TextOverlay from './TextOverlay';
import { generateUUID } from '../../utils/uuid';
import * as FileSystem from 'expo-file-system';

interface WebViewPDFViewerProps {
  uri: string;
  onPageChanged?: (currentPage: number, numberOfPages: number) => void;
  onSelectionMade?: (x: number, y: number, width: number, height: number, page: number) => void;
  onTextAdded?: (textItem: TextItem) => void;
  onTextEdited?: (textItem: TextItem) => void;
}

interface PDFPoint {
  x: number;
  y: number;
  pageIndex: number;
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

// Define the ref interface to expose methods to parent components
export interface PDFViewerRef {
  startTextEditing: () => TextItem | undefined;
}

// Simple HTML template to display PDF using PDF.js
const pdfTemplate = (pdfURI: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0">
  <title>PDF Viewer</title>
  <style>
    body, html {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-color: #f0f0f0;
    }
    #viewerContainer {
      width: 100%;
      height: 100%;
      position: relative;
    }
    #viewer {
      width: 100%;
      height: 100%;
      display: block;
    }
  </style>
</head>
<body>
  <div id="viewerContainer">
    <iframe id="viewer" src="${pdfURI}" allowfullscreen></iframe>
  </div>
  <script>
    // Track current page and send to React Native
    let currentPage = 1;
    window.addEventListener('message', function(event) {
      if (event.data === 'getCurrentPage') {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'currentPage', page: currentPage, totalPages: 1 }));
      }
    });
    
    // Handle touch events and send coordinates to React Native
    document.addEventListener('touchend', function(event) {
      if (event.touches.length === 0) {
        const touch = event.changedTouches[0];
        const x = touch.clientX;
        const y = touch.clientY;
        window.ReactNativeWebView.postMessage(JSON.stringify({ 
          type: 'tap', 
          x: x, 
          y: y,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight
        }));
      }
    });
  </script>
</body>
</html>
`;

const WebViewPDFViewer = forwardRef<PDFViewerRef, WebViewPDFViewerProps>(({ 
  uri, 
  onPageChanged, 
  onSelectionMade, 
  onTextAdded, 
  onTextEdited 
}, ref) => {
  const [numberOfPages, setNumberOfPages] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // PDF selection state
  const [selectionMode, setSelectionMode] = useState<'point' | 'area'>('point');
  const [selectionVisible, setSelectionVisible] = useState<boolean>(false);
  const [selectionStart, setSelectionStart] = useState<PDFPoint | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<PDFPoint | null>(null);

  // Shared values for selection coordinates
  const selectionX = useSharedValue<number>(0);
  const selectionY = useSharedValue<number>(0);
  const selectionWidth = useSharedValue<number>(0);
  const selectionHeight = useSharedValue<number>(0);

  // Text editing state
  const [textEditMode, setTextEditMode] = useState<boolean>(false);
  const [activeTextId, setActiveTextId] = useState<string | null>(null);
  const [textOverlays, setTextOverlays] = useState<TextItem[]>([]);

  // Refs
  const webViewRef = useRef<WebView>(null);
  const viewDimensions = useRef<{ width: number, height: number, x: number, y: number }>({ width: 0, height: 0, x: 0, y: 0 });

  // Function to clear all selection state
  const clearSelection = useCallback(() => {
    setSelectionStart(null);
    setSelectionEnd(null);
    setSelectionVisible(false);
    // Note: We don't clear text edit mode here as it may be needed for text editing
  }, []);

  // Start text editing at the current selection with improved forcing of text mode
  const startTextEditing = useCallback(() => {
    console.log('DEBUG: startTextEditing called, selectionStart:', selectionStart);
    
    // Always ensure the coordinates are set, even without a selection
    if (!selectionStart) {
      console.log('DEBUG: No selection start available - using default position');
      // Create a fallback position in the middle of the screen if no selection
      const { width, height } = Dimensions.get('window');
      selectionX.value = width / 2;
      selectionY.value = height / 3;
      selectionWidth.value = 150;
      selectionHeight.value = 40;
    }
    
    // Force these values to be immediately available
    const xPos = selectionX.value;
    const yPos = selectionY.value;
    const width = selectionWidth.value || 150;
    const height = selectionHeight.value || 40;
    
    console.log('DEBUG: Creating new text item at', { x: xPos, y: yPos, width, height });
    
    // Create a new text overlay at the selection position
    const newTextItem: TextItem = {
      id: generateUUID(),
      text: '',
      x: xPos,
      y: yPos,
      width: width,
      height: height,
      fontSize: 16,
      color: '#000000',
      pageIndex: currentPage - 1, // Use current page if no selection
    };
    
    console.log('DEBUG: New text item created:', newTextItem);
    
    // First activate text edit mode
    setTextEditMode(true);
    console.log('DEBUG: Text edit mode set to true');
    
    // Then set the active text ID in the next event loop
    setTimeout(() => {
      // Add the new text overlay to the list
      setTextOverlays(prev => {
        console.log('DEBUG: Previous text overlays:', prev.length);
        return [...prev, newTextItem];
      });
      
      // Set this as the active text for editing
      setActiveTextId(newTextItem.id);
      console.log('DEBUG: Active text ID set to:', newTextItem.id);
      
      // Notify parent if callback exists
      if (onTextAdded) {
        console.log('DEBUG: Notifying parent with onTextAdded callback');
        onTextAdded(newTextItem);
      }
    }, 0);
    
    return newTextItem;
  }, [selectionStart, selectionX.value, selectionY.value, selectionWidth.value, selectionHeight.value, currentPage, onTextAdded]);
  
  // Handle text input change
  const handleTextChange = useCallback((id: string, text: string) => {
    console.log('DEBUG: Text changed for ID:', id, 'to:', text);
    // Update the text content of the specific text overlay
    setTextOverlays(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, text };
      }
      return item;
    }));
  }, []);
  
  // Finish text editing
  const finishTextEditing = useCallback(() => {
    console.log('DEBUG: Finishing text editing, activeTextId:', activeTextId);
    
    // Find the current text item
    const textItem = textOverlays.find(item => item.id === activeTextId);
    
    if (textItem && onTextEdited) {
      console.log('DEBUG: Notifying parent with edited text:', textItem);
      onTextEdited(textItem);
    }
    
    // Clear editing state
    setTextEditMode(false);
    setActiveTextId(null);
  }, [activeTextId, onTextEdited, textOverlays]);
  
  // Log state changes for debugging
  useEffect(() => {
    console.log('DEBUG: Text edit mode changed to:', textEditMode);
  }, [textEditMode]);
  
  useEffect(() => {
    console.log('DEBUG: Active text ID changed to:', activeTextId);
  }, [activeTextId]);

  // Handle WebView messages
  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      if (data.type === 'currentPage') {
        setCurrentPage(data.page);
        setNumberOfPages(data.totalPages);
        if (onPageChanged) {
          onPageChanged(data.page, data.totalPages);
        }
      }
      else if (data.type === 'tap') {
        // If in point selection mode or starting area selection
        setSelectionMode('point');
        setSelectionStart({
          x: data.x,
          y: data.y,
          pageIndex: currentPage - 1
        });
        
        selectionX.value = data.x;
        selectionY.value = data.y;
        selectionWidth.value = 0;
        selectionHeight.value = 0;
        
        setSelectionVisible(true);
        
        // Notify parent if callback exists
        if (onSelectionMade) {
          onSelectionMade(data.x, data.y, 0, 0, currentPage);
        }
      }
    } catch (e) {
      console.error('Error parsing WebView message:', e);
    }
  }, [currentPage, onPageChanged, onSelectionMade, selectionX, selectionY, selectionWidth, selectionHeight]);

  // Expose the startTextEditing method to parent components
  useImperativeHandle(ref, () => ({
    startTextEditing,
  }), [startTextEditing]);

  // Convert file:// URI to base64 for WebView if needed
  const [webViewSource, setWebViewSource] = useState<{ html: string } | { uri: string }>({ uri });
  
  useEffect(() => {
    const prepareSource = async () => {
      try {
        if (uri.startsWith('file://')) {
          // Create HTML with the PDF source
          const htmlContent = pdfTemplate(uri);
          setWebViewSource({ html: htmlContent });
        } else {
          // External URI can be used directly
          setWebViewSource({ html: pdfTemplate(uri) });
        }
        setIsLoading(false);
      } catch (error: any) {
        console.error('Error preparing PDF source:', error);
        setError(`Error: ${error?.message || 'Failed to load PDF'}`);
        setIsLoading(false);
      }
    };
    
    prepareSource();
  }, [uri]);

  if (error) {
    return (
      <ThemedView style={styles.errorContainer}>
        <ThemedText style={styles.errorText}>{error}</ThemedText>
      </ThemedView>
    );
  }

  // Update current page periodically
  useEffect(() => {
    const interval = setInterval(() => {
      webViewRef.current?.injectJavaScript('window.postMessage("getCurrentPage", "*"); true;');
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <GestureHandlerRootView style={styles.container}>
      <View 
        style={styles.container}
        onLayout={(event) => {
          const { width, height, x, y } = event.nativeEvent.layout;
          viewDimensions.current = { width, height, x, y };
        }}
      >
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2196F3" />
            <ThemedText style={styles.loadingText}>Loading PDF...</ThemedText>
          </View>
        )}
        
        <WebView
          ref={webViewRef}
          source={webViewSource}
          style={styles.webview}
          onLoad={() => setIsLoading(false)}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            setError(`WebView error: ${nativeEvent.description}`);
            setIsLoading(false);
          }}
          originWhitelist={['*']}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          onMessage={handleMessage}
        />
        
        {/* Selection overlay component */}
        {selectionVisible && !textEditMode && (() => {
          // Extract values from shared values to avoid type errors
          const xPos = selectionX.value;
          const yPos = selectionY.value;
          const widthValue = selectionWidth.value;
          const heightValue = selectionHeight.value;
          
          return (
            <SelectionOverlay
              x={xPos}
              y={yPos}
              width={widthValue}
              height={heightValue}
              visible={true}
              isPoint={selectionMode === 'point'}
            />
          );
        })()}
        
        {/* Show text editing overlay when in text edit mode */}
        {/* Use extracted values to prevent accessing .value during render */}
        {textEditMode && (() => {
          // Extract values from shared values to avoid the "reading during render" warning
          const xPos = selectionX.value;
          const yPos = selectionY.value;
          const widthValue = selectionWidth.value || 150;
          const heightValue = selectionHeight.value || 40;
          
          return (
            <TextOverlay
              key={`text-overlay-${activeTextId || 'new'}-${Date.now()}`}
              visible={true}
              x={xPos}
              y={yPos}
              width={widthValue}
              height={heightValue}
              pageIndex={currentPage - 1}
              isPoint={selectionMode === 'point'}
              initialText={activeTextId ? (textOverlays.find(item => item.id === activeTextId)?.text || '') : ''}
              onTextChange={(text: string) => handleTextChange(activeTextId as string, text)}
              onBlur={finishTextEditing}
            />
          );
        })()}
        
        {/* Display existing text overlays for the current page */}
        {textOverlays
          .filter(item => item.pageIndex === currentPage - 1 && item.id !== activeTextId)
          .map(item => (
            <View
              key={`text-display-${item.id}`}
              style={{
                position: 'absolute',
                left: item.x,
                top: item.y,
                width: item.width,
                minHeight: item.height,
                backgroundColor: 'transparent',
              }}
            >
              <ThemedText style={{
                fontSize: item.fontSize,
                color: item.color,
              }}>
                {item.text}
              </ThemedText>
            </View>
          ))
        }
      </View>
    </GestureHandlerRootView>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
  },
  webview: {
    flex: 1,
    width: '100%',
    backgroundColor: '#f0f0f0',
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
  },
  pageIndicator: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
  },
  pageIndicatorText: {
    color: 'white',
    fontSize: 14,
  },
});

export default WebViewPDFViewer;
