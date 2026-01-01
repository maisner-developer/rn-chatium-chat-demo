import type {
  ChangesResponse,
  ChatChange,
  ChatConfig,
  ChatMessage,
  MessageAddResponse,
  MessagesGetResponse,
} from '@/types/chat';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SocketStore } from '../Lib/chatium-socket/SocketClient';

// Простой генератор ID без nanoid
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// Глобальный singleton SocketStore
let globalSocketStore: SocketStore | null = null;
let globalSocketInitialized = false;

function getSocketStore(): SocketStore {
  if (!globalSocketStore) {
    console.log('[SocketStore] Creating new SocketStore instance');
    globalSocketStore = new SocketStore({ baseURL: 'https://app.msk.chatium.io/' });
  }
  
  // Инициализируем соединение один раз
  if (!globalSocketInitialized) {
    globalSocketInitialized = true;
    console.log('[SocketStore] Initializing connection to https://app.msk.chatium.io/');
    globalSocketStore.setBaseURL('https://app.msk.chatium.io/');
    
    // Добавляем обработчики для отладки
    if (globalSocketStore._io) {
      globalSocketStore._io.on('connect', () => {
        console.log('[SocketStore] Connected!');
      });
      globalSocketStore._io.on('disconnect', (reason: string) => {
        console.log('[SocketStore] Disconnected:', reason);
      });
      globalSocketStore._io.on('error', (error: unknown) => {
        console.log('[SocketStore] Error:', error);
      });
      globalSocketStore._io.on('connect_error', (error: unknown) => {
        console.log('[SocketStore] Connect error:', error);
      });
    }
  }
  
  return globalSocketStore;
}

interface UseChatOptions {
  chatConfig: ChatConfig | null;
  cookie: string;
}

interface UseChatReturn {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  sendMessage: (text: string) => Promise<void>;
  loadMoreMessages: () => Promise<void>;
  hasMoreMessages: boolean;
  typingNames: string[];
  updateTyping: () => void;
  refresh: () => Promise<void>;
  markAsRead: (message: ChatMessage) => Promise<void>;
  isUpdating: boolean;
  lastReadAt: number | null;
  getMessageStatus: (message: ChatMessage) => 'sent' | 'read' | null;
}

