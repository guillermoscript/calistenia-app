/**
 * ShareCardCapture — off-screen view wrapper for react-native-view-shot.
 *
 * FONT RISK: Custom fonts (Bebas, DM Sans, JetBrains Mono) must be loaded
 * before capture or the PNG will fall back to the system font.
 * In _layout.tsx the app already waits for `useFonts` to resolve
 * (`fontsReady = fontsLoaded || !!fontError`) before rendering the navigator,
 * so by the time any screen mounts, fonts are ready. Callers that trigger
 * capture programmatically should add a brief RAF delay or call after
 * `InteractionManager.runAfterInteractions` to be safe.
 */
import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  type ReactNode,
} from 'react'
import { StyleSheet, View } from 'react-native'
import { captureRef } from 'react-native-view-shot'

export interface ShareCardCaptureHandle {
  /** Captures the children view as a PNG tmpfile. Returns file URI. */
  capture(): Promise<string>
}

interface Props {
  children: ReactNode
}

const ShareCardCapture = forwardRef<ShareCardCaptureHandle, Props>(
  ({ children }, ref) => {
    const viewRef = useRef<View>(null)

    useImperativeHandle(ref, () => ({
      async capture(): Promise<string> {
        if (!viewRef.current) {
          throw new Error('ShareCardCapture: viewRef not ready')
        }
        return captureRef(viewRef, {
          format: 'png',
          quality: 1,
          result: 'tmpfile',
        })
      },
    }))

    return (
      <View style={styles.offscreen} pointerEvents="none">
        <View ref={viewRef} collapsable={false}>
          {children}
        </View>
      </View>
    )
  },
)

ShareCardCapture.displayName = 'ShareCardCapture'

export default ShareCardCapture

const styles = StyleSheet.create({
  offscreen: {
    position: 'absolute',
    left: -9999,
    top: -9999,
    // Give it enough room; actual size is determined by child card
    width: 360,
    height: 640,
    overflow: 'hidden',
  },
})
