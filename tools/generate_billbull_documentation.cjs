const fs = require("fs");
const path = require("path");
const ExcelJS = require("../billbull-frontend/node_modules/exceljs");

const repoRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(repoRoot, "..");
const backendRoot = path.join(repoRoot, "billbull-backend");
const frontendRoot = path.join(repoRoot, "billbull-frontend");
const templatePath = path.join(repoRoot, "BillBull ERP Documentation.xlsx");
const outputPath = path.join(repoRoot, "BillBull ERP Documentation.xlsx");

const backendSrc = path.join(backendRoot, "src", "main", "java", "com", "billbull", "backend");
const frontendSrc = path.join(frontendRoot, "src");

const backendModuleNotes = {
  auth: "Login, JWT token issuance, current-user profile, password updates, and user session identity.",
  config: "Framework bootstrapping, JWT helpers, and shared runtime configuration.",
  customer: "Customer inquiries, follow-ups, messaging/templates, and customer-facing workflow support.",
  exception: "Shared REST exception handling and cross-cutting error response shaping.",
  financials: "General ledger, posting engine, taxes, vouchers, payment methods, and finance-centric reports.",
  hr: "Employees, payroll, salary advances, salary payments, and HR operations.",
  inventory: "Products, brands, departments, warehouses/zones/locators/bins, stock, barcodes, reports, stock take, and transfers.",
  purchase: "LPO, GRN, purchase invoice approval, stock movement posting, and landed-cost handling.",
  sales: "Quotation, proforma, sales order, delivery note, sales invoice, customer ledger, payments, and print templates.",
  security: "Security filters and supporting access-control infrastructure.",
  settings: "Branch setup, company profile, and configuration entities used across modules.",
  user: "System user lifecycle, roles, password reset, freeze/unfreeze, and user-safe DTOs.",
  util: "General-purpose helpers shared across business modules.",
};

const coreFlows = [
  {
    flow: "Authentication & Session",
    description:
      "Frontend authenticates through /api/auth/login, stores the JWT, and hydrates company/branch/user context for branch-scoped screens and API calls.",
    backend: "auth/AuthController.java, config/JwtUtil.java, settings/branch/BranchAccessService.java",
    frontend: "api/auth.js, context/BranchContext.jsx, route guards in App.jsx",
  },
  {
    flow: "Sales Lifecycle",
    description:
      "Quotation and Proforma can lead into Sales Order, then Delivery Note, then Sales Invoice. Status propagation, reservation checks, and payment posting happen across these services.",
    backend:
      "sales/quotation/QuotationService.java, sales/proforma/ProformaService.java, sales/salesorder/SalesOrderService.java, sales/delivery/DeliveryNoteService.java, sales/invoice/SalesInvoiceService.java",
    frontend:
      "pages/Sales/Quotations.jsx, ProformaInvoice.jsx, SalesOrders.jsx, DeliveryNote.jsx, SalesInvoice.jsx",
  },
  {
    flow: "Purchase to Stock",
    description:
      "LPO and GRN feed purchase invoices, which update stock movements, weighted-average cost, and warehouse/bin balances. Landed costs and accounting are posted during approval.",
    backend:
      "purchase/lpo/LpoService.java, purchase/grn/GrnService.java, purchase/invoice/PurchaseInvoiceService.java, purchase/stockmovement/StockMovementService.java",
    frontend:
      "pages/Purchase/LPO/lpo.jsx, Purchase/GRN/GRN.jsx, Purchase/Invoice/PurchaseInvoices.jsx",
  },
  {
    flow: "Inventory Control",
    description:
      "Warehouse hierarchy, bin stock, stock availability, stock transfers, and stock-taking sessions all use the stock movement ledger as the source of truth.",
    backend:
      "inventory/warehouse/WarehouseStockService.java, inventory/warehouse/BinStockService.java, inventory/stockavailability/StockAvailabilityService.java, inventory/stocktransfer/StockTransferService.java, inventory/stocktake/StockTakeService.java",
    frontend:
      "pages/Inventory/Warehouse/Warehouse.jsx, Inventory/StockTaking/StockTaking.jsx, shared StockAvailabilityModal.jsx",
  },
  {
    flow: "Financial Posting",
    description:
      "Operational documents generate journal entries via posting services so inventory, payables, COGS, tax, and payment events hit the general ledger consistently.",
    backend:
      "financials/generalledger/postingengine/PostingEngineService.java, sales/delivery/DeliveryNoteService.java, purchase/invoice/PurchaseInvoiceService.java",
    frontend:
      "Financial reporting/voucher screens plus operational payment flows in sales and purchase pages",
  },
];

