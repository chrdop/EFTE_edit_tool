import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  createSession,
  getSession,
  updateSession,
  getUploadsDir,
  type DeleteRowConfig,
  type ModifyRowConfig,
} from "../../lib/sessionStore.js";
import { analyzeExcelFile, previewChanges, buildMasterExcel, readCurrentValues } from "../../lib/excelProcessor.js";
import {
  GetSessionParams,
  UpdateSessionParams,
  UpdateSessionBody,
  UploadFilesParams,
  ReadCurrentValuesParams,
  ReadCurrentValuesBody,
  PreviewChangesParams,
  ExportSessionParams,
  DownloadSessionParams,
  SendEmailParams,
  SendEmailBody,
} from "@workspace/api-zod";
import { Resend } from "resend";
import { generateReportPdf } from "../../lib/pdfGenerator.js";

const router: IRouter = Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, getUploadsDir());
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const allowed = [".xlsx", ".xls", ".ods"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only .xlsx, .xls, .ods files are allowed"));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024, files: 10 },
});

function serializeSession(session: ReturnType<typeof getSession>) {
  if (!session) return null;
  return {
    id: session.id,
    files: session.files.map((f) => ({
      id: f.id,
      originalName: f.originalName,
      locationName: f.locationName,
      sheetNames: f.sheetNames,
      detectedMonths: f.detectedMonths,
    })),
    selectedMonth: session.selectedMonth,
    deleteRows: session.deleteRows,
    modifyRows: session.modifyRows,
    status: session.status,
  };
}

// POST /sessions
router.post("/sessions", async (_req, res): Promise<void> => {
  const session = createSession();
  res.status(201).json(serializeSession(session));
});

