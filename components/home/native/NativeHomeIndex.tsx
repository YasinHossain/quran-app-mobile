import React, { forwardRef, memo, useImperativeHandle, useRef } from 'react';
import {
  findNodeHandle,
  Platform,
  requireNativeComponent,
  UIManager,
} from 'react-native';

import type {
  NativeHomeIndexHandle,
  NativeHomeIndexProps,
} from './NativeHomeIndex.types';

export type {
  NativeHomeIndexHandle,
  NativeHomeIndexHeaderVisibilityEvent,
  NativeHomeIndexContent,
  NativeHomeIndexItem,
  NativeHomeIndexItemType,
  NativeHomeIndexPressEvent,
  NativeHomeIndexProps,
  NativeHomeIndexTabPressEvent,
  NativeHomeIndexTheme,
} from './NativeHomeIndex.types';

const AndroidNativeHomeIndex =
  Platform.OS === 'android'
    ? requireNativeComponent<NativeHomeIndexProps>('NativeHomeIndex')
    : null;

const NativeHomeIndexComponent = forwardRef<NativeHomeIndexHandle, NativeHomeIndexProps>(
  function NativeHomeIndex(props, ref) {
    const nativeRef = useRef<React.ElementRef<NonNullable<typeof AndroidNativeHomeIndex>>>(null);

    useImperativeHandle(
      ref,
      () => ({
        scrollToTop(animated = true) {
          const nodeHandle = findNodeHandle(nativeRef.current);
          if (!nodeHandle) return;
          UIManager.dispatchViewManagerCommand(nodeHandle, 'scrollToTop', [animated]);
        },
      }),
      []
    );

    if (!AndroidNativeHomeIndex) return null;
    return <AndroidNativeHomeIndex ref={nativeRef} {...props} />;
  }
);

export const NativeHomeIndex = memo(NativeHomeIndexComponent);
