import React, { useState, useRef, useCallback, forwardRef, useImperativeHandle, useEffect } from 'react';
import { StyleSheet, View, Dimensions, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { ThemedView } from '../ThemedView';
import { ThemedText } from '../ThemedText';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { 
  useSharedValue
} from 'react-native-reanimated';
import SelectionOverlay from './SelectionOverlay';
import TextOverlay from './TextOverlay';
import { generateUUID } from '../../utils/uuid';
import * as FileSystem from 'expo-file-system';

interface PDFWebViewerProps {
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

// Advanced HTML template to display PDF using PDF.js
const pdfTemplate = (pdfURI: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0">
  <title>PDF Viewer</title>
  <script src="https://unpkg.com/pdfjs-dist@2.16.105/build/pdf.min.js"></script>
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
      overflow: auto;
      -webkit-overflow-scrolling: touch;
    }
    #viewer {
      position: absolute;
      left: 0;
      top: 0;
      right: 0;
      padding: 10px;
    }
    .page {
      position: relative;
      margin: 0 auto 10px auto;
      border: 1px solid #ddd;
      background-color: white;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    }
    .page > canvas {
      display: block;
      margin: 0 auto;
    }
    .loading {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-family: sans-serif;
      font-size: 16px;
      color: #333;
    }
    .controls {
      position: fixed;
      bottom: 10px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.5);
      padding: 5px 15px;
      border-radius: 20px;
      color: white;
      font-family: sans-serif;
      display: flex;
      align-items: center;
    }
    .controls button {
      margin: 0 5px;
      padding: 5px 10px;
      border: none;
      border-radius: 3px;
      background: #4285F4;
      color: white;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div id="viewerContainer">
    <div id="viewer">
      <div class="loading">Loading PDF...</div>
    </div>
  </div>
  <div class="controls">
    <button id="prev">◄</button>
    <span id="pageInfo">Page 1 of ?</span>
    <button id="next">►</button>
  </div>
  
  <script>
    // Configure PDF.js worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@2.16.105/build/pdf.worker.min.js';
    
    // Variables
    let pdfDoc = null;
    let pageNum = 1;
    let pageRendering = false;
    let pageNumPending = null;
    const scale = 1.0;
    const viewer = document.getElementById('viewer');
    
    // Initialize PDF viewer
    async function loadPDF() {
      try {
        // Load the PDF
        const loadingTask = pdfjsLib.getDocument('${pdfURI}');
        pdfDoc = await loadingTask.promise;
        document.getElementById('pageInfo').textContent = 'Page 1 of ' + pdfDoc.numPages;
        
        // Remove loading indicator
        const loadingIndicator = document.querySelector('.loading');
        if (loadingIndicator) {
          loadingIndicator.remove();
        }
        
        // Notify React Native that PDF is loaded
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'pdfLoaded', 
          totalPages: pdfDoc.numPages
        }));
        
        // Initial render
        renderPage(pageNum);
      } catch (error) {
        console.error('Error loading PDF:', error);
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'error', 
          message: error.message || 'Failed to load PDF'
        }));
      }
    }
    
    // Render a specific page
    async function renderPage(num) {
      pageRendering = true;
      
      try {
        // Get the page
        const page = await pdfDoc.getPage(num);
        const viewport = page.getViewport({ scale });
        
        // Create canvas for this page
        const pageDiv = document.createElement('div');
        pageDiv.className = 'page';
        pageDiv.dataset.pageNumber = num;
        pageDiv.style.width = viewport.width + 'px';
        pageDiv.style.height = viewport.height + 'px';
        
        const canvas = document.createElement('canvas');
        pageDiv.appendChild(canvas);
        viewer.appendChild(pageDiv);
        
        // Prepare canvas using PDF page dimensions
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        // Render PDF page into canvas context
        const renderContext = {
          canvasContext: context,
          viewport: viewport
        };
        
        await page.render(renderContext).promise;
        pageRendering = false;
        
        // Update page counter
        document.getElementById('pageInfo').textContent = 'Page ' + num + ' of ' + pdfDoc.numPages;
        
        // Notify React Native of page change
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'currentPage', 
          page: num,
          totalPages: pdfDoc.numPages
        }));
        
        if (pageNumPending !== null) {
          renderPage(pageNumPending);
          pageNumPending = null;
        }
      } catch (error) {
        console.error('Error rendering page:', error);
        pageRendering = false;
      }
    }
    
    // Queue page rendering if another page is currently being rendered
    function queueRenderPage(num) {
      if (pageRendering) {
        pageNumPending = num;
      } else {
        renderPage(num);
      }
    }
    
    // Go to previous page
    document.getElementById('prev').addEventListener('click', function() {
      if (pageNum <= 1) return;
      pageNum--;
      queueRenderPage(pageNum);
    });
    
    // Go to next page
    document.getElementById('next').addEventListener('click', function() {
      if (pageNum >= pdfDoc.numPages) return;
      pageNum++;
      queueRenderPage(pageNum);
    });
    
    // Handle touch events and send coordinates to React Native
    document.addEventListener('touchend', function(event) {
      if (event.touches.length === 0) {
        const touch = event.changedTouches[0];
        const x = touch.clientX;
        const y = touch.clientY;
        
        // Find which page was tapped (useful for multi-page view)
        let targetElement = document.elementFromPoint(x, y);
        let pageDiv = targetElement;
        
        while (pageDiv && (!pageDiv.classList || !pageDiv.classList.contains('page'))) {
          pageDiv = pageDiv.parentElement;
        }
        
        const pageNumber = pageDiv ? parseInt(pageDiv.dataset.pageNumber) : pageNum;
        const rect = pageDiv ? pageDiv.getBoundingClientRect() : null;
        
        // Calculate relative position within the page
        const relX = rect ? x - rect.left : x;
        const relY = rect ? y - rect.top : y;
        
        window.ReactNativeWebView.postMessage(JSON.stringify({ 
          type: 'tap', 
          x: relX,
          y: relY,
          pageNumber: pageNumber,
          viewportWidth: rect ? rect.width : window.innerWidth,
          viewportHeight: rect ? rect.height : window.innerHeight
        }));
      }
    });
    
    // Handle messages from React Native
    window.addEventListener('message', function(event) {
      const data = event.data;
      if (data === 'getCurrentPage') {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'currentPage', 
          page: pageNum,
          totalPages: pdfDoc ? pdfDoc.numPages : 0
        }));
      }
    });
    
    // Start loading the PDF
    loadPDF();
  </script>