// GET /sessions/:sessionId
router.get("/sessions/:sessionId", async (req, res): Promise<void> => {
  const params = GetSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const session = getSession(params.data.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.json(serializeSession(session));
});

// PATCH /sessions/:sessionId
router.patch("/sessions/:sessionId", async (req, res): Promise<void> => {
  const params = UpdateSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const session = getSession(params.data.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const body = UpdateSessionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const updates: Partial<typeof session> = {};
  if (body.data.selectedMonth !== undefined) updates.selectedMonth = body.data.selectedMonth;
  if (body.data.deleteRows !== undefined) updates.deleteRows = body.data.deleteRows as DeleteRowConfig[];
  if (body.data.modifyRows !== undefined) updates.modifyRows = body.data.modifyRows as ModifyRowConfig[];

  const hasFiles = session.files.length > 0;
  const hasMonth = (updates.selectedMonth ?? session.selectedMonth) !== null;
  if (hasFiles && hasMonth) {
    updates.status = "configured";
  }

  const updated = updateSession(params.data.sessionId, updates);
  res.json(serializeSession(updated));
});

// POST /sessions/:sessionId/upload
router.post(
  "/sessions/:sessionId/upload",
  upload.array("files"),
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
    const params = UploadFilesParams.safeParse({ sessionId: raw });
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const session = getSession(params.data.sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const uploadedFiles = req.files as Express.Multer.File[];
    if (!uploadedFiles || uploadedFiles.length === 0) {
      res.status(400).json({ error: "No files uploaded" });
      return;
    }

    const { v4: uuidv4 } = await import("uuid");
    const newFiles = [...session.files];
    const failedNames: string[] = [];

    for (const file of uploadedFiles) {
      try {
        const analysis = await analyzeExcelFile(file.path);
        newFiles.push({
          id: uuidv4(),
          originalName: file.originalname,
          locationName: analysis.locationName,
          filePath: file.path,
          sheetNames: analysis.sheetNames,
          detectedMonths: analysis.detectedMonths,
        });
      } catch (err) {
        req.log.error({ err, filename: file.originalname }, "Failed to analyze Excel file");
        failedNames.push(file.originalname);
        try { fs.unlinkSync(file.path); } catch {}
      }
    }

    // If every file failed to parse, return a clear error
    if (newFiles.length === session.files.length && failedNames.length > 0) {
      res.status(400).json({
        error: `Die folgenden Dateien konnten nicht gelesen werden: ${failedNames.join(", ")}. Bitte nur .xlsx oder .xls Dateien hochladen.`,
      });
      return;
    }

    const updated = updateSession(params.data.sessionId, {
      files: newFiles,
      status: newFiles.length > 0 ? "uploaded" : "empty",
    });

    res.json(serializeSession(updated));
  },
);

// POST /sessions/:sessionId/read-values
router.post("/sessions/:sessionId/read-values", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
  const params = ReadCurrentValuesParams.safeParse({ sessionId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const session = getSession(params.data.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const body = ReadCurrentValuesBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  if (!session.selectedMonth) {
    res.status(400).json({ error: "No month selected" });
    return;
  }

  const values = await readCurrentValues(
    session.files,
    session.selectedMonth,
    body.data.items,
  );

  res.json({ values });
});

// POST /sessions/:sessionId/preview
router.post("/sessions/:sessionId/preview", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
  const params = PreviewChangesParams.safeParse({ sessionId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const session = getSession(params.data.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (!session.selectedMonth) {
    res.status(400).json({ error: "No month selected" });
    return;
  }

  if (session.files.length === 0) {
    res.status(400).json({ error: "No files uploaded" });
    return;
  }

  const result = await previewChanges(
    session.files,
    session.selectedMonth,
    session.deleteRows,
    session.modifyRows,
  );

  res.json(result);
});

// POST /sessions/:sessionId/export
router.post("/sessions/:sessionId/export", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
  const params = ExportSessionParams.safeParse({ sessionId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const session = getSession(params.data.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (!session.selectedMonth) {
    res.status(400).json({ error: "No month selected" });
    return;
  }

  if (session.files.length === 0) {
    res.status(400).json({ error: "No files uploaded" });
    return;
  }

  const { getUploadsDir } = await import("../../lib/sessionStore.js");
  const outputFilename = `Master_Cluster_Austria_EFTE_${session.selectedMonth}.xlsx`;
  const outputPath = path.join(getUploadsDir(), `${params.data.sessionId}-master.xlsx`);

  await buildMasterExcel(
    session.files,
    session.selectedMonth,
    session.deleteRows,
    session.modifyRows,
    outputPath,
  );

  updateSession(params.data.sessionId, {
    status: "exported",
    exportedFilePath: outputPath,
  });

  const downloadUrl = `/api/sessions/${params.data.sessionId}/download`;
  res.json({ downloadUrl, filename: outputFilename });
});

// GET /sessions/:sessionId/download
router.get("/sessions/:sessionId/download", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
  const params = DownloadSessionParams.safeParse({ sessionId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const session = getSession(params.data.sessionId);
  if (!session || !session.exportedFilePath) {
    res.status(404).json({ error: "Export not found. Please run export first." });
    return;
  }

  if (!fs.existsSync(session.exportedFilePath)) {
    res.status(404).json({ error: "Export file not found on disk" });
    return;
  }

  const filename = `Master_Cluster_Austria_EFTE_${session.selectedMonth ?? "export"}.xlsx`;
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.sendFile(session.exportedFilePath);
});

// POST /sessions/:sessionId/send-email
router.post("/sessions/:sessionId/send-email", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
  const params = SendEmailParams.safeParse({ sessionId: rawId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = SendEmailBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const session = getSession(params.data.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (!session.selectedMonth) {
    res.status(400).json({ error: "No month selected" });
    return;
  }

  if (session.files.length === 0) {
    res.status(400).json({ error: "No files uploaded" });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "E-Mail-Service nicht konfiguriert. Bitte Resend-Integration einrichten." });
    return;
  }

  // Build master Excel if not already done
  const outputPath = path.join(getUploadsDir(), `${params.data.sessionId}-master.xlsx`);
  if (!session.exportedFilePath || !fs.existsSync(outputPath)) {
    await buildMasterExcel(
      session.files,
      session.selectedMonth,
      session.deleteRows,
      session.modifyRows,
      outputPath,
    );
    updateSession(params.data.sessionId, { status: "exported", exportedFilePath: outputPath });
  }

  // Generate preview data for PDF report
  const preview = await previewChanges(
    session.files,
    session.selectedMonth,
    session.deleteRows,
    session.modifyRows,
  );

  // Generate PDF report
  const pdfBuffer = await generateReportPdf(session, preview);
  const excelBuffer = fs.readFileSync(outputPath);

  const excelFilename = `Master_Cluster_Austria_EFTE_${session.selectedMonth}.xlsx`;
  const pdfFilename = `Anpassungsbericht_${session.selectedMonth}.pdf`;

  const fromAddress = process.env.RESEND_FROM_EMAIL ?? "noreply@resend.dev";

  const resend = new Resend(apiKey);
  const emailResult = await resend.emails.send({
    from: fromAddress,
    to: body.data.recipientEmail,
    subject: `Master Cluster Austria EFTE – ${session.selectedMonth}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px;">
        <h2 style="color: #1e3a5f;">EFTE Merge &amp; Edit Tool</h2>
        <p>Im Anhang finden Sie:</p>
        <ul>
          <li><strong>${excelFilename}</strong> – die zusammengeführte Master-Excel-Datei</li>
          <li><strong>${pdfFilename}</strong> – Anpassungsbericht (Zeilen löschen &amp; anpassen)</li>
        </ul>
        <p style="color:#6b7280; font-size:12px;">Monat: ${session.selectedMonth} · Standorte: ${session.files.length}</p>
      </div>
    `,
    attachments: [
      {
        filename: excelFilename,
        content: excelBuffer.toString("base64"),
      },
      {
        filename: pdfFilename,
        content: pdfBuffer.toString("base64"),
      },
    ],
  });

  if (emailResult.error) {
    res.status(500).json({ success: false, message: `E-Mail-Fehler: ${emailResult.error.message}` });
    return;
  }

  res.json({ success: true, message: `E-Mail erfolgreich an ${body.data.recipientEmail} gesendet.` });
});

export default router;
