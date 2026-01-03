import type { NotificationMessage } from '@/types/notifications';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface AppNotificationProps {
  notification: NotificationMessage;
  onClose: () => void;
}

function NotificationItem({ notification, onClose }: AppNotificationProps) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-200)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [height, setHeight] = useState(0);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startCloseTimeout = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }
    closeTimeoutRef.current = setTimeout(() => {
      closeByTimeout();
    }, 3000);
  }, []);

  const cancelCloseTimeout = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const closeByTimeout = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -height,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  }, [height, translateY, opacity, onClose]);

  const handlePress = useCallback(() => {
    cancelCloseTimeout();
    if (notification.onPress) {
      notification.onPress();
    }
    Animated.timing(opacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      onClose();
    });
  }, [notification, opacity, onClose, cancelCloseTimeout]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: () => {
        cancelCloseTimeout();
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy < 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const shouldClose = gestureState.dy < -height / 3 || gestureState.vy < -0.5;
        
        if (shouldClose) {
          Animated.parallel([
            Animated.timing(translateY, {
              toValue: -height,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }),
          ]).start(() => {
            onClose();
          });
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 100,
            friction: 8,
          }).start();
          startCloseTimeout();
        }
      },
    })
  ).current;

  useEffect(() => {
    // Haptic feedback при появлении
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Анимация появления
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      startCloseTimeout();
    });

    return () => {
      cancelCloseTimeout();
    };
  }, [translateY, opacity, startCloseTimeout, cancelCloseTimeout]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          paddingTop: insets.top || 10,
          paddingLeft: insets.left || 10,
          paddingRight: insets.right || 10,
          opacity,
          transform: [{ translateY }],
        },
      ]}
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
      {...panResponder.panHandlers}
    >
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.9}
        disabled={!notification.onPress}
      >
        <View style={styles.notificationCard}>
          {notification.notification?.title ? (
            <Text style={styles.title} numberOfLines={3}>
              {notification.notification.title}
            </Text>
          ) : null}
          {notification.notification?.body ? (
            <Text style={styles.body} numberOfLines={3}>
              {notification.notification.body}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// Глобальный менеджер уведомлений
class NotificationManager {
  private listeners = new Set<(notification: NotificationMessage | null) => void>();
  private currentNotification: NotificationMessage | null = null;
  private notificationId = 0;

  show(notification: NotificationMessage) {
    const id = this.notificationId++;
    this.currentNotification = { ...notification, '@id': id };
    this.notifyListeners();
  }

  hide() {
    this.currentNotification = null;
    this.notifyListeners();
  }

  subscribe(listener: (notification: NotificationMessage | null) => void) {
    this.listeners.add(listener);
    // Сразу уведомляем о текущем состоянии
    listener(this.currentNotification);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(listener => {
      listener(this.currentNotification);
    });
  }
}

export const notificationManager = new NotificationManager();

// Компонент для рендера уведомлений
export function AppNotification() {
  const [notification, setNotification] = useState<NotificationMessage | null>(null);

  useEffect(() => {
    const unsubscribe = notificationManager.subscribe(setNotification);
    return unsubscribe;
  }, []);

  if (!notification) {
    return null;
  }

  return (
    <NotificationItem
      notification={notification}
      onClose={() => notificationManager.hide()}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingBottom: 10,
  },
  notificationCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  body: {
    fontSize: 14,
    color: '#333',
  },
});
