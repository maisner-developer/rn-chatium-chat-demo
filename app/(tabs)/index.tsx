import { ChatInput } from '@/components/chat/ChatInput';
import { ChatMessage } from '@/components/chat/ChatMessage';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useChat } from '@/hooks/use-chat';
import type { ChatConfig, ChatMessage as ChatMessageType } from '@/types/chat';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const API_URL = 'https://buhuber.chatium.ru/chat-demo/rn-api/get-chat';
const COOKIE = 'at-3811=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjdESmpRME9NNmhmaHppQk1pZWUwYnVodWIiLCJpYXQiOjE3NjcyODU5MDZ9.7iiUHdDXZHDG2GCxxNMNSW9rqQKjTwCa-I_5RLaT-jw';

export default function ChatScreen() {
  const [chatConfig, setChatConfig] = useState<ChatConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const {
    messages,
    loading,
    error,
    sendMessage,
    loadMoreMessages,
    hasMoreMessages,
    typingNames,
    updateTyping,
  } = useChat({ chatConfig, cookie: COOKIE });

  // Загрузка конфигурации чата
  const loadChatConfig = useCallback(async () => {
    setConfigLoading(true);
    setConfigError(null);

    try {
      const response = await fetch(API_URL, {
        method: 'GET',
        headers: {
          Cookie: COOKIE,
        },
        credentials: "omit",
      });

      const data = await response.json();
      console.log('Chat config response:', JSON.stringify(data, null, 2));

      if (data.success && data.chat) {
        setChatConfig(data as ChatConfig);
      } else {
        setConfigError(`Ответ: ${JSON.stringify(data)}`);
      }
    } catch (err) {
      setConfigError(String(err));
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChatConfig();
  }, [loadChatConfig]);

  // Рендер сообщения
  const renderMessage = useCallback(({ item }: { item: ChatMessageType }) => {
    const isOwn = item.author?.id === chatConfig?.chat.current_author?.id || item.isOutgoing;
    return <ChatMessage message={item} isOwn={!!isOwn} />;
  }, [chatConfig]);

  // Ключ для элемента списка
  const keyExtractor = useCallback((item: ChatMessageType) => item.id, []);

  // Разделитель между сообщениями
  const ItemSeparator = useCallback(() => <View style={styles.separator} />, []);

  // Индикатор загрузки старых сообщений
  const ListFooterComponent = useCallback(() => {
    if (!hasMoreMessages) return null;
    return (
      <View style={styles.loadingMore}>
        <ActivityIndicator size="small" />
      </View>
    );
  }, [hasMoreMessages]);

  // Typing indicator
  const TypingIndicator = useCallback(() => {
    if (typingNames.length === 0) return null;
    return (
      <View style={styles.typingContainer}>
        <ThemedText style={styles.typingText}>
          {typingNames.join(', ')} {typingNames.length === 1 ? 'печатает' : 'печатают'}...
        </ThemedText>
      </View>
    );
  }, [typingNames]);

  // Загрузка конфигурации
  if (configLoading) {
    return (
      <ThemedView style={styles.centerContainer}>
        <ActivityIndicator size="large" />
        <ThemedText style={styles.loadingText}>Загрузка чата...</ThemedText>
      </ThemedView>
    );
  }

  // Ошибка загрузки конфигурации
  if (configError || !chatConfig) {
    return (
      <ThemedView style={styles.centerContainer}>
        <ThemedText style={styles.errorText}>Ошибка: {configError}</ThemedText>
      </ThemedView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ThemedView style={styles.header}>
          <ThemedText type="subtitle">Чат</ThemedText>
          {chatConfig.chat.current_author && (
            <ThemedText style={styles.authorInfo}>
              Вы: {chatConfig.chat.current_author.name}
            </ThemedText>
          )}
        </ThemedView>

        {error && (
          <View style={styles.errorBanner}>
            <ThemedText style={styles.errorBannerText}>{error}</ThemedText>
          </View>
        )}

        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={keyExtractor}
          ItemSeparatorComponent={ItemSeparator}
          ListFooterComponent={ListFooterComponent}
          inverted={chatConfig.chat.render_inverted}
          contentContainerStyle={styles.messagesList}
          onEndReached={loadMoreMessages}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              refreshing={loading && messages.length > 0}
              onRefresh={loadChatConfig}
            />
          }
          ListEmptyComponent={
            loading ? (
              <View style={styles.emptyContainer}>
                <ActivityIndicator size="large" />
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <ThemedText style={styles.emptyText}>Нет сообщений</ThemedText>
              </View>
            )
          }
        />

        <TypingIndicator />

        <ChatInput
          onSend={sendMessage}
          onTyping={updateTyping}
          disabled={!chatConfig.chat.messages_add_url}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128, 128, 128, 0.2)',
  },
  authorInfo: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 4,
  },
  loadingText: {
    marginTop: 12,
    opacity: 0.6,
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: 'rgba(255, 0, 0, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  errorBannerText: {
    color: 'red',
    fontSize: 12,
  },
  messagesList: {
    paddingVertical: 8,
  },
  separator: {
    height: 2,
  },
  loadingMore: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  typingContainer: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  typingText: {
    fontSize: 12,
    fontStyle: 'italic',
    opacity: 0.6,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    opacity: 0.5,
  },
});