const architectureNotes = [
  {
    area: "Backend Layering",
    explanation:
      "The backend follows a conventional Spring Boot structure: Controller classes expose REST endpoints, Service classes hold business rules, Repository interfaces manage persistence, and JPA Entity classes define the database model.",
    examples:
      "sales/invoice/SalesInvoiceController.java -> SalesInvoiceService.java -> SalesInvoiceRepository.java -> SalesInvoice.java",
  },
  {
    area: "Security Model",
    explanation:
      "Authentication is JWT-based. Login happens through AuthController, the frontend stores the token, and secured endpoints use Spring Security plus @PreAuthorize and modulePermissionService checks for authorization.",
    examples:
      "auth/AuthController.java, config/JwtUtil.java, security/*, frontend api/axiosConfig.js, auth/PrivateRoute",
  },
  {
    area: "Frontend Design",
    explanation:
      "The React frontend is organized by business domain under src/pages, with reusable API wrappers in src/api, context providers for company/branch/permissions, and guarded routes declared in App.jsx.",
    examples:
      "pages/Sales/*, pages/Purchase/*, pages/Inventory/*, context/BranchContext.jsx, context/PermissionContext.jsx",
  },
  {
    area: "Inventory Architecture",
    explanation:
      "Inventory is warehouse-aware and bin-aware. Warehouse, Zone, Locator, and Bin entities model physical storage, while stock availability, stock transfer, stock take, and reservation services read and update operational stock state.",
    examples:
      "inventory/warehouse/*, inventory/stockavailability/*, inventory/stocktransfer/*, inventory/stocktake/*",
  },
  {
    area: "Document Workflows",
    explanation:
      "Core ERP documents progress through save/confirm/approve/post states depending on module. Sales and purchase documents pass data forward into later documents and can trigger stock movement and financial posting.",
    examples:
      "Quotation -> Proforma -> Sales Order -> Delivery Note -> Sales Invoice; LPO -> GRN -> Purchase Invoice",
  },
  {
    area: "Financial Integration",
    explanation:
      "Operational transactions are linked to accounting through posting services and the general ledger module. Purchase, sales, tax, vouchers, and reconciliation all contribute to financial records and reports.",
    examples:
      "financials/generalledger/*, postingengine/*, purchase/invoice/PurchaseInvoiceService.java, sales/delivery/DeliveryNoteService.java",
  },
];

