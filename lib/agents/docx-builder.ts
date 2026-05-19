import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "docx";

function parseInline(text: string): TextRun[] {
  const runs: TextRun[] = [];
  // Split on **bold** and *italic* markers
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  for (const part of parts) {
    if (part.startsWith("**") && part.endsWith("**")) {
      runs.push(new TextRun({ text: part.slice(2, -2), bold: true }));
    } else if (part.startsWith("*") && part.endsWith("*")) {
      runs.push(new TextRun({ text: part.slice(1, -1), italics: true }));
    } else if (part.length > 0) {
      runs.push(new TextRun({ text: part }));
    }
  }
  return runs.length > 0 ? runs : [new TextRun({ text: "" })];
}

function parseTable(lines: string[]): Table {
  const rows: TableRow[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].replace(/[\s|:-]/g, "").length === 0) continue; // separator row
    const cells = lines[i]
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    const isHeader = i === 0;
    rows.push(
      new TableRow({
        children: cells.map(
          (c) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: c, bold: isHeader })],
                }),
              ],
              width: { size: Math.floor(9000 / cells.length), type: WidthType.DXA },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 1 },
                bottom: { style: BorderStyle.SINGLE, size: 1 },
                left: { style: BorderStyle.SINGLE, size: 1 },
                right: { style: BorderStyle.SINGLE, size: 1 },
              },
            })
        ),
      })
    );
  }
  return new Table({ rows, width: { size: 9000, type: WidthType.DXA } });
}

export async function buildDocx(params: {
  title: string;
  content: string;
}): Promise<Buffer> {
  const lines = params.content.split("\n");
  const children: (Paragraph | Table)[] = [];

  // Title paragraph
  children.push(
    new Paragraph({
      text: params.title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.LEFT,
      spacing: { after: 200 },
    })
  );

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Table detection: line starts and ends with |
    if (line.trimStart().startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      children.push(parseTable(tableLines));
      children.push(new Paragraph({ text: "" }));
      continue;
    }

    // Headings
    const h1 = line.match(/^#\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/);
    const h3 = line.match(/^###\s+(.+)/);

    if (h1) {
      children.push(new Paragraph({ text: h1[1], heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 } }));
    } else if (h2) {
      children.push(new Paragraph({ text: h2[1], heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }));
    } else if (h3) {
      children.push(new Paragraph({ text: h3[1], heading: HeadingLevel.HEADING_3, spacing: { before: 160, after: 80 } }));
    } else if (/^[-*]\s+/.test(line)) {
      // Bullet point
      const bulletText = line.replace(/^[-*]\s+/, "");
      children.push(
        new Paragraph({
          children: parseInline(bulletText),
          bullet: { level: 0 },
          spacing: { after: 60 },
        })
      );
    } else if (/^\d+\.\s+/.test(line)) {
      // Numbered list
      const numText = line.replace(/^\d+\.\s+/, "");
      children.push(
        new Paragraph({
          children: parseInline(numText),
          numbering: { reference: "default-numbering", level: 0 },
          spacing: { after: 60 },
        })
      );
    } else if (line.trim() === "" || line.trim() === "---") {
      children.push(new Paragraph({ text: "", spacing: { after: 80 } }));
    } else {
      children.push(
        new Paragraph({
          children: parseInline(line),
          spacing: { after: 80 },
        })
      );
    }

    i++;
  }

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "default-numbering",
          levels: [
            {
              level: 0,
              format: "decimal",
              text: "%1.",
              alignment: AlignmentType.LEFT,
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 },
          },
        },
        children,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}
