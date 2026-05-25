import { REQUEST_STATUS_OPTIONS } from "../config/requestStatus";
import { labels, requestFields } from "../data/formData";
import {
  displayValue,
  formatCurrency,
  normalizedFilterText,
  parseMoneyValue,
} from "./formatters";

const THEME = {
  ink: "#111113",
  paper: "#FFFFFF",
  canvas: "#E9E9EC",
  soft: "#F5F5F6",
  line: "#D9D9DE",
  muted: "#737780",
  green: "#15803D",
};

const sectionFields = [
  {
    title: "Evento",
    fields: ["id", "status", "createdAt", "descricaoSolicitacao", "nomeEvento", "dataEvento", "localEvento", "justificativa"],
  },
  {
    title: "Projeto",
    fields: ["idFiotec", "metaProjeto", "coordenador", "setorFiocruz"],
  },
  {
    title: "Viajante",
    fields: ["nomeCompleto", "dataNascimento", "cargoFuncao", "cpf", "banco", "agencia", "contaCorrente"],
  },
  {
    title: "Viagem",
    fields: ["necessidade", "localOrigem", "dataIda", "horarioIda", "vooIda", "localDestino", "dataVolta", "horarioVolta", "necessarioValorMaximoDiaria", "valorMaximoDiaria"],
  },
  {
    title: "Aluguel de carro",
    fields: ["solicitarAluguelCarro", "categoriaVeiculo", "tipoCambio", "numeroPortas", "arCondicionado", "localRetiradaDevolucao", "cnhPdf"],
  },
];

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function workbookDate() {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());
}

function currentLogin() {
  try {
    return (
      JSON.parse(localStorage.getItem("formulario_demanda_admin_session") || "{}").login ||
      "admin"
    );
  } catch {
    return "admin";
  }
}

function countByNeed(rows, need) {
  return rows.filter((item) =>
    normalizedFilterText(item.necessidade).includes(need),
  ).length;
}

function carRentalRows(rows) {
  return rows.filter((item) => item.solicitarAluguelCarro === "SIM");
}

function summaryFromRows(rows) {
  const totalDaily = rows.reduce(
    (sum, item) => sum + parseMoneyValue(item.valorMaximoDiaria),
    0,
  );
  const withDailyValue = rows.filter((item) => parseMoneyValue(item.valorMaximoDiaria) > 0);
  const average = withDailyValue.length ? totalDaily / withDailyValue.length : 0;
  const routes = new Set(
    rows
      .filter((item) => item.localOrigem && item.localDestino)
      .map((item) => `${item.localOrigem} -> ${item.localDestino}`),
  );

  return [
    ["Solicitacoes exportadas", rows.length],
    ["Com passagens", countByNeed(rows, "passagens")],
    ["Com diarias", countByNeed(rows, "diaria")],
    ["Com aluguel de carro", carRentalRows(rows).length],
    ["Rotas diferentes", routes.size],
    ["Total estimado de diarias", formatCurrency(totalDaily)],
    ["Media por solicitacao com valor", formatCurrency(average)],
    ["Gerado em", workbookDate()],
    ["Usuario", currentLogin()],
  ];
}

