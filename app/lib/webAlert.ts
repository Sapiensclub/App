import { Alert, Platform, type AlertButton } from 'react-native';

// react-native-web ships Alert as a silent no-op — every error, confirmation
// and "check your email" message becomes INVISIBLE in a browser (found the
// hard way: web signup looked dead when it was actually talking). Map alerts
// onto the browser's own dialogs so the web tester surface always talks back.
//
// Buttons: 0–1 → window.alert; 2+ → window.confirm where OK = the first
// non-cancel button (labelled in the text so multi-option sheets stay usable).
if (Platform.OS === 'web') {
  Alert.alert = ((title: string, message?: string, buttons?: AlertButton[]) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    if (!buttons || buttons.length <= 1) {
      window.alert(text);
      buttons?.[0]?.onPress?.();
      return;
    }
    const confirmBtn =
      buttons.find((b) => b.style !== 'cancel') ?? buttons[buttons.length - 1];
    const cancelBtn = buttons.find((b) => b.style === 'cancel');
    const ok = window.confirm(
      `${text}\n\nOK = ${confirmBtn.text ?? 'OK'} · Cancel = ${cancelBtn?.text ?? 'Cancel'}`,
    );
    if (ok) confirmBtn.onPress?.();
    else cancelBtn?.onPress?.();
  }) as typeof Alert.alert;
}

export {};
