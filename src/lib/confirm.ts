import { Alert, Platform } from 'react-native';

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

/** Cross-platform confirmation. Native uses Alert; web uses the browser dialog. */
export function confirm({
  title,
  message,
  confirmLabel = 'Continue',
  cancelLabel = 'Cancel',
  destructive = false,
}: ConfirmOptions): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm([title, message].filter(Boolean).join('\n\n')));
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/** Cross-platform notice with a single button. */
export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') {
    window.alert([title, message].filter(Boolean).join('\n\n'));
    return;
  }
  Alert.alert(title, message);
}
