import { memo, type ReactNode } from "react";
import { Linking, Platform, StyleSheet, Text, View } from "react-native";
import { spacing, typography, useTheme } from "@/theme";

/**
 * Task descriptions are Markdown on the web. Here they're shown as plain,
 * readable text: headings bold, list markers as bullets, code blocks in a
 * monospace face, and links ([label](url) and bare http(s) URLs) tappable.
 * No HTML, no images - nothing in a description can run or load anything.
 */

const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;
const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

function openLink(url: string) {
  Linking.openURL(url).catch(() => {});
}

function stripInline(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1").replace(/`([^`]+)`/g, "$1");
}

function renderInline(text: string, linkColor: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(LINK_RE)) {
    const start = match.index ?? 0;
    if (start > last) nodes.push(stripInline(text.slice(last, start)));
    const label = match[1] ?? match[3] ?? "";
    const url = match[2] ?? match[3] ?? "";
    nodes.push(
      <Text
        key={`${keyPrefix}-l${index++}`}
        style={{ color: linkColor, textDecorationLine: "underline" }}
        onPress={() => openLink(url)}
        accessibilityRole="link"
        accessibilityHint={url}
      >
        {label}
      </Text>
    );
    last = start + match[0].length;
  }
  if (last < text.length) nodes.push(stripInline(text.slice(last)));
  return nodes;
}

export const RichText = memo(function RichText({ text }: { text: string }) {
  const { colors } = useTheme();
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let code: string[] | null = null;

  lines.forEach((raw, i) => {
    if (/^\s*```/.test(raw)) {
      if (code) {
        blocks.push(
          <View key={`c${i}`} style={[styles.code, { backgroundColor: colors.surfaceMuted }]}>
            <Text style={[styles.codeText, { color: colors.text }]} selectable>
              {code.join("\n")}
            </Text>
          </View>
        );
        code = null;
      } else {
        code = [];
      }
      return;
    }
    if (code) {
      code.push(raw);
      return;
    }

    const heading = /^\s{0,3}#{1,6}\s+(.*)$/.exec(raw);
    const bullet = /^\s*[-*+]\s+(?:\[([ xX])\]\s+)?(.*)$/.exec(raw);
    const numbered = /^\s*(\d+)[.)]\s+(.*)$/.exec(raw);

    if (heading) {
      blocks.push(
        <Text key={i} style={[styles.heading, { color: colors.text }]} selectable>
          {renderInline(heading[1] ?? "", colors.primary, String(i))}
        </Text>
      );
    } else if (bullet) {
      const box = bullet[1];
      const marker = box === undefined ? "•" : box.trim() ? "☑" : "☐";
      blocks.push(
        <View key={i} style={styles.listRow}>
          <Text style={[styles.body, styles.marker, { color: colors.textMuted }]}>{marker}</Text>
          <Text style={[styles.body, styles.listText, { color: colors.text }]} selectable>
            {renderInline(bullet[2] ?? "", colors.primary, String(i))}
          </Text>
        </View>
      );
    } else if (numbered) {
      blocks.push(
        <View key={i} style={styles.listRow}>
          <Text style={[styles.body, styles.marker, { color: colors.textMuted }]}>{numbered[1]}.</Text>
          <Text style={[styles.body, styles.listText, { color: colors.text }]} selectable>
            {renderInline(numbered[2] ?? "", colors.primary, String(i))}
          </Text>
        </View>
      );
    } else if (raw.trim() === "") {
      blocks.push(<View key={i} style={styles.gap} />);
    } else {
      blocks.push(
        <Text key={i} style={[styles.body, { color: colors.text }]} selectable>
          {renderInline(raw.replace(/^>\s?/, ""), colors.primary, String(i))}
        </Text>
      );
    }
  });

  const openCode = code as string[] | null;
  if (openCode) {
    blocks.push(
      <Text key="code-tail" style={[styles.codeText, { color: colors.text }]} selectable>
        {openCode.join("\n")}
      </Text>
    );
  }

  return <View>{blocks}</View>;
});

const styles = StyleSheet.create({
  body: { ...typography.callout, lineHeight: 22 },
  heading: { ...typography.headline, marginTop: spacing.sm, marginBottom: 2 },
  listRow: { flexDirection: "row", gap: spacing.sm },
  marker: { minWidth: 16 },
  listText: { flex: 1 },
  gap: { height: spacing.sm },
  code: { borderRadius: 8, padding: spacing.sm, marginVertical: spacing.xs },
  codeText: { fontFamily: MONO, fontSize: 13, lineHeight: 18 },
});
