// Типы для чата Chatium

export interface ChatConfig {
  success: boolean;
  chat: {
    messages_get_url: string;
    messages_add_url: string;
    messages_edit_url: string;
    messages_delete_url: string;
    messages_changes_url: string;
    messages_react_url: string;
    on_context_api_call_url: string;
    mark_as_read_url: string;
    last_read_get_url: string;
    support_paging: boolean;
    files_put_url: string;
    reply_quotes_enabled: boolean;
    current_author: ChatAuthor;
    group_author: ChatAuthor | null;
    messages_socket_id: string;
    reactions_socket_id: string;
    last_read_at: number;
    last_read_socket_id: string;
    last_message_id: string;
    last_read_message_id: string | null;
    typing_socket_data: {
      id: string;
      name: string;
      uid: string;
    };
    pinned: Record<string, unknown>;
    render_inverted: boolean;
  };
}

export interface ChatAuthor {
  id: string;
  name: string;
  avatar: {
    image?: string;
    url?: string;
  };
  onClick?: {
    type: string;
    url: string;
  };
}

export interface ChatMessage {
  id: string;
  type: string;
  text: string;
  textTokens?: string[];
  createdAt: number;
  createdAtTimestamp: number;
  updatedAt: number;
  updatedAtTimestamp: number;
  author: ChatAuthor;
  isOutgoing: boolean;
  canEdit: boolean;
  bgColor: string | null;
  files: ChatFile[];
  replyTo: ChatReplyTo | null;
  reactions: unknown | null;
  sticker: unknown | null;
  data: unknown | null;
}

export interface ChatReplyTo {
  id: string;
  text?: string;
  author?: ChatAuthor;
}

export interface ChatFile {
  hash?: string;
  url?: string;
  name?: string;
  type?: string;
  meta?: Record<string, unknown>;
}

// Ответ messages_get_url
export interface MessagesGetResponse {
  success: boolean;
  data: {
    messages: ChatMessage[];
    lastChangeId: string;
  };
}

// Ответ messages_changes_url
export interface ChangesResponse {
  success: boolean;
  changes?: ChatChange[];
  error?: {
    code: string;
    message?: string;
  };
}

// Ответ messages_add_url
export interface MessageAddResponse {
  success: boolean;
  data: {
    added: ChatMessage;
  };
}

export interface ChatChange {
  id: string;
  operation: 'create' | 'update' | 'delete';
  message?: ChatMessage;
  messageId?: string;
}

export interface SendMessagePayload {
  id: string;
  text: string;
  replyTo?: { id: string } | null;
  files?: { hash: string; meta: Record<string, unknown> }[];
  sticker?: { url: string };
}
