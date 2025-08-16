import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

interface SelectionOverlayProps {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  isPoint?: boolean; // Whether this is a single point selection or area selection
}

const SelectionOverlay: React.FC<SelectionOverlayProps> = ({
  x,
  y,
  width,
  height,
  visible,
  isPoint = false,
}) => {
  const animatedStyle = useAnimatedStyle(() => {
    // For point selection, we position differently to ensure exact centering
    const pointSize = 40; // Diameter of the selection circle
    
    return {
      position: 'absolute',
      // For point selection, offset by exactly half the size to center on the tap point
      // For area selection, use the exact coordinates without any offsets
      left: withTiming(isPoint ? x - pointSize/2 : x, { duration: 100 }),
      top: withTiming(isPoint ? y - pointSize/2 : y, { duration: 100 }),
      width: isPoint ? withSpring(pointSize) : withTiming(width, { duration: 100 }),
      height: isPoint ? withSpring(pointSize) : withTiming(height, { duration: 100 }),
      borderRadius: isPoint ? withSpring(pointSize/2) : withTiming(0, { duration: 100 }),
      borderWidth: 2,
      borderColor: 'rgba(0, 120, 255, 0.8)',
      backgroundColor: 'rgba(0, 120, 255, 0.2)',
      // No translates that could cause offset issues, only scale for animation
      transform: [
        { scale: withSpring(visible ? 1 : 0) },
      ],
      opacity: withTiming(visible ? 1 : 0, { duration: 150 }),
      // Add elevation to ensure it appears above the PDF
      zIndex: 1000,
    };
  });

  // Inner pulse circle for point selection
  const pulseStyle = useAnimatedStyle(() => {
    return {
      position: 'absolute',
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: 'rgba(0, 120, 255, 0.6)',
      alignSelf: 'center',
      opacity: withTiming(visible && isPoint ? 1 : 0, { duration: 150 }),
      transform: [
        { scale: withSpring(visible && isPoint ? 0.8 : 0) },
      ],
    };
  });

  return (
    <Animated.View style={animatedStyle}>
      {isPoint && <Animated.View style={pulseStyle} />}
    </Animated.View>
  );
};

export default SelectionOverlay;
