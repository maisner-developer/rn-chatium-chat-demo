import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

interface ChatInputProps {
  onSend: (text: string) => Promise<void>;
  onTyping?: () => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, onTyping, disabled }: ChatInputProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');

  const handleSend = useCallback(async () => {
    if (!text.trim() || sending || disabled) return;

    setSending(true);
    try {
      await onSend(text.trim());
      setText('');
    } finally {
      setSending(false);
    }
  }, [text, sending, disabled, onSend]);

  const handleChangeText = useCallback((newText: string) => {
    setText(newText);
    onTyping?.();
  }, [onTyping]);

  return (
    <View style={styles.container}>
      <TextInput
        style={[styles.input, { backgroundColor, color: textColor }]}
        placeholder="Сообщение..."
        placeholderTextColor="rgba(128, 128, 128, 0.6)"
        value={text}
        onChangeText={handleChangeText}
        multiline
        maxLength={4000}
        editable={!disabled && !sending}
      />
      <TouchableOpacity
        style={[styles.sendButton, (!text.trim() || sending || disabled) && styles.sendButtonDisabled]}
        onPress={handleSend}
        disabled={!text.trim() || sending || disabled}
      >
        {sending ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <ThemedText style={styles.sendButtonText}>→</ThemedText>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(128, 128, 128, 0.2)',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    fontSize: 16,
    marginRight: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: 'rgba(0, 122, 255, 0.4)',
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
});
