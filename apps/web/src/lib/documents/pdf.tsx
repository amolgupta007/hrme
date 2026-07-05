// src/lib/documents/pdf.tsx
// Server-side PDF renderer via @react-pdf/renderer (pure Node — no headless
// browser; safe on Vercel serverless + Windows dev). Renders both the draft and
// the immutable signed artifact from the same component; the signed variant adds
// the acknowledgement block. See docs/planning/documents-feature-plan.md §7.
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { parseMarkdown, type Block, type InlineRun } from "./markdown";
import type { RenderedClause } from "./types";

const styles = StyleSheet.create({
  page: { paddingVertical: 54, paddingHorizontal: 56, fontSize: 10.5, fontFamily: "Helvetica", color: "#1a1a1a", lineHeight: 1.5 },
  entity: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  docTitle: { fontSize: 16, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 16, textAlign: "center" },
  rule: { borderBottomWidth: 1, borderBottomColor: "#d4d4d4", marginBottom: 16 },
  clauseTitle: { fontSize: 11.5, fontFamily: "Helvetica-Bold", marginTop: 12, marginBottom: 4 },
  h1: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 8, marginBottom: 4 },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 6, marginBottom: 3 },
  h3: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 6, marginBottom: 3 },
  para: { marginBottom: 6 },
  listRow: { flexDirection: "row", marginBottom: 3, paddingLeft: 8 },
  listMarker: { width: 16 },
  listBody: { flex: 1 },
  ackBox: { marginTop: 28, padding: 14, borderWidth: 1, borderColor: "#c8c8c8", backgroundColor: "#f7f7f7" },
  ackHeading: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  ackLine: { marginBottom: 2 },
  ackStatement: { marginTop: 8, fontSize: 9, color: "#555", fontStyle: "italic" },
  footer: { position: "absolute", bottom: 28, left: 56, right: 56, fontSize: 8, color: "#999", textAlign: "center" },
});

function runStyle(run: InlineRun) {
  if (run.bold && run.italic) return { fontFamily: "Helvetica-BoldOblique" };
  if (run.bold) return { fontFamily: "Helvetica-Bold" };
  if (run.italic) return { fontFamily: "Helvetica-Oblique" };
  return {};
}

function Runs({ runs }: { runs: InlineRun[] }) {
  return (
    <>
      {runs.map((r, i) => (
        <Text key={i} style={runStyle(r)}>
          {r.text}
        </Text>
      ))}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case "heading": {
      const s = block.level === 1 ? styles.h1 : block.level === 2 ? styles.h2 : styles.h3;
      return (
        <Text style={s}>
          <Runs runs={block.runs} />
        </Text>
      );
    }
    case "paragraph":
      return (
        <Text style={styles.para}>
          <Runs runs={block.runs} />
        </Text>
      );
    case "ul":
      return (
        <View>
          {block.items.map((item, i) => (
            <View key={i} style={styles.listRow}>
              <Text style={styles.listMarker}>•</Text>
              <Text style={styles.listBody}>
                <Runs runs={item} />
              </Text>
            </View>
          ))}
        </View>
      );
    case "ol":
      return (
        <View>
          {block.items.map((item, i) => (
            <View key={i} style={styles.listRow}>
              <Text style={styles.listMarker}>{i + 1}.</Text>
              <Text style={styles.listBody}>
                <Runs runs={item} />
              </Text>
            </View>
          ))}
        </View>
      );
  }
}

export interface RenderPdfInput {
  documentTitle: string;
  issuingEntityName: string;
  issuingEntityAddress?: string;
  clauses: RenderedClause[];
  acknowledgement?: {
    signerName: string;
    acknowledgedAt: string; // display string
    ip?: string;
    statement: string;
  };
}

function OfferDocument({ input }: { input: RenderPdfInput }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.entity}>{input.issuingEntityName}</Text>
        {input.issuingEntityAddress ? (
          <Text style={{ fontSize: 9, color: "#666" }}>{input.issuingEntityAddress}</Text>
        ) : null}
        <Text style={styles.docTitle}>{input.documentTitle}</Text>
        <View style={styles.rule} />

        {input.clauses.map((clause, i) => (
          <View key={i} wrap={false}>
            <Text style={styles.clauseTitle}>{clause.title}</Text>
            {parseMarkdown(clause.body_markdown).map((block, j) => (
              <BlockView key={j} block={block} />
            ))}
          </View>
        ))}

        {input.acknowledgement ? (
          <View style={styles.ackBox} wrap={false}>
            <Text style={styles.ackHeading}>Electronic Acknowledgement</Text>
            <Text style={styles.ackLine}>Signed by: {input.acknowledgement.signerName}</Text>
            <Text style={styles.ackLine}>Date: {input.acknowledgement.acknowledgedAt}</Text>
            {input.acknowledgement.ip ? (
              <Text style={styles.ackLine}>IP address: {input.acknowledgement.ip}</Text>
            ) : null}
            <Text style={styles.ackStatement}>{input.acknowledgement.statement}</Text>
          </View>
        ) : null}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}

/** Render the document to a PDF Buffer (draft when no acknowledgement, final signed PDF when present). */
export async function renderDocumentPdf(input: RenderPdfInput): Promise<Buffer> {
  return renderToBuffer(<OfferDocument input={input} />);
}
