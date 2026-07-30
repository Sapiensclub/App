import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { radius, spacing, type as typeScale } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { Text } from './Text';

type TextFieldProps = TextInputProps & {
  label?: string;
};

/** A labelled, themed text input with a large, legible field. */
export function TextField({ label, style, ...rest }: TextFieldProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      {label ? (
        <Text variant="label" weight="semibold" tone="secondary">
          {label}
        </Text>
      ) : null}
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: colors.inputBg,
            borderColor: colors.inputBorder,
            color: colors.textPrimary,
          },
          style,
        ]}
        placeholderTextColor={colors.textFaint}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  input: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: typeScale.body.fontSize,
  },
});