function textCell(value, style = "Cell", mergeAcross = 0) {
  const merge = mergeAcross ? ` ss:MergeAcross="${mergeAcross}"` : "";
  return `<Cell ss:StyleID="${style}"${merge}><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
}

function numberCell(value, style = "NumberCell") {
  return `<Cell ss:StyleID="${style}"><Data ss:Type="Number">${Number(value) || 0}</Data></Cell>`;
}

function row(cells, height = "") {
  const heightAttr = height ? ` ss:Height="${height}"` : "";
  return `<Row${heightAttr}>${cells.join("")}</Row>`;
}

function column(width) {
  return `<Column ss:AutoFitWidth="0" ss:Width="${width}" />`;
}

function worksheetOptions(freeze = false) {
  return freeze
    ? `<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
        <FreezePanes/>
        <FrozenNoSplit/>
        <SplitHorizontal>1</SplitHorizontal>
        <TopRowBottomPane>1</TopRowBottomPane>
        <ActivePane>2</ActivePane>
      </WorksheetOptions>`
    : "";
}

function buildSummarySheet(rows) {
  const summaryRows = summaryFromRows(rows)
    .map(([label, value]) =>
      row([
        textCell(label, "SummaryLabel"),
        typeof value === "number"
          ? numberCell(value, "SummaryValue")
          : textCell(value, "SummaryValue"),
      ], 28),
    )
    .join("");

  return `
    <Worksheet ss:Name="Resumo">
      <Table>
        ${column(250)}
        ${column(230)}
        ${column(120)}
        ${row([textCell("NUGB / GEREB", "Hero", 2)], 34)}
        ${row([textCell("Relatorio administrativo de passagens, diarias e aluguel de carro", "HeroSub", 2)], 24)}
        ${row([textCell("", "Spacer", 2)], 10)}
        ${summaryRows}
      </Table>
    </Worksheet>`;
}

function buildStatusSheet(rows) {
  const statusRows = REQUEST_STATUS_OPTIONS.map((status) => {
    const count = rows.filter((item) => (item.status || "Recebida") === status).length;
    const percent = rows.length ? `${Math.round((count / rows.length) * 100)}%` : "0%";
    return row([
      textCell(status, "CellStrong"),
      numberCell(count, "NumberCell"),
      textCell(percent, "Cell"),
    ], 25);
  }).join("");

  return `
    <Worksheet ss:Name="Status">
      <Table>
        ${column(210)}
        ${column(120)}
        ${column(120)}
        ${row([textCell("Status da fila", "Hero", 2)], 32)}
        ${row([textCell("Distribuicao das solicitacoes por situacao", "HeroSub", 2)], 22)}
        ${row([textCell("", "Spacer", 2)], 8)}
        ${row([textCell("Status", "Header"), textCell("Quantidade", "Header"), textCell("Percentual", "Header")], 28)}
        ${statusRows}
      </Table>
      ${worksheetOptions(true)}
    </Worksheet>`;
}

function buildCarRentalSheet(rows) {
  const fields = [
    "id",
    "nomeCompleto",
    "status",
    "categoriaVeiculo",
    "tipoCambio",
    "numeroPortas",
    "arCondicionado",
    "localRetiradaDevolucao",
    "cnhPdf",
  ];
  const cars = carRentalRows(rows);
  const body = cars
    .map((item, index) =>
      row(fields.map((field) => textCell(displayValue(field, item), index % 2 ? "CellAlt" : "Cell")), 24),
    )
    .join("");

  return `
    <Worksheet ss:Name="Aluguel de carro">
      <Table>
        ${fields.map((field) => column(field === "localRetiradaDevolucao" ? 250 : 150)).join("")}
        ${row(fields.map((field) => textCell(labels[field] || field, "Header")), 30)}
        ${body || row([textCell("Nenhuma solicitacao com aluguel de carro.", "Cell", fields.length - 1)], 26)}
      </Table>
      ${worksheetOptions(true)}
      <AutoFilter x:Range="R1C1:R${Math.max(cars.length + 1, 2)}C${fields.length}" xmlns="urn:schemas-microsoft-com:office:excel" />
    </Worksheet>`;
}

function buildRequestsSheet(rows) {
  const header = row(
    requestFields.map((field) => textCell(labels[field] || field, "Header")),
    32,
  );

  const body = rows
    .map((item, index) =>
      row(
        requestFields.map((field) =>
          textCell(displayValue(field, item), index % 2 ? "CellAlt" : "Cell"),
        ),
        25,
      ),
    )
    .join("");

  return `
    <Worksheet ss:Name="Base completa">
      <Table>
        ${requestFields.map((field) => {
          if (["justificativa", "localRetiradaDevolucao"].includes(field)) return column(280);
          if (["descricaoSolicitacao", "nomeEvento", "banco"].includes(field)) return column(220);
          return column(150);
        }).join("")}
        ${header}
        ${body}
      </Table>
      ${worksheetOptions(true)}
      <AutoFilter x:Range="R1C1:R${rows.length + 1}C${requestFields.length}" xmlns="urn:schemas-microsoft-com:office:excel" />
    </Worksheet>`;
}

function buildSectionsSheet(rows) {
  const outputRows = [];
  rows.forEach((item) => {
    outputRows.push(row([textCell(item.id || "-", "SectionRow", 3)], 26));
    sectionFields.forEach((section) => {
      outputRows.push(row([textCell(section.title, "MiniHeader", 3)], 22));
      section.fields.forEach((field) => {
        outputRows.push(row([
          textCell(labels[field] || field, "SummaryLabel"),
          textCell(displayValue(field, item), "Cell", 2),
        ], 22));
      });
      outputRows.push(row([textCell("", "Spacer", 3)], 6));
    });
  });

  return `
    <Worksheet ss:Name="Detalhado">
      <Table>
        ${column(230)}
        ${column(260)}
        ${column(260)}
        ${column(260)}
        ${outputRows.join("")}
      </Table>
    </Worksheet>`;
}

function buildWorkbook(rows) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook
  xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40">
  <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
    <Author>NUGB / GEREB</Author>
    <Title>Relatorio Administrativo NUGB</Title>
    <Created>${new Date().toISOString()}</Created>
  </DocumentProperties>
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="${THEME.ink}" />
      <Alignment ss:Vertical="Top" ss:WrapText="1" />
    </Style>
    <Style ss:ID="Hero">
      <Font ss:FontName="Segoe UI" ss:Size="18" ss:Bold="1" ss:Color="#FFFFFF" />
      <Interior ss:Color="${THEME.ink}" ss:Pattern="Solid" />
      <Alignment ss:Vertical="Center" />
    </Style>
    <Style ss:ID="HeroSub">
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#E7E7EA" />
      <Interior ss:Color="${THEME.ink}" ss:Pattern="Solid" />
    </Style>
    <Style ss:ID="Spacer" />
    <Style ss:ID="Header">
      <Font ss:FontName="Segoe UI" ss:Size="9" ss:Bold="1" ss:Color="#FFFFFF" />
      <Interior ss:Color="${THEME.ink}" ss:Pattern="Solid" />
      <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1" />
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="${THEME.green}" />
      </Borders>
    </Style>
    <Style ss:ID="MiniHeader">
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF" />
      <Interior ss:Color="${THEME.muted}" ss:Pattern="Solid" />
    </Style>
    <Style ss:ID="SectionRow">
      <Font ss:FontName="Segoe UI" ss:Size="12" ss:Bold="1" ss:Color="#FFFFFF" />
      <Interior ss:Color="${THEME.ink}" ss:Pattern="Solid" />
    </Style>
    <Style ss:ID="SummaryLabel">
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="${THEME.ink}" />
      <Interior ss:Color="${THEME.soft}" ss:Pattern="Solid" />
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${THEME.line}" />
      </Borders>
    </Style>
    <Style ss:ID="SummaryValue">
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="${THEME.green}" />
      <Interior ss:Color="#F2FBF5" ss:Pattern="Solid" />
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${THEME.line}" />
      </Borders>
    </Style>
    <Style ss:ID="Cell">
      <Interior ss:Color="${THEME.paper}" ss:Pattern="Solid" />
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${THEME.line}" />
      </Borders>
      <NumberFormat ss:Format="@" />
    </Style>
    <Style ss:ID="CellAlt">
      <Interior ss:Color="${THEME.soft}" ss:Pattern="Solid" />
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${THEME.line}" />
      </Borders>
      <NumberFormat ss:Format="@" />
    </Style>
    <Style ss:ID="CellStrong">
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="${THEME.ink}" />
      <Interior ss:Color="${THEME.paper}" ss:Pattern="Solid" />
    </Style>
    <Style ss:ID="NumberCell">
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="${THEME.ink}" />
      <Interior ss:Color="#F2FBF5" ss:Pattern="Solid" />
    </Style>
  </Styles>
  ${buildSummarySheet(rows)}
  ${buildStatusSheet(rows)}
  ${buildCarRentalSheet(rows)}
  ${buildRequestsSheet(rows)}
  ${buildSectionsSheet(rows)}
</Workbook>`;
}

export function exportRequestsWorkbook(rows) {
  if (!rows.length) {
    alert("Nao ha dados para exportar.");
    return;
  }

  const workbook = buildWorkbook(rows);
  const blob = new Blob([workbook], {
    type: "application/vnd.ms-excel;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `relatorio_nugb_${new Date().toISOString().slice(0, 10)}.xls`;
  link.click();
  URL.revokeObjectURL(url);
}
