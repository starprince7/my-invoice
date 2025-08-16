import React, { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, View, Dimensions, ActivityIndicator } from 'react-native';
import Pdf from 'react-native-pdf';
import { ThemedView } from '../ThemedView';
import { ThemedText } from '../ThemedText';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, runOnJS } from 'react-native-reanimated';
import SelectionOverlay from './SelectionOverlay';
import TextOverlay from './TextOverlay';
import { generateUUID } from '../../utils/uuid';

interface PDFViewerProps {
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

interface TextItem {
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

const PDFViewer = forwardRef<PDFViewerRef, PDFViewerProps>(({ uri, onPageChanged, onSelectionMade, onTextAdded, onTextEdited }, ref) => {
  const [numberOfPages, setNumberOfPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Selection state
  const [selectionMode, setSelectionMode] = useState<'point' | 'area'>('point');
  const [selectionVisible, setSelectionVisible] = useState<boolean>(false);
  const [selectionStart, setSelectionStart] = useState<PDFPoint | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<PDFPoint | null>(null);
  
  // Text editing state
  const [textEditMode, setTextEditMode] = useState<boolean>(false);
  const [textOverlays, setTextOverlays] = useState<TextItem[]>([]);
  const [activeTextId, setActiveTextId] = useState<string | null>(null);
  
  // Animated values for selection overlay
  const selectionX = useSharedValue(0);
  const selectionY = useSharedValue(0);
  const selectionWidth = useSharedValue(0);
  const selectionHeight = useSharedValue(0);
  
  // Refs
  const pdfRef = useRef<any>(null);
  const viewDimensions = useRef<{ width: number, height: number, x: number, y: number }>({ width: 0, height: 0, x: 0, y: 0 });

  const handleLoadComplete = useCallback((numberOfPages: number, filePath: string) => {
    console.log(`PDF loaded with ${numberOfPages} pages from ${filePath}`);
    setNumberOfPages(numberOfPages);
    setIsLoading(false);
  }, []);

  const handleError = useCallback((error: any) => {
    console.error('Error loading PDF:', error?.message || 'Unknown error');
    setError(`Error: ${error?.message || 'Unknown error'}`);
    setIsLoading(false);
  }, []);

  const handlePageChanged = (page: number, numberOfPages: number) => {
    setCurrentPage(page);
    if (onPageChanged) {
      onPageChanged(page, numberOfPages);
    }
  };

  useEffect(() => {
    // Reset selection state when page changes
    clearSelection();
  }, [currentPage]);

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
      selectionX.value = Dimensions.get('window').width / 2;
      selectionY.value = Dimensions.get('window').height / 3;
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
  }, [selectionStart, selectionX.value, selectionY.value, selectionWidth.value, selectionHeight.value, onTextAdded]);
  
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

  // We'll use a simplified coordinate system instead of trying to access PDF internals
  // This function is kept for API compatibility but simplified
  const pdfToScreenCoordinates = useCallback((pdfPoint: PDFPoint) => {
    // Use the current view dimensions
    const containerWidth = viewDimensions.current.width;
    const containerHeight = viewDimensions.current.height;
    
    // Interpret normalized coordinates (0-1) as screen proportions
    const screenX = pdfPoint.x * containerWidth;
    const screenY = pdfPoint.y * containerHeight;
    
    return { x: screenX, y: screenY };
  }, []);
  
  // Update view dimensions when layout changes
  const handleLayout = useCallback((event: any) => {
    const { width, height, x, y } = event.nativeEvent.layout;
    // Store position in addition to dimensions
    viewDimensions.current = { width, height, x, y };
  }, []);
  
  // Improved handleTap with direct screen coordinates for accurate positioning
  const handleTap = useCallback((x: number, y: number, absoluteX: number, absoluteY: number) => {
    // Create a PDFPoint from the tap coordinates
    const pdfPoint = {
      x,
      y,
      pageIndex: currentPage - 1, // Convert 1-indexed page to 0-indexed
    };
    
    // Set the selection start and end to the same point for single tap
    setSelectionStart(pdfPoint);
    setSelectionEnd(pdfPoint);
    
    // Use the exact tap position for selection overlay
    // No need to translate coordinates - use the raw position directly
    selectionX.value = x;
    selectionY.value = y;
    selectionWidth.value = 0;
    selectionHeight.value = 0;
    
    // Show the selection
    setSelectionMode('point');
    setSelectionVisible(true);
    
    // Notify parent component if callback exists
    if (onSelectionMade) {
      onSelectionMade(x, y, 0, 0, currentPage);
    }
  }, [currentPage, onSelectionMade]);
  
  // Precisely aligned handleDrag with direct screen coordinates
  const handleDrag = useCallback((startX: number, startY: number, endX: number, endY: number,
    absStartX: number, absStartY: number, absEndX: number, absEndY: number) => {
    // Create selection points with direct coordinates
    const startPoint = { x: startX, y: startY, pageIndex: currentPage - 1 };
    const endPoint = { x: endX, y: endY, pageIndex: currentPage - 1 };
    
    // Set the selection bounds
    setSelectionStart(startPoint);
    setSelectionEnd(endPoint);
    
    // Calculate rectangle properties for visual overlay
    // To ensure perfect alignment, use exact coordinates from the gesture
    // with no adjustments or transformations
    const left = Math.min(startX, endX);
    const top = Math.min(startY, endY);
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);
    
    // Position the selection overlay using direct coordinates
    // This ensures the selection rectangle matches exactly what the user drags
    selectionX.value = left;
    selectionY.value = top;
    selectionWidth.value = width;
    selectionHeight.value = height;
    
    // Show area selection mode
    setSelectionMode('area');
    setSelectionVisible(true);
    
    // Notify parent component if callback exists
    if (onSelectionMade && width > 10 && height > 10) {
      // Only notify for meaningful selections (not tiny accidental drags)
      onSelectionMade(left, top, width, height, currentPage);
    }
  }, [currentPage, onSelectionMade]);

