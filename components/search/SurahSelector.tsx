import React from 'react';
import {
    FlatList,
    Keyboard,
    LayoutRectangle,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    useWindowDimensions,
    Text,
    TextInput,
    View,
} from 'react-native';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

type SurahOption = {
    value: number;
    label: string;
    searchLabel: string;
};

type Props = {
    options: SurahOption[];
    selectedValue: number | undefined;
    onSelect: (value: number) => void;
    placeholder?: string;
};

export function SurahSelector({
    options,
    selectedValue,
    onSelect,
    placeholder = 'Select Surah',
}: Props): React.JSX.Element {
    const { resolvedTheme, isDark } = useAppTheme();
    const palette = Colors[resolvedTheme];
    const { height: windowHeight } = useWindowDimensions();

    const [isOpen, setIsOpen] = React.useState(false);
    const [searchText, setSearchText] = React.useState('');
    const [inputLayout, setInputLayout] = React.useState<LayoutRectangle | null>(null);
    const [keyboardHeight, setKeyboardHeight] = React.useState(0);
    const searchInputRef = React.useRef<TextInput>(null);
    const containerRef = React.useRef<View>(null);

    const isModalReady = isOpen && inputLayout !== null;

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
        containerRef.current?.measureInWindow((x, y, width, height) => {
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
        const option = options.find((o) => o.value === selectedValue);
        return option?.label ?? `Surah ${selectedValue}`;
    }, [options, selectedValue]);

    // Filtered options
    const filteredOptions = React.useMemo(() => {
        const query = searchText.trim().toLowerCase();
        if (!query) return options;
        return options.filter((option) => {
            const idMatch = String(option.value).startsWith(query);
            const labelMatch = option.searchLabel.includes(query);
            return idMatch || labelMatch;
        });
    }, [searchText, options]);

    const openDropdown = React.useCallback(() => {
        if (isOpen) return;
        setSearchText('');
        setIsOpen(true);
        measureNow();
    }, [isOpen, measureNow]);

    React.useEffect(() => {
        if (!isOpen) return;
        measureNow();
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
    }, [isOpen, measureNow]);

    // Focus input when modal opens
    React.useEffect(() => {
        if (!isOpen) return;
        const id = requestAnimationFrame(() => searchInputRef.current?.focus());
        return () => cancelAnimationFrame(id);
    }, [isOpen]);

    // Close dropdown
    const closeDropdown = React.useCallback(() => {
        setIsOpen(false);
        setSearchText('');
        setKeyboardHeight(0);
        Keyboard.dismiss();
    }, []);

    // Select option
    const handleSelect = React.useCallback(
        (value: number) => {
            onSelect(value);
            setIsOpen(false);
            setSearchText('');
            setKeyboardHeight(0);
            Keyboard.dismiss();
        },
        [onSelect]
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
            ? Math.max(16, inputLayout.y - maxHeight - margin)
            : inputLayout.y + inputLayout.height + margin;
        return {
            inputTop: inputLayout.y,
            inputLeft: inputLayout.x,
            inputWidth: inputLayout.width,
            inputHeight: inputLayout.height,
            listTop: top,
            listMaxHeight: maxHeight,
        };
    }, [inputLayout, keyboardHeight, windowHeight]);

    return (
        <View ref={containerRef} onLayout={measureNow}>
            {/* Display field. We hide it only when the modal overlay is ready, so it doesn't flicker blank. */}
            <Pressable onPressIn={openDropdown} accessibilityRole="button" accessibilityLabel="Select Surah">
                <View
                    style={{
                        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                        borderWidth: 1,
                        borderColor: isOpen ? palette.tint : (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'),
                        borderRadius: 8,
                        opacity: isModalReady ? 0 : 1,
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
                        {selectedLabel || placeholder}
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
                                    backgroundColor: isDark ? '#1a1a2e' : '#ffffff',
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
                                    value={searchText}
                                    onChangeText={setSearchText}
                                    placeholder="Type to search..."
                                    placeholderTextColor={palette.muted}
                                    autoCorrect={false}
                                    autoCapitalize="none"
                                    style={{
                                        fontSize: 14,
                                        color: isDark ? '#fff' : '#1a1a2e',
                                        paddingHorizontal: 12,
                                        paddingVertical: 10,
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
}
