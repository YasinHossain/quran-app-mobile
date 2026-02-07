import React from 'react';
import {
    Keyboard,
    LayoutRectangle,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';

import Colors from '@/constants/Colors';
import { useAppTheme } from '@/providers/ThemeContext';

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
};

export function VerseSelector({
    options,
    selectedValue,
    onSelect,
    disabled = false,
    placeholder = 'Select Verse',
    disabledPlaceholder = 'Select Surah first',
}: Props): React.JSX.Element {
    const { resolvedTheme, isDark } = useAppTheme();
    const palette = Colors[resolvedTheme];

    const [isOpen, setIsOpen] = React.useState(false);
    const [searchText, setSearchText] = React.useState('');
    const [inputLayout, setInputLayout] = React.useState<LayoutRectangle | null>(null);
    const searchInputRef = React.useRef<TextInput>(null);
    const containerRef = React.useRef<View>(null);

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

    // Measure on layout
    const handleLayout = React.useCallback(() => {
        containerRef.current?.measureInWindow((x, y, width, height) => {
            setInputLayout({ x, y, width, height });
        });
    }, []);

    // Open dropdown
    const openDropdown = React.useCallback(() => {
        if (disabled) return;
        containerRef.current?.measureInWindow((x, y, width, height) => {
            setInputLayout({ x, y, width, height });
        });
        setIsOpen(true);
        setSearchText('');
    }, [disabled]);

    // Focus input when modal opens
    React.useEffect(() => {
        if (isOpen) {
            const timer = setTimeout(() => {
                searchInputRef.current?.focus();
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    // Close dropdown
    const closeDropdown = React.useCallback(() => {
        setIsOpen(false);
        setSearchText('');
        Keyboard.dismiss();
    }, []);

    // Select option
    const handleSelect = React.useCallback(
        (value: number) => {
            onSelect(value);
            setIsOpen(false);
            setSearchText('');
            Keyboard.dismiss();
        },
        [onSelect]
    );

    return (
        <View ref={containerRef} onLayout={handleLayout}>
            {/* Display Field */}
            <Pressable onPress={openDropdown} disabled={disabled}>
                <View
                    style={{
                        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                        borderWidth: 1,
                        borderColor: isOpen ? palette.tint : (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'),
                        borderRadius: 8,
                        opacity: disabled ? 0.5 : 1,
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
                visible={isOpen && inputLayout !== null && !disabled}
                transparent
                animationType="none"
                onRequestClose={closeDropdown}
            >
                <Pressable style={{ flex: 1 }} onPress={closeDropdown}>
                    {inputLayout && (
                        <>
                            {/* Editable Input */}
                            <View
                                style={{
                                    position: 'absolute',
                                    top: inputLayout.y,
                                    left: inputLayout.x,
                                    width: inputLayout.width,
                                    height: inputLayout.height,
                                    backgroundColor: isDark ? 'rgba(42, 42, 62, 0.95)' : 'rgba(255,255,255,0.98)',
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
                                <Pressable onPress={(e) => e.stopPropagation()}>
                                    <TextInput
                                        ref={searchInputRef}
                                        value={searchText}
                                        onChangeText={(text) => setSearchText(text.replace(/[^\d]/g, ''))}
                                        placeholder="Type verse..."
                                        placeholderTextColor={palette.muted}
                                        keyboardType="number-pad"
                                        autoCorrect={false}
                                        style={{
                                            fontSize: 14,
                                            color: isDark ? '#fff' : '#1a1a2e',
                                            paddingHorizontal: 12,
                                            paddingVertical: Platform.OS === 'ios' ? 10 : 8,
                                        }}
                                    />
                                </Pressable>
                            </View>

                            {/* Dropdown List */}
                            <View
                                style={{
                                    position: 'absolute',
                                    top: inputLayout.y + inputLayout.height + 6,
                                    left: inputLayout.x,
                                    width: inputLayout.width,
                                    backgroundColor: isDark ? '#1a1a2e' : '#ffffff',
                                    borderRadius: 12,
                                    borderWidth: 1,
                                    borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                                    shadowColor: '#000',
                                    shadowOffset: { width: 0, height: 8 },
                                    shadowOpacity: 0.12,
                                    shadowRadius: 20,
                                    elevation: 24,
                                    maxHeight: 280,
                                    overflow: 'hidden',
                                }}
                            >
                                <Pressable onPress={(e) => e.stopPropagation()}>
                                    <ScrollView
                                        keyboardShouldPersistTaps="always"
                                        nestedScrollEnabled
                                        onScrollBeginDrag={() => Keyboard.dismiss()}
                                        showsVerticalScrollIndicator
                                    >
                                        {filteredOptions.length === 0 ? (
                                            <View style={{ paddingHorizontal: 16, paddingVertical: 24 }}>
                                                <Text style={{ color: palette.muted, fontSize: 14, textAlign: 'center' }}>
                                                    No results found
                                                </Text>
                                            </View>
                                        ) : (
                                            filteredOptions.map((option, index) => {
                                                const isSelected = option.value === selectedValue;
                                                const isLast = index === filteredOptions.length - 1;
                                                return (
                                                    <Pressable
                                                        key={option.value}
                                                        onPress={() => handleSelect(option.value)}
                                                        style={({ pressed }) => ({
                                                            paddingHorizontal: 16,
                                                            paddingVertical: 14,
                                                            flexDirection: 'row',
                                                            alignItems: 'center',
                                                            gap: 10,
                                                            backgroundColor: pressed
                                                                ? (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)')
                                                                : isSelected
                                                                    ? (isDark ? 'rgba(79, 156, 141, 0.1)' : 'rgba(79, 156, 141, 0.06)')
                                                                    : 'transparent',
                                                            borderBottomWidth: isLast ? 0 : 0.5,
                                                            borderBottomColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)',
                                                        })}
                                                    >
                                                        {isSelected && (
                                                            <View
                                                                style={{
                                                                    width: 6,
                                                                    height: 6,
                                                                    borderRadius: 3,
                                                                    backgroundColor: palette.tint,
                                                                }}
                                                            />
                                                        )}
                                                        <Text
                                                            numberOfLines={1}
                                                            style={{
                                                                flex: 1,
                                                                fontSize: 15,
                                                                color: isSelected ? palette.tint : (isDark ? '#e8e8e8' : '#2a2a3e'),
                                                                fontWeight: isSelected ? '600' : '400',
                                                                marginLeft: isSelected ? 0 : 16,
                                                            }}
                                                        >
                                                            {option.label}
                                                        </Text>
                                                    </Pressable>
                                                );
                                            })
                                        )}
                                    </ScrollView>
                                </Pressable>
                            </View>
                        </>
                    )}
                </Pressable>
            </Modal>
        </View>
    );
}
