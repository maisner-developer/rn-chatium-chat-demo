import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { ChatMessage as ChatMessageType } from '@/types/chat';
import React, { memo } from 'react';
import { Image, StyleSheet, View } from 'react-native';

interface ChatMessageProps {
  message: ChatMessageType;
  isOwn: boolean;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export const ChatMessage = memo(function ChatMessage({ message, isOwn }: ChatMessageProps) {
  const avatarUrl = message.author?.avatar?.image || message.author?.avatar?.url;

  return (
    <View style={[styles.container, isOwn ? styles.ownContainer : styles.otherContainer]}>
      {!isOwn && avatarUrl && <Image source={{ uri: avatarUrl }} style={styles.avatar} />}
      {!isOwn && !avatarUrl && <View style={styles.avatarPlaceholder} />}
      <ThemedView style={[styles.bubble, isOwn ? styles.ownBubble : styles.otherBubble]}>
        {!isOwn && message.author?.name && (
          <ThemedText style={styles.authorName}>{message.author.name}</ThemedText>
        )}
        {message.text && (
          <ThemedText style={[styles.messageText, isOwn && styles.ownMessageText]}>
            {message.text}
          </ThemedText>
        )}
        <ThemedText style={[styles.timestamp, isOwn && styles.ownTimestamp]}>
          {formatTime(message.createdAt)}
        </ThemedText>
      </ThemedView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginVertical: 4,
    marginHorizontal: 12,
    alignItems: 'flex-end',
  },
  ownContainer: {
    justifyContent: 'flex-end',
  },
  otherContainer: {
    justifyContent: 'flex-start',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    marginRight: 8,
  },
  bubble: {
    maxWidth: '75%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  ownBubble: {
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    backgroundColor: 'rgba(128, 128, 128, 0.2)',
    borderBottomLeftRadius: 4,
  },
  authorName: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
    color: '#007AFF',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  ownMessageText: {
    color: '#FFFFFF',
  },
  timestamp: {
    fontSize: 11,
    marginTop: 4,
    opacity: 0.6,
    alignSelf: 'flex-end',
  },
  ownTimestamp: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
});