</body>
</html>
`;

const PDFWebViewer = forwardRef<PDFViewerRef, PDFWebViewerProps>(({ 
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
      console.log('DEBUG: WebView message received:', data);
      
      if (data.type === 'pdfLoaded') {
        setNumberOfPages(data.totalPages);
        setIsLoading(false);
      }
      else if (data.type === 'currentPage') {
        setCurrentPage(data.page);
        setNumberOfPages(data.totalPages);
        if (onPageChanged) {
          onPageChanged(data.page, data.totalPages);
        }
      }
      else if (data.type === 'error') {
        console.error('PDF error:', data.message);
        setError(data.message || 'Unknown error loading PDF');
        setIsLoading(false);
      }
      else if (data.type === 'tap') {
        console.log('DEBUG: Tap received at', data.x, data.y, 'on page', data.pageNumber);
        
        // If in point selection mode or starting area selection
        setSelectionMode('point');
        setSelectionStart({
          x: data.x,
          y: data.y,
          pageIndex: (data.pageNumber || currentPage) - 1
        });
        
        selectionX.value = data.x;
        selectionY.value = data.y;
        selectionWidth.value = 0;
        selectionHeight.value = 0;
        
        setSelectionVisible(true);
        
        // Notify parent if callback exists
        if (onSelectionMade) {
          onSelectionMade(data.x, data.y, 0, 0, data.pageNumber || currentPage);
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

  // Prepare WebView source
  const [webViewSource, setWebViewSource] = useState<{ html: string }>({ html: '' });
  
  useEffect(() => {
    const prepareSource = async () => {
      try {
        setIsLoading(true);
        console.log('Preparing PDF source for URI:', uri);
        
        // Different handling for file:// URIs vs remote URLs
        let pdfData;
        
        if (uri.startsWith('file://')) {
          console.log('Loading local PDF file');
          // Read the file and convert to base64
          const base64Data = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          pdfData = `data:application/pdf;base64,${base64Data}`;
          console.log('PDF loaded as base64 data');
        } else {
          // For remote URLs, use as is
          pdfData = uri;
        }
        
        // Create HTML with the PDF source
        const htmlContent = pdfTemplate(pdfData);
        setWebViewSource({ html: htmlContent });
        
        // Loading status is updated based on WebView message
      } catch (error: any) {
        console.error('Error preparing PDF source:', error);
        setError(`Error: ${error?.message || 'Failed to load PDF'}`);
        setIsLoading(false);
      }
    };
    
    prepareSource();
  }, [uri]);
  
  // Log for debugging
  useEffect(() => {
    console.log('PDF URI:', uri);
  }, [uri]);

  if (error) {
    return (
      <ThemedView style={styles.errorContainer}>
        <ThemedText style={styles.errorText}>{error}</ThemedText>
      </ThemedView>
    );
  }

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
          originWhitelist={['*']}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          onMessage={handleMessage}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error('WebView error:', nativeEvent);
            setError(`WebView error: ${nativeEvent.description || 'Unknown error'}`);
            setIsLoading(false);
          }}
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

export default PDFWebViewer;