function walk(dir, predicate = () => true, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, predicate, results);
    } else if (predicate(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function rel(fromRoot, file) {
  return path.relative(repoRoot, file).replace(/\\/g, "/");
}

function titleFromIdentifier(value) {
  return (value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function normalizeRoute(base, sub) {
  const raw = `${base || ""}/${sub || ""}`.replace(/\/+/g, "/");
  if (!raw.startsWith("/")) return `/${raw}`;
  return raw;
}

function extractQuotedValue(input) {
  if (!input) return "";
  const match = input.match(/["'`]([^"'`]+)["'`]/);
  return match ? match[1] : "";
}

function extractPreAuthorize(text) {
  const match = text.match(/@PreAuthorize\("([^"]+)"\)/);
  return match ? match[1] : "";
}

function extractRequestMappingPath(text) {
  const requestMapping = text.match(/@RequestMapping\(([\s\S]*?)\)/);
  return requestMapping ? extractQuotedValue(requestMapping[1]) : "";
}

function parseMethodMappings(annotationText) {
  const mappings = [];
  const directRegex = /@(Get|Post|Put|Delete|Patch)Mapping(?:\(([\s\S]*?)\))?/g;
  let match;
  while ((match = directRegex.exec(annotationText)) !== null) {
    mappings.push({
      method: match[1].toUpperCase(),
      path: extractQuotedValue(match[2] || ""),
    });
  }

  const requestRegex = /@RequestMapping\(([\s\S]*?)\)/g;
  while ((match = requestRegex.exec(annotationText)) !== null) {
    const args = match[1] || "";
    if (!/RequestMethod\./.test(args)) continue;
    const path = extractQuotedValue(args);
    const methods = [...args.matchAll(/RequestMethod\.([A-Z]+)/g)].map((item) => item[1]);
    methods.forEach((method) => mappings.push({ method, path }));
  }

  return mappings;
}

function parseJavaControllers() {
  const controllerFiles = walk(
    backendSrc,
    (file) => file.endsWith("Controller.java")
  );

  const endpoints = [];

  for (const file of controllerFiles) {
    const content = read(file);
    const lines = content.split(/\r?\n/);
    const classIndex = lines.findIndex((line) => /\bclass\b/.test(line) && line.includes("Controller"));
    const beforeClass = classIndex >= 0 ? lines.slice(0, classIndex).join("\n") : content;
    const classBase = extractRequestMappingPath(beforeClass);
    const classSecurity = extractPreAuthorize(beforeClass) || "Security defined by Spring Security config";
    const controllerName = path.basename(file, ".java");
    const relativePath = rel(repoRoot, file);
    const moduleParts = relativePath
      .split("/")
      .slice(7, -1);
    const module = moduleParts.slice(0, 2).join(" / ");

    let annotationBuffer = [];
    for (let i = classIndex + 1; i < lines.length; i += 1) {
      const trim = lines[i].trim();
      if (!trim) continue;

      if (trim.startsWith("@")) {
        annotationBuffer.push(trim);
        continue;
      }

      if (
        annotationBuffer.length &&
        !/^(public|private|protected)\s+/.test(trim) &&
        !trim.startsWith("@") &&
        !trim.startsWith("//")
      ) {
        annotationBuffer.push(trim);
        continue;
      }

      if (/^(public|private|protected)\s+/.test(trim) && trim.includes("(")) {
        let signature = trim;
        while (!signature.includes("{") && i + 1 < lines.length) {
          i += 1;
          signature += ` ${lines[i].trim()}`;
          if (signature.includes("{")) break;
        }

        const methodNameMatch = signature.match(/(\w+)\s*\(/);
        const methodName = methodNameMatch ? methodNameMatch[1] : "unknownMethod";
        const annotationText = annotationBuffer.join(" ");
        const methodSecurity = extractPreAuthorize(annotationText) || classSecurity;
        const mappings = parseMethodMappings(annotationText);

        mappings.forEach((mapping) => {
          endpoints.push({
            module: module || "root",
            controller: controllerName,
            method: mapping.method,
            endpoint: normalizeRoute(classBase, mapping.path),
            description: titleFromIdentifier(methodName),
            security: methodSecurity,
            javaMethod: methodName,
            source: relativePath,
          });
        });

        annotationBuffer = [];
      } else {
        annotationBuffer = [];
      }
    }
  }

  return endpoints.sort((a, b) => {
    if (a.endpoint === b.endpoint) return a.method.localeCompare(b.method);
    return a.endpoint.localeCompare(b.endpoint);
  });
}

function parseEntities() {
  const entityFiles = walk(
    backendSrc,
    (file) => file.endsWith(".java") && read(file).includes("@Entity")
  );

  return entityFiles
    .map((file) => {
      const content = read(file);
      const lines = content.split(/\r?\n/);
      const className = (content.match(/\bclass\s+(\w+)/) || [null, path.basename(file, ".java")])[1];
      const tableName = (content.match(/@Table\s*\(\s*name\s*=\s*"([^"]+)"/) || [null, className])[1];
      const relativePath = rel(repoRoot, file);
      const module = relativePath.split("/").slice(7, 9).join(" / ");

      let pending = [];
      let idField = "";
      let fieldCount = 0;
      const relations = [];

      lines.forEach((line) => {
        const trim = line.trim();
        if (!trim) return;
        if (trim.startsWith("@")) {
          pending.push(trim);
          return;
        }

        const fieldMatch = trim.match(/^private\s+([\w<>\.\?, ]+)\s+(\w+)\s*(=.*)?;/);
        if (!fieldMatch) {
          if (!trim.startsWith("//")) pending = [];
          return;
        }

        const [, type, name] = fieldMatch;
        fieldCount += 1;
        const annotationText = pending.join(" ");

        if (/@Id\b/.test(annotationText)) {
          idField = `${type.trim()} ${name}`;
        }

        const relationMatch = annotationText.match(/@(ManyToOne|OneToMany|OneToOne|ManyToMany)\b/);
        if (relationMatch) {
          relations.push(`${relationMatch[1]} -> ${name}`);
        }

        pending = [];
      });

      return {
        module: module || "root",
        entity: className,
        table: tableName,
        idField: idField || "Not explicitly detected",
        fieldCount,
        relationships: relations.join("; "),
        source: relativePath,
      };
    })
    .sort((a, b) => a.table.localeCompare(b.table));
}

function parseEntityRelationships() {
  const entityFiles = walk(
    backendSrc,
    (file) => file.endsWith(".java") && read(file).includes("@Entity")
  );

  const rows = [];

  entityFiles.forEach((file) => {
    const content = read(file);
    const lines = content.split(/\r?\n/);
    const entity = (content.match(/\bclass\s+(\w+)/) || [null, path.basename(file, ".java")])[1];
    const relativePath = rel(repoRoot, file);
    let pending = [];

    lines.forEach((line) => {
      const trim = line.trim();
      if (!trim) return;

      if (trim.startsWith("@")) {
        pending.push(trim);
        return;
      }

      const fieldMatch = trim.match(/^private\s+([\w<>\.\?, ]+)\s+(\w+)\s*(=.*)?;/);
      if (!fieldMatch) {
        if (!trim.startsWith("//")) pending = [];
        return;
      }

      const [, type, field] = fieldMatch;
      const annotationText = pending.join(" ");
      const relationMatch = annotationText.match(/@(ManyToOne|OneToMany|OneToOne|ManyToMany)\b/);
      if (relationMatch) {
        rows.push({
          entity,
          relationType: relationMatch[1],
          field,
          targetType: type.replace(/[<>]/g, ""),
          joinDetails: (annotationText.match(/@JoinColumn\(([^)]+)\)/) || [null, ""])?.[1] || "",
          source: relativePath,
        });
      }

      pending = [];
    });
  });

  return rows.sort((a, b) =>
    a.entity.localeCompare(b.entity) ||
    a.field.localeCompare(b.field)
  );
}

function parsePropertiesFile() {
  const propertiesPath = path.join(backendRoot, "src", "main", "resources", "application.properties");
  const content = read(propertiesPath);
  const values = {};
  content.split(/\r?\n/).forEach((line) => {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) return;
    const idx = line.indexOf("=");
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    values[key] = value;
  });
  return values;
}

function parsePom() {
  const pom = read(path.join(backendRoot, "pom.xml"));
  const pkg = read(path.join(frontendRoot, "package.json"));
  const packageJson = JSON.parse(pkg);
  return {
    springBootVersion: (pom.match(/<version>([\d.]+)<\/version>/) || [])[1] || "",
    javaVersion: (pom.match(/<java.version>([^<]+)<\/java.version>/) || [])[1] || "",
    backendArtifact: (pom.match(/<artifactId>(billbull-backend)<\/artifactId>/) || [])[1] || "billbull-backend",
    backendVersion: (pom.match(/<version>(0\.0\.1-SNAPSHOT)<\/version>/) || [])[1] || "0.0.1-SNAPSHOT",
    frontendVersion: packageJson.version,
    frontendDependencies: Object.entries(packageJson.dependencies || {}),
  };
}

function summarizeBackendModules(endpoints, entities) {
  const javaFiles = walk(backendSrc, (file) => file.endsWith(".java"));
  const byModule = new Map();

  for (const file of javaFiles) {
    const relativePath = rel(repoRoot, file);
    const packageParts = relativePath.split("/").slice(7);
    const module = packageParts.length > 1 ? packageParts[0] : "root";
    if (!byModule.has(module)) {
      byModule.set(module, {
        module,
        controllers: 0,
        services: 0,
        repositories: 0,
        entities: 0,
        javaFiles: 0,
        packages: new Set(),
      });
    }

    const record = byModule.get(module);
    record.javaFiles += 1;
    const name = path.basename(file);
    if (name.endsWith("Controller.java")) record.controllers += 1;
    if (name.endsWith("Service.java")) record.services += 1;
    if (name.endsWith("Repository.java")) record.repositories += 1;
    if (entities.some((entity) => entity.source === relativePath)) record.entities += 1;
    record.packages.add(packageParts.length > 1 ? packageParts.slice(0, 2).join("/") : "root");
  }

  return [...byModule.values()]
    .map((item) => ({
      module: item.module,
      summary: backendModuleNotes[item.module] || "Business/domain package in the BillBull ERP backend.",
      controllers: item.controllers,
      services: item.services,
      repositories: item.repositories,
      entities: item.entities,
      javaFiles: item.javaFiles,
      endpoints: endpoints.filter((endpoint) => endpoint.module.startsWith(item.module)).length,
      keyPackages: [...item.packages].filter(Boolean).sort().join(", "),
    }))
    .sort((a, b) => a.module.localeCompare(b.module));
}

function parseFrontendApiFunctions() {
  const apiFiles = walk(path.join(frontendSrc, "api"), (file) => file.endsWith(".js"));
  const rows = [];

  apiFiles.forEach((file) => {
    const content = read(file);
    const relativePath = rel(repoRoot, file);
    const exportRegex = /export const (\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*([\s\S]*?)(?=export const|\nexport default|\Z)/g;
    let match;
    while ((match = exportRegex.exec(content)) !== null) {
      const fn = match[1];
      const body = match[2];
      const apiMatch = body.match(/api\.(get|post|put|delete|patch)\(([\s\S]*?)\)/);
      rows.push({
        file: relativePath,
        function: fn,
        httpMethod: apiMatch ? apiMatch[1].toUpperCase() : "",
        endpointSnippet: apiMatch ? apiMatch[2].split(",")[0].trim() : "",
      });
    }
  });

  return rows.sort((a, b) => a.file.localeCompare(b.file) || a.function.localeCompare(b.function));
}

function parseFrontendPages() {
  const files = walk(
    path.join(frontendSrc, "pages"),
    (file) => file.endsWith(".jsx") || file.endsWith(".js")
  );
  return files
    .map((file) => {
      const relativePath = rel(repoRoot, file);
      const parts = relativePath.split("/");
      const section = parts.slice(3, -1).join(" / ");
      return {
        type: "Page",
        section: section || "root",
        name: path.basename(file),
        file: relativePath,
        notes: `UI screen under ${section || "root"} pages`,
      };
    })
    .sort((a, b) => a.file.localeCompare(b.file));
}

function parseFrontendRoutes() {
  const appPath = path.join(frontendSrc, "App.jsx");
  const content = read(appPath);
  const importMap = new Map();

  [...content.matchAll(/import\s+(\w+)\s+from\s+"([^"]+)";/g)].forEach((match) => {
    importMap.set(match[1], match[2]);
  });

  const rows = [];
  const routeRegex = /<Route\s+[\s\S]*?path="([^"]+)"[\s\S]*?element=\{([\s\S]*?)\}\s*\/>/g;
  let match;
  while ((match = routeRegex.exec(content)) !== null) {
    const routePath = match[1];
    const elementBlock = match[2];
    const componentName = [...importMap.keys()].find((name) => new RegExp(`\\b${name}\\b`).test(elementBlock)) || "";
    const guardMatch = elementBlock.match(/module="([^"]+)"/);
    rows.push({
      path: routePath,
      component: componentName || "Wrapper / Inline Element",
      sourceImport: componentName ? importMap.get(componentName) || "" : "",
      permissionModule: guardMatch ? guardMatch[1] : "",
      notes: elementBlock.includes("PrivateRoute")
        ? "Protected route wrapper"
        : elementBlock.includes("Navigate")
          ? "Redirect route"
          : "Application screen route",
    });
  }

  return rows.sort((a, b) => a.path.localeCompare(b.path));
}

function parseFrontendSupportFiles(subdir, type) {
  const dir = path.join(frontendSrc, subdir);
  if (!fs.existsSync(dir)) return [];
  return walk(dir, (file) => file.endsWith(".jsx") || file.endsWith(".js"))
    .map((file) => ({
      type,
      section: subdir,
      name: path.basename(file),
      file: rel(repoRoot, file),
      notes: `${type} used by frontend screens`,
    }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

function countExtensions() {
  const allFiles = walk(repoRoot, (file) => !file.includes(`${path.sep}.git${path.sep}`));
  const counts = {};
  allFiles.forEach((file) => {
    if (file.includes(`${path.sep}node_modules${path.sep}`) || file.includes(`${path.sep}target${path.sep}`) || file.includes(`${path.sep}dist${path.sep}`)) {
      return;
    }
    const ext = path.extname(file) || "[no extension]";
    counts[ext] = (counts[ext] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([ext, count]) => ({ ext, count }));
}

function applyHeaderStyle(row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "1F4E78" },
  };
  row.border = {
    top: { style: "thin", color: { argb: "D9E2F2" } },
    left: { style: "thin", color: { argb: "D9E2F2" } },
    bottom: { style: "thin", color: { argb: "D9E2F2" } },
    right: { style: "thin", color: { argb: "D9E2F2" } },
  };
}

function styleDataSheet(worksheet, wrapColumns = []) {
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  applyHeaderStyle(worksheet.getRow(1));
  worksheet.autoFilter = {
    from: "A1",
    to: `${worksheet.getRow(1).cellCount > 0 ? worksheet.getRow(1).getCell(worksheet.getRow(1).cellCount).address.replace(/\d+/g, "") : "A"}1`,
  };

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.alignment = { vertical: "top" };
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "EDEDED" } },
        left: { style: "thin", color: { argb: "EDEDED" } },
        bottom: { style: "thin", color: { argb: "EDEDED" } },
        right: { style: "thin", color: { argb: "EDEDED" } },
      };
    });
    wrapColumns.forEach((columnKey) => {
      row.getCell(columnKey).alignment = { wrapText: true, vertical: "top" };
    });
  });
}

function createTableSheet(workbook, name, columns, rows, wrapColumns = []) {
  const ws = workbook.addWorksheet(name);
  ws.columns = columns;
  rows.forEach((row) => ws.addRow(row));
  styleDataSheet(ws, wrapColumns);
  return ws;
}

function writeSummarySheet(workbook, stats, endpoints, properties, pomInfo, entities, backendModules) {
  const ws = workbook.worksheets[0];
  ws.getCell("B5").value = "BillBull ERP";
  ws.getCell("B6").value =
    "Full-stack ERP platform spanning Sales, Purchase, Inventory, Financials, HR, Customer workflows, and Settings.";
  ws.getCell("B7").value = "BillBull ERP REST API";
  ws.getCell("B8").value = `${pomInfo.backendVersion} / Frontend ${pomInfo.frontendVersion}`;
  ws.getCell("B9").value = "Generated from repository source by Codex";
  ws.getCell("B10").value = new Date().toISOString().slice(0, 10);

  ws.getCell("B14").value =
    "Provide ERP APIs for sales, purchase, inventory, warehouse/bin control, finance, HR, auth, and configuration.";
  ws.getCell("B15").value = "React 19 + Vite frontend consuming Spring Boot 3 REST APIs over Axios.";
  ws.getCell("B16").value =
    "Primary downstream system is PostgreSQL. Uploads are stored on the application server filesystem.";
  ws.getCell("B17").value =
    "Used daily for order processing, warehouse operations, accounting, payroll, reporting, and admin workflows.";
  ws.getCell("B18").value =
    'JWT-based authentication through /api/auth/login with Spring Security and @PreAuthorize guards on protected endpoints.';
  ws.getCell("B19").value = "No explicit rate-limiting implementation detected in the backend code.";

  for (let row = 22; row <= 455; row += 1) {
    for (let col = 1; col <= 6; col += 1) {
      ws.getRow(row).getCell(col).value = null;
    }
  }

  ws.getCell("A21").value = "3. Endpoints";
  ws.getCell("A22").value = "Module";
  ws.getCell("B22").value = "Method";
  ws.getCell("C22").value = "Endpoint URL";
  ws.getCell("D22").value = "Controller.Action";
  ws.getCell("E22").value = "Security";
  ws.getCell("F22").value = "Status";

  const previewEndpoints = endpoints.slice(0, 420);
  let rowIndex = 23;
  previewEndpoints.forEach((endpoint) => {
    ws.getCell(`A${rowIndex}`).value = endpoint.module;
    ws.getCell(`B${rowIndex}`).value = endpoint.method;
    ws.getCell(`C${rowIndex}`).value = endpoint.endpoint;
    ws.getCell(`D${rowIndex}`).value = `${endpoint.controller}.${endpoint.javaMethod}`;
    ws.getCell(`E${rowIndex}`).value = endpoint.security;
    ws.getCell(`F${rowIndex}`).value = "Active";
    rowIndex += 1;
  });

  const noteRow = rowIndex + 2;
  ws.getCell(`A${noteRow}`).value = "Documentation Notes";
  ws.getCell(`A${noteRow + 1}`).value =
    `Full endpoint inventory (${endpoints.length} endpoints), ${entities.length} entities, ${backendModules.length} backend modules, and frontend/database details are available in the additional workbook sheets.`;
  ws.getCell(`A${noteRow + 2}`).value =
    `Database: PostgreSQL (${properties["spring.datasource.url"] || "Not found"}), server port ${properties["server.port"] || "8080"}, JPA ddl-auto=${properties["spring.jpa.hibernate.ddl-auto"] || "unknown"}.`;
  ws.mergeCells(`A${noteRow + 1}:F${noteRow + 1}`);
  ws.mergeCells(`A${noteRow + 2}:F${noteRow + 2}`);
}

async function main() {
  const endpoints = parseJavaControllers();
  const entities = parseEntities();
  const entityRelationships = parseEntityRelationships();
  const properties = parsePropertiesFile();
  const pomInfo = parsePom();
  const backendModules = summarizeBackendModules(endpoints, entities);
  const frontendApiFunctions = parseFrontendApiFunctions();
  const frontendRoutes = parseFrontendRoutes();
  const frontendSurface = [
    ...parseFrontendPages(),
    ...parseFrontendSupportFiles("api", "API Client"),
    ...parseFrontendSupportFiles("context", "Context"),
    ...parseFrontendSupportFiles("hooks", "Hook"),
  ];

  const fileTypeCounts = countExtensions();

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);
  
  // Remove all worksheets except the first one (API Task Sheet)
  const sheetsToRemove = [];
  workbook.eachSheet((sheet, id) => {
    if (sheet.name !== "API Task Sheet") {
      sheetsToRemove.push(id);
    }
  });
  sheetsToRemove.forEach(id => workbook.removeWorksheet(id));
  writeSummarySheet(
    workbook,
    {
      endpointCount: endpoints.length,
      entityCount: entities.length,
    },
    endpoints,
    properties,
    pomInfo,
    entities,
    backendModules
  );

  createTableSheet(
    workbook,
    "API Inventory",
    [
      { header: "Module", key: "module", width: 24 },
      { header: "Controller", key: "controller", width: 28 },
      { header: "HTTP Method", key: "method", width: 14 },
      { header: "Endpoint", key: "endpoint", width: 46 },
      { header: "Description", key: "description", width: 30 },
      { header: "Security", key: "security", width: 36 },
      { header: "Java Method", key: "javaMethod", width: 24 },
      { header: "Source File", key: "source", width: 52 },
    ],
    endpoints,
    ["E", "F", "H"]
  );

  const dbSheet = workbook.addWorksheet("Database Model");
  dbSheet.columns = [
    { header: "Area", key: "area", width: 20 },
    { header: "Key", key: "key", width: 28 },
    { header: "Value", key: "value", width: 70 },
  ];
  [
    ["Database Configuration", "Database Engine", "PostgreSQL"],
    ["Database Configuration", "Datasource URL", properties["spring.datasource.url"] || "Not found"],
    ["Database Configuration", "Datasource Username", properties["spring.datasource.username"] || "Not found"],
    ["Database Configuration", "Datasource Password", "Configured in application.properties (not repeated here in plain text)"],
    ["Database Configuration", "Driver", properties["spring.datasource.driver-class-name"] || "Not found"],
    ["Database Configuration", "JPA DDL Mode", properties["spring.jpa.hibernate.ddl-auto"] || "Not found"],
    ["Database Configuration", "Show SQL", properties["spring.jpa.show-sql"] || "Not found"],
    ["Database Configuration", "Open Session in View", properties["spring.jpa.open-in-view"] || "Not found"],
    ["Database Configuration", "Hibernate Batch Fetch Size", properties["spring.jpa.properties.hibernate.default_batch_fetch_size"] || "Not found"],
    ["Database Configuration", "Entity Count", String(entities.length)],
  ].forEach((row) => dbSheet.addRow({ area: row[0], key: row[1], value: row[2] }));
  dbSheet.addRow({});
  const headerRow = dbSheet.addRow({
    area: "Module",
    key: "Entity / Table",
    value: "Primary Key / Relationships / Source",
  });
  applyHeaderStyle(headerRow);
  entities.forEach((entity) => {
    dbSheet.addRow({
      area: entity.module,
      key: `${entity.entity} (${entity.table})`,
      value: `ID: ${entity.idField}; Fields: ${entity.fieldCount}; Relations: ${entity.relationships || "None detected"}; File: ${entity.source}`,
    });
  });
  dbSheet.views = [{ state: "frozen", ySplit: 1 }];
  dbSheet.getColumn("C").alignment = { wrapText: true, vertical: "top" };

  createTableSheet(
    workbook,
    "DB Relationships",
    [
      { header: "Entity", key: "entity", width: 24 },
      { header: "Relation Type", key: "relationType", width: 18 },
      { header: "Field", key: "field", width: 24 },
      { header: "Target Type", key: "targetType", width: 24 },
      { header: "Join Details", key: "joinDetails", width: 34 },
      { header: "Source File", key: "source", width: 56 },
    ],
    entityRelationships,
    ["E", "F"]
  );

  createTableSheet(
    workbook,
    "Backend Structure",
    [
      { header: "Module", key: "module", width: 18 },
      { header: "Summary", key: "summary", width: 56 },
      { header: "Controllers", key: "controllers", width: 12 },
      { header: "Services", key: "services", width: 12 },
      { header: "Repositories", key: "repositories", width: 14 },
      { header: "Entities", key: "entities", width: 10 },
      { header: "Java Files", key: "javaFiles", width: 10 },
      { header: "Endpoints", key: "endpoints", width: 10 },
      { header: "Key Packages", key: "keyPackages", width: 38 },
    ],
    backendModules,
    ["B", "I"]
  );

  createTableSheet(
    workbook,
    "Frontend Structure",
    [
      { header: "Type", key: "type", width: 14 },
      { header: "Section", key: "section", width: 24 },
      { header: "Name", key: "name", width: 28 },
      { header: "File", key: "file", width: 56 },
      { header: "Notes", key: "notes", width: 42 },
    ],
    frontendSurface,
    ["D", "E"]
  );

  createTableSheet(
    workbook,
    "Frontend Routes",
    [
      { header: "Path", key: "path", width: 28 },
      { header: "Component", key: "component", width: 24 },
      { header: "Import Source", key: "sourceImport", width: 44 },
      { header: "Permission Module", key: "permissionModule", width: 24 },
      { header: "Notes", key: "notes", width: 32 },
    ],
    frontendRoutes,
    ["C", "E"]
  );

  createTableSheet(
    workbook,
    "Frontend API Clients",
    [
      { header: "File", key: "file", width: 42 },
      { header: "Exported Function", key: "function", width: 28 },
      { header: "HTTP Method", key: "httpMethod", width: 14 },
      { header: "Endpoint Snippet", key: "endpointSnippet", width: 52 },
    ],
    frontendApiFunctions,
    ["A", "D"]
  );

  createTableSheet(
    workbook,
    "Tech Stack",
    [
      { header: "Area", key: "area", width: 22 },
      { header: "Technology / Setting", key: "tech", width: 34 },
      { header: "Version / Value", key: "value", width: 34 },
      { header: "Notes", key: "notes", width: 60 },
    ],
    [
      { area: "Backend", tech: "Language", value: "Java", notes: "Primary backend implementation language." },
      { area: "Backend", tech: "Java Version", value: pomInfo.javaVersion, notes: "Configured in Maven pom.xml." },
      { area: "Backend", tech: "Framework", value: `Spring Boot ${pomInfo.springBootVersion}`, notes: "REST API, dependency injection, validation, security, and data access." },
      { area: "Backend", tech: "Build Tool", value: "Maven", notes: "pom.xml with Spring Boot plugin." },
      { area: "Backend", tech: "Persistence", value: "Spring Data JPA / Hibernate", notes: "Entity-driven PostgreSQL persistence." },
      { area: "Backend", tech: "Database", value: "PostgreSQL", notes: properties["spring.datasource.url"] || "" },
      { area: "Backend", tech: "Authentication", value: "JWT + Spring Security", notes: `Secret configured, expiration ${properties["jwt.expiration"] || ""} ms.` },
      { area: "Backend", tech: "Port", value: properties["server.port"] || "8080", notes: "Default HTTP port from application.properties." },
      { area: "Frontend", tech: "Language", value: "JavaScript / JSX", notes: "React component code under src/." },
      { area: "Frontend", tech: "Framework", value: "React 19", notes: "UI rendering with component/page architecture." },
      { area: "Frontend", tech: "Bundler", value: "Vite 7", notes: "Development and production builds." },
      { area: "Frontend", tech: "Styling", value: "Tailwind CSS 4", notes: "Utility-first styling in React pages/components." },
      { area: "Frontend", tech: "HTTP Client", value: "Axios", notes: "Centralized API clients in src/api." },
      { area: "Frontend", tech: "Routing", value: "react-router-dom 7", notes: "Page routing and navigation." },
      { area: "Frontend", tech: "Spreadsheet Generation", value: "ExcelJS", notes: "Already present in frontend dependencies and reused for this workbook." },
      { area: "Project", tech: "Primary File Types", value: fileTypeCounts.slice(0, 8).map((item) => `${item.ext}:${item.count}`).join(", "), notes: "Top file extensions excluding node_modules/target/dist." },
    ],
    ["D"]
  );

  createTableSheet(
    workbook,
    "Core Flows",
    [
      { header: "Flow", key: "flow", width: 24 },
      { header: "Description", key: "description", width: 74 },
      { header: "Backend Files", key: "backend", width: 64 },
      { header: "Frontend Files", key: "frontend", width: 58 },
    ],
    coreFlows,
    ["B", "C", "D"]
  );

  createTableSheet(
    workbook,
    "Architecture Notes",
    [
      { header: "Area", key: "area", width: 24 },
      { header: "Explanation", key: "explanation", width: 76 },
      { header: "Examples / Key Files", key: "examples", width: 74 },
    ],
    architectureNotes,
    ["B", "C"]
  );

  createTableSheet(
    workbook,
    "Project Stats",
    [
      { header: "Category", key: "category", width: 28 },
      { header: "Metric", key: "metric", width: 32 },
      { header: "Value", key: "value", width: 20 },
      { header: "Notes", key: "notes", width: 62 },
    ],
    [
      { category: "Backend", metric: "Java Source Files", value: walk(backendSrc, (file) => file.endsWith(".java")).length, notes: "All backend Java files under src/main/java/com/billbull/backend." },
      { category: "Backend", metric: "Controllers", value: endpoints.map((item) => item.controller).filter((value, index, arr) => arr.indexOf(value) === index).length, notes: "Distinct controller classes exposing REST endpoints." },
      { category: "Backend", metric: "REST Endpoints", value: endpoints.length, notes: "Detected from Spring mapping annotations." },
      { category: "Backend", metric: "JPA Entities", value: entities.length, notes: "Classes annotated with @Entity." },
      { category: "Backend", metric: "Entity Relationships", value: entityRelationships.length, notes: "Detected relation fields using JPA relation annotations." },
      { category: "Frontend", metric: "Page Files", value: parseFrontendPages().length, notes: "Files under src/pages." },
      { category: "Frontend", metric: "API Client Files", value: walk(path.join(frontendSrc, "api"), (file) => file.endsWith(".js")).length, notes: "Dedicated frontend API wrappers." },
      { category: "Frontend", metric: "API Client Exports", value: frontendApiFunctions.length, notes: "Exported API helper functions detected in src/api." },
      { category: "Frontend", metric: "Application Routes", value: frontendRoutes.length, notes: "Detected Route definitions from App.jsx." },
      { category: "Project", metric: "Primary Database", value: "PostgreSQL", notes: properties["spring.datasource.url"] || "" },
      { category: "Project", metric: "Authentication", value: "JWT", notes: "JWT token issued from /api/auth/login and enforced with Spring Security." },
      { category: "Project", metric: "Frontend Build", value: "Vite", notes: `Frontend package version ${pomInfo.frontendVersion}.` },
    ],
    ["D"]
  );

  await workbook.xlsx.writeFile(outputPath);
  console.log(`Generated ${outputPath}`);
  console.log(`Endpoints: ${endpoints.length}`);
  console.log(`Entities: ${entities.length}`);
  console.log(`Relationships: ${entityRelationships.length}`);
  console.log(`Frontend routes: ${frontendRoutes.length}`);
  console.log(`Frontend API functions: ${frontendApiFunctions.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
