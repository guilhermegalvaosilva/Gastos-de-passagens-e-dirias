import { displayValue } from "./formatters";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 38;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const COLORS = {
  ink: "0.071 0.071 0.071",
  muted: "0.376 0.392 0.376",
  canvas: "0.957 0.973 0.953",
  soft: "0.976 0.992 0.984",
  line: "0.800 0.871 0.843",
  green: "0.000 0.478 0.325",
  greenDark: "0.071 0.235 0.208",
  greenSoft: "0.902 0.957 0.937",
  warm: "0.980 0.984 0.965",
  white: "1 1 1",
};

const pdfSections = [
  {
    title: "01. Cadastro do evento",
    fields: [
      ["Descricao da solicitacao", "descricaoSolicitacao", true],
      ["Nome do evento", "nomeEvento", true],
      ["Data do evento", "dataEvento"],
      ["Local de realizacao", "localEvento"],
      ["Justificativa", "justificativa", true],
    ],
  },
  {
    title: "05. Aluguel de carro",
    fields: [
      ["Solicitar aluguel de carro?", "solicitarAluguelCarro"],
      ["Categoria do veiculo", "categoriaVeiculo"],
      ["Tipo de cambio", "tipoCambio"],
      ["Numero de portas", "numeroPortas"],
      ["Ar-condicionado", "arCondicionado"],
      ["Local de retirada e devolucao", "localRetiradaDevolucao", true],
      ["Copia da CNH em PDF", "cnhPdf", true],
    ],
  },
  {
    title: "02. Projeto vinculado",
    fields: [
      ["ID FIOTEC", "idFiotec"],
      ["Meta do projeto", "metaProjeto"],
      ["Coordenador", "coordenador"],
      ["Setor Fiocruz", "setorFiocruz"],
    ],
  },
  {
    title: "03. Dados do viajante",
    fields: [
      ["Nome completo", "nomeCompleto", true],
      ["Data de nascimento", "dataNascimento"],
      ["Cargo / Funcao", "cargoFuncao"],
      ["CPF", "cpf"],
      ["Banco", "banco", true],
      ["Agencia", "agencia"],
      ["Conta corrente", "contaCorrente"],
    ],
  },
  {
    title: "04. Dados da viagem",
    fields: [
      ["Necessidade", "necessidade"],
      ["Local de origem", "localOrigem"],
      ["Data de ida", "dataIda"],
      ["Horario de ida", "horarioIda"],
      ["Voo de ida", "vooIda", true],
      ["Local de destino", "localDestino"],
      ["Data de volta", "dataVolta"],
      ["Horario de volta", "horarioVolta"],
      ["Valor maximo para diaria?", "necessarioValorMaximoDiaria"],
      ["Valor maximo da diaria", "valorMaximoDiaria"],
    ],
  },
];

