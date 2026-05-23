import { displayValue } from "./formatters";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const PRIMARY = "0.031 0.157 0.239";
const PRIMARY_LIGHT = "0.071 0.247 0.365";
const ACCENT = "0.725 0.541 0.204";
const BORDER = "0.835 0.878 0.918";
const TEXT = "0.090 0.126 0.180";
const MUTED = "0.400 0.459 0.541";
const SOFT = "0.949 0.973 0.988";

const pdfFields = [
  [
    "01. Cadastro do Evento",
    [
      ["1. Descrição da Solicitação", "descricaoSolicitacao"],
      ["2. Nome do Evento", "nomeEvento"],
      ["3. Data do Evento", "dataEvento"],
      ["4. Local de Realização do Evento", "localEvento"],
      ["5. Justificativa da Solicitação", "justificativa"],
    ],
  ],
  [
    "02. Projeto Vinculado",
    [
      ["6. Identificação do Projeto - ID FIOTEC", "idFiotec"],
      ["7. Meta do Projeto", "metaProjeto"],
      ["8. Coordenador", "coordenador"],
      ["9. Setor Fiocruz", "setorFiocruz"],
    ],
  ],
  [
    "03. Informações do Viajante",
    [
      ["10. Nome Completo", "nomeCompleto"],
      ["11. Data de Nascimento", "dataNascimento"],
      ["12. Cargo / Função", "cargoFuncao"],
      ["13. CPF", "cpf"],
      ["14. Banco", "banco"],
      ["15. Agência", "agencia"],
      ["16. Conta Corrente", "contaCorrente"],
    ],
  ],
  [
    "04. Informações da Solicitação",
    [
      ["17. Qual a necessidade?", "necessidade"],
      ["18. Local de Origem", "localOrigem"],
      ["19. Data de Ida", "dataIda"],
      ["20. Horário de Ida", "horarioIda"],
      ["21. Indicação do voo de ida", "vooIda"],
      ["22. Local de Destino", "localDestino"],
      ["23. Data de Volta", "dataVolta"],
      ["24. Horário de Volta", "horarioVolta"],
      ["25. É necessário valor máximo para diária?", "necessarioValorMaximoDiaria"],
      ["26. Qual o valor máximo para diária total", "valorMaximoDiaria"],
    ],
  ],
  [
    "05. Aluguel de Carro",
    [
      ["27. Solicitar aluguel de carro?", "solicitarAluguelCarro"],
      ["28. Categoria do veiculo", "categoriaVeiculo"],
      ["29. Tipo de cambio", "tipoCambio"],
      ["30. Numero de portas", "numeroPortas"],
      ["31. Ar-condicionado", "arCondicionado"],
      ["32. Local de retirada e devolucao", "localRetiradaDevolucao"],
      ["33. Copia da CNH em PDF", "cnhPdf"],
    ],
  ],
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
  const words = latinText(value).split(" ");
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

  strokeRect(x, y, width, height, color = BORDER) {
    this.op(`${color} RG ${x} ${PAGE_HEIGHT - y - height} ${width} ${height} re S`);
  }

  text(x, y, value, options = {}) {
    const size = options.size || 10;
    const font = options.bold ? "F2" : "F1";
    const color = options.color || TEXT;
    this.op(
      `BT /${font} ${size} Tf ${color} rg ${x} ${topToPdfY(y)} Td (${pdfString(
        value,
      )}) Tj ET`,
    );
  }

  drawHeader() {
    this.rect(0, 0, PAGE_WIDTH, 92, PRIMARY);
    this.rect(0, 92, PAGE_WIDTH, 6, ACCENT);
    this.rect(MARGIN, 24, 104, 44, "1 1 1");
    this.text(MARGIN + 17, 48, "FIOCRUZ", { size: 15, bold: true, color: PRIMARY });
    this.text(MARGIN + 18, 61, "BRASILIA", { size: 7, bold: true, color: ACCENT });
    this.text(164, 34, "Fiocruz Brasília - NUGB/GEREB", {
      size: 9,
      bold: true,
      color: ACCENT,
    });
    this.text(164, 56, "Comprovante de Solicitação", {
      size: 22,
      bold: true,
      color: "1 1 1",
    });
    this.text(164, 76, `Protocolo ${this.data.id || "-"}`, {
      size: 10,
      bold: true,
      color: "0.835 0.890 0.933",
    });
    this.y = 122;
  }

  ensureSpace(height) {
    if (this.y + height > PAGE_HEIGHT - 54) {
      this.addPage();
    }
  }

  sectionTitle(title) {
    this.ensureSpace(34);
    this.rect(MARGIN, this.y, PAGE_WIDTH - MARGIN * 2, 26, SOFT);
    this.strokeRect(MARGIN, this.y, PAGE_WIDTH - MARGIN * 2, 26);
    this.text(MARGIN + 12, this.y + 17, title, {
      size: 11,
      bold: true,
      color: PRIMARY_LIGHT,
    });
    this.y += 34;
  }

  field(label, value) {
    const width = PAGE_WIDTH - MARGIN * 2;
    const valueLines = wrapText(value || "-", 86);
    const height = Math.max(52, 24 + valueLines.length * 12);
    this.ensureSpace(height + 7);
    this.strokeRect(MARGIN, this.y, width, height);
    this.text(MARGIN + 12, this.y + 17, label, {
      size: 8.5,
      bold: true,
      color: ACCENT,
    });
    valueLines.forEach((line, index) => {
      this.text(MARGIN + 12, this.y + 34 + index * 12, line, {
        size: 10,
        color: TEXT,
      });
    });
    this.y += height + 7;
  }

  footer(pageNumber) {
    this.text(MARGIN, PAGE_HEIGHT - 28, "Documento gerado pelo sistema administrativo NUGB/GEREB.", {
      size: 8,
      color: MUTED,
    });
    this.text(PAGE_WIDTH - MARGIN - 45, PAGE_HEIGHT - 28, `Página ${pageNumber}`, {
      size: 8,
      bold: true,
      color: MUTED,
    });
  }

  render() {
    pdfFields.forEach(([section, fields]) => {
      this.sectionTitle(section);
      fields.forEach(([label, key]) => this.field(label, displayValue(key, this.data)));
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
