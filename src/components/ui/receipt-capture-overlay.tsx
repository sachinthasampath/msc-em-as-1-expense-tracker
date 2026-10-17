/* eslint-disable react-hooks/immutability --
   Reanimated shared values (.value) are intentionally mutable containers driving the crop-handle
   gestures outside React's render cycle — see swipeable-card-item.tsx for the same note. */
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { Dimensions, Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radius, Spacing } from '@/constants/theme';

const HANDLE_SIZE = 28;
const SCREEN_WIDTH = Dimensions.get('window').width;
const DISPLAY_WIDTH = SCREEN_WIDTH - Spacing.four * 2;

type Corner = 'tl' | 'tr' | 'bl' | 'br';
type CaptureError = {
  code: 'permission-denied' | 'camera-unavailable' | 'capture-failed' | 'crop-failed';
  message: string;
};
type CapturedImage = { uri: string; width: number; height: number };
type CaptureResult = { uri: string; width: number; height: number; mimeType: string; fileSize: number };

export type ReceiptCaptureOverlayProps = {
  onCancel: () => void;
  onCapture: (result: CaptureResult) => void;
  onError: (error: CaptureError) => void;
  cropAspectRatio?: number;
  maxDimension?: number;
  testID?: string;
};

export function ReceiptCaptureOverlay({
  onCancel,
  onCapture,
  onError,
  cropAspectRatio,
  maxDimension = 2000,
  testID,
}: ReceiptCaptureOverlayProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [captured, setCaptured] = useState<CapturedImage | null>(null);
  const [cropping, setCropping] = useState(false);

  useEffect(() => {
    if (permission && !permission.granted && !permission.canAskAgain) {
      onError({ code: 'permission-denied', message: 'Camera permission was denied.' });
    }
  }, [permission, onError]);

  async function handleShutter() {
    try {
      // skipProcessing left at its default (false): expo-camera then rotates the result to
      // match device orientation and scales it to the preview, which is what normalizes EXIF
      // orientation before any crop math runs — the single most common hand-rolled-crop-UI bug.
      const photo = await cameraRef.current?.takePictureAsync({ exif: false, quality: 1 });
      if (!photo) throw new Error('no photo returned');
      setCaptured({ uri: photo.uri, width: photo.width, height: photo.height });
    } catch {
      onError({ code: 'capture-failed', message: 'Failed to capture photo.' });
    }
  }

  async function handlePickFromGallery() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setCaptured({ uri: asset.uri, width: asset.width, height: asset.height });
  }

  if (!permission) return null;

  if (!permission.granted) {
    return (
      <View style={styles.center} testID={testID}>
        <ThemedText type="title">Camera access needed</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.permissionText}>
          Allow camera access to capture a receipt photo.
        </ThemedText>
        {permission.canAskAgain ? (
          <Pressable style={styles.primaryButton} onPress={requestPermission}>
            <ThemedText type="smallBold" style={styles.primaryLabel}>
              Grant permission
            </ThemedText>
          </Pressable>
        ) : (
          <Pressable style={styles.primaryButton} onPress={() => Linking.openSettings()}>
            <ThemedText type="smallBold" style={styles.primaryLabel}>
              Open Settings
            </ThemedText>
          </Pressable>
        )}
        <Pressable onPress={onCancel}>
          <ThemedText themeColor="textSecondary">Cancel</ThemedText>
        </Pressable>
      </View>
    );
  }

  if (captured) {
    return (
      <CropStep
        image={captured}
        cropAspectRatio={cropAspectRatio}
        maxDimension={maxDimension}
        cropping={cropping}
        setCropping={setCropping}
        onRetake={() => setCaptured(null)}
        onCancel={onCancel}
        onCapture={onCapture}
        onError={onError}
        testID={testID}
      />
    );
  }

  return (
    <View style={styles.fill} testID={testID}>
      <CameraView ref={cameraRef} style={styles.fill} facing="back" />
      <View style={styles.controls}>
        <Pressable onPress={onCancel}>
          <ThemedText type="smallBold" style={styles.controlText}>
            Cancel
          </ThemedText>
        </Pressable>
        <Pressable onPress={handleShutter} style={styles.shutter} accessibilityLabel="Take photo" />
        <Pressable onPress={handlePickFromGallery}>
          <ThemedText type="smallBold" style={styles.controlText}>
            Gallery
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

function CropStep({
  image,
  cropAspectRatio,
  maxDimension,
  cropping,
  setCropping,
  onRetake,
  onCancel,
  onCapture,
  onError,
  testID,
}: {
  image: CapturedImage;
  cropAspectRatio?: number;
  maxDimension: number;
  cropping: boolean;
  setCropping: (v: boolean) => void;
  onRetake: () => void;
  onCancel: () => void;
  onCapture: (result: CaptureResult) => void;
  onError: (error: CaptureError) => void;
  testID?: string;
}) {
  const displayHeight = DISPLAY_WIDTH * (image.height / image.width);
  const scale = image.width / DISPLAY_WIDTH; // uniform: display preserves the captured aspect ratio

  const initial = initialRect(DISPLAY_WIDTH, displayHeight, cropAspectRatio);
  const left = useSharedValue(initial.left);
  const top = useSharedValue(initial.top);
  const right = useSharedValue(initial.right);
  const bottom = useSharedValue(initial.bottom);
  const dragStart = useSharedValue({ left: 0, top: 0, right: 0, bottom: 0 });

  const manipulatorContext = ImageManipulator.useImageManipulator(image.uri);

  function makeCornerGesture(corner: Corner) {
    // Anchor rule: with a fixed aspect ratio, the corner diagonally opposite the one being
    // dragged stays put (06-custom-components.md).
    return Gesture.Pan()
      .onStart(() => {
        dragStart.value = { left: left.value, top: top.value, right: right.value, bottom: bottom.value };
      })
      .onUpdate((event) => {
        const start = dragStart.value;
        let nextLeft = start.left;
        let nextTop = start.top;
        let nextRight = start.right;
        let nextBottom = start.bottom;

        if (corner === 'tl') {
          nextLeft = start.left + event.translationX;
          nextTop = start.top + event.translationY;
        } else if (corner === 'tr') {
          nextRight = start.right + event.translationX;
          nextTop = start.top + event.translationY;
        } else if (corner === 'bl') {
          nextLeft = start.left + event.translationX;
          nextBottom = start.bottom + event.translationY;
        } else {
          nextRight = start.right + event.translationX;
          nextBottom = start.bottom + event.translationY;
        }

        if (cropAspectRatio) {
          const anchorX = corner === 'tl' || corner === 'bl' ? nextRight : nextLeft;
          const anchorY = corner === 'tl' || corner === 'tr' ? nextBottom : nextTop;
          const movedX = corner === 'tl' || corner === 'bl' ? nextLeft : nextRight;
          const movedY = corner === 'tl' || corner === 'tr' ? nextTop : nextBottom;
          const width = Math.abs(movedX - anchorX);
          const height = width / cropAspectRatio;
          const signY = movedY >= anchorY ? 1 : -1;
          const constrainedY = anchorY + signY * height;

          if (corner === 'tl') {
            nextTop = constrainedY;
          } else if (corner === 'tr') {
            nextTop = constrainedY;
          } else if (corner === 'bl') {
            nextBottom = constrainedY;
          } else {
            nextBottom = constrainedY;
          }
        }

        // Clamp within the displayed image bounds, and keep a minimum crop size.
        const minSize = HANDLE_SIZE * 2;
        left.value = Math.min(Math.max(nextLeft, 0), nextRight - minSize);
        top.value = Math.min(Math.max(nextTop, 0), nextBottom - minSize);
        right.value = Math.max(Math.min(nextRight, DISPLAY_WIDTH), nextLeft + minSize);
        bottom.value = Math.max(Math.min(nextBottom, displayHeight), nextTop + minSize);
      });
  }

  const tl = makeCornerGesture('tl');
  const tr = makeCornerGesture('tr');
  const bl = makeCornerGesture('bl');
  const br = makeCornerGesture('br');

  const rectStyle = useAnimatedStyle(() => ({
    left: left.value,
    top: top.value,
    width: right.value - left.value,
    height: bottom.value - top.value,
  }));
  const tlStyle = useAnimatedStyle(() => ({ left: left.value - HANDLE_SIZE / 2, top: top.value - HANDLE_SIZE / 2 }));
  const trStyle = useAnimatedStyle(() => ({ left: right.value - HANDLE_SIZE / 2, top: top.value - HANDLE_SIZE / 2 }));
  const blStyle = useAnimatedStyle(() => ({ left: left.value - HANDLE_SIZE / 2, top: bottom.value - HANDLE_SIZE / 2 }));
  const brStyle = useAnimatedStyle(() => ({
    left: right.value - HANDLE_SIZE / 2,
    top: bottom.value - HANDLE_SIZE / 2,
  }));

  async function handleConfirm() {
    setCropping(true);
    try {
      const originX = left.value * scale;
      const originY = top.value * scale;
      const width = (right.value - left.value) * scale;
      const height = (bottom.value - top.value) * scale;

      const rendered = await manipulatorContext
        .crop({ originX, originY, width, height })
        .resize({ width: Math.min(width, maxDimension) })
        .renderAsync();
      const result = await rendered.saveAsync({ compress: 0.8, format: ImageManipulator.SaveFormat.JPEG });

      onCapture({
        uri: result.uri,
        width: result.width,
        height: result.height,
        mimeType: 'image/jpeg',
        fileSize: 0,
      });
    } catch {
      onError({ code: 'crop-failed', message: 'Failed to crop image.' });
    } finally {
      setCropping(false);
    }
  }

  function handleUseWholeImage() {
    left.value = 0;
    top.value = 0;
    right.value = DISPLAY_WIDTH;
    bottom.value = displayHeight;
  }

  return (
    <View style={styles.fill} testID={testID}>
      <View style={[styles.cropArea, { width: DISPLAY_WIDTH, height: displayHeight }]}>
        <Image source={{ uri: image.uri }} style={{ width: DISPLAY_WIDTH, height: displayHeight }} />
        <Animated.View style={[styles.cropRect, rectStyle]} pointerEvents="none" />
        <GestureDetector gesture={tl}>
          <Animated.View style={[styles.handle, tlStyle]} accessibilityLabel="Crop top-left handle" />
        </GestureDetector>
        <GestureDetector gesture={tr}>
          <Animated.View style={[styles.handle, trStyle]} accessibilityLabel="Crop top-right handle" />
        </GestureDetector>
        <GestureDetector gesture={bl}>
          <Animated.View style={[styles.handle, blStyle]} accessibilityLabel="Crop bottom-left handle" />
        </GestureDetector>
        <GestureDetector gesture={br}>
          <Animated.View style={[styles.handle, brStyle]} accessibilityLabel="Crop bottom-right handle" />
        </GestureDetector>
      </View>

      <Pressable onPress={handleUseWholeImage} accessibilityLabel="Use the whole image">
        <ThemedText type="link" style={styles.wholeImageLink}>
          Use the whole image
        </ThemedText>
      </Pressable>

      <View style={styles.controls}>
        <Pressable onPress={onCancel}>
          <ThemedText type="smallBold" style={styles.controlText}>
            Cancel
          </ThemedText>
        </Pressable>
        <Pressable onPress={onRetake}>
          <ThemedText type="smallBold" style={styles.controlText}>
            Retake
          </ThemedText>
        </Pressable>
        <Pressable onPress={handleConfirm} disabled={cropping} accessibilityLabel="Confirm crop">
          <ThemedText type="smallBold" style={styles.controlText}>
            {cropping ? 'Saving…' : 'Confirm'}
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

function initialRect(width: number, height: number, aspectRatio?: number) {
  if (aspectRatio) {
    const targetHeight = Math.min(height * 0.8, width * 0.8 / aspectRatio);
    const targetWidth = targetHeight * aspectRatio;
    const left = (width - targetWidth) / 2;
    const top = (height - targetHeight) / 2;
    return { left, top, right: left + targetWidth, bottom: top + targetHeight };
  }
  return { left: width * 0.1, top: height * 0.1, right: width * 0.9, bottom: height * 0.9 };
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  permissionText: {
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: Colors.light.primary,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  primaryLabel: {
    color: Colors.light.onPrimary,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: Spacing.four,
    backgroundColor: '#000',
  },
  controlText: {
    color: '#fff',
  },
  shutter: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
  },
  cropArea: {
    alignSelf: 'center',
    marginTop: Spacing.five,
    position: 'relative',
  },
  cropRect: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: Colors.light.primary,
  },
  handle: {
    position: 'absolute',
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: HANDLE_SIZE / 2,
    backgroundColor: Colors.light.primary,
    borderWidth: 2,
    borderColor: '#fff',
  },
  wholeImageLink: {
    color: '#fff',
    textAlign: 'center',
    marginTop: Spacing.two,
  },
});