export function useChat({ chatConfig, cookie }: UseChatOptions): UseChatReturn {
  // === State ===
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastReadAt, setLastReadAt] = useState<number | null>(null);

  // === Refs (как в референсе - для хранения состояния без ре-рендеров) ===
  const lastChangeIdRef = useRef<string | null>(null);
  const lastMarkAsReadIdRef = useRef<string | null>(null);
  const lastMessageIdRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const messagesByIdRef = useRef<Map<string, ChatMessage>>(new Map());
  const sentMessagesRef = useRef<Map<string, ChatMessage>>(new Map());
  const firstMessagesPageLoadedRef = useRef(false);
  const typingSubscriptionRef = useRef<{ updateTyping: () => void; listen: (cb: (names: string[]) => void) => () => void } | null>(null);

  // Для триггера ре-рендера при изменении сообщений
  const [messagesVersion, setMessagesVersion] = useState(0);

  // === Computed messages (как в референсе - объединяем sent + loaded) ===
  const messages = useMemo(() => {
    // Триггер пересчёта при изменении версии
    void messagesVersion;

    const result: ChatMessage[] = [];
    const existsMessageIds = new Set<string>();

    // Сначала добавляем отправленные сообщения (они в начале списка)
    const sentMessagesArray = [...sentMessagesRef.current.values()];
    for (let i = sentMessagesArray.length - 1; i >= 0; i--) {
      const msg = sentMessagesArray[i];
      if (!existsMessageIds.has(msg.id)) {
        existsMessageIds.add(msg.id);
        result.push(msg);
      }
    }

    // Затем добавляем загруженные сообщения
    for (const msg of messagesRef.current) {
      if (!existsMessageIds.has(msg.id)) {
        existsMessageIds.add(msg.id);
        result.push(msg);
      }
    }

    return result;
  }, [messagesVersion]);

  // === Функция обновления состояния сообщений ===
  const updateMessagesState = useCallback(() => {
    setMessagesVersion(v => v + 1);
  }, []);

  // === Загрузка сообщений (как _loadMessages в референсе) ===
  const loadMessages = useCallback(
    async (pageWith?: string, sliceBefore?: number, sliceAfter?: number): Promise<MessagesGetResponse['data'] | null> => {
      if (!chatConfig) {
        return null;
      }

      try {
        const params = new URLSearchParams();
        if (pageWith) params.append('pageWith', pageWith);
        if (sliceBefore) params.append('sliceBefore', String(sliceBefore));
        if (sliceAfter) params.append('sliceAfter', String(sliceAfter));

        const url = `${chatConfig.chat.messages_get_url}${params.toString() ? '?' + params.toString() : ''}`;

        const response = await fetch(url, {
          method: 'GET',
          headers: { Cookie: cookie },
          credentials: 'omit',
        });

        const data = (await response.json()) as MessagesGetResponse;

        if (data.success && data.data) {
          return data.data;
        }
        return null;
      } catch (err) {
        console.error('loadMessages error:', err);
        setError(String(err));
        return null;
      }
    },
    [chatConfig, cookie],
  );

  // === Обработка новых сообщений (как _processNewMessages в референсе) ===
  const processNewMessages = useCallback(
    (newMessagesData: MessagesGetResponse['data'], pageWith?: string, sliceBefore?: number, sliceAfter?: number): boolean => {
      if (!newMessagesData) return false;

      const newMessages = newMessagesData.messages || [];
      const lastChangeId = newMessagesData.lastChangeId || null;

      if (newMessages.length === 0) return false;

      const indexOfPageWith = pageWith ? newMessages.findIndex(m => m.id === pageWith) : null;
      if (indexOfPageWith === -1) return false;

      // Определяем тип добавления
      let addType: 'append' | 'prepend' | 'replace';
      if (messagesRef.current.length === 0) {
        addType = 'append';
      } else if (!pageWith) {
        if (messagesByIdRef.current.has(newMessages[newMessages.length - 1].id)) {
          addType = 'prepend';
        } else {
          addType = 'replace';
        }
      } else if (messagesRef.current[0]?.id === pageWith && sliceAfter) {
        addType = 'prepend';
      } else if (messagesRef.current[messagesRef.current.length - 1]?.id === pageWith && sliceBefore) {
        addType = 'append';
      } else if (pageWith) {
        addType = 'replace';
      } else {
        addType = 'replace';
      }

      // Обновляем firstMessagesPageLoaded
      if (firstMessagesPageLoadedRef.current && pageWith && sliceBefore && !sliceAfter) {
        firstMessagesPageLoadedRef.current =
          messagesRef.current.length > 0 &&
          messagesRef.current[messagesRef.current.length - 1].id === pageWith;
      } else {
        firstMessagesPageLoadedRef.current = !pageWith || (!!sliceAfter && (indexOfPageWith ?? 0) + 1 < sliceAfter);
      }

      // Если replace - очищаем
      if (addType === 'replace') {
        messagesByIdRef.current.clear();
        messagesRef.current = [];
        addType = 'append';
      }

      // Добавляем сообщения
      const updateMessages = new Set<string>();
      for (let i = 0; i < newMessages.length; i++) {
        const message = newMessages[addType === 'append' ? i : newMessages.length - i - 1];
        if (message.id) {
          const existsMessage = messagesByIdRef.current.get(message.id);
          if (existsMessage && JSON.stringify(existsMessage) !== JSON.stringify(message)) {
            updateMessages.add(message.id);
            messagesByIdRef.current.set(message.id, message);
          } else if (!existsMessage) {
            messagesByIdRef.current.set(message.id, message);
            sentMessagesRef.current.delete(message.id);
            if (addType === 'append') {
              messagesRef.current.push(message);
            } else {
              messagesRef.current.unshift(message);
            }
          }
        }
      }

      // Обновляем изменённые сообщения в массиве
      if (updateMessages.size > 0) {
        for (let i = 0; i < messagesRef.current.length; i++) {
          const msgId = messagesRef.current[i].id;
          if (updateMessages.has(msgId)) {
            messagesRef.current[i] = messagesByIdRef.current.get(msgId)!;
          }
        }
      }

      // Обновляем lastMessageId
      if (firstMessagesPageLoadedRef.current && messagesRef.current.length > 0) {
        lastMessageIdRef.current = messagesRef.current[0].id;
      }

      if (lastChangeId) {
        lastChangeIdRef.current = lastChangeId;
      }

      return true;
    },
    [],
  );

  // === Загрузка свежего состояния (как _doLoadFreshState) ===
  const loadFreshState = useCallback(async () => {
    if (!chatConfig) return;

    setLoading(true);
    setError(null);

    try {
      // Определяем с какого сообщения грузить
      const lastReadMessageId = chatConfig.chat.last_read_message_id;
      let pageWith: string | undefined;
      let sliceBefore: number | undefined;
      let sliceAfter: number | undefined;

      if (lastReadMessageId) {
        pageWith = lastReadMessageId;
        sliceBefore = 100;
        sliceAfter = 100;
      }

      const newMessagesData = await loadMessages(pageWith, sliceBefore, sliceAfter);

      // Обновляем метаданные из конфига
      lastMarkAsReadIdRef.current = chatConfig.chat.last_read_message_id || null;
      lastMessageIdRef.current = chatConfig.chat.last_message_id || null;
      if (chatConfig.chat.last_read_at) {
        setLastReadAt(chatConfig.chat.last_read_at);
      }

      // Очищаем и обрабатываем новые сообщения
      messagesRef.current = [];
      messagesByIdRef.current.clear();
      firstMessagesPageLoadedRef.current = false;
      lastChangeIdRef.current = null;

      if (newMessagesData) {
        processNewMessages(newMessagesData, pageWith, sliceBefore, sliceAfter);
        setHasMoreMessages(chatConfig.chat.support_paging && messagesRef.current.length > 0);
      }

      updateMessagesState();
    } catch (err) {
      console.error('loadFreshState error:', err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [chatConfig, loadMessages, processNewMessages, updateMessagesState]);

  // === Загрузка обновлений через changes (как loadUpdates в референсе) ===
  const loadChanges = useCallback(async () => {
    if (!chatConfig) return;

    // Если нет lastChangeId - грузим всё заново
    if (!lastChangeIdRef.current || !chatConfig.chat.messages_changes_url) {
      await loadFreshState();
      return;
    }

    setIsUpdating(true);

    try {
      const url = `${chatConfig.chat.messages_changes_url}?lastKnownChangeId=${lastChangeIdRef.current}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: { Cookie: cookie },
        credentials: 'omit',
      });

      const data = (await response.json()) as ChangesResponse;

      // Если ошибка too-old-update-id или неуспех - перезагружаем всё
      if (!data.success || (data.error && (data.error as { code?: string }).code === 'too-old-update-id')) {
        await loadFreshState();
        return;
      }

      // Обрабатываем changes (как в референсе)
      if (data.changes && Array.isArray(data.changes) && data.changes.length > 0) {
        let lastChangeId: string | null = null;

        for (const change of data.changes as ChatChange[]) {
          lastChangeId = change.id;

          if (change.operation === 'create' && change.message) {
            // Новое сообщение
            const message = change.message;
            lastMessageIdRef.current = message.id;
            messagesByIdRef.current.set(message.id, message);
            if (firstMessagesPageLoadedRef.current) {
              messagesRef.current.unshift(message);
            }
            sentMessagesRef.current.delete(message.id);
          } else if (change.operation === 'update' && change.message) {
            // Обновление сообщения
            messagesByIdRef.current.set(change.message.id, change.message);
            const idx = messagesRef.current.findIndex(m => m.id === change.message!.id);
            if (idx !== -1) {
              messagesRef.current[idx] = change.message;
            }
          } else if (change.operation === 'delete' && change.messageId) {
            // Удаление сообщения
            messagesByIdRef.current.delete(change.messageId);
            messagesRef.current = messagesRef.current.filter(m => m.id !== change.messageId);
          }
        }

        if (lastChangeId) {
          lastChangeIdRef.current = lastChangeId;
        }

        updateMessagesState();
      }
    } catch (err) {
      console.error('loadChanges error:', err);
      // При ошибке перезагружаем всё
      await loadFreshState();
    } finally {
      setIsUpdating(false);
    }
  }, [chatConfig, cookie, loadFreshState, updateMessagesState]);

  // === Отправка сообщения (как sendMessage в референсе) ===
  const sendMessage = useCallback(
    async (text: string) => {
      if (!chatConfig || !text.trim()) return;

      const messageId = generateId();

      // Временное сообщение для оптимистичного UI
      const tempMessage: ChatMessage = {
        id: messageId,
        type: 'message',
        text: text.trim(),
        textTokens: [text.trim()],
        createdAt: Date.now(),
        createdAtTimestamp: Math.floor(Date.now() / 1000),
        updatedAt: Date.now(),
        updatedAtTimestamp: Math.floor(Date.now() / 1000),
        author: chatConfig.chat.current_author,
        isOutgoing: true,
        canEdit: true,
        bgColor: null,
        files: [],
        replyTo: null,
        reactions: null,
        sticker: null,
        data: null,
      };

      // Оптимистичное добавление в sentMessages (как в референсе)
      sentMessagesRef.current.set(messageId, tempMessage);
      updateMessagesState();

      try {
        const response = await fetch(chatConfig.chat.messages_add_url, {
          method: 'POST',
          headers: {
            Cookie: cookie,
            'Content-Type': 'application/json',
          },
          credentials: 'omit',
          body: JSON.stringify({
            id: messageId,
            text: text.trim(),
            replyTo: null,
            files: [],
            sticker: null,
          }),
        });

        const data = (await response.json()) as MessageAddResponse;

        if (data.success && data.data?.added) {
          const added = data.data.added;
          // Обновляем sent message на подтверждённое
          sentMessagesRef.current.set(added.id, added);
          lastMarkAsReadIdRef.current = added.id;
          lastMessageIdRef.current = added.id;
          updateMessagesState();

          // Загружаем обновления
          void loadChanges();
        }
      } catch (err) {
        // Убираем временное сообщение при ошибке
        sentMessagesRef.current.delete(messageId);
        updateMessagesState();
        setError(String(err));
      }
    },
    [chatConfig, cookie, loadChanges, updateMessagesState],
  );

  // === Загрузка дополнительных сообщений (как loadNextPage в референсе) ===
  const loadMoreMessages = useCallback(async () => {
    if (!chatConfig || messagesRef.current.length === 0 || loading) return;
    if (!chatConfig.chat.support_paging) return;

    setLoading(true);
    try {
      const lastMessage = messagesRef.current[messagesRef.current.length - 1];
      const beforeCount = messagesRef.current.length;

      const newMessagesData = await loadMessages(lastMessage.id, 50);
      if (newMessagesData) {
        processNewMessages(newMessagesData, lastMessage.id, 50);
        setHasMoreMessages(messagesRef.current.length - beforeCount >= 50);
        updateMessagesState();
      }
    } finally {
      setLoading(false);
    }
  }, [chatConfig, loading, loadMessages, processNewMessages, updateMessagesState]);

  // === Mark as read (как markAsRead в референсе) ===
  const markAsRead = useCallback(
    async (message: ChatMessage) => {
      if (!chatConfig?.chat.mark_as_read_url) return;

      // Проверяем, не помечено ли уже
      const lastMarkAsRead = lastMarkAsReadIdRef.current
        ? messagesByIdRef.current.get(lastMarkAsReadIdRef.current)
        : null;

      if (lastMarkAsRead?.id === message.id) return;
      if (message.createdAt && lastMarkAsRead?.createdAt && message.createdAt < lastMarkAsRead.createdAt) return;

      lastMarkAsReadIdRef.current = message.id;

      try {
        await fetch(chatConfig.chat.mark_as_read_url, {
          method: 'POST',
          headers: {
            Cookie: cookie,
            'Content-Type': 'application/json',
          },
          credentials: 'omit',
          body: JSON.stringify({ messageId: message.id }),
        });

        if (lastChangeIdRef.current) {
          await loadChanges();
        }
      } catch (err) {
        console.error('markAsRead error:', err);
      }
    },
    [chatConfig, cookie, loadChanges],
  );

  // === Typing (как updateTyping в референсе) ===
  const updateTyping = useCallback(() => {
    if (typingSubscriptionRef.current) {
      typingSubscriptionRef.current.updateTyping();
    }
  }, []);

  // === Get message status (как getMessageStatus в референсе) ===
  const getMessageStatus = useCallback(
    (message: ChatMessage): 'sent' | 'read' | null => {
      if (message && message.isOutgoing) {
        if (message.createdAt && lastReadAt) {
          if (message.createdAt > lastReadAt) {
            return 'sent';
          } else {
            return 'read';
          }
        }
      }
      return null;
    },
    [lastReadAt],
  );

  // === Ручное обновление ===
  const refresh = useCallback(async () => {
    await loadChanges();
  }, [loadChanges]);

  // === Первичная загрузка сообщений ===
  useEffect(() => {
    if (chatConfig) {
      void loadFreshState();
    }
  }, [chatConfig, loadFreshState]);

  // === Подключение к сокетам (как в референсе - используем глобальный socketStore) ===
  useEffect(() => {
    if (!chatConfig) return;

    // Получаем глобальный socketStore
    const socketStore = getSocketStore();
    const messagesSocketId = chatConfig.chat.messages_socket_id;
    const lastReadSocketId = chatConfig.chat.last_read_socket_id;
    const typingSocketData = chatConfig.chat.typing_socket_data;

    console.log('[useChat] Setting up sockets:');
    console.log('  - messagesSocketId:', messagesSocketId);
    console.log('  - lastReadSocketId:', lastReadSocketId);
    console.log('  - typingSocketData:', typingSocketData);
    console.log('  - socketStore._io connected:', socketStore._io?.connected);

    const disposers: (() => void)[] = [];

    // Подписка на обновления сообщений
    if (messagesSocketId) {
      console.log('[useChat] Subscribing to messages socket:', messagesSocketId);
      const unsubscribe = socketStore.subscribeToSocket(messagesSocketId, () => {
        console.log('[useChat] Messages socket event received');
        void loadChanges();
      });
      disposers.push(unsubscribe);
    }

    // Подписка на last_read обновления
    if (lastReadSocketId) {
      const unsubscribe = socketStore.subscribeToSocket(lastReadSocketId, async () => {
        console.log('[useChat] LastRead socket event received');
        // Обновляем lastReadAt
        if (chatConfig.chat.last_read_get_url) {
          try {
            const response = await fetch(chatConfig.chat.last_read_get_url, {
              method: 'GET',
              headers: { Cookie: cookie },
              credentials: 'omit',
            });
            const data = await response.json();
            if (data.success && data.data?.lastReadAt) {
              setLastReadAt(data.data.lastReadAt);
            }
          } catch (err) {
            console.error('Failed to fetch lastReadAt:', err);
          }
        }
      });
      disposers.push(unsubscribe);
    }

    // Подписка на typing
    if (typingSocketData) {
      const subscription = socketStore.subscribeToTyping(typingSocketData);
      typingSubscriptionRef.current = subscription;
      const unsubscribe = subscription.listen((names: string[]) => {
        setTypingNames(names);
      });
      disposers.push(unsubscribe);
    }

    return () => {
      disposers.forEach(dispose => dispose());
      typingSubscriptionRef.current = null;
    };
  }, [chatConfig, cookie, loadChanges]);

  return {
    messages,
    loading,
    error,
    sendMessage,
    loadMoreMessages,
    hasMoreMessages,
    typingNames,
    updateTyping,
    refresh,
    markAsRead,
    isUpdating,
    lastReadAt,
    getMessageStatus,
  };
}