function latinText(value) {
  return String(value ?? "-")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\xFF]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function pdfString(value) {
  return latinText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapText(value, maxChars) {
  const words = latinText(value || "-").split(" ");
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  return lines.length ? lines : ["-"];
}

function topToPdfY(y) {
  return PAGE_HEIGHT - y;
}

function streamBytes(stream) {
  const bytes = new Uint8Array(stream.length);
  for (let index = 0; index < stream.length; index += 1) {
    bytes[index] = stream.charCodeAt(index) & 0xff;
  }
  return bytes;
}

class PdfDocument {
  constructor(data) {
    this.data = data;
    this.pages = [];
    this.page = null;
    this.y = MARGIN;
    this.addPage();
  }

  addPage() {
    this.page = [];
    this.pages.push(this.page);
    this.y = MARGIN;
    this.drawHeader();
  }

  op(value) {
    this.page.push(value);
  }

  rect(x, y, width, height, color) {
    this.op(`${color} rg ${x} ${PAGE_HEIGHT - y - height} ${width} ${height} re f`);
  }

  strokeRect(x, y, width, height, color = COLORS.line) {
    this.op(`${color} RG ${x} ${PAGE_HEIGHT - y - height} ${width} ${height} re S`);
  }

  text(x, y, value, options = {}) {
    const size = options.size || 9;
    const font = options.bold ? "F2" : "F1";
    const color = options.color || COLORS.ink;
    this.op(
      `BT /${font} ${size} Tf ${color} rg ${x} ${topToPdfY(y)} Td (${pdfString(
        value,
      )}) Tj ET`,
    );
  }

  line(x1, y1, x2, y2, color = COLORS.line) {
    this.op(`${color} RG ${x1} ${topToPdfY(y1)} m ${x2} ${topToPdfY(y2)} l S`);
  }

  drawHeader() {
    this.rect(0, 0, PAGE_WIDTH, 118, COLORS.canvas);
    this.rect(0, 0, 9, 118, COLORS.green);
    this.line(MARGIN, 96, PAGE_WIDTH - MARGIN, 96, COLORS.line);

    this.rect(MARGIN, 28, 36, 36, COLORS.green);
    this.text(MARGIN + 10, 51, "N", { size: 17, bold: true, color: COLORS.white });

    this.text(MARGIN + 50, 34, "NUGB / GEREB", {
      size: 9,
      bold: true,
      color: COLORS.green,
    });
    this.text(MARGIN + 50, 57, "Comprovante de solicitacao de viagem", {
      size: 19,
      bold: true,
      color: COLORS.ink,
    });
    this.text(MARGIN + 50, 76, "Passagens, diarias e apoio logistico", {
      size: 9,
      color: COLORS.muted,
    });

    const protocolX = PAGE_WIDTH - MARGIN - 168;
    this.rect(protocolX, 28, 168, 52, COLORS.white);
    this.strokeRect(protocolX, 28, 168, 52, COLORS.line);
    this.text(protocolX + 12, 46, `Protocolo: ${this.data.id || "-"}`, {
      size: 9,
      bold: true,
      color: COLORS.greenDark,
    });
    this.text(protocolX + 12, 64, `Status: ${this.data.status || "Recebida"}`, {
      size: 9,
      color: COLORS.muted,
    });

    this.y = 136;
  }

  ensureSpace(height) {
    if (this.y + height > PAGE_HEIGHT - 48) {
      this.addPage();
    }
  }

  drawSummary() {
    this.ensureSpace(104);
    this.text(MARGIN, this.y, "Resumo da solicitacao", {
      size: 12,
      bold: true,
      color: COLORS.greenDark,
    });
    this.text(MARGIN, this.y + 16, "Principais informacoes para conferencia rapida.", {
      size: 8,
      color: COLORS.muted,
    });

    const cardWidth = (CONTENT_WIDTH - 30) / 4;
    const cards = [
      ["Solicitante", displayValue("nomeCompleto", this.data)],
      ["Necessidade", displayValue("necessidade", this.data)],
      ["Periodo", `${displayValue("dataIda", this.data)} a ${displayValue("dataVolta", this.data)}`],
      ["Aluguel", displayValue("solicitarAluguelCarro", this.data)],
    ];

    const cardY = this.y + 30;
    cards.forEach(([label, value], index) => {
      const x = MARGIN + index * (cardWidth + 10);
      this.rect(x, cardY, cardWidth, 58, index === 0 ? COLORS.green : COLORS.white);
      this.strokeRect(x, cardY, cardWidth, 58, index === 0 ? COLORS.green : COLORS.line);
      this.text(x + 10, cardY + 16, label, {
        size: 7.5,
        bold: true,
        color: index === 0 ? COLORS.greenSoft : COLORS.green,
      });
      wrapText(value, index === 0 ? 20 : 18).slice(0, 2).forEach((line, lineIndex) => {
        this.text(x + 10, cardY + 34 + lineIndex * 10, line, {
          size: 9,
          bold: lineIndex === 0,
          color: index === 0 ? COLORS.white : COLORS.ink,
        });
      });
    });

    this.y += 104;
  }

  sectionTitle(title) {
    this.ensureSpace(38);
    this.rect(MARGIN, this.y, CONTENT_WIDTH, 30, COLORS.greenSoft);
    this.rect(MARGIN, this.y, 5, 30, COLORS.green);
    this.strokeRect(MARGIN, this.y, CONTENT_WIDTH, 30, COLORS.line);
    this.text(MARGIN + 14, this.y + 19, title.toUpperCase(), {
      size: 10,
      bold: true,
      color: COLORS.greenDark,
    });
    this.y += 40;
  }

  fieldHeight(value, width) {
    const maxChars = Math.max(20, Math.floor(width / 5.4));
    const lines = wrapText(value, maxChars).slice(0, 5);
    return Math.max(46, 23 + lines.length * 11);
  }

  fieldBox(x, y, width, height, label, value) {
    this.rect(x, y, width, height, COLORS.white);
    this.strokeRect(x, y, width, height, COLORS.line);
    this.rect(x, y, width, 20, COLORS.warm);
    this.text(x + 9, y + 15, label, {
      size: 7.5,
      bold: true,
      color: COLORS.greenDark,
    });
    const maxChars = Math.max(20, Math.floor(width / 5.4));
    wrapText(value, maxChars).slice(0, 5).forEach((line, index) => {
      this.text(x + 9, y + 31 + index * 11, line, {
        size: 9.2,
        color: COLORS.ink,
      });
    });
  }

  fieldsGrid(fields) {
    const gap = 8;
    const half = (CONTENT_WIDTH - gap) / 2;
    for (let index = 0; index < fields.length; index += 1) {
      const [label, key, full] = fields[index];
      const value = displayValue(key, this.data);

      if (full) {
        const height = this.fieldHeight(value, CONTENT_WIDTH);
        this.ensureSpace(height + 8);
        this.fieldBox(MARGIN, this.y, CONTENT_WIDTH, height, label, value);
        this.y += height + 8;
        continue;
      }

      const next = fields[index + 1];
      const nextIsPair = next && !next[2];
      const nextValue = nextIsPair ? displayValue(next[1], this.data) : "";
      const height = Math.max(
        this.fieldHeight(value, half),
        nextIsPair ? this.fieldHeight(nextValue, half) : 46,
      );
      this.ensureSpace(height + 8);
      this.fieldBox(MARGIN, this.y, half, height, label, value);
      if (nextIsPair) {
        this.fieldBox(MARGIN + half + gap, this.y, half, height, next[0], nextValue);
        index += 1;
      }
      this.y += height + 8;
    }
  }

  footer(pageNumber) {
    this.line(MARGIN, PAGE_HEIGHT - 38, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 38, COLORS.line);
    this.text(MARGIN, PAGE_HEIGHT - 24, "Documento gerado pelo sistema administrativo NUGB/GEREB.", {
      size: 7.5,
      color: COLORS.muted,
    });
    this.text(PAGE_WIDTH - MARGIN - 44, PAGE_HEIGHT - 24, `Pagina ${pageNumber}`, {
      size: 7.5,
      bold: true,
      color: COLORS.muted,
    });
  }

  render() {
    this.drawSummary();
    pdfSections.forEach((section) => {
      this.sectionTitle(section.title);
      this.fieldsGrid(section.fields);
    });
    this.pages.forEach((_, index) => {
      const current = this.page;
      this.page = this.pages[index];
      this.footer(index + 1);
      this.page = current;
    });
    return buildPdf(this.pages);
  }
}

function buildPdf(pageStreams) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];
  const pageRefs = [];

  pageStreams.forEach((ops) => {
    const content = `${ops.join("\n")}\n`;
    const pageNumber = objects.length + 1;
    const contentNumber = objects.length + 2;
    pageRefs.push(`${pageNumber} 0 R`);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentNumber} 0 R >>`,
    );
    objects.push(`<< /Length ${streamBytes(content).length} >>\nstream\n${content}endstream`);
  });

  objects[1] = `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${
    pageRefs.length
  } >>`;

  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(streamBytes(pdf).length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = streamBytes(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return streamBytes(pdf);
}

export function generatePDF(data) {
  const bytes = new PdfDocument(data).render();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `comprovante_${data.id || "solicitacao"}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}