  // Improved approach to handle touches with more accurate positioning
  const handleGestureTap = (e: any) => {
    // Extract the touch coordinates
    const { absoluteX, absoluteY, x, y } = e;
    
    // Calculate the actual touch position relative to the PDF
    // instead of using normalized coordinates
    handleTap(x, y, absoluteX, absoluteY);
  };
  
  // Tap gesture that calls back to JS thread
  const singleTap = Gesture.Tap()
    .maxDuration(250)
    .onEnd((e) => {
      // Send the event to the JS thread
      runOnJS(handleGestureTap)(e);
    });

  // Refined pan start with adjusted coordinates for perfect positioning
  const handlePanStart = (e: any) => {
    // Accurately capture the exact start position
    // No transformations or adjustments - use raw coordinates
    const pdfStartPoint = {
      x: e.x,
      y: e.y,
      pageIndex: currentPage - 1,
    };
    
    // Store the exact start position
    setSelectionStart(pdfStartPoint);
  };
  
  // Refined pan update with coordinate consistency
  const handlePanUpdate = (e: any) => {
    if (!selectionStart) return;
    
    // Call the drag handler with direct, consistent coordinates
    // This ensures the selection matches exactly what the user drags
    handleDrag(
      selectionStart.x,
      selectionStart.y,
      e.x,
      e.y,
      selectionStart.x,
      selectionStart.y,
      e.x,
      e.y
    );
  };
  
  // Reset any existing selection when starting a new pan gesture
  // This ensures we don't use a previous selection as the starting point
  const panGesture = Gesture.Pan()
    .onBegin(() => {
      // Clear any existing selection when a new gesture begins
      runOnJS(clearSelection)();
    })
    .onStart((e) => {
      // Start a fresh selection from the current touch point
      runOnJS(handlePanStart)(e);
    })
    .onUpdate((e) => {
      if (selectionStart) {
        runOnJS(handlePanUpdate)(e);
      }
    });

  // Combine gestures with proper priority
  const gesture = Gesture.Exclusive(singleTap, panGesture);

  // Expose methods to parent component via ref
  useImperativeHandle(ref, () => ({
    startTextEditing: () => {
      return startTextEditing();
    }
  }));

  if (error) {
    return (
      <ThemedView style={styles.errorContainer}>
        <ThemedText type="subtitle" style={styles.errorText}>
          Failed to load PDF
        </ThemedText>
        <ThemedText>{error}</ThemedText>
      </ThemedView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <ThemedView style={styles.container}>
        <GestureDetector gesture={gesture}>
          <Animated.View style={styles.pdfContainer} onLayout={handleLayout}>
            {isLoading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#0000ff" />
                <ThemedText style={styles.loadingText}>Loading PDF...</ThemedText>
              </View>
            )}
            <Pdf
              ref={pdfRef}
              trustAllCerts={false}
              source={{ uri }}
              onLoadComplete={handleLoadComplete}
              onPageChanged={handlePageChanged}
              onError={handleError}
              style={styles.pdf}
              enablePaging={false}
              enableAnnotationRendering={true}
              fitPolicy={0} // 0 = WIDTH, 1 = HEIGHT, 2 = BOTH
            />
            
            {/* Show the selection overlay when visible and not in text edit mode */}
            <SelectionOverlay
              x={selectionX.value}
              y={selectionY.value}
              width={selectionWidth.value}
              height={selectionHeight.value}
              visible={selectionVisible && !textEditMode}
              isPoint={selectionMode === 'point'}
            />
            
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
                  key={item.id}
                  style={{
                    position: 'absolute',
                    left: item.x,
                    top: item.y,
                    width: item.width,
                    height: item.height,
                    padding: 4,
                    backgroundColor: 'rgba(255, 255, 255, 0.7)',
                    zIndex: 100,
                  }}
                >
                  <ThemedText style={{ fontSize: item.fontSize, color: item.color }}>
                    {item.text}
                  </ThemedText>
                </View>
              ))}
          </Animated.View>
        </GestureDetector>
        
        {!isLoading && (
          <View style={styles.pageIndicator}>
            <ThemedText>{`Page ${currentPage} of ${numberOfPages}`}</ThemedText>
          </View>
        )}
      </ThemedView>
    </GestureHandlerRootView>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
  },
  pdfContainer: {
    flex: 1,
    width: '100%',
    position: 'relative',
  },
  pdf: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#F0F0F0',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(240, 240, 240, 0.7)',
    zIndex: 10,
  },
  loadingText: {
    marginTop: 10,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    marginBottom: 10,
    color: 'red',
  },
  pageIndicator: {
    padding: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(240, 240, 240, 0.7)',
    borderTopWidth: 1,
    borderTopColor: '#DDD',
  },
});

export default PDFViewer;
