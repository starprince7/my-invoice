import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  withTiming,
  runOnJS,
  useSharedValue,
} from 'react-native-reanimated';

// Define types
export interface TextOverlayItem {
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

interface TextOverlayProps {
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  pageIndex: number;
  isPoint?: boolean;
  initialText?: string;
  onTextChange: (text: string) => void;
  onBlur: () => void;
}

const TextOverlay: React.FC<TextOverlayProps> = ({
  visible,
  x,
  y,
  width,
  height,
  pageIndex,
  isPoint = false,
  initialText = '',
  onTextChange,
  onBlur,
}) => {
  const [text, setText] = useState(initialText);
  const inputRef = useRef<TextInput>(null);
  const opacity = useSharedValue(0);
  
  // Calculate dimensions based on selection type
  const finalWidth = isPoint ? 150 : Math.max(width, 100);
  const finalHeight = isPoint ? 40 : Math.max(height, 40);
  
  useEffect(() => {
    if (visible) {
      // When made visible, focus the text input after a short delay
      opacity.value = withTiming(1, { duration: 200 });
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    } else {
      // When hidden, animate out
      opacity.value = withTiming(0, { duration: 150 });
    }
  }, [visible, opacity]);

  // Handle text changes
  const handleChangeText = (newText: string) => {
    setText(newText);
    onTextChange(newText);
  };

  // Handle input blur
  const handleBlur = () => {
    onBlur();
  };

  // Animated styles
  const containerStyle = useAnimatedStyle(() => {
    return {
      position: 'absolute',
      left: x,
      top: y,
      width: finalWidth,
      height: finalHeight,
      opacity: opacity.value,
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      borderRadius: 4,
      borderWidth: 1,
      borderColor: '#2196F3',
      padding: 4,
      // Adjust position for point selections to center better
      transform: isPoint 
        ? [{ translateX: -finalWidth / 2 }, { translateY: -finalHeight / 2 }]
        : [],
      // Ensure overlay is visible above PDF
      zIndex: 1000,
      elevation: 5,
    };
  });

  return (
    <Animated.View style={containerStyle}>
      <TextInput
        ref={inputRef}
        style={styles.textInput}
        value={text}
        onChangeText={handleChangeText}
        onBlur={handleBlur}
        multiline={!isPoint}
        autoFocus
        selectTextOnFocus
        blurOnSubmit={isPoint}
        returnKeyType={isPoint ? "done" : "default"}
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  textInput: {
    flex: 1,
    padding: 0,
    fontSize: 16,
    color: '#000',
    textAlignVertical: 'top',
  },
});

export default TextOverlay;
