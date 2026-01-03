import { useNotifications } from '@/hooks/use-notifications';
import type { NotificationAction, NotificationMessage } from '@/types/notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { notificationManager } from './AppNotification';

export function NotificationsHandler() {
  const router = useRouter();
  const { onNotification, onNotificationOpened, setBadge } = useNotifications();

  // Обработка действия при клике на уведомление
  const handleNotificationAction = async (notification: NotificationMessage) => {
    if (!notification.data?.onClick) {
      return;
    }

    try {
      const action: NotificationAction = JSON.parse(notification.data.onClick);
      
      switch (action.type) {
        case 'navigate':
          if (action.url) {
            console.log('[NotificationsHandler] Navigating to:', action.url);
            // Переходим на главную страницу (первый таб)
            router.push('/(tabs)');
          }
          break;
        
        case 'notification':
          // Показать уведомление из бэкенда
          if (action.title || action.body) {
            notificationManager.show({
              notification: {
                type: action.alertType,
                title: action.title,
                body: action.body,
              },
            });
          }
          break;

        case 'error':
          // Показать ошибку
          if (action.error) {
            let title = action.error.message || 'Error';
            let body = '';
            if (action.error.config?.method && action.error.config?.url) {
              body = `${action.error.config.method}: ${action.error.config.url}`;
            }
            notificationManager.show({
              notification: {
                title,
                body,
              },
            });
          }
          break;
      }
    } catch (error) {
      console.error('[NotificationsHandler] Error parsing onClick action:', error);
    }
  };

  useEffect(() => {
    // Обработка уведомлений на переднем плане
    const unsubscribeOnNotification = onNotification(async (message) => {
      console.log('[NotificationsHandler] Received notification:', message);
      
      // Проверяем, нужно ли показывать уведомление
      if (message.notification?.title || message.notification?.body) {
        // Добавляем обработчик нажатия
        message.onPress = () => {
          handleNotificationAction(message);
        };
        
        // Показываем уведомление
        notificationManager.show(message);
      }
    });

    // Обработка открытия уведомления
    const unsubscribeOnNotificationOpened = onNotificationOpened(async (message) => {
      console.log('[NotificationsHandler] Notification opened:', message);
      await handleNotificationAction(message);
    });

    // Сбросить badge при монтировании
    setBadge(0);

    return () => {
      unsubscribeOnNotification();
      unsubscribeOnNotificationOpened();
    };
  }, [onNotification, onNotificationOpened, setBadge, router]);

  // Этот компонент ничего не рендерит
  return null;
}
