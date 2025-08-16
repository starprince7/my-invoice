import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TextInput, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system';
import { ThemedView } from '../ThemedView';
import { generateUUID } from '../../utils/uuid';

// Type definitions
export interface PDFViewerRef {
  startTextEditing: () => TextItem;
  editTextAnnotation: (textItem: TextItem) => TextItem;
  getAllTextAnnotations: () => TextItem[];
  clearAllAnnotations: () => boolean;
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

// Enhanced HTML template that loads PDF directly with multi-page support and navigation controls
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
      font-family: Arial, sans-serif;
    }
    #pdf-container {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    .pdf-object-container {
      width: 100%;
      height: calc(100% - 50px);
      position: relative;
    }
    object {
      width: 100%;
      height: 100%;
      display: block;
    }
    #controls {
      height: 50px;
      width: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      background-color: #f5f5f5;
      border-top: 1px solid #ddd;
      z-index: 100;
      position: relative;
    }
    .nav-btn {
      padding: 8px 16px;
      margin: 0 5px;
      background-color: #2196F3;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 14px;
      cursor: pointer;
      user-select: none;
      touch-action: manipulation;
    }
    .nav-btn:disabled {
      background-color: #cccccc;
      cursor: not-allowed;
    }
    .page-info {
      margin: 0 10px;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div id="pdf-container">
    <div class="pdf-object-container">
      <object id="pdf-object" data="data:application/pdf;base64,${pdfBase64}" type="application/pdf">
        <p>Your browser does not support PDFs. Please download the PDF to view it.</p>
      </object>
    </div>
    <div id="controls">
      <button id="prev-btn" class="nav-btn" disabled>Previous</button>
      <div class="page-info" id="page-info">Page 1 / 1</div>
      <button id="next-btn" class="nav-btn" disabled>Next</button>
    </div>
  </div>

  <script>
    // Variables to track PDF pages
    let currentPage = 1;
    let totalPages = 1;
    const pdfObject = document.getElementById('pdf-object');
    const pageInfo = document.getElementById('page-info');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');

    // Try to get the PDF document to read total pages
    function checkPDFLoadedAndGetInfo() {
      try {
        // Most PDF viewers expose the current page and total pages
        // This is a best-effort attempt as different browsers handle this differently
        if (pdfObject && pdfObject.contentDocument) {
          // Try to get total pages from embedded PDF viewer
          const pdfViewer = pdfObject.contentDocument.querySelector('#viewer');
          if (pdfViewer) {
            totalPages = pdfViewer.getElementsByClassName('page').length || 1;
          }
          
          // Update UI
          updatePageControls();
          
          // Notify React Native that PDF is loaded with page info
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'loaded',
            currentPage: currentPage,
            totalPages: totalPages
          }));
          
          return true;
        }
      } catch (e) {
        console.log('Could not access PDF viewer:', e);
      }
      
      return false;
    }
    
    // Function to update navigation buttons and page info
    function updatePageControls() {
      pageInfo.textContent = 'Page ' + currentPage + ' / ' + totalPages;
      prevBtn.disabled = currentPage <= 1;
      nextBtn.disabled = currentPage >= totalPages;
      
      // Notify React Native about page change
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'pageChanged',
        currentPage: currentPage,
        totalPages: totalPages
      }));
    }
    
    // Add event listeners for navigation buttons
    prevBtn.addEventListener('click', function() {
      if (currentPage > 1) {
        currentPage--;
        // Send command to PDF viewer to go to previous page
        try {
          if (pdfObject.contentWindow) {
            pdfObject.contentWindow.postMessage({ action: 'previousPage' }, '*');
          }
        } catch (e) {
          console.log('Error navigating to previous page:', e);
        }
        updatePageControls();
      }
    });
    
    nextBtn.addEventListener('click', function() {
      if (currentPage < totalPages) {
        currentPage++;
        // Send command to PDF viewer to go to next page
        try {
          if (pdfObject.contentWindow) {
            pdfObject.contentWindow.postMessage({ action: 'nextPage' }, '*');
          }
        } catch (e) {
          console.log('Error navigating to next page:', e);
        }
        updatePageControls();
      }
    });
    
    // Listen for messages from PDF viewer about page changes
    window.addEventListener('message', function(e) {
      try {
        const data = e.data;
        if (data && data.type === 'pageChanged') {
          currentPage = data.page || currentPage;
          updatePageControls();
        }
      } catch (e) {
        console.log('Error processing message:', e);
      }
    });

    // Handle tap events on the PDF
    document.addEventListener('click', function(e) {
      // Ignore clicks on control buttons
      if (e.target.closest('#controls')) {
        return;
      }
      
      const rect = pdfObject.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const width = 150;
      const height = 50;
      
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'tap',
        x: x,
        y: y,
        width: width,
        height: height,
        page: currentPage
      }));
    });
    
    // When the document loads, try to get PDF info
    window.addEventListener('load', function() {
      // First set a minimum assumption
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'loaded',
        currentPage: 1,
        totalPages: 1
      }));
      
      // Then try to get real info with a delay to allow PDF to load
      setTimeout(() => {
        if (!checkPDFLoadedAndGetInfo()) {
          // Retry after a longer delay if first attempt failed
          setTimeout(checkPDFLoadedAndGetInfo, 1000);
        }
      }, 500);
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
    },
    editTextAnnotation: (textItem: TextItem) => {
      return editExistingText(textItem);
    },
    getAllTextAnnotations: () => {
      return textAnnotations;
    },
    clearAllAnnotations: () => {
      setTextAnnotations([]);
      return true;
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
        
        // First update the text position
        setTextPosition({
          x: data.x,
          y: data.y,
          width: data.width,
          height: data.height
        });
        
        // DIRECT TEXT EDITING: Show text input immediately on tap
        // Create a new text item
        const newTextItem: TextItem = {
          id: generateUUID(),
          text: '',
          x: data.x,
          y: data.y,
          width: data.width,
          height: data.height,
          fontSize: 18,
          color: '#000000',
          pageIndex: currentPage - 1,
        };
        
        // Force re-render with a new key
        setOverlayKey(Date.now().toString());
        
        // Clear text and show overlay
        setOverlayText('');
        setShowTextOverlay(true);
        
        console.log('Text overlay should now be visible from tap');
        
        // Notify parent component of tap/selection
        if (onSelectionMade) {
          onSelectionMade(data.x, data.y, data.width, data.height, data.page);
          
          // Also notify of text added
          if (onTextAdded) {
            onTextAdded(newTextItem);
          }
        }
      } else if (data.type === 'loaded') {
        console.log('PDF loaded with total pages:', data.totalPages);
        setCurrentPage(data.currentPage || 1);
        setTotalPages(data.totalPages || 1);
        setIsLoading(false);
        
        // Notify parent of page change
        if (onPageChanged) {
          onPageChanged(data.currentPage || 1, data.totalPages || 1);
        }
      } else if (data.type === 'pageChanged') {
        console.log('Page changed:', data.currentPage, 'of', data.totalPages);
        setCurrentPage(data.currentPage || currentPage);
        setTotalPages(data.totalPages || totalPages);
        
        // Notify parent of page change
        if (onPageChanged) {
          onPageChanged(data.currentPage || currentPage, data.totalPages || totalPages);
        }
        
        // Clear any active text editing when page changes
        setShowTextOverlay(false);
      }
    } catch (err) {
      console.error('Error handling WebView message:', err);
    }
  };
  
  // Maintain local collection of text items
  const [textAnnotations, setTextAnnotations] = useState<TextItem[]>([]);
  const [editingAnnotation, setEditingAnnotation] = useState<TextItem | null>(null);
  
  // Text editing implementation with robust handling
  const startTextEditingHandler = useCallback(() => {
    console.log('START TEXT EDITING CALLED - ENHANCED IMPLEMENTATION');
    
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
    
    // Set as currently editing annotation
    setEditingAnnotation(newTextItem);
    
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
  
  // Function to start editing an existing text annotation
  const editExistingText = useCallback((textItem: TextItem) => {
    console.log('Editing existing text annotation:', textItem.id);
    
    // Set position and content from existing item
    setTextPosition({
      x: textItem.x,
      y: textItem.y,
      width: textItem.width,
      height: textItem.height
    });
    
    // Set text content and mark as editing
    setOverlayText(textItem.text);
    setEditingAnnotation(textItem);
    
    // Show overlay with new key to force re-render
    setOverlayKey(Date.now().toString());
    setShowTextOverlay(true);
    
    return textItem;
  }, []);
  
  // Handle text changes in the overlay
  const handleOverlayTextChange = (text: string) => {
    setOverlayText(text);
  };
  
  // Handle text editing completion
  const handleTextEditingComplete = () => {
    console.log('Text editing completed with text:', overlayText);
    
    if (overlayText.trim().length > 0) {
      let editedTextItem: TextItem;
      
      if (editingAnnotation) {
        // Update existing annotation
        editedTextItem = {
          ...editingAnnotation,
          text: overlayText
        };
        
        // Replace in annotations array
        setTextAnnotations(prev => 
          prev.map(item => item.id === editedTextItem.id ? editedTextItem : item)
        );
      } else {
        // Create new annotation
        editedTextItem = {
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
        
        // Add to annotations array
        setTextAnnotations(prev => [...prev, editedTextItem]);
      }
      
      // Notify parent if callback provided
      if (onTextEdited) {
        onTextEdited(editedTextItem);
      }
    }
    
    // Clear editing state
    setEditingAnnotation(null);
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
                {textAnnotations.length > 0 && ` | Annotations: ${textAnnotations.length}`}
              </Text>
            </View>
            
            {/* Render existing text annotations for current page */}
            {textAnnotations
              .filter(item => item.pageIndex === currentPage - 1)
              .map(annotation => (
                <View
                  key={annotation.id}
                  style={[
                    styles.textAnnotation,
                    {
                      left: annotation.x,
                      top: annotation.y,
                      width: annotation.width,
                      height: annotation.height,
                    }
                  ]}
                  onTouchStart={() => editExistingText(annotation)}
                >
                  <Text style={[
                    styles.annotationText,
                    { fontSize: annotation.fontSize, color: annotation.color }
                  ]}>
                    {annotation.text}
                  </Text>
                </View>
              ))
            }
            
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
                  onSubmitEditing={handleTextEditingComplete}
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
  },
  textAnnotation: {
    position: 'absolute',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    borderStyle: 'dashed',
    zIndex: 20,
    padding: 5,
    overflow: 'visible',
  },
  annotationText: {
    fontWeight: '500',
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 2,
  }
});

export default FixedPDFViewer;
