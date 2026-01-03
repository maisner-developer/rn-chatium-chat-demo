export interface NotificationMessage {
  notification?: {
    title?: string;
    body?: string;
    type?: string;
  };
  data?: {
    onClick?: string; // JSON string with action
    [key: string]: any;
  };
  onPress?: () => void;
  '@id'?: number;
}

export interface NotificationAction {
  type: 'navigate' | 'notification' | 'error';
  url?: string;
  title?: string;
  body?: string;
  alertType?: string;
  error?: any;
}

export interface DeviceInfo {
  platform: string;
  tokenVersion: number;
  notificationsPermitted: boolean;
  model?: string;
  osVersion?: string;
  brand?: string;
  deviceName?: string;
  isDevice?: boolean;
}
