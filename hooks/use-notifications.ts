import type { NotificationMessage } from '@/types/notifications';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

// Настройка поведения уведомлений на переднем плане
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type NotificationListener = (message: NotificationMessage) => void;
type NotificationOpenedListener = (message: NotificationMessage) => void;

export function useNotifications() {
  const [hasPermission, setHasPermission] = useState(false);
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  
  const notificationListeners = useRef<Set<NotificationListener>>(new Set());
  const notificationOpenedListeners = useRef<Set<NotificationOpenedListener>>(new Set());

  // Запросить разрешения на уведомления
  const requestPermissions = useCallback(async () => {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      const enabled = finalStatus === 'granted';
      setHasPermission(enabled);
      
      if (enabled) {
        console.log('[Notifications] Permission granted');
        
        // Настройка канала для Android
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
          });
        }
      } else {
        console.log('[Notifications] Permission denied');
      }

      return enabled;
    } catch (error) {
      console.error('[Notifications] Error requesting permission:', error);
      return false;
    }
  }, []);

  // Получить Push токен
  const getToken = useCallback(async () => {
    try {
      if (!Device.isDevice) {
        console.warn('[Notifications] Must use physical device for Push Notifications');
        return null;
      }

      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: 'a28953b8-3e7d-464f-89bf-7e8a0eb43626',
      });
      
      const token = tokenData.data;
      console.log('[Notifications] Expo Push Token:', token);
      setExpoPushToken(token);
      return token;
    } catch (error) {
      console.error('[Notifications] Error getting token:', error);
      return null;
    }
  }, []);

  // Подписаться на уведомления (когда приложение на переднем плане)
  const onNotification = useCallback((listener: NotificationListener) => {
    notificationListeners.current.add(listener);
    return () => {
      notificationListeners.current.delete(listener);
    };
  }, []);

  // Подписаться на открытие уведомлений (когда пользователь тапнул на уведомление)
  const onNotificationOpened = useCallback((listener: NotificationOpenedListener) => {
    notificationOpenedListeners.current.add(listener);
    return () => {
      notificationOpenedListeners.current.delete(listener);
    };
  }, []);

  // Установить badge
  const setBadge = useCallback(async (count: number) => {
    await Notifications.setBadgeCountAsync(count);
  }, []);

  // Инициализация
  useEffect(() => {
    const initialize = async () => {
      // Очистить все доставленные уведомления
      await Notifications.dismissAllNotificationsAsync();

      // Запросить разрешения
      const enabled = await requestPermissions();
      
      if (enabled) {
        // Получить токен
        const token = await getToken();
        
        // Токен получен, но не сохраняем на сервер
        // Expo Push Token используется только для Expo Push API
      }
    };

    initialize();

    // Обработка уведомлений на переднем плане
    const notificationListener = Notifications.addNotificationReceivedListener(notification => {
      console.log('[Notifications] Foreground notification:', notification);
      
      const message: NotificationMessage = {
        notification: {
          title: notification.request.content.title || undefined,
          body: notification.request.content.body || undefined,
        },
        data: notification.request.content.data,
      };

      // Уведомить всех слушателей
      notificationListeners.current.forEach(listener => {
        listener(message);
      });
    });

    // Обработка открытия уведомления (когда пользователь тапнул)
    const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('[Notifications] Notification tapped:', response);
      
      const message: NotificationMessage = {
        notification: {
          title: response.notification.request.content.title || undefined,
          body: response.notification.request.content.body || undefined,
        },
        data: response.notification.request.content.data,
      };

      // Уведомить всех слушателей
      notificationOpenedListeners.current.forEach(listener => {
        listener(message);
      });
    });

    // Проверить, было ли приложение открыто из уведомления
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (response) {
        console.log('[Notifications] App opened from notification:', response);
        
        const message: NotificationMessage = {
          notification: {
            title: response.notification.request.content.title || undefined,
            body: response.notification.request.content.body || undefined,
          },
          data: response.notification.request.content.data,
        };

        // Уведомить всех слушателей с небольшой задержкой
        setTimeout(() => {
          notificationOpenedListeners.current.forEach(listener => {
            listener(message);
          });
        }, 1000);
      }
    });

    // Cleanup
    return () => {
      notificationListener.remove();
      responseListener.remove();
    };
  }, [requestPermissions, getToken]);

  return {
    hasPermission,
    expoPushToken,
    requestPermissions,
    onNotification,
    onNotificationOpened,
    setBadge,
  };
}
