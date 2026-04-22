import React from 'react';
import {
    FlatList,
    Keyboard,
    LayoutRectangle,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    type TextInputSubmitEditingEventData,
    type TextInputProps,
    type NativeSyntheticEvent,
    useWindowDimensions,
    Text,
    TextInput,
    View,
} from 'react-native';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

import { getSelectorAndroidVisualOffset } from './selectorDropdownLayout';

type VerseOption = {
    value: number;
    label: string;
};

type Props = {
    options: VerseOption[];
    selectedValue: number | undefined;
    onSelect: (value: number) => void;
    disabled?: boolean;
    placeholder?: string;
    disabledPlaceholder?: string;
    dropdownVisualOffset?: number;
    onSelectionComplete?: (value: number) => void;
    returnKeyType?: TextInputProps['returnKeyType'];
};

export type VerseSelectorHandle = {
    openDropdown: () => void;
    closeDropdown: () => void;
};

export const VerseSelector = React.forwardRef<VerseSelectorHandle, Props>(function VerseSelector({
    options,
    selectedValue,
    onSelect,
    disabled = false,
    placeholder = 'Select Verse',
    disabledPlaceholder = 'Select Surah first',
    dropdownVisualOffset,
    onSelectionComplete,
    returnKeyType = 'done',
}: Props, ref): React.JSX.Element {
    const { resolvedTheme, isDark } = useAppTheme();
    const palette = Colors[resolvedTheme];
    const { height: windowHeight } = useWindowDimensions();

    // Keep this aligned with Tailwind semantic token `interactive`.
    const fieldBackgroundColor = isDark ? '#334155' : '#F3F4F6';

    const [isOpen, setIsOpen] = React.useState(false);
    const [searchText, setSearchText] = React.useState('');
    const [inputLayout, setInputLayout] = React.useState<LayoutRectangle | null>(null);
    const [keyboardHeight, setKeyboardHeight] = React.useState(0);
    const searchInputRef = React.useRef<TextInput>(null);
    const containerRef = React.useRef<View>(null);
    const fieldRef = React.useRef<View>(null);

    const openSeqRef = React.useRef(0);
    const [openSeq, setOpenSeq] = React.useState(0);
    const [measuredSeq, setMeasuredSeq] = React.useState(0);

    const isModalReady = isOpen && inputLayout !== null && !disabled && measuredSeq === openSeq;
    const androidDropdownVisualOffset = dropdownVisualOffset ?? getSelectorAndroidVisualOffset();

    const setInputLayoutIfChanged = React.useCallback((next: LayoutRectangle | null) => {
        setInputLayout((prev) => {
            if (next === null) return null;
            if (
                prev &&
                prev.x === next.x &&
                prev.y === next.y &&
                prev.width === next.width &&
                prev.height === next.height
            ) {
                return prev;
            }
            return next;
        });
    }, []);

    const measureNow = React.useCallback(() => {
        const node = fieldRef.current ?? containerRef.current;
        node?.measureInWindow((x, y, width, height) => {
            setInputLayoutIfChanged({ x, y, width, height });
        });
    }, [setInputLayoutIfChanged]);

    React.useEffect(() => {
        const raf = requestAnimationFrame(measureNow);
        return () => cancelAnimationFrame(raf);
    }, [measureNow]);

    // Get selected label
    const selectedLabel = React.useMemo(() => {
        if (!selectedValue) return '';
        return String(selectedValue);
    }, [selectedValue]);

    // Filtered options
    const filteredOptions = React.useMemo(() => {
        const query = searchText.trim();
        if (!query) return options;
        return options.filter((option) => option.label.startsWith(query));
    }, [searchText, options]);

    // Open dropdown
    const openDropdown = React.useCallback(() => {
        if (disabled) return;
        if (isOpen) return;
        const nextSeq = openSeqRef.current + 1;
        openSeqRef.current = nextSeq;
        setOpenSeq(nextSeq);
        setMeasuredSeq(0);
        setInputLayoutIfChanged(null);
        setSearchText('');
        setIsOpen(true);
        // Measure fresh every open to avoid using stale cached coordinates (prevents "jump up").
        const node = fieldRef.current ?? containerRef.current;
        node?.measureInWindow((x, y, width, height) => {
            setInputLayoutIfChanged({ x, y, width, height });
            setMeasuredSeq(nextSeq);
        });
    }, [disabled, isOpen, setInputLayoutIfChanged]);

    React.useEffect(() => {
        if (!isOpen || disabled) return;
        const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
            setKeyboardHeight(e.endCoordinates?.height ?? 0);
        });
        const hideSub = Keyboard.addListener('keyboardDidHide', () => {
            setKeyboardHeight(0);
        });
        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, [disabled, isOpen, measureNow]);

    // Focus input when modal is actually mounted so the keyboard appears on first tap.
    React.useEffect(() => {
        if (!isModalReady) return;
        const animationFrameId = requestAnimationFrame(() => searchInputRef.current?.focus());
        const timeoutId = setTimeout(() => searchInputRef.current?.focus(), 80);
        return () => {
            cancelAnimationFrame(animationFrameId);
            clearTimeout(timeoutId);
        };
    }, [isModalReady]);

    React.useEffect(() => {
        if (disabled && isOpen) {
            setIsOpen(false);
            setSearchText('');
            setKeyboardHeight(0);
            Keyboard.dismiss();
        }
    }, [disabled, isOpen]);

    // Close dropdown
    const closeDropdown = React.useCallback(() => {
        setIsOpen(false);
        setSearchText('');
        setKeyboardHeight(0);
        setMeasuredSeq(0);
        Keyboard.dismiss();
    }, []);

    // Select option
    const handleSelect = React.useCallback(
        (value: number, { preserveKeyboard = false }: { preserveKeyboard?: boolean } = {}) => {
            onSelect(value);
            setIsOpen(false);
            setSearchText('');
            setKeyboardHeight(0);
            setMeasuredSeq(0);
            if (!preserveKeyboard) {
                Keyboard.dismiss();
            }
            onSelectionComplete?.(value);
        },
        [onSelect, onSelectionComplete]
    );

    const handleSubmitSelection = React.useCallback(
        (_event: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => {
            const normalizedQuery = searchText.trim();
            const matchedOption = normalizedQuery
                ? filteredOptions[0]
                : options.find((option) => option.value === selectedValue);
            if (!matchedOption) return;
            handleSelect(matchedOption.value);
        },
        [filteredOptions, handleSelect, options, searchText, selectedValue]
    );

    React.useImperativeHandle(
        ref,
        () => ({
            openDropdown,
            closeDropdown,
        }),
        [closeDropdown, openDropdown]
    );

    const dropdownLayout = React.useMemo(() => {
        if (!inputLayout) return null;
        const margin = 6;
        const safeBottom = keyboardHeight ? keyboardHeight + 8 : 16;
        const spaceBelow = Math.max(0, windowHeight - safeBottom - (inputLayout.y + inputLayout.height) - margin);
        const spaceAbove = Math.max(0, inputLayout.y - 16);
        const shouldFlip = spaceBelow < 220 && spaceAbove > spaceBelow;
        const maxHeight = Math.max(160, Math.min(380, shouldFlip ? spaceAbove : spaceBelow));
        const top = shouldFlip
            ? Math.max(16, inputLayout.y + androidDropdownVisualOffset - maxHeight - margin)
            : inputLayout.y + inputLayout.height + margin + androidDropdownVisualOffset;
        return {
            inputTop: inputLayout.y + androidDropdownVisualOffset,
            inputLeft: inputLayout.x,
            inputWidth: inputLayout.width,
            inputHeight: inputLayout.height,
            listTop: top,
            listMaxHeight: maxHeight,
        };
    }, [androidDropdownVisualOffset, inputLayout, keyboardHeight, windowHeight]);

    return (
        <View
            ref={containerRef}
            onLayout={() => {
                if (!isOpen) measureNow();
            }}
        >
            {/* Display field. We hide it only when the modal overlay is ready, so it doesn't flicker blank. */}
            <Pressable
                onPressIn={openDropdown}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel="Select Verse"
            >
                <View
                    ref={fieldRef}
                    style={{
                        backgroundColor: fieldBackgroundColor,
                        borderWidth: 1,
                        borderColor: isOpen ? palette.tint : (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'),
                        borderRadius: 8,
                        opacity: disabled ? 0.5 : isModalReady ? 0 : 1,
                        ...(isOpen ? {
                            shadowColor: palette.tint,
                            shadowOpacity: 0.2,
                            shadowRadius: 4,
                            shadowOffset: { width: 0, height: 0 },
                            elevation: 2,
                        } : {}),
                    }}
                >
                    <Text
                        style={{
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                            fontSize: 14,
                            color: selectedLabel ? (isDark ? '#fff' : '#1a1a2e') : palette.muted,
                        }}
                        numberOfLines={1}
                    >
                        {selectedLabel || (disabled ? disabledPlaceholder : placeholder)}
                    </Text>
                </View>
            </Pressable>

            {/* Modal */}
            <Modal
                visible={isModalReady}
                transparent
                animationType="none"
                onRequestClose={closeDropdown}
                statusBarTranslucent
                hardwareAccelerated
                {...(Platform.OS === 'ios' ? { presentationStyle: 'overFullScreen' as const } : {})}
            >
                <View style={{ flex: 1 }}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={closeDropdown} />
                    {dropdownLayout ? (
                        <>
                            {/* Input overlay (focused). Must live inside the Modal so the keyboard shows reliably. */}
                            <View
                                style={{
                                    position: 'absolute',
                                    top: dropdownLayout.inputTop,
                                    left: dropdownLayout.inputLeft,
                                    width: dropdownLayout.inputWidth,
                                    height: dropdownLayout.inputHeight,
                                    backgroundColor: fieldBackgroundColor,
                                    borderWidth: 1,
                                    borderColor: palette.tint,
                                    borderRadius: 8,
                                    justifyContent: 'center',
                                    shadowColor: palette.tint,
                                    shadowOpacity: 0.25,
                                    shadowRadius: 6,
                                    shadowOffset: { width: 0, height: 0 },
                                    elevation: 4,
                                }}
                            >
                                <TextInput
                                    ref={searchInputRef}
                                    autoFocus
                                    value={searchText}
                                    onChangeText={(text) => setSearchText(text.replace(/[^\d]/g, ''))}
                                    onSubmitEditing={handleSubmitSelection}
                                    placeholder="Type verse..."
                                    placeholderTextColor={palette.muted}
                                    keyboardType="number-pad"
                                    autoCorrect={false}
                                    blurOnSubmit={false}
                                    returnKeyType={returnKeyType}
                                    style={{
                                        fontSize: 14,
                                        color: isDark ? '#fff' : '#1a1a2e',
                                        paddingHorizontal: 12,
                                        paddingVertical: Platform.OS === 'ios' ? 10 : 8,
                                    }}
                                />
                            </View>

                            {/* Dropdown List */}
                            <View
                                style={{
                                    position: 'absolute',
                                    top: dropdownLayout.listTop,
                                    left: dropdownLayout.inputLeft,
                                    width: dropdownLayout.inputWidth,
                                    backgroundColor: isDark ? '#1a1a2e' : '#ffffff',
                                    borderRadius: 12,
                                    borderWidth: 1,
                                    borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                                    shadowColor: '#000',
                                    shadowOffset: { width: 0, height: 8 },
                                    shadowOpacity: 0.12,
                                    shadowRadius: 20,
                                    elevation: 24,
                                    maxHeight: dropdownLayout.listMaxHeight,
                                    overflow: 'hidden',
                                }}
                            >
                                <FlatList
                                    data={filteredOptions}
                                    keyExtractor={(item) => String(item.value)}
                                    keyboardShouldPersistTaps="handled"
                                    keyboardDismissMode={Platform.OS === 'ios' ? 'on-drag' : 'none'}
                                    showsVerticalScrollIndicator
                                    onScrollBeginDrag={() => Keyboard.dismiss()}
                                    contentContainerStyle={{ paddingVertical: 8 }}
                                    ListEmptyComponent={
                                        <View style={{ paddingHorizontal: 16, paddingVertical: 24 }}>
                                            <Text style={{ color: palette.muted, fontSize: 14, textAlign: 'center' }}>
                                                No results found
                                            </Text>
                                        </View>
                                    }
                                    renderItem={({ item, index }) => {
                                        const isSelected = item.value === selectedValue;
                                        const isLast = index === filteredOptions.length - 1;
                                        return (
                                            <View
                                                style={{
                                                    paddingHorizontal: 16,
                                                    paddingVertical: 12,
                                                    backgroundColor: isSelected
                                                        ? (isDark ? 'rgba(79, 156, 141, 0.15)' : 'rgba(79, 156, 141, 0.08)')
                                                        : 'transparent',
                                                    ...(isLast
                                                        ? {}
                                                        : {
                                                            borderBottomWidth: 1,
                                                            borderBottomColor: isDark
                                                                ? 'rgba(255,255,255,0.04)'
                                                                : 'rgba(0,0,0,0.04)',
                                                        }),
                                                }}
                                            >
                                                <Pressable onPress={() => handleSelect(item.value)}>
                                                    <Text
                                                        numberOfLines={1}
                                                        style={{
                                                            fontSize: 15,
                                                            lineHeight: 22,
                                                            color: isSelected ? palette.tint : (isDark ? '#ffffff' : '#1a1a2e'),
                                                            fontWeight: isSelected ? '600' : '400',
                                                        }}
                                                    >
                                                        {item.label}
                                                    </Text>
                                                </Pressable>
                                            </View>
                                        );
                                    }}
                                />
                            </View>
                        </>
                    ) : null}
                </View>
            </Modal>
        </View>
    );
});
